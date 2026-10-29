"""
Reputación IP — consulta de sólo lectura a AbuseIPDB y VirusTotal + reporte.

Endpoints:
  GET  /api/reputation/capabilities      → fuentes configuradas, categorías y estado del reporte
  GET  /api/reputation/{ip}              → valida y consulta ambas fuentes
  POST /api/reputation/{ip}/report       → reportar la IP como maliciosa en AbuseIPDB
"""

from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from schemas.common import APIResponse
from services.ip_reputation import get_reputation_service, validate_ip
from services.audit_service import log_action

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/api/reputation", tags=["Reputation"])


class ReportIn(BaseModel):
    categories: list[int] = Field(default_factory=list)
    comment: str = ""
    timestamp: str | None = None  # ISO 8601; opcional, últimas 24 h


@router.get("/capabilities")
async def get_capabilities() -> APIResponse:
    """Qué fuentes están configuradas y si el reporte está disponible."""
    from config import get_settings

    settings = get_settings()
    svc = get_reputation_service()
    return APIResponse.ok(
        {
            "abuseipdb": bool(settings.abuseipdb_api_key),
            "virustotal": bool(settings.virustotal_api_key),
            "report": svc.report_availability(),
        }
    )


@router.get("/categories")
async def get_categories() -> APIResponse:
    """Categorías oficiales de AbuseIPDB para el formulario de reporte."""
    from services.abuse_categories import CATEGORIES

    return APIResponse.ok(CATEGORIES)


@router.get("/{ip}")
async def lookup_ip(ip: str, refresh: bool = False) -> APIResponse:
    """Consulta la reputación de una IP en AbuseIPDB y VirusTotal."""
    svc = get_reputation_service()
    try:
        data = await svc.lookup(ip, use_cache=not refresh)
    except ValueError as e:
        return APIResponse.fail(str(e))
    logger.info("ip_reputation_checked", ip=data["ip"], verdict=data["verdict"])
    return APIResponse.ok(data)


@router.post("/{ip}/report")
async def report_ip(
    ip: str,
    payload: ReportIn,
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """
    Reporta una IP como maliciosa en AbuseIPDB.

    Plug and play: valida todo el formulario siempre; si falta la API key
    devuelve `available: false` con el detalle, y en cuanto se cargue la clave
    empieza a enviar reportes reales sin tocar código.
    """
    svc = get_reputation_service()
    try:
        validate_ip(ip)
        result = await svc.report(
            ip,
            categories=payload.categories,
            comment=payload.comment,
            timestamp=payload.timestamp,
        )
    except ValueError as e:
        return APIResponse.fail(str(e))

    if result.get("ok"):
        await log_action(
            db,
            action_type="ip_reported",
            severity="medium",
            target_ip=result["ip"],
            details={
                "source": "abuseipdb",
                "categories": result.get("categories", []),
                "timestamp": result.get("timestamp"),
            },
            performed_by="dashboard_user",
            comment=(result.get("comment") or "")[:200],
        )
        logger.info("ip_reported", ip=result["ip"], categories=result.get("categories"))
        return APIResponse.ok(result)

    logger.info("ip_report_unavailable", ip=ip, available=result.get("available"))
    return APIResponse.fail(result.get("error") or "No se pudo reportar la IP")
