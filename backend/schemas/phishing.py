"""
Phishing schemas - Pydantic models for phishing detection and sinkhole management.
All phishing data is sourced from Wazuh alerts with web_attack/phishing rule groups.
Sinkhole management is via MikroTik DNS static entries.
"""

from __future__ import annotations

from pydantic import BaseModel, Field


# ── Response Schemas ─────────────────────────────────────────────


class PhishingAlert(BaseModel):
    """A phishing-related alert from Wazuh."""

    id: str = ""
    agent_name: str = ""
    agent_id: str = ""
    src_ip: str = ""
    dst_url: str = ""
    rule_description: str = ""
    timestamp: str = ""
    rule_level: int = 0
    user: str = ""
    rule_groups: list[str] = []


class SuspiciousDomain(BaseModel):
    """A domain detected in phishing-related alerts."""

    domain: str
    hit_count: int = 0
    agents_affected: int = 0
    first_seen: str = ""
    last_seen: str = ""
    in_sinkhole: bool = False


class PhishingVictim(BaseModel):
    """An agent/user that accessed a malicious URL."""

    agent_name: str
    agent_id: str = ""
    ip: str = ""
    url: str = ""
    timestamp: str = ""
    times: int = 1


class PhishingStats(BaseModel):
    """Summary statistics for phishing activity."""

    total_alerts_today: int = 0
    unique_suspicious_domains: int = 0
    affected_agents: int = 0
    top_url: str = ""
    peak_hour: str = ""


class SinkholeEntryResponse(BaseModel):
    """A domain currently in DNS sinkhole."""

    domain: str
    address: str = "127.0.0.1"
    added_by: str = ""
    reason: str = ""
    created_at: str = ""


# ── Request Schemas ──────────────────────────────────────────────


class SinkholeRequest(BaseModel):
    """Request to add a domain to DNS sinkhole."""

    domain: str = Field(..., min_length=3, description="Domain to sinkhole (e.g., evil.com)")
    reason: str = "Phishing detected via NetShield"


class PhishingBlockIPRequest(BaseModel):
    """Request to block a phishing source IP."""

    ip: str
    duration_hours: int = 24


class PhishingSimulateRequest(BaseModel):
    """Request to simulate a phishing alert (lab only)."""

    target_agent_id: str = ""
    malicious_url: str = "http://evil-phishing-lab.example.com/login"
    description: str = "Simulated phishing alert for testing"
