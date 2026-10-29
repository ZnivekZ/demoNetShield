"""
Public Ticket — vínculo entre un ticket de GLPI creado desde el portal público
(`/soporte`) y el email que lo reportó.

El portal NO valida identidad: el email es el único identificador. Como el
ticket se crea sin `user_recipient`, esta tabla es la fuente de verdad para la
consulta de estado: hay que acertar **ID + email** (el ID solo no alcanza).
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from database import Base


class PublicTicket(Base):
    """Ticket creado desde el portal público (sin autenticación)."""

    __tablename__ = "public_tickets"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    glpi_ticket_id: Mapped[int] = mapped_column(Integer, index=True, nullable=False)
    email: Mapped[str] = mapped_column(String(255), index=True, nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    ip_hash: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    attachment_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False, index=True
    )

    def __repr__(self) -> str:
        return f"<PublicTicket glpi={self.glpi_ticket_id} email={self.email}>"
