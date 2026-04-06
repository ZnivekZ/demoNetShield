"""
Portal Cautivo Router — All endpoints for MikroTik Hotspot management.
Prefix: /api/portal

Endpoints:
  POST   /setup                        — Initialize Hotspot server
  GET    /sessions/active              — Active sessions
  GET    /sessions/history             — Past sessions
  GET    /stats/realtime               — Real-time stats
  GET    /stats/summary                — Historical stats
  GET    /users                        — List users
  POST   /users                        — Create user
  PUT    /users/{username}             — Update user
  DELETE /users/{username}             — Delete user
  POST   /users/{username}/disconnect  — Force-disconnect session
  POST   /users/bulk                   — Bulk create users
  GET    /profiles                     — List speed profiles
  POST   /profiles                     — Create speed profile
  PUT    /profiles/{name}              — Update speed profile
  GET    /config                       — Get Hotspot config
  PUT    /config/unregistered-speed    — Update unregistered profile speed
  PUT    /config/schedule              — Configure access schedule
  GET    /config/schedule              — Get current schedule

All destructive actions (DELETE, disconnect, speed change, schedule) are logged in ActionLog.
All endpoints return error {"success": false, "error": "Hotspot no inicializado..."} if
the Hotspot server hasn't been set up yet.
"""

from __future__ import annotations

import json
from datetime import datetime

import structlog
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models.action_log import ActionLog
from schemas.common import APIResponse
from schemas.portal import (
    PortalUserCreate,
    PortalUserUpdate,
    PortalUserBulk,
    PortalProfileCreate,
    PortalProfileUpdate,
    UnregisteredSpeedUpdate,
    ScheduleConfig,
)
from services.portal_service import PortalService, HotspotNotInitializedError, get_portal_service

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/api/portal", tags=["Portal Cautivo"])


def get_service() -> PortalService:
    return get_portal_service()


def _hotspot_not_initialized_response() -> APIResponse:
    return APIResponse.fail(
        "Hotspot no inicializado. Ejecutá el setup desde Configuración → Inicializar Hotspot"
    )


# ── Setup ─────────────────────────────────────────────────────────


@router.post("/setup")
async def setup_hotspot(
    service: PortalService = Depends(get_service),
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """
    [MikroTik API] Initialize the MikroTik Hotspot server from scratch.
    Safe to call multiple times — skips steps that already exist.
    Runs: setup_hotspot.py → run_hotspot_setup()
    """
    try:
        from scripts.setup_hotspot import run_hotspot_setup
        result = await run_hotspot_setup()

        # Log the setup action
        log_entry = ActionLog(
            action_type="portal_setup",
            target_ip=None,
            details=json.dumps(result),
            comment="Hotspot setup executed from dashboard",
        )
        db.add(log_entry)
        await db.flush()

        logger.info("api_portal_setup", success=result["success"])
        return APIResponse.ok(result)
    except Exception as e:
        logger.error("api_portal_setup_failed", error=str(e))
        return APIResponse.fail(f"Setup failed: {str(e)}")


# ── Sessions ──────────────────────────────────────────────────────


@router.get("/sessions/active")
async def get_active_sessions(
    service: PortalService = Depends(get_service),
) -> APIResponse:
    """
    [MikroTik API] Get all currently active Hotspot sessions.
    Resource: /ip/hotspot/active
    """
    try:
        data = await service.get_active_sessions()
        return APIResponse.ok(data)
    except HotspotNotInitializedError:
        return _hotspot_not_initialized_response()
    except Exception as e:
        logger.error("api_portal_get_active_sessions_failed", error=str(e))
        return APIResponse.fail(f"Failed to fetch active sessions: {str(e)}")


@router.get("/sessions/history")
async def get_session_history(
    from_date: str | None = Query(default=None),
    to_date: str | None = Query(default=None),
    user: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=1000),
    service: PortalService = Depends(get_service),
) -> APIResponse:
    """
    [MikroTik API] Get historical session records.
    Resource: /ip/hotspot/host
    """
    try:
        data = await service.get_session_history(
            from_date=from_date,
            to_date=to_date,
            user=user,
            limit=limit,
        )
        return APIResponse.ok(data)
    except HotspotNotInitializedError:
        return _hotspot_not_initialized_response()
    except Exception as e:
        logger.error("api_portal_get_session_history_failed", error=str(e))
        return APIResponse.fail(f"Failed to fetch session history: {str(e)}")


@router.get("/sessions/chart")
async def get_sessions_chart(
    service: PortalService = Depends(get_service),
) -> APIResponse:
    """
    Return in-memory session history snapshots for the real-time chart.
    No RouterOS call — data collected as side effect of /sessions/active.
    """
    try:
        data = service.get_session_chart_history()
        return APIResponse.ok(data)
    except Exception as e:
        logger.error("api_portal_get_sessions_chart_failed", error=str(e))
        return APIResponse.fail(f"Failed to fetch chart data: {str(e)}")


# ── Statistics ────────────────────────────────────────────────────


@router.get("/stats/realtime")
async def get_realtime_stats(
    service: PortalService = Depends(get_service),
) -> APIResponse:
    """
    [MikroTik API] Real-time Hotspot stats aggregated from active sessions.
    Resource: /ip/hotspot/active
    """
    try:
        data = await service.get_realtime_stats()
        return APIResponse.ok(data)
    except HotspotNotInitializedError:
        return _hotspot_not_initialized_response()
    except Exception as e:
        logger.error("api_portal_get_realtime_stats_failed", error=str(e))
        return APIResponse.fail(f"Failed to fetch realtime stats: {str(e)}")


@router.get("/stats/summary")
async def get_summary_stats(
    service: PortalService = Depends(get_service),
) -> APIResponse:
    """
    [MikroTik API] Historical stats: top users, unique counts, heatmap data.
    Resources: /ip/hotspot/host + /ip/hotspot/user
    """
    try:
        data = await service.get_summary_stats()
        return APIResponse.ok(data)
    except HotspotNotInitializedError:
        return _hotspot_not_initialized_response()
    except Exception as e:
        logger.error("api_portal_get_summary_stats_failed", error=str(e))
        return APIResponse.fail(f"Failed to fetch summary stats: {str(e)}")


# ── Users ─────────────────────────────────────────────────────────


@router.get("/users")
async def get_users(
    search: str | None = Query(default=None),
    profile: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    service: PortalService = Depends(get_service),
) -> APIResponse:
    """
    [MikroTik API] List registered hotspot users.
    Resource: /ip/hotspot/user
    """
    try:
        data = await service.get_users(search=search, profile=profile, limit=limit, offset=offset)
        return APIResponse.ok(data)
    except HotspotNotInitializedError:
        return _hotspot_not_initialized_response()
    except Exception as e:
        logger.error("api_portal_get_users_failed", error=str(e))
        return APIResponse.fail(f"Failed to fetch users: {str(e)}")


@router.post("/users")
async def create_user(
    request: PortalUserCreate,
    service: PortalService = Depends(get_service),
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """
    [MikroTik API] Register a new hotspot user.
    Resource: /ip/hotspot/user add ...
    """
    try:
        result = await service.create_user(request.model_dump())

        log_entry = ActionLog(
            action_type="portal_user_create",
            target_ip=None,
            details=json.dumps({"username": request.name, "profile": request.profile}),
            comment=f"Portal user created: {request.name}",
        )
        db.add(log_entry)
        await db.flush()

        logger.info("api_portal_user_created", name=request.name)
        return APIResponse.ok(result)
    except HotspotNotInitializedError:
        return _hotspot_not_initialized_response()
    except Exception as e:
        logger.error("api_portal_create_user_failed", name=request.name, error=str(e))
        return APIResponse.fail(f"Failed to create user {request.name}: {str(e)}")


@router.put("/users/{username}")
async def update_user(
    username: str,
    request: PortalUserUpdate,
    service: PortalService = Depends(get_service),
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """
    [MikroTik API] Update an existing hotspot user.
    Resource: /ip/hotspot/user set ...
    """
    try:
        # Filter out None values
        data = {k: v for k, v in request.model_dump().items() if v is not None}
        result = await service.update_user(username, data)

        log_entry = ActionLog(
            action_type="portal_user_update",
            target_ip=None,
            details=json.dumps({"username": username, "fields": list(data.keys())}),
            comment=f"Portal user updated: {username}",
        )
        db.add(log_entry)
        await db.flush()

        logger.info("api_portal_user_updated", username=username)
        return APIResponse.ok(result)
    except HotspotNotInitializedError:
        return _hotspot_not_initialized_response()
    except ValueError as e:
        return APIResponse.fail(str(e))
    except Exception as e:
        logger.error("api_portal_update_user_failed", username=username, error=str(e))
        return APIResponse.fail(f"Failed to update user {username}: {str(e)}")


@router.delete("/users/{username}")
async def delete_user(
    username: str,
    service: PortalService = Depends(get_service),
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """
    [MikroTik API] Delete a hotspot user permanently.
    Resource: /ip/hotspot/user remove ...
    ALWAYS requires ConfirmModal on the frontend before calling this endpoint.
    """
    try:
        result = await service.delete_user(username)

        log_entry = ActionLog(
            action_type="portal_user_delete",
            target_ip=None,
            details=json.dumps({"username": username}),
            comment=f"Portal user deleted: {username}",
        )
        db.add(log_entry)
        await db.flush()

        logger.info("api_portal_user_deleted", username=username)
        return APIResponse.ok(result)
    except HotspotNotInitializedError:
        return _hotspot_not_initialized_response()
    except ValueError as e:
        return APIResponse.fail(str(e))
    except Exception as e:
        logger.error("api_portal_delete_user_failed", username=username, error=str(e))
        return APIResponse.fail(f"Failed to delete user {username}: {str(e)}")


@router.post("/users/{username}/disconnect")
async def disconnect_user(
    username: str,
    service: PortalService = Depends(get_service),
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """
    [MikroTik API] Force-disconnect all active sessions for a user.
    Resource: /ip/hotspot/active remove ...
    ALWAYS requires ConfirmModal on the frontend before calling this endpoint.
    """
    try:
        result = await service.disconnect_user(username)

        log_entry = ActionLog(
            action_type="portal_user_disconnect",
            target_ip=None,
            details=json.dumps({"username": username, "sessions": result.get("sessions_disconnected", 0)}),
            comment=f"Portal user force-disconnected: {username}",
        )
        db.add(log_entry)
        await db.flush()

        logger.info("api_portal_user_disconnected", username=username)
        return APIResponse.ok(result)
    except HotspotNotInitializedError:
        return _hotspot_not_initialized_response()
    except Exception as e:
        logger.error("api_portal_disconnect_user_failed", username=username, error=str(e))
        return APIResponse.fail(f"Failed to disconnect user {username}: {str(e)}")


@router.post("/users/bulk")
async def bulk_create_users(
    request: PortalUserBulk,
    service: PortalService = Depends(get_service),
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """
    [MikroTik API] Create multiple hotspot users in a single request.
    Resource: /ip/hotspot/user add (repeated)
    Returns detailed per-user success/failure report.
    """
    try:
        users_data = [u.model_dump() for u in request.users]
        result = await service.bulk_create_users(users_data)

        log_entry = ActionLog(
            action_type="portal_user_bulk_create",
            target_ip=None,
            details=json.dumps({
                "total": result["total"],
                "success": result["success_count"],
                "failed": result["failed_count"],
            }),
            comment=f"Bulk portal user import: {result['success_count']}/{result['total']} created",
        )
        db.add(log_entry)
        await db.flush()

        logger.info("api_portal_bulk_create_completed", total=result["total"], success=result["success_count"])
        return APIResponse.ok(result)
    except HotspotNotInitializedError:
        return _hotspot_not_initialized_response()
    except Exception as e:
        logger.error("api_portal_bulk_create_failed", error=str(e))
        return APIResponse.fail(f"Bulk create failed: {str(e)}")


# ── Profiles ──────────────────────────────────────────────────────


@router.get("/profiles")
async def get_profiles(
    service: PortalService = Depends(get_service),
) -> APIResponse:
    """
    [MikroTik API] List all hotspot speed profiles.
    Resource: /ip/hotspot/user/profile
    """
    try:
        data = await service.get_profiles()
        return APIResponse.ok(data)
    except HotspotNotInitializedError:
        return _hotspot_not_initialized_response()
    except Exception as e:
        logger.error("api_portal_get_profiles_failed", error=str(e))
        return APIResponse.fail(f"Failed to fetch profiles: {str(e)}")


@router.post("/profiles")
async def create_profile(
    request: PortalProfileCreate,
    service: PortalService = Depends(get_service),
) -> APIResponse:
    """
    [MikroTik API] Create a new speed profile.
    Resource: /ip/hotspot/user/profile add ...
    """
    try:
        result = await service.create_profile(request.model_dump())
        logger.info("api_portal_profile_created", name=request.name)
        return APIResponse.ok(result)
    except HotspotNotInitializedError:
        return _hotspot_not_initialized_response()
    except Exception as e:
        logger.error("api_portal_create_profile_failed", name=request.name, error=str(e))
        return APIResponse.fail(f"Failed to create profile {request.name}: {str(e)}")


@router.put("/profiles/{name}")
async def update_profile(
    name: str,
    request: PortalProfileUpdate,
    service: PortalService = Depends(get_service),
) -> APIResponse:
    """
    [MikroTik API] Update an existing speed profile.
    Resource: /ip/hotspot/user/profile set ...
    """
    try:
        data = {k: v for k, v in request.model_dump().items() if v is not None}
        result = await service.update_profile(name, data)
        logger.info("api_portal_profile_updated", name=name)
        return APIResponse.ok(result)
    except HotspotNotInitializedError:
        return _hotspot_not_initialized_response()
    except ValueError as e:
        return APIResponse.fail(str(e))
    except Exception as e:
        logger.error("api_portal_update_profile_failed", name=name, error=str(e))
        return APIResponse.fail(f"Failed to update profile {name}: {str(e)}")


# ── Config ────────────────────────────────────────────────────────


@router.get("/config")
async def get_config(
    service: PortalService = Depends(get_service),
) -> APIResponse:
    """
    [MikroTik API] Get current Hotspot server and profile configuration.
    Resources: /ip/hotspot/server + /ip/hotspot/profile
    """
    try:
        data = await service.get_hotspot_config()
        return APIResponse.ok(data)
    except HotspotNotInitializedError:
        # Return partial info when not initialized (for the setup button logic)
        return APIResponse.ok({"hotspot_initialized": False})
    except Exception as e:
        logger.error("api_portal_get_config_failed", error=str(e))
        return APIResponse.fail(f"Failed to fetch config: {str(e)}")


@router.put("/config/unregistered-speed")
async def update_unregistered_speed(
    request: UnregisteredSpeedUpdate,
    service: PortalService = Depends(get_service),
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """
    [MikroTik API] Update speed limits for the 'unregistered' profile.
    Resource: /ip/hotspot/user/profile set unregistered rate-limit=...
    ALWAYS requires ConfirmModal on the frontend before calling this endpoint.
    """
    try:
        result = await service.update_unregistered_speed(
            request.rate_limit_up,
            request.rate_limit_down,
        )

        log_entry = ActionLog(
            action_type="portal_speed_update",
            target_ip=None,
            details=json.dumps({
                "profile": "unregistered",
                "rate_limit_up": request.rate_limit_up,
                "rate_limit_down": request.rate_limit_down,
            }),
            comment=f"Unregistered speed updated: {request.rate_limit_up}/{request.rate_limit_down}",
        )
        db.add(log_entry)
        await db.flush()

        logger.info("api_portal_unregistered_speed_updated", up=request.rate_limit_up, down=request.rate_limit_down)
        return APIResponse.ok(result)
    except HotspotNotInitializedError:
        return _hotspot_not_initialized_response()
    except Exception as e:
        logger.error("api_portal_update_unregistered_speed_failed", error=str(e))
        return APIResponse.fail(f"Failed to update unregistered speed: {str(e)}")


@router.put("/config/schedule")
async def update_schedule(
    request: ScheduleConfig,
    service: PortalService = Depends(get_service),
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """
    [MikroTik API] Configure Hotspot access schedule via firewall rules.
    Resource: /ip/firewall/filter (with time matching)
    scope='all' applies to all Hotspot traffic.
    scope='unregistered' applies only to unregistered users.
    ALWAYS requires ConfirmModal on the frontend before calling this endpoint.
    """
    try:
        result = await service.setup_schedule(
            enabled=request.enabled,
            hour_from=request.allowed_hours.hour_from,
            hour_to=request.allowed_hours.hour_to,
            blocked_days=request.blocked_days,
            scope=request.scope,
        )

        log_entry = ActionLog(
            action_type="portal_schedule_update",
            target_ip=None,
            details=json.dumps({
                "enabled": request.enabled,
                "hour_from": request.allowed_hours.hour_from,
                "hour_to": request.allowed_hours.hour_to,
                "blocked_days": request.blocked_days,
                "scope": request.scope,
            }),
            comment=f"Hotspot schedule {'enabled' if request.enabled else 'disabled'} (scope: {request.scope})",
        )
        db.add(log_entry)
        await db.flush()

        logger.info("api_portal_schedule_updated", enabled=request.enabled, scope=request.scope)
        return APIResponse.ok(result)
    except Exception as e:
        logger.error("api_portal_update_schedule_failed", error=str(e))
        return APIResponse.fail(f"Failed to update schedule: {str(e)}")


@router.get("/config/schedule")
async def get_schedule(
    service: PortalService = Depends(get_service),
) -> APIResponse:
    """
    [MikroTik API] Get current access schedule parsed from firewall rules.
    Resource: /ip/firewall/filter (filtered by comment 'netshield-hotspot-schedule')
    """
    try:
        data = await service.get_schedule()
        return APIResponse.ok(data)
    except Exception as e:
        logger.error("api_portal_get_schedule_failed", error=str(e))
        return APIResponse.fail(f"Failed to fetch schedule: {str(e)}")


# ── Status ────────────────────────────────────────────────────────


@router.get("/status")
async def get_portal_status(
    service: PortalService = Depends(get_service),
) -> APIResponse:
    """Check if Hotspot is initialized. Used by frontend to show/hide setup button."""
    try:
        data = await service.check_hotspot_status()
        return APIResponse.ok(data)
    except Exception as e:
        logger.error("api_portal_status_failed", error=str(e))
        return APIResponse.fail(f"Failed to check portal status: {str(e)}")
