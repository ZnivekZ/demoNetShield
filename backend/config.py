"""
NetShield Dashboard - Application Configuration
Uses pydantic-settings for type-safe environment variable management.
All settings are loaded from .env file or environment variables.
"""

from __future__ import annotations

import json
from functools import lru_cache
from typing import Optional

from pydantic import field_validator, model_validator
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

    # Wazuh Indexer (OpenSearch 7.10) — alerts + vulnerabilities live here.
    # Server API does NOT expose /alerts. Real alerts come from Indexer :9200.
    wazuh_indexer_url: str = ""
    wazuh_indexer_user: str = "admin"
    wazuh_indexer_password: str = ""
    wazuh_indexer_verify_ssl: bool = False

    # ── OpenRouter AI (modelos gratuitos vía proxy OpenAI-compatible) ──────
    openrouter_api_key: str = ""
    openrouter_model: str = "openrouter/auto"  # modelo gratuito por defecto

    # ── Database ─────────────────────────────────────────────────
    database_url: str = "sqlite+aiosqlite:///./netshield.db"

    # ── Redis (optional) ─────────────────────────────────────────
    redis_url: Optional[str] = "redis://localhost:6379"

    # ── Application ──────────────────────────────────────────────
    app_env: str = "development"  # "development" | "production"
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
    # Requiere CROWDSEC_API_KEY con las credenciales del bouncer.
    crowdsec_url: str = "http://localhost:8080"
    crowdsec_api_key: str = ""

    # ── GeoIP (MaxMind GeoLite2) ──────────────────────────────────────────
    # Bases de datos locales .mmdb para geolocalización sin API externa.
    # Descargar con: python backend/scripts/download_geoip.py
    # Docs: https://dev.maxmind.com/geoip/geolite2-free-geolocation-data
    geoip_city_db: str = "backend/data/geoip/GeoLite2-City.mmdb"
    geoip_asn_db: str = "backend/data/geoip/GeoLite2-ASN.mmdb"
    maxmind_license_key: str = ""  # Requerida para descargar la DB

    # ── Telegram Bot ──────────────────────────────────────────────────────
    # Bot de Telegram para notificaciones bidireccionales.
    # Crear el bot con @BotFather y completar TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID.
    telegram_bot_token: str = ""
    telegram_chat_id: str = ""  # Chat/Group/Channel ID principal
    telegram_webhook_secret: str = ""  # Secreto para validar webhook inbound
    telegram_admin_chat_ids: str = ""  # IDs separados por coma (autorizados para consultas)

    # ── Auth / JWT ─────────────────────────────────────────────
    jwt_secret_key: str = "2db7b36c3bc296ace08b5612e06633ad2ffe7c72089e8aa2c500674636aa1834"        # OBLIGATORIO — falla al arrancar si vacío
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60    # 1 hora de expiración
    default_admin_user: str = "admin"
    default_admin_password: str = "admin"

    # ── Audit / Action Log ─────────────────────────────────────
    # Nivel mínimo de severidad para registrar acciones.
    # Jerarquía: critical > high > medium > low > info
    # Opciones: "critical" | "high" | "medium" | "low" | "info"
    # Default "info" = registrar absolutamente todo.
    # Ejemplo: "medium" → solo registra medium, high y critical.
    audit_min_severity: str = "info"

    # Prefijos de action_type a EXCLUIR del registro, separados por coma.
    # Útil para silenciar categorías de bajo interés.
    # Ejemplo: "network_label_,view_,cli_" → no registra esas acciones.
    # Default vacío = no excluir nada.
    audit_disabled_actions: str = ""

    @model_validator(mode="after")
    def validate_jwt_secret(self) -> "Settings":
        """JWT_SECRET_KEY es obligatorio para la seguridad del sistema."""
        if not self.jwt_secret_key:
            raise ValueError(
                "\n\n"
                "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                "  JWT_SECRET_KEY es OBLIGATORIO en backend/.env            \n"
                "  Generá uno seguro con:                                   \n"
                "  python -c \"import secrets; print(secrets.token_hex(32))\"\n"
                "  Luego agregalo a .env: JWT_SECRET_KEY=<valor generado>   \n"
                "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
            )
        if len(self.jwt_secret_key) < 32:
            raise ValueError(
                "JWT_SECRET_KEY debe tener al menos 32 caracteres. "
                "Usá: python -c \"import secrets; print(secrets.token_hex(32))\""
            )
        return self

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
        return self.app_env == "development"

    @property
    def wazuh_base_url(self) -> str:
        return f"https://{self.wazuh_host}:{self.wazuh_port}"

    @property
    def glpi_base_url(self) -> str:
        """Base URL for GLPI REST API."""
        return f"{self.glpi_url}/apirest.php"

    @property
    def telegram_admin_ids_list(self) -> list[str]:
        """Lista de chat IDs autorizados para consultas al bot."""
        if not self.telegram_admin_chat_ids:
            return []
        return [cid.strip() for cid in self.telegram_admin_chat_ids.split(",") if cid.strip()]


@lru_cache()
def get_settings() -> Settings:
    """
    Cached singleton for application settings.
    Call get_settings() anywhere to get the same instance.
    """
    return Settings()
