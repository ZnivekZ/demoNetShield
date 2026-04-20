"""
CustomView Model — Vistas personalizadas de dashboard.

El usuario puede crear layouts configurables con widgets específicos.
Los widgets se serializan como JSON en el campo `widgets`.
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from database import Base


class CustomView(Base):
    """
    Vista personalizada del dashboard.
    Almacena una selección de widgets y su orden para el usuario.
    """

    __tablename__ = "custom_views"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # JSON array de WidgetConfig: [{id, type, title, config, size, position}]
    widgets: Mapped[str] = mapped_column(Text, nullable=False, default="[]")

    # UI metadata
    icon: Mapped[str | None] = mapped_column(String(50), nullable=True)    # lucide icon name
    color: Mapped[str | None] = mapped_column(String(30), nullable=True)   # CSS color / hex

    # Flags
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False, index=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now(), nullable=False
    )

    def get_widgets(self) -> list[dict]:
        """Deserializa el campo widgets a lista de dicts."""
        try:
            return json.loads(self.widgets) if self.widgets else []
        except (json.JSONDecodeError, TypeError):
            return []

    def set_widgets(self, widgets: list[dict]) -> None:
        """Serializa la lista de widgets a JSON."""
        self.widgets = json.dumps(widgets, ensure_ascii=False)

    def to_dict(self) -> dict:
        """Serializa el modelo a dict para la respuesta API."""
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "widgets": self.get_widgets(),
            "icon": self.icon,
            "color": self.color,
            "is_default": self.is_default,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }

    def __repr__(self) -> str:
        return f"<CustomView id={self.id} name='{self.name}' widgets={len(self.get_widgets())}>"
