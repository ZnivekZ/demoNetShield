"""
Phishing Router - Endpoints for phishing detection and DNS sinkhole management.
Prefix: /api/phishing

Data sources:
- Alerts: [Wazuh API] — filtered by phishing-related rule groups
- Sinkhole: [MikroTik API] — DNS static entries
- Tracking: [DB] — SinkholeEntry model for audit trail
"""

from __future__ import annotations

import json
import time

import structlog
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import get_settings
from database import get_db
from models.action_log import ActionLog
from models.sinkhole_entry import SinkholeEntry
from schemas.common import APIResponse
from schemas.phishing import (
    PhishingBlockIPRequest,
    PhishingSimulateRequest,
    SinkholeRequest,
)
from services.mikrotik_service import MikroTikService, get_mikrotik_service
from services.wazuh_service import WazuhService, get_wazuh_service

logger = structlog.get_logger(__name__)
settings = get_settings()

router = APIRouter(prefix="/api/phishing", tags=["Phishing"])

# Rule groups that indicate phishing-related alerts in Wazuh
PHISHING_RULE_GROUPS = {
    "web_attack", "phishing", "malicious_url",
    "suspicious_download", "credential_harvesting",
    "web", "attack", "web-attack",
}


def get_mt_service() -> MikroTikService:
    return get_mikrotik_service()


def get_wz_service() -> WazuhService:
    return get_wazuh_service()


def _is_phishing_alert(alert: dict) -> bool:
    """Check if an alert's groups overlap with phishing indicators."""
    groups = set(g.lower() for g in alert.get("rule_groups", []))
    return bool(groups & PHISHING_RULE_GROUPS)


def _extract_domain(url: str) -> str:
    """Extract domain from a URL string."""
    if not url:
        return ""
    url = url.lower().strip()
    # Remove protocol
    for prefix in ("http://", "https://", "ftp://"):
        if url.startswith(prefix):
            url = url[len(prefix):]
            break
    # Remove path/query
    url = url.split("/")[0].split("?")[0].split(":")[0]
    return url


@router.get("/alerts")
async def get_phishing_alerts(
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    wazuh: WazuhService = Depends(get_wz_service),
) -> APIResponse:
    """
    [Wazuh API] Get phishing-related alerts.
    Filters by rule groups: web_attack, phishing, malicious_url, etc.
    """
    try:
        # Fetch a larger set and filter client-side for phishing groups
        all_alerts = await wazuh.get_alerts(limit=500, offset=0)
        phishing = [a for a in all_alerts if _is_phishing_alert(a)]
        # Apply pagination
        paginated = phishing[offset:offset + limit]
        return APIResponse.ok(paginated)
    except Exception as e:
        logger.error("api_phishing_alerts_failed", error=str(e))
        return APIResponse.fail(f"Failed to fetch phishing alerts: {str(e)}")


@router.get("/domains/suspicious")
async def get_suspicious_domains(
    wazuh: WazuhService = Depends(get_wz_service),
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """
    [Wazuh API] Get suspicious domains detected in phishing alerts.
    Groups by domain with hit count, affected agents, first/last seen.
    """
    try:
        all_alerts = await wazuh.get_alerts(limit=500, offset=0)
        phishing = [a for a in all_alerts if _is_phishing_alert(a)]

        # Get sinkholed domains from DB
        result = await db.execute(select(SinkholeEntry))
        sinkholed = {s.domain.lower() for s in result.scalars().all()}

        from collections import defaultdict
        domains: defaultdict[str, dict] = defaultdict(lambda: {
            "domain": "", "hit_count": 0, "agents": set(),
            "first_seen": "", "last_seen": "", "in_sinkhole": False,
        })

        for alert in phishing:
            url = alert.get("dst_url", "") or alert.get("dst_ip", "")
            domain = _extract_domain(url)
            if not domain:
                continue

            entry = domains[domain]
            entry["domain"] = domain
            entry["hit_count"] += 1
            entry["agents"].add(alert.get("agent_name", ""))
            entry["in_sinkhole"] = domain.lower() in sinkholed

            ts = alert.get("timestamp", "")
            if ts:
                if not entry["first_seen"] or ts < entry["first_seen"]:
                    entry["first_seen"] = ts
                if not entry["last_seen"] or ts > entry["last_seen"]:
                    entry["last_seen"] = ts

        data = []
        for d in domains.values():
            data.append({
                "domain": d["domain"],
                "hit_count": d["hit_count"],
                "agents_affected": len(d["agents"]),
                "first_seen": d["first_seen"],
                "last_seen": d["last_seen"],
                "in_sinkhole": d["in_sinkhole"],
            })
        data.sort(key=lambda x: x["hit_count"], reverse=True)

        return APIResponse.ok(data)
    except Exception as e:
        logger.error("api_suspicious_domains_failed", error=str(e))
        return APIResponse.fail(f"Failed to fetch suspicious domains: {str(e)}")


@router.get("/urls/timeline")
async def get_phishing_timeline(
    wazuh: WazuhService = Depends(get_wz_service),
) -> APIResponse:
    """
    [Wazuh API] Get phishing attempt count per minute, last 60 minutes.
    Useful for detecting active campaigns.
    """
    try:
        all_alerts = await wazuh.get_alerts(limit=500, offset=0)
        phishing = [a for a in all_alerts if _is_phishing_alert(a)]

        from collections import Counter
        from datetime import datetime, timedelta, timezone

        now = datetime.now(timezone.utc)
        cutoff = now - timedelta(minutes=60)
        minute_counts: Counter[str] = Counter()

        for alert in phishing:
            ts_str = alert.get("timestamp", "")
            if not ts_str:
                continue
            try:
                ts = datetime.fromisoformat(ts_str.replace("+0000", "+00:00"))
                if ts >= cutoff:
                    minute_key = ts.strftime("%Y-%m-%dT%H:%M:00")
                    minute_counts[minute_key] += 1
            except (ValueError, TypeError):
                continue

        result = []
        for i in range(60):
            t = cutoff + timedelta(minutes=i)
            key = t.strftime("%Y-%m-%dT%H:%M:00")
            result.append({"minute": key, "count": minute_counts.get(key, 0)})

        return APIResponse.ok(result)
    except Exception as e:
        logger.error("api_phishing_timeline_failed", error=str(e))
        return APIResponse.fail(f"Failed to fetch phishing timeline: {str(e)}")


@router.get("/victims")
async def get_phishing_victims(
    wazuh: WazuhService = Depends(get_wz_service),
) -> APIResponse:
    """
    [Wazuh API] Get agents/users that accessed malicious URLs.
    """
    try:
        all_alerts = await wazuh.get_alerts(limit=500, offset=0)
        phishing = [a for a in all_alerts if _is_phishing_alert(a)]

        from collections import defaultdict
        victims: defaultdict[str, dict] = defaultdict(lambda: {
            "agent_name": "", "agent_id": "", "ip": "",
            "url": "", "timestamp": "", "times": 0,
        })

        for alert in phishing:
            key = f"{alert.get('agent_id', '')}:{alert.get('dst_url', '')}"
            v = victims[key]
            v["agent_name"] = alert.get("agent_name", "")
            v["agent_id"] = alert.get("agent_id", "")
            v["ip"] = alert.get("agent_ip", "") or alert.get("src_ip", "")
            v["url"] = alert.get("dst_url", "")
            v["times"] += 1
            ts = alert.get("timestamp", "")
            if ts and (not v["timestamp"] or ts > v["timestamp"]):
                v["timestamp"] = ts

        data = list(victims.values())
        data.sort(key=lambda x: x["times"], reverse=True)

        return APIResponse.ok(data)
    except Exception as e:
        logger.error("api_phishing_victims_failed", error=str(e))
        return APIResponse.fail(f"Failed to fetch phishing victims: {str(e)}")


@router.get("/stats")
async def get_phishing_stats(
    wazuh: WazuhService = Depends(get_wz_service),
) -> APIResponse:
    """
    [Wazuh API] Summary: total phishing alerts today, unique suspicious domains,
    affected agents, top URL, peak hour.
    """
    try:
        all_alerts = await wazuh.get_alerts(limit=500, offset=0)
        phishing = [a for a in all_alerts if _is_phishing_alert(a)]

        from collections import Counter
        from datetime import datetime, timezone

        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

        urls: Counter[str] = Counter()
        hours: Counter[str] = Counter()
        agents: set[str] = set()
        domains: set[str] = set()
        today_count = 0

        for alert in phishing:
            ts_str = alert.get("timestamp", "")
            if ts_str.startswith(today):
                today_count += 1

            url = alert.get("dst_url", "")
            if url:
                urls[url] += 1
                domain = _extract_domain(url)
                if domain:
                    domains.add(domain)

            agents.add(alert.get("agent_name", ""))

            if ts_str:
                try:
                    ts = datetime.fromisoformat(ts_str.replace("+0000", "+00:00"))
                    hours[ts.strftime("%H:00")] += 1
                except (ValueError, TypeError):
                    pass

        top_url = urls.most_common(1)
        peak = hours.most_common(1)

        return APIResponse.ok({
            "total_alerts_today": today_count,
            "unique_suspicious_domains": len(domains),
            "affected_agents": len(agents),
            "top_url": top_url[0][0] if top_url else "",
            "peak_hour": peak[0][0] if peak else "",
        })
    except Exception as e:
        logger.error("api_phishing_stats_failed", error=str(e))
        return APIResponse.fail(f"Failed to fetch phishing stats: {str(e)}")


# ── Sinkhole Management ──────────────────────────────────────────


@router.post("/domains/sinkhole")
async def sinkhole_domain(
    request: SinkholeRequest,
    mikrotik: MikroTikService = Depends(get_mt_service),
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """
    [MikroTik API] + [DB] Add domain to DNS sinkhole (resolve to 127.0.0.1).
    Requires user confirmation via ConfirmModal on frontend.
    """
    try:
        # Add to MikroTik DNS static
        result = await mikrotik.add_dns_static(
            domain=request.domain,
            address="127.0.0.1",
            comment=f"NetShield sinkhole: {request.reason}",
        )

        # Record in DB
        entry = SinkholeEntry(
            domain=request.domain,
            reason=request.reason,
        )
        db.add(entry)

        # Log the action
        log_entry = ActionLog(
            action_type="sinkhole_add",
            details=json.dumps({"domain": request.domain, "reason": request.reason}),
            comment=f"Sinkholed domain: {request.domain}",
        )
        db.add(log_entry)
        await db.flush()

        logger.info("api_domain_sinkholed", domain=request.domain)
        return APIResponse.ok(result)
    except Exception as e:
        logger.error("api_sinkhole_domain_failed", domain=request.domain, error=str(e))
        return APIResponse.fail(f"Failed to sinkhole domain: {str(e)}")


@router.delete("/domains/sinkhole/{domain}")
async def remove_sinkhole(
    domain: str,
    mikrotik: MikroTikService = Depends(get_mt_service),
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """
    [MikroTik API] + [DB] Remove domain from DNS sinkhole.
    """
    try:
        # Remove from MikroTik DNS static
        result = await mikrotik.remove_dns_static(domain)

        # Remove from DB
        db_result = await db.execute(
            select(SinkholeEntry).where(SinkholeEntry.domain == domain)
        )
        entry = db_result.scalar_one_or_none()
        if entry:
            await db.delete(entry)

        # Log the action
        log_entry = ActionLog(
            action_type="sinkhole_remove",
            details=json.dumps({"domain": domain}),
            comment=f"Removed sinkhole: {domain}",
        )
        db.add(log_entry)
        await db.flush()

        logger.info("api_sinkhole_removed", domain=domain)
        return APIResponse.ok(result)
    except Exception as e:
        logger.error("api_remove_sinkhole_failed", domain=domain, error=str(e))
        return APIResponse.fail(f"Failed to remove sinkhole: {str(e)}")


@router.get("/domains/sinkhole")
async def get_sinkholes(
    mikrotik: MikroTikService = Depends(get_mt_service),
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """
    [MikroTik API] List all domains currently in DNS sinkhole.
    Enriches with DB data (added_by, reason, timestamp).
    """
    try:
        # Get DNS static entries from MikroTik
        dns_entries = await mikrotik.get_dns_static()

        # Get DB records for enrichment
        db_result = await db.execute(select(SinkholeEntry))
        db_entries = {s.domain: s for s in db_result.scalars().all()}

        result = []
        for entry in dns_entries:
            domain = entry.get("domain", "")
            db_entry = db_entries.get(domain)
            result.append({
                "domain": domain,
                "address": entry.get("address", ""),
                "added_by": db_entry.added_by if db_entry else "unknown",
                "reason": db_entry.reason if db_entry else "",
                "created_at": db_entry.created_at.isoformat() if db_entry else "",
                "comment": entry.get("comment", ""),
            })

        return APIResponse.ok(result)
    except Exception as e:
        logger.error("api_get_sinkholes_failed", error=str(e))
        return APIResponse.fail(f"Failed to fetch sinkholes: {str(e)}")


# ── Phishing IP Block ────────────────────────────────────────────


@router.post("/ip/block")
async def block_phishing_ip(
    request: PhishingBlockIPRequest,
    mikrotik: MikroTikService = Depends(get_mt_service),
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """
    [MikroTik API] Block IP source of phishing campaign.
    Adds to address list "Phishing_Block" with configurable expiration.
    Requires user confirmation via ConfirmModal on frontend.
    """
    try:
        timeout = f"{request.duration_hours}h"
        result = await mikrotik.add_to_address_list(
            ip=request.ip,
            list_name="Phishing_Block",
            timeout=timeout,
            comment="Phishing source blocked via NetShield",
        )

        # Log the action
        log_entry = ActionLog(
            action_type="phishing_block",
            target_ip=request.ip,
            details=json.dumps({"duration_hours": request.duration_hours}),
            comment=f"Blocked phishing source IP: {request.ip}",
        )
        db.add(log_entry)
        await db.flush()

        logger.info("api_phishing_ip_blocked", ip=request.ip)
        return APIResponse.ok(result)
    except Exception as e:
        logger.error("api_phishing_block_ip_failed", ip=request.ip, error=str(e))
        return APIResponse.fail(f"Failed to block phishing IP: {str(e)}")


# ── Simulation (Lab Only) ────────────────────────────────────────


@router.post("/simulate")
async def simulate_phishing(
    request: PhishingSimulateRequest,
) -> APIResponse:
    """
    [Lab Only] Simulate a phishing alert for testing.
    Only available when APP_ENV=lab.
    Generates a synthetic event structure (does NOT inject into Wazuh).
    """
    if not settings.is_lab:
        return APIResponse.fail(
            "Phishing simulation is only available in lab mode (APP_ENV=lab)"
        )

    # Generate a synthetic phishing alert structure
    synthetic_alert = {
        "id": f"sim-{int(time.time())}",
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S+0000"),
        "agent_name": f"lab-agent-{request.target_agent_id or '001'}",
        "agent_id": request.target_agent_id or "001",
        "agent_ip": "192.168.88.10",
        "rule_id": "99999",
        "rule_level": 12,
        "rule_description": f"Simulated phishing access to {request.malicious_url}",
        "rule_groups": ["web_attack", "phishing"],
        "src_ip": "192.168.88.10",
        "dst_url": request.malicious_url,
        "mitre_technique": "Phishing (simulated)",
        "mitre_id": "T1566",
        "simulated": True,
    }

    logger.info(
        "api_phishing_simulated",
        agent_id=request.target_agent_id,
        url=request.malicious_url,
    )
    return APIResponse.ok({
        "message": "Phishing alert simulated successfully",
        "alert": synthetic_alert,
        "note": "This is a synthetic alert for testing. It was NOT injected into Wazuh.",
    })
