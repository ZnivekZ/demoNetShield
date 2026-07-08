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
from services.audit_service import log_action
from models.quarantine_log import QuarantineLog
from schemas.common import APIResponse
from schemas.glpi import (
    GlpiAssetCreate,
    GlpiAssetUpdate,
    GlpiAssignmentRequest,
    GlpiAvailability,
    GlpiQuarantineRequest,
    GlpiTicketCreate,
    GlpiTicketStatusUpdate,
    GlpiUserCreate,
    GlpiUserUpdate,
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


@router.get("/assets/{asset_id}/full-detail")
async def get_asset_full_detail(
    asset_id: int,
) -> APIResponse:
    """
    [GLPI Collector] Get full parsed detail of an asset from the collector cache.
    Includes: identification, location, status, network, hardware, disks, software,
    audit logs, tickets, and relationships.
    """
    try:
        from services.glpi_collector import get_glpi_collector
        collector = get_glpi_collector()
        detail = collector.get_full_detail(asset_id)
        if detail is None:
            return APIResponse.fail(
                f"Activo #{asset_id} no encontrado en cache del collector. "
                f"Espere al próximo ciclo de sincronización."
            )
        return APIResponse.ok({
            **detail,
            "asset_id": asset_id,
            "last_sync": collector.get_last_sync(),
        })
    except Exception as e:
        logger.error("api_glpi_full_detail_failed", asset_id=asset_id, error=str(e))
        return APIResponse.fail(f"Error al obtener detalle completo: {str(e)}")


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
        await log_action(
            db,
            action_type="glpi_asset_created",
            severity="medium",
            details={"asset_name": request.name},
            comment=f"Activo GLPI creado: {request.name}",
        )
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
        await log_action(
            db,
            action_type="glpi_asset_updated",
            severity="medium",
            details={"asset_id": asset_id, **request.model_dump(exclude_none=True)},
            comment=f"Activo GLPI #{asset_id} actualizado",
        )
        logger.info("api_glpi_asset_updated", asset_id=asset_id)
        return APIResponse.ok(result)
    except Exception as e:
        logger.error("api_glpi_update_asset_failed", asset_id=asset_id, error=str(e))
        return APIResponse.fail(f"Error al actualizar activo #{asset_id}: {str(e)}")


@router.delete("/assets/{asset_id}")
async def delete_asset(
    asset_id: int,
    glpi: GLPIService = Depends(get_glpi),
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """[GLPI API] Delete a GLPI asset."""
    try:
        result = await glpi.delete_computer(asset_id)
        await log_action(
            db,
            action_type="glpi_asset_deleted",
            severity="high",
            details={"asset_id": asset_id},
            comment=f"Activo GLPI #{asset_id} eliminado",
        )
        logger.info("api_glpi_asset_deleted", asset_id=asset_id)
        return APIResponse.ok(result)
    except Exception as e:
        logger.error("api_glpi_delete_asset_failed", asset_id=asset_id, error=str(e))
        return APIResponse.fail(f"Error al eliminar activo #{asset_id}: {str(e)}")


@router.put("/assets/{asset_id}/assign")
async def assign_asset(
    asset_id: int,
    request: GlpiAssignmentRequest,
    glpi: GLPIService = Depends(get_glpi),
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """[GLPI API] Assign or unassign a GLPI asset to a user."""
    try:
        result = await glpi.assign_asset(asset_id, request.user_id)
        await log_action(
            db,
            action_type="glpi_asset_assigned",
            severity="medium",
            details={"asset_id": asset_id, "user_id": request.user_id},
            comment=f"Activo GLPI #{asset_id} asignado a usuario #{request.user_id}",
        )
        logger.info("api_glpi_asset_assigned", asset_id=asset_id, user_id=request.user_id)
        return APIResponse.ok(result)
    except Exception as e:
        logger.error("api_glpi_assign_asset_failed", asset_id=asset_id, error=str(e))
        return APIResponse.fail(f"Error al asignar activo #{asset_id}: {str(e)}")


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
        await log_action(
            db,
            action_type="glpi_quarantine",
            severity="critical",
            details={
                "asset_id": asset_id, "reason": request.reason,
                "ticket_id": result.get("ticket_id"),
                "wazuh_alert_id": request.wazuh_alert_id,
                "mikrotik_block_id": request.mikrotik_block_id,
            },
            comment=f"Cuarentena GLPI: activo #{asset_id} — {request.reason[:100]}",
        )
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
        await log_action(
            db,
            action_type="glpi_unquarantine",
            severity="high",
            details={"asset_id": asset_id},
            comment=f"Cuarentena GLPI levantada: activo #{asset_id}",
        )
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
        await log_action(
            db,
            action_type="glpi_ticket_created",
            severity="medium",
            details={"ticket_title": request.title, "asset_id": request.asset_id, "priority": request.priority},
            comment=f"Ticket GLPI creado: {request.title[:80]}",
        )
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
        await log_action(
            db,
            action_type="glpi_ticket_status_updated",
            severity="low",
            details={"ticket_id": ticket_id, "status": request.status},
            comment=f"Ticket GLPI #{ticket_id} estado actualizado a {request.status}",
        )
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

        await log_action(
            db,
            action_type="glpi_maintenance_ticket",
            severity="medium",
            details={"interface": request.interface_name, "error_count": request.error_count, "error_type": request.error_type, "ticket_id": result.get("id")},
            comment=f"Ticket mantenimiento red: {request.interface_name}",
        )
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


@router.get("/users/{user_id}")
async def get_user(
    user_id: int,
    glpi: GLPIService = Depends(get_glpi),
) -> APIResponse:
    """[GLPI API] Get a single GLPI user by ID."""
    try:
        user = await glpi.get_user(user_id)
        return APIResponse.ok(user)
    except Exception as e:
        logger.error("api_glpi_get_user_failed", user_id=user_id, error=str(e))
        return APIResponse.fail(f"Error al obtener usuario #{user_id}: {str(e)}")


@router.post("/users")
async def create_user(
    request: GlpiUserCreate,
    glpi: GLPIService = Depends(get_glpi),
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """[GLPI API] Create a new GLPI user."""
    try:
        result = await glpi.create_user(request.model_dump())
        await log_action(
            db,
            action_type="glpi_user_created",
            severity="medium",
            details={"username": request.name, "department": request.department},
            comment=f"Usuario GLPI creado: {request.name}",
        )
        logger.info("api_glpi_user_created", name=request.name)
        return APIResponse.ok(result)
    except Exception as e:
        logger.error("api_glpi_create_user_failed", name=request.name, error=str(e))
        return APIResponse.fail(f"Error al crear usuario: {str(e)}")


@router.put("/users/{user_id}")
async def update_user(
    user_id: int,
    request: GlpiUserUpdate,
    glpi: GLPIService = Depends(get_glpi),
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """[GLPI API] Update a GLPI user."""
    try:
        result = await glpi.update_user(user_id, request.model_dump(exclude_none=True))
        await log_action(
            db,
            action_type="glpi_user_updated",
            severity="medium",
            details={"user_id": user_id, **request.model_dump(exclude_none=True)},
            comment=f"Usuario GLPI #{user_id} actualizado",
        )
        logger.info("api_glpi_user_updated", user_id=user_id)
        return APIResponse.ok(result)
    except Exception as e:
        logger.error("api_glpi_update_user_failed", user_id=user_id, error=str(e))
        return APIResponse.fail(f"Error al actualizar usuario #{user_id}: {str(e)}")


@router.delete("/users/{user_id}")
async def delete_user(
    user_id: int,
    glpi: GLPIService = Depends(get_glpi),
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """[GLPI API] Delete a GLPI user."""
    try:
        result = await glpi.delete_user(user_id)
        await log_action(
            db,
            action_type="glpi_user_deleted",
            severity="high",
            details={"user_id": user_id},
            comment=f"Usuario GLPI #{user_id} eliminado",
        )
        logger.info("api_glpi_user_deleted", user_id=user_id)
        return APIResponse.ok(result)
    except Exception as e:
        logger.error("api_glpi_delete_user_failed", user_id=user_id, error=str(e))
        return APIResponse.fail(f"Error al eliminar usuario #{user_id}: {str(e)}")


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
