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
        """
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
        if self._settings.should_mock_wazuh:
            from services.mock_data import MockData
            return MockData.wazuh.agents()
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
    ) -> list[dict]:
        """
        Get recent alerts from Wazuh.
        Queries the /alerts endpoint with optional severity filtering.
        """
        if self._settings.should_mock_wazuh:
            from services.mock_data import MockData
            return MockData.wazuh.alerts(limit=limit, level_min=level_min)
        try:
            params: dict[str, Any] = {
                "limit": limit,
                "offset": offset,
                "sort": "-timestamp",
            }
            if level_min is not None:
                params["q"] = f"rule.level>={level_min}"

            data = await self._api_request("GET", "/alerts", params=params)
            alerts = data.get("data", {}).get("affected_items", [])
            return self._normalize_alerts(alerts)
        except Exception as e:
            logger.error("wazuh_get_alerts_failed", error=str(e))
            raise

    async def get_alerts_by_agent(
        self, agent_id: str, limit: int = 50, offset: int = 0
    ) -> list[dict]:
        """Get alerts filtered by a specific agent."""
        if self._settings.should_mock_wazuh:
            from services.mock_data import MockData
            return MockData.wazuh.alerts(limit=limit, agent_id=agent_id)
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
        if self._settings.should_mock_wazuh:
            return {"agent_id": agent_id, "command": command, "success": True, "mock": True}
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
        if self._settings.should_mock_wazuh:
            from services.mock_data import MockData
            return MockData.wazuh.critical_alerts(limit=limit)
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
        if self._settings.should_mock_wazuh:
            from services.mock_data import MockData
            return MockData.wazuh.alerts_timeline(level_min=level_min, minutes=minutes)
        try:
            # Fetch a large batch of recent alerts above threshold
            params: dict[str, Any] = {
                "limit": 500,
                "offset": 0,
                "sort": "-timestamp",
                "q": f"rule.level>={level_min}",
            }
            data = await self._api_request("GET", "/alerts", params=params)
            alerts = data.get("data", {}).get("affected_items", [])

            # Bucketize by minute
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
                    # Wazuh timestamps: "2024-01-15T10:30:45.123+0000"
                    ts = datetime.fromisoformat(ts_str.replace("+0000", "+00:00"))
                    if ts >= cutoff:
                        minute_key = ts.strftime("%Y-%m-%dT%H:%M:00")
                        minute_counts[minute_key] += 1
                except (ValueError, TypeError):
                    continue

            # Fill in missing minutes with 0
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
        if self._settings.should_mock_wazuh:
            from services.mock_data import MockData
            return MockData.wazuh.top_agents(limit=limit)
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
        """
        [Wazuh API] Get count of agents by status.
        Uses Wazuh endpoint: GET /agents/summary/status
        """
        if self._settings.should_mock_wazuh:
            from services.mock_data import MockData
            return MockData.wazuh.agents_summary()
        try:
            data = await self._api_request("GET", "/agents/summary/status")
            connection = data.get("data", {}).get("connection", {})
            config = data.get("data", {}).get("configuration", {})
            return {
                "active": connection.get("active", 0),
                "disconnected": connection.get("disconnected", 0),
                "never_connected": connection.get("never_connected", 0),
                "pending": connection.get("pending", 0),
                "total": connection.get("total", 0),
            }
        except Exception as e:
            logger.error("wazuh_get_agents_summary_failed", error=str(e))
            raise

    async def get_mitre_summary(self) -> list[dict]:
        """
        [Wazuh API] Get detected MITRE ATT&CK techniques grouped by frequency.
        Falls back to rule_groups when MITRE data is not available.
        """
        if self._settings.should_mock_wazuh:
            from services.mock_data import MockData
            return MockData.wazuh.mitre_summary()
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
        if self._settings.should_mock_wazuh:
            from services.mock_data import MockData
            return MockData.wazuh.health()
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

    async def close(self) -> None:
        """Close the HTTP client."""
        if self._client and not self._client.is_closed:
            await self._client.aclose()
            logger.info("wazuh_client_closed")


def get_wazuh_service() -> WazuhService:
    """Get the Wazuh service singleton."""
    return WazuhService()

