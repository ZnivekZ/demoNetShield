"""
GLPI Router - Endpoints for Asset Management / Inventory.
Prefix: /api/glpi

All endpoints delegate mock logic to GLPIService (via should_mock_glpi from config).
No mock logic in this router — service layer handles it.
Destructive actions (quarantine) are logged in action_logs + quarantine_logs.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone

import structlog
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models.action_log import ActionLog
from models.quarantine_log import QuarantineLog
from schemas.common import APIResponse
from schemas.glpi import (
    GlpiAssetCreate,
    GlpiAssetUpdate,
    GlpiAvailability,
    GlpiQuarantineRequest,
    GlpiTicketCreate,
    GlpiTicketStatusUpdate,
    NetworkMaintenanceRequest,
)
from services.glpi_service import GLPIService, get_glpi_service
from services.mikrotik_service import MikroTikService, get_mikrotik_service
from services.wazuh_service import WazuhService, get_wazuh_service

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/api/glpi", tags=["GLPI - Inventario"])


# ── Dependencies ──────────────────────────────────────────────────

def get_glpi() -> GLPIService:
    return get_glpi_service()


def get_mt() -> MikroTikService:
    return get_mikrotik_service()


def get_wz() -> WazuhService:
    return get_wazuh_service()


# ── GLPI Availability ─────────────────────────────────────────────

@router.get("/status")
async def get_glpi_status(
    glpi: GLPIService = Depends(get_glpi),
) -> APIResponse:
    """[GLPI API] Check if GLPI is reachable (or if mock mode is active)."""
    try:
        from config import get_settings
        settings = get_settings()
        if settings.should_mock_glpi:
            return APIResponse.ok(
                GlpiAvailability(
                    available=True,
                    message="GLPI en modo mock — datos simulados activos",
                    url=settings.glpi_url,
                ).model_dump()
            )
        available = await glpi.is_available()
        return APIResponse.ok(
            GlpiAvailability(
                available=available,
                message="GLPI disponible" if available else "GLPI no disponible",
                url=settings.glpi_url,
            ).model_dump()
        )
    except Exception as e:
        logger.error("api_glpi_status_failed", error=str(e))
        return APIResponse.fail(f"Error al verificar GLPI: {str(e)}")


# ── Assets / Computers ────────────────────────────────────────────

@router.get("/assets")
async def get_assets(
    search: str | None = Query(default=None, description="Buscar por nombre, IP o serial"),
    location_id: int | None = Query(default=None),
    status: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    glpi: GLPIService = Depends(get_glpi),
) -> APIResponse:
    """[GLPI API] Get computer inventory. Mock-aware via GLPIService."""
    try:
        computers = await glpi.get_computers(
            search=search, location=location_id, status=status, limit=limit, offset=offset
        )
        logger.info("api_glpi_assets_fetched", count=len(computers))
        return APIResponse.ok({"assets": computers, "total": len(computers)})
    except Exception as e:
        logger.error("api_glpi_get_assets_failed", error=str(e))
        return APIResponse.fail(f"Error al obtener activos: {str(e)}")


@router.get("/assets/stats")
async def get_asset_stats(
    glpi: GLPIService = Depends(get_glpi),
) -> APIResponse:
    """[GLPI API] Get asset count by status. Used for pie chart."""
    try:
        stats = await glpi.get_asset_stats()
        return APIResponse.ok(stats)
    except Exception as e:
        logger.error("api_glpi_get_stats_failed", error=str(e))
        return APIResponse.fail(f"Error al obtener estadísticas: {str(e)}")


@router.get("/assets/search")
async def search_assets(
    q: str = Query(..., min_length=2, description="Query to search by name, IP, or serial"),
    glpi: GLPIService = Depends(get_glpi),
) -> APIResponse:
    """[GLPI API] Full-text search across GLPI computers."""
    try:
        results = await glpi.search_computers(q)
        return APIResponse.ok({"results": results, "query": q})
    except Exception as e:
        logger.error("api_glpi_search_failed", q=q, error=str(e))
        return APIResponse.fail(f"Error en búsqueda: {str(e)}")


@router.get("/assets/health")
async def get_assets_health(
    glpi: GLPIService = Depends(get_glpi),
    wazuh: WazuhService = Depends(get_wz),
    mikrotik: MikroTikService = Depends(get_mt),
) -> APIResponse:
    """[GLPI+Wazuh+MikroTik] Combined asset health dashboard."""
    try:
        wazuh_agents: list[dict] = []
        try:
            wazuh_agents = await wazuh.get_agents()
        except Exception as e:
            logger.warning("api_glpi_health_wazuh_unavailable", error=str(e))

        arp_table: list[dict] = []
        try:
            arp_table = await mikrotik.get_arp_table()
        except Exception as e:
            logger.warning("api_glpi_health_mikrotik_unavailable", error=str(e))

        health_data = await glpi.get_assets_health(wazuh_agents=wazuh_agents, arp_table=arp_table)
        summary = {"ok": 0, "warning": 0, "critical": 0, "total": len(health_data)}
        for item in health_data:
            summary[item["health"]] = summary.get(item["health"], 0) + 1

        logger.info("api_glpi_health_computed", **summary)
        return APIResponse.ok({"assets": health_data, "summary": summary})
    except Exception as e:
        logger.error("api_glpi_get_health_failed", error=str(e))
        return APIResponse.fail(f"Error al calcular salud de activos: {str(e)}")


@router.get("/assets/by-location/{location_id}")
async def get_assets_by_location(
    location_id: int,
    glpi: GLPIService = Depends(get_glpi),
) -> APIResponse:
    """[GLPI API] Get all computers in a specific location."""
    try:
        computers = await glpi.get_computers_by_location(location_id)
        return APIResponse.ok({"assets": computers, "location_id": location_id})
    except Exception as e:
        logger.error("api_glpi_get_by_location_failed", location_id=location_id, error=str(e))
        return APIResponse.fail(f"Error al obtener activos por ubicación: {str(e)}")


@router.get("/assets/{asset_id}")
async def get_asset(
    asset_id: int,
    glpi: GLPIService = Depends(get_glpi),
) -> APIResponse:
    """[GLPI API] Get complete technical detail of a single asset."""
    try:
        computer = await glpi.get_computer(asset_id)
        return APIResponse.ok(computer)
    except Exception as e:
        logger.error("api_glpi_get_asset_failed", asset_id=asset_id, error=str(e))
        return APIResponse.fail(f"Error al obtener activo #{asset_id}: {str(e)}")


@router.get("/assets/{asset_id}/network-context")
async def get_asset_network_context(
    asset_id: int,
    glpi: GLPIService = Depends(get_glpi),
    mikrotik: MikroTikService = Depends(get_mt),
) -> APIResponse:
    """[GLPI+MikroTik] Get network context of a specific asset."""
    try:
        arp_table: list[dict] = []
        try:
            arp_table = await mikrotik.get_arp_table()
        except Exception as e:
            logger.warning("api_glpi_network_context_mikrotik_fail", error=str(e))

        result = await glpi.get_asset_network_context(asset_id, arp_table)
        return APIResponse.ok(result)
    except Exception as e:
        logger.error("api_glpi_network_context_failed", asset_id=asset_id, error=str(e))
        return APIResponse.fail(f"Error al obtener contexto de red: {str(e)}")


@router.post("/assets")
async def create_asset(
    request: GlpiAssetCreate,
    glpi: GLPIService = Depends(get_glpi),
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """[GLPI API] Register a new computer in GLPI inventory."""
    try:
        result = await glpi.create_computer(request.model_dump())
        log_entry = ActionLog(
            action_type="glpi_asset_created",
            details=json.dumps({"asset_name": request.name}),
            comment=f"Activo GLPI creado: {request.name}",
        )
        db.add(log_entry)
        await db.flush()
        logger.info("api_glpi_asset_created", name=request.name)
        return APIResponse.ok(result)
    except Exception as e:
        logger.error("api_glpi_create_asset_failed", name=request.name, error=str(e))
        return APIResponse.fail(f"Error al crear activo: {str(e)}")


@router.put("/assets/{asset_id}")
async def update_asset(
    asset_id: int,
    request: GlpiAssetUpdate,
    glpi: GLPIService = Depends(get_glpi),
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """[GLPI API] Update asset data in GLPI."""
    try:
        result = await glpi.update_computer(asset_id, request.model_dump(exclude_none=True))
        log_entry = ActionLog(
            action_type="glpi_asset_updated",
            details=json.dumps({"asset_id": asset_id, **request.model_dump(exclude_none=True)}),
            comment=f"Activo GLPI #{asset_id} actualizado",
        )
        db.add(log_entry)
        await db.flush()
        logger.info("api_glpi_asset_updated", asset_id=asset_id)
        return APIResponse.ok(result)
    except Exception as e:
        logger.error("api_glpi_update_asset_failed", asset_id=asset_id, error=str(e))
        return APIResponse.fail(f"Error al actualizar activo #{asset_id}: {str(e)}")


@router.post("/assets/{asset_id}/quarantine")
async def quarantine_asset(
    asset_id: int,
    request: GlpiQuarantineRequest,
    glpi: GLPIService = Depends(get_glpi),
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """[GLPI API] Quarantine a GLPI asset."""
    try:
        result = await glpi.quarantine_asset(asset_id, request.reason)
        quarantine_log = QuarantineLog(
            asset_id_glpi=asset_id,
            reason=request.reason,
            wazuh_alert_id=request.wazuh_alert_id,
            mikrotik_block_id=request.mikrotik_block_id,
        )
        db.add(quarantine_log)
        action_log = ActionLog(
            action_type="glpi_quarantine",
            details=json.dumps({
                "asset_id": asset_id, "reason": request.reason,
                "ticket_id": result.get("ticket_id"),
                "wazuh_alert_id": request.wazuh_alert_id,
                "mikrotik_block_id": request.mikrotik_block_id,
            }),
            comment=f"Cuarentena GLPI: activo #{asset_id} — {request.reason[:100]}",
        )
        db.add(action_log)
        await db.flush()
        logger.info("api_glpi_asset_quarantined", asset_id=asset_id, reason=request.reason)
        return APIResponse.ok(result)
    except Exception as e:
        logger.error("api_glpi_quarantine_failed", asset_id=asset_id, error=str(e))
        return APIResponse.fail(f"Error al quarantine activo #{asset_id}: {str(e)}")


@router.post("/assets/{asset_id}/unquarantine")
async def unquarantine_asset(
    asset_id: int,
    glpi: GLPIService = Depends(get_glpi),
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """[GLPI API] Lift quarantine from a GLPI asset."""
    try:
        result = await glpi.unquarantine_asset(asset_id)
        from sqlalchemy import select, update as sa_update
        await db.execute(
            sa_update(QuarantineLog)
            .where(QuarantineLog.asset_id_glpi == asset_id, QuarantineLog.resolved_at.is_(None))
            .values(resolved_at=datetime.now(timezone.utc))
        )
        action_log = ActionLog(
            action_type="glpi_unquarantine",
            details=json.dumps({"asset_id": asset_id}),
            comment=f"Cuarentena GLPI levantada: activo #{asset_id}",
        )
        db.add(action_log)
        await db.flush()
        logger.info("api_glpi_asset_unquarantined", asset_id=asset_id)
        return APIResponse.ok(result)
    except Exception as e:
        logger.error("api_glpi_unquarantine_failed", asset_id=asset_id, error=str(e))
        return APIResponse.fail(f"Error al levantar cuarentena de #{asset_id}: {str(e)}")


# ── Tickets ───────────────────────────────────────────────────────

@router.get("/tickets")
async def get_tickets(
    priority: int | None = Query(default=None, ge=1, le=5),
    status: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    glpi: GLPIService = Depends(get_glpi),
) -> APIResponse:
    """[GLPI API] Get tickets — optionally filtered by priority and status."""
    try:
        tickets = await glpi.get_tickets(priority=priority, status=status, limit=limit, offset=offset)
        kanban: dict = {"pendiente": [], "en_progreso": [], "resuelto": []}
        for ticket in tickets:
            col = ticket.get("status", "pendiente")
            kanban.setdefault(col, []).append(ticket)
        logger.info("api_glpi_tickets_fetched", count=len(tickets))
        return APIResponse.ok({"tickets": tickets, "kanban": kanban})
    except Exception as e:
        logger.error("api_glpi_get_tickets_failed", error=str(e))
        return APIResponse.fail(f"Error al obtener tickets: {str(e)}")


@router.post("/tickets")
async def create_ticket(
    request: GlpiTicketCreate,
    glpi: GLPIService = Depends(get_glpi),
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """[GLPI API] Create a new incident ticket."""
    try:
        result = await glpi.create_ticket(request.model_dump())
        log_entry = ActionLog(
            action_type="glpi_ticket_created",
            details=json.dumps({"ticket_title": request.title, "asset_id": request.asset_id, "priority": request.priority}),
            comment=f"Ticket GLPI creado: {request.title[:80]}",
        )
        db.add(log_entry)
        await db.flush()
        logger.info("api_glpi_ticket_created", title=request.title)
        return APIResponse.ok(result)
    except Exception as e:
        logger.error("api_glpi_create_ticket_failed", title=request.title, error=str(e))
        return APIResponse.fail(f"Error al crear ticket: {str(e)}")


@router.put("/tickets/{ticket_id}/status")
async def update_ticket_status(
    ticket_id: int,
    request: GlpiTicketStatusUpdate,
    glpi: GLPIService = Depends(get_glpi),
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """[GLPI API] Update ticket status (Kanban drag-and-drop)."""
    try:
        result = await glpi.update_ticket_status(ticket_id, request.status)
        log_entry = ActionLog(
            action_type="glpi_ticket_status_updated",
            details=json.dumps({"ticket_id": ticket_id, "status": request.status}),
            comment=f"Ticket GLPI #{ticket_id} estado actualizado a {request.status}",
        )
        db.add(log_entry)
        await db.flush()
        logger.info("api_glpi_ticket_status_updated", ticket_id=ticket_id)
        return APIResponse.ok(result)
    except Exception as e:
        logger.error("api_glpi_update_ticket_status_failed", ticket_id=ticket_id, error=str(e))
        return APIResponse.fail(f"Error al actualizar ticket #{ticket_id}: {str(e)}")


@router.post("/tickets/network-maintenance")
async def create_network_maintenance_ticket(
    request: NetworkMaintenanceRequest,
    glpi: GLPIService = Depends(get_glpi),
    mikrotik: MikroTikService = Depends(get_mt),
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """[MikroTik+GLPI] Create a network maintenance ticket automatically."""
    try:
        iface_details: dict = {}
        try:
            interfaces = await mikrotik.get_interfaces()
            for iface in interfaces:
                if iface.get("name") == request.interface_name:
                    iface_details = iface
                    break
        except Exception as e:
            logger.warning("api_glpi_maintenance_mikrotik_fail", error=str(e))

        content = (
            f"Alerta de mantenimiento de red detectada por NetShield Dashboard.\n\n"
            f"Interfaz afectada: {request.interface_name}\n"
            f"Tipo de error: {request.error_type}\n"
            f"Cantidad de errores: {request.error_count}\n"
        )
        if iface_details:
            content += (
                f"\nDetalles de la interfaz:\n"
                f"  Tipo: {iface_details.get('type', 'N/A')}\n"
                f"  MAC: {iface_details.get('mac_address', 'N/A')}\n"
                f"  Estado: {'Activa' if iface_details.get('running') else 'Inactiva'}\n"
            )
        if request.asset_id:
            content += f"\nEquipo afectado (GLPI ID): #{request.asset_id}\n"

        ticket_data = {
            "title": f"[NetShield] Error de red: {request.interface_name} — {request.error_count} {request.error_type}",
            "description": content,
            "priority": 4 if request.error_count > 100 else 3,
            "asset_id": request.asset_id,
        }
        result = await glpi.create_ticket(ticket_data)

        log_entry = ActionLog(
            action_type="glpi_maintenance_ticket",
            details=json.dumps({"interface": request.interface_name, "error_count": request.error_count, "error_type": request.error_type, "ticket_id": result.get("id")}),
            comment=f"Ticket mantenimiento red: {request.interface_name}",
        )
        db.add(log_entry)
        await db.flush()
        logger.info("api_glpi_maintenance_ticket_created", interface=request.interface_name, ticket_id=result.get("id"))
        return APIResponse.ok(result)
    except Exception as e:
        logger.error("api_glpi_maintenance_ticket_failed", error=str(e))
        return APIResponse.fail(f"Error al crear ticket de mantenimiento: {str(e)}")


# ── Users ─────────────────────────────────────────────────────────

@router.get("/users")
async def get_users(
    search: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    glpi: GLPIService = Depends(get_glpi),
) -> APIResponse:
    """[GLPI API] Get GLPI users for user-to-asset mapping view."""
    try:
        users = await glpi.get_users(search=search, limit=limit)
        logger.info("api_glpi_users_fetched", count=len(users))
        return APIResponse.ok({"users": users})
    except Exception as e:
        logger.error("api_glpi_get_users_failed", error=str(e))
        return APIResponse.fail(f"Error al obtener usuarios: {str(e)}")


@router.get("/users/{user_id}/assets")
async def get_user_assets(
    user_id: int,
    glpi: GLPIService = Depends(get_glpi),
) -> APIResponse:
    """[GLPI API] Get computers assigned to a specific user."""
    try:
        assets = await glpi.get_user_assets(user_id)
        return APIResponse.ok({"user_id": user_id, "assets": assets})
    except Exception as e:
        logger.error("api_glpi_get_user_assets_failed", user_id=user_id, error=str(e))
        return APIResponse.fail(f"Error al obtener activos del usuario #{user_id}: {str(e)}")


# ── Locations ─────────────────────────────────────────────────────

@router.get("/locations")
async def get_locations(
    glpi: GLPIService = Depends(get_glpi),
) -> APIResponse:
    """[GLPI API] Get all physical locations (classrooms, labs, server rooms)."""
    try:
        locations = await glpi.get_locations()
        return APIResponse.ok({"locations": locations})
    except Exception as e:
        logger.error("api_glpi_get_locations_failed", error=str(e))
        return APIResponse.fail(f"Error al obtener ubicaciones: {str(e)}")
