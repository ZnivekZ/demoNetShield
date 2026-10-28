"""
GLPI Service — HTTP client for the GLPI High-Level REST API (v3.0).

Authentication (OAuth2, "password" grant):
    POST {glpi_api_url}/token
      grant_type=password & client_id & client_secret & username & password & scope=api
    → {"access_token": "...", "token_type": "Bearer", "expires_in": 3600}

Resources:
    {glpi_api_url}/{glpi_api_version}/Assets/Computer, /Assistance/Ticket, ...

Design decisions (kept from the legacy implementation):
- Singleton: one instance shared across all requests.
- Token cache + automatic renewal before expiry (and on 401).
- Retries for transient transport failures (tenacity).
- All responses normalized to the flat schema the frontend already consumes
  (`GlpiAsset`, `GlpiTicket`, `GlpiUser`, `GlpiLocation`) — the UI does not change.

Known HLAPI v3.0 limitations (vs. the legacy apirest.php):
- Network ports (IP/MAC) are NOT exposed → `ip`/`mac` are empty. Health
  correlation therefore falls back to the asset name (Wazuh agent name).
- Ticket↔asset links are not part of the Ticket resource → no `asset_id`.
- Ticket history/logs are not exposed → `audit` is empty in full detail.
"""

from __future__ import annotations

import asyncio
import unicodedata
from datetime import datetime, timezone
from typing import Any

import httpx
import structlog
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from config import get_settings

logger = structlog.get_logger(__name__)

# ── GLPI status mapping (Computer states) ────────────────────────
GLPI_STATES = {
    1: "activo",
    2: "reparacion",
    3: "retirado",
    4: "pendiente",
    5: "bajo_investigacion",
}

GLPI_STATE_IDS = {v: k for k, v in GLPI_STATES.items()}

# Ticket priorities
GLPI_PRIORITIES = {1: "Muy baja", 2: "Baja", 3: "Media", 4: "Alta", 5: "Muy alta"}

# Ticket types
GLPI_TICKET_TYPES = {1: "Incidencia", 2: "Requerimiento"}

# Page size for bulk list calls
_LIST_LIMIT = 500


def _norm(text: str) -> str:
    """Lowercase + strip accents for tolerant name matching."""
    if not text:
        return ""
    decomposed = unicodedata.normalize("NFKD", str(text))
    return "".join(c for c in decomposed if not unicodedata.combining(c)).strip().lower()


_STATE_NAME_TO_KEY: dict[str, str] = {
    "activo": "activo",
    "en uso": "activo",
    "in use": "activo",
    "en servicio": "activo",
    "reparacion": "reparacion",
    "en reparacion": "reparacion",
    "repair": "reparacion",
    "retirado": "retirado",
    "retired": "retirado",
    "desechado": "retirado",
    "pendiente": "pendiente",
    "pending": "pendiente",
    "bajo investigacion": "bajo_investigacion",
    "under investigation": "bajo_investigacion",
}


def _state_key_from_name(name: str) -> str | None:
    return _STATE_NAME_TO_KEY.get(_norm(name))


class GLPIService:
    """
    Singleton service for the GLPI High-Level REST API (v3.0).
    Handles OAuth2 token acquisition, caching and renewal.
    """

    _instance: GLPIService | None = None

    def __new__(cls) -> GLPIService:
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def __init__(self) -> None:
        if self._initialized:
            return
        self._initialized = True
        self._settings = get_settings()
        self._access_token: str | None = None
        self._token_expires_at: float = 0.0
        self._token_lock = asyncio.Lock()
        self._client: httpx.AsyncClient | None = None

    # ── HTTP / auth plumbing ──────────────────────────────────────

    def _get_client(self) -> httpx.AsyncClient:
        """Get or create the httpx async client (no base_url: token and API differ)."""
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                verify=self._settings.glpi_verify_ssl,
                timeout=httpx.Timeout(30.0, connect=10.0),
            )
        return self._client

    def _is_configured(self) -> bool:
        """Check if the OAuth2 credentials are configured."""
        return bool(self._settings.glpi_configured)

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=10),
        retry=retry_if_exception_type((httpx.ConnectError, httpx.TimeoutException)),
    )
    async def _init_token(self) -> tuple[str, float]:
        """Request a new OAuth2 access token (password grant)."""
        client = self._get_client()
        response = await client.post(
            self._settings.glpi_token_url,
            data={
                "grant_type": "password",
                "client_id": self._settings.glpi_client_id,
                "client_secret": self._settings.glpi_client_secret,
                "username": self._settings.glpi_username,
                "password": self._settings.glpi_password,
                "scope": "api",
            },
            headers={
                "Content-Type": "application/x-www-form-urlencoded",
                "Accept": "application/json",
            },
        )
        response.raise_for_status()
        payload = response.json()
        token = payload.get("access_token", "")
        if not token:
            raise ValueError("GLPI token endpoint returned no access_token")
        expires_in = int(payload.get("expires_in", 3600) or 3600)
        # Refresh 60 s before the real expiry to avoid races.
        expires_at = datetime.now(timezone.utc).timestamp() + max(60, expires_in - 60)
        logger.info("glpi_token_acquired", expires_in=expires_in)
        return token, expires_at

    async def _ensure_token(self) -> str:
        """Return a valid access token, refreshing it when needed."""
        async with self._token_lock:
            now = datetime.now(timezone.utc).timestamp()
            if self._access_token and now < self._token_expires_at:
                return self._access_token
            self._access_token, self._token_expires_at = await self._init_token()
            return self._access_token

    async def _api_request_meta(
        self,
        method: str,
        path: str,
        params: dict | None = None,
        json_body: dict | None = None,
    ) -> tuple[Any, dict[str, str]]:
        """
        Authenticated request against {glpi_api_base}. Returns (parsed_body, headers).
        Refreshes the token and retries once on 401.
        """
        url = f"{self._settings.glpi_api_base}{path}"
        token = await self._ensure_token()
        client = self._get_client()

        def _headers(tok: str) -> dict[str, str]:
            headers = {
                "Authorization": f"Bearer {tok}",
                "Accept": "application/json",
            }
            # GLPI's HLAPI rejects a JSON Content-Type on bodiless GET/DELETE
            # ("Invalid JSON body"), so only advertise it when sending a payload.
            if json_body is not None:
                headers["Content-Type"] = "application/json"
            return headers

        try:
            response = await client.request(
                method, url, headers=_headers(token), params=params, json=json_body
            )
            if response.status_code == 401:
                logger.info("glpi_token_expired_refreshing")
                async with self._token_lock:
                    self._access_token, self._token_expires_at = await self._init_token()
                    token = self._access_token
                response = await client.request(
                    method, url, headers=_headers(token), params=params, json=json_body
                )

            response.raise_for_status()
            if response.status_code == 204 or not response.content:
                return {}, dict(response.headers)
            return response.json(), dict(response.headers)
        except (httpx.ConnectError, httpx.TimeoutException, httpx.ConnectTimeout) as e:
            logger.error("glpi_connection_failed", path=path, error=str(e))
            raise
        except httpx.HTTPStatusError as e:
            logger.error(
                "glpi_api_error",
                path=path,
                status_code=e.response.status_code,
                detail=e.response.text[:500],
            )
            raise
        except Exception as e:
            logger.error("glpi_api_request_failed", path=path, error=str(e))
            raise

    async def _api_request(
        self,
        method: str,
        path: str,
        params: dict | None = None,
        json_body: dict | None = None,
    ) -> dict[str, Any] | list[dict]:
        """Authenticated request; returns only the parsed body."""
        data, _headers = await self._api_request_meta(method, path, params, json_body)
        return data

    async def _api_list(
        self,
        path: str,
        start: int = 0,
        limit: int = _LIST_LIMIT,
        sort: str | None = None,
        rsql: str | None = None,
    ) -> tuple[list[dict], int | None]:
        """GET a collection with pagination. Returns (items, total_from_Content-Range)."""
        params: dict[str, Any] = {"start": start, "limit": limit}
        if sort:
            params["sort"] = sort
        if rsql:
            params["filter"] = rsql
        data, headers = await self._api_request_meta("GET", path, params=params)
        items = data if isinstance(data, list) else []
        total: int | None = None
        content_range = headers.get("Content-Range") or headers.get("content-range") or ""
        if "/" in content_range:
            try:
                total = int(content_range.split("/")[-1])
            except ValueError:
                total = None
        return items, total

    # ── Availability check ────────────────────────────────────────

    async def is_available(self) -> bool:
        """
        Lightweight health probe: authenticated GET /Assets/Computer?limit=1.
        (`/status` requires a scope this client does not have, so we probe a
        resource the password-grant token can actually read.)
        """
        if not self._is_configured():
            return False
        try:
            await self._api_request("GET", "/Assets/Computer", params={"limit": 1})
            return True
        except Exception:
            return False

    # ── Computers / Assets ────────────────────────────────────────

    async def get_computers(
        self,
        search: str | None = None,
        location: int | None = None,
        status: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[dict]:
        """
        [GLPI API] Get all computers from inventory.
        GET /Assets/Computer (paginated via start/limit).
        """
        try:
            # Try the collector cache first (populated every 5 min)
            try:
                from services.glpi_collector import get_glpi_collector
                collector = get_glpi_collector()
                cached = collector.get_cached_assets()
                if cached:
                    result = [self._normalize_computer(c) for c in cached]
                    result = self._filter_computers(result, search, location, status)
                    logger.debug("glpi_computers_from_collector", count=len(result))
                    return result[offset:offset + limit]
            except Exception:
                pass  # Fall through to the direct API call

            # Filters require the full working set → fetch a big page, filter, slice.
            want = _LIST_LIMIT if (search or location or status) else limit
            items, _total = await self._api_list("/Assets/Computer", start=offset, limit=want)
            result = [self._normalize_computer(c) for c in items]
            result = self._filter_computers(result, search, location, status)
            logger.debug("glpi_computers_fetched", count=len(result))
            return result[:limit]
        except Exception as e:
            logger.error("glpi_get_computers_failed", error=str(e))
            raise

    @staticmethod
    def _filter_computers(
        rows: list[dict],
        search: str | None,
        location: int | None,
        status: str | None,
    ) -> list[dict]:
        result = rows
        if location is not None:
            result = [c for c in result if c.get("location_id") == location]
        if status:
            result = [c for c in result if c.get("status") == status]
        if search:
            q = search.lower()
            result = [
                c for c in result
                if q in (c.get("name") or "").lower()
                or q in (c.get("serial") or "").lower()
                or q in (c.get("assigned_user") or "").lower()
            ]
        return result

    async def get_computer(self, computer_id: int, itemtype: str = "Computer") -> dict:
        """
        [GLPI API] Get full technical details of a single asset.
        GET /Assets/{itemtype}/{id}
        """
        try:
            data = await self._api_request("GET", f"/Assets/{itemtype}/{computer_id}")
            if not isinstance(data, dict):
                raise ValueError(f"Unexpected GLPI response for computer {computer_id}")
            result = self._normalize_computer(data)
            result["tickets"] = await self._get_asset_tickets(computer_id, itemtype)
            logger.debug("glpi_computer_fetched", id=computer_id)
            return result
        except Exception as e:
            logger.error("glpi_get_computer_failed", id=computer_id, error=str(e))
            raise

    async def search_computers(self, query: str) -> list[dict]:
        """[GLPI API] Full-text search across computers (client-side over one page)."""
        try:
            items, _total = await self._api_list("/Assets/Computer", limit=_LIST_LIMIT)
            result = [self._normalize_computer(c) for c in items]
            q = query.lower()
            result = [
                c for c in result
                if q in (c.get("name") or "").lower()
                or q in (c.get("serial") or "").lower()
                or q in (c.get("assigned_user") or "").lower()
            ]
            logger.debug("glpi_computer_search", query=query, results=len(result))
            return result
        except Exception as e:
            logger.error("glpi_search_computers_failed", query=query, error=str(e))
            raise

    async def create_computer(self, data: dict) -> dict:
        """[GLPI API] Register a new computer. POST /Assets/Computer (flat body)."""
        try:
            payload: dict[str, Any] = {
                "name": data["name"],
                "status": {"id": GLPI_STATE_IDS.get(data.get("status", "activo"), 1)},
            }
            if data.get("serial"):
                payload["serial"] = data["serial"]
            if data.get("comment"):
                payload["comment"] = data["comment"]
            if data.get("location_id"):
                payload["location"] = {"id": data["location_id"]}
            if data.get("assigned_user_id"):
                payload["user_tech"] = {"id": data["assigned_user_id"]}

            result = await self._api_request("POST", "/Assets/Computer", json_body=payload)
            glpi_id = result.get("id") if isinstance(result, dict) else None
            logger.info("glpi_computer_created", name=data["name"], id=glpi_id)
            return {"id": glpi_id, "name": data["name"], "created": True}
        except Exception as e:
            logger.error("glpi_create_computer_failed", name=data.get("name"), error=str(e))
            raise

    async def update_computer(self, computer_id: int, data: dict, itemtype: str = "Computer") -> dict:
        """[GLPI API] Update an asset. PATCH /Assets/{itemtype}/{id}."""
        try:
            patch: dict[str, Any] = {}
            if "status" in data:
                patch["status"] = {"id": GLPI_STATE_IDS.get(data["status"], 1)}
            if "name" in data:
                patch["name"] = data["name"]
            if "comment" in data:
                patch["comment"] = data["comment"]
            if "location_id" in data:
                patch["location"] = {"id": data["location_id"]}
            if "assigned_user_id" in data:
                patch["user_tech"] = {"id": data["assigned_user_id"]}

            await self._api_request("PATCH", f"/Assets/{itemtype}/{computer_id}", json_body=patch)
            logger.info("glpi_computer_updated", id=computer_id)
            return {"id": computer_id, "updated": True}
        except Exception as e:
            logger.error("glpi_update_computer_failed", id=computer_id, error=str(e))
            raise

    async def get_asset_stats(self) -> dict:
        """[GLPI API] Get count of computers by status (pie chart)."""
        try:
            computers = await self.get_computers(limit=500)
            stats = {"activo": 0, "reparacion": 0, "retirado": 0, "pendiente": 0, "total": 0}
            for c in computers:
                status = c.get("status", "activo")
                if status in stats:
                    stats[status] += 1
                stats["total"] += 1
            logger.debug("glpi_asset_stats", stats=stats)
            return stats
        except Exception as e:
            logger.error("glpi_get_asset_stats_failed", error=str(e))
            raise

    # ── Locations ─────────────────────────────────────────────────

    async def get_locations(self) -> list[dict]:
        """[GLPI API] Get all physical locations. GET /Dropdowns/Location."""
        try:
            items, _total = await self._api_list("/Dropdowns/Location", limit=_LIST_LIMIT)
            result = [
                {
                    "id": loc.get("id"),
                    "name": loc.get("name", "") or "",
                    "completename": loc.get("completename", "") or loc.get("name", "") or "",
                    "comment": loc.get("comment") or "",
                    "building": loc.get("building") or "",
                    "room": loc.get("room") or "",
                }
                for loc in items
            ]
            logger.debug("glpi_locations_fetched", count=len(result))
            return result
        except Exception as e:
            logger.error("glpi_get_locations_failed", error=str(e))
            raise

    async def get_computers_by_location(self, location_id: int) -> list[dict]:
        """[GLPI API] Get computers in a specific location."""
        try:
            result = await self.get_computers(location=location_id, limit=500)
            logger.debug("glpi_computers_by_location", location_id=location_id, count=len(result))
            return result
        except Exception as e:
            logger.error("glpi_get_computers_by_location_failed", location_id=location_id, error=str(e))
            raise

    # ── Tickets ───────────────────────────────────────────────────

    async def get_tickets(
        self,
        priority: int | None = None,
        assigned_to: int | None = None,
        status: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[dict]:
        """[GLPI API] Get tickets. GET /Assistance/Ticket."""
        try:
            items, _total = await self._api_list(
                "/Assistance/Ticket", start=offset, limit=limit, sort="date:desc"
            )
            result = [self._normalize_ticket(t) for t in items]
            if priority:
                result = [t for t in result if t.get("priority") == priority]
            if status:
                result = [t for t in result if t.get("status") == status]
            if assigned_to:
                result = [t for t in result if str(t.get("assigned_user_id")) == str(assigned_to)]
            logger.debug("glpi_tickets_fetched", count=len(result))
            return result
        except Exception as e:
            logger.error("glpi_get_tickets_failed", error=str(e))
            raise

    async def get_ticket(self, ticket_id: int) -> dict:
        """[GLPI API] Get full details of a ticket. GET /Assistance/Ticket/{id}."""
        try:
            data = await self._api_request("GET", f"/Assistance/Ticket/{ticket_id}")
            if not isinstance(data, dict):
                raise ValueError(f"Unexpected GLPI response for ticket {ticket_id}")
            result = self._normalize_ticket(data)
            logger.debug("glpi_ticket_fetched", id=ticket_id)
            return result
        except Exception as e:
            logger.error("glpi_get_ticket_failed", id=ticket_id, error=str(e))
            raise

    async def create_ticket(self, data: dict) -> dict:
        """[GLPI API] Create a ticket. POST /Assistance/Ticket (flat body)."""
        try:
            payload: dict[str, Any] = {
                "name": data["title"],
                "content": data.get("description", ""),
                "priority": data.get("priority", 3),
                "type": 1,  # 1=Incidencia
            }
            if data.get("category_id"):
                payload["category"] = {"id": data["category_id"]}

            result = await self._api_request("POST", "/Assistance/Ticket", json_body=payload)
            ticket_id = result.get("id") if isinstance(result, dict) else None
            logger.info("glpi_ticket_created", title=data["title"], id=ticket_id)
            return {"id": ticket_id, "title": data["title"], "created": True}
        except Exception as e:
            logger.error("glpi_create_ticket_failed", title=data.get("title"), error=str(e))
            raise

    async def get_ticket_status(self, ticket_id: int) -> dict:
        """[GLPI API] Estado de un ticket, sin datos internos (portal público)."""
        raw = await self._api_request("GET", f"/Assistance/Ticket/{ticket_id}")
        status = raw.get("status")
        code = status.get("id") if isinstance(status, dict) else status
        return {
            "ticket_id": int(raw.get("id") or ticket_id),
            "title": raw.get("name") or "",
            "status": int(code) if code is not None else 1,
            "created_at": raw.get("date_creation"),
            "updated_at": raw.get("date_mod"),
        }

    async def update_ticket_status(self, ticket_id: int, status: int) -> dict:
        """[GLPI API] Update ticket status. PATCH /Assistance/Ticket/{id}."""
        try:
            await self._api_request(
                "PATCH",
                f"/Assistance/Ticket/{ticket_id}",
                json_body={"status": {"id": status}},
            )
            logger.info("glpi_ticket_status_updated", id=ticket_id, status=status)
            return {"id": ticket_id, "status": status, "updated": True}
        except Exception as e:
            logger.error("glpi_update_ticket_status_failed", id=ticket_id, error=str(e))
            raise

    # ── Users ─────────────────────────────────────────────────────

    async def get_users(self, search: str | None = None, limit: int = 100) -> list[dict]:
        """[GLPI API] Get users. GET /Administration/User."""
        try:
            items, _total = await self._api_list("/Administration/User", limit=max(limit, 100))
            result = [self._normalize_user(u) for u in items]
            if search:
                q = search.lower()
                result = [
                    u for u in result
                    if q in (u.get("name") or "").lower()
                    or q in (u.get("realname") or "").lower()
                    or q in (u.get("firstname") or "").lower()
                    or q in (u.get("email") or "").lower()
                ]
            logger.debug("glpi_users_fetched", count=len(result))
            return result[:limit]
        except Exception as e:
            logger.error("glpi_get_users_failed", error=str(e))
            raise

    async def get_user_assets(self, user_id: int) -> list[dict]:
        """[GLPI API] Get computers assigned to a specific user."""
        try:
            items, _total = await self._api_list("/Assets/Computer", limit=_LIST_LIMIT)
            result = [
                self._normalize_computer(c) for c in items
                if self._fk_id(c.get("user_tech")) == int(user_id)
            ]
            logger.debug("glpi_user_assets_fetched", user_id=user_id, count=len(result))
            return result
        except Exception as e:
            logger.error("glpi_get_user_assets_failed", user_id=user_id, error=str(e))
            raise

    async def delete_computer(self, computer_id: int, itemtype: str = "Computer") -> dict:
        """[GLPI API] Delete an asset. DELETE /Assets/{itemtype}/{id}."""
        try:
            await self._api_request("DELETE", f"/Assets/{itemtype}/{computer_id}")
            logger.info("glpi_computer_deleted", id=computer_id)
            return {"id": computer_id, "deleted": True}
        except Exception as e:
            logger.error("glpi_delete_computer_failed", id=computer_id, error=str(e))
            raise

    async def get_user(self, user_id: int) -> dict:
        """[GLPI API] Get a single user by ID. GET /Administration/User/{id}."""
        try:
            data = await self._api_request("GET", f"/Administration/User/{user_id}")
            if not isinstance(data, dict):
                raise ValueError(f"Unexpected GLPI response for user {user_id}")
            return self._normalize_user(data)
        except Exception as e:
            logger.error("glpi_get_user_failed", id=user_id, error=str(e))
            raise

    async def create_user(self, data: dict) -> dict:
        """[GLPI API] Create a user. POST /Administration/User (flat body)."""
        try:
            payload: dict[str, Any] = {
                "username": data["name"],
                "realname": data.get("realname", ""),
                "firstname": data.get("firstname", ""),
                "phone": data.get("phone", ""),
                "comment": data.get("comment", ""),
            }
            result = await self._api_request("POST", "/Administration/User", json_body=payload)
            glpi_id = result.get("id") if isinstance(result, dict) else None
            logger.info("glpi_user_created", name=data["name"], id=glpi_id)
            return {"id": glpi_id, "name": data["name"], "created": True}
        except Exception as e:
            logger.error("glpi_create_user_failed", name=data.get("name"), error=str(e))
            raise

    async def update_user(self, user_id: int, data: dict) -> dict:
        """[GLPI API] Update a user. PATCH /Administration/User/{id}."""
        try:
            patch: dict[str, Any] = {}
            for field in ("realname", "firstname", "phone", "comment"):
                if field in data and data[field] is not None:
                    patch[field] = data[field]
            await self._api_request("PATCH", f"/Administration/User/{user_id}", json_body=patch)
            logger.info("glpi_user_updated", id=user_id)
            return {"id": user_id, "updated": True}
        except Exception as e:
            logger.error("glpi_update_user_failed", id=user_id, error=str(e))
            raise

    async def delete_user(self, user_id: int) -> dict:
        """[GLPI API] Delete a user. DELETE /Administration/User/{id}."""
        try:
            await self._api_request("DELETE", f"/Administration/User/{user_id}")
            logger.info("glpi_user_deleted", id=user_id)
            return {"id": user_id, "deleted": True}
        except Exception as e:
            logger.error("glpi_delete_user_failed", id=user_id, error=str(e))
            raise

    async def assign_asset(self, asset_id: int, user_id: int | None, itemtype: str = "Computer") -> dict:
        """[GLPI API] Assign/unassign an asset to a user. PATCH user_tech."""
        try:
            await self._api_request(
                "PATCH",
                f"/Assets/{itemtype}/{asset_id}",
                json_body={"user_tech": {"id": user_id if user_id is not None else 0}},
            )
            logger.info("glpi_asset_assigned", asset_id=asset_id, user_id=user_id)
            return {"id": asset_id, "user_id": user_id, "assigned": True}
        except Exception as e:
            logger.error("glpi_assign_asset_failed", asset_id=asset_id, error=str(e))
            raise

    # ── Hybrid: Health ────────────────────────────────────────────

    async def get_assets_health(self) -> list[dict]:
        """
        [GLPI API] Inventory status per asset — GLPI data only.

        No cross-tool correlation (no Wazuh agent, no ARP). An asset is
        "operativo" when its GLPI status is `activo`; the rest is reported
        as warning/critical so the dashboard stays purely inventory-driven.
        """
        try:
            computers = await self.get_computers(limit=500)
            result = []
            for c in computers:
                status = c.get("status", "activo")
                if status == "activo":
                    health, reason = "ok", ""
                elif status in ("reparacion", "pendiente"):
                    health, reason = "warning", f"Estado GLPI: {status}"
                else:
                    health, reason = "critical", f"Estado GLPI: {status}"

                result.append({
                    "asset_id": c.get("id"),
                    "name": c.get("name", ""),
                    "type": c.get("type") or "Computer",
                    "location": c.get("location", ""),
                    "assigned_user": c.get("assigned_user", ""),
                    "glpi_status": status,
                    "health": health,
                    "health_reason": reason,
                    "last_update": c.get("last_update", ""),
                })

            logger.debug("glpi_health_computed", assets=len(result))
            return result
        except Exception as e:
            logger.error("glpi_get_health_failed", error=str(e))
            raise

    async def get_asset_network_context(self, computer_id: int, arp_table: list[dict]) -> dict:
        """
        [GLPI API + MikroTik API] Network context for an asset.
        The HLAPI exposes no MAC/IP, so the ARP lookup is best-effort by name.
        """
        try:
            computer = await self.get_computer(computer_id)
            mac = computer.get("mac", "")
            ip = computer.get("ip", "")
            name = computer.get("name", "")

            interface = ""
            vlan = ""
            last_seen = ""
            ip_assigned = ip

            for entry in arp_table:
                entry_name = _norm(entry.get("comment", "") or entry.get("hostname", ""))
                if (
                    (mac and (entry.get("mac_address", "") or "").upper() == mac.upper())
                    or (ip and entry.get("ip_address") == ip)
                    or (name and entry_name and entry_name == _norm(name))
                ):
                    interface = entry.get("interface", "")
                    ip_assigned = entry.get("ip_address", ip)
                    last_seen = "Ahora"
                    break

            if "vlan" in interface.lower():
                vlan = interface.lower().replace("vlan", "").strip()

            logger.debug("glpi_network_context", id=computer_id, interface=interface)
            return {
                "asset_id": computer_id,
                "asset_name": name,
                "interface": interface,
                "vlan": vlan,
                "ip_assigned": ip_assigned,
                "last_seen": last_seen,
                "mac": mac,
            }
        except Exception as e:
            logger.error("glpi_get_network_context_failed", id=computer_id, error=str(e))
            raise

    # ── Quarantine ────────────────────────────────────────────────

    async def quarantine_asset(self, computer_id: int, reason: str) -> dict:
        """[GLPI API] Mark asset as 'bajo_investigacion' + create an incident ticket."""
        try:
            await self.update_computer(computer_id, {"status": "bajo_investigacion"})

            ticket_data = {
                "title": f"[NetShield] Cuarentena automática — Activo #{computer_id}",
                "description": (
                    "Cuarentena iniciada automáticamente por NetShield Dashboard.\n"
                    f"Motivo: {reason}\n"
                    f"Fecha: {datetime.now(timezone.utc).isoformat()}"
                ),
                "priority": 4,
            }
            ticket_result = await self.create_ticket(ticket_data)

            logger.info("glpi_asset_quarantined", id=computer_id, reason=reason)
            return {
                "asset_id": computer_id,
                "quarantined": True,
                "ticket_id": ticket_result.get("id"),
                "reason": reason,
            }
        except Exception as e:
            logger.error("glpi_quarantine_failed", id=computer_id, error=str(e))
            raise

    async def unquarantine_asset(self, computer_id: int) -> dict:
        """[GLPI API] Restore asset status to 'activo'."""
        try:
            await self.update_computer(computer_id, {"status": "activo"})
            logger.info("glpi_asset_unquarantined", id=computer_id)
            return {"asset_id": computer_id, "unquarantined": True}
        except Exception as e:
            logger.error("glpi_unquarantine_failed", id=computer_id, error=str(e))
            raise

    async def kill_session(self) -> None:
        """Deprecated: OAuth2 tokens are stateless — just drop the cached one."""
        self._access_token = None
        self._token_expires_at = 0.0

    async def close(self) -> None:
        """Drop the token and close the HTTP client."""
        self._access_token = None
        self._token_expires_at = 0.0
        if self._client and not self._client.is_closed:
            await self._client.aclose()
            logger.info("glpi_client_closed")

    # ── Normalizers (HLAPI v3.0 shapes → flat frontend schema) ────

    @staticmethod
    def _fk_id(value: Any) -> int | None:
        """Extract an id from a nested {id, name} object or a scalar."""
        if isinstance(value, dict):
            value = value.get("id")
        try:
            return int(value) if value not in (None, "") else None
        except (TypeError, ValueError):
            return None

    @staticmethod
    def _fk_name(value: Any) -> str:
        """
        Extract a display name from a nested FK object or a scalar.
        GLPI person FKs (user_tech, user_recipient…) expose `username`, not
        `name`, so that is part of the fallback chain.
        """
        if isinstance(value, dict):
            return (
                value.get("completename")
                or value.get("name")
                or value.get("username")
                or value.get("designation")
                or ""
            )
        return str(value) if isinstance(value, str) else ""

    @staticmethod
    def _state_key(raw: dict) -> str:
        """Map a v3 `status` object to our normalized status key."""
        status = raw.get("status")
        name = ""
        state_id = None
        if isinstance(status, dict):
            name = status.get("name") or ""
            state_id = status.get("id")
        elif isinstance(status, str):
            name = status
        elif isinstance(status, int):
            state_id = status

        by_name = _state_key_from_name(name)
        if by_name:
            return by_name
        try:
            return GLPI_STATES.get(int(state_id), "activo") if state_id is not None else "activo"
        except (TypeError, ValueError):
            return "activo"

    def _normalize_computer(self, raw: dict) -> dict:
        """Normalize a v3 Computer resource to the flat GlpiAsset schema."""
        location_obj = raw.get("location")
        user_obj = raw.get("user_tech") or raw.get("user")
        return {
            "id": raw.get("id"),
            "name": raw.get("name") or "",
            # Itemtype (Computer/Printer/…): the inventory grid filters by it.
            "type": raw.get("_itemtype") or "Computer",
            "serial": raw.get("serial") or "",
            # HLAPI v3.0 does not expose network ports (IP/MAC unavailable).
            "ip": "",
            "mac": "",
            # OS is only available on the detail view (/OSInstallation).
            "os": "",
            "cpu": "",
            "ram": "",
            "location": self._fk_name(location_obj),
            "location_id": self._fk_id(location_obj),
            "assigned_user": self._fk_name(user_obj),
            "status": self._state_key(raw),
            "comment": raw.get("comment") or "",
            "last_update": raw.get("date_mod") or "",
        }

    def _normalize_search_result(self, raw: dict) -> dict:
        """Search results share the Computer shape in the HLAPI."""
        return self._normalize_computer(raw)

    def _normalize_ticket(self, raw: dict) -> dict:
        """Normalize a v3 Ticket resource to the flat GlpiTicket schema."""
        priority = raw.get("priority", 3)
        status_obj = raw.get("status")
        status_id = self._fk_id(status_obj) if isinstance(status_obj, dict) else status_obj
        status_id = status_id if status_id is not None else 1

        if status_id in (1, 2):
            status = "pendiente"
        elif status_id in (3, 4):
            status = "en_progreso"
        else:
            status = "resuelto"

        assigned = raw.get("user_editor") or raw.get("user_recipient")
        category = raw.get("category")
        name = raw.get("name") or ""

        return {
            "id": raw.get("id"),
            "title": name,
            "description": raw.get("content") or "",
            "priority": priority,
            "priority_label": GLPI_PRIORITIES.get(priority, "Media"),
            "status": status,
            "status_id": status_id,
            "assigned_user": self._fk_name(assigned),
            "assigned_user_id": self._fk_id(assigned),
            "asset_name": "",
            "asset_id": None,
            "category": self._fk_name(category),
            "created_at": raw.get("date") or raw.get("date_creation") or "",
            "due_date": raw.get("internal_resolution_date") or "",
            "is_netshield": name.startswith("[NetShield]"),
        }

    def _normalize_user(self, raw: dict) -> dict:
        """Normalize a v3 User resource to the flat GlpiUser schema."""
        emails = raw.get("emails") or []
        email = ""
        if isinstance(emails, list) and emails:
            first = emails[0]
            email = (first.get("email") or first.get("name") or "") if isinstance(first, dict) else str(first)

        title = raw.get("title")
        category = raw.get("category")
        location = raw.get("location")
        firstname = raw.get("firstname") or ""
        realname = raw.get("realname") or ""
        username = raw.get("username") or raw.get("name") or ""

        return {
            "id": raw.get("id"),
            "name": username,
            "realname": realname,
            "firstname": firstname,
            "email": email,
            "phone": raw.get("phone") or "",
            "department": self._fk_name(category),
            "location": self._fk_name(location),
            "title": self._fk_name(title),
            "display_name": f"{firstname} {realname}".strip() or username,
        }

    async def _get_asset_tickets(self, item_id: int, item_type: str = "Computer") -> list[dict]:
        """
        Tickets linked to an asset. The HLAPI v3.0 Ticket resource does not carry
        the itemtype/items_id link, so this returns an empty list (best-effort).
        """
        return []


def get_glpi_service() -> GLPIService:
    """Get the GLPI service singleton."""
    return GLPIService()
