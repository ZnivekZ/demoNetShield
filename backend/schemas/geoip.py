"""
GeoIP schemas — Pydantic models for geolocation endpoints.

All models are returned by the /api/geoip/* router.
Fields are kept flat and nullable so they work correctly
whether the GeoLite2 DB is loaded or in mock mode.
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


# ── Core result ──────────────────────────────────────────────────────────────


class GeoIPResult(BaseModel):
    """Geolocation result for a single IP address."""

    ip: str
    # Country — always present even in mock mode
    country_code: str = ""   # ISO 3166-1 alpha-2 (e.g. "CN") or "LOCAL" / "UNKNOWN"
    country_name: str = ""   # Full name (e.g. "China")
    # City — available from GeoLite2-City DB
    city: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    # ASN — available from GeoLite2-ASN DB
    asn: Optional[int] = None
    as_name: Optional[str] = None   # e.g. "AS4134 Chinanet"
    # Network classification
    network_type: Optional[str] = None  # "ISP" | "Hosting" | "Business" | "Residential"
    is_datacenter: bool = False
    is_tor: bool = False
    # Meta
    raw_available: bool = True   # False when using mock data


class BulkLookupRequest(BaseModel):
    """Request body for POST /api/geoip/lookup/bulk."""

    ips: list[str] = Field(..., min_length=1, max_length=200, description="List of IPs to geolocate")


# ── Stats / aggregations ─────────────────────────────────────────────────────


class SourceCounts(BaseModel):
    """Breakdown of IP count by source system."""

    crowdsec: int = 0
    wazuh: int = 0
    mikrotik: int = 0


class TopCountryItem(BaseModel):
    """A country ranked by number of threat IPs."""

    country_code: str   # ISO 3166-1 alpha-2
    country_name: str
    count: int
    percentage: float   # 0-100
    sources: SourceCounts = Field(default_factory=SourceCounts)
    top_asns: list[str] = Field(default_factory=list)  # Top 3 AS names


class TopCountriesResponse(BaseModel):
    """Response for GET /api/geoip/stats/top-countries."""

    countries: list[TopCountryItem]
    total_ips: int
    source: str = "all"   # "all" | "crowdsec" | "wazuh" | "mikrotik"
    generated_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())


class TopASNItem(BaseModel):
    """An ASN ranked by number of threat IPs."""

    asn: int
    as_name: str
    country_code: str
    count: int
    is_datacenter: bool = False


class TopASNsResponse(BaseModel):
    """Response for GET /api/geoip/stats/top-asns."""

    asns: list[TopASNItem]
    total_ips: int
    generated_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())


# ── Geo-block suggestions ────────────────────────────────────────────────────


class SuggestionEvidence(BaseModel):
    """Evidence supporting a geo-block suggestion."""

    crowdsec_ips: list[str] = Field(default_factory=list)
    wazuh_alerts: int = 0
    affected_agents: list[str] = Field(default_factory=list)


class GeoBlockSuggestion(BaseModel):
    """An automatically generated suggestion to block a country or ASN."""

    id: str         # slug like "block-cn" or "block-as4134"
    type: str       # "country" | "asn"
    target: str     # country_code or ASN string ("AS4134")
    target_name: str
    reason: str
    evidence: SuggestionEvidence = Field(default_factory=SuggestionEvidence)
    risk_level: str = "medium"   # "high" | "medium"
    estimated_block_count: int = 0
    suggested_duration: str = "24h"


class ApplySuggestionRequest(BaseModel):
    """Request body for POST /api/geoip/suggestions/{id}/apply."""

    duration: str = "24h"
    # TODO (producción): resolver conversión country_code/ASN → rangos CIDR.
    # GeoLite2 no provee rangos CIDR por país directamente.
    # Opciones: ip2location-lite, delegated-apnic-latest, o tabla pre-calculada.
    # En modo mock devuelve respuesta exitosa simulada.


# ── DB status ────────────────────────────────────────────────────────────────


class GeoIPDBEntry(BaseModel):
    """Status of a single GeoLite2 .mmdb database file."""

    loaded: bool = False
    path: str = ""
    build_epoch: Optional[int] = None   # Unix timestamp de la build de la DB
    description: str = ""


class GeoIPDBStatus(BaseModel):
    """Response for GET /api/geoip/db/status."""

    city_db: GeoIPDBEntry = Field(default_factory=GeoIPDBEntry)
    asn_db: GeoIPDBEntry = Field(default_factory=GeoIPDBEntry)
    mock_mode: bool = True
    cache_size: int = 0   # Número de IPs en el TTLCache actualmente
    cache_ttl_seconds: int = 3600
