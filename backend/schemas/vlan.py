"""
VLAN schemas - Pydantic models for VLAN management endpoints.
"""

from __future__ import annotations

from pydantic import BaseModel, Field


class VlanCreate(BaseModel):
    """Request to create a new VLAN on MikroTik."""

    vlan_id: int = Field(..., ge=1, le=4094, description="VLAN ID (1-4094)")
    name: str = Field(..., min_length=1, max_length=64, description="VLAN name")
    interface: str = Field(..., min_length=1, description="Parent interface name")
    comment: str = ""


class VlanUpdate(BaseModel):
    """Request to update an existing VLAN."""

    name: str | None = None
    comment: str | None = None


class VlanInfo(BaseModel):
    """VLAN interface info from RouterOS."""

    id: str = ""
    vlan_id: int = 0
    name: str = ""
    interface: str = ""
    running: bool = False
    disabled: bool = False
    mtu: int = 1500
    mac_address: str = ""
    comment: str = ""


class VlanTrafficData(BaseModel):
    """Real-time traffic data for a single VLAN."""

    vlan_id: int
    name: str = ""
    rx_bps: float = 0.0
    tx_bps: float = 0.0
    status: str = "ok"  # "ok" | "alert"
