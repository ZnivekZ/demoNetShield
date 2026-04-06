"""
MikroTik schemas - Pydantic models for RouterOS API data.
"""

from __future__ import annotations

from pydantic import BaseModel, Field


class InterfaceInfo(BaseModel):
    """Network interface state from RouterOS."""

    name: str
    type: str = ""
    running: bool = False
    disabled: bool = False
    rx_byte: int = 0
    tx_byte: int = 0
    rx_packet: int = 0
    tx_packet: int = 0
    mtu: int = 1500
    mac_address: str = ""
    comment: str = ""


class ConnectionInfo(BaseModel):
    """Active connection from /ip/firewall/connection."""

    src_address: str = ""
    dst_address: str = ""
    protocol: str = ""
    connection_state: str = ""
    timeout: str = ""
    src_port: str = ""
    dst_port: str = ""
    orig_bytes: int = 0
    repl_bytes: int = 0


class ARPEntry(BaseModel):
    """ARP table entry."""

    ip_address: str = Field(alias="address", default="")
    mac_address: str = Field(alias="mac-address", default="")
    interface: str = ""
    dynamic: bool = True
    complete: bool = True

    model_config = {"populate_by_name": True}


class TrafficData(BaseModel):
    """Real-time traffic counters per interface."""

    interface: str
    rx_bytes_per_sec: float = 0.0
    tx_bytes_per_sec: float = 0.0
    rx_packets_per_sec: float = 0.0
    tx_packets_per_sec: float = 0.0
    timestamp: str = ""


class FirewallRule(BaseModel):
    """Firewall filter rule from RouterOS."""

    id: str = Field(alias=".id", default="")
    chain: str = ""
    action: str = ""
    src_address: str = Field(alias="src-address", default="")
    dst_address: str = Field(alias="dst-address", default="")
    protocol: str = ""
    disabled: bool = False
    comment: str = ""
    bytes: int = 0
    packets: int = 0

    model_config = {"populate_by_name": True}


class BlockIPRequest(BaseModel):
    """Request to block an IP address."""

    ip: str
    comment: str = "Blocked via NetShield Dashboard"
    duration: int | None = None  # optional duration in minutes (None = permanent)


class UnblockIPRequest(BaseModel):
    """Request to unblock an IP address."""

    ip: str


class LogEntry(BaseModel):
    """RouterOS system log entry."""

    id: str = ""
    time: str = ""
    topics: str = ""
    message: str = ""
