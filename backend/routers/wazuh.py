"""
Wazuh Router - All endpoints for Wazuh SIEM API interaction.
Prefix: /api/wazuh
"""

from __future__ import annotations

import json

import structlog
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models.action_log import ActionLog
from schemas.common import APIResponse
from schemas.wazuh import ActiveResponseRequest
from services.wazuh_service import WazuhService, get_wazuh_service

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/api/wazuh", tags=["Wazuh"])


def get_service() -> WazuhService:
    return get_wazuh_service()


@router.get("/agents")
async def get_agents(
    service: WazuhService = Depends(get_service),
) -> APIResponse:
    """Get all Wazuh agents with their connection status."""
    try:
        data = await service.get_agents()
        return APIResponse.ok(data)
    except Exception as e:
        logger.error("api_get_agents_failed", error=str(e))
        return APIResponse.fail(f"Failed to fetch agents: {str(e)}")


@router.get("/alerts")
async def get_alerts(
    limit: int = Query(50, ge=1, le=500),
    level_min: int | None = Query(None, ge=1, le=15),
    offset: int = Query(0, ge=0),
    service: WazuhService = Depends(get_service),
) -> APIResponse:
    """
    Get recent alerts with optional severity filtering.
    - limit: max number of alerts (1-500)
    - level_min: minimum rule level (1-15, higher = more critical)
    - offset: pagination offset
    """
    try:
        data = await service.get_alerts(
            limit=limit, level_min=level_min, offset=offset
        )
        return APIResponse.ok(data)
    except Exception as e:
        logger.error("api_get_alerts_failed", error=str(e))
        return APIResponse.fail(f"Failed to fetch alerts: {str(e)}")


@router.get("/alerts/agent/{agent_id}")
async def get_alerts_by_agent(
    agent_id: str,
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    service: WazuhService = Depends(get_service),
) -> APIResponse:
    """Get alerts filtered by a specific agent ID."""
    try:
        data = await service.get_alerts_by_agent(
            agent_id=agent_id, limit=limit, offset=offset
        )
        return APIResponse.ok(data)
    except Exception as e:
        logger.error(
            "api_get_alerts_by_agent_failed",
            agent_id=agent_id,
            error=str(e),
        )
        return APIResponse.fail(
            f"Failed to fetch alerts for agent {agent_id}: {str(e)}"
        )


@router.post("/active-response")
async def send_active_response(
    request: ActiveResponseRequest,
    service: WazuhService = Depends(get_service),
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """
    Send an active response command to a Wazuh agent.
    Logs the action in the audit trail.
    """
    try:
        data = await service.send_active_response(
            agent_id=request.agent_id,
            command=request.command,
            args=request.args,
        )

        # Log the action
        log_entry = ActionLog(
            action_type="active_response",
            target_ip=None,
            details=json.dumps({
                "agent_id": request.agent_id,
                "command": request.command,
                "args": request.args,
            }),
            comment=f"Active response: {request.command} on agent {request.agent_id}",
        )
        db.add(log_entry)
        await db.flush()

        logger.info(
            "api_active_response_sent",
            agent_id=request.agent_id,
            command=request.command,
        )
        return APIResponse.ok(data)
    except Exception as e:
        logger.error(
            "api_active_response_failed",
            agent_id=request.agent_id,
            error=str(e),
        )
        return APIResponse.fail(f"Failed to send active response: {str(e)}")


# ── New Security Panel Endpoints ──────────────────────────────────


@router.get("/alerts/critical")
async def get_critical_alerts(
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    service: WazuhService = Depends(get_service),
) -> APIResponse:
    """
    [Wazuh API] Get critical alerts (level > 10).
    Includes MITRE ATT&CK technique data with rule_groups fallback.
    """
    try:
        data = await service.get_critical_alerts(limit=limit, offset=offset)
        return APIResponse.ok(data)
    except Exception as e:
        logger.error("api_get_critical_alerts_failed", error=str(e))
        return APIResponse.fail(f"Failed to fetch critical alerts: {str(e)}")


@router.get("/alerts/timeline")
async def get_alerts_timeline(
    level_min: int = Query(5, ge=1, le=15),
    service: WazuhService = Depends(get_service),
) -> APIResponse:
    """
    [Wazuh API] Get alert count grouped by minute for the last 60 minutes.
    Useful for detecting attack spikes in real-time.
    """
    try:
        data = await service.get_alerts_timeline(level_min=level_min)
        return APIResponse.ok(data)
    except Exception as e:
        logger.error("api_get_alerts_timeline_failed", error=str(e))
        return APIResponse.fail(f"Failed to fetch alerts timeline: {str(e)}")


@router.get("/alerts/last-critical")
async def get_last_critical_alert(
    service: WazuhService = Depends(get_service),
) -> APIResponse:
    """
    [Wazuh API] Get the last critical alert (level > 10).
    Includes: agent_name, rule_description, rule_level, src_ip, timestamp, mitre_technique.
    """
    try:
        data = await service.get_last_critical_alert()
        return APIResponse.ok(data)
    except Exception as e:
        logger.error("api_get_last_critical_failed", error=str(e))
        return APIResponse.fail(f"Failed to fetch last critical alert: {str(e)}")


@router.get("/agents/top")
async def get_top_agents(
    limit: int = Query(10, ge=1, le=100),
    service: WazuhService = Depends(get_service),
) -> APIResponse:
    """
    [Wazuh API] Get top N agents with most alerts.
    Includes: agent_id, agent_name, alert_count, last_alert_timestamp, top MITRE technique.
    """
    try:
        data = await service.get_top_agents(limit=limit)
        return APIResponse.ok(data)
    except Exception as e:
        logger.error("api_get_top_agents_failed", error=str(e))
        return APIResponse.fail(f"Failed to fetch top agents: {str(e)}")


@router.get("/agents/summary")
async def get_agents_summary(
    service: WazuhService = Depends(get_service),
) -> APIResponse:
    """
    [Wazuh API] Get agent count by status (active, disconnected, never_connected).
    Uses Wazuh endpoint: GET /agents/summary/status
    """
    try:
        data = await service.get_agents_summary()
        return APIResponse.ok(data)
    except Exception as e:
        logger.error("api_get_agents_summary_failed", error=str(e))
        return APIResponse.fail(f"Failed to fetch agents summary: {str(e)}")


@router.get("/mitre/summary")
async def get_mitre_summary(
    service: WazuhService = Depends(get_service),
) -> APIResponse:
    """
    [Wazuh API] Get detected MITRE ATT&CK techniques grouped by frequency.
    Falls back to rule_groups when MITRE data is unavailable.
    """
    try:
        data = await service.get_mitre_summary()
        return APIResponse.ok(data)
    except Exception as e:
        logger.error("api_get_mitre_summary_failed", error=str(e))
        return APIResponse.fail(f"Failed to fetch MITRE summary: {str(e)}")


@router.get("/health")
async def get_wazuh_health(
    service: WazuhService = Depends(get_service),
) -> APIResponse:
    """
    [Wazuh API] Get Wazuh manager health status.
    Includes: services, version, cluster status.
    """
    try:
        data = await service.get_health()
        return APIResponse.ok(data)
    except Exception as e:
        logger.error("api_get_wazuh_health_failed", error=str(e))
        return APIResponse.fail(f"Failed to fetch Wazuh health: {str(e)}")

