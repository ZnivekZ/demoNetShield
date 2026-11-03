"""
Daily Digest Router — REST endpoints for the Daily Security Digest & Delta feature.
Prefix: /api/digest
"""

from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from schemas.common import APIResponse
from schemas.digest import AgentCategoryOverrideRequest, DigestGenerateRequest
from services.digest_service import get_digest_service

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/api/digest", tags=["Digest"])


# ── GET /api/digest/latest ────────────────────────────────────────────────────

@router.get("/latest")
async def get_latest_digest(
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """
    Return the most recent Daily Security Digest from the local database.
    This is the primary endpoint used by the UI on page load.
    Fast: reads from SQLite only, no Wazuh or AI calls.
    If no digest has been generated yet, returns a 404-like empty response.
    """
    try:
        svc    = get_digest_service()
        digest = await svc.get_latest_from_db(db)
        if digest is None:
            return APIResponse.ok(None)
        return APIResponse.ok(digest)
    except Exception as e:
        logger.error("digest_get_latest_failed", error=str(e))
        return APIResponse.fail(f"Failed to fetch latest digest: {e}")


# ── GET /api/digest/history ───────────────────────────────────────────────────

@router.get("/history")
async def get_digest_history(
    limit: int = Query(30, ge=1, le=90, description="Number of past digests to return"),
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """
    Return a lightweight list of past digests (date, risk level, key metrics).
    Used by DigestDatePicker in the UI to display the history calendar.
    """
    try:
        svc     = get_digest_service()
        history = await svc.get_history_from_db(limit=limit, db=db)
        return APIResponse.ok(history)
    except Exception as e:
        logger.error("digest_get_history_failed", error=str(e))
        return APIResponse.fail(f"Failed to fetch digest history: {e}")


# ── GET /api/digest/delta ─────────────────────────────────────────────────────

@router.get("/delta")
async def get_live_delta(
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """
    Return deterministic delta metrics for the current 24h window in real-time.
    No AI calls, no SQLite write — pure Wazuh data comparison.
    Used to show a live preview before a full digest is generated.
    """
    try:
        svc    = get_digest_service()
        # Generate without persisting (db=None skips the SQLite write)
        result = await svc.generate(method="live_delta", db=None, force=False)
        # Strip AI fields from live delta — they're not relevant here
        result.pop("ai_summary",    None)
        result.pop("ai_payload_sent", None)
        result.pop("id",            None)
        return APIResponse.ok(result)
    except Exception as e:
        logger.error("digest_live_delta_failed", error=str(e))
        return APIResponse.fail(f"Failed to compute live delta: {e}")


# ── GET /api/digest/agents ────────────────────────────────────────────────────

@router.get("/agents")
async def get_digest_agents(
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """
    Return the current agent list with their assigned categories and overrides.
    Used by AgentCategoryTabs for the manual reclassification UI.
    """
    try:
        from services.wazuh_service import get_wazuh_service
        from services.digest_service import _classify_agent

        wazuh     = get_wazuh_service()
        svc       = get_digest_service()
        agents    = await wazuh.get_agents()
        overrides = await svc.get_agent_overrides(db)

        result = []
        for agent in agents:
            agent_id   = agent.get("id", "")
            agent_name = agent.get("name", "")
            if agent_id in overrides:
                cat    = overrides[agent_id]
                source = "manual_override"
            else:
                cat, source = _classify_agent(agent_name, overrides)
            result.append({
                "agent_id":       agent_id,
                "agent_name":     agent_name,
                "status":         agent.get("status", ""),
                "category":       cat,
                "category_source": source,
                "ip":             agent.get("ip", ""),
                "os":             (agent.get("os") or {}).get("name", ""),
                "last_keep_alive": agent.get("lastKeepAlive", ""),
            })
        return APIResponse.ok(result)
    except Exception as e:
        logger.error("digest_get_agents_failed", error=str(e))
        return APIResponse.fail(f"Failed to fetch agents: {e}")


# ── GET /api/digest/cisa-kev ──────────────────────────────────────────────────

@router.get("/cisa-kev")
async def get_cisa_kev_status() -> APIResponse:
    """
    Return the current CISA KEV catalog status:
    how many entries are loaded, when it was last updated, and load status.
    """
    try:
        from services.cisa_kev_service import get_cisa_kev_service
        kev = get_cisa_kev_service()
        return APIResponse.ok({
            "loaded":       kev.is_loaded(),
            "catalog_size": kev.catalog_size(),
            "last_updated": kev.last_updated(),
            "feed_url":     "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json",
        })
    except Exception as e:
        logger.error("digest_cisa_kev_status_failed", error=str(e))
        return APIResponse.fail(f"Failed to fetch CISA KEV status: {e}")


# ── GET /api/digest/{date} ────────────────────────────────────────────────────

@router.get("/{date}")
async def get_digest_by_date(
    date: str,
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """
    Return the digest for a specific date (format: YYYY-MM-DD).
    Reads from SQLite — fast, no Wazuh calls.
    Returns 404 if no digest exists for that date.
    """
    # Basic format validation
    import re
    if not re.match(r"^\d{4}-\d{2}-\d{2}$", date):
        raise HTTPException(status_code=422, detail="Date must be in YYYY-MM-DD format")

    try:
        svc    = get_digest_service()
        digest = await svc.get_by_date_from_db(date, db)
        if digest is None:
            raise HTTPException(status_code=404, detail=f"No digest found for {date}")
        return APIResponse.ok(digest)
    except HTTPException:
        raise
    except Exception as e:
        logger.error("digest_get_by_date_failed", date=date, error=str(e))
        return APIResponse.fail(f"Failed to fetch digest for {date}: {e}")


# ── POST /api/digest/generate ─────────────────────────────────────────────────

@router.post("/generate")
async def generate_digest(
    body: DigestGenerateRequest | None = None,
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """
    Trigger a full digest generation (manual).
    - Queries Wazuh (or mock data if MOCK_ALL=true)
    - Calculates 24h delta
    - Runs CISA KEV cross-reference
    - Calls Groq (or mock if no API key)
    - Persists result to SQLite
    - Returns the complete DigestResponse

    If today's digest already exists and force=False (default), returns the
    cached version immediately without consuming AI tokens.
    """
    force = (body.force if body else False) or False
    try:
        svc    = get_digest_service()
        logger.info("digest_generate_requested", force=force)
        result = await svc.generate(method="manual", db=db, force=force)
        return APIResponse.ok(result)
    except Exception as e:
        logger.error("digest_generate_failed", error=str(e))
        return APIResponse.fail(f"Digest generation failed: {e}")


# ── PUT /api/digest/agents/{agent_id}/category ────────────────────────────────

@router.put("/agents/{agent_id}/category")
async def update_agent_category(
    agent_id: str,
    body: AgentCategoryOverrideRequest,
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """
    Manually override the category of an agent.
    The override is persisted in SQLite and takes precedence over automatic
    pattern-based classification on all future digest generations.

    Categories: proxy | mail | notebook | server
    """
    try:
        from services.wazuh_service import get_wazuh_service
        wazuh  = get_wazuh_service()
        agents = await wazuh.get_agents()
        agent  = next((a for a in agents if a.get("id") == agent_id), None)
        if agent is None:
            raise HTTPException(status_code=404, detail=f"Agent {agent_id!r} not found")

        svc = get_digest_service()
        await svc.set_agent_override(
            agent_id   = agent_id,
            agent_name = agent.get("name", agent_id),
            category   = body.category.value,
            db         = db,
        )
        logger.info("digest_agent_category_updated", agent_id=agent_id, category=body.category)
        return APIResponse.ok({
            "agent_id":   agent_id,
            "agent_name": agent.get("name", agent_id),
            "category":   body.category.value,
            "source":     "manual_override",
        })
    except HTTPException:
        raise
    except Exception as e:
        logger.error("digest_update_agent_category_failed", agent_id=agent_id, error=str(e))
        return APIResponse.fail(f"Failed to update agent category: {e}")
