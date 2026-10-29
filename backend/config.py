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
    # ¿La cuenta de API puede ESCRIBIR en el router? Si es False (default),
    # NetShield no empuja nada: los bloqueos quedan en el archivo
    # /blocklist.txt para que el propio MikroTik (o un script) haga pull.
    mikrotik_api_write_enabled: bool = False

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

    # ── GLPI Asset Management ─────────────────────────────────────────────
    # High-Level REST API (OAuth2, "password" grant).
    #   Token:     POST {glpi_api_url}/token
    #   Resources: {glpi_api_url}/{glpi_api_version}/Assets/Computer, ...
    glpi_url: str = "http://localhost"              # host (display / legacy)
    glpi_api_url: str = "http://localhost/api.php"  # API root (token + versions)
    glpi_api_version: str = "v3.0"
    glpi_client_id: str = ""
    glpi_client_secret: str = ""
    glpi_username: str = "glpi"
    glpi_password: str = "glpi"
    glpi_verify_ssl: bool = False
    # Legacy low-level API (apirest.php) — deprecated, disabled on this instance
    glpi_app_token: str = ""
    glpi_user_token: str = ""

    # ── Portal público de tickets (/soporte, sin autenticación) ───────────
    public_tickets_enabled: bool = False
    public_tickets_rate_limit: int = 5      # tickets por IP por hora
    public_tickets_max_mb: int = 5          # tamaño máximo de adjunto

    # ── CrowdSec IPS ──────────────────────────────────────────────────────
    # Local API (LAPI) del agente CrowdSec. Puerto 8080 por defecto.
    # Requiere CROWDSEC_API_KEY con las credenciales del bouncer.
    crowdsec_url: str = "http://localhost:8080"
    crowdsec_api_key: str = ""

    # Reputación de IPs (sección "Reputación IP"). Sin claves, la sección
    # muestra el estado "no configurado" en vez de fallar.
    abuseipdb_api_key: str = ""
    virustotal_api_key: str = ""

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
    jwt_secret_key: str = ""        # OBLIGATORIO — falla al arrancar si vacío
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 
    default_admin_user: str = ""
    default_admin_password: str = ""

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
    def glpi_token_url(self) -> str:
        """OAuth2 token endpoint (High-Level API)."""
        return f"{self.glpi_api_url.rstrip('/')}/token"

    @property
    def glpi_api_base(self) -> str:
        """Versioned High-Level API base, e.g. http://host/api.php/v3.0."""
        return f"{self.glpi_api_url.rstrip('/')}/{self.glpi_api_version}"

    @property
    def glpi_legacy_base(self) -> str:
        """Legacy API base (NetworkPort/IPAddress), e.g. http://host/api.php/v1."""
        return f"{self.glpi_api_url.rstrip('/')}/v1"

    @property
    def glpi_configured(self) -> bool:
        """True when OAuth2 credentials are present."""
        return bool(
            self.glpi_client_id
            and self.glpi_client_secret
            and self.glpi_username
            and self.glpi_password
        )

    @property
    def glpi_base_url(self) -> str:
        """Deprecated: legacy low-level API (apirest.php). Unused after the v3 migration."""
        return f"{self.glpi_url.rstrip('/')}/apirest.php"

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
