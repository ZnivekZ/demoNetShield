"""
Suricata Router — REST API para el motor IDS/IPS/NSM Suricata.
Prefix: /api/suricata

Endpoints (24 total):
  Engine:      4 — status, stats, mode, reload-rules
  Alerts:      5 — list, timeline, top-signatures, categories, detail
  Flows NSM:   5 — list, stats, dns, http, tls
  Rules:       5 — list, detail, rulesets, toggle, update
  Correlation: 2 — crowdsec, wazuh
  Auto-response: 3 — trigger, config GET/PUT

Reglas:
  - Toda acción destructiva (POST/PUT sobre reglas, auto-response trigger) → ActionLog
  - Las acciones que modifican estado externo (reload-rules, update-rules) → ConfirmModal en frontend
  - Validación via schemas Pydantic (suricata.py)
"""

from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models.action_log import ActionLog
from schemas.common import APIResponse
from schemas.suricata import (
    AlertFilterParams,
    AutoResponseConfigUpdate,
    AutoResponseTriggerRequest,
    FlowFilterParams,
    RuleFilterParams,
    RuleToggleRequest,
)
from services.suricata_service import SuricataService, get_suricata_service

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/api/suricata", tags=["Suricata"])


# ── Dependency ─────────────────────────────────────────────────────────────────

def get_sur() -> SuricataService:
    return get_suricata_service()


# ══════════════════════════════════════════════════════════════════════════════
# ENGINE
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/engine/status")
async def get_engine_status(
    sur: SuricataService = Depends(get_sur),
):
    """Estado y métricas del motor Suricata."""
    try:
        data = await sur.get_engine_stats()
        return APIResponse.ok(data)
    except Exception as exc:
        logger.error("suricata_engine_status_error", error=str(exc))
        return APIResponse.fail(str(exc))


@router.get("/engine/stats")
async def get_engine_stats(
    minutes: int = Query(default=30, ge=5, le=120),
    sur: SuricataService = Depends(get_sur),
):
    """Métricas del motor + serie temporal para gráficos (últimos N minutos)."""
    try:
        stats = await sur.get_engine_stats()
        series = await sur.get_engine_stats_series(minutes=minutes)
        return APIResponse.ok({"stats": stats, "series": series})
    except Exception as exc:
        logger.error("suricata_engine_stats_error", error=str(exc))
        return APIResponse.fail(str(exc))


@router.get("/engine/mode")
async def get_engine_mode(
    sur: SuricataService = Depends(get_sur),
):
    """Modo de operación del motor (ids/ips/nsm)."""
    try:
        data = await sur.get_engine_mode()
        return APIResponse.ok(data)
    except Exception as exc:
        logger.error("suricata_engine_mode_error", error=str(exc))
        return APIResponse.fail(str(exc))


@router.post("/engine/reload-rules")
async def reload_rules(
    sur: SuricataService = Depends(get_sur),
    db: AsyncSession = Depends(get_db),
):
    """
    Recargar reglas en caliente.
    Sin reinicio del motor — Suricata lee las nuevas reglas sin pausa de captura.
    IMPORTANTE: Requiere confirmación via ConfirmModal en el frontend.
    """
    try:
        result = await sur.reload_rules()
        await ActionLog.create(
            db=db,
            action="suricata_reload_rules",
            target="suricata_engine",
            details=result,
        )
        return APIResponse.ok(result)
    except Exception as exc:
        logger.error("suricata_reload_rules_error", error=str(exc))
        return APIResponse.fail(str(exc))


# ══════════════════════════════════════════════════════════════════════════════
# ALERTS
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/alerts")
async def get_alerts(
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    src_ip: str | None = Query(default=None),
    dst_ip: str | None = Query(default=None),
    category: str | None = Query(default=None),
    severity: int | None = Query(default=None, ge=1, le=4),
    sur: SuricataService = Depends(get_sur),
):
    """Lista de alertas IDS/IPS de Suricata con filtros opcionales."""
    try:
        # Reutilizar el schema para validar la IP si se provee
        if src_ip:
            from schemas.suricata import AlertFilterParams
            AlertFilterParams(src_ip=src_ip)
        if dst_ip:
            from schemas.suricata import AlertFilterParams
            AlertFilterParams(dst_ip=dst_ip)
        alerts = await sur.get_alerts(
            limit=limit, offset=offset,
            src_ip=src_ip, dst_ip=dst_ip,
            category=category, severity=severity,
        )
        return APIResponse.ok({"alerts": alerts, "total": len(alerts), "offset": offset})
    except ValueError as exc:
        return APIResponse.fail(str(exc))
    except Exception as exc:
        logger.error("suricata_alerts_error", error=str(exc))
        return APIResponse.fail(str(exc))


@router.get("/alerts/timeline")
async def get_alerts_timeline(
    minutes: int = Query(default=120, ge=10, le=1440),
    sur: SuricataService = Depends(get_sur),
):
    """Serie temporal de alertas por minuto para el gráfico de timeline."""
    try:
        timeline = await sur.get_alerts_timeline(minutes=minutes)
        return APIResponse.ok({"timeline": timeline, "minutes": minutes})
    except Exception as exc:
        logger.error("suricata_alerts_timeline_error", error=str(exc))
        return APIResponse.fail(str(exc))


@router.get("/alerts/top-signatures")
async def get_top_signatures(
    limit: int = Query(default=10, ge=1, le=50),
    sur: SuricataService = Depends(get_sur),
):
    """Top firmas por número de hits (últimas 24h)."""
    try:
        signatures = await sur.get_top_signatures(limit=limit)
        return APIResponse.ok({"signatures": signatures})
    except Exception as exc:
        logger.error("suricata_top_signatures_error", error=str(exc))
        return APIResponse.fail(str(exc))


@router.get("/alerts/categories")
async def get_categories(
    sur: SuricataService = Depends(get_sur),
):
    """Distribución de alertas por categoría (para donut chart)."""
    try:
        categories = await sur.get_categories()
        return APIResponse.ok({"categories": categories})
    except Exception as exc:
        logger.error("suricata_categories_error", error=str(exc))
        return APIResponse.fail(str(exc))


@router.get("/alerts/{alert_id}")
async def get_alert_detail(
    alert_id: str,
    sur: SuricataService = Depends(get_sur),
):
    """Detalle completo de una alerta Suricata por ID."""
    try:
        alert = await sur.get_alert_detail(alert_id)
        if alert is None:
            return APIResponse.fail(f"Alerta no encontrada: {alert_id}")
        return APIResponse.ok(alert)
    except Exception as exc:
        logger.error("suricata_alert_detail_error", alert_id=alert_id, error=str(exc))
        return APIResponse.fail(str(exc))


# ══════════════════════════════════════════════════════════════════════════════
# FLOWS NSM
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/flows")
async def get_flows(
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    src_ip: str | None = Query(default=None),
    proto: str | None = Query(default=None),
    app_proto: str | None = Query(default=None),
    has_alert: bool | None = Query(default=None),
    sur: SuricataService = Depends(get_sur),
):
    """Flujos de red NSM capturados por Suricata."""
    try:
        flows = await sur.get_flows(
            limit=limit, offset=offset,
            src_ip=src_ip, proto=proto,
            app_proto=app_proto, has_alert=has_alert,
        )
        return APIResponse.ok({"flows": flows, "total": len(flows), "offset": offset})
    except Exception as exc:
        logger.error("suricata_flows_error", error=str(exc))
        return APIResponse.fail(str(exc))


@router.get("/flows/stats")
async def get_flows_stats(
    sur: SuricataService = Depends(get_sur),
):
    """Estadísticas agregadas de flujos: top protocolos, IPs, puertos."""
    try:
        stats = await sur.get_flows_stats()
        return APIResponse.ok(stats)
    except Exception as exc:
        logger.error("suricata_flows_stats_error", error=str(exc))
        return APIResponse.fail(str(exc))


@router.get("/flows/dns")
async def get_dns_queries(
    limit: int = Query(default=50, ge=1, le=500),
    suspicious_only: bool = Query(default=False),
    sur: SuricataService = Depends(get_sur),
):
    """Consultas DNS capturadas — filtrables por sospechosas."""
    try:
        queries = await sur.get_dns_queries(limit=limit, suspicious_only=suspicious_only)
        return APIResponse.ok({"queries": queries, "total": len(queries)})
    except Exception as exc:
        logger.error("suricata_dns_error", error=str(exc))
        return APIResponse.fail(str(exc))


@router.get("/flows/http")
async def get_http_transactions(
    limit: int = Query(default=50, ge=1, le=500),
    suspicious_only: bool = Query(default=False),
    sur: SuricataService = Depends(get_sur),
):
    """Transacciones HTTP capturadas — filtrables por sospechosas."""
    try:
        transactions = await sur.get_http_transactions(limit=limit, suspicious_only=suspicious_only)
        return APIResponse.ok({"transactions": transactions, "total": len(transactions)})
    except Exception as exc:
        logger.error("suricata_http_error", error=str(exc))
        return APIResponse.fail(str(exc))


@router.get("/flows/tls")
async def get_tls_handshakes(
    limit: int = Query(default=50, ge=1, le=500),
    suspicious_only: bool = Query(default=False),
    sur: SuricataService = Depends(get_sur),
):
    """Handshakes TLS capturados — filtrables por sospechosos (JA3/SNI)."""
    try:
        handshakes = await sur.get_tls_handshakes(limit=limit, suspicious_only=suspicious_only)
        return APIResponse.ok({"handshakes": handshakes, "total": len(handshakes)})
    except Exception as exc:
        logger.error("suricata_tls_error", error=str(exc))
        return APIResponse.fail(str(exc))


# ══════════════════════════════════════════════════════════════════════════════
# RULES
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/rules")
async def get_rules(
    limit: int = Query(default=100, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    enabled: bool | None = Query(default=None),
    ruleset: str | None = Query(default=None),
    category: str | None = Query(default=None),
    sur: SuricataService = Depends(get_sur),
):
    """Lista de reglas/firmas de Suricata con estadísticas de hits."""
    try:
        rules = await sur.get_rules(
            limit=limit, offset=offset,
            enabled=enabled, ruleset=ruleset, category=category,
        )
        return APIResponse.ok({"rules": rules, "total": len(rules), "offset": offset})
    except Exception as exc:
        logger.error("suricata_rules_error", error=str(exc))
        return APIResponse.fail(str(exc))


@router.get("/rules/rulesets")
async def get_rulesets(
    sur: SuricataService = Depends(get_sur),
):
    """Rulesets disponibles: emerging-threats-open, local, etc."""
    try:
        rulesets = await sur.get_rulesets()
        return APIResponse.ok({"rulesets": rulesets})
    except Exception as exc:
        logger.error("suricata_rulesets_error", error=str(exc))
        return APIResponse.fail(str(exc))


@router.get("/rules/{sid}")
async def get_rule_detail(
    sid: int,
    sur: SuricataService = Depends(get_sur),
):
    """Detalle completo de una regla: raw text + estadísticas de hits."""
    try:
        rule = await sur.get_rule_detail(sid)
        if rule is None:
            return APIResponse.fail(f"Regla no encontrada: SID {sid}")
        return APIResponse.ok(rule)
    except Exception as exc:
        logger.error("suricata_rule_detail_error", sid=sid, error=str(exc))
        return APIResponse.fail(str(exc))


@router.put("/rules/{sid}/toggle")
async def toggle_rule(
    sid: int,
    body: RuleToggleRequest,
    sur: SuricataService = Depends(get_sur),
    db: AsyncSession = Depends(get_db),
):
    """
    Habilitar/deshabilitar una regla por SID.
    IMPORTANTE: Requiere confirmación via ConfirmModal en el frontend.
    """
    try:
        result = await sur.toggle_rule(sid=sid, enabled=body.enabled)
        await ActionLog.create(
            db=db,
            action="suricata_rule_toggle",
            target=f"sid:{sid}",
            details={"sid": sid, "enabled": body.enabled},
        )
        return APIResponse.ok(result)
    except Exception as exc:
        logger.error("suricata_rule_toggle_error", sid=sid, error=str(exc))
        return APIResponse.fail(str(exc))


@router.post("/rules/update")
async def update_rules(
    sur: SuricataService = Depends(get_sur),
    db: AsyncSession = Depends(get_db),
):
    """
    Actualizar reglas ejecutando suricata-update.
    Descarga la versión más reciente del ruleset y recarga en el motor.
    IMPORTANTE: Requiere confirmación via ConfirmModal en el frontend.
    """
    try:
        result = await sur.update_rules()
        await ActionLog.create(
            db=db,
            action="suricata_update_rules",
            target="suricata_rulesets",
            details=result,
        )
        return APIResponse.ok(result)
    except Exception as exc:
        logger.error("suricata_update_rules_error", error=str(exc))
        return APIResponse.fail(str(exc))


# ══════════════════════════════════════════════════════════════════════════════
# CORRELATION
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/correlation/crowdsec")
async def get_correlation_crowdsec(
    sur: SuricataService = Depends(get_sur),
):
    """
    IPs con alertas Suricata que tienen decisión activa en CrowdSec.
    Permite ver amenazas confirmadas por múltiples fuentes.
    """
    try:
        data = await sur.get_correlation_crowdsec()
        return APIResponse.ok({"correlations": data, "total": len(data)})
    except Exception as exc:
        logger.error("suricata_correlation_crowdsec_error", error=str(exc))
        return APIResponse.fail(str(exc))


@router.get("/correlation/wazuh")
async def get_correlation_wazuh(
    sur: SuricataService = Depends(get_sur),
):
    """
    Correlación temporal entre alertas Suricata y alertas Wazuh.
    Muestra pares alerta-red / alerta-host dentro de ±5 minutos.
    """
    try:
        data = await sur.get_correlation_wazuh()
        return APIResponse.ok({"correlations": data, "total": len(data)})
    except Exception as exc:
        logger.error("suricata_correlation_wazuh_error", error=str(exc))
        return APIResponse.fail(str(exc))


# ══════════════════════════════════════════════════════════════════════════════
# AUTO-RESPONSE
# ══════════════════════════════════════════════════════════════════════════════

@router.post("/autoresponse/trigger")
async def trigger_autoresponse(
    body: AutoResponseTriggerRequest,
    sur: SuricataService = Depends(get_sur),
    db: AsyncSession = Depends(get_db),
):
    """
    Activar circuito de respuesta automática para una IP:
    1. CrowdSec ban  2. MikroTik block  3. Registro en historial.

    SIEMPRE requiere confirmación manual via ConfirmModal.
    El auto-trigger sin confirmación está deshabilitado por defecto.
    """
    try:
        result = await sur.trigger_autoresponse(
            ip=body.ip,
            trigger_alert_id=body.trigger_alert_id,
            duration=body.duration,
            reason=body.reason,
        )
        await ActionLog.create(
            db=db,
            action="suricata_autoresponse_trigger",
            target=body.ip,
            details={
                "trigger_alert_id": body.trigger_alert_id,
                "duration": body.duration,
                "actions_taken": result.get("actions_taken", []),
            },
        )
        return APIResponse.ok(result)
    except ValueError as exc:
        return APIResponse.fail(str(exc))
    except Exception as exc:
        logger.error("suricata_autoresponse_trigger_error", ip=body.ip, error=str(exc))
        return APIResponse.fail(str(exc))


@router.get("/autoresponse/config")
async def get_autoresponse_config(
    sur: SuricataService = Depends(get_sur),
):
    """Configuración actual del circuito de respuesta automática."""
    try:
        config = await sur.get_autoresponse_config()
        history = await sur.get_autoresponse_history(limit=5)
        return APIResponse.ok({"config": config, "recent_history": history})
    except Exception as exc:
        logger.error("suricata_autoresponse_config_error", error=str(exc))
        return APIResponse.fail(str(exc))


@router.put("/autoresponse/config")
async def update_autoresponse_config(
    body: AutoResponseConfigUpdate,
    sur: SuricataService = Depends(get_sur),
    db: AsyncSession = Depends(get_db),
):
    """Actualizar configuración del circuito de respuesta automática."""
    try:
        updated = await sur.update_autoresponse_config(body.model_dump())
        await ActionLog.create(
            db=db,
            action="suricata_autoresponse_config_update",
            target="suricata_autoresponse",
            details=body.model_dump(exclude_none=True),
        )
        return APIResponse.ok(updated)
    except Exception as exc:
        logger.error("suricata_autoresponse_config_update_error", error=str(exc))
        return APIResponse.fail(str(exc))
