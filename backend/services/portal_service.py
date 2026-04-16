"""
Portal Service — MikroTik Hotspot management singleton.

Design decisions:
- Singleton pattern: reuses MikroTikService singleton for all RouterOS calls.
  Does NOT create a second connection — calls _api_call() via composition.
- Session history cache: maintains in-memory snapshot history (last 2 hours,
  per-minute) for the real-time chart without hitting MikroTik on every render.
- Guard clause: all public methods (except check_hotspot_status and setup)
  raise HotspotNotInitializedError if the Hotspot server doesn't exist.
- [MikroTik API] annotations on every method document the RouterOS path used.

RouterOS Hotspot API paths used:
  /ip/hotspot/server         — server config
  /ip/hotspot/profile        — server profiles (login page settings)
  /ip/hotspot/active         — active sessions (live data)
  /ip/hotspot/host           — all known hosts (includes session history)
  /ip/hotspot/user           — registered users
  /ip/hotspot/user/profile   — speed profiles
  /ip/firewall/filter        — for schedule rules with time matching
"""

from __future__ import annotations

import asyncio
import time
from collections import deque
from datetime import datetime, timedelta
from typing import Any

import structlog

from config import get_settings

logger = structlog.get_logger(__name__)

# ── Custom Exceptions ─────────────────────────────────────────────

HOTSPOT_NOT_INITIALIZED_ERROR = (
    "Hotspot no inicializado. Ejecutá el setup desde "
    "Configuración → Inicializar Hotspot"
)


class HotspotNotInitializedError(RuntimeError):
    def __init__(self):
        super().__init__(HOTSPOT_NOT_INITIALIZED_ERROR)


# ── Data Structures ───────────────────────────────────────────────

class SessionSnapshot:
    """Single point in the sessions-over-time history."""
    __slots__ = ("timestamp", "registered", "unregistered")

    def __init__(self, timestamp: float, registered: int, unregistered: int):
        self.timestamp = timestamp
        self.registered = registered
        self.unregistered = unregistered


# ── Service ───────────────────────────────────────────────────────

class PortalService:
    """
    Singleton service for MikroTik Hotspot (Portal Cautivo) management.
    Delegates all RouterOS API calls to MikroTikService._api_call().
    """

    _instance: PortalService | None = None

    def __new__(cls) -> PortalService:
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def __init__(self) -> None:
        if self._initialized:
            return
        self._initialized = True
        self._settings = get_settings()
        # Circular buffer: last 2 hours of per-minute session snapshots (120 points)
        self._session_history: deque[SessionSnapshot] = deque(maxlen=120)
        self._last_snapshot_time: float = 0.0

    def _get_mikrotik(self):
        """Get the MikroTik service singleton (lazy import to avoid circulars)."""
        from services.mikrotik_service import get_mikrotik_service
        return get_mikrotik_service()

    async def _api_call(self, path: str, command: str = "print", **kwargs: Any) -> list[dict]:
        """Delegate to MikroTikService._api_call()."""
        return await self._get_mikrotik()._api_call(path, command, **kwargs)

    # ── Guard ─────────────────────────────────────────────────────

    async def _require_hotspot(self) -> None:
        """
        Raises HotspotNotInitializedError if the Hotspot server doesn't exist.
        Called at the top of every public method that requires an initialized Hotspot.
        """
        status = await self.check_hotspot_status()
        if not status["initialized"]:
            raise HotspotNotInitializedError()

    # ── Status ────────────────────────────────────────────────────

    async def check_hotspot_status(self) -> dict:
        """
        [MikroTik API] Check if Hotspot server is configured.
        Resource: /ip/hotspot/server
        Returns: {initialized: bool, server_name: str, interface: str}
        """
        if self._settings.should_mock_mikrotik:
            return {
                "initialized": True,
                "server_name": "hotspot-demo",
                "interface": "ether2",
                "address_pool": "hs-pool-3",
                "profile": "hsprof1",
                "mock": True,
            }
        try:
            servers = await self._api_call("/ip/hotspot/server")
            if servers:
                s = servers[0]
                return {
                    "initialized": True,
                    "server_name": s.get("name", ""),
                    "interface": s.get("interface", ""),
                    "address_pool": s.get("address-pool", ""),
                    "profile": s.get("profile", ""),
                }
            return {"initialized": False, "server_name": "", "interface": "", "address_pool": "", "profile": ""}
        except Exception as e:
            logger.error("portal_check_hotspot_status_failed", error=str(e))
            return {"initialized": False, "server_name": "", "interface": "", "address_pool": "", "profile": ""}

    # ── Sessions ──────────────────────────────────────────────────

    async def get_active_sessions(self) -> list[dict]:
        """
        [MikroTik API] Get all active Hotspot sessions.
        Resource: /ip/hotspot/active
        Returns normalized list with registered/unregistered status.
        """
        if self._settings.should_mock_mikrotik:
            from services.mock_data import MockData
            return MockData.portal.active_sessions()
        await self._require_hotspot()
        try:
            active = await self._api_call("/ip/hotspot/active")
            # Get set of registered usernames to determine status
            users = await self._api_call("/ip/hotspot/user")
            registered_names = {
                u.get("name", "") for u in users
                if u.get("name", "") not in ("", "default")
            }

            result = []
            for session in active:
                user = session.get("user", "")
                # Parse bytes
                bytes_in = self._parse_bytes(session.get("bytes-in", "0"))
                bytes_out = self._parse_bytes(session.get("bytes-out", "0"))
                result.append({
                    "user": user,
                    "ip": session.get("address", ""),
                    "mac": session.get("mac-address", ""),
                    "uptime": session.get("uptime", ""),
                    "bytes_in": bytes_in,
                    "bytes_out": bytes_out,
                    "rate_limit": session.get("rate-limit", ""),
                    "status": "registered" if user in registered_names else "unregistered",
                    "login_time": session.get("login-time", ""),
                })

            # Take a snapshot for history chart (max 1 per minute)
            now = time.time()
            if now - self._last_snapshot_time >= 60:
                reg = sum(1 for s in result if s["status"] == "registered")
                unreg = len(result) - reg
                self._session_history.append(SessionSnapshot(now, reg, unreg))
                self._last_snapshot_time = now

            logger.debug("portal_active_sessions_fetched", count=len(result))
            return result
        except HotspotNotInitializedError:
            raise
        except Exception as e:
            logger.error("portal_get_active_sessions_failed", error=str(e))
            raise

    def get_session_chart_history(self) -> list[dict]:
        """
        Return in-memory session snapshots (last 2 hours, per-minute).
        Used for the real-time line chart on the Monitor tab.
        No RouterOS call needed — data is collected as a side effect of get_active_sessions().
        """
        return [
            {
                "timestamp": datetime.fromtimestamp(s.timestamp).strftime("%H:%M"),
                "registered": s.registered,
                "unregistered": s.unregistered,
            }
            for s in self._session_history
        ]

    async def get_session_history(
        self,
        from_date: str | None = None,
        to_date: str | None = None,
        user: str | None = None,
        limit: int = 100,
    ) -> list[dict]:
        """
        [MikroTik API] Get session history from /ip/hotspot/host.
        The host table keeps records of all devices that connected, including
        past sessions with login/logout times.
        Resource: /ip/hotspot/host
        """
        if self._settings.should_mock_mikrotik:
            from services.mock_data import MockData
            history = MockData.portal.session_history(limit=limit)
            if user:
                history = [h for h in history if user.lower() in h["user"].lower()]
            return [
                {
                    "user": h["user"],
                    "mac": h["mac"],
                    "ip": h["address"],
                    "login_time": h["from"],
                    "logout_time": h["till"],
                    "duration": h["uptime"],
                    "bytes_in": h["bytes_in"],
                    "bytes_out": h["bytes_out"],
                }
                for h in history
            ]
        await self._require_hotspot()
        try:
            hosts = await self._api_call("/ip/hotspot/host")
            result = []
            for host in hosts:
                host_user = host.get("to-address", host.get("mac-address", ""))
                if user and user.lower() not in host_user.lower():
                    continue
                result.append({
                    "user": host.get("to-address", ""),
                    "mac": host.get("mac-address", ""),
                    "ip": host.get("address", ""),
                    "login_time": host.get("login-time", ""),
                    "logout_time": host.get("logout-time", ""),
                    "duration": host.get("uptime", ""),
                    "bytes_in": self._parse_bytes(host.get("bytes-in", "0")),
                    "bytes_out": self._parse_bytes(host.get("bytes-out", "0")),
                })
            # Sort by login_time descending and limit
            result = result[:limit]
            logger.debug("portal_session_history_fetched", count=len(result))
            return result
        except HotspotNotInitializedError:
            raise
        except Exception as e:
            logger.error("portal_get_session_history_failed", error=str(e))
            raise

    async def get_realtime_stats(self) -> dict:
        """
        [MikroTik API] Aggregate real-time stats from active sessions.
        Resource: /ip/hotspot/active
        """
        if self._settings.should_mock_mikrotik:
            from services.mock_data import MockData
            return MockData.portal.realtime_stats()
        await self._require_hotspot()
        try:
            sessions = await self.get_active_sessions()
            registered = [s for s in sessions if s["status"] == "registered"]
            unregistered = [s for s in sessions if s["status"] == "unregistered"]

            total_bw_in = sum(s["bytes_in"] for s in sessions)
            total_bw_out = sum(s["bytes_out"] for s in sessions)

            # Determine peak hour from snapshot history
            peak_hour = self._calculate_peak_hour_today()

            return {
                "total_sessions_active": len(sessions),
                "registered_users_online": len(registered),
                "unregistered_users_online": len(unregistered),
                "total_bandwidth_in": total_bw_in,
                "total_bandwidth_out": total_bw_out,
                "peak_hour_today": peak_hour,
            }
        except HotspotNotInitializedError:
            raise
        except Exception as e:
            logger.error("portal_get_realtime_stats_failed", error=str(e))
            raise

    async def get_summary_stats(self) -> dict:
        """
        [MikroTik API] Aggregated historical statistics.
        Fetches from /ip/hotspot/host and /ip/hotspot/user for aggregation.
        """
        if self._settings.should_mock_mikrotik:
            from services.mock_data import MockData
            raw = MockData.portal.summary_stats()
            # Map mock shape → shape expected by StatsView
            return {
                "unique_users_today": raw.get("sessions_today", 15),
                "unique_users_week": raw.get("sessions_this_week", 87),
                "unique_users_month": raw.get("total_unique_users", 23),
                "avg_session_duration_seconds": 3600,
                "top_by_data": [
                    {"user": u["user"], "bytes_total": u["total_bytes_in"], "sessions": u["session_count"]}
                    for u in raw.get("top_users", [])
                ],
                "top_by_time": [
                    {"user": u["user"], "total_uptime_seconds": u["session_count"] * 3600, "sessions": u["session_count"]}
                    for u in raw.get("top_users", [])
                ],
                "new_registrations_30d": [
                    {"date": f"2026-03-{(i+1):02d}", "count": (i % 3) + 1}
                    for i in range(15)
                ],
                "peak_by_day": raw.get("heatmap", []),
            }
        await self._require_hotspot()
        try:
            hosts = await self._api_call("/ip/hotspot/host")
            users = await self._api_call("/ip/hotspot/user")

            now = datetime.now()
            today = now.date()
            week_ago = now - timedelta(days=7)
            month_ago = now - timedelta(days=30)

            # Aggregate by user
            user_data: dict[str, dict] = {}
            unique_today: set[str] = set()
            unique_week: set[str] = set()
            unique_month: set[str] = set()

            for host in hosts:
                host_user = host.get("to-address", host.get("mac-address", "unknown"))
                if not host_user:
                    continue
                bytes_in = self._parse_bytes(host.get("bytes-in", "0"))
                bytes_out = self._parse_bytes(host.get("bytes-out", "0"))
                uptime_s = self._parse_uptime_seconds(host.get("uptime", "0s"))
                login_str = host.get("login-time", "")
                login_dt = self._parse_mikrotik_datetime(login_str)

                if host_user not in user_data:
                    user_data[host_user] = {"bytes_total": 0, "uptime_s": 0, "sessions": 0}
                user_data[host_user]["bytes_total"] += bytes_in + bytes_out
                user_data[host_user]["uptime_s"] += uptime_s
                user_data[host_user]["sessions"] += 1

                if login_dt:
                    if login_dt.date() == today:
                        unique_today.add(host_user)
                    if login_dt >= week_ago:
                        unique_week.add(host_user)
                    if login_dt >= month_ago:
                        unique_month.add(host_user)

            # Top 10 by data
            top_by_data = sorted(
                [{"user": u, "bytes_total": d["bytes_total"], "sessions": d["sessions"]}
                 for u, d in user_data.items()],
                key=lambda x: x["bytes_total"], reverse=True
            )[:10]

            # Top 10 by time
            top_by_time = sorted(
                [{"user": u, "total_uptime_seconds": d["uptime_s"], "sessions": d["sessions"]}
                 for u, d in user_data.items()],
                key=lambda x: x["total_uptime_seconds"], reverse=True
            )[:10]

            # Average session duration
            all_uptimes = [d["uptime_s"] for d in user_data.values() if d["uptime_s"] > 0]
            avg_duration = int(sum(all_uptimes) / len(all_uptimes)) if all_uptimes else 0

            # New registrations per day (last 30 days from local registry)
            new_regs = await self._get_new_registrations_30d()

            # Peak by day/hour for heatmap (from snapshot history)
            peak_by_day = self._build_peak_heatmap()

            return {
                "unique_users_today": len(unique_today),
                "unique_users_week": len(unique_week),
                "unique_users_month": len(unique_month),
                "avg_session_duration_seconds": avg_duration,
                "top_by_data": top_by_data,
                "top_by_time": top_by_time,
                "new_registrations_30d": new_regs,
                "peak_by_day": peak_by_day,
            }
        except HotspotNotInitializedError:
            raise
        except Exception as e:
            logger.error("portal_get_summary_stats_failed", error=str(e))
            raise

    # ── Users ─────────────────────────────────────────────────────

    async def get_users(
        self,
        search: str | None = None,
        profile: str | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list[dict]:
        """
        [MikroTik API] List registered hotspot users.
        Resource: /ip/hotspot/user
        Enriched with last_seen from /ip/hotspot/host and local DB metadata.
        """
        if self._settings.should_mock_mikrotik:
            from services.mock_data import MockData
            users = MockData.portal.users()
            if search:
                s = search.lower()
                users = [u for u in users if s in u["name"].lower()]
            if profile:
                users = [u for u in users if u["profile"] == profile]
            # Normalise to the same schema as the real path
            result = [
                {
                    "name": u["name"],
                    "profile": u["profile"],
                    "mac_address": "",
                    "limit_uptime": u.get("uptime_limit", ""),
                    "limit_bytes_total": "",
                    "disabled": u.get("disabled", False),
                    "comment": u.get("comment", ""),
                    "last_seen": "",
                    "total_sessions": 0,
                    "created_at": None,
                    "created_by": "mock",
                }
                for u in users
            ]
            return result[offset:offset + limit]
        await self._require_hotspot()
        try:
            users = await self._api_call("/ip/hotspot/user")
            hosts = await self._api_call("/ip/hotspot/host")

            # Build last_seen map: username -> last login time
            last_seen_map: dict[str, str] = {}
            sessions_map: dict[str, int] = {}
            for host in hosts:
                host_user = host.get("to-address", "")
                if host_user:
                    login = host.get("login-time", "")
                    if host_user not in last_seen_map or login > last_seen_map[host_user]:
                        last_seen_map[host_user] = login
                    sessions_map[host_user] = sessions_map.get(host_user, 0) + 1

            # Get local registry metadata
            registry_map = await self._get_registry_map()

            result = []
            for user in users:
                name = user.get("name", "")
                if name in ("", "default"):
                    continue
                if search and search.lower() not in name.lower() and search.lower() not in user.get("mac-address", "").lower():
                    continue
                if profile and user.get("profile", "") != profile:
                    continue
                reg = registry_map.get(name, {})
                result.append({
                    "name": name,
                    "profile": user.get("profile", "registered"),
                    "mac_address": user.get("mac-address", ""),
                    "limit_uptime": user.get("limit-uptime", ""),
                    "limit_bytes_total": user.get("limit-bytes-total", ""),
                    "disabled": user.get("disabled", "false") == "true",
                    "comment": user.get("comment", ""),
                    "last_seen": last_seen_map.get(name, ""),
                    "total_sessions": sessions_map.get(name, 0),
                    "created_at": reg.get("created_at"),
                    "created_by": reg.get("created_by"),
                })

            # Paginate
            result = result[offset:offset + limit]
            logger.debug("portal_users_fetched", count=len(result))
            return result
        except HotspotNotInitializedError:
            raise
        except Exception as e:
            logger.error("portal_get_users_failed", error=str(e))
            raise

    async def create_user(self, data: dict, created_by: str = "admin") -> dict:
        """
        [MikroTik API] Create a new hotspot user.
        Resource: /ip/hotspot/user add ...
        Also records creation metadata in local PortalUserRegistry.
        """
        await self._require_hotspot()
        try:
            kwargs: dict[str, str] = {
                "name": data["name"],
                "password": data["password"],
                "profile": data.get("profile", "registered"),
            }
            if data.get("mac_address"):
                kwargs["mac_address"] = data["mac_address"]
            if data.get("limit_uptime"):
                kwargs["limit_uptime"] = data["limit_uptime"]
            if data.get("limit_bytes_total"):
                kwargs["limit_bytes_total"] = data["limit_bytes_total"]
            if data.get("comment"):
                kwargs["comment"] = data["comment"]

            result_id = await self._api_call("/ip/hotspot/user", command="add", **kwargs)
            await self._save_registry_entry(data["name"], created_by)
            logger.info("portal_user_created", name=data["name"], profile=kwargs["profile"])
            return {"id": result_id, "name": data["name"], "action": "created"}
        except HotspotNotInitializedError:
            raise
        except Exception as e:
            logger.error("portal_create_user_failed", name=data.get("name"), error=str(e))
            raise

    async def update_user(self, username: str, data: dict) -> dict:
        """
        [MikroTik API] Update an existing hotspot user.
        Resource: /ip/hotspot/user set ...
        """
        await self._require_hotspot()
        try:
            # Find user ID first
            users = await self._api_call("/ip/hotspot/user")
            user_id = None
            for u in users:
                if u.get("name") == username:
                    user_id = u.get(".id")
                    break
            if not user_id:
                raise ValueError(f"User '{username}' not found")

            kwargs: dict[str, str] = {"id": user_id}
            field_map = {
                "profile": "profile",
                "password": "password",
                "mac_address": "mac_address",
                "limit_uptime": "limit_uptime",
                "limit_bytes_total": "limit_bytes_total",
                "comment": "comment",
            }
            for key, api_key in field_map.items():
                if data.get(key) is not None:
                    kwargs[api_key] = str(data[key])
            if data.get("disabled") is not None:
                kwargs["disabled"] = "yes" if data["disabled"] else "no"

            await self._api_call("/ip/hotspot/user", command="set", **kwargs)
            logger.info("portal_user_updated", username=username)
            return {"username": username, "action": "updated"}
        except HotspotNotInitializedError:
            raise
        except Exception as e:
            logger.error("portal_update_user_failed", username=username, error=str(e))
            raise

    async def delete_user(self, username: str) -> dict:
        """
        [MikroTik API] Delete a hotspot user.
        Resource: /ip/hotspot/user remove ...
        Also removes local PortalUserRegistry entry.
        """
        await self._require_hotspot()
        try:
            users = await self._api_call("/ip/hotspot/user")
            user_id = None
            for u in users:
                if u.get("name") == username:
                    user_id = u.get(".id")
                    break
            if not user_id:
                raise ValueError(f"User '{username}' not found")

            await self._api_call("/ip/hotspot/user", command="remove", id=user_id)
            await self._delete_registry_entry(username)
            logger.info("portal_user_deleted", username=username)
            return {"username": username, "action": "deleted"}
        except HotspotNotInitializedError:
            raise
        except Exception as e:
            logger.error("portal_delete_user_failed", username=username, error=str(e))
            raise

    async def disconnect_user(self, username: str) -> dict:
        """
        [MikroTik API] Force-disconnect a user's active session.
        Resource: /ip/hotspot/active remove ...
        Finds all active sessions for the user and removes them.
        """
        await self._require_hotspot()
        try:
            active = await self._api_call("/ip/hotspot/active")
            disconnected = []
            for session in active:
                if session.get("user") == username:
                    session_id = session.get(".id")
                    if session_id:
                        await self._api_call("/ip/hotspot/active", command="remove", id=session_id)
                        disconnected.append(session_id)

            logger.info("portal_user_disconnected", username=username, sessions=len(disconnected))
            return {"username": username, "sessions_disconnected": len(disconnected), "action": "disconnected"}
        except HotspotNotInitializedError:
            raise
        except Exception as e:
            logger.error("portal_disconnect_user_failed", username=username, error=str(e))
            raise

    async def bulk_create_users(self, users: list[dict], created_by: str = "admin") -> dict:
        """
        [MikroTik API] Create multiple hotspot users in sequence.
        Resource: /ip/hotspot/user add (repeated)
        Returns a detailed report of successes and failures.
        """
        await self._require_hotspot()
        errors = []
        success_count = 0
        for user_data in users:
            try:
                await self.create_user(user_data, created_by=created_by)
                success_count += 1
            except Exception as e:
                errors.append({"username": user_data.get("name", "?"), "error": str(e)})
                logger.warning("portal_bulk_create_user_failed", name=user_data.get("name"), error=str(e))

        logger.info("portal_bulk_create_completed", total=len(users), success=success_count, failed=len(errors))
        return {
            "total": len(users),
            "success_count": success_count,
            "failed_count": len(errors),
            "errors": errors,
        }

    # ── Profiles ──────────────────────────────────────────────────

    async def get_profiles(self) -> list[dict]:
        """
        [MikroTik API] List all hotspot user speed profiles.
        Resource: /ip/hotspot/user/profile
        """
        if self._settings.should_mock_mikrotik:
            from services.mock_data import MockData
            raw = MockData.portal.profiles()
            return [
                {
                    "name": p["name"],
                    "rate_limit": p["rate_limit"],
                    "rate_limit_up": p["rate_limit"].split("/")[0].strip() if "/" in p["rate_limit"] else p["rate_limit"],
                    "rate_limit_down": p["rate_limit"].split("/")[1].strip() if "/" in p["rate_limit"] else p["rate_limit"],
                    "session_timeout": p.get("session_timeout", ""),
                    "idle_timeout": p.get("idle_timeout", ""),
                    "is_unregistered": p["name"] == "unregistered",
                }
                for p in raw
            ]
        await self._require_hotspot()
        try:
            profiles = await self._api_call("/ip/hotspot/user/profile")
            result = []
            for p in profiles:
                name = p.get("name", "")
                rate_limit = p.get("rate-limit", "")
                # Parse "up/down" format if present
                parts = rate_limit.split("/") if "/" in rate_limit else [rate_limit, rate_limit]
                result.append({
                    "name": name,
                    "rate_limit": rate_limit,
                    "rate_limit_up": parts[0].strip() if parts else "",
                    "rate_limit_down": parts[1].strip() if len(parts) > 1 else "",
                    "session_timeout": p.get("session-timeout", ""),
                    "idle_timeout": p.get("idle-timeout", ""),
                    "is_unregistered": name == "unregistered",
                })
            logger.debug("portal_profiles_fetched", count=len(result))
            return result
        except HotspotNotInitializedError:
            raise
        except Exception as e:
            logger.error("portal_get_profiles_failed", error=str(e))
            raise

    async def create_profile(self, data: dict) -> dict:
        """
        [MikroTik API] Create a new speed profile.
        Resource: /ip/hotspot/user/profile add ...
        """
        await self._require_hotspot()
        try:
            rate_limit = f"{data['rate_limit_up']}/{data['rate_limit_down']}"
            kwargs: dict[str, str] = {
                "name": data["name"],
                "rate_limit": rate_limit,
            }
            if data.get("session_timeout"):
                kwargs["session_timeout"] = data["session_timeout"]
            if data.get("idle_timeout"):
                kwargs["idle_timeout"] = data["idle_timeout"]

            result_id = await self._api_call("/ip/hotspot/user/profile", command="add", **kwargs)
            logger.info("portal_profile_created", name=data["name"])
            return {"id": result_id, "name": data["name"], "action": "created"}
        except HotspotNotInitializedError:
            raise
        except Exception as e:
            logger.error("portal_create_profile_failed", name=data.get("name"), error=str(e))
            raise

    async def update_profile(self, name: str, data: dict) -> dict:
        """
        [MikroTik API] Update an existing speed profile.
        Resource: /ip/hotspot/user/profile set ...
        """
        await self._require_hotspot()
        try:
            profiles = await self._api_call("/ip/hotspot/user/profile")
            profile_id = None
            for p in profiles:
                if p.get("name") == name:
                    profile_id = p.get(".id")
                    break
            if not profile_id:
                raise ValueError(f"Profile '{name}' not found")

            kwargs: dict[str, str] = {"id": profile_id}
            if data.get("rate_limit_up") and data.get("rate_limit_down"):
                kwargs["rate_limit"] = f"{data['rate_limit_up']}/{data['rate_limit_down']}"
            elif data.get("rate_limit_up"):
                kwargs["rate_limit"] = data["rate_limit_up"]
            if data.get("session_timeout") is not None:
                kwargs["session_timeout"] = data["session_timeout"]
            if data.get("idle_timeout") is not None:
                kwargs["idle_timeout"] = data["idle_timeout"]

            await self._api_call("/ip/hotspot/user/profile", command="set", **kwargs)
            logger.info("portal_profile_updated", name=name)
            return {"name": name, "action": "updated"}
        except HotspotNotInitializedError:
            raise
        except Exception as e:
            logger.error("portal_update_profile_failed", name=name, error=str(e))
            raise

    async def update_unregistered_speed(self, rate_limit_up: str, rate_limit_down: str) -> dict:
        """
        [MikroTik API] Update the 'unregistered' profile speed limits.
        Resource: /ip/hotspot/user/profile set unregistered rate-limit=...
        This is the most commonly used action — used as a quick toggle.
        """
        return await self.update_profile("unregistered", {
            "rate_limit_up": rate_limit_up,
            "rate_limit_down": rate_limit_down,
        })

    # ── Hotspot Config ────────────────────────────────────────────

    async def get_hotspot_config(self) -> dict:
        """
        [MikroTik API] Get current Hotspot server + profile configuration.
        Resources: /ip/hotspot/server + /ip/hotspot/profile
        """
        if self._settings.should_mock_mikrotik:
            from services.mock_data import MockData
            return MockData.portal.hotspot_config()
        await self._require_hotspot()
        try:
            servers = await self._api_call("/ip/hotspot/server")
            profiles = await self._api_call("/ip/hotspot/profile")

            config: dict = {"hotspot_initialized": True}
            if servers:
                s = servers[0]
                config.update({
                    "server_name": s.get("name", ""),
                    "interface": s.get("interface", ""),
                    "address_pool": s.get("address-pool", ""),
                    "profile": s.get("profile", ""),
                    "idle_timeout": s.get("idle-timeout", ""),
                    "addresses_per_mac": int(s.get("addresses-per-mac", 2)),
                })
            if profiles:
                p = profiles[0]
                config["login_by"] = p.get("login-by", "")

            return config
        except HotspotNotInitializedError:
            raise
        except Exception as e:
            logger.error("portal_get_hotspot_config_failed", error=str(e))
            raise

    # ── Schedule ──────────────────────────────────────────────────

    async def setup_schedule(
        self,
        enabled: bool,
        hour_from: str,
        hour_to: str,
        blocked_days: list[str],
        scope: str = "all",
    ) -> dict:
        """
        [MikroTik API] Configure hotspot access schedule via firewall rules.
        Resource: /ip/firewall/filter with 'time' matching.

        Strategy:
        - Remove existing rules with comment 'netshield-hotspot-schedule'
        - If enabled=True: add new rules with time/day restrictions
        - scope='all': applies to all traffic on hotspot interface
        - scope='unregistered': applies only to traffic tagged by hotspot MAC
        
        MANUAL FALLBACK (WinBox):
        /ip firewall filter add chain=forward action=drop time=22:00:00-07:00:00
          comment=netshield-hotspot-schedule in-interface=ether2
        """
        if self._settings.should_mock_mikrotik:
            logger.info("portal_schedule_mock", enabled=enabled, hour_from=hour_from, hour_to=hour_to)
            return {
                "action": "configured" if enabled else "disabled",
                "rules_added": 2 if enabled else 0,
                "rules_removed": 1,
                "mock": True,
                "message": "Horario configurado en modo demo. No se realizaron cambios en el MikroTik real.",
            }
        try:
            existing = await self._api_call("/ip/firewall/filter")
            for rule in existing:
                if rule.get("comment", "") == "netshield-hotspot-schedule":
                    rule_id = rule.get(".id")
                    if rule_id:
                        await self._api_call("/ip/firewall/filter", command="remove", id=rule_id)
            
            removed_count = sum(
                1 for r in existing
                if r.get("comment", "") == "netshield-hotspot-schedule"
            )
            
            if not enabled:
                logger.info("portal_schedule_disabled", rules_removed=removed_count)
                return {"action": "disabled", "rules_removed": removed_count}

            # Build time range (RouterOS format: HH:MM:SS-HH:MM:SS)
            from_time = f"{hour_from}:00" if len(hour_from.split(":")) == 2 else hour_from
            to_time = f"{hour_to}:00" if len(hour_to.split(":")) == 2 else hour_to
            
            # RouterOS uses a block window (outside allowed = block)
            # We block from to_time to from_time (wrap around midnight)
            block_time = f"{to_time}-{from_time}"

            # Build day string
            day_map = {
                "monday": "mon", "tuesday": "tue", "wednesday": "wed",
                "thursday": "thu", "friday": "fri", "saturday": "sat", "sunday": "sun",
            }
            
            interface = self._settings.hotspot_interface
            rules_added = []

            # Add time-based block during off-hours
            time_kwargs: dict[str, str] = {
                "chain": "forward",
                "action": "drop",
                "in_interface": interface,
                "time": block_time,
                "comment": "netshield-hotspot-schedule",
            }
            rule_id = await self._api_call("/ip/firewall/filter", command="add", **time_kwargs)
            rules_added.append(str(rule_id))

            # Add day-based blocks for fully blocked days
            for day in blocked_days:
                ros_day = day_map.get(day.lower(), day.lower()[:3])
                day_kwargs: dict[str, str] = {
                    "chain": "forward",
                    "action": "drop",
                    "in_interface": interface,
                    "time": f"00:00:00-23:59:59,{ros_day}",
                    "comment": "netshield-hotspot-schedule",
                }
                day_rule_id = await self._api_call("/ip/firewall/filter", command="add", **day_kwargs)
                rules_added.append(str(day_rule_id))

            logger.info(
                "portal_schedule_configured",
                rules_added=len(rules_added),
                scope=scope,
                hour_from=hour_from,
                hour_to=hour_to,
                blocked_days=blocked_days,
            )
            return {
                "action": "enabled",
                "rules_added": len(rules_added),
                "scope": scope,
                "hour_from": hour_from,
                "hour_to": hour_to,
                "blocked_days": blocked_days,
            }
        except Exception as e:
            logger.error("portal_setup_schedule_failed", error=str(e))
            raise

    async def get_schedule(self) -> dict:
        """
        [MikroTik API] Read current schedule status from firewall rules.
        Filters rules by comment 'netshield-hotspot-schedule'.
        Resource: /ip/firewall/filter
        """
        if self._settings.should_mock_mikrotik:
            from services.mock_data import MockData
            return MockData.portal.schedule()
        try:
            rules = await self._api_call("/ip/firewall/filter")
            schedule_rules = [r for r in rules if r.get("comment", "") == "netshield-hotspot-schedule"]
            if not schedule_rules:
                return {"enabled": False, "rule_count": 0, "allowed_hours": None, "blocked_days": [], "scope": "all"}

            # Parse first time rule to extract hours
            hour_from, hour_to = "", ""
            blocked_days = []
            for rule in schedule_rules:
                time_str = rule.get("time", "")
                if "-" in time_str and "," not in time_str:
                    # Time range rule: "22:00:00-07:00:00"
                    parts = time_str.split("-")
                    if len(parts) == 2:
                        hour_to = parts[0][:5]
                        hour_from = parts[1][:5]
                elif "," in time_str:
                    # Day-specific rule: "00:00:00-23:59:59,mon"
                    day_part = time_str.split(",")[-1].strip()
                    day_reverse = {v: k for k, v in {
                        "monday": "mon", "tuesday": "tue", "wednesday": "wed",
                        "thursday": "thu", "friday": "fri", "saturday": "sat", "sunday": "sun"
                    }.items()}
                    if day_part in day_reverse:
                        blocked_days.append(day_reverse[day_part])

            return {
                "enabled": True,
                "rule_count": len(schedule_rules),
                "allowed_hours": {"hour_from": hour_from, "hour_to": hour_to} if hour_from else None,
                "blocked_days": blocked_days,
                "scope": "all",
            }
        except Exception as e:
            logger.error("portal_get_schedule_failed", error=str(e))
            return {"enabled": False, "rule_count": 0, "allowed_hours": None, "blocked_days": [], "scope": "all"}

    # ── Private Helpers ───────────────────────────────────────────

    def _parse_bytes(self, value: str) -> int:
        """Parse MikroTik byte values (e.g. '1234' or '1.2M')."""
        try:
            if not value:
                return 0
            value = str(value).strip()
            if value.endswith("k") or value.endswith("K"):
                return int(float(value[:-1]) * 1024)
            if value.endswith("M"):
                return int(float(value[:-1]) * 1024 * 1024)
            if value.endswith("G"):
                return int(float(value[:-1]) * 1024 * 1024 * 1024)
            return int(float(value))
        except (ValueError, TypeError):
            return 0

    def _parse_uptime_seconds(self, uptime: str) -> int:
        """Parse RouterOS uptime string (e.g. '1d2h3m4s') to seconds."""
        total = 0
        try:
            current = ""
            for char in uptime:
                if char.isdigit():
                    current += char
                elif char == "d":
                    total += int(current) * 86400
                    current = ""
                elif char == "h":
                    total += int(current) * 3600
                    current = ""
                elif char == "m":
                    total += int(current) * 60
                    current = ""
                elif char == "s":
                    total += int(current)
                    current = ""
        except (ValueError, IndexError):
            pass
        return total

    def _parse_mikrotik_datetime(self, dt_str: str) -> datetime | None:
        """Parse RouterOS datetime string (e.g. 'jan/02/2024 14:30:00')."""
        if not dt_str:
            return None
        formats = [
            "%b/%d/%Y %H:%M:%S",
            "%b/%d/%Y %H:%M",
            "%Y-%m-%d %H:%M:%S",
        ]
        month_map = {
            "jan": "Jan", "feb": "Feb", "mar": "Mar", "apr": "Apr",
            "may": "May", "jun": "Jun", "jul": "Jul", "aug": "Aug",
            "sep": "Sep", "oct": "Oct", "nov": "Nov", "dec": "Dec",
        }
        # Normalize month abbreviation
        dt_normalized = dt_str
        for short, proper in month_map.items():
            dt_normalized = dt_normalized.replace(short + "/", proper + "/")
        for fmt in formats:
            try:
                return datetime.strptime(dt_normalized, fmt)
            except ValueError:
                continue
        return None

    def _calculate_peak_hour_today(self) -> str:
        """Find the hour with the most simultaneous sessions today from in-memory history."""
        today = datetime.now().date()
        hour_counts: dict[int, int] = {}
        for snapshot in self._session_history:
            dt = datetime.fromtimestamp(snapshot.timestamp)
            if dt.date() == today:
                hour = dt.hour
                total = snapshot.registered + snapshot.unregistered
                if total > hour_counts.get(hour, 0):
                    hour_counts[hour] = total
        if not hour_counts:
            return ""
        peak = max(hour_counts, key=lambda h: hour_counts[h])
        return f"{peak:02d}:00"

    def _build_peak_heatmap(self) -> list[dict]:
        """Build heatmap data from in-memory snapshot history."""
        days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
        heatmap: dict[tuple[str, int], int] = {}
        for snapshot in self._session_history:
            dt = datetime.fromtimestamp(snapshot.timestamp)
            day = days[dt.weekday()]
            hour = dt.hour
            total = snapshot.registered + snapshot.unregistered
            key = (day, hour)
            if total > heatmap.get(key, 0):
                heatmap[key] = total
        return [{"day": day, "hour": hour, "count": count} for (day, hour), count in heatmap.items()]

    async def _get_registry_map(self) -> dict[str, dict]:
        """Get local registry metadata keyed by username."""
        try:
            from database import async_session_factory
            from models.portal_user import PortalUserRegistry
            from sqlalchemy import select
            async with async_session_factory() as session:
                result = await session.execute(select(PortalUserRegistry))
                rows = result.scalars().all()
                return {
                    r.username: {
                        "created_at": r.created_at.isoformat() if r.created_at else None,
                        "created_by": r.created_by,
                    }
                    for r in rows
                }
        except Exception as e:
            logger.warning("portal_get_registry_map_failed", error=str(e))
            return {}

    async def _save_registry_entry(self, username: str, created_by: str) -> None:
        """Insert or update a local registry entry for the user."""
        try:
            from database import async_session_factory
            from models.portal_user import PortalUserRegistry
            from sqlalchemy import select
            async with async_session_factory() as session:
                existing = await session.execute(
                    select(PortalUserRegistry).where(PortalUserRegistry.username == username)
                )
                if not existing.scalar_one_or_none():
                    entry = PortalUserRegistry(username=username, created_by=created_by)
                    session.add(entry)
                    await session.commit()
        except Exception as e:
            logger.warning("portal_save_registry_entry_failed", username=username, error=str(e))

    async def _delete_registry_entry(self, username: str) -> None:
        """Remove local registry entry when a user is deleted."""
        try:
            from database import async_session_factory
            from models.portal_user import PortalUserRegistry
            from sqlalchemy import select, delete
            async with async_session_factory() as session:
                await session.execute(
                    delete(PortalUserRegistry).where(PortalUserRegistry.username == username)
                )
                await session.commit()
        except Exception as e:
            logger.warning("portal_delete_registry_entry_failed", username=username, error=str(e))

    async def _get_new_registrations_30d(self) -> list[dict]:
        """Get new user registrations per day from local registry (last 30 days)."""
        try:
            from database import async_session_factory
            from models.portal_user import PortalUserRegistry
            from sqlalchemy import select
            async with async_session_factory() as session:
                cutoff = datetime.now() - timedelta(days=30)
                result = await session.execute(
                    select(PortalUserRegistry)
                    .where(PortalUserRegistry.created_at >= cutoff)
                )
                rows = result.scalars().all()
                counts: dict[str, int] = {}
                for row in rows:
                    day = row.created_at.date().isoformat()
                    counts[day] = counts.get(day, 0) + 1
                return [{"date": d, "count": c} for d, c in sorted(counts.items())]
        except Exception as e:
            logger.warning("portal_get_new_registrations_30d_failed", error=str(e))
            return []


# ── Module-level singleton accessor ──────────────────────────────

def get_portal_service() -> PortalService:
    """Get the Portal service singleton."""
    return PortalService()
