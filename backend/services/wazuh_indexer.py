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

    async def get_mitre_summary(self) -> list[dict[str, Any]]:
        """
        Aggregate alerts by MITRE tactic.id to populate the MITRE dashboard.
        Returns: [{"tactic_id": "TA0001", "technique_count": 3, "alert_count": 12}, ...]
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
                        {"exists": {"field": "rule.mitre.id"}},
                    ]
                }
            },
            "aggs": {
                "by_tactic": {
                    "terms": {"field": "rule.mitre.tactic.id", "size": 20},
                    "aggs": {
                        "technique_count": {
                            "cardinality": {"field": "rule.mitre.id"}
                        }
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
            buckets = data.get("aggregations", {}).get("by_tactic", {}).get("buckets", [])
            return [
                {
                    "tactic_id": b.get("key", ""),
                    "technique_count": b.get("technique_count", {}).get("value", 0),
                    "alert_count": b.get("doc_count", 0),
                }
                for b in buckets
            ]
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

        # Extract IP from data.srcip / data.dstip / agent.ip (fallback chain)
        src_ip = data.get("srcip") or data.get("src_ip") or agent.get("ip", "")

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
        v = raw.get("vulnerability", {}) or {}
        a = raw.get("agent", {}) or {}
        package = raw.get("package", {}) or {}
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
        return {
            "cve": v.get("id", ""),
            "title": v.get("description", "")[:200],
            "severity": v.get("severity", "low"),
            "score": score_val,
            "published": v.get("published_at", ""),
            "package": package.get("name", ""),
            "package_version": package.get("version", ""),
            "agent_id": a.get("id", ""),
            "agent_name": a.get("name", ""),
            "reference": (v.get("reference", "") or "")[:300],
        }


# ── Singleton accessor ───────────────────────────────────────────────

def get_indexer_client() -> WazuhIndexerClient:
    """Get the global WazuhIndexerClient singleton."""
    return WazuhIndexerClient()