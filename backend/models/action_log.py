"""
Action Log Model - Audit trail for all security-related actions.
Tracks who did what, when, and why for compliance and forensics.

Campos:
    action_type  — Identificador snake_case de la acción (ej: "security_block")
    severity     — Nivel de importancia: critical | high | medium | low | info
    target_ip    — IP afectada (opcional, no aplica a todas las acciones)
    details      — JSON payload con contexto adicional de la acción
    performed_by — Usuario del dashboard que realizó la acción
    comment      — Descripción legible adicional
    created_at   — Timestamp UTC de la acción

Índices compuestos para queries frecuentes:
    (severity, created_at) — filtro por severidad ordenado por fecha
    (action_type, created_at) — filtro por tipo ordenado por fecha
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Index, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from database import Base


class ActionLog(Base):
    """
    Immutable audit log for all dashboard actions.
    Every significant action is logged here with full context.
    """

    __tablename__ = "action_logs"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    action_type: Mapped[str] = mapped_column(
        String(80), index=True, nullable=False
    )  # block, unblock, auth_login, vlan_created, etc.
    severity: Mapped[str] = mapped_column(
        String(12), index=True, nullable=False, default="info"
    )  # critical | high | medium | low | info
    target_ip: Mapped[str | None] = mapped_column(
        String(45), index=True, nullable=True
    )
    details: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON payload
    performed_by: Mapped[str] = mapped_column(String(100), default="system")
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False, index=True
    )

    # Índices compuestos para queries con filtros combinados
    __table_args__ = (
        Index("ix_action_logs_severity_created", "severity", "created_at"),
        Index("ix_action_logs_type_created", "action_type", "created_at"),
    )

    def __repr__(self) -> str:
        return f"<ActionLog [{self.severity}] {self.action_type} by={self.performed_by} at={self.created_at}>"
