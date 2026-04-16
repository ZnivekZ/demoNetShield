"""
CrowdSec Pydantic v2 schemas — input validation and response typing.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, field_validator


# ── Request schemas ────────────────────────────────────────────────────────────

class ManualDecisionRequest(BaseModel):
    """POST /api/crowdsec/decisions/manual"""
    ip: str = Field(..., description="IPv4 or IPv6 address to ban/captcha")
    duration: str = Field("24h", description="Duration string: 4h, 24h, 7d, etc.")
    reason: str = Field(..., min_length=3, max_length=200)
    type: Literal["ban", "captcha"] = "ban"

    @field_validator("ip")
    @classmethod
    def validate_ip(cls, v: str) -> str:
        import ipaddress
        try:
            ipaddress.ip_address(v)
        except ValueError:
            raise ValueError(f"'{v}' is not a valid IP address")
        return v

    @field_validator("duration")
    @classmethod
    def validate_duration(cls, v: str) -> str:
        import re
        if not re.match(r"^\d+[mhd]$", v):
            raise ValueError("Duration must be like: 30m, 24h, 7d")
        return v


class WhitelistRequest(BaseModel):
    """POST /api/crowdsec/whitelist"""
    ip: str = Field(..., description="IP or CIDR to whitelist")
    reason: str = Field(..., min_length=3, max_length=200)

    @field_validator("ip")
    @classmethod
    def validate_ip_or_cidr(cls, v: str) -> str:
        import ipaddress
        try:
            ipaddress.ip_address(v)
        except ValueError:
            try:
                ipaddress.ip_network(v, strict=False)
            except ValueError:
                raise ValueError(f"'{v}' is not a valid IP or CIDR")
        return v


class FullRemediationRequest(BaseModel):
    """POST /api/crowdsec/remediation/full — block in CrowdSec + MikroTik simultaneously."""
    ip: str
    duration: str = "24h"
    reason: str
    trigger: str = "manual"

    @field_validator("ip")
    @classmethod
    def validate_ip(cls, v: str) -> str:
        import ipaddress
        try:
            ipaddress.ip_address(v)
        except ValueError:
            raise ValueError(f"'{v}' is not a valid IP address")
        return v


class SyncApplyRequest(BaseModel):
    """POST /api/crowdsec/sync/apply — apply synchronization between CrowdSec and MikroTik."""
    add_to_mikrotik: list[str] = Field(default_factory=list)
    remove_from_mikrotik: list[str] = Field(default_factory=list)
