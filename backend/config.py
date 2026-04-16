"""
NetShield Dashboard - Application Configuration
Uses pydantic-settings for type-safe environment variable management.
All settings are loaded from .env file or environment variables.

Mock Mode:
  MOCK_ALL=true        → todos los servicios en mock
  MOCK_MIKROTIK=true   → solo MikroTik en mock
  MOCK_WAZUH=true      → solo Wazuh en mock
  MOCK_GLPI=true       → solo GLPI en mock
  MOCK_ANTHROPIC=true  → solo Anthropic en mock

  Retrocompatibilidad: si APP_ENV=lab y NO hay ninguna variable MOCK_*
  definida explícitamente, se activa MOCK_ALL automáticamente.
  Para usar lab con servicios reales: MOCK_ALL=false
"""

from __future__ import annotations

import json
from functools import lru_cache
from typing import Optional

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """
    Central configuration for the NetShield Dashboard.
    Reads from .env file automatically.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── MikroTik CHR ─────────────────────────────────────────────
    mikrotik_host: str = "192.168.100.118"
    mikrotik_port: int = 8728
    mikrotik_user: str = "admin"
    mikrotik_password: str = ""

    # ── Wazuh SIEM ───────────────────────────────────────────────
    wazuh_host: str = "100.90.106.121"
    wazuh_port: int = 55000
    wazuh_user: str = "wazuh"
    wazuh_password: str = ""

    # ── Anthropic Claude ─────────────────────────────────────────
    anthropic_api_key: str = ""

    # ── Database ─────────────────────────────────────────────────
    database_url: str = "sqlite+aiosqlite:///./netshield.db"

    # ── Redis (optional) ─────────────────────────────────────────
    redis_url: Optional[str] = "redis://localhost:6379"

    # ── Application ──────────────────────────────────────────────
    app_env: str = "development"  # "development", "production", or "lab"
    log_level: str = "DEBUG"
    cors_origins: list[str] = ["http://localhost:5173", "http://localhost:3000"]

    # ── Security Thresholds ──────────────────────────────────────
    alert_notification_threshold: int = 10  # Min alert level for push notifications
    auto_block_threshold: int = 12  # Min alert level for auto-blocking
    auto_block_enabled: bool = False  # Toggle automatic IP blocking

    # ── Hotspot / Portal Cautivo ──────────────────────────────────
    # Interface where MikroTik Hotspot will be configured.
    # Lab: ether2 (virtualized CHR). Production: change to physical LAN interface.
    # Change via HOTSPOT_INTERFACE env var — no code changes needed when migrating.
    hotspot_interface: str = "ether2"
    hotspot_server_name: str = "hotspot1"
    hotspot_address_pool: str = "hs-pool-1"

    # ── GLPI Asset Management ─────────────────────────────────────────────
    glpi_url: str = "http://glpi.facultad.local"
    glpi_app_token: str = ""
    glpi_user_token: str = ""
    glpi_verify_ssl: bool = False

    # ── CrowdSec IPS ──────────────────────────────────────────────────────
    # Local API (LAPI) del agente CrowdSec. Puerto 8080 por defecto.
    # Activar cuando CrowdSec esté instalado: MOCK_CROWDSEC=false + credenciales.
    crowdsec_url: str = "http://localhost:8080"
    crowdsec_api_key: str = ""

    # ── Mock Mode ─────────────────────────────────────────────
    # Global toggle — activa mock para TODOS los servicios
    mock_all: bool = False
    # Overrides por servicio — funciona con OR junto a mock_all
    mock_mikrotik: bool = False
    mock_wazuh: bool = False
    mock_glpi: bool = False
    mock_anthropic: bool = False
    mock_crowdsec: bool = False

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, v: str | list[str]) -> list[str]:
        """Parse CORS origins from JSON string or list."""
        if isinstance(v, str):
            try:
                return json.loads(v)
            except json.JSONDecodeError:
                return [origin.strip() for origin in v.split(",")]
        return v

    @property
    def is_development(self) -> bool:
        return self.app_env in ("development", "lab")

    @property
    def is_lab(self) -> bool:
        return self.app_env == "lab"

    @property
    def wazuh_base_url(self) -> str:
        return f"https://{self.wazuh_host}:{self.wazuh_port}"

    @property
    def glpi_base_url(self) -> str:
        """Base URL for GLPI REST API."""
        return f"{self.glpi_url}/apirest.php"

    # ── Mock Mode Properties ──────────────────────────────────

    @property
    def _has_explicit_mock_vars(self) -> bool:
        """
        True si alguna variable MOCK_* fue definida explícitamente en el entorno.
        Usado para la regla de retrocompatibilidad APP_ENV=lab.
        """
        import os
        return any(
            os.environ.get(var) is not None
            for var in ("MOCK_ALL", "MOCK_MIKROTIK", "MOCK_WAZUH", "MOCK_GLPI", "MOCK_ANTHROPIC", "MOCK_CROWDSEC")
        )

    @property
    def _effective_mock_all(self) -> bool:
        """
        True si MOCK_ALL=true, O si APP_ENV=lab sin variables MOCK_* explícitas
        (retrocompatibilidad: comportamiento legacy de APP_ENV=lab).
        """
        if self.mock_all:
            return True
        if self.app_env == "lab" and not self._has_explicit_mock_vars:
            return True
        return False

    @property
    def should_mock_mikrotik(self) -> bool:
        """True si MikroTik debe usar datos mock."""
        return self._effective_mock_all or self.mock_mikrotik

    @property
    def should_mock_wazuh(self) -> bool:
        """True si Wazuh debe usar datos mock."""
        return self._effective_mock_all or self.mock_wazuh

    @property
    def should_mock_glpi(self) -> bool:
        """True si GLPI debe usar datos mock."""
        return self._effective_mock_all or self.mock_glpi

    @property
    def should_mock_anthropic(self) -> bool:
        """True si Anthropic debe usar datos mock."""
        return self._effective_mock_all or self.mock_anthropic

    @property
    def should_mock_crowdsec(self) -> bool:
        """True si CrowdSec debe usar datos mock."""
        return self._effective_mock_all or self.mock_crowdsec


@lru_cache()
def get_settings() -> Settings:
    """
    Cached singleton for application settings.
    Call get_settings() anywhere to get the same instance.
    """
    return Settings()
