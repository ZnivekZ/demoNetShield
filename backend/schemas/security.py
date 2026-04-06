"""
Security schemas - Pydantic models for security/hybrid endpoints.
Covers: IP blocking, quarantine, geo-blocking, CLI, system health,
alert summaries, and MITRE ATT&CK data.
"""

from __future__ import annotations

from pydantic import BaseModel, Field


# ── Request Schemas ──────────────────────────────────────────────


class SecurityBlockIPRequest(BaseModel):
    """Request to block an IP via address-list (Blacklist_Automatica)."""

    ip: str
    reason: str = "Blocked via NetShield"
    duration_hours: int = 24
    source: str = "manual"  # manual | auto


class QuarantineRequest(BaseModel):
    """Request to quarantine an agent by moving its port to a VLAN."""

    agent_id: str
    vlan_quarantine_id: int = 99


class GeoBlockRequest(BaseModel):
    """
    Request to block IP ranges by country.
    NOTE: For lab, accepts manual IP ranges. In production,
    integrate a GeoIP database (e.g., ip2location-lite) here
    to auto-resolve country_code -> IP ranges.
    """

    country_code: str = Field(..., min_length=2, max_length=2)
    ip_ranges: list[str] = Field(
        default_factory=list,
        description="Manual IP ranges in CIDR notation (e.g., '203.0.113.0/24'). "
        "Required for lab mode. In production, resolved automatically from country_code.",
    )
    duration_hours: int = 24


class CLIMikrotikRequest(BaseModel):
    """Request to execute a read-only MikroTik command."""

    command: str = Field(
        ..., description="RouterOS path to query (e.g., '/ip/address')"
    )


class CLIWazuhAgentRequest(BaseModel):
    """Request to execute an action on a Wazuh agent."""

    agent_id: str
    action: str = Field(
        ..., description="Action to perform: 'restart' or 'status'"
    )


# ── Response Schemas ─────────────────────────────────────────────


class CriticalAlert(BaseModel):
    """A critical alert (level > 10) with MITRE context."""

    id: str = ""
    agent_name: str = ""
    agent_id: str = ""
    agent_ip: str = ""
    rule_description: str = ""
    rule_level: int = 0
    src_ip: str = ""
    timestamp: str = ""
    mitre_technique: str = ""  # Fallback: first rule_group if MITRE unavailable
    mitre_id: str = ""
    rule_groups: list[str] = []


class AlertTimelinePoint(BaseModel):
    """Alert count for a single minute in the timeline."""

    minute: str  # ISO timestamp truncated to minute
    count: int = 0


class TopAgent(BaseModel):
    """An agent ranked by alert count."""

    agent_id: str
    agent_name: str
    alert_count: int
    last_alert_timestamp: str = ""
    top_mitre_technique: str = ""


class AgentsSummary(BaseModel):
    """Count of agents by status."""

    active: int = 0
    disconnected: int = 0
    never_connected: int = 0
    pending: int = 0
    total: int = 0


class MitreSummaryItem(BaseModel):
    """A MITRE ATT&CK technique with detection statistics."""

    technique_id: str
    technique_name: str
    count: int
    last_seen: str = ""


class SystemHealthMikrotik(BaseModel):
    """MikroTik router system health metrics."""

    cpu_percent: float = 0.0
    ram_used_mb: float = 0.0
    ram_total_mb: float = 0.0
    ram_percent: float = 0.0
    uptime: str = ""
    temperature: str = ""
    board_name: str = ""
    version: str = ""


class WazuhHealthItem(BaseModel):
    """Wazuh service health status."""

    service_name: str
    status: str = "unknown"


class WazuhHealthResponse(BaseModel):
    """Full Wazuh health check."""

    services: list[WazuhHealthItem] = []
    version: str = ""
    cluster_enabled: bool = False


class NetworkSearchResult(BaseModel):
    """Unified search result combining MikroTik ARP + Wazuh agent data."""

    # MikroTik ARP match
    arp_match: dict | None = None  # {ip, mac, interface}
    # Wazuh agent match
    agent_match: dict | None = None  # Full agent dict
    # Recent alerts for this IP
    recent_alerts: list[dict] = []


class CLIResponse(BaseModel):
    """Response from a CLI command execution."""

    success: bool = True
    output: list[dict] | str = []
    command: str = ""
    error: str | None = None
