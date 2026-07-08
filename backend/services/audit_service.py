"""
Audit Service — Centraliza el registro de acciones en ActionLog.

Uso en cualquier router:
    from services.audit_service import log_action

    await log_action(
        db,
        action_type="security_block",
        severity="critical",
        target_ip="10.0.0.1",
        details={"reason": "Bruteforce detectado"},
        performed_by=current_user.username,
        comment="IP bloqueada automáticamente",
    )

La función respeta la configuración de .env:
    AUDIT_MIN_SEVERITY      — Nivel mínimo para registrar (default: "info" = todo)
    AUDIT_DISABLED_ACTIONS  — Prefijos de action_type a excluir (default: vacío)

Si la acción es filtrada por la config, retorna None sin escribir en la DB.

Niveles de severidad (de mayor a menor):
    critical  — Bloqueos, cuarentenas, remediaciones, auto-responses
    high      — CRUD de usuarios, reglas, sync, unblocks
    medium    — CRUD de activos, tickets, reportes, VLANs, DHCP
    low       — Login, logout, labels, groups, vistas, config menor
    info      — Login fallido, comandos CLI, búsquedas, trazas
"""

from __future__ import annotations

import json
from functools import lru_cache

from sqlalchemy.ext.asyncio import AsyncSession

from config import get_settings
from models.action_log import ActionLog

# ── Jerarquía de severidades ──────────────────────────────────────────────────

SEVERITY_ORDER: dict[str, int] = {
    "critical": 4,
    "high": 3,
    "medium": 2,
    "low": 1,
    "info": 0,
}

VALID_SEVERITIES = frozenset(SEVERITY_ORDER.keys())

# ── Mapeo canónico action_type → severity ────────────────────────────────────
# Usado como referencia y para validación de consistencia.
# Los routers siempre pasan severity explícitamente; este mapa es informativo.

ACTION_SEVERITY_MAP: dict[str, str] = {
    # ── critical ──────────────────────────────────────────────────────────────
    "security_block":                   "critical",
    "auto_block":                       "critical",
    "geo_block":                        "critical",
    "quarantine":                       "critical",
    "active_response":                  "critical",
    "crowdsec_full_remediation":        "critical",
    "suricata_autoresponse_trigger":    "critical",
    "phishing_block":                   "critical",
    "sinkhole_add":                     "critical",
    "glpi_quarantine":                  "critical",
    # ── high ──────────────────────────────────────────────────────────────────
    "auth_user_created":                "high",
    "auth_user_updated":                "high",
    "auth_user_deleted":                "high",
    "crowdsec_manual_decision":         "high",
    "crowdsec_delete_decision":         "high",
    "crowdsec_sync_apply":              "high",
    "crowdsec_whitelist_add":           "high",
    "crowdsec_whitelist_remove":        "high",
    "suricata_rule_toggle":             "high",
    "suricata_reload_rules":            "high",
    "suricata_update_rules":            "high",
    "suricata_autoresponse_config_update": "high",
    "portal_setup":                     "high",
    "glpi_user_created":                "high",
    "glpi_user_updated":                "high",
    "glpi_user_deleted":                "high",
    "unblock":                          "high",
    "crowdsec_unblock_ip":              "high",
    # ── medium ────────────────────────────────────────────────────────────────
    "glpi_asset_created":               "medium",
    "glpi_asset_updated":               "medium",
    "glpi_asset_deleted":               "medium",
    "glpi_asset_assigned":              "medium",
    "glpi_unquarantine":                "medium",
    "glpi_ticket_created":              "medium",
    "glpi_ticket_status_updated":       "medium",
    "glpi_maintenance_ticket":          "medium",
    "portal_user_create":               "medium",
    "portal_user_update":               "medium",
    "portal_user_delete":               "medium",
    "portal_user_disconnect":           "medium",
    "portal_user_bulk_create":          "medium",
    "report_generated":                 "medium",
    "telegram_test_sent":               "medium",
    "telegram_report_triggered":        "medium",
    "telegram_alert_sent":              "medium",
    "telegram_summary_sent":            "medium",
    "dhcp_rogue_blocked":               "medium",
    "dhcp_lease_action":                "medium",
    "vlan_created":                     "medium",
    "vlan_updated":                     "medium",
    "vlan_deleted":                     "medium",
    "sinkhole_remove":                  "medium",
    "geo_block_suggestion_applied":     "medium",
    # ── low ───────────────────────────────────────────────────────────────────
    "auth_login":                       "low",
    "auth_logout":                      "low",
    "view_created":                     "low",
    "view_updated":                     "low",
    "view_deleted":                     "low",
    "view_default_set":                 "low",
    "network_label_created":            "low",
    "network_label_deleted":            "low",
    "network_group_created":            "low",
    "network_group_member_added":       "low",
    "network_group_member_removed":     "low",
    "network_group_deleted":            "low",
    "portal_schedule_update":           "low",
    "portal_speed_update":              "low",
    # ── info ──────────────────────────────────────────────────────────────────
    "auth_login_failed":                "info",
    "cli_mikrotik_command":             "info",
    "cli_wazuh_action":                 "info",
}

# ── Lógica de filtrado ────────────────────────────────────────────────────────

@lru_cache(maxsize=1)
def _get_audit_config() -> tuple[int, tuple[str, ...]]:
    """
    Carga la configuración de auditoría desde .env una sola vez.
    Retorna (min_severity_level, disabled_prefixes_tuple).
    El lru_cache garantiza que la lectura se hace una única vez por proceso.
    """
    settings = get_settings()
    min_level = SEVERITY_ORDER.get(settings.audit_min_severity.lower(), 0)
    disabled_raw = settings.audit_disabled_actions.strip()
    disabled = tuple(
        p.strip() for p in disabled_raw.split(",") if p.strip()
    ) if disabled_raw else ()
    return min_level, disabled


def _should_log(action_type: str, severity: str) -> bool:
    """
    Determina si una acción debe ser registrada según la config de .env.

    Reglas (en orden):
      1. La severidad debe alcanzar o superar AUDIT_MIN_SEVERITY.
      2. El action_type no debe comenzar con ningún prefijo en AUDIT_DISABLED_ACTIONS.
    """
    min_level, disabled_prefixes = _get_audit_config()

    # 1. Filtro por severidad mínima
    action_level = SEVERITY_ORDER.get(severity.lower(), 0)
    if action_level < min_level:
        return False

    # 2. Filtro por prefijos excluidos
    if disabled_prefixes and any(
        action_type.startswith(prefix) for prefix in disabled_prefixes
    ):
        return False

    return True


# ── Helper principal ──────────────────────────────────────────────────────────

async def log_action(
    db: AsyncSession,
    *,
    action_type: str,
    severity: str = "info",
    target_ip: str | None = None,
    details: dict | None = None,
    performed_by: str = "system",
    comment: str | None = None,
) -> ActionLog | None:
    """
    Registra una acción en el audit trail si la configuración de .env lo permite.

    Args:
        db:           Sesión async de SQLAlchemy (inyectada por FastAPI Depends).
        action_type:  Identificador snake_case de la acción (ej: "security_block").
        severity:     Nivel de importancia. Ver SEVERITY_ORDER. Default "info".
        target_ip:    IP afectada, si aplica.
        details:      Dict con contexto adicional — se serializa a JSON.
        performed_by: Username del operador. Default "system" para acciones automáticas.
        comment:      Descripción legible en español para la UI.

    Returns:
        La instancia de ActionLog creada, o None si fue filtrada por config.

    Nota:
        No hace commit — el commit es responsabilidad del ciclo de vida de la sesión
        (FastAPI lo hace automáticamente al cerrar el request en get_db()).
        Usa flush() para que el id quede disponible si se necesita en el mismo request.
    """
    if severity not in VALID_SEVERITIES:
        severity = "info"  # Fallback seguro

    if not _should_log(action_type, severity):
        return None

    entry = ActionLog(
        action_type=action_type,
        severity=severity,
        target_ip=target_ip,
        details=json.dumps(details, ensure_ascii=False) if details else None,
        performed_by=performed_by,
        comment=comment,
    )
    db.add(entry)
    await db.flush()
    return entry


# ── Utilidad para el endpoint /api/audit/config ───────────────────────────────

def get_audit_config_info() -> dict:
    """
    Retorna la configuración actual de auditoría para exponerla vía API.
    Solo lectura — la config se cambia en .env y requiere reinicio.
    """
    settings = get_settings()
    min_level, disabled_prefixes = _get_audit_config()

    # Agrupar acciones disponibles por categoría para el frontend
    categories = [
        {"prefix": "auth_",       "label": "Auth",       "emoji": "🔐"},
        {"prefix": "security_",   "label": "Seguridad",  "emoji": "🛡️"},
        {"prefix": "block",       "label": "Bloqueos",   "emoji": "🚫"},
        {"prefix": "crowdsec_",   "label": "CrowdSec",   "emoji": "🦀"},
        {"prefix": "suricata_",   "label": "Suricata",   "emoji": "🐊"},
        {"prefix": "portal_",     "label": "Portal",     "emoji": "🌐"},
        {"prefix": "glpi_",       "label": "GLPI",       "emoji": "📦"},
        {"prefix": "report_",     "label": "Reportes",   "emoji": "📊"},
        {"prefix": "telegram_",   "label": "Telegram",   "emoji": "📨"},
        {"prefix": "phishing_",   "label": "Phishing",   "emoji": "🎣"},
        {"prefix": "sinkhole_",   "label": "Sinkhole",   "emoji": "⛔"},
        {"prefix": "geo_block_",  "label": "GeoIP",      "emoji": "🌍"},
        {"prefix": "dhcp_",       "label": "DHCP",       "emoji": "🔧"},
        {"prefix": "vlan_",       "label": "VLANs",      "emoji": "🔀"},
        {"prefix": "view_",       "label": "Vistas",     "emoji": "🖼️"},
        {"prefix": "network_",    "label": "Network",    "emoji": "🕸️"},
        {"prefix": "cli_",        "label": "CLI",        "emoji": "💻"},
        {"prefix": "quarantine",  "label": "Cuarentena", "emoji": "🔒"},
    ]

    return {
        "min_severity": settings.audit_min_severity,
        "min_severity_level": min_level,
        "disabled_action_prefixes": list(disabled_prefixes),
        "severity_levels": ["critical", "high", "medium", "low", "info"],
        "categories": categories,
        "note": "La configuración se cambia en .env y requiere reinicio del backend.",
    }
