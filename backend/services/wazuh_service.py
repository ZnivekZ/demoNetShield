"""
Wazuh Service - HTTP client for Wazuh SIEM REST API.

Design decisions:
- Uses httpx (async) for all API calls
- SSL verification disabled for lab (self-signed certs) - enable in production
- Token-based auth: obtains JWT on first call, refreshes automatically
- Exponential backoff retries for transient failures
- All responses normalized to consistent format
"""

from __future__ import annotations

import asyncio
import random
from datetime import datetime, timezone, timedelta
from typing import Any

import httpx
import structlog
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type,
)

from config import get_settings

logger = structlog.get_logger(__name__)


class WazuhService:
    """
    Service for communicating with Wazuh SIEM REST API.
    Handles authentication, token refresh, and all agent/alert queries.
    """

    _instance: WazuhService | None = None

    def __new__(cls) -> WazuhService:
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def __init__(self) -> None:
        if self._initialized:
            return
        self._initialized = True
        self._settings = get_settings()
        self._token: str | None = None
        self._token_lock = asyncio.Lock()
        self._client: httpx.AsyncClient | None = None

    def _get_client(self) -> httpx.AsyncClient:
        """Get or create the httpx async client."""
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                base_url=self._settings.wazuh_base_url,
                verify=False,  # Lab: self-signed cert. Enable in production.
                timeout=httpx.Timeout(30.0, connect=10.0),
            )
        return self._client

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=10),
        retry=retry_if_exception_type((httpx.ConnectError, httpx.TimeoutException)),
    )
    async def _authenticate(self) -> str:
        """
        Obtain a JWT token from Wazuh API.
        Wazuh uses Basic Auth to get a token, then Bearer token for subsequent calls.
        """
        client = self._get_client()
        response = await client.post(
            "/security/user/authenticate",
            auth=(self._settings.wazuh_user, self._settings.wazuh_password),
        )
        response.raise_for_status()
        data = response.json()
        token = data.get("data", {}).get("token", "")
        if not token:
            raise ValueError("Failed to obtain Wazuh authentication token")
        logger.info("wazuh_authenticated", host=self._settings.wazuh_host)
        return token

    async def _ensure_token(self) -> str:
        """Ensure we have a valid authentication token."""
        async with self._token_lock:
            if self._token is None:
                self._token = await self._authenticate()
            return self._token


    # ── Indexer passthrough ───────────────────────────────────────
    async def _indexer_passthrough(
        self,
        method: str,
        endpoint: str,
        params: dict | None,
        json_body: dict | None,
    ) -> dict[str, Any]:
        """
        Translate Server API-style calls to Indexer queries and adapt the response
        to the same `{data: {affected_items: [...]}}` envelope that the Server API
        returns. This keeps every public method on WazuhService unchanged.

        Mapping:
            /alerts                                  → indexer.get_alerts
            /alerts/critical                         → indexer.get_critical_alerts
            /alerts/timeline                         → indexer.get_alerts_timeline
            /alerts/last-critical                    → indexer.get_critical_alerts(1)
            /vulnerabilities                         → indexer.get_vulnerabilities
        """
        from services.wazuh_indexer import get_indexer_client
        indexer = get_indexer_client()
        params = params or {}

        def _int(name: str, default: int) -> int:
            try:
                v = params.get(name, default)
                return int(v) if v is not None else default
            except (TypeError, ValueError):
                return default

        def _str(name: str, default: str = "") -> str:
            return str(params.get(name, default) or default)

        try:
            # ── Vulnerabilities ────────────────────────────────────
            if endpoint.startswith("/vulnerabilities"):
                limit = _int("limit", 100)
                agent_id = params.get("agent_id") or None
                items = await indexer.get_vulnerabilities(limit=limit, agent_id=agent_id)
                return {"data": {"affected_items": items}, "error": 0}

            # ── Last critical (single item) ────────────────────────
            if endpoint.startswith("/alerts/last-critical"):
                items = await indexer.get_critical_alerts(limit=1)
                if not items:
                    return {"data": {"affected_items": []}, "error": 0}
                return {"data": {"affected_items": items[:1]}, "error": 0}

            # ── Critical alerts ────────────────────────────────────
            if endpoint.startswith("/alerts/critical"):
                limit = _int("limit", 20)
                items = await indexer.get_critical_alerts(limit=limit)
                return {"data": {"affected_items": items}, "error": 0}

            # ── Timeline ───────────────────────────────────────────
            if endpoint.startswith("/alerts/timeline"):
                # Parse `q=rule.level>=X` if present, else 0
                q = _str("q", "")
                level_min = None
                if q.startswith("rule.level>="):
                    try:
                        level_min = int(q.split(">=", 1)[1])
                    except ValueError:
                        level_min = None
                hours = _int("hours", 24)
                buckets = await indexer.get_alerts_timeline(level_min=level_min, hours=hours)
                return {"data": {"affected_items": buckets}, "error": 0}

            # ── Generic /alerts (with or without filters) ─────────
            limit = _int("limit", 50)
            level_min: int | None = None
            q = _str("q", "")
            if q.startswith("rule.level>="):
                try:
                    level_min = int(q.split(">=", 1)[1])
                except ValueError:
                    level_min = None
            agent_id = params.get("agent_id") or None
            items = await indexer.get_alerts(limit=limit, level_min=level_min, agent_id=agent_id)
            return {"data": {"affected_items": items}, "error": 0}

        except Exception as e:
            logger.error("wazuh_indexer_passthrough_failed", endpoint=endpoint, error=str(e))
            # Return empty envelope so callers can degrade gracefully
            return {"data": {"affected_items": []}, "error": 0}

    async def _api_request(
        self,
        method: str,
        endpoint: str,
        params: dict | None = None,
        json_body: dict | None = None,
    ) -> dict[str, Any]:
        """
        Make an authenticated API request to Wazuh.
        Automatically refreshes token on 401 errors.

        Special routing: endpoints that don't exist in Wazuh 4.14.6 Server API
        (/alerts*, /vulnerabilities) get transparently redirected to the Wazuh
        Indexer (OpenSearch :9200) when configured.
        """
        # ── Redirect: /alerts* and /vulnerabilities → Indexer ──
        if endpoint.startswith(("/alerts", "/vulnerabilities")):
            from services.wazuh_indexer import get_indexer_client
            indexer = get_indexer_client()
            if indexer.is_configured():
                # Short-circuit when the Indexer circuit breaker is open:
                # return empty envelope without touching the network. This stops
                # the WebSocket polling loop from blocking on timeouts.
                if indexer._breaker.is_open():
                    logger.debug(
                        "indexer_circuit_open_skip_passthrough",
                        endpoint=endpoint,
                        seconds_until_retry=round(indexer._breaker.seconds_until_retry, 1),
                    )
                    return {"data": {"affected_items": []}, "error": 0}
                try:
                    return await self._indexer_passthrough(method, endpoint, params, json_body)
                except Exception as e:
                    logger.warning(
                        "wazuh_indexer_passthrough_error",
                        endpoint=endpoint,
                        error=repr(e),
                        error_type=type(e).__name__,
                    )
                    return {"data": {"affected_items": []}, "error": 0}
        # ── End: redirect block ──
        token = await self._ensure_token()
        client = self._get_client()
        headers = {"Authorization": f"Bearer {token}"}

        try:
            response = await client.request(
                method,
                endpoint,
                headers=headers,
                params=params,
                json=json_body,
            )

            # Token expired - refresh and retry
            if response.status_code == 401:
                logger.info("wazuh_token_expired, refreshing")
                async with self._token_lock:
                    self._token = await self._authenticate()
                headers["Authorization"] = f"Bearer {self._token}"
                response = await client.request(
                    method,
                    endpoint,
                    headers=headers,
                    params=params,
                    json=json_body,
                )

            response.raise_for_status()
            return response.json()
        except httpx.HTTPStatusError as e:
            logger.error(
                "wazuh_api_error",
                endpoint=endpoint,
                status_code=e.response.status_code,
                detail=e.response.text[:500],
            )
            raise
        except Exception as e:
            logger.error("wazuh_api_request_failed", endpoint=endpoint, error=str(e))
            raise

    # ── Public API Methods ────────────────────────────────────────

    async def get_agents(self) -> list[dict]:
        """
        Get all Wazuh agents with their status.
        Returns normalized agent data.
        """
        try:
            data = await self._api_request("GET", "/agents", params={"limit": 500})
            agents = data.get("data", {}).get("affected_items", [])
            result = []
            for agent in agents:
                result.append({
                    "id": agent.get("id", ""),
                    "name": agent.get("name", ""),
                    "ip": agent.get("ip", ""),
                    "status": agent.get("status", ""),
                    "os_name": agent.get("os", {}).get("name", ""),
                    "os_version": agent.get("os", {}).get("version", ""),
                    "manager": agent.get("manager", ""),
                    "node_name": agent.get("node_name", ""),
                    "group": agent.get("group", []),
                    "last_keep_alive": agent.get("lastKeepAlive", ""),
                    "date_add": agent.get("dateAdd", ""),
                })
            logger.debug("wazuh_agents_fetched", count=len(result))
            return result
        except Exception as e:
            logger.error("wazuh_get_agents_failed", error=str(e))
            raise

    async def get_alerts(
        self,
        limit: int = 50,
        level_min: int | None = None,
        offset: int = 0,
        agent_id: str | None = None,
        time_from: str | None = None,
    ) -> list[dict]:
        """
        Get recent alerts from Wazuh.
        Queries the Indexer (wazuh-alerts-4.x-*) with optional filters:
        level_min, agent_id, time_from (ISO or 'now-7d' style).
        """
        # Prefer the Wazuh Indexer (OpenSearch :9200) — Server API has no /alerts
        from services.wazuh_indexer import get_indexer_client
        indexer = get_indexer_client()
        if indexer.is_configured():
            try:
                raw_alerts = await indexer.get_alerts(
                    limit=limit, level_min=level_min,
                    agent_id=agent_id, time_from=time_from,
                )
                # Indexer returns nested format (agent.name, rule.level).
                # Flatten to match the rest of the dashboard's flat schema
                # (agent_name, rule_level, rule_description, ...).
                alerts = self._normalize_alerts(raw_alerts)
            except Exception as e:
                logger.error("wazuh_get_alerts_indexer_failed", error=str(e))
                raise
        else:
            # Fallback to Server API (will 404 on Wazuh 4.14.6 but kept for compat)
            try:
                params: dict[str, Any] = {
                    "limit": limit,
                    "offset": offset,
                    "sort": "-timestamp",
                }
                if level_min is not None:
                    params["q"] = f"rule.level>={level_min}"

                data = await self._api_request("GET", "/alerts", params=params)
                raw_alerts = data.get("data", {}).get("affected_items", [])
                alerts = self._normalize_alerts(raw_alerts)
            except Exception as e:
                logger.error("wazuh_get_alerts_failed", error=str(e))
                raise

        # ── GeoIP enrichment (silencioso — nunca rompe el endpoint) ──────
        # Enriquece alertas con src_ip externas: ciudad, lat/lon, tipo de red.
        try:
            from services.geoip_service import GeoIPService
            external_ips = list({
                a["src_ip"] for a in alerts
                if a.get("src_ip") and not a["src_ip"].startswith(("192.168.", "10.", "172."))
            })
            if external_ips:
                geo_results = GeoIPService.lookup_bulk(external_ips)
                geo_map = {r["ip"]: r for r in geo_results}
                for alert in alerts:
                    src = alert.get("src_ip", "")
                    if src in geo_map:
                        g = geo_map[src]
                        alert["geo"] = {
                            "country_code": g.get("country_code", ""),
                            "country_name": g.get("country_name", ""),
                            "city": g.get("city"),
                            "latitude": g.get("latitude"),
                            "longitude": g.get("longitude"),
                            "network_type": g.get("network_type"),
                            "is_datacenter": g.get("is_datacenter", False),
                            "is_tor": g.get("is_tor", False),
                            "raw_available": g.get("raw_available", False),
                        }
        except Exception as _geo_err:
            logger.debug("wazuh.geo_enrichment_skipped", error=str(_geo_err))

        return alerts

    async def get_alerts_by_agent(
        self, agent_id: str, limit: int = 50, offset: int = 0
    ) -> list[dict]:
        """Get alerts filtered by a specific agent."""
        try:
            params: dict[str, Any] = {
                "limit": limit,
                "offset": offset,
                "sort": "-timestamp",
                "q": f"agent.id={agent_id}",
            }
            data = await self._api_request("GET", "/alerts", params=params)
            alerts = data.get("data", {}).get("affected_items", [])
            return self._normalize_alerts(alerts)
        except Exception as e:
            logger.error(
                "wazuh_get_alerts_by_agent_failed",
                agent_id=agent_id,
                error=str(e),
            )
            raise

    async def send_active_response(
        self, agent_id: str, command: str, args: list[str] | None = None
    ) -> dict:
        """
        Send an active response command to a specific agent.
        Example: firewall-drop0, restart-wazuh0
        """
        try:
            body: dict[str, Any] = {
                "command": command,
                "arguments": args or [],
            }
            data = await self._api_request(
                "PUT",
                f"/active-response/{agent_id}",
                json_body=body,
            )
            logger.info(
                "wazuh_active_response_sent",
                agent_id=agent_id,
                command=command,
            )
            return data
        except Exception as e:
            logger.error(
                "wazuh_active_response_failed",
                agent_id=agent_id,
                command=command,
                error=str(e),
            )
            raise

    # ── Helpers ────────────────────────────────────────────────────

    def _normalize_alerts(self, alerts: list[dict]) -> list[dict]:
        """
        Normalize raw Wazuh alert data to consistent schema.
        Includes MITRE ATT&CK fields with fallback to rule_groups.
        """
        result = []
        for alert in alerts:
            agent = alert.get("agent", {})
            rule = alert.get("rule", {})
            data = alert.get("data", {})
            mitre = rule.get("mitre", {})

            # MITRE fallback: use rule_groups if MITRE data unavailable
            mitre_techniques = mitre.get("technique", [])
            mitre_ids = mitre.get("id", [])
            mitre_technique = mitre_techniques[0] if mitre_techniques else ""
            mitre_id = mitre_ids[0] if mitre_ids else ""

            result.append({
                "id": alert.get("id", ""),
                "timestamp": alert.get("timestamp", ""),
                "agent_id": agent.get("id", ""),
                "agent_name": agent.get("name", ""),
                "agent_ip": agent.get("ip", ""),
                "rule_id": rule.get("id", ""),
                "rule_level": int(rule.get("level", 0)),
                "rule_description": rule.get("description", ""),
                "rule_groups": rule.get("groups", []),
                "full_log": alert.get("full_log", ""),
                "src_ip": data.get("srcip", ""),
                "dst_ip": data.get("dstip", ""),
                "location": alert.get("location", ""),
                "mitre_technique": mitre_technique,
                "mitre_id": mitre_id,
                # Extra fields for phishing
                "dst_url": data.get("url", ""),
                "user": data.get("srcuser", data.get("dstuser", "")),
            })
        return result

    def _extract_mitre_display(self, alert: dict) -> str:
        """
        Get display-friendly MITRE technique name.
        Falls back to first rule_group if MITRE data unavailable.
        """
        if alert.get("mitre_technique"):
            return alert["mitre_technique"]
        groups = alert.get("rule_groups", [])
        return groups[0] if groups else "unknown"

    # ── New Public Methods (Security Panel) ───────────────────────

    async def get_critical_alerts(
        self, limit: int = 50, offset: int = 0
    ) -> list[dict]:
        """
        [Wazuh API] Get alerts with level > 10 (critical).
        Includes MITRE technique data with rule_groups fallback.
        """
        try:
            params: dict[str, Any] = {
                "offset": offset,
                "sort": "-timestamp",
                "q": "rule.level>10",
            }
            data = await self._api_request("GET", "/alerts", params=params)
            alerts = data.get("data", {}).get("affected_items", [])
            return self._normalize_alerts(alerts)
        except Exception as e:
            logger.error("wazuh_get_critical_alerts_failed", error=str(e))
            raise

    async def get_alerts_timeline(
        self, level_min: int = 5, minutes: int = 60
    ) -> list[dict]:
        """
        [Wazuh API] Get alert count grouped by minute for the last N minutes.
        Useful for detecting attack spikes in real-time.
        """
        # Prefer Indexer native bucketing (hourly buckets, last N hours)
        from services.wazuh_indexer import get_indexer_client
        indexer = get_indexer_client()
        if indexer.is_configured():
            try:
                hours = max(1, (minutes + 59) // 60)
                buckets = await indexer.get_alerts_timeline(level_min=level_min, hours=hours)
                # Adapt key: Indexer returns {"hour": ...}, legacy uses {"minute": ...}
                return [
                    {"minute": b["hour"], "count": b["count"]}
                    for b in buckets
                ]
            except Exception as e:
                logger.error("wazuh_get_alerts_timeline_indexer_failed", error=str(e))
                # fall through to legacy path
        # Legacy fallback (Server API + client-side bucketing)
        try:
            params: dict[str, Any] = {
                "limit": 500,
                "offset": 0,
                "sort": "-timestamp",
                "q": f"rule.level>={level_min}",
            }
            data = await self._api_request("GET", "/alerts", params=params)
            alerts = data.get("data", {}).get("affected_items", [])

            from collections import Counter
            from datetime import datetime, timedelta, timezone

            now = datetime.now(timezone.utc)
            cutoff = now - timedelta(minutes=minutes)
            minute_counts: Counter[str] = Counter()

            for alert in alerts:
                ts_str = alert.get("timestamp", "")
                if not ts_str:
                    continue
                try:
                    ts = datetime.fromisoformat(ts_str.replace("+0000", "+00:00"))
                    if ts >= cutoff:
                        minute_key = ts.strftime("%Y-%m-%dT%H:%M:00")
                        minute_counts[minute_key] += 1
                except (ValueError, TypeError):
                    continue

            result = []
            for i in range(minutes):
                t = cutoff + timedelta(minutes=i)
                key = t.strftime("%Y-%m-%dT%H:%M:00")
                result.append({"minute": key, "count": minute_counts.get(key, 0)})

            logger.debug("wazuh_alerts_timeline_built", points=len(result))
            return result
        except Exception as e:
            logger.error("wazuh_get_alerts_timeline_failed", error=str(e))
            raise

    async def get_top_agents(self, limit: int = 10) -> list[dict]:
        """
        [Wazuh API] Get top N agents by alert count.
        Includes last alert timestamp and most frequent MITRE technique.
        """
        try:
            params: dict[str, Any] = {
                "limit": 500,
                "offset": 0,
                "sort": "-timestamp",
            }
            data = await self._api_request("GET", "/alerts", params=params)
            alerts = data.get("data", {}).get("affected_items", [])
            normalized = self._normalize_alerts(alerts)

            # Group by agent
            from collections import Counter, defaultdict

            agent_alerts: defaultdict[str, list[dict]] = defaultdict(list)
            for alert in normalized:
                aid = alert.get("agent_id", "")
                if aid:
                    agent_alerts[aid].append(alert)

            result = []
            for agent_id, agent_alert_list in agent_alerts.items():
                mitre_counter: Counter[str] = Counter()
                for a in agent_alert_list:
                    mt = self._extract_mitre_display(a)
                    if mt and mt != "unknown":
                        mitre_counter[mt] += 1

                top_mitre = mitre_counter.most_common(1)
                result.append({
                    "agent_id": agent_id,
                    "agent_name": agent_alert_list[0].get("agent_name", ""),
                    "alert_count": len(agent_alert_list),
                    "last_alert_timestamp": agent_alert_list[0].get("timestamp", ""),
                    "top_mitre_technique": top_mitre[0][0] if top_mitre else "",
                })

            # Sort by alert count descending, take top N
            result.sort(key=lambda x: x["alert_count"], reverse=True)
            logger.debug("wazuh_top_agents_fetched", count=len(result[:limit]))
            return result[:limit]
        except Exception as e:
            logger.error("wazuh_get_top_agents_failed", error=str(e))
            raise

    async def get_agents_summary(self) -> dict:
        """[Wazuh API] Get count of agents by status.

        Computes the summary from `/agents` so the counts always agree with
        what the agents page lists. Previously this used `/agents/summary/status`
        which excludes the manager (id `000`) and produced a confusing
        mismatch where the page showed 1 active agent but the summary said 2.
        """
        try:
            agents = await asyncio.wait_for(self.get_agents(), timeout=8.0)
        except Exception as e:
            logger.warning(
                "wazuh_get_agents_summary_failed",
                error=str(e),
            )
            return {
                "active": 0,
                "disconnected": 0,
                "never_connected": 0,
                "pending": 0,
                "total": 0,
                "partial": True,
            }
        counts = {"active": 0, "disconnected": 0, "never_connected": 0, "pending": 0}
        for a in agents:
            status = (a.get("status") or "").lower()
            if status in counts:
                counts[status] += 1
            # ignore unknown statuses
        counts["total"] = len(agents)
        return counts

    async def get_mitre_summary(self) -> list[dict]:
        """
        [Wazuh API] Get detected MITRE ATT&CK techniques grouped by frequency.
        Falls back to rule_groups when MITRE data is not available.
        """
        try:
            params: dict[str, Any] = {
                "limit": 500,
                "offset": 0,
                "sort": "-timestamp",
            }
            data = await self._api_request("GET", "/alerts", params=params)
            alerts = data.get("data", {}).get("affected_items", [])
            normalized = self._normalize_alerts(alerts)

            from collections import defaultdict

            techniques: defaultdict[str, dict] = defaultdict(
                lambda: {"technique_id": "", "technique_name": "", "count": 0, "last_seen": ""}
            )

            for alert in normalized:
                mitre_id = alert.get("mitre_id", "")
                mitre_name = alert.get("mitre_technique", "")

                # Fallback: use rule_groups if no MITRE data
                if not mitre_id and not mitre_name:
                    groups = alert.get("rule_groups", [])
                    if groups:
                        mitre_name = groups[0]
                        mitre_id = f"group:{groups[0]}"
                    else:
                        continue

                key = mitre_id or mitre_name
                entry = techniques[key]
                entry["technique_id"] = mitre_id
                entry["technique_name"] = mitre_name
                entry["count"] += 1
                ts = alert.get("timestamp", "")
                if ts and (not entry["last_seen"] or ts > entry["last_seen"]):
                    entry["last_seen"] = ts

            result = list(techniques.values())
            result.sort(key=lambda x: x["count"], reverse=True)
            logger.debug("wazuh_mitre_summary_built", techniques=len(result))
            return result
        except Exception as e:
            logger.error("wazuh_get_mitre_summary_failed", error=str(e))
            raise

    async def get_last_critical_alert(self) -> dict | None:
        """
        [Wazuh API] Get the last critical alert (level > 10).
        Returns a single alert dict or None.
        """
        try:
            alerts = await self.get_critical_alerts(limit=1, offset=0)
            if alerts:
                alert = alerts[0]
                alert["mitre_technique"] = self._extract_mitre_display(alert)
                return alert
            return None
        except Exception as e:
            logger.error("wazuh_get_last_critical_failed", error=str(e))
            raise

    async def get_health(self) -> dict:
        """
        [Wazuh API] Get health of Wazuh manager services.
        Queries: GET /manager/status and GET /manager/info
        """
        services = []
        version = ""
        cluster_enabled = False
        try:
            # Manager status (list of daemons)
            status_data = await self._api_request("GET", "/manager/status")
            daemons = status_data.get("data", {}).get("affected_items", [{}])
            if daemons:
                daemon_dict = daemons[0] if isinstance(daemons, list) else daemons
                if isinstance(daemon_dict, dict):
                    for name, status in daemon_dict.items():
                        services.append({
                            "service_name": name,
                            "status": status,
                        })
        except Exception as e:
            logger.warning("wazuh_health_status_failed", error=str(e))

        try:
            # Manager info (version, cluster)
            info_data = await self._api_request("GET", "/manager/info")
            info = info_data.get("data", {}).get("affected_items", [{}])
            if info:
                info_dict = info[0] if isinstance(info, list) else info
                version = info_dict.get("version", "")
                cluster_enabled = info_dict.get("cluster_enabled", False)
        except Exception as e:
            logger.warning("wazuh_health_info_failed", error=str(e))

        return {
            "services": services,
            "version": version,
            "cluster_enabled": cluster_enabled,
        }

    # ── Extended Security Endpoints (for new Wazuh UI module) ───────────

    async def get_vulnerabilities(
        self,
        agent_id: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[dict]:
        """
        [Wazuh Indexer] Get vulnerability findings.

        The /vulnerabilities endpoint is transparently redirected to the Wazuh
        Indexer (wazuh-states-vulnerabilities-*), whose documents are already
        normalized to the dashboard shape by WazuhIndexerClient._normalize_vuln
        (cve_id, cvss_score, package_name, detected_at, references, ...).
        Return them as-is — do NOT re-map to the old Server-API field names.
        """
        try:
            data = await self._api_request("GET", "/vulnerabilities", params={"limit": limit, "offset": offset})
            # Passthrough returns {data: {affected_items: [...]}} with the
            # normalized Indexer items already in dashboard shape.
            affected = data.get("data", {}).get("affected_items", [])
            if agent_id:
                affected = [v for v in affected if v.get("agent_id") == agent_id]
            return affected
        except Exception as e:
            logger.warning("wazuh_get_vulnerabilities_failed", error=str(e))
            return []

    async def get_agent_detail(self, agent_id: str) -> dict:
        """
        [Wazuh API] Get detail of a single agent.
        Wazuh endpoints: GET /agents/{agent_id} and GET /agents/{agent_id}/group/is_sync.
        """
        try:
            data = await self._api_request("GET", f"/agents/{agent_id}")
            items = data.get("data", {}).get("affected_items", [])
            if items:
                agent = items[0]
                return {
                    "id": agent.get("id", agent_id),
                    "name": agent.get("name", ""),
                    "ip": agent.get("ip", ""),
                    "status": agent.get("status", ""),
                    "os_name": agent.get("os", {}).get("name", "") if isinstance(agent.get("os"), dict) else str(agent.get("os", "")),
                    "os_version": agent.get("version", "") or (agent.get("os", {}).get("version", "") if isinstance(agent.get("os"), dict) else ""),
                    "manager": agent.get("manager", ""),
                    "node_name": agent.get("node_name", ""),
                    "last_keep_alive": agent.get("last_keep_alive", ""),
                    "registration_ip": agent.get("registration_ip", ""),
                    "group": agent.get("group", []),
                    "date_add": agent.get("dateAdd", ""),
                }
            return {"id": agent_id, "error": "not_found"}
        except Exception as e:
            logger.warning("wazuh_get_agent_detail_failed", agent_id=agent_id, error=str(e))

    async def get_agent_alerts(
        self, agent_id: str, limit: int = 25, level_min: int = 0
    ) -> list[dict]:
        """
        [Wazuh API] Get recent alerts from one specific agent.
        Falls back to get_alerts + filter by agent_id if Wazuh lacks a dedicated endpoint.
        """
        try:
            return await self.get_alerts_by_agent(
                agent_id=agent_id, limit=limit, offset=0
            )
        except Exception as e:
            logger.warning("wazuh_get_agent_alerts_failed", agent_id=agent_id, error=str(e))

    async def get_agent_syscheck(self, agent_id: str, limit: int = 50) -> list[dict]:
        """
        [Wazuh API] Get recent file integrity monitoring (syscheck) events for an agent.
        Endpoint: GET /syscheck/{agent_id}
        """
        try:
            data = await self._api_request(
                "GET", f"/syscheck/{agent_id}", params={"limit": limit}
            )
            items = data.get("data", {}).get("affected_items", [])
            out: list[dict] = []
            for it in items:
                out.append({
                    "file": it.get("file", ""),
                    "event": it.get("event", ""),
                    "timestamp": it.get("timestamp", ""),
                    "sha256": it.get("sha256", ""),
                    "size": it.get("size", 0),
                    "agent_id": agent_id,
                })
            return out
        except Exception as e:
            logger.warning("wazuh_get_agent_syscheck_failed", agent_id=agent_id, error=str(e))

    async def get_agent_syscollector(self, agent_id: str) -> dict:
        """
        [Wazuh API] Get hardware/software inventory (syscollector) for one agent.
        Endpoints: GET /syscollector/{agent_id}/hardware, GET /.../os, GET /.../packages.
        """
        result: dict[str, Any] = {"agent_id": agent_id}
        try:
            hw = await self._api_request("GET", f"/syscollector/{agent_id}/hardware")
            hw_items = hw.get("data", {}).get("affected_items", [])
            if hw_items:
                h = hw_items[0]
                result["hardware"] = {
                    "cpu_cores": h.get("cpu", {}).get("cores", 0),
                    "cpu_name": h.get("cpu", {}).get("name", ""),
                    "cpu_mhz": h.get("cpu", {}).get("mhz", 0),
                    "ram_total_mb": int((h.get("ram", {}).get("total", 0) or 0) / 1024),
                    "ram_free_mb": int((h.get("ram", {}).get("free", 0) or 0) / 1024),
                }
        except Exception as e:
            logger.warning("wazuh_syscollector_hw_failed", agent_id=agent_id, error=str(e))
            result["hardware"] = None
        try:
            os_data = await self._api_request("GET", f"/syscollector/{agent_id}/os")
            os_items = os_data.get("data", {}).get("affected_items", [])
            if os_items:
                o = os_items[0]
                result["os"] = {
                    "sysname": o.get("sysname", ""),
                    "version": o.get("version", ""),
                    "architecture": o.get("architecture", ""),
                }
        except Exception as e:
            logger.warning("wazuh_syscollector_os_failed", agent_id=agent_id, error=str(e))
            result["os"] = None
        try:
            pkgs = await self._api_request(
                "GET", f"/syscollector/{agent_id}/packages", params={"limit": 50}
            )
            pkgs_items = pkgs.get("data", {}).get("affected_items", [])
            result["packages_count"] = len(pkgs_items)
            result["packages"] = [
                {"name": p.get("name", ""), "version": p.get("version", ""), "vendor": p.get("vendor", "")}
                for p in pkgs_items[:50]
            ]
        except Exception as e:
            logger.warning("wazuh_syscollector_packages_failed", agent_id=agent_id, error=str(e))
            result["packages_count"] = 0
            result["packages"] = []
        return result

    async def get_mitre_matrix(self) -> dict:
        """
        [Wazuh API] Get MITRE ATT&CK matrix counts (tactics → techniques → count).
        Uses the existing mitre summary and groups techniques under their tactic.
        """
        try:
            summary = await self.get_mitre_summary()
            # Group by tactic (TA00XX codes)
            tactics: dict[str, dict[str, Any]] = {}
            for row in summary:
                tech = row.get("technique", "")
                tactic_id = row.get("tactic", "")
                count = row.get("count", 0)
                if not tactic_id:
                    continue
                if tactic_id not in tactics:
                    tactics[tactic_id] = {"id": tactic_id, "name": tactic_id, "techniques": [], "total": 0}
                tactics[tactic_id]["techniques"].append({"id": tech, "name": tech, "count": count})
                tactics[tactic_id]["total"] += count
            return {"tactics": list(tactics.values())}
        except Exception as e:
            logger.warning("wazuh_get_mitre_matrix_failed", error=str(e))

    async def get_stats_summary(self) -> dict:
        """
        [Wazuh API] Global aggregate stats: agents counts, alerts in last 24h, critical alerts, vulnerabilities count, top tactic.
        """
        # Schema matches WazuhDashboard.tsx expectations
        # (total_alerts_24h, critical_alerts_24h, vulnerabilities_count)
        result: dict[str, Any] = {
            "agents": {"active": 0, "disconnected": 0, "never_connected": 0, "total": 0},
            "alerts_24h": 0,
            "total_alerts_24h": 0,
            "critical_alerts": 0,
            "critical_alerts_24h": 0,
            "vulnerabilities_count": 0,
            "top_tactic": None,
        }
        try:
            ag_summary = await self.get_agents_summary()
            # get_agents_summary now returns the flat schema {active, disconnected,
            # never_connected, pending, total} directly — no further unpacking needed.
            if isinstance(ag_summary, dict) and "active" in ag_summary:
                result["agents"] = {
                    "active": ag_summary.get("active", 0),
                    "disconnected": ag_summary.get("disconnected", 0),
                    "never_connected": ag_summary.get("never_connected", 0),
                    "total": ag_summary.get("total", 0),
                }
        except Exception as e:
            logger.warning("wazuh_stats_summary_agents_failed", error=str(e))
        try:
            critical = await self.get_critical_alerts(limit=1)
            result["critical_alerts"] = len(critical) if isinstance(critical, list) else 0
            result["critical_alerts_24h"] = len(critical) if isinstance(critical, list) else 0
            # Get actual count via a broader query
            broad = await self.get_critical_alerts(limit=500)
            result["critical_alerts"] = len(broad) if isinstance(broad, list) else 0
            result["critical_alerts_24h"] = len(broad) if isinstance(broad, list) else 0
        except Exception as e:
            logger.warning("wazuh_stats_summary_critical_failed", error=str(e))
        try:
            vulns = await self.get_vulnerabilities(limit=500)
            result["vulnerabilities_count"] = len(vulns) if isinstance(vulns, list) else 0
        except Exception as e:
            logger.warning("wazuh_stats_summary_vulns_failed", error=str(e))
        try:
            # Just use first row of summary
            ms = await self.get_mitre_summary()
            if ms:
                top = ms[0]
                result["top_tactic"] = {"tactic": top.get("tactic", ""), "technique": top.get("technique", ""), "count": top.get("count", 0)}
        except Exception as e:
            logger.warning("wazuh_stats_summary_mitre_failed", error=str(e))
        # Alerts 24h — use get_alerts with a 24h window
        try:
            from datetime import datetime, timezone, timedelta
            since = (datetime.now(timezone.utc) - timedelta(hours=24)).strftime("%Y-%m-%dT%H:%M:%S")
            params = {"limit": 500, "q": f"timestamp>{since}"}
            resp = await self._api_request("GET", "/alerts", params=params)
            items = resp.get("data", {}).get("affected_items", [])
            result["alerts_24h"] = len(items)
            result["total_alerts_24h"] = len(items)
        except Exception as e:
            logger.warning("wazuh_stats_summary_alerts_24h_failed", error=str(e))
        return result

    async def close(self) -> None:
        """Close the HTTP client."""
        if self._client and not self._client.is_closed:
            await self._client.aclose()
            logger.info("wazuh_client_closed")


def get_wazuh_service() -> WazuhService:
    """Get the Wazuh service singleton."""
    return WazuhService()
