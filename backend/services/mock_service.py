"""
Mock Service — Facade con estado en memoria para las operaciones del sistema de mock.

Responsabilidades:
- Proveer mock status del sistema
- Mantener estado mutable en memoria para CRUD de GLPI y Portal (resetea al reiniciar)
- Proveer helpers de verificación de modo mock
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import structlog

from config import get_settings
from services.mock_data import MockData

logger = structlog.get_logger(__name__)


class MockService:
    """
    Facade que centraliza:
    - Verificación de modo mock por servicio
    - Estado en memoria para operaciones CRUD (GLPI, Portal)
    - Mock status para el endpoint /api/system/mock-status
    """

    # ── In-memory stores (reset on server restart) ─────────────────────
    _glpi_assets: list[dict] | None = None
    _glpi_tickets: list[dict] | None = None
    _portal_users: list[dict] | None = None
    _next_glpi_id: int = 900
    _next_ticket_id: int = 900
    _blocked_ips: list[str] = []
    # CrowdSec mutable state
    _crowdsec_decisions: list[dict] | None = None
    _crowdsec_whitelist: list[dict] | None = None
    _next_crowdsec_id: int = 200
    _next_whitelist_id: int = 100
    # Suricata mutable state
    _suricata_autoresponse_config: dict | None = None
    _suricata_autoresponse_history: list[dict] | None = None
    _next_autoresponse_id: int = 10

    # ── Initialization ─────────────────────────────────────────────────────

    @classmethod
    def _ensure_glpi_assets(cls) -> list[dict]:
        if cls._glpi_assets is None:
            cls._glpi_assets = [dict(c) for c in MockData.glpi.computers()]
        return cls._glpi_assets

    @classmethod
    def _ensure_glpi_tickets(cls) -> list[dict]:
        if cls._glpi_tickets is None:
            cls._glpi_tickets = [dict(t) for t in MockData.glpi.tickets()]
        return cls._glpi_tickets

    @classmethod
    def _ensure_portal_users(cls) -> list[dict]:
        if cls._portal_users is None:
            cls._portal_users = [dict(u) for u in MockData.portal.users()]
        return cls._portal_users

    @classmethod
    def reset(cls) -> None:
        """Reset all in-memory state to initial mock data. Useful for tests."""
        cls._glpi_assets = None
        cls._glpi_tickets = None
        cls._portal_users = None
        cls._next_glpi_id = 900
        cls._next_ticket_id = 900
        cls._blocked_ips = []
        cls._crowdsec_decisions = None
        cls._crowdsec_whitelist = None
        cls._next_crowdsec_id = 200
        cls._next_whitelist_id = 100
        cls._suricata_autoresponse_config = None
        cls._suricata_autoresponse_history = None
        cls._next_autoresponse_id = 10
        logger.info("mock_service_reset")

    # ── Status ─────────────────────────────────────────────────────────────

    @classmethod
    def get_mock_status(cls) -> dict:
        """Return structured mock status for GET /api/system/mock-status."""
        settings = get_settings()
        services = {
            "mikrotik": settings.should_mock_mikrotik,
            "wazuh": settings.should_mock_wazuh,
            "glpi": settings.should_mock_glpi,
            "anthropic": settings.should_mock_anthropic,
            "crowdsec": settings.should_mock_crowdsec,
            "geoip": settings.should_mock_geoip,
            "suricata": settings.should_mock_suricata,
            "telegram": settings.should_mock_telegram,
        }
        return {
            "mock_all": settings._effective_mock_all,
            "services": services,
            "any_mock_active": any(services.values()),
        }

    # ── GLPI CRUD ──────────────────────────────────────────────────────────

    @classmethod
    def glpi_get_assets(
        cls,
        search: str | None = None,
        status: str | None = None,
        location_id: int | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[dict]:
        assets = cls._ensure_glpi_assets()
        result = list(assets)
        if search:
            q = search.lower()
            result = [a for a in result if q in a["name"].lower() or q in (a.get("ip") or "").lower()]
        if status:
            result = [a for a in result if a.get("status") == status]
        if location_id is not None:
            result = [a for a in result if a.get("location_id") == location_id]
        return result[offset: offset + limit]

    @classmethod
    def glpi_get_asset(cls, asset_id: int) -> dict | None:
        assets = cls._ensure_glpi_assets()
        return next((a for a in assets if a["id"] == asset_id), None)

    @classmethod
    def glpi_create_asset(cls, data: dict) -> dict:
        cls._next_glpi_id += 1
        new_id = cls._next_glpi_id
        asset: dict[str, Any] = {
            "id": new_id,
            "name": data.get("name", f"PC-Mock-{new_id}"),
            "serial": data.get("serial", ""),
            "ip": data.get("ip", ""),
            "mac": "",
            "os": data.get("os", ""),
            "cpu": "",
            "ram": "",
            "location": "",
            "location_id": data.get("location_id"),
            "assigned_user": data.get("assigned_user_id", ""),
            "status": data.get("status", "activo"),
            "comment": data.get("comment", ""),
            "last_update": datetime.now(timezone.utc).isoformat(),
            "tickets": [],
        }
        cls._ensure_glpi_assets().append(asset)
        logger.info("mock_glpi_asset_created", id=new_id, name=asset["name"])
        return {"id": new_id, "name": asset["name"], "created": True, "mock": True}

    @classmethod
    def glpi_update_asset(cls, asset_id: int, data: dict) -> dict:
        assets = cls._ensure_glpi_assets()
        for asset in assets:
            if asset["id"] == asset_id:
                for k, v in data.items():
                    if k in asset and v is not None:
                        asset[k] = v
                asset["last_update"] = datetime.now(timezone.utc).isoformat()
                logger.info("mock_glpi_asset_updated", id=asset_id)
                return {"id": asset_id, "updated": True, "mock": True}
        return {"id": asset_id, "updated": False, "mock": True, "error": "Not found"}

    @classmethod
    def glpi_quarantine_asset(cls, asset_id: int, reason: str) -> dict:
        cls.glpi_update_asset(asset_id, {"status": "bajo_investigacion"})
        ticket = cls.glpi_create_ticket({
            "title": f"[NetShield] Cuarentena automática — Activo #{asset_id}",
            "description": f"Motivo: {reason}",
            "priority": 4,
            "asset_id": asset_id,
        })
        return {"asset_id": asset_id, "quarantined": True, "ticket_id": ticket["id"], "reason": reason, "mock": True}

    @classmethod
    def glpi_unquarantine_asset(cls, asset_id: int) -> dict:
        cls.glpi_update_asset(asset_id, {"status": "activo"})
        return {"asset_id": asset_id, "unquarantined": True, "mock": True}

    @classmethod
    def glpi_get_tickets(
        cls,
        status: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[dict]:
        tickets = cls._ensure_glpi_tickets()
        result = list(tickets)
        if status:
            result = [t for t in result if t.get("status") == status]
        return result[offset: offset + limit]

    @classmethod
    def glpi_get_ticket(cls, ticket_id: int) -> dict | None:
        """Get a single ticket by ID from in-memory store."""
        tickets = cls._ensure_glpi_tickets()
        return next((t for t in tickets if t["id"] == ticket_id), None)

    @classmethod
    def glpi_create_ticket(cls, data: dict) -> dict:
        cls._next_ticket_id += 1
        new_id = cls._next_ticket_id
        ticket: dict[str, Any] = {
            "id": new_id,
            "title": data.get("title", f"Ticket #{new_id}"),
            "description": data.get("description", ""),
            "priority": data.get("priority", 3),
            "priority_label": {1: "Muy Baja", 2: "Baja", 3: "Media", 4: "Alta", 5: "Muy Alta"}.get(data.get("priority", 3), "Media"),
            "status": "pendiente",
            "status_id": 1,
            "assigned_user": "",
            "asset_name": "",
            "asset_id": data.get("asset_id"),
            "category": data.get("category", ""),
            "created_at": datetime.now(timezone.utc).isoformat(),
            "due_date": "",
            "is_netshield": data.get("title", "").startswith("[NetShield]"),
        }
        cls._ensure_glpi_tickets().append(ticket)
        logger.info("mock_glpi_ticket_created", id=new_id)
        return {"id": new_id, "title": ticket["title"], "created": True, "mock": True}

    @classmethod
    def glpi_update_ticket_status(cls, ticket_id: int, status: int) -> dict:
        tickets = cls._ensure_glpi_tickets()
        status_map = {1: "pendiente", 2: "pendiente", 3: "en_progreso", 4: "en_progreso", 5: "resuelto", 6: "resuelto"}
        for ticket in tickets:
            if ticket["id"] == ticket_id:
                ticket["status_id"] = status
                ticket["status"] = status_map.get(status, "pendiente")
                logger.info("mock_glpi_ticket_status_updated", id=ticket_id, status=status)
                return {"id": ticket_id, "status": status, "updated": True, "mock": True}
        return {"id": ticket_id, "updated": False, "mock": True, "error": "Not found"}

    # ── Portal CRUD ────────────────────────────────────────────────────────

    @classmethod
    def portal_get_users(
        cls,
        search: str | None = None,
        profile: str | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list[dict]:
        users = cls._ensure_portal_users()
        result = list(users)
        if search:
            q = search.lower()
            result = [u for u in result if q in u["name"].lower()]
        if profile:
            result = [u for u in result if u.get("profile") == profile]
        return result[offset: offset + limit]

    @classmethod
    def portal_create_user(cls, data: dict) -> dict:
        users = cls._ensure_portal_users()
        name = data.get("name", "")
        if any(u["name"] == name for u in users):
            return {"error": f"User '{name}' already exists", "mock": True}
        user: dict[str, Any] = {
            "name": name,
            "profile": data.get("profile", "default"),
            "password": "***",
            "comment": data.get("comment", ""),
            "uptime_limit": data.get("uptime_limit", ""),
            "bytes_in": 0,
            "bytes_out": 0,
            "disabled": False,
        }
        users.append(user)
        logger.info("mock_portal_user_created", name=name)
        return {"name": name, "created": True, "mock": True}

    @classmethod
    def portal_update_user(cls, username: str, data: dict) -> dict:
        users = cls._ensure_portal_users()
        for user in users:
            if user["name"] == username:
                for k, v in data.items():
                    if v is not None:
                        user[k] = v
                logger.info("mock_portal_user_updated", name=username)
                return {"name": username, "updated": True, "mock": True}
        return {"name": username, "updated": False, "error": "Not found", "mock": True}

    @classmethod
    def portal_delete_user(cls, username: str) -> dict:
        users = cls._ensure_portal_users()
        before = len(users)
        cls._portal_users = [u for u in users if u["name"] != username]
        deleted = len(users) != before
        logger.info("mock_portal_user_deleted", name=username, found=deleted)
        if not deleted:
            raise ValueError(f"User '{username}' not found")
        return {"name": username, "deleted": True, "mock": True}

    @classmethod
    def portal_disconnect_user(cls, username: str) -> dict:
        return {"username": username, "sessions_disconnected": 1, "mock": True}

    @classmethod
    def portal_bulk_create_users(cls, users_data: list[dict]) -> dict:
        success_count = 0
        failed_count = 0
        results = []
        for u in users_data:
            result = cls.portal_create_user(u)
            if "error" in result:
                failed_count += 1
                results.append({"name": u.get("name"), "success": False, "error": result["error"]})
            else:
                success_count += 1
                results.append({"name": u.get("name"), "success": True})
        return {
            "total": len(users_data),
            "success_count": success_count,
            "failed_count": failed_count,
            "results": results,
            "mock": True,
        }

    # ── MikroTik state (simple, no mutation needed) ─────────────────────────

    @classmethod
    def mikrotik_block_ip(cls, ip: str, comment: str = "") -> dict:
        if ip not in cls._blocked_ips:
            cls._blocked_ips.append(ip)
        logger.info("mock_mikrotik_block_ip", ip=ip)
        return {"ip": ip, "blocked": True, "list": "Blacklist_Automatica", "comment": comment, "mock": True}

    @classmethod
    def mikrotik_unblock_ip(cls, ip: str) -> dict:
        if ip in cls._blocked_ips:
            cls._blocked_ips.remove(ip)
        logger.info("mock_mikrotik_unblock_ip", ip=ip)
        return {"ip": ip, "unblocked": True, "mock": True}

    # ── CrowdSec CRUD ────────────────────────────────────────────────────

    @classmethod
    def _ensure_crowdsec_decisions(cls) -> list[dict]:
        if cls._crowdsec_decisions is None:
            cls._crowdsec_decisions = MockData.crowdsec.decisions()
        return cls._crowdsec_decisions

    @classmethod
    def _ensure_crowdsec_whitelist(cls) -> list[dict]:
        if cls._crowdsec_whitelist is None:
            cls._crowdsec_whitelist = []
        return cls._crowdsec_whitelist

    @classmethod
    def crowdsec_get_decisions(cls) -> list[dict]:
        return list(cls._ensure_crowdsec_decisions())

    @classmethod
    def crowdsec_add_decision(
        cls, ip: str, duration: str, reason: str, type_: str = "ban"
    ) -> dict:
        from datetime import timedelta
        decisions = cls._ensure_crowdsec_decisions()
        new_id = f"cs-{cls._next_crowdsec_id}"
        cls._next_crowdsec_id += 1
        entry = {
            "id": new_id, "ip": ip, "type": type_,
            "duration": duration, "reason": reason,
            "origin": "cscli", "scenario": reason,
            "country": "—", "as_name": "—",
            "expires_at": (datetime.now(timezone.utc) + timedelta(hours=24)).isoformat(),
            "community_score": 0, "reported_by": 0,
            "is_known_attacker": False, "mock": True,
        }
        decisions.append(entry)
        logger.info("mock_crowdsec_add_decision", ip=ip, type_=type_)
        return entry

    @classmethod
    def crowdsec_delete_decision(cls, decision_id: str) -> bool:
        decisions = cls._ensure_crowdsec_decisions()
        before = len(decisions)
        cls._crowdsec_decisions = [d for d in decisions if d["id"] != decision_id]
        removed = len(cls._crowdsec_decisions) < before
        logger.info("mock_crowdsec_delete_decision", id=decision_id, removed=removed)
        return removed

    @classmethod
    def crowdsec_delete_decisions_by_ip(cls, ip: str) -> int:
        decisions = cls._ensure_crowdsec_decisions()
        before = len(decisions)
        cls._crowdsec_decisions = [d for d in decisions if d["ip"] != ip]
        count = before - len(cls._crowdsec_decisions)
        logger.info("mock_crowdsec_delete_by_ip", ip=ip, count=count)
        return count

    @classmethod
    def crowdsec_get_whitelist(cls) -> list[dict]:
        return list(cls._ensure_crowdsec_whitelist())

    @classmethod
    def crowdsec_add_whitelist(cls, ip: str, reason: str) -> dict:
        wl = cls._ensure_crowdsec_whitelist()
        entry = {
            "id": cls._next_whitelist_id,
            "ip": ip, "reason": reason,
            "added_by": "admin",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "mock": True,
        }
        cls._next_whitelist_id += 1
        wl.append(entry)
        logger.info("mock_crowdsec_add_whitelist", ip=ip)
        return entry

    @classmethod
    def crowdsec_delete_whitelist(cls, whitelist_id: int) -> bool:
        wl = cls._ensure_crowdsec_whitelist()
        before = len(wl)
        cls._crowdsec_whitelist = [e for e in wl if e["id"] != whitelist_id]
        removed = len(cls._crowdsec_whitelist) < before
        logger.info("mock_crowdsec_delete_whitelist", id=whitelist_id, removed=removed)
        return removed

    # ── Suricata Auto-response CRUD ─────────────────────────────────────────

    @classmethod
    def _ensure_suricata_autoresponse_config(cls) -> dict:
        if cls._suricata_autoresponse_config is None:
            from services.mock_data import MockData
            cls._suricata_autoresponse_config = dict(MockData.suricata.autoresponse_config())
        return cls._suricata_autoresponse_config

    @classmethod
    def _ensure_suricata_autoresponse_history(cls) -> list[dict]:
        if cls._suricata_autoresponse_history is None:
            from services.mock_data import MockData
            cls._suricata_autoresponse_history = list(MockData.suricata.autoresponse_history())
        return cls._suricata_autoresponse_history

    @classmethod
    def suricata_get_autoresponse_config(cls) -> dict:
        return dict(cls._ensure_suricata_autoresponse_config())

    @classmethod
    def suricata_update_autoresponse_config(cls, data: dict) -> dict:
        from datetime import datetime, timezone
        cfg = cls._ensure_suricata_autoresponse_config()
        for k, v in data.items():
            if v is not None and k in cfg:
                cfg[k] = v
        cfg["last_updated"] = datetime.now(timezone.utc).isoformat()
        cfg["updated_by"] = "admin"
        logger.info("mock_suricata_autoresponse_config_updated")
        return dict(cfg)

    @classmethod
    def suricata_add_autoresponse_trigger(
        cls,
        ip: str,
        trigger_alert_id: str,
        duration: str,
        reason: str,
        actions_taken: list[str],
    ) -> dict:
        from datetime import datetime, timezone
        history = cls._ensure_suricata_autoresponse_history()
        cls._next_autoresponse_id += 1
        entry = {
            "id": f"ar-{cls._next_autoresponse_id:03d}",
            "ip": ip,
            "triggered_at": datetime.now(timezone.utc).isoformat(),
            "triggered_by": "admin",
            "trigger_alert_id": trigger_alert_id,
            "suricata_alerts_count": 1,
            "wazuh_level": None,
            "actions_taken": actions_taken,
            "duration": duration,
            "reason": reason,
            "mock": True,
        }
        history.insert(0, entry)
        logger.info("mock_suricata_autoresponse_triggered", ip=ip)
        return entry


def get_mock_service() -> MockService:
    """Return the MockService class (it uses class methods, no instance needed)."""
    return MockService
