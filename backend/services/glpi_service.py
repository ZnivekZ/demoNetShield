"""
GLPI Service - HTTP client for GLPI Asset Management REST API.

Design decisions:
- Singleton pattern: one instance shared across all requests (same as WazuhService)
- Session Token authentication: POST /initSession with App-Token + user_token
- Session renewal: re-initializes on 401 automatically
- Exponential backoff retries for transient failures (tenacity)
- SSL verification disabled for lab (self-signed / HTTP on local network)
- All responses normalized to consistent format matching GlpiAsset schema
- Mock data enabled when APP_ENV=lab and GLPI is unreachable (same as Wazuh pattern)

[GLPI API] docs: https://glpi-project.org/DOC/en/restapi.html
"""

from __future__ import annotations

import asyncio
import random
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

# ── GLPI status mapping ──────────────────────────────────────────
# GLPI itemtype Computer → states (configurables, estos son los defaults)
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

# Ticket categories (numeric IDs from GLPI — configurables en cada instancia)
GLPI_TICKET_TYPES = {1: "Incidencia", 2: "Requerimiento"}


class GLPIService:
    """
    Singleton service for GLPI Asset Management REST API.
    Handles session token authentication with automatic renewal.
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
        self._session_token: str | None = None
        self._token_lock = asyncio.Lock()
        self._client: httpx.AsyncClient | None = None

    def _get_client(self) -> httpx.AsyncClient:
        """Get or create the httpx async client."""
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                base_url=self._settings.glpi_base_url,
                verify=self._settings.glpi_verify_ssl,
                timeout=httpx.Timeout(30.0, connect=10.0),
            )
        return self._client

    def _is_configured(self) -> bool:
        """Check if GLPI credentials are configured."""
        return bool(self._settings.glpi_app_token and self._settings.glpi_user_token)

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=10),
        retry=retry_if_exception_type((httpx.ConnectError, httpx.TimeoutException)),
    )
    async def _init_session(self) -> str:
        """
        [GLPI API] Initialize a new session and obtain a session token.
        GLPI uses App-Token (identifies the app) + user_token (identifies the user).
        POST /apirest.php/initSession
        """
        client = self._get_client()
        response = await client.get(
            "/initSession",
            headers={
                "App-Token": self._settings.glpi_app_token,
                "Authorization": f"user_token {self._settings.glpi_user_token}",
            },
        )
        response.raise_for_status()
        data = response.json()
        token = data.get("session_token", "")
        if not token:
            raise ValueError("Failed to obtain GLPI session token")
        logger.info("glpi_session_initialized", host=self._settings.glpi_url)
        return token

    async def _ensure_session(self) -> str:
        """Ensure we have a valid session token."""
        async with self._token_lock:
            if self._session_token is None:
                self._session_token = await self._init_session()
            return self._session_token

    async def _api_request(
        self,
        method: str,
        endpoint: str,
        params: dict | None = None,
        json_body: dict | None = None,
    ) -> dict[str, Any] | list[dict]:
        """
        Make an authenticated API request to GLPI.
        Automatically refreshes session on 401 (token expired).
        """
        token = await self._ensure_session()
        client = self._get_client()
        headers = {
            "App-Token": self._settings.glpi_app_token,
            "Session-Token": token,
            "Content-Type": "application/json",
        }

        try:
            response = await client.request(
                method,
                endpoint,
                headers=headers,
                params=params,
                json=json_body,
            )

            # Session expired — reinitialize and retry
            if response.status_code == 401:
                logger.info("glpi_session_expired_refreshing")
                async with self._token_lock:
                    self._session_token = await self._init_session()
                headers["Session-Token"] = self._session_token
                response = await client.request(
                    method,
                    endpoint,
                    headers=headers,
                    params=params,
                    json=json_body,
                )

            response.raise_for_status()
            # GLPI returns empty body on some mutations (204)
            if response.status_code == 204 or not response.content:
                return {}
            return response.json()
        except (httpx.ConnectError, httpx.TimeoutException, httpx.ConnectTimeout) as e:
            logger.error("glpi_connection_failed", endpoint=endpoint, error=str(e))
            raise
        except httpx.HTTPStatusError as e:
            logger.error(
                "glpi_api_error",
                endpoint=endpoint,
                status_code=e.response.status_code,
                detail=e.response.text[:500],
            )
            raise
        except Exception as e:
            logger.error("glpi_api_request_failed", endpoint=endpoint, error=str(e))
            raise

    # ── Availability check ────────────────────────────────────────

    async def is_available(self) -> bool:
        """Quick ping to check if GLPI is reachable."""
        if self._settings.should_mock_glpi:
            return True  # Always available in mock mode
        try:
            client = self._get_client()
            response = await client.get(
                "/",
                headers={"App-Token": self._settings.glpi_app_token},
                timeout=5.0,
            )
            return response.status_code < 500
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
        GET /apirest.php/Computer
        Supports filtering by name/IP, location, status.
        """
        if self._settings.should_mock_glpi:
            from services.mock_service import MockService
            return MockService.glpi_get_assets(search=search, status=status, location_id=location, limit=limit, offset=offset)
        try:
            params: dict[str, Any] = {
                "range": f"{offset}-{offset + limit - 1}",
                "expand_dropdowns": 1,
                "with_networkports": 1,
            }
            if location:
                params["searchText[locations_id]"] = str(location)

            data = await self._api_request("GET", "/Computer", params=params)
            computers = data if isinstance(data, list) else []
            result = [self._normalize_computer(c) for c in computers]

            # Optional client-side filtering by name/IP/serial
            if search:
                q = search.lower()
                result = [
                    c for c in result
                    if q in c["name"].lower()
                    or q in (c.get("ip") or "").lower()
                    or q in (c.get("serial") or "").lower()
                ]

            # Filter by status
            if status:
                result = [c for c in result if c.get("status") == status]

            logger.debug("glpi_computers_fetched", count=len(result))
            return result
        except Exception as e:
            logger.error("glpi_get_computers_failed", error=str(e))
            raise

    async def get_computer(self, computer_id: int) -> dict:
        """
        [GLPI API] Get full technical details of a single computer.
        GET /apirest.php/Computer/{id}
        Includes network ports, software, tickets, disks.
        """
        if self._settings.should_mock_glpi:
            from services.mock_service import MockService
            asset = MockService.glpi_get_asset(computer_id)
            if asset is None:
                raise ValueError(f"Asset #{computer_id} not found in mock data")
            return asset
        try:
            data = await self._api_request(
                "GET",
                f"/Computer/{computer_id}",
                params={
                    "expand_dropdowns": 1,
                    "with_networkports": 1,
                    "with_softwares": 1,
                    "with_tickets": 1,
                    "with_disks": 1,
                    "with_components": 1,
                },
            )
            result = self._normalize_computer(data)
            # Attach related tickets
            result["tickets"] = await self._get_asset_tickets(computer_id, "Computer")
            logger.debug("glpi_computer_fetched", id=computer_id)
            return result
        except Exception as e:
            logger.error("glpi_get_computer_failed", id=computer_id, error=str(e))
            raise

    async def search_computers(self, query: str) -> list[dict]:
        """[GLPI API] Full-text search across computers by name, serial, IP."""
        if self._settings.should_mock_glpi:
            from services.mock_service import MockService
            return MockService.glpi_get_assets(search=query)
        try:
            # Criteria: search in name (field 1), serial (field 5), IP (networkports)
            params: dict[str, Any] = {
                "criteria[0][field]": "1",      # name
                "criteria[0][searchtype]": "contains",
                "criteria[0][value]": query,
                "criteria[0][link]": "OR",
                "criteria[1][field]": "5",      # serial
                "criteria[1][searchtype]": "contains",
                "criteria[1][value]": query,
                "criteria[1][link]": "OR",
                "criteria[2][field]": "126",    # IP address
                "criteria[2][searchtype]": "contains",
                "criteria[2][value]": query,
                "expand_dropdowns": 1,
                "range": "0-49",
            }
            data = await self._api_request("GET", "/search/Computer", params=params)
            items = data.get("data", []) if isinstance(data, dict) else []
            result = [self._normalize_search_result(item) for item in items]
            logger.debug("glpi_computer_search", query=query, results=len(result))
            return result
        except Exception as e:
            logger.error("glpi_search_computers_failed", query=query, error=str(e))
            raise

    async def create_computer(self, data: dict) -> dict:
        """
        [GLPI API] Register a new computer in GLPI.
        POST /apirest.php/Computer
        """
        if self._settings.should_mock_glpi:
            from services.mock_service import MockService
            return MockService.glpi_create_asset(data)
        try:
            payload = {
                "input": {
                    "name": data["name"],
                    "states_id": GLPI_STATE_IDS.get(data.get("status", "activo"), 1),
                }
            }
            # Optional fields
            if data.get("serial"):
                payload["input"]["serial"] = data["serial"]
            if data.get("os"):
                payload["input"]["operatingsystems_id"] = data.get("os")
            if data.get("location_id"):
                payload["input"]["locations_id"] = data["location_id"]
            if data.get("assigned_user_id"):
                payload["input"]["users_id_tech"] = data["assigned_user_id"]
            if data.get("comment"):
                payload["input"]["comment"] = data["comment"]

            result = await self._api_request("POST", "/Computer", json_body=payload)
            glpi_id = result.get("id") if isinstance(result, dict) else None
            logger.info("glpi_computer_created", name=data["name"], id=glpi_id)
            return {"id": glpi_id, "name": data["name"], "created": True}
        except Exception as e:
            logger.error("glpi_create_computer_failed", name=data.get("name"), error=str(e))
            raise

    async def update_computer(self, computer_id: int, data: dict) -> dict:
        """
        [GLPI API] Update a computer's data in GLPI.
        PUT /apirest.php/Computer/{id}
        """
        if self._settings.should_mock_glpi:
            from services.mock_service import MockService
            return MockService.glpi_update_asset(computer_id, data)
        try:
            input_data: dict[str, Any] = {"id": computer_id}
            if "status" in data:
                input_data["states_id"] = GLPI_STATE_IDS.get(data["status"], 1)
            if "name" in data:
                input_data["name"] = data["name"]
            if "comment" in data:
                input_data["comment"] = data["comment"]
            if "location_id" in data:
                input_data["locations_id"] = data["location_id"]
            if "assigned_user_id" in data:
                input_data["users_id_tech"] = data["assigned_user_id"]

            await self._api_request(
                "PUT", f"/Computer/{computer_id}", json_body={"input": input_data}
            )
            logger.info("glpi_computer_updated", id=computer_id)
            return {"id": computer_id, "updated": True}
        except Exception as e:
            logger.error("glpi_update_computer_failed", id=computer_id, error=str(e))
            raise

    async def get_asset_stats(self) -> dict:
        """
        [GLPI API] Get count of computers by status.
        Returns data ready for a pie chart.
        """
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
        """
        [GLPI API] Get all physical locations (classrooms, labs).
        GET /apirest.php/Location
        """
        if self._settings.should_mock_glpi:
            from services.mock_data import MockData
            return MockData.glpi.locations()
        try:
            data = await self._api_request(
                "GET", "/Location", params={"range": "0-999", "expand_dropdowns": 1}
            )
            locations = data if isinstance(data, list) else []
            result = [
                {
                    "id": loc.get("id"),
                    "name": loc.get("name", ""),
                    "completename": loc.get("completename", ""),
                    "comment": loc.get("comment", ""),
                    "building": loc.get("building", ""),
                    "room": loc.get("room", ""),
                }
                for loc in locations
            ]
            logger.debug("glpi_locations_fetched", count=len(result))
            return result
        except Exception as e:
            logger.error("glpi_get_locations_failed", error=str(e))
            raise

    async def get_computers_by_location(self, location_id: int) -> list[dict]:
        """
        [GLPI API] Get computers in a specific physical location.
        GET /apirest.php/Computer filtered by locations_id
        """
        if self._settings.should_mock_glpi:
            from services.mock_service import MockService
            return MockService.glpi_get_assets(location_id=location_id)
        try:
            params: dict[str, Any] = {
                "searchText[locations_id]": str(location_id),
                "expand_dropdowns": 1,
                "range": "0-999",
            }
            data = await self._api_request("GET", "/Computer", params=params)
            computers = data if isinstance(data, list) else []
            result = [self._normalize_computer(c) for c in computers]
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
        """
        [GLPI API] Get tickets filtered by status/priority/assignee.
        GET /apirest.php/Ticket
        Filters for categories: red | hardware | so | seguridad
        """
        if self._settings.should_mock_glpi:
            from services.mock_service import MockService
            return MockService.glpi_get_tickets(status=status, limit=limit, offset=offset)
        try:
            params: dict[str, Any] = {
                "range": f"{offset}-{offset + limit - 1}",
                "expand_dropdowns": 1,
                "sort": "date",
                "order": "DESC",
            }
            if priority:
                params["searchText[priority]"] = str(priority)

            data = await self._api_request("GET", "/Ticket", params=params)
            tickets = data if isinstance(data, list) else []
            result = [self._normalize_ticket(t) for t in tickets]
            logger.debug("glpi_tickets_fetched", count=len(result))
            return result
        except Exception as e:
            logger.error("glpi_get_tickets_failed", error=str(e))
            raise

    async def get_ticket(self, ticket_id: int) -> dict:
        """
        [GLPI API] Get full details of a ticket.
        GET /apirest.php/Ticket/{id}
        """
        if self._settings.should_mock_glpi:
            from services.mock_service import MockService
            ticket = MockService.glpi_get_ticket(ticket_id)
            if ticket is None:
                raise ValueError(f"Ticket #{ticket_id} not found in mock data")
            return ticket
        try:
            data = await self._api_request(
                "GET",
                f"/Ticket/{ticket_id}",
                params={"expand_dropdowns": 1},
            )
            result = self._normalize_ticket(data)
            logger.debug("glpi_ticket_fetched", id=ticket_id)
            return result
        except Exception as e:
            logger.error("glpi_get_ticket_failed", id=ticket_id, error=str(e))
            raise

    async def create_ticket(self, data: dict) -> dict:
        """
        [GLPI API] Create a new ticket.
        POST /apirest.php/Ticket
        """
        if self._settings.should_mock_glpi:
            from services.mock_service import MockService
            return MockService.glpi_create_ticket(data)
        try:
            payload = {
                "input": {
                    "name": data["title"],
                    "content": data.get("description", ""),
                    "priority": data.get("priority", 3),
                    "itilcategories_id": data.get("category_id", 0),
                    "type": 1,  # 1=Incidencia, 2=Requerimiento
                }
            }
            if data.get("asset_id"):
                # Link ticket to computer item
                payload["input"]["itemtype"] = "Computer"
                payload["input"]["items_id"] = data["asset_id"]

            result = await self._api_request("POST", "/Ticket", json_body=payload)
            ticket_id = result.get("id") if isinstance(result, dict) else None
            logger.info("glpi_ticket_created", title=data["title"], id=ticket_id)
            return {"id": ticket_id, "title": data["title"], "created": True}
        except Exception as e:
            logger.error("glpi_create_ticket_failed", title=data.get("title"), error=str(e))
            raise

    async def update_ticket_status(self, ticket_id: int, status: int) -> dict:
        """
        [GLPI API] Update ticket status.
        PUT /apirest.php/Ticket/{id}
        GLPI ticket statuses: 1=Nuevo, 2=En proceso (asignado), 3=En proceso (planificado),
        4=Pendiente, 5=Resuelto, 6=Cerrado
        """
        if self._settings.should_mock_glpi:
            from services.mock_service import MockService
            return MockService.glpi_update_ticket_status(ticket_id, status)
        try:
            await self._api_request(
                "PUT",
                f"/Ticket/{ticket_id}",
                json_body={"input": {"id": ticket_id, "status": status}},
            )
            logger.info("glpi_ticket_status_updated", id=ticket_id, status=status)
            return {"id": ticket_id, "status": status, "updated": True}
        except Exception as e:
            logger.error("glpi_update_ticket_status_failed", id=ticket_id, error=str(e))
            raise

    # ── Users ─────────────────────────────────────────────────────

    async def get_users(self, search: str | None = None, limit: int = 100) -> list[dict]:
        """
        [GLPI API] Get users from GLPI.
        GET /apirest.php/User
        """
        if self._settings.should_mock_glpi:
            from services.mock_data import MockData
            users = MockData.glpi.users()
            if search:
                users = [u for u in users if search.lower() in u.get("name", "").lower()]
            return users[:limit]
        try:
            params: dict[str, Any] = {
                "range": f"0-{limit - 1}",
                "expand_dropdowns": 1,
            }
            if search:
                params["searchText[name]"] = search

            data = await self._api_request("GET", "/User", params=params)
            users = data if isinstance(data, list) else []
            result = [self._normalize_user(u) for u in users]
            logger.debug("glpi_users_fetched", count=len(result))
            return result
        except Exception as e:
            logger.error("glpi_get_users_failed", error=str(e))
            raise

    async def get_user_assets(self, user_id: int) -> list[dict]:
        """
        [GLPI API] Get computers assigned to a specific user.
        GET /apirest.php/Computer with users filter
        """
        try:
            params: dict[str, Any] = {
                "searchText[users_id_tech]": str(user_id),
                "expand_dropdowns": 1,
                "range": "0-999",
            }
            data = await self._api_request("GET", "/Computer", params=params)
            computers = data if isinstance(data, list) else []
            result = [self._normalize_computer(c) for c in computers]
            logger.debug("glpi_user_assets_fetched", user_id=user_id, count=len(result))
            return result
        except Exception as e:
            logger.error("glpi_get_user_assets_failed", user_id=user_id, error=str(e))
            raise

    # ── Hybrid: Health ────────────────────────────────────────────

    async def get_assets_health(
        self,
        wazuh_agents: list[dict],
        arp_table: list[dict],
    ) -> list[dict]:
        """
        [GLPI API + Wazuh API + MikroTik API] Compute combined health status.
        Receives pre-fetched Wazuh agents and MikroTik ARP table.
        Correlates by IP address.
        Returns per-asset: glpi_status + wazuh_agent + network_visible + health
        """
        try:
            computers = await self.get_computers(limit=500)

            # Build lookup maps
            wazuh_by_ip = {a.get("ip", ""): a for a in wazuh_agents if a.get("ip")}
            arp_ips = {e.get("ip_address", "") for e in arp_table}

            result = []
            for computer in computers:
                ip = computer.get("ip") or ""
                glpi_status = computer.get("status", "activo")

                # Wazuh check
                wazuh_entry = wazuh_by_ip.get(ip)
                if wazuh_entry:
                    wazuh_status = wazuh_entry.get("status", "disconnected")
                    if wazuh_status == "active":
                        wazuh_agent = "active"
                    else:
                        wazuh_agent = "disconnected"
                elif ip:
                    wazuh_agent = "not_installed"
                else:
                    wazuh_agent = "not_installed"

                # Network check (ARP table)
                network_visible = ip in arp_ips if ip else False

                # Compute health
                if (
                    glpi_status == "activo"
                    and wazuh_agent == "active"
                    and network_visible
                ):
                    health = "ok"
                    health_reason = ""
                elif wazuh_agent == "disconnected" and not network_visible:
                    health = "critical"
                    health_reason = "Agente Wazuh desconectado y equipo no visible en red"
                else:
                    issues = []
                    if glpi_status != "activo":
                        issues.append(f"Estado GLPI: {glpi_status}")
                    if wazuh_agent != "active":
                        issues.append(f"Wazuh: {wazuh_agent}")
                    if not network_visible:
                        issues.append("No visible en ARP")
                    health = "warning"
                    health_reason = " | ".join(issues)

                result.append({
                    "asset_id": computer.get("id"),
                    "name": computer.get("name", ""),
                    "ip": ip,
                    "location": computer.get("location", ""),
                    "glpi_status": glpi_status,
                    "wazuh_agent": wazuh_agent,
                    "network_visible": network_visible,
                    "health": health,
                    "health_reason": health_reason,
                })

            logger.debug("glpi_health_computed", assets=len(result))
            return result
        except Exception as e:
            logger.error("glpi_get_health_failed", error=str(e))
            raise

    async def get_asset_network_context(
        self, computer_id: int, arp_table: list[dict]
    ) -> dict:
        """
        [GLPI API + MikroTik API] Get network context for a specific asset.
        Looks up MAC address in ARP table to find interface/VLAN.
        """
        try:
            computer = await self.get_computer(computer_id)
            mac = computer.get("mac", "")
            ip = computer.get("ip", "")

            # Search ARP by IP or MAC
            interface = ""
            vlan = ""
            last_seen = ""
            ip_assigned = ip

            for entry in arp_table:
                if (
                    (mac and entry.get("mac_address", "").upper() == mac.upper())
                    or (ip and entry.get("ip_address") == ip)
                ):
                    interface = entry.get("interface", "")
                    ip_assigned = entry.get("ip_address", ip)
                    last_seen = "Ahora"  # ARP entries are live
                    break

            # Extract VLAN from interface name if present (e.g. "vlan10" → "10")
            if "vlan" in interface.lower():
                vlan = interface.lower().replace("vlan", "").strip()

            result = {
                "asset_id": computer_id,
                "asset_name": computer.get("name", ""),
                "interface": interface,
                "vlan": vlan,
                "ip_assigned": ip_assigned,
                "last_seen": last_seen,
                "mac": mac,
            }

            # Update computer in GLPI with network info if found
            if interface and not computer.get("comment", "").startswith("[NetShield]"):
                try:
                    comment = f"[NetShield] Interface: {interface}, VLAN: {vlan or 'N/A'}, Last seen: Activo"
                    await self.update_computer(computer_id, {"comment": comment})
                except Exception:
                    pass  # Non-critical: GLPI update failure doesn't block response

            logger.debug("glpi_network_context", id=computer_id, interface=interface)
            return result
        except Exception as e:
            logger.error("glpi_get_network_context_failed", id=computer_id, error=str(e))
            raise

    # ── Quarantine ────────────────────────────────────────────────

    async def quarantine_asset(self, computer_id: int, reason: str) -> dict:
        """
        [GLPI API] Mark asset as "Bajo Investigación" and create incident ticket.
        Updates computer state + creates automatic ticket.
        """
        if self._settings.should_mock_glpi:
            from services.mock_service import MockService
            return MockService.glpi_quarantine_asset(computer_id, reason)
        try:
            # 1. Update state to "bajo_investigacion" (state_id=5 in default GLPI)
            await self.update_computer(computer_id, {"status": "bajo_investigacion"})

            # 2. Create automatic ticket
            ticket_data = {
                "title": f"[NetShield] Cuarentena automática — Activo #{computer_id}",
                "description": (
                    f"Cuarentena iniciada automáticamente por NetShield Dashboard.\n"
                    f"Motivo: {reason}\n"
                    f"Fecha: {datetime.now(timezone.utc).isoformat()}"
                ),
                "priority": 4,  # Alta
                "asset_id": computer_id,
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
        """
        [GLPI API] Restore asset status and close quarantine ticket.
        """
        if self._settings.should_mock_glpi:
            from services.mock_service import MockService
            return MockService.glpi_unquarantine_asset(computer_id)
        try:
            # Restore to "activo"
            await self.update_computer(computer_id, {"status": "activo"})

            logger.info("glpi_asset_unquarantined", id=computer_id)
            return {"asset_id": computer_id, "unquarantined": True}
        except Exception as e:
            logger.error("glpi_unquarantine_failed", id=computer_id, error=str(e))
            raise

    async def kill_session(self) -> None:
        """
        [GLPI API] Close the current GLPI session.
        GET /apirest.php/killSession
        """
        if self._session_token is None:
            return
        try:
            client = self._get_client()
            await client.get(
                "/killSession",
                headers={
                    "App-Token": self._settings.glpi_app_token,
                    "Session-Token": self._session_token,
                },
            )
            self._session_token = None
            logger.info("glpi_session_killed")
        except Exception as e:
            logger.warning("glpi_kill_session_failed", error=str(e))

    async def close(self) -> None:
        """Kill session and close the HTTP client."""
        await self.kill_session()
        if self._client and not self._client.is_closed:
            await self._client.aclose()
            logger.info("glpi_client_closed")

    # ── Normalizers ───────────────────────────────────────────────

    def _normalize_computer(self, raw: dict) -> dict:
        """Normalize GLPI Computer raw data to consistent schema."""
        state_id = raw.get("states_id", 1)
        # GLPI may return state as a dict when expand_dropdowns=1
        if isinstance(state_id, dict):
            state_name = state_id.get("name", "activo").lower()
            state_id = GLPI_STATE_IDS.get(state_name, 1)
        status = GLPI_STATES.get(int(state_id) if state_id else 1, "activo")

        # Location may be a dict (expanded) or an ID
        location = raw.get("locations_id", "")
        if isinstance(location, dict):
            location = location.get("completename", "") or location.get("name", "")

        # User (technician / assigned user)
        user = raw.get("users_id_tech", "")
        if isinstance(user, dict):
            user = user.get("name", "")

        # Extract IP from network ports if available
        ip = ""
        network_ports = raw.get("_networkports", {})
        if isinstance(network_ports, dict):
            for port_type_list in network_ports.values():
                if isinstance(port_type_list, list):
                    for port in port_type_list:
                        addrs = port.get("NetworkName", {}).get("IPAddress", [])
                        if isinstance(addrs, list) and addrs:
                            ip = addrs[0].get("name", "")
                            break

        # MAC from network ports
        mac = ""
        if isinstance(network_ports, dict):
            for port_type_list in network_ports.values():
                if isinstance(port_type_list, list):
                    for port in port_type_list:
                        mac = port.get("mac", "")
                        if mac:
                            break

        return {
            "id": raw.get("id"),
            "name": raw.get("name", ""),
            "serial": raw.get("serial", ""),
            "ip": ip,
            "mac": mac,
            "os": raw.get("operatingsystems_id", ""),
            "cpu": raw.get("processors", ""),
            "ram": raw.get("ram", ""),
            "location": location,
            "location_id": raw.get("locations_id") if not isinstance(raw.get("locations_id"), dict) else None,
            "assigned_user": user,
            "status": status,
            "comment": raw.get("comment", ""),
            "last_update": raw.get("date_mod", ""),
        }

    def _normalize_search_result(self, raw: dict) -> dict:
        """Normalize GLPI search result (different structure from direct GET)."""
        return {
            "id": raw.get("2"),           # GLPI field 2 = id
            "name": raw.get("1", ""),     # field 1 = name
            "serial": raw.get("5", ""),   # field 5 = serial
            "ip": raw.get("126", ""),     # field 126 = IP
            "location": raw.get("3", ""), # field 3 = location
            "status": GLPI_STATES.get(raw.get("31", 1), "activo"),  # field 31 = state
            "mac": "",
            "os": "",
            "comment": "",
            "last_update": "",
        }

    def _normalize_ticket(self, raw: dict) -> dict:
        """Normalize GLPI Ticket raw data."""
        priority = raw.get("priority", 3)
        status_id = raw.get("status", 1)
        # Map GLPI status to kanban column
        if status_id in (1, 2):
            status = "pendiente"
        elif status_id in (3, 4):
            status = "en_progreso"
        else:
            status = "resuelto"

        assigned_user = raw.get("users_id_assign", "")
        if isinstance(assigned_user, dict):
            assigned_user = assigned_user.get("name", "")

        # Asset linked (may not be present)
        asset_name = ""
        items_id = raw.get("items_id", "")
        if isinstance(items_id, dict):
            asset_name = items_id.get("name", "")

        return {
            "id": raw.get("id"),
            "title": raw.get("name", ""),
            "description": raw.get("content", ""),
            "priority": priority,
            "priority_label": GLPI_PRIORITIES.get(priority, "Media"),
            "status": status,
            "status_id": status_id,
            "assigned_user": assigned_user,
            "asset_name": asset_name,
            "asset_id": raw.get("items_id") if not isinstance(raw.get("items_id"), dict) else None,
            "category": raw.get("itilcategories_id", ""),
            "created_at": raw.get("date", ""),
            "due_date": raw.get("time_to_resolve", ""),
            "is_netshield": raw.get("name", "").startswith("[NetShield]"),
        }

    def _normalize_user(self, raw: dict) -> dict:
        """Normalize GLPI User raw data."""
        return {
            "id": raw.get("id"),
            "name": raw.get("name", ""),
            "realname": raw.get("realname", ""),
            "firstname": raw.get("firstname", ""),
            "email": raw.get("email", ""),
            "department": raw.get("usertitles_id", ""),
            "display_name": f"{raw.get('firstname', '')} {raw.get('realname', '')}".strip()
                or raw.get("name", ""),
        }

    async def _get_asset_tickets(self, item_id: int, item_type: str = "Computer") -> list[dict]:
        """Get tickets linked to a specific asset."""
        try:
            params: dict[str, Any] = {
                "searchText[itemtype]": item_type,
                "searchText[items_id]": str(item_id),
                "expand_dropdowns": 1,
                "range": "0-19",
            }
            data = await self._api_request("GET", "/Ticket", params=params)
            tickets = data if isinstance(data, list) else []
            return [self._normalize_ticket(t) for t in tickets]
        except Exception:
            return []


def get_glpi_service() -> GLPIService:
    """Get the GLPI service singleton."""
    return GLPIService()
