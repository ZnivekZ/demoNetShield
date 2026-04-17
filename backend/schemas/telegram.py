"""
Telegram Schemas — Pydantic v2 models for Telegram integration.

Covers:
- TelegramAlert: alerta a enviar al canal
- TelegramReportConfigCreate / TelegramReportConfigResponse: CRUD de configs
- TelegramBotQuery: consulta inbound del bot
- TelegramMessageLogResponse: historial de mensajes
- TelegramStatusResponse: estado del bot
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


# ── Alert (outbound) ─────────────────────────────────────────────────────

class TelegramAlert(BaseModel):
    """Alerta a enviar por Telegram."""
    title: str = Field(..., min_length=1, max_length=200)
    severity: str = Field(default="medium", pattern=r"^(critical|high|medium|low)$")
    source: str = Field(default="manual", pattern=r"^(wazuh|mikrotik|crowdsec|suricata|manual)$")
    description: str = Field(default="", max_length=2000)
    ip: Optional[str] = None
    agent: Optional[str] = None
    action_taken: Optional[str] = None


# ── Report Config (CRUD) ────────────────────────────────────────────────

class TelegramReportConfigCreate(BaseModel):
    """Crear o actualizar configuración de reporte automático."""
    name: str = Field(..., min_length=1, max_length=100)
    enabled: bool = True
    trigger: str = Field(
        default="scheduled",
        pattern=r"^(scheduled|on_alert|on_threshold)$",
    )
    schedule: Optional[str] = None  # Cron expression (only for trigger=scheduled)
    sources: list[str] = Field(default_factory=lambda: ["wazuh", "mikrotik"])
    min_severity: int = Field(default=5, ge=1, le=15)
    audience: str = Field(default="technical", pattern=r"^(executive|technical|compliance)$")
    include_summary: bool = True
    include_charts: bool = False
    chat_id: Optional[str] = None  # Override del chat_id global


class TelegramReportConfigUpdate(BaseModel):
    """Actualización parcial de config."""
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    enabled: Optional[bool] = None
    trigger: Optional[str] = Field(None, pattern=r"^(scheduled|on_alert|on_threshold)$")
    schedule: Optional[str] = None
    sources: Optional[list[str]] = None
    min_severity: Optional[int] = Field(None, ge=1, le=15)
    audience: Optional[str] = Field(None, pattern=r"^(executive|technical|compliance)$")
    include_summary: Optional[bool] = None
    include_charts: Optional[bool] = None
    chat_id: Optional[str] = None


class TelegramReportConfigResponse(BaseModel):
    """Respuesta de config de reporte."""
    id: int
    name: str
    enabled: bool
    trigger: str
    schedule: Optional[str] = None
    sources: list[str]
    min_severity: int
    audience: str
    include_summary: bool
    include_charts: bool
    chat_id: Optional[str] = None
    last_triggered: Optional[str] = None
    created_at: str
    updated_at: str


# ── Bot Query (inbound) ─────────────────────────────────────────────────

class TelegramBotQuery(BaseModel):
    """Consulta recibida via webhook del bot."""
    query: str
    chat_id: str
    user_id: Optional[str] = None
    username: Optional[str] = None


# ── Message Log ──────────────────────────────────────────────────────────

class TelegramMessageLogResponse(BaseModel):
    """Registro de mensaje enviado o recibido."""
    id: int
    direction: str  # "outbound" | "inbound"
    chat_id: str
    message_type: str  # "alert" | "summary" | "report" | "test" | "bot_query" | "bot_response"
    content_summary: str
    status: str  # "sent" | "failed" | "pending"
    error: Optional[str] = None
    created_at: str


# ── Status ───────────────────────────────────────────────────────────────

class TelegramStatusResponse(BaseModel):
    """Estado del bot de Telegram."""
    connected: bool
    bot_username: Optional[str] = None
    chat_id: Optional[str] = None
    pending_messages: int = 0
    last_message_at: Optional[str] = None
    mock: bool = True


# ── Send Summary Request ────────────────────────────────────────────────

class TelegramSendSummaryRequest(BaseModel):
    """Request para enviar resumen."""
    sources: list[str] = Field(default_factory=lambda: ["wazuh", "mikrotik", "crowdsec", "suricata"])
    chat_id: Optional[str] = None  # Override del chat_id global
