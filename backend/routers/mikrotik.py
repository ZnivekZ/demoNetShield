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
from models.action_log import ActionLog
from schemas.common import APIResponse
from schemas.mikrotik import BlockIPRequest, UnblockIPRequest
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
    Block an IP address by adding a drop rule in chain=forward.
    Logs the action in the audit trail.
    """
    try:
        result = await service.block_ip(request.ip, request.comment)

        # Log the action
        log_entry = ActionLog(
            action_type="block",
            target_ip=request.ip,
            details=json.dumps({
                "comment": request.comment,
                "duration": request.duration,
                "rule_id": result.get("rule_id"),
            }),
            comment=request.comment,
        )
        db.add(log_entry)
        await db.flush()

        logger.info("api_ip_blocked", ip=request.ip, comment=request.comment)
        return APIResponse.ok(result)
    except Exception as e:
        logger.error("api_block_ip_failed", ip=request.ip, error=str(e))
        return APIResponse.fail(f"Failed to block IP {request.ip}: {str(e)}")


@router.delete("/firewall/block")
async def unblock_ip(
    request: UnblockIPRequest,
    service: MikroTikService = Depends(get_service),
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """
    Unblock an IP address by removing matching drop rules.
    Logs the action in the audit trail.
    """
    try:
        result = await service.unblock_ip(request.ip)

        # Log the action
        log_entry = ActionLog(
            action_type="unblock",
            target_ip=request.ip,
            details=json.dumps({"rules_removed": result.get("rules_removed", [])}),
            comment=f"Unblocked via dashboard",
        )
        db.add(log_entry)
        await db.flush()

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


@router.post("/queues")
async def create_queue(
    request: dict,
    service: MikroTikService = Depends(get_service),
) -> APIResponse:
    """
    [MikroTik API] Create a simple queue (bandwidth limiter).
    Body: {name, target, max_limit, burst_limit?, burst_threshold?, burst_time?, comment?}
    max_limit format: 'upload/download' e.g. '5M/10M' or '0/0' for unlimited
    """
    try:
        name = request.get("name", "")
        target = request.get("target", "")
        if not name or not target:
            return APIResponse.fail("Fields 'name' and 'target' are required")
        data = await service.create_queue(
            name=name,
            target=target,
            max_limit=request.get("max_limit", "0/0"),
            burst_limit=request.get("burst_limit", "0/0"),
            burst_threshold=request.get("burst_threshold", "0/0"),
            burst_time=request.get("burst_time", "0s/0s"),
            comment=request.get("comment", ""),
        )
        return APIResponse.ok(data)
    except Exception as e:
        logger.error("api_create_queue_failed", error=str(e))
        return APIResponse.fail(f"Failed to create queue: {str(e)}")


@router.put("/queues/{queue_id}")
async def update_queue(
    queue_id: str,
    request: dict,
    service: MikroTikService = Depends(get_service),
) -> APIResponse:
    """
    [MikroTik API] Update a simple queue.
    Body: {name?, max_limit?, comment?, disabled?}
    """
    try:
        data = await service.update_queue(
            queue_id=queue_id,
            name=request.get("name"),
            max_limit=request.get("max_limit"),
            comment=request.get("comment"),
            disabled=request.get("disabled"),
        )
        return APIResponse.ok(data)
    except Exception as e:
        logger.error("api_update_queue_failed", queue_id=queue_id, error=str(e))
        return APIResponse.fail(f"Failed to update queue {queue_id}: {str(e)}")


@router.delete("/queues/{queue_id}")
async def delete_queue(
    queue_id: str,
    service: MikroTikService = Depends(get_service),
) -> APIResponse:
    """
    [MikroTik API] Delete a simple queue by ID.
    Resource: /queue/simple remove
    """
    try:
        data = await service.delete_queue(queue_id)
        return APIResponse.ok(data)
    except Exception as e:
        logger.error("api_delete_queue_failed", queue_id=queue_id, error=str(e))
        return APIResponse.fail(f"Failed to delete queue {queue_id}: {str(e)}")

