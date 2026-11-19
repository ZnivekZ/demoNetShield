"""Typed read-only queries. Only this module translates user filters to OpenSearch."""
from datetime import datetime, timedelta, timezone
from ipaddress import ip_address
from typing import Literal
from zoneinfo import ZoneInfo
import json
import re

from pydantic import BaseModel, ConfigDict, Field, field_validator

from services.wazuh_indexer import ALERTS_INDEX, VULNS_INDEX, get_indexer_client

ART = ZoneInfo("America/Argentina/Buenos_Aires")
INDEX = {"archives": "wazuh-archives-*", "alerts": ALERTS_INDEX,
         "packages": "wazuh-states-inventory-packages-*", "cves": VULNS_INDEX}
FIELDS = {
    "archives": ["timestamp", "agent.id", "agent.name", "data.srcip", "location", "data.http_host",
                 "data.http_method", "data.url", "data.http_status", "data.upstream_status"],
    "alerts": ["agent.id", "agent.name", "data.srcip", "rule.id", "rule.level", "rule.description", "location"],
    "packages": ["agent.id", "agent.name", "package.name", "package.version"],
    "cves": ["agent.id", "agent.name", "package.name", "package.version", "vulnerability.id",
             "vulnerability.severity", "vulnerability.detected_at", "vulnerability.status"],
}
DIMENSIONS = {"ip": "data.srcip", "agent": "agent.id", "host": "data.http_host",
              "status": "data.http_status", "rule": "rule.id", "package": "package.name"}


class Arguments(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Search(Arguments):
    source: Literal["archives", "alerts", "packages", "cves"]
    group: Literal["documents", "ip", "agent", "host", "status", "rule", "package", "hour", "day", "proxy_host"] = "documents"
    period: Literal["ayer", "hoy", "24h", "7d"] = "24h"
    start: datetime | None = None
    end: datetime | None = None
    ips: list[str] = Field(default_factory=list, max_length=20)
    status: str | None = Field(None, pattern=r"^[1-5](?:[0-9]{2}|xx)$|^errors$")
    upstream: bool = False
    rule: str | None = Field(None, pattern=r"^\d{1,10}$")
    cve: str | None = Field(None, pattern=r"^CVE-\d{4}-\d{4,}$")
    package: str | None = Field(None, pattern=r"^[\w.+:-]{1,80}$")
    host: str | None = Field(None, max_length=200)
    location: str | None = Field(None, max_length=200)
    path: str | None = Field(None, pattern=r"^/[^?#\s]*$", max_length=240)
    phrase: str | None = Field(None, max_length=160)
    limit: int = Field(10, ge=1, le=50)

    @field_validator("ips")
    @classmethod
    def valid_ips(cls, ips):
        return [str(ip_address(ip)) for ip in ips]


def bounds(s: Search, anchor: datetime):
    local = anchor.astimezone(ART)
    midnight = local.replace(hour=0, minute=0, second=0, microsecond=0)
    if s.start or s.end:
        if not (s.start and s.end and s.start.tzinfo and s.end.tzinfo):
            raise ValueError("El intervalo requiere inicio y fin con zona horaria")
        start, end = s.start, s.end
    elif s.period == "ayer":
        start, end = midnight - timedelta(days=1), midnight
    elif s.period == "hoy":
        start, end = midnight, local
    else:
        start, end = local - timedelta(days=7 if s.period == "7d" else 1), local
    if not timedelta(0) < end - start <= timedelta(days=31):
        raise ValueError("Usá un período mayor a cero y de hasta 31 días")
    return {"gte": start.astimezone(timezone.utc).isoformat(), "lt": end.astimezone(timezone.utc).isoformat()}


def compile_search(s: Search, agents: list[str], anchor: datetime, alert_time="timestamp"):
    if not agents:
        raise ValueError("Seleccioná al menos un agente")
    fields = list(FIELDS[s.source])
    timefield = "timestamp" if s.source == "archives" else alert_time
    filters = [{"terms": {"agent.id": agents}}]
    if s.source in ("archives", "alerts"):
        fields = list(dict.fromkeys([timefield, *fields]))
        filters.append({"range": {timefield: bounds(s, anchor)}})
    elif s.start or s.end or s.period != "24h":
        raise ValueError("Paquetes y CVE representan el inventario actual")
    if s.source == "archives":
        filters.extend([{"term": {"decoder.name": "npm-proxy-access"}},
                        {"wildcard": {"location": "/data/logs/proxy-host-*_access.log"}}])
    if s.source == "cves":
        filters.append({"bool": {"should": [{"term": {"vulnerability.status": "Active"}},
                                            {"term": {"vulnerability.status": "active"}},
                                            {"bool": {"must_not": {"exists": {"field": "vulnerability.status"}}}}],
                                 "minimum_should_match": 1}})
    def add(field, clause):
        if field not in fields:
            raise ValueError(f"El campo {field} no corresponde a {s.source}")
        filters.append(clause)
    for field, value in [("rule.id", s.rule), ("vulnerability.id", s.cve),
                         ("data.http_host", s.host), ("location", s.location)]:
        if value:
            add(field, {"term": {field: value}})
    if s.path:
        add("data.url", {"bool": {"should": [{"term": {"data.url": s.path}},
                                             {"prefix": {"data.url": s.path + "?"}}], "minimum_should_match": 1}})
    if s.package:
        add("package.name", {"wildcard": {"package.name": f"*{s.package}*"}})
    if s.ips:
        add("data.srcip", {"terms": {"data.srcip": s.ips}})
    if s.status:
        field = "data.upstream_status" if s.upstream else "data.http_status"
        if s.status == "errors":
            add(field, {"bool": {"should": [{"prefix": {field: n}} for n in ("4", "5")], "minimum_should_match": 1}})
        elif s.status.endswith("xx"):
            add(field, {"prefix": {field: s.status[0]}})
        else:
            add(field, {"term": {field: s.status}})
    if s.phrase:
        if s.source == "alerts":
            filters.append({"multi_match": {"query": s.phrase, "type": "phrase", "fields": ["rule.description", "full_log"]}})
        elif s.source == "archives":
            filters.append({"match_phrase": {"full_log": s.phrase}})
        else:
            raise ValueError("La búsqueda textual requiere Archives o Alerts")
    body = {"size": s.limit if s.group == "documents" else 3, "_source": fields,
            "track_total_hits": True, "query": {"bool": {"filter": filters}}}
    if s.source == "cves":
        body["aggs"] = {"affected_agents": {"terms": {"field": "agent.id", "size": len(agents)}}}
    if s.source in ("archives", "alerts"):
        body["sort"] = [{timefield: "desc"}]
    if s.group in ("hour", "day"):
        if s.source not in ("archives", "alerts"):
            raise ValueError("El histograma requiere eventos")
        agg = {"date_histogram": {"field": timefield, "calendar_interval": s.group, "time_zone": str(ART)}}
    elif s.group == "proxy_host" and s.source == "archives":
        agg = {"multi_terms": {"terms": [{"field": "agent.id"}, {"field": "location"}], "size": s.limit}}
    elif s.group == "status" and s.upstream and s.source == "archives":
        agg = {"terms": {"field": "data.upstream_status", "size": s.limit}}
    elif s.group == "documents":
        return INDEX[s.source], body
    else:
        field = DIMENSIONS.get(s.group)
        if field not in fields:
            raise ValueError("Agrupación no disponible en esta fuente")
        agg = {"terms": {"field": field, "size": s.limit}}
    body.setdefault("aggs", {})["groups"] = agg
    return INDEX[s.source], body


SECRET_KEY = re.compile(r"(?i)^(?:password|passwd|token|access_token|refresh_token|api[_-]?key|authorization|cookie|set-cookie)$")
SECRET = re.compile(r"(?i)(?:authorization\s*[:=]\s*)?(?:bearer|basic)\s+[\w.+/=-]+|\b(?:gsk_|sk-)[\w-]+|(?:password|passwd|token|api[_-]?key|authorization|cookie)\s*[:=]\s*[^\s&,;]+")
QUERY_STRING = re.compile(r"""((?:https?://|/)[^\s?#"'<>]*)\?[^\s"'<>]*""")


def clean(value):
    if isinstance(value, str):
        if value.startswith(("{", "[")):
            try:
                decoded = json.loads(value)
            except ValueError:
                pass
            else:
                return json.dumps(clean(decoded), ensure_ascii=False, separators=(",", ":"))
        return SECRET.sub("[oculto]", QUERY_STRING.sub(r"\1?[oculto]", value))
    if isinstance(value, list):
        return [clean(item) for item in value]
    if isinstance(value, dict):
        return {key: "[oculto]" if SECRET_KEY.fullmatch(key) else clean(item) for key, item in value.items()}
    return value


async def index_search(index, body):
    client = get_indexer_client()
    if not client.is_configured():
        raise ValueError("Wazuh Indexer sin configurar")
    async with client._get_request_lock():
        response = await client._get_client().post(f"/{index}/_search",
            params={"allow_no_indices": "false", "allow_partial_search_results": "false"}, json=body)
        response.raise_for_status()
        raw = response.json()
    if raw.get("timed_out") or raw.get("_shards", {}).get("failed") or raw.get("_shards", {}).get("total") == 0 or "hits" not in raw:
        raise ValueError("Wazuh devolvió una búsqueda incompleta")
    return raw


def flatten(obj, prefix=""):
    out = {}
    for key, value in obj.items():
        name = prefix + key
        if isinstance(value, dict):
            out.update(flatten(value, name + "."))
        elif isinstance(value, (str, int, float)):
            out[name] = clean(value)[:500] if isinstance(value, str) else value
    return out


def result(s, raw):
    hits = raw["hits"]
    total = hits["total"]
    examples = [dict(flatten(h["_source"]), _id=h.get("_id"), _index=h.get("_index")) for h in hits["hits"]]
    groups = raw.get("aggregations", {}).get("groups", {})
    rows = examples if s.group == "documents" else [
        {s.group: b.get("key_as_string", b["key"]) if s.group in ("hour", "day") else b["key"],
         "cantidad": b["doc_count"]} for b in groups["buckets"]]
    affected = raw.get("aggregations", {}).get("affected_agents")
    return {"source": s.source, "group": s.group,
            "affected_agents": len(affected["buckets"]) if affected is not None else None, "total_documents": total["value"] if isinstance(total, dict) else total,
            "rows": rows, "evidence": examples, "other_documents": groups.get("sum_other_doc_count"),
            "count_error_bound": groups.get("doc_count_error_upper_bound")}
