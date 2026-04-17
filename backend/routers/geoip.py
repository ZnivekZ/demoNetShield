"""
GeoIP Router — IP geolocation endpoints using MaxMind GeoLite2.
Prefix: /api/geoip

All endpoints work in mock mode (default) and with real GeoLite2 DBs
when they are downloaded and MOCK_GEOIP=false.

Endpoints:
  GET  /lookup/{ip}             — Single IP lookup
  POST /lookup/bulk             — Batch IP lookup (up to 200 IPs)
  GET  /stats/top-countries     — Top attacking countries (cross-source)
  GET  /stats/top-asns          — Top attacking ASNs (cross-source)
  GET  /suggestions/geo-block   — Automatic geo-block suggestions
  POST /suggestions/{id}/apply  — Apply a geo-block suggestion
  GET  /db/status               — GeoLite2 DB loader status
"""

from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models.action_log import ActionLog
from schemas.common import APIResponse
from schemas.geoip import (
    GeoIPResult,
    BulkLookupRequest,
    TopCountriesResponse,
    TopASNsResponse,
    GeoBlockSuggestion,
    ApplySuggestionRequest,
    GeoIPDBStatus,
)
from services.geoip_service import GeoIPService, get_geoip_service
from config import get_settings

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/api/geoip", tags=["GeoIP"])


# ── Single lookup ─────────────────────────────────────────────────────────────


@router.get("/lookup/{ip}", response_model=APIResponse)
async def lookup_ip(
    ip: str,
    svc: type[GeoIPService] = Depends(get_geoip_service),
) -> APIResponse:
    """
    [GeoLite2] Geolocalize a single IP address.

    Returns country, city, coordinates, ASN, and network classification.
    IPs privadas devuelven country_code="LOCAL".
    En mock mode, los datos son simulados (raw_available=False).
    """
    try:
        result = svc.lookup(ip)
        return APIResponse.ok(result)
    except Exception as e:
        logger.error("geoip.lookup_error", ip=ip, error=str(e))
        return APIResponse.fail(f"Error geolocalizando IP: {e}")


# ── Bulk lookup ───────────────────────────────────────────────────────────────


@router.post("/lookup/bulk", response_model=APIResponse)
async def lookup_bulk(
    body: BulkLookupRequest,
    svc: type[GeoIPService] = Depends(get_geoip_service),
) -> APIResponse:
    """
    [GeoLite2] Geolocalize up to 200 IPs in a single request.

    Deduplicates IPs and uses TTLCache — IPs repetidas no generan
    consultas adicionales a la DB.
    """
    try:
        results = svc.lookup_bulk(body.ips)
        return APIResponse.ok(results)
    except Exception as e:
        logger.error("geoip.bulk_error", count=len(body.ips), error=str(e))
        return APIResponse.fail(f"Error en bulk lookup: {e}")


# ── Stats ─────────────────────────────────────────────────────────────────────


@router.get("/stats/top-countries", response_model=APIResponse)
async def get_top_countries(
    limit: int = Query(default=10, ge=1, le=50, description="Number of countries to return"),
    source: str = Query(default="all", description="Source filter: all | crowdsec | wazuh | mikrotik"),
    svc: type[GeoIPService] = Depends(get_geoip_service),
) -> APIResponse:
    """
    [GeoLite2 + CrowdSec + Wazuh + MikroTik] Top attacking countries.

    Agrega IPs de múltiples fuentes y las geolocalizará para construir el
    ranking. En mock mode devuelve datos del _GeoIPMockData.top_countries().
    """
    settings = get_settings()
    try:
        if settings.should_mock_geoip:
            from services.mock_data import MockData
            data = MockData.geoip.top_countries(limit=limit, source=source)
        else:
            # TODO (producción): agregar IPs reales de CrowdSec + Wazuh + MikroTik
            # y geolocalizarlas con lookup_bulk, luego agrupar por país.
            from services.mock_data import MockData
            data = MockData.geoip.top_countries(limit=limit, source=source)

        return APIResponse.ok(data)
    except Exception as e:
        logger.error("geoip.top_countries_error", error=str(e))
        return APIResponse.fail(f"Error obteniendo top países: {e}")


@router.get("/stats/top-asns", response_model=APIResponse)
async def get_top_asns(
    limit: int = Query(default=10, ge=1, le=50, description="Number of ASNs to return"),
    svc: type[GeoIPService] = Depends(get_geoip_service),
) -> APIResponse:
    """
    [GeoLite2 + CrowdSec + Wazuh + MikroTik] Top attacking ASNs.
    """
    settings = get_settings()
    try:
        if settings.should_mock_geoip:
            from services.mock_data import MockData
            data = MockData.geoip.top_asns(limit=limit)
        else:
            from services.mock_data import MockData
            data = MockData.geoip.top_asns(limit=limit)

        return APIResponse.ok(data)
    except Exception as e:
        logger.error("geoip.top_asns_error", error=str(e))
        return APIResponse.fail(f"Error obteniendo top ASNs: {e}")


# ── Geo-block suggestions ─────────────────────────────────────────────────────


@router.get("/suggestions/geo-block", response_model=APIResponse)
async def get_geo_block_suggestions(
    svc: type[GeoIPService] = Depends(get_geoip_service),
) -> APIResponse:
    """
    [GeoLite2 + CrowdSec + Wazuh] Automatic geo-block suggestions.

    Analiza las decisiones CrowdSec activas y alertas Wazuh para sugerir
    bloqueos regionales (por país o ASN) que reducirían la superficie de ataque.
    """
    settings = get_settings()
    try:
        if settings.should_mock_geoip:
            from services.mock_data import MockData
            data = MockData.geoip.geo_block_suggestions()
        else:
            from services.mock_data import MockData
            data = MockData.geoip.geo_block_suggestions()

        return APIResponse.ok(data)
    except Exception as e:
        logger.error("geoip.suggestions_error", error=str(e))
        return APIResponse.fail(f"Error obteniendo sugerencias: {e}")


@router.post("/suggestions/{suggestion_id}/apply", response_model=APIResponse)
async def apply_geo_block_suggestion(
    suggestion_id: str,
    body: ApplySuggestionRequest,
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """
    [MikroTik API] Apply a geo-block suggestion by adding IPs to Blacklist_Automatica.

    IMPORTANTE — TODO (producción):
    En modo real, este endpoint necesita resolver la conversión
    country_code / ASN → rangos CIDR antes de poder aplicar el bloqueo.
    GeoLite2 no provee rangos CIDR por país directamente.
    Opciones para producción:
      - ip2location-lite CIDR blocks dataset
      - delegated-apnic-latest de IANA
      - Tabla pre-calculada por país/ASN actualizada mensualmente

    En mock mode devuelve una respuesta exitosa simulada.
    """
    settings = get_settings()
    if settings.should_mock_geoip:
        logger.info(
            "geoip.suggestion_applied_mock",
            suggestion_id=suggestion_id,
            duration=body.duration,
        )
        await ActionLog.log(
            db,
            action="geo_block_suggestion_applied",
            target=suggestion_id,
            detail=f"Mock: duracion={body.duration}",
        )
        return APIResponse.ok({
            "suggestion_id": suggestion_id,
            "duration": body.duration,
            "applied": True,
            "mock": True,
            "message": f"Sugerencia {suggestion_id!r} aplicada (modo mock). "
                       "En producción se requiere resolución de rangos CIDR.",
        })

    # TODO (producción): implementar resolución real de rangos CIDR
    raise HTTPException(
        status_code=501,
        detail="Apply suggestion no implementado en modo real. Ver TODO en el código.",
    )


# ── DB status ─────────────────────────────────────────────────────────────────


@router.get("/db/status", response_model=APIResponse)
async def get_db_status(
    svc: type[GeoIPService] = Depends(get_geoip_service),
) -> APIResponse:
    """
    [Local] Status of the GeoLite2 database files.

    Muestra si las DBs están cargadas en memoria, su fecha de build,
    y el estado actual del TTLCache.
    """
    try:
        status = svc.get_db_status()
        return APIResponse.ok(status)
    except Exception as e:
        logger.error("geoip.db_status_error", error=str(e))
        return APIResponse.fail(f"Error obteniendo estado de la DB: {e}")
