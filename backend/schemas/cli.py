"""
CLI schemas - Pydantic models for remote command execution endpoints.
Covers: MikroTik read-only commands and Wazuh agent actions.
"""

from __future__ import annotations

from pydantic import BaseModel, Field


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


class CLIResponse(BaseModel):
    """Response from a CLI command execution."""

    success: bool = True
    output: list[dict] | str = []
    command: str = ""
    error: str | None = None
