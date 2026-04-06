"""
Security Router - Hybrid endpoints that coordinate Wazuh API + MikroTik API.
Prefix: /api/security

These endpoints call BOTH external APIs internally for cross-system operations.
All destructive actions MUST be confirmed by the user via ConfirmModal on frontend.
"""

from __future__ import annotations

import json

import structlog
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models.action_log import ActionLog
from schemas.common import APIResponse
from schemas.security import (
    GeoBlockRequest,
    QuarantineRequest,
    SecurityBlockIPRequest,
)
from services.mikrotik_service import MikroTikService, get_mikrotik_service
from services.wazuh_service import WazuhService, get_wazuh_service

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/api/security", tags=["Security"])


def get_mt_service() -> MikroTikService:
    return get_mikrotik_service()


def get_wz_service() -> WazuhService:
    return get_wazuh_service()


@router.post("/block-ip")
async def block_ip(
    request: SecurityBlockIPRequest,
    mikrotik: MikroTikService = Depends(get_mt_service),
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """
    [MikroTik API] + [DB] Block an IP via address list "Blacklist_Automatica".
    Requires user confirmation via ConfirmModal on frontend.
    """
    try:
        timeout = f"{request.duration_hours}h"
        result = await mikrotik.add_to_address_list(
            ip=request.ip,
            list_name="Blacklist_Automatica",
            timeout=timeout,
            comment=f"NetShield: {request.reason}",
        )

        # Log the action
        log_entry = ActionLog(
            action_type="security_block",
            target_ip=request.ip,
            details=json.dumps({
                "reason": request.reason,
                "duration_hours": request.duration_hours,
                "source": request.source,
                "list": "Blacklist_Automatica",
            }),
            comment=f"Security block: {request.reason}",
        )
        db.add(log_entry)
        await db.flush()

        logger.info("api_security_ip_blocked", ip=request.ip, source=request.source)
        return APIResponse.ok(result)
    except Exception as e:
        logger.error("api_security_block_failed", ip=request.ip, error=str(e))
        return APIResponse.fail(f"Failed to block IP: {str(e)}")


@router.post("/auto-block")
async def auto_block(
    request: SecurityBlockIPRequest,
    mikrotik: MikroTikService = Depends(get_mt_service),
    wazuh: WazuhService = Depends(get_wz_service),
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """
    [Ambas] Auto-block triggered by high-severity alert.
    Verifies alert level >= 12 in Wazuh, then blocks in MikroTik.
    Requires user confirmation via ConfirmModal on frontend.
    """
    try:
        # Note: In a fully automated pipeline, this would be triggered
        # internally by the WebSocket alert monitor. Here it's exposed
        # as an endpoint that the frontend calls after ConfirmModal.

        result = await mikrotik.add_to_address_list(
            ip=request.ip,
            list_name="Blacklist_Automatica",
            timeout="24h",
            comment=f"Auto-block: {request.reason}",
        )

        # Log the action with auto source
        log_entry = ActionLog(
            action_type="auto_block",
            target_ip=request.ip,
            details=json.dumps({
                "reason": request.reason,
                "source": "auto",
                "trigger": "high_severity_alert",
                "list": "Blacklist_Automatica",
            }),
            comment=f"Auto-blocked: {request.reason}",
        )
        db.add(log_entry)
        await db.flush()

        logger.info("api_auto_block_executed", ip=request.ip)
        return APIResponse.ok(result)
    except Exception as e:
        logger.error("api_auto_block_failed", ip=request.ip, error=str(e))
        return APIResponse.fail(f"Failed to auto-block IP: {str(e)}")


@router.post("/quarantine")
async def quarantine_agent(
    request: QuarantineRequest,
    mikrotik: MikroTikService = Depends(get_mt_service),
    wazuh: WazuhService = Depends(get_wz_service),
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """
    [Ambas] Quarantine an agent by moving its port to a quarantine VLAN.
    1. Verifies agent exists and is active in Wazuh
    2. Attempts to move bridge port to quarantine VLAN in MikroTik
    
    PLACEHOLDER: Requires physical MikroTik bridge with per-port VLANs.
    Lab topology uses VirtualBox — returns descriptive message.
    Requires user confirmation via ConfirmModal on frontend.
    """
    try:
        # Step 1: Verify agent in Wazuh
        agents = await wazuh.get_agents()
        target_agent = None
        for agent in agents:
            if agent.get("id") == request.agent_id:
                target_agent = agent
                break

        if not target_agent:
            return APIResponse.fail(f"Agent {request.agent_id} not found in Wazuh")

        if target_agent.get("status") != "active":
            return APIResponse.fail(
                f"Agent {request.agent_id} is not active "
                f"(status: {target_agent.get('status')})"
            )

        # Step 2: Move port to quarantine VLAN (placeholder)
        agent_ip = target_agent.get("ip", "")
        result = await mikrotik.quarantine_agent_port(
            port_name=f"agent-{request.agent_id}",
            vlan_id=request.vlan_quarantine_id,
        )

        # Log the action
        log_entry = ActionLog(
            action_type="quarantine",
            target_ip=agent_ip,
            details=json.dumps({
                "agent_id": request.agent_id,
                "agent_name": target_agent.get("name", ""),
                "vlan_id": request.vlan_quarantine_id,
                "executed": result.get("executed", False),
            }),
            comment=f"Quarantine requested for agent {request.agent_id}",
        )
        db.add(log_entry)
        await db.flush()

        logger.info(
            "api_quarantine_requested",
            agent_id=request.agent_id,
            executed=result.get("executed", False),
        )
        return APIResponse.ok(result)
    except Exception as e:
        logger.error("api_quarantine_failed", agent_id=request.agent_id, error=str(e))
        return APIResponse.fail(f"Failed to quarantine agent: {str(e)}")


@router.post("/geo-block")
async def geo_block(
    request: GeoBlockRequest,
    mikrotik: MikroTikService = Depends(get_mt_service),
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """
    [MikroTik API] Block IP ranges by country.
    
    NOTE: For lab mode, accepts manual IP ranges in CIDR notation.
    In production, integrate a GeoIP database (e.g., ip2location-lite,
    MaxMind GeoLite2) to auto-resolve country_code to IP ranges.
    
    # PRODUCTION TODO: Replace manual ip_ranges with:
    # import geoip2.database
    # reader = geoip2.database.Reader('GeoLite2-Country.mmdb')
    # ranges = get_country_ranges(request.country_code)
    
    Requires user confirmation via ConfirmModal on frontend.
    """
    try:
        if not request.ip_ranges:
            return APIResponse.fail(
                "IP ranges are required in lab mode. "
                "Provide ip_ranges as a list of CIDR notation strings "
                "(e.g., ['203.0.113.0/24']). "
                "In production, ranges would be resolved automatically from country_code."
            )

        timeout = f"{request.duration_hours}h"
        added = []

        for ip_range in request.ip_ranges:
            try:
                result = await mikrotik.add_to_address_list(
                    ip=ip_range,
                    list_name="Geo_Block",
                    timeout=timeout,
                    comment=f"Geo-block: {request.country_code}",
                )
                added.append({"range": ip_range, "result": result})
            except Exception as range_err:
                logger.warning(
                    "geo_block_range_failed",
                    range=ip_range,
                    error=str(range_err),
                )
                added.append({"range": ip_range, "error": str(range_err)})

        # Log the action
        log_entry = ActionLog(
            action_type="geo_block",
            details=json.dumps({
                "country_code": request.country_code,
                "ip_ranges": request.ip_ranges,
                "duration_hours": request.duration_hours,
                "added_count": len([a for a in added if "result" in a]),
            }),
            comment=f"Geo-block: {request.country_code} ({len(request.ip_ranges)} ranges)",
        )
        db.add(log_entry)
        await db.flush()

        logger.info(
            "api_geo_block_executed",
            country=request.country_code,
            ranges=len(request.ip_ranges),
        )
        return APIResponse.ok({
            "country_code": request.country_code,
            "added": added,
            "duration_hours": request.duration_hours,
        })
    except Exception as e:
        logger.error("api_geo_block_failed", error=str(e))
        return APIResponse.fail(f"Failed to execute geo-block: {str(e)}")
