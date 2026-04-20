"""
Schemas para vistas personalizadas y catálogo de widgets.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


# ── Widget schemas ───────────────────────────────────────────────

class WidgetConfig(BaseModel):
    """Configuración de un widget dentro de una vista personalizada."""
    id: str = Field(..., description="ID único del widget en la vista (UUID)")
    type: str = Field(..., description="Tipo de widget (ej: 'wazuh_alerts', 'traffic_chart')")
    title: str = Field(..., description="Título visible del widget")
    size: str = Field(default="medium", description="Tamaño: small | medium | large | full")
    config: dict[str, Any] = Field(default_factory=dict, description="Config específica del widget")


class WidgetCatalogItem(BaseModel):
    """Item del catálogo de widgets disponibles."""
    type: str
    title: str
    description: str
    icon: str
    source: str              # wazuh | mikrotik | crowdsec | suricata | glpi | phishing | general
    default_size: str
    available_sizes: list[str]
    config_schema: dict[str, Any] = Field(default_factory=dict)


# ── View schemas ─────────────────────────────────────────────────

class CustomViewCreate(BaseModel):
    """Payload para crear una vista personalizada."""
    name: str = Field(..., min_length=1, max_length=100)
    description: str | None = Field(default=None, max_length=255)
    widgets: list[WidgetConfig] = Field(default_factory=list)
    icon: str | None = Field(default=None, max_length=50)
    color: str | None = Field(default=None, max_length=30)


class CustomViewUpdate(BaseModel):
    """Payload para actualizar una vista (todos los campos opcionales)."""
    name: str | None = Field(default=None, min_length=1, max_length=100)
    description: str | None = Field(default=None, max_length=255)
    widgets: list[WidgetConfig] | None = None
    icon: str | None = Field(default=None, max_length=50)
    color: str | None = Field(default=None, max_length=30)


class CustomViewResponse(BaseModel):
    """Respuesta completa de una vista."""
    id: str
    name: str
    description: str | None
    widgets: list[dict]     # Serializado desde WidgetConfig
    icon: str | None
    color: str | None
    is_default: bool
    created_at: str | None
    updated_at: str | None
