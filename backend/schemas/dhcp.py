"""
DHCP schemas — Pydantic v2 models for MikroTik RouterOS DHCP resources.

Resources covered:
  /ip/dhcp-server         → DhcpServer
  /ip/dhcp-server/lease   → DhcpLease
  /ip/dhcp-server/network → DhcpNetwork
  /ip/dhcp-server/alert   → DhcpRogueAlert
  /ip/dhcp-server/option  → DhcpOption
  /ip/pool                → DhcpPool
  (calculated)            → DhcpSubnetUsage
"""

from __future__ import annotations

from typing import Optional
from pydantic import BaseModel, Field


# ── Read models (GET responses) ────────────────────────────────────────────────

class DhcpServer(BaseModel):
    """DHCP server instance from /ip/dhcp-server."""
    id: str = Field(default="", alias=".id")
    name: str = ""
    interface: str = ""
    address_pool: str = ""
    lease_time: str = "1d"
    disabled: bool = False
    authoritative: str = "after-2sec"  # yes | no | after-2sec
    comment: str = ""

    model_config = {"populate_by_name": True}


class DhcpLease(BaseModel):
    """DHCP lease (dynamic or static) from /ip/dhcp-server/lease."""
    id: str = Field(default="", alias=".id")
    address: str = ""
    mac_address: str = ""
    client_id: str = ""
    host_name: str = ""
    server: str = ""
    status: str = ""           # bound | offered | waiting
    expires_after: str = ""    # remaining lease time, e.g. "22h30m"
    active_address: str = ""
    active_mac_address: str = ""
    rate_limit: str = ""       # e.g. "1M/2M" (upload/download)
    comment: str = ""
    dynamic: bool = True
    blocked: bool = False      # block-access flag
    disabled: bool = False

    model_config = {"populate_by_name": True}


class DhcpNetwork(BaseModel):
    """DHCP network configuration from /ip/dhcp-server/network."""
    id: str = Field(default="", alias=".id")
    address: str = ""          # network/prefix, e.g. "192.168.88.0/24"
    gateway: str = ""
    dns_server: str = ""       # comma-separated list
    domain: str = ""
    wins_server: str = ""
    ntp_server: str = ""
    comment: str = ""

    model_config = {"populate_by_name": True}


class DhcpPool(BaseModel):
    """IP address pool from /ip/pool."""
    id: str = Field(default="", alias=".id")
    name: str = ""
    ranges: str = ""           # e.g. "192.168.88.10-192.168.88.254"
    next_pool: str = ""        # chained pool name

    model_config = {"populate_by_name": True}


class DhcpSubnetUsage(BaseModel):
    """Calculated subnet utilization (pool range vs active leases)."""
    pool_name: str
    ranges: str
    total_ips: int
    used_ips: int
    free_ips: int
    usage_percent: float
    server_name: str = ""


class DhcpRogueAlert(BaseModel):
    """Rogue DHCP server alert config from /ip/dhcp-server/alert."""
    id: str = Field(default="", alias=".id")
    interface: str = ""
    valid_server: str = ""     # comma-separated MAC addresses
    alert_timeout: str = ""    # e.g. "1h" or "none"
    on_alert: str = ""         # script to run on detection
    disabled: bool = False
    unknown_server_detected: bool = False

    model_config = {"populate_by_name": True}


class DhcpOption(BaseModel):
    """Custom DHCP option from /ip/dhcp-server/option."""
    id: str = Field(default="", alias=".id")
    name: str = ""
    code: int = 0
    value: str = ""            # hex or text value
    raw: bool = False

    model_config = {"populate_by_name": True}


# ── Request models (POST/PUT payloads) ─────────────────────────────────────────

class DhcpServerCreate(BaseModel):
    """Create a new DHCP server instance."""
    name: str
    interface: str
    address_pool: str
    lease_time: str = "1d"
    authoritative: str = "after-2sec"
    comment: str = ""


class DhcpServerToggle(BaseModel):
    """Enable or disable a DHCP server."""
    disabled: bool


class DhcpLeaseCreate(BaseModel):
    """Create a static DHCP lease (reservation)."""
    address: str = Field(..., description="IP to reserve, e.g. 192.168.88.100")
    mac_address: str = Field(..., description="Client MAC address")
    server: str = Field(..., description="DHCP server name")
    comment: str = ""
    rate_limit: str = ""


class DhcpLeaseUpdate(BaseModel):
    """Update lease properties (comment, block-access, rate-limit)."""
    comment: Optional[str] = None
    rate_limit: Optional[str] = None
    disabled: Optional[bool] = None


class DhcpLeaseBlockRequest(BaseModel):
    """Block or unblock a client's DHCP access."""
    block: bool = Field(..., description="True to block access, False to unblock")


class DhcpNetworkCreate(BaseModel):
    """Create DHCP network configuration."""
    address: str = Field(..., description="Network/prefix, e.g. 192.168.88.0/24")
    gateway: str = ""
    dns_server: str = ""
    domain: str = ""
    ntp_server: str = ""
    comment: str = ""


class DhcpNetworkUpdate(BaseModel):
    """Update DHCP network configuration fields."""
    gateway: Optional[str] = None
    dns_server: Optional[str] = None
    domain: Optional[str] = None
    ntp_server: Optional[str] = None
    comment: Optional[str] = None


class DhcpPoolCreate(BaseModel):
    """Create a new IP address pool."""
    name: str
    ranges: str = Field(..., description="Range, e.g. 192.168.88.10-192.168.88.254")
    next_pool: str = ""


class DhcpPoolUpdate(BaseModel):
    """Update an IP address pool."""
    ranges: Optional[str] = None
    next_pool: Optional[str] = None


class DhcpRogueAlertCreate(BaseModel):
    """Create a rogue DHCP server alert configuration."""
    interface: str
    valid_server: str = Field("", description="Trusted server MAC(s), comma-separated")
    alert_timeout: str = "1h"
    on_alert: str = ""


class DhcpOptionCreate(BaseModel):
    """Create a custom DHCP option."""
    name: str
    code: int = Field(..., ge=1, le=254)
    value: str
    raw: bool = False
