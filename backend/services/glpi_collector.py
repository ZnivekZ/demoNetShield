"""
GLPI Collector — periodic lightweight sync + on-demand full detail (HLAPI v3.0).

Design (rediseño escala — sin persistencia):
- LISTA liviana (cada COLLECT_INTERVAL, 5 min): por itemtype, GET /Assets/<T>
  paginado con start/limit. Mantiene `_raw_assets` en memoria con la forma
  "raw" que normaliza `GLPIService._normalize_computer` → el contrato de datos
  del grid no cambia.
- DETALLE completo bajo demanda: `ensure_detail(asset_id)` ensambla el activo
  base + sub-recursos (componentes, volúmenes, software, OS) SOLO la primera
  vez que se pide (o cuando el TTL venció o cambió `date_mod`) y lo cachea.
- Sin persistencia: al reiniciar el backend la lista arranca vacía.

Auth (OAuth2 password grant): POST {glpi_api_url}/token → Bearer token cacheado
en el colector y renovado antes de vencer (y ante un 401).

Resiliencia (se conserva): circuit breaker + executor dedicado (los requests
sync corren en un thread para no bloquear el event loop) + timeout por ciclo.
"""

from __future__ import annotations

import asyncio
import threading
import time
from datetime import datetime, timezone
from typing import Any

import requests
import structlog

from config import get_settings
from services.resilience import make_resilience

logger = structlog.get_logger(__name__)

# v3.0 asset collections (itemtype → path)
ASSET_PATHS: dict[str, str] = {
    "Computer": "/Assets/Computer",
    "NetworkEquipment": "/Assets/NetworkEquipment",
    "Peripheral": "/Assets/Peripheral",
    "Phone": "/Assets/Phone",
    "Printer": "/Assets/Printer",
}

# Component sub-resources fetched for the on-demand full detail
_COMPONENT_TYPES = (
    "Processor",
    "Memory",
    "HardDrive",
    "Drive",
    "NetworkCard",
    "GraphicCard",
    "SoundCard",
    "Controller",
    "Firmware",
)

# Intervalo entre ciclos de lista (segundos)
COLLECT_INTERVAL = 300  # 5 min
# Timeout duro de un ciclo completo de lista
COLLECT_TIMEOUT_SECONDS = 90.0
# Timeout del fetch de detalle individual
DETAIL_TIMEOUT_SECONDS = 30.0
# TTL del detalle cacheado en memoria
DETAIL_TTL_SECONDS = 1800  # 30 min
# Tamaño de página del GET de lista
_LIST_PAGE = 100


def _name(value: Any) -> str:
    """
    Extract a display name from a nested FK object or a scalar.
    Components expose `designation`, person FKs expose `username`.
    """
    if isinstance(value, dict):
        return (
            value.get("completename")
            or value.get("name")
            or value.get("designation")
            or value.get("username")
            or ""
        )
    return str(value) if isinstance(value, str) else ""


def _fk_id(value: Any) -> int | None:
    """Extract an id from a nested {id, name} object or a scalar."""
    if isinstance(value, dict):
        value = value.get("id")
    try:
        return int(value) if value not in (None, "") else None
    except (TypeError, ValueError):
        return None


class GlpiCollector:
    """
    Singleton service that keeps a lightweight in-memory mirror of the GLPI
    inventory (list columns) and fetches full asset detail on demand.
    """

    _instance: GlpiCollector | None = None

    def __new__(cls) -> GlpiCollector:
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def __init__(self) -> None:
        if self._initialized:
            return
        self._initialized = True
        self._settings = get_settings()
        # Per-service resilience: own executor (so a hung GLPI host can't
        # starve MikroTik/Wazuh workers), circuit breaker to skip cycles
        self._breaker, self._executor = make_resilience(
            "glpi",
            failure_threshold=3,
            cooldown_seconds=120.0,  # GLPI changes rarely; don't hammer a dead host
            max_workers=2,
        )
        self._task: asyncio.Task | None = None
        # OAuth2 token cache (sync context → threading.Lock)
        self._access_token: str | None = None
        self._token_expires_at: float = 0.0
        self._token_lock = threading.Lock()
        # Lista liviana (raws normalizables por GLPIService._normalize_computer)
        self._raw_assets: list[dict] = []
        # Índice (itemtype, glpi_id) → raw (los ids NO son únicos entre itemtypes)
        self._raw_by_id: dict[tuple[str, int], dict] = {}
        # Detalle completo on-demand: {(itemtype, asset_id): {...}}
        self._details_cache: dict[tuple[str, int], dict[str, Any]] = {}
        # softwareversion_id → (software_name, version_name) — caché para el detalle
        self._sw_map: dict[int, tuple[str, str]] = {}
        self._sw_map_at: float = 0.0
        self._last_sync: str | None = None

    # ── Auth + HTTP (sync, corren en el executor) ────────────────

    def _ensure_token_sync(self) -> str:
        """Return a valid Bearer token, requesting a new one when needed."""
        with self._token_lock:
            now = time.time()
            if self._access_token and now < self._token_expires_at:
                return self._access_token

            response = requests.post(
                self._settings.glpi_token_url,
                data={
                    "grant_type": "password",
                    "client_id": self._settings.glpi_client_id,
                    "client_secret": self._settings.glpi_client_secret,
                    "username": self._settings.glpi_username,
                    "password": self._settings.glpi_password,
                    "scope": "api",
                },
                headers={
                    "Content-Type": "application/x-www-form-urlencoded",
                    "Accept": "application/json",
                },
                timeout=15,
                verify=self._settings.glpi_verify_ssl,
            )
            response.raise_for_status()
            payload = response.json()
            token = payload.get("access_token")
            if not token:
                raise ValueError("No access_token from GLPI token endpoint")
            self._access_token = token
            expires_in = int(payload.get("expires_in", 3600) or 3600)
            # Renovar 60 s antes para evitar carreras
            self._token_expires_at = time.time() + max(60, expires_in - 60)
            return token

    def _request(self, path: str, params: dict | None = None) -> Any:
        """GET {glpi_api_base}{path} with Bearer auth (retry once on 401)."""
        url = f"{self._settings.glpi_api_base}{path}"
        token = self._ensure_token_sync()
        response = requests.get(
            url,
            headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
            params=params,
            timeout=30,
            verify=self._settings.glpi_verify_ssl,
        )
        if response.status_code == 401:
            with self._token_lock:
                self._access_token = None
            token = self._ensure_token_sync()
            response = requests.get(
                url,
                headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
                params=params,
                timeout=30,
                verify=self._settings.glpi_verify_ssl,
            )
        response.raise_for_status()
        return response.json() if response.content else []

    # ── Ciclo de LISTA liviana (sync) ─────────────────────────────

    def _collect_list_sync(self) -> list[dict]:
        """Lightweight list sync across itemtypes. Returns raw v3 items."""
        all_items: list[dict] = []
        for itemtype, path in ASSET_PATHS.items():
            start = 0
            while True:
                try:
                    data = self._request(path, params={"start": start, "limit": _LIST_PAGE})
                except Exception as e:
                    logger.warning(
                        "glpi_collector_list_page_failed",
                        itemtype=itemtype,
                        start=start,
                        error=str(e),
                    )
                    break
                items = data if isinstance(data, list) else []
                for it in items:
                    if isinstance(it, dict):
                        it["_itemtype"] = itemtype
                all_items.extend(items)
                if len(items) < _LIST_PAGE:
                    break
                start += _LIST_PAGE
        logger.info(
            "glpi_collector_list_complete",
            total=len(all_items),
            types=len(ASSET_PATHS),
        )
        return all_items

    # ── Detalle COMPLETO (sync, bajo demanda) ─────────────────────

    def _software_version_map(self) -> dict[int, tuple[str, str]]:
        """
        Build/cache softwareversion_id → (software_name, version_name).
        The HLAPI's SoftwareInstallation only carries the version, so we resolve
        the software name from /Assets/Software/{id}/Version (bounded + cached).
        """
        now = time.time()
        if self._sw_map and (now - self._sw_map_at) < DETAIL_TTL_SECONDS:
            return self._sw_map

        mapping: dict[int, tuple[str, str]] = {}
        try:
            software_items = self._request("/Assets/Software", params={"start": 0, "limit": 80})
            for sw in (software_items if isinstance(software_items, list) else [])[:80]:
                sw_id = sw.get("id")
                sw_name = sw.get("name", "") or ""
                if sw_id is None:
                    continue
                try:
                    versions = self._request(
                        f"/Assets/Software/{sw_id}/Version",
                        params={"start": 0, "limit": 200},
                    )
                except Exception:
                    continue
                for ver in versions if isinstance(versions, list) else []:
                    vid = ver.get("id")
                    if vid is not None:
                        mapping[vid] = (sw_name, ver.get("name", "") or "")
        except Exception as e:
            logger.warning("glpi_collector_software_map_failed", error=str(e))

        self._sw_map = mapping
        self._sw_map_at = now
        return mapping

    def _fetch_detail_sync(self, asset_id: int, itemtype: str) -> dict | None:
        """Fetch and parse the full detail of a single asset (base + sub-resources)."""
        path = ASSET_PATHS.get(itemtype, f"/Assets/{itemtype}")
        raw = self._request(f"{path}/{asset_id}")
        if not isinstance(raw, dict):
            logger.warning(
                "glpi_collector_detail_unexpected",
                asset_id=asset_id,
                type=type(raw).__name__,
            )
            return None

        extras: dict[str, Any] = {"components": {}, "volumes": [], "software": [], "os": None}

        for comp in _COMPONENT_TYPES:
            try:
                data = self._request(f"{path}/{asset_id}/Component/{comp}")
                extras["components"][comp] = data if isinstance(data, list) else []
            except Exception:
                extras["components"][comp] = []

        try:
            volumes = self._request(f"{path}/{asset_id}/Volume", params={"limit": 100})
            extras["volumes"] = volumes if isinstance(volumes, list) else []
        except Exception:
            extras["volumes"] = []

        try:
            sw = self._request(f"{path}/{asset_id}/SoftwareInstallation", params={"limit": 300})
            extras["software"] = sw if isinstance(sw, list) else []
        except Exception:
            extras["software"] = []

        try:
            os_items = self._request(f"/Assets/{itemtype}/{asset_id}/OSInstallation")
            extras["os"] = os_items[0] if isinstance(os_items, list) and os_items else None
        except Exception:
            extras["os"] = None

        return self._parse_full_detail(raw, extras)

    # ── Parsed detail helpers (HLAPI v3.0 shapes) ────────────────

    def _parse_full_detail(self, raw: dict, extras: dict[str, Any]) -> dict[str, Any]:
        """Transform a v3 asset + sub-resources into the structured full-detail."""
        os_install = extras.get("os") or {}
        identification = {
            "id": raw.get("id"),
            "name": raw.get("name", "") or "",
            "serial": raw.get("serial", "") or "",
            "otherserial": raw.get("otherserial", "") or "",
            "uuid": raw.get("uuid", "") or "",
            "entity": _name(raw.get("entity")),
            "type": _name(raw.get("type")),
            "model": _name(raw.get("model")),
            "manufacturer": _name(raw.get("manufacturer")),
            "comment": raw.get("comment", "") or "",
            "last_update": raw.get("date_mod", "") or "",
            "date_creation": raw.get("date_creation", "") or "",
            "last_inventory": raw.get("last_inventory_update", "") or "",
            "last_boot": raw.get("last_boot", "") or "",
            "os": _name(os_install.get("operatingsystem")),
            "os_version": _name(os_install.get("version")),
        }

        # ── Location ──────────────────────────────────────────
        loc = raw.get("location")
        location = {
            "location_id": _fk_id(loc),
            "location_name": _name(loc),
            "contact": raw.get("contact", "") or "",
            "contact_num": raw.get("contact_num", "") or "",
        }

        # ── Status ────────────────────────────────────────────
        status_obj = raw.get("status")
        status = {
            "state_id": _fk_id(status_obj),
            "state_name": _name(status_obj),
            "is_deleted": bool(raw.get("is_deleted", False)),
            "is_dynamic": bool(raw.get("is_dynamic", False)),
        }

        # ── Network ───────────────────────────────────────────
        # HLAPI v3.0 exposes no network ports; MAC comes from NetworkCard components.
        interfaces: list[dict] = []
        primary_mac = ""
        for nc in extras.get("components", {}).get("NetworkCard", []) or []:
            mac = nc.get("mac", "") or ""
            iface = {
                "name": _name(nc.get("networkcard")) or nc.get("name", "") or "",
                "mac": mac,
                "speed": nc.get("speed", 0) or 0,
                "type": "NetworkCard",
                "ips": [],
            }
            interfaces.append(iface)
            if not primary_mac and mac and mac != "00:00:00:00:00:00":
                primary_mac = mac
        network = {"interfaces": interfaces, "primary_ip": "", "primary_mac": primary_mac}

        # ── Hardware ──────────────────────────────────────────
        components = extras.get("components", {})
        hardware: dict[str, Any] = {
            "processors": [
                {
                    "name": _name(p.get("processor")),
                    "frequency": p.get("frequency", 0) or 0,
                    "cores": p.get("nbcores", 0) or 0,
                    "threads": p.get("nbthreads", 0) or 0,
                    "serial": p.get("serial", "") or "",
                }
                for p in components.get("Processor", []) or []
            ],
            "memory": [
                {
                    "name": _name(m.get("memory")),
                    "size_mb": m.get("size", 0) or 0,
                    "serial": m.get("serial", "") or "",
                }
                for m in components.get("Memory", []) or []
            ],
            "hard_drives": [
                {
                    "name": _name(d.get("harddrive")) or _name(d.get("drive")),
                    "capacity_mb": d.get("capacity", 0) or 0,
                    "serial": d.get("serial", "") or "",
                }
                for d in (components.get("HardDrive", []) or []) + (components.get("Drive", []) or [])
            ],
            "graphic_cards": [
                {
                    "name": _name(g.get("graphiccard")),
                    "memory_mb": g.get("memory", 0) or 0,
                }
                for g in components.get("GraphicCard", []) or []
            ],
            "sound_cards": [
                {"name": _name(s.get("soundcard"))}
                for s in components.get("SoundCard", []) or []
            ],
            "network_cards": [
                {"name": _name(n.get("networkcard")), "mac": n.get("mac", "") or ""}
                for n in components.get("NetworkCard", []) or []
            ],
            "controllers": [
                {"name": _name(c.get("controller"))}
                for c in components.get("Controller", []) or []
            ],
            "firmware": [
                {"name": _name(f.get("firmware")), "serial": f.get("serial", "") or ""}
                for f in components.get("Firmware", []) or []
            ],
        }

        # ── Disks (volumes) ───────────────────────────────────
        disks = [
            {
                "name": v.get("name", "") or "",
                "mountpoint": v.get("mount_point", "") or "",
                "device": v.get("device", "") or "",
                "filesystem": _name(v.get("filesystem")),
                "total_mb": v.get("total_size", 0) or 0,
                "free_mb": v.get("free_size", 0) or 0,
                "encrypted": bool(v.get("encryption_status", 0)),
            }
            for v in extras.get("volumes", []) or []
        ]

        # ── Software (resolve names via the cached version map) ──
        installs = extras.get("software", []) or []
        sw_map = self._software_version_map() if installs else {}
        software = []
        for inst in installs:
            version_obj = inst.get("softwareversion") or {}
            vid = _fk_id(version_obj)
            sw_name, ver_name = sw_map.get(vid, ("", _name(version_obj)))
            software.append({
                "name": sw_name or ver_name,
                "version": ver_name if sw_name else "",
                "category": "",
                "is_valid": True,
            })

        return {
            "identification": identification,
            "location": location,
            "status": status,
            "network": network,
            "hardware": hardware,
            "disks": disks,
            "software": software,
            # Not exposed by the HLAPI v3.0
            "audit": [],
            "tickets": [],
            "relationships": [],
        }

    # ── Public API ────────────────────────────────────────────────

    def get_cached_assets(self) -> list[dict]:
        """Return the lightweight raw assets from the last list sync."""
        return self._raw_assets

    def get_assets_count(self) -> int:
        """Number of assets in the current list mirror."""
        return len(self._raw_assets)

    def get_last_sync(self) -> str | None:
        """ISO timestamp of the last successful list sync."""
        return self._last_sync

    def get_full_detail(self, asset_id: int, itemtype: str | None = None) -> dict | None:
        """Sync accessor: return cached detail only if already fetched (no I/O)."""
        key = (itemtype or self.get_itemtype(asset_id) or "Computer", int(asset_id))
        entry = self._details_cache.get(key)
        return entry["detail"] if entry else None

    def get_itemtype(self, asset_id: int) -> str | None:
        """
        Itemtype of an asset as seen in the current list mirror.
        IDs collide across itemtypes (Computer#1 vs Printer#1), so prefer
        "Computer" and otherwise return the first match deterministically.
        """
        asset_id = int(asset_id)
        raw = self._raw_by_id.get(("Computer", asset_id))
        if raw:
            return "Computer"
        for (itemtype, aid), candidate in self._raw_by_id.items():
            if aid == asset_id:
                return candidate.get("_itemtype") or itemtype
        return None

    async def ensure_detail(self, asset_id: int, itemtype: str | None = None) -> dict | None:
        """
        Return the full parsed detail for an asset, fetching from GLPI on first
        access (or when stale: TTL expired or `date_mod` changed in the mirror).
        The itemtype defaults to the one recorded in the list mirror.
        Never raises — returns None if the fetch fails.
        """
        asset_id = int(asset_id)
        itemtype = itemtype or self.get_itemtype(asset_id) or "Computer"
        cache_key = (itemtype, asset_id)
        entry = self._details_cache.get(cache_key)
        now = time.time()

        if entry and (now - entry["fetched_at"]) < DETAIL_TTL_SECONDS:
            mirror = self._raw_by_id.get(cache_key)
            if mirror is None or mirror.get("date_mod") == entry.get("date_mod"):
                return entry["detail"]

        if self._breaker.is_open():
            logger.debug(
                "glpi_detail_circuit_open_skip",
                asset_id=asset_id,
                seconds_until_retry=round(self._breaker.seconds_until_retry, 1),
            )
            return entry["detail"] if entry else None

        try:
            raw = await asyncio.wait_for(
                self._executor.run(self._fetch_detail_sync, asset_id, itemtype),
                timeout=DETAIL_TIMEOUT_SECONDS,
            )
        except asyncio.TimeoutError:
            self._breaker.record_failure()
            logger.warning("glpi_detail_fetch_timeout", asset_id=asset_id)
            return entry["detail"] if entry else None
        except Exception as e:
            self._breaker.record_failure()
            logger.warning("glpi_detail_fetch_failed", asset_id=asset_id, error=str(e))
            return entry["detail"] if entry else None

        if raw is None:
            return None
        self._breaker.record_success()
        self._details_cache[cache_key] = {
            "detail": raw,
            "fetched_at": now,
            "date_mod": self._raw_by_id.get(cache_key, {}).get("date_mod"),
        }
        logger.debug("glpi_detail_cached", asset_id=asset_id)
        return raw

    # ── Background task lifecycle ─────────────────────────────────

    async def start(self) -> None:
        """Start the periodic lightweight list sync."""
        if not self._settings.glpi_configured:
            logger.warning(
                "glpi_collector_skipped",
                reason="GLPI OAuth2 credentials not configured (GLPI_CLIENT_ID/SECRET/USERNAME/PASSWORD)",
            )
            return

        self._task = asyncio.create_task(self._loop())
        logger.info("glpi_collector_started", interval_s=COLLECT_INTERVAL)

    async def stop(self) -> None:
        """Stop the background task."""
        if self._task and not self._task.done():
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        logger.info("glpi_collector_stopped")

    async def collect_now(self) -> int:
        """Run a list-sync cycle immediately. Returns asset count. Never raises."""
        if self._breaker.is_open():
            logger.debug(
                "glpi_collector_circuit_open_skip",
                seconds_until_retry=round(self._breaker.seconds_until_retry, 1),
            )
            return 0
        if not self._breaker.allow_request():
            return 0
        try:
            raw_assets = await asyncio.wait_for(
                self._executor.run(self._collect_list_sync),
                timeout=COLLECT_TIMEOUT_SECONDS,
            )
            self._raw_assets = raw_assets
            self._raw_by_id = {
                (a.get("_itemtype") or "Computer", int(a["id"])): a
                for a in raw_assets
                if isinstance(a, dict) and a.get("id") is not None
            }
            # Evictar detalles de activos que ya no están en el mirror
            self._details_cache = {
                k: v for k, v in self._details_cache.items() if k in self._raw_by_id
            }
            self._last_sync = datetime.now(timezone.utc).isoformat()
            self._breaker.record_success()
            logger.info(
                "glpi_collector_sync_complete",
                assets=len(raw_assets),
                timestamp=self._last_sync,
            )
            return len(raw_assets)
        except asyncio.TimeoutError:
            self._breaker.record_failure()
            logger.warning(
                "glpi_collector_sync_timeout",
                timeout_s=COLLECT_TIMEOUT_SECONDS,
                hint="GLPI host unreachable or stuck; circuit breaker will skip further attempts",
            )
            return 0
        except Exception as e:
            self._breaker.record_failure()
            logger.error("glpi_collector_sync_failed", error=str(e))
            return 0

    async def _loop(self) -> None:
        """Background loop: sync the lightweight list every COLLECT_INTERVAL."""
        await self.collect_now()
        while True:
            await asyncio.sleep(COLLECT_INTERVAL)
            await self.collect_now()


# ── Singleton accessor ────────────────────────────────────────────

_collector: GlpiCollector | None = None


def get_glpi_collector() -> GlpiCollector:
    """Get the GlpiCollector singleton."""
    global _collector
    if _collector is None:
        _collector = GlpiCollector()
    return _collector
