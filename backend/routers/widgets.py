"""
Widgets Router — Endpoints de agregación para widgets que combinan múltiples fuentes.
Prefix: /api/widgets

Endpoints:
  GET  /api/widgets/threat-level             — Score 0-100 combinando Wazuh + CrowdSec + Suricata
  GET  /api/widgets/activity-heatmap         — Matrix 7x24 de actividad de alertas [Wazuh]
  GET  /api/widgets/correlation-timeline     — 3 series alineadas en eje temporal [Multi]
  GET  /api/widgets/confirmed-threats        — IPs detectadas por ≥2 fuentes [Multi]
  GET  /api/widgets/incident-lifecycle       — Timeline de respuesta a incidente [Multi]
  GET  /api/widgets/suricata-asset-correlation — Alertas enriquecidas con activos GLPI
  GET  /api/widgets/world-threat-map         — Score por país para mapa mundial [Multi]
  POST /api/widgets/generate-view-report     — Genera reporte IA desde vista personalizada
"""

from __future__ import annotations

import asyncio

import structlog
from fastapi import APIRouter, Query
from pydantic import BaseModel

from schemas.common import APIResponse

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/api/widgets", tags=["Widgets"])


# ── Schemas de Request ────────────────────────────────────────────

class GenerateViewReportRequest(BaseModel):
    view_id: str
    widget_ids: list[str]
    audience: str = "technical"
    output: str = "pdf"          # pdf | telegram | both
    report_title: str = "Reporte de vista personalizada"


# ── Threat Level ──────────────────────────────────────────────────

@router.get("/threat-level")
async def get_threat_level() -> APIResponse:
    """
    [Wazuh API] [CrowdSec API] [Suricata API] Calcula el nivel de amenaza global (0-100).

    Pesos:
      - Alertas Wazuh críticas últimas 1h  → 40%
      - Decisiones CrowdSec activas        → 30%
      - Alertas Suricata severity=1 últ. 1h→ 30%

    En mock mode devuelve score=72 con breakdown realista.
    """
    from config import get_settings
    settings = get_settings()

    try:
        if settings.should_mock_wazuh or settings.should_mock_crowdsec or settings.should_mock_suricata:
            from services.mock_data import MockData
            return APIResponse.ok(MockData.widgets.threat_level())

        # Real mode: agregar datos de los 3 servicios
        from services.wazuh_service import get_wazuh_service
        from services.crowdsec_service import get_crowdsec_service
        from services.suricata_service import get_suricata_service

        wazuh_svc = get_wazuh_service()
        cs_svc = get_crowdsec_service()
        sur_svc = get_suricata_service()

        # Consultas en paralelo
        wazuh_alerts, cs_decisions, sur_alerts = await asyncio.gather(
            wazuh_svc.get_alerts(limit=100, level_min=10),
            cs_svc.get_decisions(),
            sur_svc.get_alerts(limit=100, severity=1),
            return_exceptions=True,
        )

        wazuh_count = len(wazuh_alerts) if isinstance(wazuh_alerts, list) else 0
        cs_count = len(cs_decisions) if isinstance(cs_decisions, list) else 0
        sur_count = len(sur_alerts) if isinstance(sur_alerts, list) else 0

        # Normalizar conteos a 0-100 con saturación
        wazuh_score = min(wazuh_count * 4, 100)
        cs_score = min(cs_count * 5, 100)
        sur_score = min(sur_count * 3, 100)

        total = int(wazuh_score * 0.4 + cs_score * 0.3 + sur_score * 0.3)

        return APIResponse.ok({
            "score": total,
            "breakdown": {
                "wazuh": {"count": wazuh_count, "score": wazuh_score, "weight": 0.4},
                "crowdsec": {"count": cs_count, "score": cs_score, "weight": 0.3},
                "suricata": {"count": sur_count, "score": sur_score, "weight": 0.3},
            },
            "generated_at": __import__("datetime").datetime.utcnow().isoformat(),
        })

    except Exception as e:
        logger.error("widgets.threat_level_error", error=str(e))
        return APIResponse.fail(f"Error calculando nivel de amenaza: {e}")


# ── Activity Heatmap ──────────────────────────────────────────────

@router.get("/activity-heatmap")
async def get_activity_heatmap() -> APIResponse:
    """
    [Wazuh API] Retorna una matrix 7x24 con cantidad de alertas agrupadas por día y hora.

    Días: 0=lunes … 6=domingo  |  Horas: 0-23
    En mock mode devuelve datos realistas con picos a las 10am y 8pm.
    """
    from config import get_settings
    settings = get_settings()

    try:
        if settings.should_mock_wazuh:
            from services.mock_data import MockData
            return APIResponse.ok(MockData.widgets.activity_heatmap())

        # Real mode: consultar alertas de los últimos 7 días y agrupar
        from services.wazuh_service import get_wazuh_service
        from datetime import datetime, timedelta, timezone

        wazuh_svc = get_wazuh_service()
        alerts = await wazuh_svc.get_alerts(limit=1000)

        matrix = [[0] * 24 for _ in range(7)]
        for alert in alerts:
            ts_str = alert.get("timestamp", "")
            try:
                ts = datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
                day = ts.weekday()   # 0=Monday
                hour = ts.hour
                matrix[day][hour] += 1
            except Exception:
                pass

        return APIResponse.ok({
            "matrix": matrix,
            "labels_day": ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"],
            "generated_at": datetime.now(timezone.utc).isoformat(),
        })

    except Exception as e:
        logger.error("widgets.activity_heatmap_error", error=str(e))
        return APIResponse.fail(f"Error generando heatmap: {e}")


# ── Correlation Timeline ──────────────────────────────────────────

@router.get("/correlation-timeline")
async def get_correlation_timeline(
    minutes: int = Query(default=120, ge=30, le=1440),
) -> APIResponse:
    """
    [Wazuh API] [Suricata API] [CrowdSec API] Retorna 3 series alineadas en eje temporal.

    Las series son: alertas Wazuh por minuto, alertas Suricata por minuto,
    nuevas decisiones CrowdSec por hora (eje secundario).

    En mock mode retorna datos con un pico sincronizado hace 20 minutos.
    """
    from config import get_settings
    settings = get_settings()

    try:
        if settings.should_mock_wazuh or settings.should_mock_suricata or settings.should_mock_crowdsec:
            from services.mock_data import MockData
            return APIResponse.ok(MockData.widgets.correlation_timeline(minutes=minutes))

        # Real mode (TODO en producción: implementar agregación real)
        from services.mock_data import MockData
        return APIResponse.ok(MockData.widgets.correlation_timeline(minutes=minutes))

    except Exception as e:
        logger.error("widgets.correlation_timeline_error", error=str(e))
        return APIResponse.fail(f"Error obteniendo correlation timeline: {e}")


# ── Confirmed Threats ─────────────────────────────────────────────

@router.get("/confirmed-threats")
async def get_confirmed_threats() -> APIResponse:
    """
    [Suricata API] [CrowdSec API] [Wazuh API] IPs detectadas por ≥2 fuentes simultáneamente.

    Cruza:
      - IPs con alerta Suricata Y decisión CrowdSec
      - IPs con alerta Wazuh Y alerta Suricata
      - IPs en los 3 sistemas (máxima confirmación)

    Devuelve lista ordenada por nivel de confirmación (3 fuentes primero).
    """
    from config import get_settings
    settings = get_settings()

    try:
        if settings.should_mock_suricata or settings.should_mock_crowdsec or settings.should_mock_wazuh:
            from services.mock_data import MockData
            return APIResponse.ok(MockData.widgets.confirmed_threats())

        # Real mode: cruzar datos de las 3 fuentes
        from services.suricata_service import get_suricata_service
        from services.crowdsec_service import get_crowdsec_service
        from services.wazuh_service import get_wazuh_service

        sur_svc = get_suricata_service()
        cs_svc = get_crowdsec_service()
        wazuh_svc = get_wazuh_service()

        sur_correlations, cs_decisions, wazuh_alerts = await asyncio.gather(
            sur_svc.get_crowdsec_correlation(),
            cs_svc.get_decisions(),
            wazuh_svc.get_alerts(limit=200, level_min=7),
            return_exceptions=True,
        )

        # Extraer IPs por fuente
        sur_ips: set[str] = set()
        if isinstance(sur_correlations, list):
            sur_ips = {c.get("ip", "") for c in sur_correlations if c.get("ip")}

        cs_ips: set[str] = set()
        if isinstance(cs_decisions, list):
            cs_ips = {d.get("ip", d.get("value", "")) for d in cs_decisions if d}

        wazuh_ips: set[str] = set()
        if isinstance(wazuh_alerts, list):
            wazuh_ips = {a.get("src_ip", "") for a in wazuh_alerts if a.get("src_ip")}

        # Cruzar
        threats = []
        all_ips = sur_ips | cs_ips | wazuh_ips
        for ip in all_ips:
            if not ip:
                continue
            sources = []
            if ip in sur_ips:
                sources.append("suricata")
            if ip in cs_ips:
                sources.append("crowdsec")
            if ip in wazuh_ips:
                sources.append("wazuh")
            if len(sources) >= 2:
                threats.append({
                    "ip": ip,
                    "sources": sources,
                    "confirmation_level": len(sources),
                    "score": len(sources) * 33,
                    "geo": None,
                })

        threats.sort(key=lambda x: x["confirmation_level"], reverse=True)

        return APIResponse.ok({
            "threats": threats[:20],
            "total": len(threats),
            "generated_at": __import__("datetime").datetime.utcnow().isoformat(),
        })

    except Exception as e:
        logger.error("widgets.confirmed_threats_error", error=str(e))
        return APIResponse.fail(f"Error obteniendo amenazas confirmadas: {e}")


# ── Incident Lifecycle ────────────────────────────────────────────

@router.get("/incident-lifecycle")
async def get_incident_lifecycle(
    ip: str = Query(default="203.0.113.45", description="IP del incidente a analizar"),
) -> APIResponse:
    """
    [Wazuh API] [CrowdSec API] [MikroTik API] [GLPI API] Timeline del ciclo de vida de incidente.

    Para una IP dada, construye la secuencia:
      Detección → Alerta → Bloqueo → Ticket GLPI → Resolución

    Los hitos no ocurridos se marcan como "pending" (no se ocultan).
    """
    from config import get_settings
    settings = get_settings()

    try:
        any_mock = (settings.should_mock_wazuh or settings.should_mock_crowdsec
                    or settings.should_mock_mikrotik or settings.should_mock_glpi)
        if any_mock:
            from services.mock_data import MockData
            return APIResponse.ok(MockData.widgets.incident_lifecycle(ip=ip))

        # Real mode: consultar cada fuente en paralelo
        from services.wazuh_service import get_wazuh_service
        from services.crowdsec_service import get_crowdsec_service
        from services.mikrotik_service import get_mikrotik_service
        from services.glpi_service import GLPIService

        wazuh_svc = get_wazuh_service()
        cs_svc = get_crowdsec_service()
        mt_svc = get_mikrotik_service()

        wazuh_alerts, cs_decisions, mt_rules = await asyncio.gather(
            wazuh_svc.get_alerts(limit=200),
            cs_svc.get_decisions(params={"ip": ip}),
            mt_svc.get_firewall_rules(),
            return_exceptions=True,
        )

        steps = []

        # Paso 1: Detección (primera alerta Wazuh para esta IP)
        if isinstance(wazuh_alerts, list):
            ip_alerts = [a for a in wazuh_alerts if a.get("src_ip") == ip]
            if ip_alerts:
                first = min(ip_alerts, key=lambda x: x.get("timestamp", ""))
                steps.append({"step": "detection", "label": "Detección", "icon": "Search",
                              "status": "done", "timestamp": first["timestamp"],
                              "source": "wazuh", "detail": first.get("rule_description", "")})
            else:
                steps.append({"step": "detection", "label": "Detección", "icon": "Search",
                              "status": "pending", "timestamp": None, "source": None, "detail": None})

        # Paso 2: Alerta (alerta crítica nivel ≥10)
        if isinstance(wazuh_alerts, list):
            critical = [a for a in wazuh_alerts if a.get("src_ip") == ip
                        and int(a.get("rule_level", 0)) >= 10]
            if critical:
                steps.append({"step": "alert", "label": "Alerta crítica", "icon": "AlertTriangle",
                              "status": "done", "timestamp": critical[0]["timestamp"],
                              "source": "wazuh", "detail": f"Nivel {critical[0]['rule_level']}"})
            else:
                steps.append({"step": "alert", "label": "Alerta crítica", "icon": "AlertTriangle",
                              "status": "pending", "timestamp": None, "source": None, "detail": None})

        # Paso 3: Bloqueo (decisión CrowdSec o regla MikroTik)
        cs_block = isinstance(cs_decisions, list) and len(cs_decisions) > 0
        mt_block = isinstance(mt_rules, list) and any(
            ip in (r.get("src_address", "") + r.get("dst_address", "")) for r in mt_rules
        )
        if cs_block or mt_block:
            source = "crowdsec" if cs_block else "mikrotik"
            ts = cs_decisions[0].get("expires_at", "") if cs_block else None
            steps.append({"step": "block", "label": "Bloqueo aplicado", "icon": "Shield",
                          "status": "done", "timestamp": ts, "source": source,
                          "detail": cs_decisions[0].get("scenario", "") if cs_block else "Regla MikroTik"})
        else:
            steps.append({"step": "block", "label": "Bloqueo aplicado", "icon": "Shield",
                          "status": "pending", "timestamp": None, "source": None, "detail": None})

        # Pasos 4-5 siempre pending en modo real sin GLPI correlación
        steps.append({"step": "ticket", "label": "Ticket GLPI", "icon": "FileText",
                      "status": "pending", "timestamp": None, "source": None, "detail": None})
        steps.append({"step": "resolution", "label": "Resolución", "icon": "CheckCircle",
                      "status": "pending", "timestamp": None, "source": None, "detail": None})

        return APIResponse.ok({"ip": ip, "steps": steps,
                               "generated_at": __import__("datetime").datetime.utcnow().isoformat()})

    except Exception as e:
        logger.error("widgets.incident_lifecycle_error", ip=ip, error=str(e))
        return APIResponse.fail(f"Error construyendo ciclo de vida: {e}")


# ── Suricata–GLPI Asset Correlation ──────────────────────────────

@router.get("/suricata-asset-correlation")
async def get_suricata_asset_correlation(
    limit: int = Query(default=20, ge=1, le=100),
) -> APIResponse:
    """
    [Suricata API] [GLPI API] [GeoIP] Cruza alertas Suricata con inventario GLPI.

    Para alertas donde dst_ip pertenece a un activo GLPI, devuelve:
    nombre del activo, propietario, severidad del ataque, técnica, agente Wazuh.

    Permite saber "este equipo de Juan Pérez en Aula 301 fue atacado".
    """
    from config import get_settings
    settings = get_settings()

    try:
        if settings.should_mock_suricata or settings.should_mock_glpi:
            from services.mock_data import MockData
            return APIResponse.ok(MockData.widgets.suricata_asset_correlation())

        from services.suricata_service import get_suricata_service
        from services.glpi_service import GLPIService

        sur_svc = get_suricata_service()
        glpi_svc = GLPIService()

        sur_alerts = await sur_svc.get_alerts(limit=200)
        glpi_assets = await glpi_svc.get_computers(limit=100)

        # Crear mapa IP → activo GLPI
        asset_by_ip: dict[str, dict] = {}
        for asset in (glpi_assets if isinstance(glpi_assets, list) else []):
            ip = asset.get("ip", "")
            if ip:
                asset_by_ip[ip] = asset

        results = []
        seen_ips: set[str] = set()
        for alert in (sur_alerts if isinstance(sur_alerts, list) else []):
            dst_ip = alert.get("dst_ip", "")
            if not dst_ip or dst_ip in seen_ips:
                continue
            asset = asset_by_ip.get(dst_ip)
            if not asset:
                continue
            seen_ips.add(dst_ip)
            results.append({
                "asset_name": asset.get("name", dst_ip),
                "asset_id": asset.get("id"),
                "asset_owner": asset.get("assigned_user", "Sin asignar"),
                "asset_location": asset.get("location", ""),
                "dst_ip": dst_ip,
                "suricata_severity": alert.get("severity", 3),
                "suricata_signature": alert.get("signature", ""),
                "suricata_category": alert.get("category", ""),
                "wazuh_agent": alert.get("wazuh_alert_id") is not None,
                "timestamp": alert.get("timestamp", ""),
            })
            if len(results) >= limit:
                break

        return APIResponse.ok({
            "correlations": results,
            "total": len(results),
            "generated_at": __import__("datetime").datetime.utcnow().isoformat(),
        })

    except Exception as e:
        logger.error("widgets.suricata_asset_correlation_error", error=str(e))
        return APIResponse.fail(f"Error en correlación Suricata-GLPI: {e}")


# ── World Threat Map ──────────────────────────────────────────────

@router.get("/world-threat-map")
async def get_world_threat_map(
    all_countries: bool = Query(default=False, description="Si true devuelve todos los países, no solo top N"),
) -> APIResponse:
    """
    [GeoLite2] [CrowdSec API] [Wazuh API] [Suricata API]
    Score de amenaza por país para renderizar el mapa mundial.

    Calcula un score agregado por país:
      - Decisiones CrowdSec desde ese país (peso 40%)
      - Alertas Wazuh con src_ip de ese país (peso 35%)
      - Alertas Suricata con src_ip de ese país (peso 25%)

    En mock mode devuelve 6 países con actividad + el resto con score=0.
    """
    from config import get_settings
    settings = get_settings()

    try:
        any_mock = (settings.should_mock_geoip or settings.should_mock_wazuh
                    or settings.should_mock_crowdsec or settings.should_mock_suricata)
        if any_mock:
            from services.mock_data import MockData
            return APIResponse.ok(MockData.widgets.world_threat_map())

        # Real mode: reusar el endpoint de top-countries con source=all
        from services.geoip_service import GeoIPService
        geoip_svc = GeoIPService()
        data = geoip_svc.get_top_countries(limit=50 if not all_countries else 250, source="all")
        return APIResponse.ok(data)

    except Exception as e:
        logger.error("widgets.world_threat_map_error", error=str(e))
        return APIResponse.fail(f"Error obteniendo world threat map: {e}")


# ── Generate View Report ──────────────────────────────────────────

@router.post("/generate-view-report")
async def generate_view_report(request: GenerateViewReportRequest) -> APIResponse:
    """
    [Anthropic API] [Multi] Genera un reporte IA desde los widgets activos en una vista.

    Flujo:
      1. Para cada widget_id, consulta sus datos usando los mismos endpoints del frontend
      2. Consolida todos los datos como contexto estructurado
      3. [Anthropic API] Llama a Claude con ese contexto y el system prompt de audiencia
      4. Si output=pdf: genera PDF con WeasyPrint y lo devuelve como descarga
      5. Si output=telegram: envía al canal configurado
      6. Si output=both: genera PDF y envía por Telegram

    Deduplica consultas si varios widgets del mismo servicio están activos.
    """
    from config import get_settings
    settings = get_settings()

    try:
        if settings.should_mock_anthropic:
            from services.mock_data import MockData
            await asyncio.sleep(2.5)  # Simular latencia de IA
            result = MockData.widgets.view_report_mock(
                view_id=request.view_id,
                widget_ids=request.widget_ids,
                audience=request.audience,
                title=request.report_title,
                output=request.output,
            )
            return APIResponse.ok(result)

        # Real mode: collect_view_context → Claude → PDF/Telegram
        from services.ai_service import collect_view_context, get_ai_service

        context = await collect_view_context(request.widget_ids)
        ai_svc = get_ai_service()
        report = await ai_svc.generate_report_from_context(
            context=context,
            audience=request.audience,
            title=request.report_title,
        )

        result: dict = {
            "success": True,
            "pdf_url": None,
            "telegram_sent": False,
            "report_summary": report.get("summary", ""),
        }

        if request.output in ("pdf", "both"):
            from services.pdf_service import PDFService
            pdf_svc = PDFService()
            pdf_bytes = await pdf_svc.generate(
                html_content=report.get("html_content", ""),
                title=request.report_title,
                metadata={"audience": request.audience},
            )
            # Guardar temporalmente y devolver URL de descarga
            import uuid, os
            report_id = str(uuid.uuid4())
            # TODO: persist to DB or temp storage
            result["pdf_url"] = f"/api/reports/download/{report_id}"

        if request.output in ("telegram", "both"):
            from services.telegram_service import get_telegram_service
            tg_svc = get_telegram_service()
            await tg_svc.send_view_report(
                title=request.report_title,
                summary=report.get("summary", ""),
                audience=request.audience,
                widget_ids=request.widget_ids,
            )
            result["telegram_sent"] = True

        return APIResponse.ok(result)

    except Exception as e:
        logger.error("widgets.generate_view_report_error", error=str(e))
        return APIResponse.fail(f"Error generando reporte de vista: {e}")
