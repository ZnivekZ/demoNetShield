"""
Schemas del portal público de tickets (sin autenticación).

Validación estricta pero sin dependencias nuevas (no hay `email-validator`
instalado): regex + límites de longitud + limpieza de caracteres de control.
"""

from __future__ import annotations

import re
from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator

# Pragmático: algo@algo.tld — no pretende ser RFC 5322 completo.
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$")
_CONTROL_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")

TicketCategory = Literal["red", "hardware", "so", "seguridad"]


def _clean(value: str) -> str:
    """Quita caracteres de control y espacios sobrantes."""
    return _CONTROL_RE.sub("", value).strip()


class PublicTicketCreate(BaseModel):
    """Payload del formulario público."""

    email: str = Field(..., max_length=255)
    title: str = Field(..., min_length=3, max_length=120)
    description: str = Field(..., min_length=10, max_length=4000)
    category: Optional[TicketCategory] = None
    priority: int = Field(default=3, ge=1, le=5)
    equipment: Optional[str] = Field(default=None, max_length=120)
    # Honeypot: invisible en la UI; si viene con algo, es un bot.
    website: Optional[str] = None

    @field_validator("email")
    @classmethod
    def valid_email(cls, v: str) -> str:
        value = _clean(v).lower()
        if not _EMAIL_RE.match(value):
            raise ValueError("Email inválido")
        return value

    @field_validator("title", "description")
    @classmethod
    def clean_required(cls, v: str) -> str:
        value = _clean(v)
        if not value:
            raise ValueError("Campo vacío")
        return value

    @field_validator("equipment")
    @classmethod
    def clean_optional(cls, v: Optional[str]) -> Optional[str]:
        return _clean(v) or None if v else None


class PublicTicketCreated(BaseModel):
    """Respuesta al crear: el ID es lo único que el usuario debe guardar."""

    ticket_id: int
    message: str = "Ticket creado"


class PublicTicketStatus(BaseModel):
    """Estado público de un ticket (sin datos internos)."""

    ticket_id: int
    title: str
    status: int
    status_label: str
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    attachment: Optional[str] = None
