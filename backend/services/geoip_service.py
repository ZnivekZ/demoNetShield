"""
GeoIP Service — Geolocalización local de IPs con MaxMind GeoLite2.

Arquitectura:
- Singleton: los readers se cargan una vez en startup via initialize()
- TTLCache (cachetools): caché en memoria, expira a 1h, maxsize=10000
- Mock guard: si should_mock_geoip → datos desde MockData.geoip
- Silencia errores: si la DB falla → devuelve resultado vacío (no rompe endpoints)
- IPs privadas: detectadas sin DB, devuelven country_code="LOCAL"

Uso:
    await GeoIPService.initialize()   # en lifespan startup
    result = GeoIPService.lookup("1.2.3.4")
    results = GeoIPService.lookup_bulk(["1.2.3.4", "5.6.7.8"])
"""

from __future__ import annotations

import structlog
from cachetools import TTLCache

from config import get_settings

logger = structlog.get_logger(__name__)

_CACHE: TTLCache = TTLCache(maxsize=10000, ttl=3600)  # 1 hora


def _is_private_ip(ip: str) -> bool:
    """True si la IP pertenece a un rango privado (RFC 1918 / loopback)."""
    parts = ip.split(".")
    if len(parts) != 4:
        return False
    try:
        a, b = int(parts[0]), int(parts[1])
    except ValueError:
        return False
    return (
        a == 10
        or (a == 172 and 16 <= b <= 31)
        or (a == 192 and b == 168)
        or a == 127
    )


def _empty_result(ip: str) -> dict:
    """Resultado vacío cuando la DB no está disponible o la IP no se encuentra."""
    return {
        "ip": ip,
        "country_code": "",
        "country_name": "",
        "city": None,
        "latitude": None,
        "longitude": None,
        "asn": None,
        "as_name": None,
        "network_type": None,
        "is_datacenter": False,
        "is_tor": False,
        "raw_available": False,
    }


def _local_result(ip: str) -> dict:
    """Resultado para IPs de red local."""
    return {
        "ip": ip,
        "country_code": "LOCAL",
        "country_name": "Red Local",
        "city": None,
        "latitude": None,
        "longitude": None,
        "asn": None,
        "as_name": None,
        "network_type": "Local",
        "is_datacenter": False,
        "is_tor": False,
        "raw_available": True,
    }


class GeoIPService:
    """
    Servicio singleton para geolocalización de IPs.

    Los readers de GeoLite2 se almacenan como class vars para ser
    compartidos entre todas las requests sin re-abrir los .mmdb.
    """

    _city_reader = None   # geoip2.database.Reader (GeoLite2-City)
    _asn_reader = None    # geoip2.database.Reader (GeoLite2-ASN)
    _initialized: bool = False

    @classmethod
    def initialize(cls) -> None:
        """
        Carga los readers de GeoLite2 en memoria.
        Llamar una sola vez en el lifespan startup de FastAPI.
        En mock mode, no hace nada (los readers quedan None).
        """
        settings = get_settings()
        if settings.should_mock_geoip:
            logger.info("geoip.mock_mode", message="GeoIP en modo mock — DB no requerida")
            cls._initialized = True
            return

        try:
            import geoip2.database  # lazy import — solo si no está en mock

            city_path = settings.geoip_city_db
            asn_path = settings.geoip_asn_db

            cls._city_reader = geoip2.database.Reader(city_path)
            logger.info("geoip.city_db_loaded", path=city_path)

            cls._asn_reader = geoip2.database.Reader(asn_path)
            logger.info("geoip.asn_db_loaded", path=asn_path)

            cls._initialized = True
            logger.info("geoip.initialized", message="GeoIP listo con bases de datos reales")

        except FileNotFoundError as e:
            logger.warning(
                "geoip.db_not_found",
                error=str(e),
                hint="Ejecutar: python backend/scripts/download_geoip.py",
            )
            cls._initialized = False
        except Exception as e:
            logger.error("geoip.init_error", error=str(e))
            cls._initialized = False

    @classmethod
    def lookup(cls, ip: str) -> dict:
        """
        Geolocalize a single IP address.

        Returns a GeoIPResult-compatible dict. Never raises:
        - IP privada → country_code="LOCAL"
        - Mock mode → MockData.geoip.lookup(ip)
        - DB error → empty result (todos los campos None/vacíos)
        - Cache hit → respuesta instantánea sin consultar la DB
        """
        # 1. Cache hit
        if ip in _CACHE:
            return _CACHE[ip]

        # 2. IP privada (sin importar el modo)
        if _is_private_ip(ip):
            result = _local_result(ip)
            _CACHE[ip] = result
            return result

        settings = get_settings()

        # 3. Mock mode
        if settings.should_mock_geoip:
            from services.mock_data import MockData
            result = MockData.geoip.lookup(ip)
            _CACHE[ip] = result
            return result

        # 4. Real DB lookup
        result = cls._lookup_real(ip)
        _CACHE[ip] = result
        return result

    @classmethod
    def _lookup_real(cls, ip: str) -> dict:
        """Perform the actual GeoLite2 DB lookup. Returns empty result on any error."""
        if cls._city_reader is None and cls._asn_reader is None:
            return _empty_result(ip)

        out = _empty_result(ip)
        out["raw_available"] = True

        # City DB
        if cls._city_reader is not None:
            try:
                city_resp = cls._city_reader.city(ip)
                out["country_code"] = city_resp.country.iso_code or ""
                out["country_name"] = city_resp.country.name or ""
                out["city"] = city_resp.city.name
                out["latitude"] = city_resp.location.latitude
                out["longitude"] = city_resp.location.longitude
            except Exception as e:
                logger.debug("geoip.city_lookup_miss", ip=ip, error=str(e))

        # ASN DB
        if cls._asn_reader is not None:
            try:
                asn_resp = cls._asn_reader.asn(ip)
                out["asn"] = asn_resp.autonomous_system_number
                out["as_name"] = (
                    f"AS{asn_resp.autonomous_system_number} {asn_resp.autonomous_system_organization}"
                    if asn_resp.autonomous_system_number
                    else asn_resp.autonomous_system_organization
                )
                # Heurística simple de tipo de red basada en el nombre del ASN
                asn_name_lower = (out["as_name"] or "").lower()
                if any(w in asn_name_lower for w in ("hosting", "cloud", "datacenter", "data center", "vps", "server")):
                    out["network_type"] = "Hosting"
                    out["is_datacenter"] = True
                elif any(w in asn_name_lower for w in ("tor", "exit")):
                    out["network_type"] = "Hosting"
                    out["is_datacenter"] = True
                    out["is_tor"] = True
                elif any(w in asn_name_lower for w in ("telecom", "telco", "isp", "internet")):
                    out["network_type"] = "ISP"
                else:
                    out["network_type"] = "Business"
            except Exception as e:
                logger.debug("geoip.asn_lookup_miss", ip=ip, error=str(e))

        return out

    @classmethod
    def lookup_bulk(cls, ips: list[str]) -> list[dict]:
        """
        Geolocalize multiple IPs. Deduplicates and uses cache.
        Returns results in the same order as the input list.
        """
        settings = get_settings()
        if settings.should_mock_geoip:
            from services.mock_data import MockData
            return MockData.geoip.lookup_bulk(ips)

        seen: set[str] = set()
        results = []
        for ip in ips:
            if ip not in seen:
                seen.add(ip)
                results.append(cls.lookup(ip))
        return results

    @classmethod
    def get_db_status(cls) -> dict:
        """Return current status of the GeoLite2 DB readers and cache."""
        settings = get_settings()
        if settings.should_mock_geoip:
            from services.mock_data import MockData
            return MockData.geoip.db_status()

        city_loaded = cls._city_reader is not None
        asn_loaded = cls._asn_reader is not None

        city_info = {"loaded": False, "path": settings.geoip_city_db, "build_epoch": None, "description": ""}
        asn_info  = {"loaded": False, "path": settings.geoip_asn_db,  "build_epoch": None, "description": ""}

        if city_loaded:
            meta = cls._city_reader.metadata()
            city_info.update({
                "loaded": True,
                "build_epoch": meta.build_epoch,
                "description": meta.database_type,
            })
        if asn_loaded:
            meta = cls._asn_reader.metadata()
            asn_info.update({
                "loaded": True,
                "build_epoch": meta.build_epoch,
                "description": meta.database_type,
            })

        return {
            "city_db": city_info,
            "asn_db": asn_info,
            "mock_mode": False,
            "cache_size": len(_CACHE),
            "cache_ttl_seconds": 3600,
        }


def get_geoip_service() -> type[GeoIPService]:
    """FastAPI dependency — returns the GeoIPService class (singleton via class vars)."""
    return GeoIPService
