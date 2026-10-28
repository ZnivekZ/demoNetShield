"""
MikroTik Router - All endpoints for RouterOS API interaction.
Prefix: /api/mikrotik
"""

from __future__ import annotations

import json
from datetime import datetime

import structlog
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from services.audit_service import log_action
from schemas.common import APIResponse
from schemas.mikrotik import BlockIPRequest, UnblockIPRequest
from services import blocklist_store
from services.mikrotik_service import MikroTikService, get_mikrotik_service

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/api/mikrotik", tags=["MikroTik"])


def get_service() -> MikroTikService:
    return get_mikrotik_service()


@router.get("/interfaces")
async def get_interfaces(
    service: MikroTikService = Depends(get_service),
) -> APIResponse:
    """Get all network interfaces with status and counters."""
    try:
        data = await service.get_interfaces()
        return APIResponse.ok(data)
    except Exception as e:
        logger.error("api_get_interfaces_failed", error=str(e))
        return APIResponse.fail(f"Failed to fetch interfaces: {str(e)}")


@router.get("/connections")
async def get_connections(
    service: MikroTikService = Depends(get_service),
) -> APIResponse:
    """Get active connection tracking table."""
    try:
        data = await service.get_connections()
        return APIResponse.ok(data)
    except Exception as e:
        logger.error("api_get_connections_failed", error=str(e))
        return APIResponse.fail(f"Failed to fetch connections: {str(e)}")


@router.get("/arp")
async def get_arp(
    service: MikroTikService = Depends(get_service),
) -> APIResponse:
    """Get the ARP table with IP-to-MAC mappings."""
    try:
        data = await service.get_arp_table()
        return APIResponse.ok(data)
    except Exception as e:
        logger.error("api_get_arp_failed", error=str(e))
        return APIResponse.fail(f"Failed to fetch ARP table: {str(e)}")


@router.get("/traffic")
async def get_traffic(
    service: MikroTikService = Depends(get_service),
) -> APIResponse:
    """Get real-time traffic rates per interface (bytes/sec, packets/sec)."""
    try:
        data = await service.get_traffic()
        return APIResponse.ok(data)
    except Exception as e:
        logger.error("api_get_traffic_failed", error=str(e))
        return APIResponse.fail(f"Failed to fetch traffic data: {str(e)}")


@router.get("/firewall/rules")
async def get_firewall_rules(
    service: MikroTikService = Depends(get_service),
) -> APIResponse:
    """List all firewall filter rules."""
    try:
        data = await service.get_firewall_rules()
        return APIResponse.ok(data)
    except Exception as e:
        logger.error("api_get_firewall_rules_failed", error=str(e))
        return APIResponse.fail(f"Failed to fetch firewall rules: {str(e)}")


@router.post("/firewall/block")
async def block_ip(
    request: BlockIPRequest,
    service: MikroTikService = Depends(get_service),
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """
    Encola la IP en la Lista de bloqueo (NO escribe en MikroTik).
    El push al firewall es manual y pasa por revisión humana.
    """
    try:
        entry = blocklist_store.add(
            request.ip,
            request.comment or "Bloqueo desde firewall",
            source="firewall",
            duration=f"{request.duration}m" if request.duration else "",
        )

        await log_action(
            db,
            action_type="blocklist_queued",
            severity="high",
            target_ip=request.ip,
            details={"comment": request.comment, "duration": request.duration, "source": "firewall"},
            comment=f"IP encolada en la lista: {request.comment or request.ip}",
        )

        logger.info("api_ip_queued_for_blocklist", ip=request.ip)
        return APIResponse.ok({**entry, "queued": True,
                               "message": "Agregada a la lista. Se aplicará al hacer push."})
    except Exception as e:
        logger.error("api_queue_ip_failed", ip=request.ip, error=str(e))
        return APIResponse.fail(f"No se pudo agregar {request.ip} a la lista: {str(e)}")


@router.delete("/firewall/block")
async def unblock_ip(
    request: UnblockIPRequest,
    service: MikroTikService = Depends(get_service),
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """
    Saca la IP de la Lista de bloqueo (no toca el router: el firewall se
    actualiza en el próximo push, con `remove_missing` activo).
    """
    try:
        removed = blocklist_store.remove(request.ip)
        result = {"ip": request.ip, "removed_from_list": removed}

        await log_action(
            db,
            action_type="unblock",
            severity="high",
            target_ip=request.ip,
            details={"removed_from_list": removed},
            comment="Unblocked via dashboard",
        )

        logger.info("api_ip_unblocked", ip=request.ip)
        return APIResponse.ok(result)
    except Exception as e:
        logger.error("api_unblock_ip_failed", ip=request.ip, error=str(e))
        return APIResponse.fail(f"Failed to unblock IP {request.ip}: {str(e)}")


@router.get("/logs")
async def get_logs(
    limit: int = 50,
    service: MikroTikService = Depends(get_service),
) -> APIResponse:
    """Get recent RouterOS system logs."""
    try:
        data = await service.get_logs(limit=limit)
        return APIResponse.ok(data)
    except Exception as e:
        logger.error("api_get_logs_failed", error=str(e))
        return APIResponse.fail(f"Failed to fetch logs: {str(e)}")


# ── New Security Panel Endpoints ──────────────────────────────────


@router.get("/health")
async def get_mikrotik_health(
    service: MikroTikService = Depends(get_service),
) -> APIResponse:
    """
    [MikroTik API] Get system health: CPU%, RAM, uptime, temperature.
    Resource: /system/resource
    """
    try:
        data = await service.get_system_health()
        return APIResponse.ok(data)
    except Exception as e:
        logger.error("api_get_mikrotik_health_failed", error=str(e))
        return APIResponse.fail(f"Failed to fetch MikroTik health: {str(e)}")


@router.get("/interfaces/traffic/all")
async def get_all_interface_traffic(
    service: MikroTikService = Depends(get_service),
) -> APIResponse:
    """
    [MikroTik API] Get real-time traffic (rx/tx) for all interfaces.
    Resource: /interface (delta-based calculation).
    """
    try:
        data = await service.get_traffic()
        return APIResponse.ok(data)
    except Exception as e:
        logger.error("api_get_all_interface_traffic_failed", error=str(e))
        return APIResponse.fail(f"Failed to fetch interface traffic: {str(e)}")


@router.get("/arp/search")
async def search_arp(
    ip: str | None = None,
    mac: str | None = None,
    service: MikroTikService = Depends(get_service),
) -> APIResponse:
    """
    [MikroTik API] Search ARP table by IP or MAC address.
    Resource: /ip/arp
    """
    if not ip and not mac:
        return APIResponse.fail("Either 'ip' or 'mac' query parameter is required")
    try:
        data = await service.search_arp(ip=ip, mac=mac)
        return APIResponse.ok(data)
    except Exception as e:
        logger.error("api_search_arp_failed", error=str(e))
        return APIResponse.fail(f"Failed to search ARP table: {str(e)}")


@router.get("/address-list")
async def get_address_list(
    list_name: str | None = None,
    service: MikroTikService = Depends(get_service),
) -> APIResponse:
    """
    [MikroTik API] Get firewall address list entries.
    Optional filter by list name (e.g. 'Blacklist_Automatica').
    Resource: /ip/firewall/address-list
    """
    try:
        data = await service.get_address_list(list_name=list_name)
        return APIResponse.ok(data)
    except Exception as e:
        logger.error("api_get_address_list_failed", error=str(e))
        return APIResponse.fail(f"Failed to fetch address list: {str(e)}")


# ── NAT Rules ─────────────────────────────────────────────────────────────────

@router.get("/nat-rules")
async def get_nat_rules(
    service: MikroTikService = Depends(get_service),
) -> APIResponse:
    """
    [MikroTik API] Get all NAT rules (src-nat, dst-nat, masquerade).
    Resource: /ip/firewall/nat
    """
    try:
        data = await service.get_nat_rules()
        return APIResponse.ok(data)
    except Exception as e:
        logger.error("api_get_nat_rules_failed", error=str(e))
        return APIResponse.fail(f"Failed to fetch NAT rules: {str(e)}")


# ── Network Topology ───────────────────────────────────────────────────────────

@router.get("/routes")
async def get_routes(
    service: MikroTikService = Depends(get_service),
) -> APIResponse:
    """
    [MikroTik API] Get routing table (static + dynamic + connected).
    Resource: /ip/route
    """
    try:
        data = await service.get_routes()
        return APIResponse.ok(data)
    except Exception as e:
        logger.error("api_get_routes_failed", error=str(e))
        return APIResponse.fail(f"Failed to fetch routes: {str(e)}")


@router.get("/addresses")
async def get_ip_addresses(
    service: MikroTikService = Depends(get_service),
) -> APIResponse:
    """
    [MikroTik API] Get all IP addresses assigned to interfaces.
    Resource: /ip/address
    """
    try:
        data = await service.get_ip_addresses()
        return APIResponse.ok(data)
    except Exception as e:
        logger.error("api_get_ip_addresses_failed", error=str(e))
        return APIResponse.fail(f"Failed to fetch IP addresses: {str(e)}")


@router.get("/bridge-ports")
async def get_bridge_ports(
    service: MikroTikService = Depends(get_service),
) -> APIResponse:
    """
    [MikroTik API] Get bridge port configuration.
    Resource: /interface/bridge/port
    """
    try:
        data = await service.get_bridge_ports()
        return APIResponse.ok(data)
    except Exception as e:
        logger.error("api_get_bridge_ports_failed", error=str(e))
        return APIResponse.fail(f"Failed to fetch bridge ports: {str(e)}")


# ── QoS / Simple Queues ────────────────────────────────────────────────────────

@router.get("/queues")
async def get_queues(
    service: MikroTikService = Depends(get_service),
) -> APIResponse:
    """
    [MikroTik API] Get all simple queues (bandwidth limiters).
    Resource: /queue/simple
    """
    try:
        data = await service.get_queues()
        return APIResponse.ok(data)
    except Exception as e:
        logger.error("api_get_queues_failed", error=str(e))
        return APIResponse.fail(f"Failed to fetch queues: {str(e)}")


