"""
CrowdSec Service — Singleton client for the CrowdSec Local API (LAPI).

Follows the same pattern as mikrotik_service.py:
 - Singleton via __new__
 - httpx.AsyncClient (async, like wazuh_service.py)
 - Retry with tenacity on transient network errors
 - structlog for all logging — never print()

CrowdSec LAPI reference: https://crowdsec.net/blog/crowdsec-rest-api
Default port: 8080, auth via X-Api-Key header.
"""

from __future__ import annotations

import asyncio
from functools import wraps

import httpx
import structlog
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from config import get_settings
from services.resilience import make_resilience, safe_call

logger = structlog.get_logger(__name__)


class CrowdSecUnavailable(Exception):
    """Raised when the CrowdSec breaker is open or the call failed."""
    pass


def _log_retry(retry_state):
    logger.warning(
        "crowdsec_request_retry",
        attempt=retry_state.attempt_number,
        error=str(retry_state.outcome.exception()),
    )


class CrowdSecService:
    """
    Singleton service for CrowdSec Local API communication.

    Usage:
        crowdsec = get_crowdsec_service()
        decisions = await crowdsec.get_decisions()
    """

    _instance: "CrowdSecService | None" = None

    def __new__(cls) -> "CrowdSecService":
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def __init__(self) -> None:
        if self._initialized:
            return
        self._settings = get_settings()
        # Resilience: own thread pool + circuit breaker. Although this
        # service uses httpx.AsyncClient (no sync I/O on the loop), the
        # circuit breaker still short-circuits polling calls when CrowdSec
        # is down, preventing 504-style noise in the logs.
        self._breaker, self._executor = make_resilience(
            name="crowdsec",
            failure_threshold=3,
            cooldown_seconds=30.0,
            max_workers=1,  # async client — pool is unused but reserved
                            # for any future sync helpers
        )
        self._client: httpx.AsyncClient | None = None
        self._initialized = True
        logger.info("crowdsec_service_created", url=self._settings.crowdsec_url)

    # ── Connection lifecycle ──────────────────────────────────────────────

    async def connect(self) -> None:
        """Initialize the httpx client. Called from main.py lifespan.

        On connect failure we leave _client = None so that subsequent callers
        raise immediately (rather than hanging on a request that goes nowhere).
        """
        self._client = httpx.AsyncClient(
            base_url=self._settings.crowdsec_url,
            headers={
                "X-Api-Key": self._settings.crowdsec_api_key,
                "Content-Type": "application/json",
            },
            # Hard 5s read timeout — SSE streams can otherwise hang forever
            # and block the WS polling loop on the asyncio event loop.
            timeout=httpx.Timeout(connect=3.0, read=5.0, write=5.0, pool=3.0),
            verify=False,  # Lab environment — documented risk
        )
        try:
            # Use shorter probe timeout so a failed connect() returns fast.
            await asyncio.wait_for(
                self._client.get("/v1/decisions"),
                timeout=3.0,
            )
            logger.info("crowdsec_connected", url=self._settings.crowdsec_url)
        except Exception as e:
            # CRITICAL: close the client and reset to None so the WS loop
            # in main.py gets immediate CrowdSecUnavailable errors instead of
            # every poll waiting 8s before failing. Without this, the WS
            # message "CrowdSec WS ...all connect() first." repeats every 10s
            # and the WS itself keeps trying forever, tying up resources.
            logger.warning("crowdsec_connect_failed", error=repr(e))
            try:
                await self._client.aclose()
            except Exception:
                pass
            self._client = None
            # Pre-trip the breaker so the very next request from the WS
            # short-circuits instead of repeating the failed probe.
            self._breaker.record_failure()

    async def close(self) -> None:
        """Close the httpx client. Called from main.py lifespan."""
        if self._client:
            await self._client.aclose()
            self._client = None
            logger.info("crowdsec_client_closed")

    def get_settings(self):
        """Expose the resolved settings (url, api key presence) for status UI."""
        return self._settings

    async def check_connection(self) -> bool:
        """
        Lightweight live probe against the LAPI.
        Returns True when the client is connected and a /v1/decisions probe
        succeeds; False otherwise (never raises).
        """
        if not self._client:
            return False
        try:
            resp = await asyncio.wait_for(
                self._client.get("/v1/decisions"),
                timeout=3.0,
            )
            return resp.status_code < 400
        except Exception as e:
            logger.warning("crowdsec_status_probe_failed", error=repr(e))
            return False

    # ── Internal request helper ───────────────────────────────────────────

    @retry(
        retry=retry_if_exception_type((httpx.ConnectError, httpx.TimeoutException)),
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=10),
        after=_log_retry,
    )
    async def _request(
        self,
        method: str,
        path: str,
        **kwargs,
    ) -> dict | list:
        if not self._client:
            raise RuntimeError("CrowdSec client not initialized. Call connect() first.")
        # Short-circuit when the breaker is open.
        if self._breaker.is_open():
            raise CrowdSecUnavailable(
                f"crowdsec circuit open, retry in {self._breaker.seconds_until_retry:.1f}s"
            )
        if not self._breaker.allow_request():
            raise CrowdSecUnavailable("crowdsec half-open probe already in flight")
        try:
            resp = await asyncio.wait_for(
                self._client.request(method, path, **kwargs),
                timeout=8.0,
            )
            resp.raise_for_status()
            self._breaker.record_success()
        except Exception as e:
            self._breaker.record_failure()
            raise
        # Some DELETE endpoints return empty body
        if resp.content:
            return resp.json()
        return {}

    # ── Decisions ─────────────────────────────────────────────────────────

    async def get_decisions(
        self,
        ip: str | None = None,
        scenario: str | None = None,
        type_: str | None = None,
    ) -> list[dict]:
        """[LAPI] GET /v1/decisions — list active bans and captchas.

        On real CrowdSec failure or circuit-open, return an empty list so
        the UI keeps working.
        """
        try:
            params = {}
            if ip:
                params["ip"] = ip
            if scenario:
                params["scenario"] = scenario
            if type_:
                params["type"] = type_
            result = await self._request("GET", "/v1/decisions", params=params)
            decisions = result if isinstance(result, list) else []
        except (CrowdSecUnavailable, Exception):
            # Any failure (including breaker-open) → return empty list
            # rather than escalating. The WS endpoint still works.
            return []  # type: ignore[return-value]  # only enrich below if real
        # Apply filters
        if ip:
            decisions = [d for d in decisions if d.get("ip") == ip]
        if scenario:
            decisions = [d for d in decisions if scenario in str(d.get("scenario", ""))]
        if type_:
            decisions = [d for d in decisions if d.get("type") == type_]  # type: ignore[operator]  # noqa: E501

        # ── GeoIP enrichment (silencioso, never breaks the endpoint) ──────
        # CrowdSec ya provee country y as_name. GeoIP agrega city, lat/lon,
        # network_type, is_datacenter, is_tor al campo "geo" de cada decisión.
        try:
            from services.geoip_service import GeoIPService
            ips = list({d["ip"] for d in decisions if d.get("ip")})
            if ips:
                geo_results = GeoIPService.lookup_bulk(ips)
                geo_map = {r["ip"]: r for r in geo_results}
                for d in decisions:
                    d_ip = d.get("ip", "")
                    if d_ip in geo_map:
                        g = geo_map[d_ip]
                        d["geo"] = {
                            "city": g.get("city"),
                            "latitude": g.get("latitude"),
                            "longitude": g.get("longitude"),
                            "network_type": g.get("network_type"),
                            "is_datacenter": g.get("is_datacenter", False),
                            "is_tor": g.get("is_tor", False),
                            "raw_available": g.get("raw_available", False),
                        }
        except Exception as _geo_err:
            logger.debug("crowdsec.geo_enrichment_skipped", error=str(_geo_err))

        return decisions

    async def get_decisions_stream(self, startup: bool = False) -> dict:
        """[LAPI] GET /v1/decisions/stream — incremental decision updates."""
        params = {"startup": "true"} if startup else {}
        result = await self._request("GET", "/v1/decisions/stream", params=params)
        return result if isinstance(result, dict) else {"new": [], "deleted": []}

    async def add_decision(
        self,
        ip: str,
        duration: str,
        reason: str,
        type_: str = "ban",
    ) -> dict:
        """[LAPI] POST /v1/decisions — add a manual decision."""
        payload = [
            {
                "duration": duration,
                "ip": ip,
                "reason": reason,
                "scenario": reason,
                "startIP": ip,
                "stopIP": ip,
                "type": type_,
                "scope": "ip",
            }
        ]
        await self._request("POST", "/v1/decisions", json=payload)
        return {"ip": ip, "type": type_, "duration": duration, "added": True}

    async def delete_decision(self, decision_id: str) -> dict:
        """[LAPI] DELETE /v1/decisions/{id} — delete a decision by ID."""
        await self._request("DELETE", f"/v1/decisions/{decision_id}")
        return {"id": decision_id, "deleted": True}

    async def delete_decisions_by_ip(self, ip: str) -> dict:
        """[LAPI] DELETE /v1/decisions — delete all decisions for an IP."""
        await self._request("DELETE", "/v1/decisions", params={"ip": ip})
        return {"ip": ip, "deleted_count": -1}  # LAPI doesn't return count

    # ── Alerts ────────────────────────────────────────────────────────────

    async def get_alerts(
        self,
        limit: int = 50,
        scenario: str | None = None,
        ip: str | None = None,
    ) -> list[dict]:
        """[LAPI] GET /v1/alerts — detected attack alerts."""
        params: dict = {"limit": str(limit)}
        if scenario:
            params["scenario"] = scenario
        if ip:
            params["ip"] = ip
        result = await self._request("GET", "/v1/alerts", params=params)
        return result if isinstance(result, list) else []

    async def get_alert_detail(self, alert_id: str) -> dict | None:
        """[LAPI] GET /v1/alerts/{id} — full alert detail with events."""
        try:
            result = await self._request("GET", f"/v1/alerts/{alert_id}")
            return result if isinstance(result, dict) else None
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 404:
                return None
            raise

    # ── Infrastructure ────────────────────────────────────────────────────

    async def get_bouncers(self) -> list[dict]:
        """[LAPI] GET /v1/bouncers — registered bouncer agents."""
        result = await self._request("GET", "/v1/bouncers")
        return result if isinstance(result, list) else []

    async def get_machines(self) -> list[dict]:
        """[LAPI] GET /v1/machines — registered CrowdSec agents."""
        result = await self._request("GET", "/v1/machines")
        return result if isinstance(result, list) else []

    # ── Derived / Computed ────────────────────────────────────────────────

    async def get_scenarios(self) -> list[dict]:
        """Returns aggregated scenario stats derived from alerts."""
        # Parse scenarios from alerts when using real LAPI
        alerts = await self.get_alerts(limit=500)
        scenario_map: dict[str, dict] = {}
        for alert in alerts:
            name = alert.get("scenario", "unknown")
            if name not in scenario_map:
                scenario_map[name] = {
                    "name": name,
                    "description": f"Detected by {name}",
                    "alerts_count": 0,
                    "last_triggered": alert.get("stop_at", ""),
                    "trend": "stable",
                }
            scenario_map[name]["alerts_count"] += 1
        return sorted(scenario_map.values(), key=lambda s: s["alerts_count"], reverse=True)

    async def get_metrics(self) -> dict:
        """Aggregated attack metrics computed from decisions + alerts."""
        decisions = await self.get_decisions()
        alerts = await self.get_alerts(limit=500)
        bouncers = await self.get_bouncers()
        scenarios = await self.get_scenarios()
        country_map: dict[str, int] = {}
        for alert in alerts:
            country = alert.get("source_country", "XX")
            country_map[country] = country_map.get(country, 0) + 1
        top_countries = [
            {"country": k, "code": k, "count": v, "pct": round(v * 100 / max(len(alerts), 1))}
            for k, v in sorted(country_map.items(), key=lambda x: x[1], reverse=True)[:10]
        ]
        top_scenario = scenarios[0] if scenarios else {}
        return {
            "active_decisions": len(decisions),
            "alerts_24h": len(alerts),
            "scenarios_active": len(scenarios),
            "bouncers_connected": sum(1 for b in bouncers if b.get("status") == "connected"),
            "top_countries": top_countries,
            "top_scenario": top_scenario,
            "decisions_per_hour": [],
        }

    # ── CTI ───────────────────────────────────────────────────────────────

    async def get_cti_score(self, ip: str) -> dict:
        """Community Threat Intelligence score for an IP address."""
        # CrowdSec CTI public API (no auth needed for basic lookup)
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(f"https://cti.api.crowdsec.net/v2/smoke/{ip}")
                if resp.status_code == 200:
                    data = resp.json()
                    return {
                        "community_score": data.get("scores", {}).get("overall", {}).get("total", 0),
                        "is_known_attacker": data.get("scores", {}).get("overall", {}).get("total", 0) > 50,
                        "reported_by": data.get("references", [{}])[0].get("count", 0) if data.get("references") else 0,
                        "background_noise": data.get("background_noise", False),
                        "classifications": [t.get("label", "") for t in data.get("classifications", {}).get("classifications", [])],
                    }
        except Exception as e:
            logger.debug("crowdsec_cti_unavailable", ip=ip, error=str(e))
        return {
            "community_score": 0,
            "is_known_attacker": False,
            "reported_by": 0,
            "background_noise": False,
            "classifications": [],
        }

    # ── Hub ───────────────────────────────────────────────────────────────

    async def get_hub_status(self) -> dict:
        """[cscli] Hub collections and parsers status (read from LAPI where available)."""
        # Real LAPI doesn't have a hub endpoint — returns static info
        return {
            "collections": [],
            "parsers": [],
            "note": "Hub status not available via LAPI. Run 'cscli hub list' on the server.",
        }

    # ── Sync helpers ─────────────────────────────────────────────────────

    async def get_sync_status(self, mikrotik_ips: set[str]) -> dict:
        """Compare CrowdSec decisions with MikroTik blacklist."""
        decisions = await self.get_decisions()
        crowdsec_ips = {d["ip"] for d in decisions if d["type"] == "ban"}
        only_crowdsec = sorted(crowdsec_ips - mikrotik_ips)
        only_mikrotik = sorted(mikrotik_ips - crowdsec_ips)
        synced = sorted(crowdsec_ips & mikrotik_ips)
        return {
            "in_sync": len(only_crowdsec) == 0 and len(only_mikrotik) == 0,
            "only_in_crowdsec": only_crowdsec,
            "only_in_mikrotik": only_mikrotik,
            "synced_ips": synced,
            "synced_count": len(synced),
            "total_crowdsec": len(crowdsec_ips),
            "total_mikrotik": len(mikrotik_ips),
        }

    # ── IP Context (unified) ──────────────────────────────────────────────

    async def get_ip_context_crowdsec(self, ip: str) -> dict:
        """CrowdSec portion of the unified IP context response."""
        decisions = await self.get_decisions(ip=ip)
        alerts = await self.get_alerts(ip=ip, limit=5)
        cti = await self.get_cti_score(ip)
        return {
            "decisions": decisions,
            "alerts": alerts,
            **cti,
            "country": decisions[0].get("country", "") if decisions else "",
            "as_name": decisions[0].get("as_name", "") if decisions else "",
        }


def get_crowdsec_service() -> CrowdSecService:
    """Return the singleton CrowdSecService instance."""
    return CrowdSecService()
