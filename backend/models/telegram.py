"""
Telegram Models — SQLAlchemy async models for Telegram integration.

Tables:
- telegram_report_configs: configuraciones de reportes automáticos
- telegram_message_logs: historial de mensajes enviados y recibidos
- telegram_pending_messages: cola de mensajes pendientes (persiste reinicios)
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from database import Base


class TelegramReportConfig(Base):
    """Configuración de reporte automático por Telegram."""

    __tablename__ = "telegram_report_configs"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    trigger: Mapped[str] = mapped_column(
        String(20), nullable=False, default="scheduled"
    )  # scheduled | on_alert | on_threshold
    schedule: Mapped[str | None] = mapped_column(
        String(50), nullable=True
    )  # Cron expression
    sources: Mapped[str] = mapped_column(
        Text, nullable=False, default="wazuh,mikrotik"
    )  # Comma-separated
    min_severity: Mapped[int] = mapped_column(Integer, default=5, nullable=False)
    audience: Mapped[str] = mapped_column(
        String(20), default="technical", nullable=False
    )  # executive | technical | compliance
    include_summary: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    include_charts: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    chat_id: Mapped[str | None] = mapped_column(String(50), nullable=True)
    last_triggered: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now(), nullable=False
    )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "enabled": self.enabled,
            "trigger": self.trigger,
            "schedule": self.schedule,
            "sources": self.sources.split(",") if self.sources else [],
            "min_severity": self.min_severity,
            "audience": self.audience,
            "include_summary": self.include_summary,
            "include_charts": self.include_charts,
            "chat_id": self.chat_id,
            "last_triggered": self.last_triggered.isoformat() if self.last_triggered else None,
            "created_at": self.created_at.isoformat() if self.created_at else "",
            "updated_at": self.updated_at.isoformat() if self.updated_at else "",
        }

    def __repr__(self) -> str:
        return f"<TelegramReportConfig {self.name} trigger={self.trigger} enabled={self.enabled}>"


class TelegramMessageLog(Base):
    """Historial de mensajes enviados y recibidos por Telegram."""

    __tablename__ = "telegram_message_logs"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    direction: Mapped[str] = mapped_column(
        String(10), nullable=False, index=True
    )  # outbound | inbound
    chat_id: Mapped[str] = mapped_column(String(50), nullable=False)
    message_type: Mapped[str] = mapped_column(
        String(20), nullable=False, index=True
    )  # alert | summary | report | test | bot_query | bot_response
    content_summary: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(
        String(10), nullable=False, default="sent"
    )  # sent | failed | pending
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False, index=True
    )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "direction": self.direction,
            "chat_id": self.chat_id,
            "message_type": self.message_type,
            "content_summary": self.content_summary,
            "status": self.status,
            "error": self.error,
            "created_at": self.created_at.isoformat() if self.created_at else "",
        }

    def __repr__(self) -> str:
        return f"<TelegramMessageLog {self.direction} type={self.message_type} status={self.status}>"


class TelegramPendingMessage(Base):
    """Cola de mensajes pendientes de envío. Persiste en SQLite para sobrevivir reinicios."""

    __tablename__ = "telegram_pending_messages"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    chat_id: Mapped[str] = mapped_column(String(50), nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    parse_mode: Mapped[str] = mapped_column(String(10), default="HTML", nullable=False)
    message_type: Mapped[str] = mapped_column(String(20), nullable=False)
    retry_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    max_retries: Mapped[int] = mapped_column(Integer, default=5, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )

    def __repr__(self) -> str:
        return f"<TelegramPendingMessage chat={self.chat_id} retries={self.retry_count}/{self.max_retries}>"
