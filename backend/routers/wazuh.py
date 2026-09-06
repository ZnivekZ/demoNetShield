"""
Wazuh Router - All endpoints for Wazuh SIEM API interaction.
Prefix: /api/wazuh
"""

from __future__ import annotations

import asyncio
import json

import structlog
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from services.audit_service import log_action
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


@router.get("/alerts/paginated")
async def get_alerts_paginated(
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    level_min: int | None = Query(None, ge=1, le=15),
    agent_id: str | None = Query(None),
    rule_id: str | None = Query(None),
    search: str | None = Query(None),
    from_date: str | None = Query(None),
    to_date: str | None = Query(None),
    service: WazuhService = Depends(get_service),
) -> APIResponse:
    """
    Get recent alerts with filters, paginated.
    Mirrors the frontend WazuhAlertsPagination shape:
    {items: [...], pagination: {page, page_size, total, total_pages, has_next, has_prev}}.
    Filters: level_min, agent_id, rule_id, search (description/agent/rule), from_date/to_date.
    """
    try:
        # Fetch a bounded recent window (up to 500 from the Indexer, last 7d by
        # default) then filter + paginate client-side. The Indexer query already
        # narrows by level_min / agent_id / time window.
        time_from = from_date or ("now-7d" if not to_date else None)
        data = await service.get_alerts(
            limit=500, level_min=level_min, agent_id=agent_id, time_from=time_from
        )
        # Client-side filters the Indexer query can't express
        if rule_id:
            data = [a for a in data if a.get("rule_id") == rule_id]
        if search:
            q = search.lower()
            data = [
                a for a in data
                if q in (a.get("rule_description") or "").lower()
                or q in (a.get("agent_name") or "").lower()
                or q in (a.get("rule_id") or "").lower()
            ]
        if to_date:
            data = [a for a in data if (a.get("timestamp") or "") <= to_date]
        total = len(data)
        start = (page - 1) * page_size
        page_items = data[start:start + page_size]
        total_pages = max(1, (total + page_size - 1) // page_size)
        return APIResponse.ok({
            "items": page_items,
            "pagination": {
                "page": page,
                "page_size": page_size,
                "total": total,
                "total_pages": total_pages,
                "has_next": page < total_pages,
                "has_prev": page > 1,
            },
        })
    except Exception as e:
        logger.error("api_get_alerts_paginated_failed", error=str(e))
        return APIResponse.fail(f"Failed to fetch alerts: {str(e)}")


@router.get("/alerts")
async def get_alerts(
    limit: int = Query(50, ge=1, le=500),
    level_min: int | None = Query(None, ge=1, le=15),
    offset: int = Query(0, ge=0),
    agent_id: str | None = Query(None),
    service: WazuhService = Depends(get_service),
) -> APIResponse:
    """
    Get recent alerts with optional severity filtering (plain array — used by
    dashboard widgets and WebSockets). For paginated views use /alerts/paginated.
    """
    try:
        data = await service.get_alerts(
            limit=limit, level_min=level_min, offset=offset, agent_id=agent_id
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

        await log_action(
            db,
            action_type="active_response",
            severity="critical",
            details={
                "agent_id": request.agent_id,
                "command": request.command,
                "args": request.args,
            },
            comment=f"Active response: {request.command} on agent {request.agent_id}",
        )

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
        data = await asyncio.wait_for(service.get_health(), timeout=5.0)
        return APIResponse.ok(data)
    except asyncio.TimeoutError:
        logger.warning("api_wazuh_health_timeout", timeout=5.0)
        return APIResponse.fail("Wazuh no respondió en 5s (timeout)")
    except Exception as e:
        logger.error("api_get_wazuh_health_failed", error=str(e))
        return APIResponse.fail(f"Failed to fetch Wazuh health: {str(e)}")


# ── Extended Wazuh endpoints (new Wazuh UI module) ────────────


@router.get("/stats/summary")
async def get_stats_summary(
    service: WazuhService = Depends(get_service),
) -> APIResponse:
    """[Wazuh API] Aggregate stats for the dashboard hero numbers."""
    try:
        data = await asyncio.wait_for(service.get_stats_summary(), timeout=15.0)
        return APIResponse.ok(data)
    except asyncio.TimeoutError:
        logger.warning("api_wazuh_stats_timeout")
        return APIResponse.fail("Wazuh stats agregadas: timeout")
    except Exception as e:
        logger.error("api_wazuh_stats_failed", error=str(e))
        return APIResponse.fail(f"Failed to fetch Wazuh stats: {str(e)}")


@router.get("/vulnerabilities")
async def get_vulnerabilities(
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    severity: str | None = Query(None),
    search: str | None = Query(None),
    agent_id: str | None = Query(None),
    service: WazuhService = Depends(get_service),
) -> APIResponse:
    """
    [Wazuh Indexer] List vulnerabilities detected on agents, paginated.
    Mirrors the frontend WazuhVulnerabilitiesPagination shape:
    {items: [...], pagination: {page, page_size, total, total_pages, has_next, has_prev}}.
    """
    try:
        items = await service.get_vulnerabilities(agent_id=agent_id, limit=500)
        # Client-side filter + paginate (bounded dataset; switch to server-side
        # query when the index grows past ~thousands of CVEs)
        if severity:
            items = [v for v in items if v.get("severity") == severity.lower()]
        if search:
            q = search.lower()
            items = [
                v for v in items
                if q in (v.get("cve_id") or "").lower()
                or q in (v.get("package_name") or "").lower()
                or q in (v.get("agent_name") or "").lower()
                or q in (v.get("title") or "").lower()
            ]
        total = len(items)
        start = (page - 1) * page_size
        page_items = items[start:start + page_size]
        total_pages = max(1, (total + page_size - 1) // page_size)
        return APIResponse.ok({
            "items": page_items,
            "pagination": {
                "page": page,
                "page_size": page_size,
                "total": total,
                "total_pages": total_pages,
                "has_next": page < total_pages,
                "has_prev": page > 1,
            },
        })
    except Exception as e:
        logger.error("api_wazuh_vulnerabilities_failed", error=str(e))
        return APIResponse.fail(f"Failed to fetch vulnerabilities: {str(e)}")


@router.get("/agents/{agent_id}")
async def get_agent_detail(
    agent_id: str,
    service: WazuhService = Depends(get_service),
) -> APIResponse:
    """[Wazuh API] Detail of a single agent."""
    try:
        data = await service.get_agent_detail(agent_id)
        return APIResponse.ok(data)
    except Exception as e:
        logger.error("api_wazuh_agent_detail_failed", agent_id=agent_id, error=str(e))
        return APIResponse.fail(f"Failed to fetch agent {agent_id}: {str(e)}")


@router.get("/agents/{agent_id}/alerts")
async def get_agent_alerts(
    agent_id: str,
    limit: int = Query(25, ge=1, le=500),
    level_min: int = Query(0, ge=0, le=15),
    service: WazuhService = Depends(get_service),
) -> APIResponse:
    """[Wazuh API] Recent alerts from one specific agent."""
    try:
        data = await service.get_agent_alerts(agent_id=agent_id, limit=limit, level_min=level_min)
        return APIResponse.ok(data)
    except Exception as e:
        logger.error("api_wazuh_agent_alerts_failed", agent_id=agent_id, error=str(e))
        return APIResponse.fail(f"Failed to fetch agent {agent_id} alerts: {str(e)}")


@router.get("/agents/{agent_id}/syscheck")
async def get_agent_syscheck(
    agent_id: str,
    limit: int = Query(50, ge=1, le=500),
    service: WazuhService = Depends(get_service),
) -> APIResponse:
    """[Wazuh API] File integrity monitoring (FIM) events for an agent."""
    try:
        data = await service.get_agent_syscheck(agent_id=agent_id, limit=limit)
        return APIResponse.ok(data)
    except Exception as e:
        logger.error("api_wazuh_agent_syscheck_failed", agent_id=agent_id, error=str(e))
        return APIResponse.fail(f"Failed to fetch syscheck for agent {agent_id}: {str(e)}")


@router.get("/agents/{agent_id}/syscollector")
async def get_agent_syscollector(
    agent_id: str,
    service: WazuhService = Depends(get_service),
) -> APIResponse:
    """[Wazuh API] Hardware/OS/packages inventory for an agent."""
    try:
        data = await service.get_agent_syscollector(agent_id)
        return APIResponse.ok(data)
    except Exception as e:
        logger.error("api_wazuh_agent_syscollector_failed", agent_id=agent_id, error=str(e))
        return APIResponse.fail(f"Failed to fetch syscollector for agent {agent_id}: {str(e)}")


@router.get("/mitre/matrix")
async def get_mitre_matrix(
    service: WazuhService = Depends(get_service),
) -> APIResponse:
    """[Wazuh API] MITRE ATT&CK matrix: tactics → techniques → count."""
    try:
        data = await service.get_mitre_matrix()
        return APIResponse.ok(data)
    except Exception as e:
        logger.error("api_wazuh_mitre_matrix_failed", error=str(e))
        return APIResponse.fail(f"Failed to fetch MITRE matrix: {str(e)}")

