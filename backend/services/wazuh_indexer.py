"""
Wazuh Indexer Client — OpenSearch 7.10 backend for Wazuh 4.x.

Why this exists:
- Wazuh Server API (port 55000) does NOT expose /alerts or /vulnerabilities endpoints.
- Real alerts (security events) live in the Wazuh Indexer (port 9200, OpenSearch).
- Vulnerability scan results live in wazuh-states-vulnerabilities-* indices.

Design:
- Uses httpx (async) — same as WazuhService.
- SSL verification configurable (default off for lab / self-signed certs).
- All responses normalized to consistent dict shapes compatible with WazuhService.
- Falls back gracefully (returns empty list / empty dict) when Indexer is unreachable.

Index patterns:
- wazuh-alerts-4.x-*           → real security alerts (rule.level, agent.*, mitre.*)
- wazuh-states-vulnerabilities-* → CVE findings from vulnerability-detector
- wazuh-statistics-*           → manager stats (daily)
"""
from __future__ import annotations

import asyncio
import json
import time
from datetime import datetime, timezone, timedelta
from typing import Any

import httpx
import structlog

from config import get_settings
from services.resilience import make_resilience, safe_call

logger = structlog.get_logger(__name__)


class WazuhIndexerClient:
    """Async client for Wazuh Indexer (OpenSearch 7.10) at port 9200."""

    _instance: WazuhIndexerClient | None = None

    def __new__(cls) -> WazuhIndexerClient:
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def __init__(self) -> None:
        if self._initialized:
            return
        self._initialized = True
        self._settings = get_settings()
        self._client: httpx.AsyncClient | None = None
        # Resilience: register a circuit breaker with the global registry
        # so the /api/health/services endpoint can show its state. The
        # custom inline breaker state (closed/open/half-open) is replaced
        # by the shared `CircuitBreaker` from services.resilience.
        self._breaker, self._executor = make_resilience(
            name="wazuh_indexer",
            failure_threshold=3,
            cooldown_seconds=30.0,
            max_workers=1,  # httpx.AsyncClient — pool reserved for symmetry
        )
        # Global lock to serialize Indexer HTTP calls.
        # Avoids the "ConnectTimeout on first attempt, then works" pattern
        # that happens when too many concurrent connect_tcp() calls share
        # the same httpx connection pool on a busy network path.
        self._request_lock: asyncio.Lock | None = None

    # ── Client lifecycle ────────────────────────────────────────

    def _get_client(self) -> httpx.AsyncClient:
        # Always recreate the client if its pool is exhausted/closed.
        # This prevents stale-connection issues under concurrent polling.
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                base_url=self._settings.wazuh_indexer_url,
                verify=self._settings.wazuh_indexer_verify_ssl,
                timeout=httpx.Timeout(15.0, connect=5.0),
                auth=(self._settings.wazuh_indexer_user, self._settings.wazuh_indexer_password),
                # max_connections=1 forces serial requests, which avoids
                # the ConnectTimeout that happens on Windows when multiple
                # concurrent connect_tcp() calls share the same pool.
                limits=httpx.Limits(max_connections=1, max_keepalive_connections=1, keepalive_expiry=30),
            )
        return self._client

    async def close(self) -> None:
        if self._client and not self._client.is_closed:
            await self._client.aclose()
            self._client = None

    async def _reset_client(self) -> None:
        """Discard the current client so the next _get_client creates a fresh one.
        Use this after a transport-level failure to avoid reusing broken connections."""
        if self._client:
            try:
                if not self._client.is_closed:
                    await self._client.aclose()
            except Exception:
                pass
            self._client = None



    def _get_request_lock(self) -> asyncio.Lock:
        """Lazily create the global request lock. Must be called from a running loop."""
        if self._request_lock is None:
            self._request_lock = asyncio.Lock()
        return self._request_lock

    def is_configured(self) -> bool:
        """True if Indexer URL is set and non-empty."""
        return bool(self._settings.wazuh_indexer_url)

    # ── Low-level search ───────────────────────────────────────

    async def _search(
        self,
        index_pattern: str,
        query: dict[str, Any],
        size: int = 50,
        sort: list[dict] | None = None,
        timeout_s: float = 8.0,
    ) -> list[dict[str, Any]]:
        """
        Run a search against the given index pattern.
        Returns the list of hits (`_source` fields). Empty list on failure.

        Resilient to event-loop-lag-induced ConnectTimeout: retries the POST
        up to 3 times, resetting the client each time. A blocked event loop
        (sync I/O or CPU-bound work in another coroutine) makes httpx fire a
        spurious ConnectTimeout('') even when the network is perfectly fine;
        retrying once the loop frees up almost always succeeds.
        """
        # Circuit breaker: skip calls when the Indexer is known to be failing
        if self._breaker.is_open():
            logger.debug("wazuh_indexer_circuit_open_skip", index=index_pattern)
            return []
        if not self.is_configured():
            logger.warning("wazuh_indexer_not_configured")
            return []
        body: dict[str, Any] = {
            "size": size,
            "query": query,
            "track_total_hits": True,
        }
        if sort:
            body["sort"] = sort
        payload = json.dumps(body)
        url = f"/{index_pattern}/_search"

        for attempt in range(3):
            client = self._get_client()
            try:
                resp = await asyncio.wait_for(
                    client.post(
                        url,
                        headers={"Content-Type": "application/json"},
                        content=payload,
                    ),
                    timeout=timeout_s,
                )
                resp.raise_for_status()
                data = resp.json()
                self._breaker.record_success()
                return [hit["_source"] for hit in data.get("hits", {}).get("hits", [])]
            except httpx.ConnectTimeout as e:
                # Spurious timeout from event-loop lag — reset client and retry
                await self._reset_client()
                if attempt < 2:
                    await asyncio.sleep(0.25 * (attempt + 1))
                    continue
                logger.warning(
                    "wazuh_indexer_connect_timeout_exhausted",
                    index=index_pattern,
                    attempts=attempt + 1,
                    error=repr(e),
                    hint="event loop likely blocked; check event_loop_blocked warnings",
                )
                self._breaker.record_failure()
                return []
            except asyncio.TimeoutError:
                logger.warning(
                    "wazuh_indexer_search_timeout",
                    index=index_pattern,
                    timeout_s=timeout_s,
                    url=str(client.base_url) + url,
                )
                await self._reset_client()
                self._breaker.record_failure()
                return []
            except (httpx.ConnectError, httpx.RemoteProtocolError, httpx.ReadError) as e:
                logger.warning(
                    "wazuh_indexer_search_transport_error",
                    index=index_pattern,
                    error=repr(e),
                    error_type=type(e).__name__,
                )
                await self._reset_client()
                self._breaker.record_failure()
                return []
            except httpx.HTTPStatusError as e:
                logger.error(
                    "wazuh_indexer_search_http_error",
                    index=index_pattern,
                    status=e.response.status_code,
                    detail=e.response.text[:300],
                    url=str(e.request.url),
                )
                return []
            except Exception as e:
                logger.error(
                    "wazuh_indexer_search_failed",
                    index=index_pattern,
                    error=repr(e),
                    error_type=type(e).__name__,
                    error_str=str(e),
                    exc_info=True,
                )
                self._breaker.record_failure()
                return []
        return []


    # ── Alerts ─────────────────────────────────────────────────

    async def get_node_stats(self) -> dict[str, Any]:
        """
        Resource usage of the Wazuh Indexer node (deployment-agnostic: reports
        whatever the node's OS exposes, be it bare metal, VM, container or LXC).

        GET /_nodes/stats/os,process,jvm,fs:
          - os.cpu / os.mem  → host CPU and memory
          - process.cpu      → CPU of the Indexer JVM alone
          - jvm.mem          → heap
          - fs.data          → disk of the data path (used = total - free)
        """
        if self._breaker.is_open() or not self.is_configured():
            return {}
        client = self._get_client()
        try:
            resp = await asyncio.wait_for(
                client.get("/_nodes/stats/os,process,jvm,fs"), timeout=8.0
            )
            resp.raise_for_status()
            nodes = resp.json().get("nodes", {})
            if not nodes:
                return {}
            node = next(iter(nodes.values()))
            os_mem = (node.get("os") or {}).get("mem") or {}
            jvm = node.get("jvm") or {}
            fs = node.get("fs") or {}
            disk = (fs.get("data") or [None])[0] or fs.get("total") or {}
            total = disk.get("total_in_bytes")
            free = disk.get("free_in_bytes")
            used = (total - free) if total is not None and free is not None else None
            return {
                "node_name": node.get("name", ""),
                "cpu_percent": ((node.get("process") or {}).get("cpu") or {}).get("percent"),
                "host_cpu_percent": ((node.get("os") or {}).get("cpu") or {}).get("percent"),
                "ram_used_percent": os_mem.get("used_percent"),
                "ram_used_bytes": os_mem.get("used_in_bytes"),
                "ram_total_bytes": os_mem.get("total_in_bytes"),
                "heap_used_percent": (jvm.get("mem") or {}).get("heap_used_percent"),
                "uptime_ms": jvm.get("uptime_in_millis"),
                "disk_total_bytes": total,
                "disk_used_bytes": used,
                "disk_free_bytes": free,
                "disk_used_percent": round(used * 100 / total, 1) if used is not None and total else None,
                "disk_mount": disk.get("mount") or disk.get("path") or "",
            }
        except Exception as e:
            logger.warning("wazuh_indexer_node_stats_failed", error=str(e))
            return {}

    async def get_vulnerabilities_by_agent(self, limit: int = 30) -> list[dict[str, Any]]:
        """
        Aggregate CVE findings per agent (ordered by total, desc).
        Returns [{agent_name, total, critical, high, medium, low, unknown}].
        """
        if self._breaker.is_open() or not self.is_configured():
            return []
        body = {
            "size": 0,
            "aggs": {
                "by_agent": {
                    "terms": {"field": "agent.name", "size": limit, "order": {"_count": "desc"}},
                    "aggs": {
                        "severity": {"terms": {"field": "vulnerability.severity", "size": 8}}
                    },
                }
            },
        }
        client = self._get_client()
        try:
            resp = await asyncio.wait_for(
                client.post(
                    "/wazuh-states-vulnerabilities-*/_search",
                    headers={"Content-Type": "application/json"},
                    content=json.dumps(body),
                ),
                timeout=12.0,
            )
            resp.raise_for_status()
            buckets = (
                resp.json().get("aggregations", {}).get("by_agent", {}).get("buckets", [])
            )
            out = []
            for b in buckets:
                sev = {str(x.get("key", "")).lower(): x.get("doc_count", 0)
                       for x in b.get("severity", {}).get("buckets", [])}
                out.append({
                    "agent_name": b.get("key", ""),
                    "total": b.get("doc_count", 0),
                    "critical": sev.get("critical", 0),
                    "high": sev.get("high", 0),
                    "medium": sev.get("medium", 0),
                    "low": sev.get("low", 0),
                    "unknown": sev.get("-", 0) + sev.get("", 0),
                })
            return out
        except Exception as e:
            logger.warning("wazuh_indexer_vulns_by_agent_failed", error=str(e))
            return []

    async def get_alerts(
        self,
        limit: int = 50,
        level_min: int | None = None,
        agent_id: str | None = None,
        time_from: str | None = None,
    ) -> list[dict[str, Any]]:
        """
        Get recent security alerts from wazuh-alerts-4.x-* indices.

        Args:
            limit: max alerts to return (1-500).
            level_min: filter by rule.level >= level_min (1-15).
            agent_id: filter by agent.id (e.g. "001").
            time_from: ISO 8601 timestamp (e.g. "now-24h", "2026-07-15T00:00:00Z").
                       Default: last 7 days to keep queries bounded.

        Returns: list of normalized alerts with fields:
            - id, timestamp, agent.id, agent.name, agent.ip
            - rule.level, rule.id, rule.description, rule.mitre (list of refs)
            - data.* (varies by rule), full_log, location
        """
        if not self.is_configured():
            return []

        must_clauses: list[dict[str, Any]] = []
        if level_min is not None:
            must_clauses.append({"range": {"rule.level": {"gte": level_min}}})
        if agent_id is not None:
            must_clauses.append({"term": {"agent.id": agent_id}})
        if time_from is None:
            time_from = "now-7d"
        must_clauses.append({"range": {"@timestamp": {"gte": time_from}}})

        query: dict[str, Any] = {"bool": {"must": must_clauses}}
        hits = await self._search(
            "wazuh-alerts-4.x-*",
            query=query,
            size=min(limit, 500),
            sort=[{"@timestamp": {"order": "desc"}}],
        )
        return [self._normalize_alert(h) for h in hits]

    async def get_critical_alerts(self, limit: int = 20) -> list[dict[str, Any]]:
        """Get alerts with rule.level >= 12 (critical severity in Wazuh)."""
        return await self.get_alerts(limit=limit, level_min=12)

    async def get_agent_alert_summary(self, agent_id: str, time_from: str,
                                      time_to: str) -> dict[str, Any]:
        """Count all matching alerts, with bounded rule details for diagnosis."""
        if not self.is_configured() or self._breaker.is_open():
            raise RuntimeError("Wazuh Indexer no disponible para resumir alertas")
        query = {
            "size": 0,
            "track_total_hits": True,
            "query": {"bool": {"filter": [
                {"term": {"agent.id": agent_id}},
                {"range": {"@timestamp": {"gte": time_from, "lte": time_to}}},
            ]}},
            "aggs": {
                "max_level": {"max": {"field": "rule.level"}},
                "highest_alerts": {"top_hits": {"size": 3,
                    "sort": [{"rule.level": {"order": "desc"}}, {"@timestamp": {"order": "desc"}}],
                    "_source": ["@timestamp", "rule.id", "rule.level", "rule.description", "data.srcip", "data.src_ip"]}},
                "top_rules": {"terms": {"field": "rule.id", "size": 12,
                                        "order": {"_count": "desc"}},
                              "aggs": {
                                  "level": {"max": {"field": "rule.level"}},
                                  "latest": {"max": {"field": "@timestamp", "format": "strict_date_optional_time"}},
                                  "sample": {"top_hits": {"size": 1, "_source": [
                                      "rule.description", "data.srcip", "data.src_ip"]}},
                              }},
            },
        }
        async with self._get_request_lock():
            try:
                response = await asyncio.wait_for(
                    self._get_client().post("/wazuh-alerts-4.x-*/_search", json=query),
                    timeout=30.0,
                )
                response.raise_for_status()
                data = response.json()
                if data.get("timed_out") or (data.get("_shards") or {}).get("failed", 0):
                    raise RuntimeError("Wazuh Indexer devolvió agregación parcial")
                aggs = data.get("aggregations") or {}
                total = data.get("hits", {}).get("total", {})
                count = int(total.get("value", 0) if isinstance(total, dict) else total or 0)
                top_rules = []
                for bucket in (aggs.get("top_rules") or {}).get("buckets", []):
                    sample = ((bucket.get("sample") or {}).get("hits") or {}).get("hits") or []
                    raw = (sample[0].get("_source") or {}) if sample else {}
                    sample_data = raw.get("data") or {}
                    observed_ip = sample_data.get("srcip") or sample_data.get("src_ip")
                    top_rules.append({
                        "rule_id": str(bucket.get("key", "")),
                        "description": str((raw.get("rule") or {}).get("description") or "")[:180],
                        "level": int((bucket.get("level") or {}).get("value") or 0),
                        "count": int(bucket.get("doc_count") or 0),
                        "latest": (bucket.get("latest") or {}).get("value_as_string") or "",
                        "source_ips": [observed_ip] if observed_ip else [],
                    })
                highlights = []
                for hit in ((aggs.get("highest_alerts") or {}).get("hits") or {}).get("hits", []):
                    raw = hit.get("_source") or {}
                    rule = raw.get("rule") or {}
                    source = raw.get("data") or {}
                    highlights.append({
                        "rule_id": str(rule.get("id") or ""),
                        "description": str(rule.get("description") or "")[:180],
                        "level": int(rule.get("level") or 0),
                        "timestamp": raw.get("@timestamp") or "",
                        "source_ip": source.get("srcip") or source.get("src_ip") or None,
                    })
                self._breaker.record_success()
                return {"observed_count": count, "truncated": False,
                        "max_level": int((aggs.get("max_level") or {}).get("value") or 0),
                        "top_rules": top_rules, "highlights": highlights}
            except Exception:
                self._breaker.record_failure()
                raise

    async def get_alerts_timeline(
        self, level_min: int | None = None, hours: int = 24
    ) -> list[dict[str, Any]]:
        """
        Aggregate alerts into hourly buckets for the timeline chart.
        Returns: [{"hour": "2026-07-15T14:00:00Z", "count": 5}, ...]
        """
        if not self.is_configured():
            return []

        client = self._get_client()
        must_clauses: list[dict[str, Any]] = [
            {"range": {"@timestamp": {"gte": f"now-{hours}h"}}}
        ]
        if level_min is not None:
            must_clauses.append({"range": {"rule.level": {"gte": level_min}}})
        query: dict[str, Any] = {"bool": {"must": must_clauses}}

        body = {
            "size": 0,
            "query": query,
            "aggs": {
                "by_hour": {
                    "date_histogram": {
                        "field": "@timestamp",
                        "fixed_interval": "1h",
                        "min_doc_count": 0,
                    }
                }
            },
        }

        try:
            resp = await asyncio.wait_for(
                client.post(
                    "/wazuh-alerts-4.x-*/_search",
                    headers={"Content-Type": "application/json"},
                    content=json.dumps(body),
                ),
                timeout=8.0,
            )
            resp.raise_for_status()
            data = resp.json()
            buckets = data.get("aggregations", {}).get("by_hour", {}).get("buckets", [])
            return [
                {"hour": b.get("key_as_string", ""), "count": b.get("doc_count", 0)}
                for b in buckets
            ]
        except Exception as e:
            logger.warning("wazuh_indexer_timeline_failed", error=str(e))
            return []

    async def get_mitre_report_data(self, time_from: str, time_to: str) -> dict[str, Any]:
        """Aggregate every agent/ATT&CK technique pair in a fixed window.

        Composite pagination avoids the top-N truncation of the dashboard matrix.
        Counts per technique are alert/technique associations: one alert may map
        to several techniques and must not be added to get the alert total.
        """
        if not self.is_configured() or self._breaker.is_open():
            raise RuntimeError("Wazuh Indexer no disponible para el informe MITRE")

        after: dict[str, str] | None = None
        pairs: list[dict[str, Any]] = []
        total_alerts = mapped_alerts = attributed_alerts = 0
        async with self._get_request_lock():
            try:
                for _page in range(100):
                    composite: dict[str, Any] = {
                        "size": 500,
                        "sources": [
                            {"agent_id": {"terms": {"field": "agent.id"}}},
                            {"technique_id": {"terms": {"field": "rule.mitre.id"}}},
                        ],
                    }
                    if after:
                        composite["after"] = after
                    body = {
                        "size": 0, "track_total_hits": True,
                        "query": {"range": {"@timestamp": {"gte": time_from, "lt": time_to}}},
                        "aggs": {
                            "mapped": {"filter": {"exists": {"field": "rule.mitre.id"}}},
                            "attributed": {
                                "filter": {"bool": {"filter": [
                                    {"exists": {"field": "rule.mitre.id"}},
                                    {"exists": {"field": "agent.id"}},
                                ]}},
                                "aggs": {"pairs": {"composite": composite, "aggs": {
                                    "first": {"min": {"field": "@timestamp", "format": "strict_date_optional_time"}},
                                    "last": {"max": {"field": "@timestamp", "format": "strict_date_optional_time"}},
                                    "max_level": {"max": {"field": "rule.level"}},
                                    "sample": {"top_hits": {"size": 1,
                                        "sort": [{"rule.level": {"order": "desc"}},
                                                 {"@timestamp": {"order": "desc"}}],
                                        "_source": ["agent.name", "rule.id", "rule.description",
                                                    "rule.level", "rule.mitre", "@timestamp",
                                                    "data.srcip", "data.src_ip"]}},
                                }}},
                            },
                        },
                    }
                    response = await asyncio.wait_for(
                        self._get_client().post("/wazuh-alerts-4.x-*/_search", json=body),
                        timeout=45.0,
                    )
                    response.raise_for_status()
                    data = response.json()
                    if data.get("timed_out") or (data.get("_shards") or {}).get("failed", 0):
                        raise RuntimeError("Wazuh Indexer devolvió una agregación MITRE parcial")
                    total = data.get("hits", {}).get("total", {})
                    total_alerts = int(total.get("value", 0) if isinstance(total, dict) else total or 0)
                    aggs = data.get("aggregations") or {}
                    mapped_alerts = int((aggs.get("mapped") or {}).get("doc_count") or 0)
                    named = aggs.get("attributed") or {}
                    attributed_alerts = int(named.get("doc_count") or 0)
                    page = (named.get("pairs") or {})
                    buckets = page.get("buckets") or []
                    for bucket in buckets:
                        key = bucket.get("key") or {}
                        hits = ((bucket.get("sample") or {}).get("hits") or {}).get("hits") or []
                        sample_hit = hits[0] if hits else {}
                        raw = sample_hit.get("_source") or {}
                        rule = raw.get("rule") or {}
                        mitre = rule.get("mitre") or {}
                        ids = mitre.get("id") or []
                        names = mitre.get("technique") or []
                        tactics = mitre.get("tactic") or []
                        if isinstance(ids, str): ids = [ids]
                        if isinstance(names, str): names = [names]
                        if isinstance(tactics, str): tactics = [tactics]
                        technique_id = str(key.get("technique_id") or "")
                        index = ids.index(technique_id) if technique_id in ids else -1
                        technique_name = (names[index] if index >= 0 and len(names) == len(ids)
                                          else names[0] if len(names) == 1 else technique_id)
                        # Wazuh stores these as arrays. Attribute a tactic to
                        # one technique only when their positions align, or
                        # when the alert has a single tactic for every ID.
                        matched_tactics = ([tactics[index]] if index >= 0 and len(tactics) == len(ids)
                                           else tactics if len(tactics) == 1 else [])
                        source = raw.get("data") or {}
                        pairs.append({
                            "agent_id": str(key.get("agent_id") or ""),
                            "agent_name": str((raw.get("agent") or {}).get("name") or key.get("agent_id") or ""),
                            "technique_id": technique_id,
                            "technique_name": str(technique_name)[:120],
                            "tactics": [str(t)[:100] for t in matched_tactics],
                            "count": int(bucket.get("doc_count") or 0),
                            "max_level": int((bucket.get("max_level") or {}).get("value") or 0),
                            "first": (bucket.get("first") or {}).get("value_as_string"),
                            "last": (bucket.get("last") or {}).get("value_as_string"),
                            "sample": {"event_id": str(sample_hit.get("_id") or ""),
                                       "rule_id": str(rule.get("id") or ""),
                                       "description": str(rule.get("description") or "")[:180],
                                       "timestamp": raw.get("@timestamp"),
                                       "source_ip": source.get("srcip") or source.get("src_ip")},
                        })
                    if not buckets:
                        break
                    after = page.get("after_key")
                    if not after:
                        break
                else:
                    raise RuntimeError("Demasiadas combinaciones agente/técnica para completar el informe")
                self._breaker.record_success()
                return {"period_start": time_from, "period_end": time_to,
                        "total_alerts": total_alerts, "mapped_alerts": mapped_alerts,
                        "attributed_alerts": attributed_alerts, "pairs": pairs}
            except Exception:
                self._breaker.record_failure()
                raise

    async def get_mitre_summary(self) -> list[dict[str, Any]]:
        """
        Aggregate alerts by MITRE tactic/technique to populate the MITRE matrix.

        The actual alert mapping is rule.mitre.tactic / rule.mitre.technique /
        rule.mitre.id as arrays of keyword STRINGS (tactic names, technique
        names, technique ids like T1548.003). Returns rows shaped for the
        dashboard: [{tactic, technique_id, technique_name, count}].
        """
        if not self.is_configured():
            return []

        client = self._get_client()
        body = {
            "size": 0,
            "query": {
                "bool": {
                    "must": [
                        {"range": {"@timestamp": {"gte": "now-7d"}}},
                        {"exists": {"field": "rule.mitre.technique"}},
                    ]
                }
            },
            "aggs": {
                "by_technique": {
                    "terms": {"field": "rule.mitre.id", "size": 200},
                    "aggs": {
                        "technique_name": {
                            "terms": {"field": "rule.mitre.technique", "size": 1}
                        },
                        "tactic": {
                            "terms": {"field": "rule.mitre.tactic", "size": 5}
                        },
                    },
                }
            },
        }

        try:
            resp = await asyncio.wait_for(
                client.post(
                    "/wazuh-alerts-4.x-*/_search",
                    headers={"Content-Type": "application/json"},
                    content=json.dumps(body),
                ),
                timeout=8.0,
            )
            resp.raise_for_status()
            data = resp.json()
            buckets = (
                data.get("aggregations", {}).get("by_technique", {}).get("buckets", [])
            )
            out: list[dict[str, Any]] = []
            for b in buckets:
                t_name = (
                    b.get("technique_name", {}).get("buckets", [{}])[0].get("key", "")
                )
                tactic_buckets = b.get("tactic", {}).get("buckets", [])
                tactic = tactic_buckets[0].get("key", "") if tactic_buckets else ""
                out.append({
                    "tactic": tactic,
                    "technique_id": b.get("key", ""),
                    "technique_name": t_name or b.get("key", ""),
                    "count": b.get("doc_count", 0),
                })
            out.sort(key=lambda x: x["count"], reverse=True)
            return out
        except Exception as e:
            logger.warning("wazuh_indexer_mitre_failed", error=str(e))
            return []

    async def get_stats_summary(self) -> dict[str, Any]:
        """
        Aggregate dashboard hero numbers: total alerts 24h, by severity, total agents.
        Returns: {
            "total_alerts_24h": int,
            "by_level": {"critical": int, "high": int, "medium": int, "low": int},
            "active_agents": int,
        }
        """
        if not self.is_configured():
            return {
                "total_alerts_24h": 0,
                "by_level": {"critical": 0, "high": 0, "medium": 0, "low": 0},
                "active_agents": 0,
            }

        client = self._get_client()
        body = {
            "size": 0,
            "query": {"range": {"@timestamp": {"gte": "now-24h"}}},
            "aggs": {
                "by_level": {
                    "range": {
                        "field": "rule.level",
                        "ranges": [
                            {"key": "critical", "to": 16.0, "from": 12.0},
                            {"key": "high", "to": 12.0, "from": 8.0},
                            {"key": "medium", "to": 8.0, "from": 5.0},
                            {"key": "low", "to": 5.0, "from": 1.0},
                        ],
                    }
                },
                "distinct_agents": {
                    "cardinality": {"field": "agent.id"}
                },
            },
        }

        try:
            resp = await asyncio.wait_for(
                client.post(
                    "/wazuh-alerts-4.x-*/_search",
                    headers={"Content-Type": "application/json"},
                    content=json.dumps(body),
                ),
                timeout=8.0,
            )
            resp.raise_for_status()
            data = resp.json()
            aggs = data.get("aggregations", {})
            by_level_raw = {
                b.get("key", ""): b.get("doc_count", 0)
                for b in aggs.get("by_level", {}).get("buckets", [])
            }
            return {
                "total_alerts_24h": data.get("hits", {}).get("total", {}).get("value", 0),
                "by_level": {
                    "critical": by_level_raw.get("critical", 0),
                    "high": by_level_raw.get("high", 0),
                    "medium": by_level_raw.get("medium", 0),
                    "low": by_level_raw.get("low", 0),
                },
                "active_agents": aggs.get("distinct_agents", {}).get("value", 0),
            }
        except Exception as e:
            logger.warning("wazuh_indexer_stats_failed", error=str(e))
            return {
                "total_alerts_24h": 0,
                "by_level": {"critical": 0, "high": 0, "medium": 0, "low": 0},
                "active_agents": 0,
            }

    # ── Vulnerabilities ────────────────────────────────────────

    async def get_current_vulnerability_findings(self) -> list[dict[str, Any]]:
        """Read current vulnerability inventory, excluding explicit non-active states.

        Wazuh inventory documents commonly omit vulnerability.status; that field
        is present on vulnerability events. Presence in this state index is the
        current finding when status is absent. Scroll avoids the 500-result cap.
        Failures raise so the digest never describes an incomplete scan as clean.
        """
        if not self.is_configured() or self._breaker.is_open():
            raise RuntimeError("Wazuh Indexer no disponible para verificar CISA KEV")

        findings: list[dict[str, Any]] = []
        scroll_id: str | None = None
        async with self._get_request_lock():
            client = self._get_client()
            try:
                response = await asyncio.wait_for(
                    client.post(
                        "/wazuh-states-vulnerabilities-*/_search",
                        params={"scroll": "1m"},
                        json={
                            "size": 500,
                            "sort": ["_doc"],
                            "query": {"match_all": {}},
                            "_source": ["vulnerability", "agent", "package"],
                        },
                    ),
                    timeout=30.0,
                )
                response.raise_for_status()
                data = response.json()

                while True:
                    if data.get("timed_out") or (data.get("_shards") or {}).get("failed", 0):
                        raise RuntimeError("Wazuh Indexer devolvió resultados parciales")
                    scroll_id = data.get("_scroll_id") or scroll_id
                    hits = data.get("hits", {}).get("hits", [])
                    if not hits:
                        break
                    for hit in hits:
                        raw = hit.get("_source", {})
                        status = str((raw.get("vulnerability") or {}).get("status") or "").strip().lower()
                        if status not in ("", "active"):
                            continue
                        findings.append(self._normalize_vuln(raw))
                    if not scroll_id:
                        raise RuntimeError("Wazuh Indexer no devolvió cursor para completar la consulta")
                    response = await asyncio.wait_for(
                        client.post(
                            "/_search/scroll",
                            json={"scroll": "1m", "scroll_id": scroll_id},
                        ),
                        timeout=30.0,
                    )
                    response.raise_for_status()
                    data = response.json()

                self._breaker.record_success()
                return findings
            except Exception:
                self._breaker.record_failure()
                raise
            finally:
                if scroll_id:
                    try:
                        await asyncio.wait_for(
                            client.request(
                                "DELETE", "/_search/scroll",
                                json={"scroll_id": [scroll_id]},
                            ),
                            timeout=5.0,
                        )
                    except Exception:
                        pass

    async def get_vulnerabilities(
        self, limit: int = 100, agent_id: str | None = None
    ) -> list[dict[str, Any]]:
        """
        Get CVE findings from vulnerability-detector.
        Index: wazuh-states-vulnerabilities-*
        Returns: [{cve, title, severity, score, package, agent_name, agent_id, reference}, ...]
        """
        if not self.is_configured():
            return []

        must: list[dict[str, Any]] = []
        if agent_id is not None:
            must.append({"term": {"agent.id": agent_id}})
        query: dict[str, Any] = {"bool": {"must": must}} if must else {"match_all": {}}

        # Try sorting by score, but the field may not be mapped in all installations.
        # Fall back to no sort if the mapping is missing.
        hits = await self._search(
            "wazuh-states-vulnerabilities-*",
            query=query,
            size=min(limit, 500),
            sort=None,  # let OpenSearch use _score relevance
        )
        if not hits:
            # Retry without any sort
            hits = await self._search(
                "wazuh-states-vulnerabilities-*",
                query=query,
                size=min(limit, 500),
                sort=None,
            )
        return [self._normalize_vuln(h) for h in hits]

    # ── Normalization helpers ──────────────────────────────────

    @staticmethod
    def _normalize_alert(raw: dict[str, Any]) -> dict[str, Any]:
        """Normalize an OpenSearch _source to the dashboard's expected shape."""
        rule = raw.get("rule", {}) or {}
        agent = raw.get("agent", {}) or {}
        mitre = rule.get("mitre", {}) or {}
        data = raw.get("data", {}) or {}

        # A missing source IP must never be replaced by the monitored agent's IP.
        src_ip = data.get("srcip") or data.get("src_ip") or raw.get("src_ip") or ""

        return {
            "id": raw.get("id", ""),
            "timestamp": raw.get("@timestamp") or raw.get("timestamp", ""),
            "agent": {
                "id": agent.get("id", ""),
                "name": agent.get("name", ""),
                "ip": agent.get("ip", ""),
            },
            "rule": {
                "id": str(rule.get("id", "")),
                "level": rule.get("level", 0),
                "description": rule.get("description", ""),
                "groups": rule.get("groups", []),
                "mitre": {
                    "id": mitre.get("id", []),
                    "tactic": mitre.get("tactic", []),
                    "technique": mitre.get("technique", []),
                },
            },
            "location": raw.get("location", ""),
            "src_ip": src_ip,
            "decoder": raw.get("decoder", {}).get("name", "") if isinstance(raw.get("decoder"), dict) else "",
            "full_log": raw.get("full_log", "")[:500],  # truncate for UI
        }

    @staticmethod
    def _normalize_vuln(raw: dict[str, Any]) -> dict[str, Any]:
        """Normalize a wazuh-states-vulnerabilities doc to the dashboard shape.

        Shape consumed by the frontend (WazuhVulnerability): cve_id, title,
        description, severity, cvss_score, package_name, package_version,
        package_arch, agent_id, agent_name, agent_ip, detected_at, references.
        """
        v = raw.get("vulnerability", {}) or {}
        a = raw.get("agent", {}) or {}
        package = raw.get("package", {}) or {}
        host = raw.get("host", {}) or {}

        # Score can be a number (CVSS v2) or a dict (CVSS v3 with subscores)
        raw_score = v.get("score", 0) or 0
        if isinstance(raw_score, dict):
            score_val = float(
                raw_score.get("base")
                or raw_score.get("environmental")
                or raw_score.get("temporal")
                or 0
            )
        else:
            score_val = float(raw_score)

        # Normalize severity to lowercase for the UI's color mapping
        severity = str(v.get("severity", "low") or "low").lower()

        return {
            "cve_id": v.get("id", ""),
            "title": (v.get("description") or "")[:200],
            "description": v.get("description", ""),
            "severity": severity,
            "severity_reported": str(v.get("severity") or "").lower() or None,
            "cvss_score": score_val,
            "status": str(v.get("status") or "").lower(),
            "published_at": v.get("published_at", ""),
            "scanner_condition": (v.get("scanner") or {}).get("condition", "") if isinstance(v.get("scanner"), dict) else "",
            "package_name": package.get("name", ""),
            "package_version": package.get("version", ""),
            "package_arch": package.get("architecture", ""),
            "agent_id": a.get("id", ""),
            "agent_name": a.get("name", ""),
            "agent_ip": a.get("ip", ""),
            "detected_at": v.get("detected_at", ""),
            "reference": (v.get("reference", "") or "")[:300],
            "references": [v.get("reference", "")] if v.get("reference") else [],
        }


# ── Singleton accessor ───────────────────────────────────────────────

def get_indexer_client() -> WazuhIndexerClient:
    """Get the global WazuhIndexerClient singleton."""
    return WazuhIndexerClient()


# ── Daily Digest — additional methods ────────────────────────────────────────
# Added outside the class body and attached via assignment to keep the
# original class definition untouched.

async def _get_alerts_for_period(
    self: WazuhIndexerClient,
    time_from: str,
    time_to: str,
    level_min: int | None = None,
    agent_id: str | None = None,
    limit: int = 500,
) -> list[dict[str, Any]]:
    """
    Get alerts within a specific time window [time_from, time_to].
    Used by DigestService to compare today's vs yesterday's windows.

    Args:
        time_from: ISO 8601 or OpenSearch relative (e.g. "now-48h")
        time_to:   ISO 8601 or OpenSearch relative (e.g. "now-24h")
    """
    must: list[dict[str, Any]] = [
        {"range": {"@timestamp": {"gte": time_from, "lte": time_to}}}
    ]
    if level_min is not None:
        must.append({"range": {"rule.level": {"gte": level_min}}})
    if agent_id is not None:
        must.append({"term": {"agent.id": agent_id}})

    hits = await self._search(
        "wazuh-alerts-4.x-*",
        query={"bool": {"must": must}},
        size=min(limit, 500),
        sort=[{"@timestamp": {"order": "desc"}}],
    )
    return [self._normalize_alert(h) for h in hits]


async def _get_vulnerabilities_for_period(
    self: WazuhIndexerClient,
    time_from: str,
    time_to: str,
    agent_id: str | None = None,
    limit: int = 500,
) -> list[dict[str, Any]]:
    """
    Get CVE findings detected within a specific time window.
    Uses 'vulnerability.detected_at' field in wazuh-states-vulnerabilities-*.
    """
    must: list[dict[str, Any]] = [
        {"range": {"vulnerability.detected_at": {"gte": time_from, "lte": time_to}}}
    ]
    if agent_id is not None:
        must.append({"term": {"agent.id": agent_id}})

    hits = await self._search(
        "wazuh-states-vulnerabilities-*",
        query={"bool": {"must": must}},
        size=min(limit, 500),
        sort=None,
    )
    return [self._normalize_vuln(h) for h in hits]


async def _get_transient_incidents(
    self: WazuhIndexerClient,
    time_from: str,
    time_to: str,
) -> list[dict[str, Any]]:
    """
    Detect transient agent incidents (disconnect/reconnect) within a time window.

    Wazuh fires:
      rule.id 504  → "Agent disconnected" (level 7)
      rule.id 505  → "Agent started / connected" (level 3)

    Returns each disconnect event paired with its closest subsequent reconnect
    within the window (or marked as unrecovered if none found).
    """
    must: list[dict[str, Any]] = [
        {"range": {"@timestamp": {"gte": time_from, "lte": time_to}}},
        {"terms": {"rule.id": ["504", "505"]}},
    ]
    hits = await self._search(
        "wazuh-alerts-4.x-*",
        query={"bool": {"must": must}},
        size=500,
        sort=[{"@timestamp": {"order": "asc"}}],
    )

    from collections import defaultdict
    from datetime import datetime

    events_by_agent: dict[str, list[dict]] = defaultdict(list)
    for h in hits:
        agent = h.get("agent", {}) or {}
        rule  = h.get("rule", {}) or {}
        events_by_agent[agent.get("id", "")].append({
            "agent_name": agent.get("name", ""),
            "rule_id":    str(rule.get("id", "")),
            "timestamp":  h.get("@timestamp") or h.get("timestamp", ""),
        })

    incidents: list[dict[str, Any]] = []
    for agent_id, evts in events_by_agent.items():
        pending_disconnect: dict | None = None
        for evt in evts:
            if evt["rule_id"] == "504":
                pending_disconnect = evt
            elif evt["rule_id"] == "505" and pending_disconnect:
                duration: int | None = None
                try:
                    t_dis = datetime.fromisoformat(
                        pending_disconnect["timestamp"].replace("Z", "+00:00")
                    )
                    t_con = datetime.fromisoformat(
                        evt["timestamp"].replace("Z", "+00:00")
                    )
                    duration = int((t_con - t_dis).total_seconds())
                except (ValueError, TypeError):
                    pass
                incidents.append({
                    "agent_id":         agent_id,
                    "agent_name":       evt["agent_name"],
                    "event_type":       "disconnect_reconnect",
                    "disconnected_at":  pending_disconnect["timestamp"],
                    "reconnected_at":   evt["timestamp"],
                    "duration_seconds": duration,
                })
                pending_disconnect = None

        if pending_disconnect:
            incidents.append({
                "agent_id":         agent_id,
                "agent_name":       pending_disconnect["agent_name"],
                "event_type":       "disconnect_no_recovery",
                "disconnected_at":  pending_disconnect["timestamp"],
                "reconnected_at":   None,
                "duration_seconds": None,
            })

    return incidents


# Attach new methods to the singleton class
WazuhIndexerClient.get_alerts_for_period          = _get_alerts_for_period          # type: ignore[attr-defined]
WazuhIndexerClient.get_vulnerabilities_for_period = _get_vulnerabilities_for_period # type: ignore[attr-defined]
WazuhIndexerClient.get_transient_incidents        = _get_transient_incidents         # type: ignore[attr-defined]
