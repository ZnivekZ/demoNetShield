"""
Pydantic schemas for the Daily Security Digest & Delta feature.
"""

from __future__ import annotations

from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


# ── Enums ─────────────────────────────────────────────────────────────────────

class DigestRiskLevel(str, Enum):
    GREEN  = "green"
    YELLOW = "yellow"
    ORANGE = "orange"
    RED    = "red"


class AgentCategory(str, Enum):
    PROXY    = "proxy"     # Reverse proxies (nginx, haproxy, caddy)
    MAIL     = "mail"      # Mail servers (postfix, dovecot, exim)
    NOTEBOOK = "notebook"  # Laptops / workstations
    SERVER   = "server"    # Other servers (DB, infra, backup, etc.)


# ── Sub-schemas ───────────────────────────────────────────────────────────────

class TransientIncident(BaseModel):
    agent_id:          str
    agent_name:        str
    event_type:        str             # "disconnect_reconnect" | "disconnect_no_recovery"
    disconnected_at:   str             # ISO 8601
    reconnected_at:    str | None      # None if not recovered in period
    duration_seconds:  int | None

class AgentScanStatus(BaseModel):
    agent_id:       str
    agent_name:     str
    last_syscheck:  str | None         # ISO 8601 or None
    last_rootcheck: str | None
    syscheck_hours_ago:  float | None
    rootcheck_hours_ago: float | None
    is_stale:       bool               # True if any scan >48h ago

class DigestDelta(BaseModel):
    """Deterministic metrics calculated from two 24h windows."""
    period_start:         str          # ISO 8601 — start of TODAY's window
    period_end:           str          # ISO 8601 — end of TODAY's window
    yesterday_start:      str          # ISO 8601 — start of YESTERDAY's window
    yesterday_end:        str          # ISO 8601 — end of YESTERDAY's window

    # Alerts
    alerts_today:         int
    alerts_yesterday:     int
    alerts_delta:         int          # today - yesterday (signed)
    alerts_delta_percent: float        # % change (0.0 if yesterday=0)

    critical_today:       int
    critical_yesterday:   int
    critical_delta:       int

    # Vulnerabilities
    new_cves_today:       list[dict[str, Any]]   # CVEs detected today not seen yesterday
    resolved_cves:        list[dict[str, Any]]   # CVEs no longer present
    total_cves_today:     int
    total_cves_yesterday: int

    # Agents
    agents_active:        int
    agents_disconnected:  int
    transient_incidents:  list[TransientIncident]

    # MITRE
    new_techniques_today: list[str]    # technique IDs new compared to yesterday
    top_tactic:           str | None

    # Scan freshness
    agents_scan_status:   list[AgentScanStatus]

class DigestAgent(BaseModel):
    """Per-agent summary for one 24h period."""
    agent_id:        str
    agent_name:      str
    status:          str               # active | disconnected | etc.
    category:        AgentCategory
    category_source: str               # "pattern" | "manual_override"

    alerts_today:    int
    alerts_yesterday: int
    alerts_delta:    int

    new_cves:        int
    new_packages:    int               # packages installed/upgraded today
    port_changes:    list[dict[str, Any]]  # [{port, protocol, state, change_type}]
    last_syscheck:   str | None
    last_rootcheck:  str | None
    last_keep_alive: str | None = None

class CisaKevEvidence(BaseModel):
    agent_id:       str
    agent_name:     str
    package_name:   str
    package_version: str
    detected_at:    str | None

class CisaKevMatch(BaseModel):
    """A KEV entry with Wazuh evidence, or an unverified name candidate."""
    cve_id:             str
    vendor:             str
    product:            str
    vulnerability_name: str
    date_added:         str            # CISA catalog date
    due_date:           str | None     # Remediation due date from CISA
    matched_agents:     list[str]      # Agent names where match was found
    matched_packages:   list[str]      # Package names that matched
    evidence:           list[CisaKevEvidence] = Field(default_factory=list)

class DigestHistoryItem(BaseModel):
    """Lightweight summary for the history list."""
    id:           int
    date:         str
    risk_level:   DigestRiskLevel
    risk_score:   int
    alerts_today: int
    critical_today: int
    new_cves:     int
    cisa_matches: int
    ai_is_mock:   bool
    generated_at: str
    generation_method: str

class DigestResponse(BaseModel):
    """Full Daily Security Digest response."""
    id:               int
    date:             str              # "YYYY-MM-DD"
    risk_level:       DigestRiskLevel
    risk_score:       int              # 0–100
    risk_reasoning:   str              # Human-readable explanation

    delta:            DigestDelta
    agents_by_category: dict[str, list[DigestAgent]]  # key = AgentCategory value

    cisa_kev_matches:      list[CisaKevMatch]
    cisa_kev_possible_matches: list[CisaKevMatch] = Field(default_factory=list)
    cisa_kev_status:       str = "needs_regeneration"
    cisa_kev_total_checked: int
    cisa_kev_last_updated: str | None

    ai_summary:       str | None       # Groq analysis (or mock)
    ai_model_used:    str | None       # e.g. "llama-3.3-70b-versatile" or "mock"
    ai_is_mock:       bool
    ai_payload_sent:  dict | None      # Condensed payload that was/would be sent to Groq
    ai_generated_at:  str | None

    detector_healthy:   bool
    detector_last_scan: str | None

    generated_at:      str             # ISO 8601
    generation_method: str             # "manual" | "scheduled"


# ── Request schemas ───────────────────────────────────────────────────────────

class AgentCategoryOverrideRequest(BaseModel):
    category: AgentCategory = Field(..., description="New category to assign to the agent")


class DigestGenerateRequest(BaseModel):
    force: bool = Field(False, description="If True, regenerates even if today's digest exists")
