"""
Wazuh schemas - Pydantic models for Wazuh SIEM API data.
"""

from __future__ import annotations

from pydantic import BaseModel


class WazuhAgent(BaseModel):
    """Wazuh agent information."""

    id: str = ""
    name: str = ""
    ip: str = ""
    status: str = ""  # active, disconnected, never_connected, pending
    os_name: str = ""
    os_version: str = ""
    manager: str = ""
    node_name: str = ""
    group: list[str] = []
    last_keep_alive: str = ""
    date_add: str = ""


class WazuhAlert(BaseModel):
    """Wazuh alert/event."""

    id: str = ""
    timestamp: str = ""
    agent_id: str = ""
    agent_name: str = ""
    agent_ip: str = ""
    rule_id: str = ""
    rule_level: int = 0
    rule_description: str = ""
    rule_groups: list[str] = []
    full_log: str = ""
    src_ip: str = ""
    dst_ip: str = ""
    location: str = ""


class ActiveResponseRequest(BaseModel):
    """Request to execute an active response on a Wazuh agent."""

    agent_id: str
    command: str  # e.g., "firewall-drop0", "restart-wazuh0"
    args: list[str] = []
    alert: dict | None = None  # Optional alert context
