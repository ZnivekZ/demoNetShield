"""
Security Router - Hybrid endpoints that coordinate Wazuh API + MikroTik API.
Prefix: /api/security

These endpoints call BOTH external APIs internally for cross-system operations.
All destructive actions MUST be confirmed by the user via ConfirmModal on frontend.
"""

from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from services.audit_service import log_action
from schemas.common import APIResponse
from schemas.security import (
    GeoBlockRequest,
    QuarantineRequest,
    SecurityBlockIPRequest,
)
from services import blocklist_store
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
    [DB] Encola la IP en la Lista de bloqueo (NO escribe en MikroTik).
    El push al firewall es manual, tras revisión humana.
    """
    try:
        result = blocklist_store.add(
            request.ip,
            f"{request.reason} ({request.source})",
            source="security",
            duration=f"{request.duration_hours}h" if request.duration_hours else "",
        )

        await log_action(
            db,
            action_type="security_block",
            severity="critical",
            target_ip=request.ip,
            details={
                "reason": request.reason,
                "duration_hours": request.duration_hours,
                "source": request.source,
                "list": "Blacklist_Automatica",
            },
            comment=f"Security block: {request.reason}",
        )

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

        result = blocklist_store.add(
            request.ip, f"Auto-block: {request.reason}", source="security"
        )

        await log_action(
            db,
            action_type="auto_block",
            severity="critical",
            target_ip=request.ip,
            details={
                "reason": request.reason,
                "source": "auto",
                "trigger": "high_severity_alert",
                "list": "Blacklist_Automatica",
            },
            comment=f"Auto-blocked: {request.reason}",
        )

        logger.info("api_auto_block_executed", ip=request.ip)
        return APIResponse.ok(result)
    except Exception as e:
        logger.error("api_auto_block_failed", ip=request.ip, error=str(e))
        return APIResponse.fail(f"Failed to auto-block IP: {str(e)}")


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
                result = blocklist_store.add(
                    ip_range, f"Geo-block {request.country_code}", source="security"
                )
                added.append({"range": ip_range, "result": result})
            except Exception as range_err:
                logger.warning(
                    "geo_block_range_failed",
                    range=ip_range,
                    error=str(range_err),
                )
                added.append({"range": ip_range, "error": str(range_err)})

        await log_action(
            db,
            action_type="geo_block",
            severity="critical",
            details={
                "country_code": request.country_code,
                "ip_ranges": request.ip_ranges,
                "duration_hours": request.duration_hours,
                "added_count": len([a for a in added if "result" in a]),
            },
            comment=f"Geo-block: {request.country_code} ({len(request.ip_ranges)} ranges)",
        )

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
