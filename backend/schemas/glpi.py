"""
GLPI Schemas - Pydantic v2 models for GLPI Asset Management API.

Request / Response schemas for all GLPI endpoints.
Follows the same pattern as other schema files in this project.
"""

from __future__ import annotations

from typing import Optional
from pydantic import BaseModel, Field


# ── Asset Schemas ─────────────────────────────────────────────────

class GlpiAsset(BaseModel):
    """Normalized GLPI computer/asset representation."""
    id: int
    name: str
    serial: Optional[str] = ""
    ip: Optional[str] = ""
    mac: Optional[str] = ""
    os: Optional[str] = ""
    cpu: Optional[str] = ""
    ram: Optional[str] = ""
    location: Optional[str] = ""
    location_id: Optional[int] = None
    assigned_user: Optional[str] = ""
    status: str = "activo"  # activo | reparacion | retirado | pendiente | bajo_investigacion
    comment: Optional[str] = ""
    last_update: Optional[str] = ""


class GlpiAssetDetail(GlpiAsset):
    """Full technical detail of a GLPI asset including related tickets."""
    tickets: list["GlpiTicket"] = []


class GlpiAssetCreate(BaseModel):
    """Request body for creating a new asset in GLPI."""
    name: str = Field(..., min_length=1, max_length=255)
    serial: Optional[str] = None
    ip: Optional[str] = None
    mac: Optional[str] = None
    os: Optional[str] = None
    cpu: Optional[str] = None
    ram_gb: Optional[str] = None
    location_id: Optional[int] = None
    assigned_user_id: Optional[int] = None
    status: str = "activo"
    comment: Optional[str] = None


class GlpiAssetUpdate(BaseModel):
    """Request body for updating an asset in GLPI."""
    name: Optional[str] = None
    status: Optional[str] = None
    location_id: Optional[int] = None
    assigned_user_id: Optional[int] = None
    comment: Optional[str] = None


class GlpiAssetStats(BaseModel):
    """Asset count by status — ready for pie chart."""
    activo: int = 0
    reparacion: int = 0
    retirado: int = 0
    pendiente: int = 0
    total: int = 0


class GlpiAssetHealth(BaseModel):
    """Combined health status: GLPI + Wazuh + MikroTik ARP."""
    asset_id: int
    name: str
    ip: Optional[str] = ""
    location: Optional[str] = ""
    glpi_status: str  # activo | reparacion | retirado | bajo_investigacion
    wazuh_agent: str  # active | disconnected | not_installed
    network_visible: bool
    health: str       # ok | warning | critical
    health_reason: Optional[str] = ""


class GlpiNetworkContext(BaseModel):
    """Network context of an asset: interface, VLAN, IP, last seen."""
    asset_id: int
    asset_name: str
    interface: Optional[str] = ""
    vlan: Optional[str] = ""
    ip_assigned: Optional[str] = ""
    last_seen: Optional[str] = ""
    mac: Optional[str] = ""


# ── Location Schemas ──────────────────────────────────────────────

class GlpiLocation(BaseModel):
    """Physical location (classroom, lab, server room)."""
    id: int
    name: str
    completename: Optional[str] = ""
    comment: Optional[str] = ""
    building: Optional[str] = ""
    room: Optional[str] = ""


# ── Ticket Schemas ────────────────────────────────────────────────

class GlpiTicket(BaseModel):
    """Normalized GLPI ticket."""
    id: int
    title: str
    description: Optional[str] = ""
    priority: int = 3       # 1-5
    priority_label: str = "Media"
    status: str = "pendiente"  # pendiente | en_progreso | resuelto
    status_id: int = 1
    assigned_user: Optional[str] = ""
    asset_name: Optional[str] = ""
    asset_id: Optional[int] = None
    category: Optional[str] = ""
    created_at: Optional[str] = ""
    due_date: Optional[str] = ""
    is_netshield: bool = False  # True if created by NetShield automatically


class GlpiTicketCreate(BaseModel):
    """Request body for creating a ticket."""
    title: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = ""
    priority: int = Field(default=3, ge=1, le=5)
    asset_id: Optional[int] = None
    category: Optional[str] = None  # red | hardware | so | seguridad


class GlpiTicketStatusUpdate(BaseModel):
    """Request body for updating ticket status."""
    status: int = Field(..., ge=1, le=6)
    # 1=Nuevo, 2=En proceso (asignado), 3=En proceso (planificado),
    # 4=Pendiente, 5=Resuelto, 6=Cerrado


# ── User Schemas ──────────────────────────────────────────────────

class GlpiUser(BaseModel):
    """GLPI user with their assigned assets."""
    id: int
    name: str
    realname: Optional[str] = ""
    firstname: Optional[str] = ""
    display_name: str
    email: Optional[str] = ""
    department: Optional[str] = ""
    assets_assigned: list[GlpiAsset] = []


# ── Quarantine Schemas ────────────────────────────────────────────

class GlpiQuarantineRequest(BaseModel):
    """Request body for quarantining an asset in GLPI."""
    reason: str = Field(..., min_length=1, max_length=500)
    wazuh_alert_id: Optional[str] = None
    mikrotik_block_id: Optional[str] = None


class GlpiUnquarantineRequest(BaseModel):
    """Request body for lifting quarantine."""
    reason: Optional[str] = "Cuarentena levantada manualmente"


# ── Network Maintenance Ticket ────────────────────────────────────

class NetworkMaintenanceRequest(BaseModel):
    """Request body for creating a network maintenance ticket."""
    interface_name: str = Field(..., min_length=1)
    error_count: int = Field(..., ge=0)
    error_type: str  # rx_error | tx_error | saturation
    asset_id: Optional[int] = None  # Affected equipment if identified


# ── Response wrappers ─────────────────────────────────────────────

class GlpiAvailability(BaseModel):
    """GLPI service availability status."""
    available: bool
    message: str
    url: str
