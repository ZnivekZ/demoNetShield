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

