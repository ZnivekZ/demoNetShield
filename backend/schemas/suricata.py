"""
Schemas Pydantic v2 para el módulo Suricata IDS/IPS/NSM.

Convenciones:
  - Todos los campos de request tienen validadores explícitos
  - Los schemas de response son tipos de datos, sin BaseModel (usados como dict hints)
  - Pydantic v2: model_config, field_validator, @model_validator

Para agregar un nuevo campo: definirlo aquí y actualizar el endpoint correspondiente
en routers/suricata.py y el tipo TypeScript en frontend/src/types.ts.
"""

from __future__ import annotations

import ipaddress
import re
from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator


# ── Request Schemas ────────────────────────────────────────────────────────────


class AutoResponseTriggerRequest(BaseModel):
    """Request para activar el circuito de auto-respuesta contra una IP."""

    ip: str = Field(..., description="IP atacante a bloquear")
    trigger_alert_id: str = Field(..., description="ID de la alerta Suricata que disparó el trigger")
    duration: str = Field(default="24h", description="Duración del bloqueo (ej: 24h, 7d)")
    reason: str = Field(default="", max_length=500, description="Razón opcional del bloqueo")

    @field_validator("ip")
    @classmethod
    def validate_ip(cls, v: str) -> str:
        """Validar que sea una IP válida (IPv4 o IPv6)."""
        try:
            ipaddress.ip_address(v.strip())
        except ValueError:
            raise ValueError(f"IP inválida: '{v}'")
        return v.strip()

    @field_validator("duration")
    @classmethod
    def validate_duration(cls, v: str) -> str:
        """Validar formato de duración: Nh o Nd (ej: 24h, 7d, 1h)."""
        if not re.match(r"^\d+[hd]$", v):
            raise ValueError("Duración debe ser en formato Nh o Nd (ej: 24h, 7d)")
        # Sanity check: máximo 90 días
        num = int(v[:-1])
        unit = v[-1]
        hours = num if unit == "h" else num * 24
        if hours > 90 * 24:
            raise ValueError("Duración máxima: 90 días")
        return v


class AutoResponseConfigUpdate(BaseModel):
    """Request para actualizar la configuración del circuito de auto-respuesta."""

    enabled: Optional[bool] = Field(default=None, description="Habilitar/deshabilitar el circuito")
    auto_trigger: Optional[bool] = Field(
        default=None,
        description="Si True: trigger automático sin confirmación humana (PELIGROSO)",
    )
    suricata_threshold: Optional[int] = Field(
        default=None,
        ge=1,
        le=100,
        description="Mínimo de alertas Suricata para sugerir/activar el circuito",
    )
    wazuh_level_required: Optional[int] = Field(
        default=None,
        ge=1,
        le=15,
        description="Nivel mínimo de alerta Wazuh correlacionada requerida",
    )
    crowdsec_ban: Optional[bool] = Field(
        default=None,
        description="Incluir ban CrowdSec en las acciones del circuito",
    )
    mikrotik_block: Optional[bool] = Field(
        default=None,
        description="Incluir bloqueo MikroTik en las acciones del circuito",
    )
    default_duration: Optional[str] = Field(
        default=None,
        description="Duración por defecto de los bloqueos",
    )

    @field_validator("default_duration")
    @classmethod
    def validate_duration(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and not re.match(r"^\d+[hd]$", v):
            raise ValueError("Duración debe ser en formato Nh o Nd (ej: 24h, 7d)")
        return v


class RuleToggleRequest(BaseModel):
    """Request para habilitar/deshabilitar una regla de Suricata."""

    enabled: bool = Field(..., description="True para habilitar, False para deshabilitar")


class AlertFilterParams(BaseModel):
    """Parámetros de filtrado para la lista de alertas."""

    limit: int = Field(default=50, ge=1, le=500)
    offset: int = Field(default=0, ge=0)
    src_ip: Optional[str] = Field(default=None)
    dst_ip: Optional[str] = Field(default=None)
    category: Optional[str] = Field(default=None)
    severity: Optional[int] = Field(default=None, ge=1, le=4)

    @field_validator("src_ip", "dst_ip")
    @classmethod
    def validate_ip_optional(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            try:
                ipaddress.ip_address(v.strip())
            except ValueError:
                raise ValueError(f"IP inválida: '{v}'")
            return v.strip()
        return v


class FlowFilterParams(BaseModel):
    """Parámetros de filtrado para flujos NSM."""

    limit: int = Field(default=50, ge=1, le=500)
    offset: int = Field(default=0, ge=0)
    src_ip: Optional[str] = Field(default=None)
    proto: Optional[Literal["TCP", "UDP", "ICMP"]] = Field(default=None)
    app_proto: Optional[str] = Field(default=None)
    has_alert: Optional[bool] = Field(default=None)

    @field_validator("src_ip")
    @classmethod
    def validate_src_ip(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            try:
                ipaddress.ip_address(v.strip())
            except ValueError:
                raise ValueError(f"IP inválida: '{v}'")
            return v.strip()
        return v


class RuleFilterParams(BaseModel):
    """Parámetros de filtrado para reglas/firmas."""

    limit: int = Field(default=100, ge=1, le=1000)
    offset: int = Field(default=0, ge=0)
    enabled: Optional[bool] = Field(default=None)
    ruleset: Optional[str] = Field(default=None, max_length=100)
    category: Optional[str] = Field(default=None, max_length=100)
