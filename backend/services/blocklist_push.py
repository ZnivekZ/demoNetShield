"""
Push de la blocklist hacia MikroTik — la ÚNICA escritura permitida al router.

Sólo funciona si la cuenta de API **tiene permisos de escritura**
(`MIKROTIK_API_WRITE_ENABLED=true`). Si no los tiene, no se intenta nada: el
archivo `/blocklist.txt` (expuesto en la red interna) es la vía alternativa
para que el propio MikroTik o un script externo apliquen los bloqueos.

Se usa desde:
  • `POST /api/blocklist/push`  → manual, después de revisión humana.
  • scheduler de `main.py`      → cada N minutos, si se configuró intervalo.
"""

from __future__ import annotations

import structlog

from services import blocklist_store
from services.mikrotik_service import get_mikrotik_service

logger = structlog.get_logger(__name__)

_NO_WRITE_MSG = (
    "La cuenta de API no tiene permisos de escritura en el router. "
    "Los bloqueos quedan disponibles en /blocklist.txt para que el MikroTik "
    "o un script externo los aplique."
)


async def push_blocklist() -> dict:
    """Sincroniza la address-list del router con la lista local."""
    if not blocklist_store.api_write_enabled():
        logger.info("blocklist_push_skipped_no_write_permission")
        return {
            "ok": False,
            "error": _NO_WRITE_MSG,
            "needs_file": True,
            "added": 0,
            "removed": 0,
            "total": len(blocklist_store.entries(only_enabled=True)),
        }

    cfg = blocklist_store.settings()
    enabled = blocklist_store.entries(only_enabled=True)
    ips = [
        (
            e["ip"],
            e.get("comment") or e.get("source") or "NetShield",
            blocklist_store.normalize_duration(e.get("duration")),
        )
        for e in enabled
    ]

    if not ips:
        blocklist_store.mark_pushed(0, 0, 0, error="lista vacía")
        return {"ok": False, "error": "La lista está vacía", "added": 0, "removed": 0, "total": 0}

    try:
        mt = get_mikrotik_service()
        result = await mt.sync_blocklist(ips, cfg["list_name"], cfg["remove_missing"])
        blocklist_store.mark_pushed(result["added"], result["removed"], result["total"])
        logger.info("blocklist_pushed", **result, list=cfg["list_name"])
        return {"ok": True, **result, "list": cfg["list_name"]}
    except Exception as e:  # noqa: BLE001
        blocklist_store.mark_pushed(0, 0, len(ips), error=str(e)[:200])
        logger.error("blocklist_push_failed", error=str(e)[:200])
        return {"ok": False, "error": str(e)[:200], "added": 0, "removed": 0, "total": len(ips)}
