"""
Lista de bloqueo de IPs — revisión humana antes de tocar el firewall.

Flujo:
  1. Cualquier acción "bloquear" (alertas, phishing, firewall) **sólo agrega**
     la IP a esta lista; no se escribe nada en MikroTik.
  2. Se revisa/edita a mano en la UI (agregar, borrar, habilitar).
  3. Push manual (o el scheduler, si hay intervalo configurado).

Export para la LAN (sin autenticación, para que el router o un script hagan
pull): `GET /blocklist.txt` y `GET /blocklist.json`.
"""

from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel, Field

from schemas.common import APIResponse
from services import blocklist_store
from services.blocklist_push import push_blocklist

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/api/blocklist", tags=["Lista de bloqueo"])
# Export público: sin prefijo /api (queda en la raíz, exento de JWT).
export_router = APIRouter(tags=["Lista de bloqueo (export LAN)"])


class EntryIn(BaseModel):
    ip: str = Field(..., max_length=64)
    comment: str = Field(default="", max_length=200)
    duration: str = Field(default="", max_length=16)  # 30m | 24h | 7d | "" = permanente


class EntryPatch(BaseModel):
    enabled: bool | None = None
    duration: str | None = Field(default=None, max_length=16)
    comment: str | None = Field(default=None, max_length=200)


class SettingsIn(BaseModel):
    push_interval_minutes: int | None = Field(default=None, ge=0, le=43200)
    list_name: str | None = Field(default=None, max_length=64)
    remove_missing: bool | None = None
    api_write_enabled: bool | None = None


# ── Export LAN (sin auth) ─────────────────────────────────────────


@export_router.get("/blocklist.txt", include_in_schema=False)
async def export_txt() -> Response:
    """Una IP por línea: `ip,comentario`. Formato para RouterOS."""
    return Response(
        content=blocklist_store.export_txt(),
        media_type="text/plain; charset=utf-8",
        headers={"Cache-Control": "no-store"},
    )


@export_router.get("/blocklist.json", include_in_schema=False)
async def export_json() -> Response:
    """Mismo contenido que el archivo local (entradas habilitadas + settings)."""
    data = blocklist_store.snapshot()
    return Response(
        content=__import__("json").dumps(
            {
                "version": data.get("version", 1),
                "updated_at": data.get("updated_at"),
                "settings": {k: v for k, v in data["settings"].items()},
                "entries": [e for e in data["entries"] if e.get("enabled", True)],
            },
            indent=2,
            ensure_ascii=False,
        ),
        media_type="application/json",
        headers={"Cache-Control": "no-store"},
    )


# ── CRUD + push (requieren JWT) ───────────────────────────────────


@router.get("/capabilities")
async def get_capabilities() -> APIResponse:
    """¿La API puede escribir en el router? Define push directo vs. archivo."""
    enabled = blocklist_store.api_write_enabled()
    return APIResponse.ok(
        {
            "api_write_enabled": enabled,
            "mode": "push" if enabled else "file",
            "export_urls": {"txt": "/blocklist.txt", "json": "/blocklist.json"},
        }
    )


@router.post("/prune")
async def prune_now() -> APIResponse:
    """Borra las entradas vencidas del archivo (también corre en el scheduler)."""
    removed = blocklist_store.prune()
    logger.info("blocklist_pruned", removed=removed)
    return APIResponse.ok({"removed": removed, "remaining": len(blocklist_store.entries())})


@router.get("")
async def get_blocklist() -> APIResponse:
    data = blocklist_store.snapshot()
    return APIResponse.ok(
        {
            "entries": data["entries"],
            "settings": data["settings"],
            "last_push": data.get("last_push"),
            "count": data["count"],
            "active": data["active"],
            "path": data["path"],
            "export_urls": {"txt": "/blocklist.txt", "json": "/blocklist.json"},
            "api_write_enabled": blocklist_store.api_write_enabled(),
            "retention_hours": blocklist_store.retention_hours(),
        }
    )


@router.post("")
async def add_entry(payload: EntryIn) -> APIResponse:
    try:
        entry = blocklist_store.add(
            payload.ip, payload.comment, source="manual", duration=payload.duration
        )
    except ValueError as e:
        return APIResponse.fail(str(e))
    logger.info("blocklist_entry_added", ip=entry["ip"], source="manual")
    return APIResponse.ok(entry)


@router.post("/push")
async def push_now() -> APIResponse:
    result = await push_blocklist()
    return APIResponse.ok(result) if result.get("ok") else APIResponse.fail(result.get("error", "Error"))


@router.put("/settings")
async def update_settings(payload: SettingsIn) -> APIResponse:
    cfg = blocklist_store.update_settings(
        push_interval_minutes=payload.push_interval_minutes,
        list_name=payload.list_name,
        remove_missing=payload.remove_missing,
        api_write_enabled=payload.api_write_enabled,
    )
    logger.info("blocklist_settings_updated", **cfg)
    return APIResponse.ok(cfg)


@router.patch("/{ip:path}")
async def patch_entry(ip: str, payload: EntryPatch) -> APIResponse:
    try:
        entry = blocklist_store.update_entry(
            ip, enabled=payload.enabled, duration=payload.duration, comment=payload.comment
        )
    except ValueError as e:
        return APIResponse.fail(str(e))
    return APIResponse.ok(entry) if entry else APIResponse.fail("IP no encontrada")


@router.delete("/{ip:path}")
async def delete_entry(ip: str) -> APIResponse:
    try:
        ok = blocklist_store.remove(ip)
    except ValueError as e:
        return APIResponse.fail(str(e))
    if not ok:
        return APIResponse.fail("IP no encontrada")
    logger.info("blocklist_entry_removed", ip=ip)
    return APIResponse.ok({"ip": ip, "removed": True})
