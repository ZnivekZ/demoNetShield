"""
Network schemas - IP labels and groups management.
"""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class IPLabelCreate(BaseModel):
    """Request to create/update an IP label."""

    ip_address: str
    label: str
    description: str | None = None
    color: str = "#6366f1"
    criteria: str | None = None  # JSON string with custom criteria


class IPLabelResponse(BaseModel):
    """IP label in API responses."""

    id: int
    ip_address: str
    label: str
    description: str | None = None
    color: str
    criteria: str | None = None
    created_by: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class IPGroupCreate(BaseModel):
    """Request to create an IP group."""

    name: str
    description: str | None = None
    color: str = "#8b5cf6"
    criteria: str | None = None  # JSON criteria for automatic membership


class IPGroupMemberAdd(BaseModel):
    """Add an IP to a group."""

    ip_address: str
    reason: str = "manual"


class IPGroupMemberResponse(BaseModel):
    """Group member in API responses."""

    id: int
    ip_address: str
    added_reason: str
    added_at: datetime

    model_config = {"from_attributes": True}


class IPGroupResponse(BaseModel):
    """IP group in API responses."""

    id: int
    name: str
    description: str | None = None
    color: str
    criteria: str | None = None
    created_by: str
    created_at: datetime
    updated_at: datetime
    members: list[IPGroupMemberResponse] = []

    model_config = {"from_attributes": True}
