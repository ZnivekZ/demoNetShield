"""
glpi_legacy — cliente de la API legacy de GLPI (session-token).

Por qué existe
--------------
La HLAPI v3.0 **no expone** `NetworkPort` ni `IPAddress` (0 rutas en su spec),
así que la IP de un activo —la que se ve en la pestaña "Red" del equipo— sólo
se puede leer por la API clásica, publicada en `/api.php/v1` (antes
`apirest.php`).

Autenticación
-------------
App-Token (cliente API) + user_token (usuario) → `initSession` → session_token.
El login con usuario/contraseña está deshabilitado por GLPI
(`ERROR_LOGIN_WITH_CREDENTIALS_DISABLED`), por eso hace falta el user_token.

Flujo para obtener la IP
------------------------
    GET /NetworkPort   → [{id, itemtype: 'Computer', items_id: 1, mac, …}]
    GET /IPAddress     → [{name: '192.168.0.4', itemtype: 'NetworkPort', items_id: 7}]
    ⇒ mapa (itemtype, items_id) → IP

Sin `GLPI_USER_TOKEN` configurado el cliente devuelve un mapa vacío sin hacer
requests: los endpoints siguen funcionando y la UI muestra "—".
"""

from __future__ import annotations

import asyncio
import ipaddress
import json
import time
from typing import Any

import structlog

from config import get_settings

logger = structlog.get_logger(__name__)

_CACHE_TTL = 60.0
_SESSION_TTL = 1500.0  # GLPI cierra sesiones ociosas ~1 h; renovamos antes
_PAGE = 1000

_ip_map: dict[str, str] = {}
_ip_map_at: float = 0.0
_map_lock = asyncio.Lock()

_session: str = ""
_session_at: float = 0.0
_session_lock = asyncio.Lock()


class GlpiLegacyError(RuntimeError):
    """Error de la API legacy (auth, sesión o HTTP)."""


def _client_headers(extra: dict[str, str] | None = None) -> dict[str, str]:
    headers = {"App-Token": get_settings().glpi_app_token}
    if extra:
        headers.update(extra)
    return headers


async def _open_session(force: bool = False) -> str:
    """initSession con user_token (cacheado)."""
    global _session, _session_at

    settings = get_settings()
    if not (settings.glpi_app_token and settings.glpi_user_token):
        return ""

    async with _session_lock:
        if _session and not force and (time.time() - _session_at) < _SESSION_TTL:
            return _session

        import httpx

        url = f"{settings.glpi_legacy_base}/initSession"
        headers = _client_headers({"Authorization": f"user_token {settings.glpi_user_token}"})
        async with httpx.AsyncClient(timeout=20, verify=settings.glpi_verify_ssl) as client:
            resp = await client.get(url, headers=headers)
        if resp.status_code != 200:
            raise GlpiLegacyError(f"initSession {resp.status_code}: {resp.text[:120]}")
        token = (resp.json() or {}).get("session_token", "")
        if not token:
            raise GlpiLegacyError("initSession sin session_token")
        _session, _session_at = token, time.time()
        return _session


def _iter_pages(items: list[dict], content_range: str) -> bool:
    """Devuelve True si hay más páginas (Content-Range: start-end/total)."""
    try:
        _, total = content_range.split("/")
        end = int(content_range.split("-")[1].split("/")[0])
        return end + 1 < int(total)
    except Exception:  # noqa: BLE001
        return False


async def _fetch_all(resource: str) -> list[dict]:
    """GET paginado sobre un recurso legacy (NetworkPort, IPAddress…)."""
    import httpx

    settings = get_settings()
    session = await _open_session()
    if not session:
        return []

    collected: list[dict] = []
    start = 0
    async with httpx.AsyncClient(timeout=30, verify=settings.glpi_verify_ssl) as client:
        for _ in range(20):  # tope de seguridad: 20 * 1000 registros
            headers = _client_headers({"Session-Token": session})
            resp = await client.get(
                f"{settings.glpi_legacy_base}/{resource}",
                headers=headers,
                params={"range": f"{start}-{start + _PAGE - 1}"},
            )
            if resp.status_code == 401 or "ERROR_SESSION_TOKEN" in resp.text[:200]:
                # Sesión vencida → renovar una vez y reintentar
                session = await _open_session(force=True)
                headers = _client_headers({"Session-Token": session})
                resp = await client.get(
                    f"{settings.glpi_legacy_base}/{resource}",
                    headers=headers,
                    params={"range": f"{start}-{start + _PAGE - 1}"},
                )
            if resp.status_code != 200:
                raise GlpiLegacyError(f"{resource} {resp.status_code}: {resp.text[:120]}")

            data = resp.json() or []
            if not isinstance(data, list):
                break
            collected.extend(data)
            if not _iter_pages(data, resp.headers.get("Content-Range", "")):
                break
            start += _PAGE

    return collected


def _usable_ip(value: str) -> bool:
    """IPv4 válida y distinta de loopback / link-local / 0.0.0.0."""
    try:
        ip = ipaddress.ip_address((value or "").strip())
    except ValueError:
        return False
    return ip.version == 4 and not (ip.is_loopback or ip.is_link_local or ip.is_unspecified)


async def build_ip_map() -> dict[str, str]:
    """
    Mapa `"<itemtype>:<items_id>" → IP`.

    En GLPI la IP cuelga de una cadena de 3 niveles:

        IPAddress → NetworkName → NetworkPort → (Computer/Printer/…)

    Se resuelve con 3 requests (sin N+1).
    """
    ports = await _fetch_all("NetworkPort")
    names = await _fetch_all("NetworkName")
    addresses = await _fetch_all("IPAddress")

    # NetworkName → NetworkPort
    name_port: dict[int, int] = {}
    for name in names:
        if (name.get("itemtype") or "") != "NetworkPort":
            continue
        name_id, port_id = name.get("id"), name.get("items_id")
        if isinstance(name_id, int) and isinstance(port_id, int):
            name_port.setdefault(name_id, port_id)

    # IPAddress → NetworkPort (vía NetworkName), IPv4 usable únicamente
    port_ip: dict[int, str] = {}
    for addr in addresses:
        value = (addr.get("name") or "").strip()
        if not _usable_ip(value):
            continue
        link_type, link_id = addr.get("itemtype") or "", addr.get("items_id")
        if not isinstance(link_id, int):
            continue
        if link_type == "NetworkName":
            port_id = name_port.get(link_id)
        elif link_type == "NetworkPort":
            port_id = link_id  # datos antiguos, sin NetworkName
        else:
            continue
        if port_id is not None:
            port_ip.setdefault(port_id, value)

    mapping: dict[str, str] = {}
    for port in ports:
        ip = port_ip.get(port.get("id"))  # type: ignore[arg-type]
        if not ip:
            continue
        itemtype, items_id = (port.get("itemtype") or "").strip(), port.get("items_id")
        if itemtype and isinstance(items_id, int):
            mapping.setdefault(f"{itemtype}:{items_id}", ip)
    return mapping


async def get_asset_ip_map(force: bool = False) -> dict[str, str]:
    """Mapa cacheado (60 s). Nunca lanza: ante cualquier error devuelve {}."""
    global _ip_map, _ip_map_at

    async with _map_lock:
        if not force and _ip_map and (time.time() - _ip_map_at) < _CACHE_TTL:
            return _ip_map

        try:
            mapping = await asyncio.wait_for(build_ip_map(), timeout=12.0)
        except Exception as e:  # noqa: BLE001 - nunca debe romper la vista
            logger.debug("glpi_legacy_ip_map_failed", error=str(e))
            mapping = {}

        _ip_map, _ip_map_at = mapping, time.time()
        if mapping:
            logger.debug("glpi_legacy_ip_map_built", assets=len(mapping))
        return _ip_map


async def upload_document(filename: str, content: bytes, mime: str) -> int:
    """
    Sube un archivo por multipart (v1) y devuelve el id del `Document`.

    La v3.0 no acepta bytes (espera `filepath` del lado del servidor GLPI),
    por eso los adjuntos van por la API legacy.
    """
    import httpx

    settings = get_settings()
    session = await _open_session()
    if not session:
        raise GlpiLegacyError("sin sesión legacy (GLPI_APP_TOKEN / GLPI_USER_TOKEN)")

    manifest = {"input": {"name": filename, "_filename": [filename]}}
    async with httpx.AsyncClient(timeout=60, verify=settings.glpi_verify_ssl) as client:
        resp = await client.post(
            f"{settings.glpi_legacy_base}/Document",
            headers=_client_headers({"Session-Token": session}),
            data={"uploadManifest": json.dumps(manifest)},
            files={"filename[0]": (filename, content, mime)},
        )
    if resp.status_code not in (200, 201):
        raise GlpiLegacyError(f"upload Document {resp.status_code}: {resp.text[:120]}")
    doc_id = (resp.json() or {}).get("id")
    if not doc_id:
        raise GlpiLegacyError("upload Document sin id")
    return int(doc_id)


async def link_document_to_ticket(document_id: int, ticket_id: int) -> None:
    """
    Vincula un documento a un ticket.

    El vínculo vive en `glpi_documents_items`, por eso se crea con
    `POST /Document_Item` (el `PUT /Document/{id}` no lo arma).
    """
    import httpx

    settings = get_settings()
    session = await _open_session()
    if not session:
        raise GlpiLegacyError("sin sesión legacy (GLPI_APP_TOKEN / GLPI_USER_TOKEN)")

    async with httpx.AsyncClient(timeout=30, verify=settings.glpi_verify_ssl) as client:
        resp = await client.post(
            f"{settings.glpi_legacy_base}/Document_Item",
            headers=_client_headers({"Session-Token": session}),
            json={"input": {"documents_id": document_id, "itemtype": "Ticket", "items_id": ticket_id}},
        )
    if resp.status_code not in (200, 201):
        raise GlpiLegacyError(f"link Document_Item {resp.status_code}: {resp.text[:120]}")


def resolve_ip(itemtype: str | None, asset_id: Any, ip_map: dict[str, str] | None = None) -> str:
    """IP de un activo dentro del mapa ("" si no está)."""
    mapping = _ip_map if ip_map is None else ip_map
    if not itemtype or asset_id is None:
        return ""
    return mapping.get(f"{itemtype}:{asset_id}", "")
