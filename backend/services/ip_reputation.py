"""
Reputación de IPs — consulta AbuseIPDB y VirusTotal.

Sólo lectura: no bloquea ni escribe nada. Si falta la clave de una fuente, esa
fuente devuelve `configured: false` y la otra sigue funcionando (nunca 500).

Cache en memoria de 10 minutos para no quemar cuota: AbuseIPDB permite ~1000
consultas por día en el plan gratuito.
"""

from __future__ import annotations

import asyncio
import ipaddress
import time
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx
import structlog

from config import get_settings

logger = structlog.get_logger(__name__)

CACHE_TTL_SECONDS = 600
TIMEOUT_SECONDS = 8.0

ABUSEIPDB_URL = "https://api.abuseipdb.com/api/v2/check"
ABUSEIPDB_REPORT_URL = "https://api.abuseipdb.com/api/v2/report"

MIN_COMMENT_CHARS = 32
MAX_COMMENT_CHARS = 1024
VIRUSTOTAL_URL = "https://www.virustotal.com/api/v3/ip_addresses/{ip}"


def validate_ip(value: str) -> str:
    """Normaliza y valida. Acepta IPv4/IPv6, rechaza rangos (no aplican acá)."""
    raw = (value or "").strip()
    if not raw:
        raise ValueError("Ingresá una IP")
    try:
        ip = ipaddress.ip_address(raw)
    except ValueError as exc:
        raise ValueError(f"IP inválida: {value}") from exc
    if ip.is_private or ip.is_loopback or ip.is_link_local:
        # Se permite consultar, pero se avisa que no tiene sentido afuera.
        return str(ip)
    return str(ip)


def _iso(value: str | None) -> str | None:
    return value or None


def _verdict(sources: dict[str, Any]) -> str:
    """Veredicto global a partir de las dos fuentes."""
    abuse = sources.get("abuseipdb") or {}
    vt = sources.get("virustotal") or {}

    score = abuse.get("abuse_confidence_score") or 0
    vt_mal = vt.get("malicious") or 0

    if vt_mal >= 5 or score >= 75:
        return "malicious"
    if vt_mal >= 1 or score >= 25:
        return "suspicious"
    if abuse.get("ok") or vt.get("ok"):
        return "clean"
    return "unknown"


class IpReputationService:
    def __init__(self) -> None:
        self._cache: dict[str, tuple[float, dict[str, Any]]] = {}

    # ── fuentes ────────────────────────────────────────────────
    async def _abuseipdb(self, ip: str) -> dict[str, Any]:
        key = get_settings().abuseipdb_api_key
        if not key:
            return {"configured": False, "ok": False, "error": "Falta ABUSEIPDB_API_KEY"}

        try:
            async with httpx.AsyncClient(timeout=TIMEOUT_SECONDS) as client:
                r = await client.get(
                    ABUSEIPDB_URL,
                    headers={"Key": key, "Accept": "application/json"},
                    params={"ipAddress": ip, "maxAgeInDays": 90, "verbose": "false"},
                )
            if r.status_code == 401:
                return {"configured": True, "ok": False, "error": "API key inválida (401)"}
            if r.status_code == 429:
                return {"configured": True, "ok": False, "error": "Cuota agotada (429)"}
            r.raise_for_status()
            d = r.json().get("data", {})
            return {
                "configured": True,
                "ok": True,
                "abuse_confidence_score": d.get("abuseConfidenceScore", 0),
                "total_reports": d.get("totalReports", 0),
                "num_distinct_users": d.get("numDistinctUsers", 0),
                "last_reported_at": _iso(d.get("lastReportedAt")),
                "country_code": d.get("countryCode"),
                "isp": d.get("isp"),
                "domain": d.get("domain"),
                "usage_type": d.get("usageType"),
                "is_whitelisted": d.get("isWhitelisted"),
                "is_tor": d.get("isTor"),
                "error": None,
            }
        except Exception as e:  # noqa: BLE001
            logger.warning("abuseipdb_failed", ip=ip, error=str(e)[:120])
            return {"configured": True, "ok": False, "error": f"Error de consulta: {type(e).__name__}"}

    async def _virustotal(self, ip: str) -> dict[str, Any]:
        key = get_settings().virustotal_api_key
        if not key:
            return {"configured": False, "ok": False, "error": "Falta VIRUSTOTAL_API_KEY"}

        try:
            async with httpx.AsyncClient(timeout=TIMEOUT_SECONDS) as client:
                r = await client.get(
                    VIRUSTOTAL_URL.format(ip=ip),
                    headers={"x-apikey": key, "Accept": "application/json"},
                )
            if r.status_code == 401:
                return {"configured": True, "ok": False, "error": "API key inválida (401)"}
            if r.status_code == 404:
                return {"configured": True, "ok": False, "error": "IP sin datos en VirusTotal"}
            if r.status_code == 429:
                return {"configured": True, "ok": False, "error": "Cuota agotada (429)"}
            r.raise_for_status()

            attrs = (r.json().get("data") or {}).get("attributes", {})
            stats = attrs.get("last_analysis_stats", {}) or {}
            return {
                "configured": True,
                "ok": True,
                "malicious": stats.get("malicious", 0),
                "suspicious": stats.get("suspicious", 0),
                "harmless": stats.get("harmless", 0),
                "undetected": stats.get("undetected", 0),
                "timeout": stats.get("timeout", 0),
                "reputation": attrs.get("reputation"),
                "country": attrs.get("country"),
                "as_owner": attrs.get("as_owner"),
                "asn": attrs.get("asn"),
                "network": attrs.get("network"),
                "last_analysis_date": (
                    datetime.fromtimestamp(attrs["last_analysis_date"], tz=timezone.utc).isoformat(
                        timespec="seconds"
                    )
                    if attrs.get("last_analysis_date")
                    else None
                ),
                "error": None,
            }
        except Exception as e:  # noqa: BLE001
            logger.warning("virustotal_failed", ip=ip, error=str(e)[:120])
            return {"configured": True, "ok": False, "error": f"Error de consulta: {type(e).__name__}"}

    # ── API pública ────────────────────────────────────────────
    def cached(self, ip: str) -> dict[str, Any] | None:
        hit = self._cache.get(ip)
        if not hit:
            return None
        ts, payload = hit
        if time.time() - ts > CACHE_TTL_SECONDS:
            self._cache.pop(ip, None)
            return None
        return {**payload, "cached": True}

    async def lookup(self, raw_ip: str, use_cache: bool = True) -> dict[str, Any]:
        ip = validate_ip(raw_ip)
        if use_cache:
            hit = self.cached(ip)
            if hit:
                return hit

        abuse, vt = await asyncio.gather(self._abuseipdb(ip), self._virustotal(ip))
        sources = {"abuseipdb": abuse, "virustotal": vt}

        payload = {
            "ip": ip,
            "is_private": ipaddress.ip_address(ip).is_private,
            "checked_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "cached": False,
            "verdict": _verdict(sources),
            "sources": sources,
            "any_configured": bool(abuse.get("configured") or vt.get("configured")),
        }
        self._cache[ip] = (time.time(), payload)
        return payload

    def report_availability(self) -> dict[str, Any]:
        """
        Estado del reporte a AbuseIPDB.

        Plug and play: en cuanto haya `ABUSEIPDB_API_KEY` válida, `available`
        pasa a True y el formulario del panel empieza a funcionar solo.
        """
        configured = bool(get_settings().abuseipdb_api_key)
        from services.abuse_categories import CATEGORIES

        return {
            "available": configured,
            "reason": (
                None
                if configured
                else "Falta cargar ABUSEIPDB_API_KEY en el .env. El formulario queda listo: "
                "apenas exista la clave, se puede reportar."
            ),
            "source": "abuseipdb",
            "categories": CATEGORIES,
            "limits": {
                "min_comment": MIN_COMMENT_CHARS,
                "max_comment": MAX_COMMENT_CHARS,
                "max_age_hours": 24,
            },
        }

    def validate_report(
        self, categories: list[int], comment: str, timestamp: str | None
    ) -> dict[str, Any]:
        """Normaliza y valida el reporte antes de gastar una llamada."""
        from services.abuse_categories import VALID_IDS

        cats = sorted({int(c) for c in (categories or [])})
        if not cats:
            raise ValueError("Elegí al menos una categoría")
        invalid = [c for c in cats if c not in VALID_IDS]
        if invalid:
            raise ValueError(f"Categorías inválidas: {invalid}")
        if len(cats) > 10:
            raise ValueError("Máximo 10 categorías por reporte")

        text = (comment or "").strip()
        if len(text) < MIN_COMMENT_CHARS:
            raise ValueError(
                f"El comentario debe tener al menos {MIN_COMMENT_CHARS} caracteres "
                f"(tenés {len(text)})"
            )
        if len(text) > MAX_COMMENT_CHARS:
            raise ValueError(f"El comentario no puede superar {MAX_COMMENT_CHARS} caracteres")

        ts = None
        if timestamp:
            try:
                parsed = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
            except ValueError as exc:
                raise ValueError("Fecha del incidente inválida (ISO 8601)") from exc
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=timezone.utc)
            age = datetime.now(timezone.utc) - parsed
            if age > timedelta(hours=24):
                raise ValueError("AbuseIPDB sólo acepta incidentes de las últimas 24 horas")
            if age < timedelta(0):
                raise ValueError("La fecha del incidente no puede ser futura")
            ts = parsed.isoformat(timespec="seconds")

        return {"categories": cats, "comment": text, "timestamp": ts}

    async def report(
        self,
        raw_ip: str,
        categories: list[int],
        comment: str,
        timestamp: str | None = None,
    ) -> dict[str, Any]:
        """Envía el reporte a AbuseIPDB. Requiere clave con permisos de reporte."""
        ip = validate_ip(raw_ip)
        payload = self.validate_report(categories, comment, timestamp)

        key = get_settings().abuseipdb_api_key
        if not key:
            return {
                "ok": False,
                "available": False,
                "ip": ip,
                "error": "Falta ABUSEIPDB_API_KEY: el formulario está listo pero no hay credencial.",
            }

        form = {
            "ip": ip,
            "categories": ",".join(str(c) for c in payload["categories"]),
            "comment": payload["comment"],
        }
        if payload["timestamp"]:
            form["timestamp"] = payload["timestamp"]

        try:
            async with httpx.AsyncClient(timeout=TIMEOUT_SECONDS) as client:
                r = await client.post(
                    ABUSEIPDB_REPORT_URL,
                    headers={"Key": key, "Accept": "application/json"},
                    data=form,
                )
            if r.status_code == 401:
                return {"ok": False, "available": True, "ip": ip, "error": "API key inválida (401)"}
            if r.status_code in (403, 422):
                detail = ""
                try:
                    detail = "; ".join(str(v) for v in r.json().get("errors", [{}])[0].values())
                except Exception:  # noqa: BLE001
                    detail = f"HTTP {r.status_code}"
                return {"ok": False, "available": True, "ip": ip, "error": detail[:200]}
            if r.status_code == 429:
                return {"ok": False, "available": True, "ip": ip, "error": "Cuota o límite de reportes (429)"}
            r.raise_for_status()

            data = (r.json() or {}).get("data", {})
            return {
                "ok": True,
                "available": True,
                "ip": ip,
                "abuse_confidence_score": data.get("abuseConfidenceScore"),
                "categories": payload["categories"],
                "timestamp": payload["timestamp"],
                "comment": payload["comment"],
            }
        except Exception as e:  # noqa: BLE001
            logger.warning("abuseipdb_report_failed", ip=ip, error=str(e)[:120])
            return {"ok": False, "available": True, "ip": ip,
                    "error": f"Error de envío: {type(e).__name__}"}


_service: IpReputationService | None = None


def get_reputation_service() -> IpReputationService:
    global _service
    if _service is None:
        _service = IpReputationService()
    return _service
