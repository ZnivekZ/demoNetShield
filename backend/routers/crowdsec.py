"""
CrowdSec Router — REST API for CrowdSec Local API (LAPI) integration.
Prefix: /api/crowdsec

Endpoints:
  Decisions:    GET/POST/DELETE (by ID, by IP)
  Alerts:       GET list + detail
  Infrastructure: bouncers, machines, scenarios, metrics, hub
  Whitelist:    GET/POST/DELETE (local DB via MockService)
  Hybrid:       IP context (CrowdSec+MikroTik+Wazuh), full remediation, sync

All destructive actions (POST/DELETE) MUST be confirmed via ConfirmModal on frontend.
All actions are logged to ActionLog for audit trail.
"""

from __future__ import annotations

import json

import structlog
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models.action_log import ActionLog
from schemas.common import APIResponse
from schemas.crowdsec import (
    FullRemediationRequest,
    ManualDecisionRequest,
    SyncApplyRequest,
    WhitelistRequest,
)
from services.crowdsec_service import CrowdSecService, get_crowdsec_service
from services.mikrotik_service import MikroTikService, get_mikrotik_service
from services.wazuh_service import WazuhService, get_wazuh_service

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/api/crowdsec", tags=["CrowdSec"])


# ── Dependency injectors ──────────────────────────────────────────────────────

def get_cs() -> CrowdSecService:
    return get_crowdsec_service()


def get_mt() -> MikroTikService:
    return get_mikrotik_service()


def get_wz() -> WazuhService:
    return get_wazuh_service()


# ══════════════════════════════════════════════════════════════════════════════
# DECISIONS
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/decisions")
async def get_decisions(
    ip: str | None = Query(None, description="Filter by source IP"),
    scenario: str | None = Query(None, description="Filter by scenario name"),
    type_: str | None = Query(None, alias="type", description="Filter by type (ban/captcha)"),
    crowdsec: CrowdSecService = Depends(get_cs),
) -> APIResponse:
    """
    [CrowdSec LAPI] GET /v1/decisions — active bans and captchas.
    Returns all decisions (not expired) with community score and metadata.
    """
    try:
        decisions = await crowdsec.get_decisions(ip=ip, scenario=scenario, type_=type_)
        logger.debug("api_crowdsec_decisions", count=len(decisions))
        return APIResponse.ok(decisions)
    except Exception as e:
        logger.error("api_crowdsec_decisions_failed", error=str(e))
        return APIResponse.fail(f"Error fetching CrowdSec decisions: {e}")


@router.get("/decisions/stream")
async def get_decisions_stream(
    startup: bool = Query(False, description="Return boot snapshot instead of delta"),
    crowdsec: CrowdSecService = Depends(get_cs),
) -> APIResponse:
    """
    [CrowdSec LAPI] GET /v1/decisions/stream — incremental decision updates.
    Frontend WebSocket uses this for real-time sync. REST callers can poll.
    """
    try:
        result = await crowdsec.get_decisions_stream(startup=startup)
        return APIResponse.ok(result)
    except Exception as e:
        logger.error("api_crowdsec_stream_failed", error=str(e))
        return APIResponse.fail(f"Error fetching decisions stream: {e}")


@router.post("/decisions/manual")
async def add_manual_decision(
    request: ManualDecisionRequest,
    crowdsec: CrowdSecService = Depends(get_cs),
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """
    [CrowdSec LAPI] POST /v1/decisions — add a manual ban or captcha.
    Requires user confirmation via ConfirmModal on frontend.
    """
    try:
        result = await crowdsec.add_decision(
            ip=request.ip,
            duration=request.duration,
            reason=request.reason,
            type_=request.type,
        )
        log_entry = ActionLog(
            action_type="crowdsec_manual_decision",
            target_ip=request.ip,
            details=json.dumps({
                "type": request.type,
                "duration": request.duration,
                "reason": request.reason,
                "source": "crowdsec",
            }),
            comment=f"CrowdSec manual {request.type}: {request.reason}",
        )
        db.add(log_entry)
        await db.flush()
        logger.info("api_crowdsec_manual_decision", ip=request.ip, type_=request.type)
        return APIResponse.ok(result)
    except Exception as e:
        logger.error("api_crowdsec_manual_decision_failed", ip=request.ip, error=str(e))
        return APIResponse.fail(f"Error adding decision: {e}")


@router.delete("/decisions/{decision_id}")
async def delete_decision(
    decision_id: str,
    crowdsec: CrowdSecService = Depends(get_cs),
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """
    [CrowdSec LAPI] DELETE /v1/decisions/{id} — remove a single decision.
    Requires user confirmation via ConfirmModal on frontend.
    """
    try:
        result = await crowdsec.delete_decision(decision_id)
        log_entry = ActionLog(
            action_type="crowdsec_delete_decision",
            details=json.dumps({"decision_id": decision_id, "source": "crowdsec"}),
            comment=f"CrowdSec decision removed: {decision_id}",
        )
        db.add(log_entry)
        await db.flush()
        logger.info("api_crowdsec_delete_decision", id=decision_id)
        return APIResponse.ok(result)
    except Exception as e:
        logger.error("api_crowdsec_delete_decision_failed", id=decision_id, error=str(e))
        return APIResponse.fail(f"Error deleting decision: {e}")


@router.delete("/decisions/ip/{ip}")
async def delete_decisions_by_ip(
    ip: str,
    crowdsec: CrowdSecService = Depends(get_cs),
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """
    [CrowdSec LAPI] DELETE /v1/decisions?ip={ip} — remove all decisions for an IP.
    Requires user confirmation via ConfirmModal on frontend.
    """
    try:
        result = await crowdsec.delete_decisions_by_ip(ip)
        log_entry = ActionLog(
            action_type="crowdsec_unblock_ip",
            target_ip=ip,
            details=json.dumps({"source": "crowdsec", "scope": "all_decisions"}),
            comment=f"CrowdSec all decisions removed for {ip}",
        )
        db.add(log_entry)
        await db.flush()
        logger.info("api_crowdsec_unblock_ip", ip=ip)
        return APIResponse.ok(result)
    except Exception as e:
        logger.error("api_crowdsec_unblock_ip_failed", ip=ip, error=str(e))
        return APIResponse.fail(f"Error deleting decisions for IP {ip}: {e}")


# ══════════════════════════════════════════════════════════════════════════════
# ALERTS
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/alerts")
async def get_alerts(
    limit: int = Query(50, ge=1, le=500),
    scenario: str | None = Query(None),
    ip: str | None = Query(None),
    crowdsec: CrowdSecService = Depends(get_cs),
) -> APIResponse:
    """[CrowdSec LAPI] GET /v1/alerts — attack detections by local agent."""
    try:
        alerts = await crowdsec.get_alerts(limit=limit, scenario=scenario, ip=ip)
        return APIResponse.ok(alerts)
    except Exception as e:
        logger.error("api_crowdsec_alerts_failed", error=str(e))
        return APIResponse.fail(f"Error fetching alerts: {e}")


@router.get("/alerts/{alert_id}")
async def get_alert_detail(
    alert_id: str,
    crowdsec: CrowdSecService = Depends(get_cs),
) -> APIResponse:
    """[CrowdSec LAPI] GET /v1/alerts/{id} — full alert with all events."""
    try:
        alert = await crowdsec.get_alert_detail(alert_id)
        if alert is None:
            return APIResponse.fail(f"Alert {alert_id} not found")
        return APIResponse.ok(alert)
    except Exception as e:
        logger.error("api_crowdsec_alert_detail_failed", id=alert_id, error=str(e))
        return APIResponse.fail(f"Error fetching alert detail: {e}")


# ══════════════════════════════════════════════════════════════════════════════
# INFRASTRUCTURE
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/bouncers")
async def get_bouncers(crowdsec: CrowdSecService = Depends(get_cs)) -> APIResponse:
    """[CrowdSec LAPI] GET /v1/bouncers — registered bouncer agents."""
    try:
        return APIResponse.ok(await crowdsec.get_bouncers())
    except Exception as e:
        return APIResponse.fail(f"Error fetching bouncers: {e}")


@router.get("/machines")
async def get_machines(crowdsec: CrowdSecService = Depends(get_cs)) -> APIResponse:
    """[CrowdSec LAPI] GET /v1/machines — registered CrowdSec agents."""
    try:
        return APIResponse.ok(await crowdsec.get_machines())
    except Exception as e:
        return APIResponse.fail(f"Error fetching machines: {e}")


@router.get("/scenarios")
async def get_scenarios(crowdsec: CrowdSecService = Depends(get_cs)) -> APIResponse:
    """[CrowdSec LAPI] Aggregated scenario stats derived from alerts."""
    try:
        return APIResponse.ok(await crowdsec.get_scenarios())
    except Exception as e:
        return APIResponse.fail(f"Error fetching scenarios: {e}")


@router.get("/metrics")
async def get_metrics(crowdsec: CrowdSecService = Depends(get_cs)) -> APIResponse:
    """[CrowdSec LAPI] Computed metrics: decisions, top countries, top scenario."""
    try:
        return APIResponse.ok(await crowdsec.get_metrics())
    except Exception as e:
        return APIResponse.fail(f"Error fetching metrics: {e}")


@router.get("/hub")
async def get_hub(crowdsec: CrowdSecService = Depends(get_cs)) -> APIResponse:
    """[CrowdSec Hub] Installed collections and parsers."""
    try:
        return APIResponse.ok(await crowdsec.get_hub_status())
    except Exception as e:
        return APIResponse.fail(f"Error fetching hub status: {e}")


# ══════════════════════════════════════════════════════════════════════════════
# WHITELIST (local database — not CrowdSec LAPI)
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/whitelist")
async def get_whitelist() -> APIResponse:
    """[Local DB] List whitelisted IPs/CIDRs (not forwarded to CrowdSec LAPI)."""
    try:
        from services.mock_service import MockService
        from config import get_settings
        settings = get_settings()
        if settings.should_mock_crowdsec:
            return APIResponse.ok(MockService.crowdsec_get_whitelist())
        # Production: query CrowdSecWhitelist model
        return APIResponse.ok(MockService.crowdsec_get_whitelist())
    except Exception as e:
        return APIResponse.fail(f"Error fetching whitelist: {e}")


@router.post("/whitelist")
async def add_to_whitelist(
    request: WhitelistRequest,
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """
    [Local DB] Add IP/CIDR to local whitelist.
    Requires user confirmation via ConfirmModal on frontend.
    """
    try:
        from services.mock_service import MockService
        entry = MockService.crowdsec_add_whitelist(ip=request.ip, reason=request.reason)
        log_entry = ActionLog(
            action_type="crowdsec_whitelist_add",
            target_ip=request.ip,
            details=json.dumps({"reason": request.reason}),
            comment=f"CrowdSec whitelist add: {request.ip}",
        )
        db.add(log_entry)
        await db.flush()
        logger.info("api_crowdsec_whitelist_add", ip=request.ip)
        return APIResponse.ok(entry)
    except Exception as e:
        logger.error("api_crowdsec_whitelist_add_failed", ip=request.ip, error=str(e))
        return APIResponse.fail(f"Error adding to whitelist: {e}")


@router.delete("/whitelist/{whitelist_id}")
async def remove_from_whitelist(
    whitelist_id: int,
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """
    [Local DB] Remove IP/CIDR from local whitelist.
    Requires user confirmation via ConfirmModal on frontend.
    """
    try:
        from services.mock_service import MockService
        removed = MockService.crowdsec_delete_whitelist(whitelist_id)
        if not removed:
            return APIResponse.fail(f"Whitelist entry {whitelist_id} not found")
        log_entry = ActionLog(
            action_type="crowdsec_whitelist_remove",
            details=json.dumps({"whitelist_id": whitelist_id}),
            comment=f"CrowdSec whitelist remove: ID {whitelist_id}",
        )
        db.add(log_entry)
        await db.flush()
        logger.info("api_crowdsec_whitelist_remove", id=whitelist_id)
        return APIResponse.ok({"id": whitelist_id, "removed": True})
    except Exception as e:
        logger.error("api_crowdsec_whitelist_remove_failed", id=whitelist_id, error=str(e))
        return APIResponse.fail(f"Error removing from whitelist: {e}")


# ══════════════════════════════════════════════════════════════════════════════
# HYBRID ENDPOINTS (CrowdSec + MikroTik + Wazuh)
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/context/ip/{ip}")
async def get_ip_context(
    ip: str,
    crowdsec: CrowdSecService = Depends(get_cs),
    mikrotik: MikroTikService = Depends(get_mt),
    wazuh: WazuhService = Depends(get_wz),
) -> APIResponse:
    """
    [Hybrid: CrowdSec + MikroTik + Wazuh]
    Unified IP threat context combining all three security layers.
    Used by IpContextPanel slide-over and GlobalSearch results.
    """
    try:
        from config import get_settings
        settings = get_settings()
        if settings.should_mock_crowdsec:
            from services.mock_data import MockData
            ctx = MockData.crowdsec.ip_context(ip)
            return APIResponse.ok(ctx)

        # Real mode: query all three systems in parallel
        import asyncio
        cs_task = crowdsec.get_ip_context_crowdsec(ip)
        mt_arp_task = mikrotik.get_arp()
        mt_bl_task = mikrotik.get_address_list("Blacklist_Automatica")
        wz_alerts_task = wazuh.get_alerts(limit=20, src_ip=ip)

        cs_data, mt_arp, mt_bl, wz_alerts = await asyncio.gather(
            cs_task, mt_arp_task, mt_bl_task, wz_alerts_task,
            return_exceptions=True,
        )

        arp_match = next(
            (e for e in (mt_arp or []) if e.get("ip_address") == ip), None
        ) if not isinstance(mt_arp, Exception) else None

        in_blacklist = any(
            e.get("address") == ip for e in (mt_bl or [])
        ) if not isinstance(mt_bl, Exception) else False

        wazuh_alerts = [a for a in (wz_alerts or [])] if not isinstance(wz_alerts, Exception) else []

        return APIResponse.ok({
            "ip": ip,
            "crowdsec": cs_data if not isinstance(cs_data, Exception) else {},
            "mikrotik": {
                "in_arp": arp_match is not None,
                "arp_comment": arp_match.get("comment") if arp_match else None,
                "in_blacklist": in_blacklist,
                "firewall_rules": [],
            },
            "wazuh": {
                "alerts_count": len(wazuh_alerts),
                "last_alert": wazuh_alerts[0] if wazuh_alerts else None,
                "agents_affected": list({a.get("agent_name") for a in wazuh_alerts}),
            },
        })
    except Exception as e:
        logger.error("api_crowdsec_ip_context_failed", ip=ip, error=str(e))
        return APIResponse.fail(f"Error fetching IP context: {e}")


@router.post("/remediation/full")
async def full_remediation(
    request: FullRemediationRequest,
    crowdsec: CrowdSecService = Depends(get_cs),
    mikrotik: MikroTikService = Depends(get_mt),
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """
    [Hybrid: CrowdSec + MikroTik]
    Block IP simultaneously in CrowdSec and MikroTik address list.
    Requires user confirmation via ConfirmModal on frontend.
    """
    try:
        results = {}

        # Block in CrowdSec
        try:
            cs_result = await crowdsec.add_decision(
                ip=request.ip,
                duration=request.duration,
                reason=request.reason,
                type_="ban",
            )
            results["crowdsec"] = {"blocked": True, "result": cs_result}
        except Exception as e:
            logger.warning("full_remediation_crowdsec_failed", ip=request.ip, error=str(e))
            results["crowdsec"] = {"blocked": False, "error": str(e)}

        # Block in MikroTik
        try:
            mt_result = await mikrotik.add_to_address_list(
                ip=request.ip,
                list_name="Blacklist_Automatica",
                timeout=request.duration,
                comment=f"CrowdSec: {request.reason}",
            )
            results["mikrotik"] = {"blocked": True, "result": mt_result}
        except Exception as e:
            logger.warning("full_remediation_mikrotik_failed", ip=request.ip, error=str(e))
            results["mikrotik"] = {"blocked": False, "error": str(e)}

        log_entry = ActionLog(
            action_type="crowdsec_full_remediation",
            target_ip=request.ip,
            details=json.dumps({
                "reason": request.reason,
                "duration": request.duration,
                "trigger": request.trigger,
                "crowdsec_blocked": results["crowdsec"]["blocked"],
                "mikrotik_blocked": results["mikrotik"]["blocked"],
            }),
            comment=f"Full remediation: {request.ip} — {request.reason}",
        )
        db.add(log_entry)
        await db.flush()

        logger.info(
            "api_crowdsec_full_remediation",
            ip=request.ip,
            cs=results["crowdsec"]["blocked"],
            mt=results["mikrotik"]["blocked"],
        )
        return APIResponse.ok({"ip": request.ip, "results": results})
    except Exception as e:
        logger.error("api_crowdsec_full_remediation_failed", ip=request.ip, error=str(e))
        return APIResponse.fail(f"Error executing full remediation: {e}")


@router.get("/sync/status")
async def get_sync_status(
    crowdsec: CrowdSecService = Depends(get_cs),
    mikrotik: MikroTikService = Depends(get_mt),
) -> APIResponse:
    """
    [Hybrid: CrowdSec + MikroTik]
    Compare CrowdSec active bans with MikroTik Blacklist_Automatica.
    Returns list of IPs only in CrowdSec (not pushed to MikroTik yet).
    """
    try:
        from config import get_settings
        settings = get_settings()
        if settings.should_mock_crowdsec:
            from services.mock_data import MockData
            return APIResponse.ok(MockData.crowdsec.sync_status())

        # Real mode: fetch both lists in parallel
        import asyncio
        decisions, address_list = await asyncio.gather(
            crowdsec.get_decisions(),
            mikrotik.get_address_list("Blacklist_Automatica"),
            return_exceptions=True,
        )
        mikrotik_ips: set[str] = set()
        if not isinstance(address_list, Exception):
            mikrotik_ips = {e.get("address", "") for e in address_list}

        return APIResponse.ok(await crowdsec.get_sync_status(mikrotik_ips))
    except Exception as e:
        logger.error("api_crowdsec_sync_status_failed", error=str(e))
        return APIResponse.fail(f"Error computing sync status: {e}")


@router.post("/sync/apply")
async def apply_sync(
    request: SyncApplyRequest,
    crowdsec: CrowdSecService = Depends(get_cs),
    mikrotik: MikroTikService = Depends(get_mt),
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """
    [Hybrid: CrowdSec + MikroTik]
    Push CrowdSec decisions to MikroTik (or remove MikroTik-only entries).
    Requires user confirmation via ConfirmModal on frontend.
    """
    try:
        added = []
        removed = []

        for ip in request.add_to_mikrotik:
            try:
                await mikrotik.add_to_address_list(
                    ip=ip,
                    list_name="Blacklist_Automatica",
                    timeout="24h",
                    comment="CrowdSec sync",
                )
                added.append({"ip": ip, "success": True})
            except Exception as e:
                added.append({"ip": ip, "success": False, "error": str(e)})

        for ip in request.remove_from_mikrotik:
            try:
                await mikrotik.remove_from_address_list(
                    ip=ip,
                    list_name="Blacklist_Automatica",
                )
                removed.append({"ip": ip, "success": True})
            except Exception as e:
                removed.append({"ip": ip, "success": False, "error": str(e)})

        log_entry = ActionLog(
            action_type="crowdsec_sync_apply",
            details=json.dumps({
                "add_count": len(added),
                "remove_count": len(removed),
                "add_to_mikrotik": request.add_to_mikrotik,
                "remove_from_mikrotik": request.remove_from_mikrotik,
            }),
            comment=f"CrowdSec sync: +{len(added)} -{len(removed)} IPs to MikroTik",
        )
        db.add(log_entry)
        await db.flush()

        logger.info(
            "api_crowdsec_sync_applied",
            added=len([a for a in added if a["success"]]),
            removed=len([r for r in removed if r["success"]]),
        )
        return APIResponse.ok({"added": added, "removed": removed})
    except Exception as e:
        logger.error("api_crowdsec_sync_apply_failed", error=str(e))
        return APIResponse.fail(f"Error applying sync: {e}")
