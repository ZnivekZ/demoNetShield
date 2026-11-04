"""Paginated read-only view of the current RouterOS connection table."""

from __future__ import annotations

import asyncio
import socket
from functools import lru_cache

import structlog
from fastapi import APIRouter, Query

from schemas.common import APIResponse
from services.network_activity import service

logger = structlog.get_logger(__name__)
router = APIRouter(prefix="/api/network-activity", tags=["Network activity"])


def _page(rows: list[dict], ip: str, offset: int, limit: int) -> dict:
    filtered = [row for row in rows if ip in row["ip"]] if ip else rows
    return {"items": filtered[offset:offset + limit], "total": len(filtered),
            "offset": offset, "limit": limit}


@router.get("/participants")
async def participants(
    ip: str = Query(default="", max_length=45),
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=10, ge=1, le=100),
) -> APIResponse:
    try:
        snapshot = await service.snapshot()
        return APIResponse.ok({
            **_page(snapshot["participants"], ip.strip(), offset, limit),
            "observed_at": snapshot["observed_at"], "cidr": snapshot["cidr"],
            "connection_count": snapshot["connection_count"],
            "total_attributed_bytes": snapshot["total_attributed_bytes"],
            "glpi_ip_available": snapshot["glpi_ip_available"],
            "sources": snapshot["sources"],
        })
    except Exception as exc:
        logger.error("network_activity_participants_failed", error=str(exc))
        return APIResponse.fail(f"No se pudo consultar la actividad: {exc}")


@router.get("/accesses")
async def accesses(
    direction: str = Query(default="outbound", pattern="^(outbound|inbound|internal)$"),
    ip: str = Query(default="", max_length=45),
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=10, ge=1, le=100),
) -> APIResponse:
    try:
        snapshot = await service.snapshot()
        rows = snapshot["accesses"][direction]
        if ip.strip():
            query = ip.strip()
            rows = [r for r in rows if any(query in str(r[key]) for key in
                    ("source_ip", "destination_ip", "target_ip"))]
        return APIResponse.ok({
            "items": rows[offset:offset + limit], "total": len(rows),
            "offset": offset, "limit": limit,
            "observed_at": snapshot["observed_at"], "cidr": snapshot["cidr"],
            "direction": direction,
            "sources": snapshot["sources"],
        })
    except Exception as exc:
        logger.error("network_activity_accesses_failed", error=str(exc))
        return APIResponse.fail(f"No se pudieron consultar los accesos: {exc}")


@lru_cache(maxsize=512)
def _reverse_dns(ip: str) -> str:
    try:
        return socket.gethostbyaddr(ip)[0].rstrip(".")
    except (OSError, socket.herror):
        return ""


@router.get("/reverse-dns")
async def reverse_dns(ip: str = Query(..., max_length=45)) -> APIResponse:
    from ipaddress import ip_address
    try:
        address = ip_address(ip)
        if not address.is_global:
            return APIResponse.fail("La búsqueda inversa solo se ofrece para IPs públicas")
    except ValueError:
        return APIResponse.fail("IP inválida")
    try:
        name = await asyncio.wait_for(asyncio.to_thread(_reverse_dns, ip), timeout=2.0)
    except asyncio.TimeoutError:
        name = ""
    return APIResponse.ok({"ip": ip, "name": name or None,
                           "note": "PTR orientativo; no identifica la web visitada ni al cliente que consultó DNS."})
