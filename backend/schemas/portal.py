"""
Portal Cautivo Schemas — Pydantic v2 models for Hotspot Portal API.

Covers:
- Active session data (from /ip/hotspot/active)
- Session history (from /ip/hotspot/host)
- Real-time and summary statistics
- User CRUD (from /ip/hotspot/user)
- Speed profiles (from /ip/hotspot/user/profile)
- Hotspot configuration
- Schedule configuration (with configurable scope)
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


# ── Session Schemas ───────────────────────────────────────────────


class PortalSession(BaseModel):
    """Active hotspot session from /ip/hotspot/active."""

    user: str = ""
    ip: str = ""
    mac: str = ""
    uptime: str = ""
    bytes_in: int = 0
    bytes_out: int = 0
    rate_limit: str = ""
    status: Literal["registered", "unregistered"] = "unregistered"
    login_time: str = ""


class PortalSessionHistory(BaseModel):
    """Past hotspot session from /ip/hotspot/host."""

    user: str = ""
    mac: str = ""
    ip: str = ""
    login_time: str = ""
    logout_time: str = ""
    duration: str = ""
    bytes_in: int = 0
    bytes_out: int = 0


class SessionHistoryParams(BaseModel):
    """Query params for session history endpoint."""

    from_date: str | None = None
    to_date: str | None = None
    user: str | None = None
    limit: int = Field(default=100, ge=1, le=1000)


# ── Statistics Schemas ────────────────────────────────────────────


class PortalRealtimeStats(BaseModel):
    """Real-time Hotspot metrics aggregated from active sessions."""

    total_sessions_active: int = 0
    registered_users_online: int = 0
    unregistered_users_online: int = 0
    total_bandwidth_in: int = 0   # bytes/sec total across all sessions
    total_bandwidth_out: int = 0  # bytes/sec total across all sessions
    peak_hour_today: str = ""     # e.g. "14:00" — hour with most simultaneous sessions


class TopUserByData(BaseModel):
    """User ranked by total data consumed."""

    user: str
    bytes_total: int
    sessions: int


class TopUserByTime(BaseModel):
    """User ranked by total connected time."""

    user: str
    total_uptime_seconds: int
    sessions: int


class NewRegistrationPoint(BaseModel):
    """New user registrations per day."""

    date: str   # YYYY-MM-DD
    count: int


class PeakByDayPoint(BaseModel):
    """Peak concurrent sessions per day of week + hour — for heatmap."""

    day: str    # "monday", "tuesday", ...
    hour: int   # 0-23
    count: int


class PortalSummaryStats(BaseModel):
    """Aggregated historical statistics."""

    unique_users_today: int = 0
    unique_users_week: int = 0
    unique_users_month: int = 0
    avg_session_duration_seconds: int = 0
    top_by_data: list[TopUserByData] = []
    top_by_time: list[TopUserByTime] = []
    new_registrations_30d: list[NewRegistrationPoint] = []
    peak_by_day: list[PeakByDayPoint] = []  # heatmap data


# ── User Schemas ──────────────────────────────────────────────────


class PortalUser(BaseModel):
    """Hotspot user from /ip/hotspot/user."""

    name: str
    profile: str = "registered"
    mac_address: str = ""
    limit_uptime: str = ""
    limit_bytes_total: str = ""
    disabled: bool = False
    comment: str = ""
    last_seen: str = ""
    total_sessions: int = 0
    created_at: str | None = None   # from local PortalUserRegistry
    created_by: str | None = None   # from local PortalUserRegistry


class PortalUserCreate(BaseModel):
    """Request body to create a new hotspot user."""

    name: str = Field(..., min_length=1, max_length=64)
    password: str = Field(..., min_length=1, max_length=64)
    profile: str = Field(default="registered", max_length=64)
    mac_address: str = Field(default="", description="If set, user can only connect from this MAC")
    limit_uptime: str = Field(default="", description="e.g. '8h' — resets daily")
    limit_bytes_total: str = Field(default="", description="e.g. '5G' — total lifetime limit")
    comment: str = Field(default="", description="Real name or observation")


class PortalUserUpdate(BaseModel):
    """Request body to update an existing hotspot user."""

    profile: str | None = None
    password: str | None = None
    mac_address: str | None = None
    limit_uptime: str | None = None
    limit_bytes_total: str | None = None
    disabled: bool | None = None
    comment: str | None = None


class PortalUserBulk(BaseModel):
    """Request body for bulk user creation."""

    users: list[PortalUserCreate] = Field(..., min_length=1)


class BulkCreateResult(BaseModel):
    """Result of a bulk user creation operation."""

    total: int
    success_count: int
    failed_count: int
    errors: list[dict] = []  # [{"username": "...", "error": "..."}]


# ── Profile Schemas ───────────────────────────────────────────────


class PortalProfile(BaseModel):
    """Speed profile from /ip/hotspot/user/profile."""

    name: str
    rate_limit: str = ""
    rate_limit_up: str = ""
    rate_limit_down: str = ""
    session_timeout: str = ""
    idle_timeout: str = ""
    is_unregistered: bool = False  # True if this is the special "unregistered" profile


class PortalProfileCreate(BaseModel):
    """Request body to create a speed profile."""

    name: str = Field(..., min_length=1, max_length=64)
    rate_limit_up: str = Field(..., description="e.g. '10M' for 10 Mbps upload")
    rate_limit_down: str = Field(..., description="e.g. '10M' for 10 Mbps download")
    session_timeout: str = Field(default="", description="e.g. '8h' — max session time")
    idle_timeout: str = Field(default="30m", description="e.g. '30m' — disconnect if idle")


class PortalProfileUpdate(BaseModel):
    """Request body to update an existing speed profile."""

    rate_limit_up: str | None = None
    rate_limit_down: str | None = None
    session_timeout: str | None = None
    idle_timeout: str | None = None


class UnregisteredSpeedUpdate(BaseModel):
    """Request to update the 'unregistered' profile speed limits."""

    rate_limit_up: str = Field(..., description="e.g. '512k'")
    rate_limit_down: str = Field(..., description="e.g. '512k'")


# ── Config Schemas ────────────────────────────────────────────────


class PortalConfig(BaseModel):
    """Current Hotspot server configuration."""

    server_name: str = ""
    interface: str = ""
    address_pool: str = ""
    profile: str = ""
    login_by: str = ""
    idle_timeout: str = ""
    addresses_per_mac: int = 2
    hotspot_initialized: bool = False


class AllowedHours(BaseModel):
    """Time window for hotspot access."""

    hour_from: str = Field(..., description="e.g. '07:00'")
    hour_to: str = Field(..., description="e.g. '22:00'")


class ScheduleConfig(BaseModel):
    """
    Request to configure hotspot access schedule via firewall rules.
    [MikroTik API] /ip/firewall/filter with 'time' matching.
    
    scope controls whether restrictions apply to:
    - 'all': all hotspot users (block all hotspot traffic outside hours)
    - 'unregistered': only users in the 'unregistered' profile
    """

    enabled: bool
    allowed_hours: AllowedHours
    blocked_days: list[str] = Field(
        default=[],
        description="Days when access is fully blocked: 'monday','tuesday',...'sunday'"
    )
    scope: Literal["all", "unregistered"] = Field(
        default="all",
        description="'all' = applies to all hotspot traffic; 'unregistered' = only for unregistered users"
    )


class ScheduleStatus(BaseModel):
    """Current schedule configuration read from firewall rules."""

    enabled: bool = False
    rule_count: int = 0
    allowed_hours: AllowedHours | None = None
    blocked_days: list[str] = []
    scope: Literal["all", "unregistered"] = "all"


# ── Setup Schema ──────────────────────────────────────────────────


class HotspotSetupResult(BaseModel):
    """Result of the hotspot initialization script."""

    success: bool
    steps_completed: list[str] = []
    steps_failed: list[str] = []
    message: str = ""
    already_existed: bool = False
