"""
GLPI Collector — periodic lightweight sync + on-demand full detail.

Design (rediseño escala — sin persistencia):
- LISTA liviana (cada COLLECT_INTERVAL, 5 min): por itemtype, GET /<T> paginado
  con `expand_dropdowns` + `with_networkports` (campos base + IP/MAC, ~1-3 KB por
  activo). Mantiene `_raw_assets` en memoria con la MISMA forma de "raw" que
  consumía antes `GLPIService` (que normaliza con `_normalize_computer`) → el
  contrato de datos del grid no cambia y `glpi_service.get_computers` no se toca.
- DETALLE completo bajo demanda: `ensure_detail(asset_id)` fetchea
  GET /<T>/{id} con todos los `with_*` SOLO la primera vez que se pide (o cuando
  el TTL venció o el `date_mod` del activo cambió en la lista) y lo cachea en
  memoria. El ciclo periódico NUNCA mueve el payload pesado.
- Sin persistencia: al reiniciar el backend la lista arranca vacía y el primer
  ciclo la repuebla (no hay JSON que leer/escribir).

Resiliencia (se conserva): circuit breaker + executor dedicado (los requests
sync corren en thread para no bloquear el event loop) + timeout duro por ciclo.
"""

from __future__ import annotations

import asyncio
import time
from datetime import datetime, timezone
from typing import Any

import requests
import structlog

from config import get_settings
from services.resilience import make_resilience

logger = structlog.get_logger(__name__)

ITEM_TYPES = ["Computer", "NetworkEquipment", "Peripheral", "Phone", "Printer"]

# Params del fetch de DETALLE completo (solo on-demand)
DETAIL_PARAMS = {
    "expand_dropdowns": "true",
    "with_devices": "true",
    "with_disks": "true",
    "with_softwares": "true",
    "with_connections": "true",
    "with_networkports": "true",
    "with_infocoms": "true",
    "with_contracts": "true",
    "with_documents": "true",
    "with_tickets": "true",
    "with_problems": "true",
    "with_changes": "true",
    "with_notes": "true",
    "with_logs": "true",
}

# Lista liviana: campos base + dropdowns expandidos + networkports (IP/MAC).
# Sin with_devices/softwares/tickets/logs → payload de 1-3 KB por activo.
LIST_PARAMS = {
    "expand_dropdowns": "true",
    "with_networkports": "true",
}

# Intervalo entre ciclos de lista (segundos)
COLLECT_INTERVAL = 300  # 5 min
# Timeout duro de un ciclo completo de lista (muchos requests paginados)
COLLECT_TIMEOUT_SECONDS = 90.0
# Timeout del fetch de detalle individual
DETAIL_TIMEOUT_SECONDS = 30.0
# TTL del detalle cacheado en memoria
DETAIL_TTL_SECONDS = 1800  # 30 min
# Tamaño de página del GET de lista
_LIST_PAGE = 100


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
        # when the GLPI server has been failing, and a hard timeout per cycle.
        self._breaker, self._executor = make_resilience(
            name="glpi",
            failure_threshold=3,
            cooldown_seconds=120.0,  # GLPI changes rarely; don't hammer a dead host
            max_workers=2,
        )
        self._task: asyncio.Task | None = None
        # Lista liviana (raws normalizables por GLPIService._normalize_computer)
        self._raw_assets: list[dict] = []
        # Índice glpi_id → raw (para date_mod/name en refresco de detalle)
        self._raw_by_id: dict[int, dict] = {}
        # Detalle completo on-demand: {asset_id: {"detail", "fetched_at", "date_mod"}}
        self._details_cache: dict[int, dict[str, Any]] = {}
        self._last_sync: str | None = None

    # ── Session helpers (sync, corren en el executor) ─────────────

    def _get_headers(self) -> dict[str, str]:
        return {
            "Content-Type": "application/json",
            "App-Token": self._settings.glpi_app_token,
        }

    def _init_session_sync(self) -> str:
        """Initialize GLPI session (synchronous — called via to_thread)."""
        headers = self._get_headers()
        headers["Authorization"] = f"user_token {self._settings.glpi_user_token}"
        response = requests.get(
            f"{self._settings.glpi_base_url}/initSession",
            headers=headers,
            timeout=15,
        )
        response.raise_for_status()
        token = response.json().get("session_token")
        if not token:
            raise ValueError("No session_token from GLPI")
        return token

    def _kill_session_sync(self, session_token: str) -> None:
        headers = self._get_headers()
        headers["Session-Token"] = session_token
        try:
            requests.get(
                f"{self._settings.glpi_base_url}/killSession",
                headers=headers,
                timeout=10,
            )
        except Exception as e:
            logger.warning("glpi_collector_kill_session_failed", error=str(e))

    def _request(self, session_token: str, path: str, params: dict | None = None) -> Any:
        headers = self._get_headers()
        headers["Session-Token"] = session_token
        response = requests.get(
            f"{self._settings.glpi_base_url}{path}",
            headers=headers,
            params=params,
            timeout=30,
        )
        response.raise_for_status()
        return response.json()

    # ── Ciclo de LISTA liviana (sync) ─────────────────────────────

    def _collect_list_sync(self) -> list[dict]:
        """Lightweight list sync across itemtypes. Returns raw items."""
        session_token = self._init_session_sync()
        try:
            all_items: list[dict] = []
            for itemtype in ITEM_TYPES:
                start = 0
                while True:
                    params = dict(LIST_PARAMS)
                    params["range"] = f"{start}-{start + _LIST_PAGE - 1}"
                    try:
                        data = self._request(
                            session_token, f"/{itemtype}", params=params
                        )
                    except Exception as e:
                        logger.warning(
                            "glpi_collector_list_page_failed",
                            itemtype=itemtype,
                            start=start,
                            error=str(e),
                        )
                        break
                    items = data if isinstance(data, list) else []
                    all_items.extend(items)
                    if len(items) < _LIST_PAGE:
                        break
                    start += _LIST_PAGE
            logger.info(
                "glpi_collector_list_complete",
                total=len(all_items),
                types=len(ITEM_TYPES),
            )
            return all_items
        finally:
            self._kill_session_sync(session_token)

    # ── Detalle COMPLETO (sync, bajo demanda) ─────────────────────

    def _fetch_detail_sync(self, asset_id: int, itemtype: str) -> dict | None:
        """Fetch and parse the full detail of a single asset."""
        session_token = self._init_session_sync()
        try:
            data = self._request(
                session_token,
                f"/{itemtype}/{asset_id}",
                params=dict(DETAIL_PARAMS),
            )
            if not isinstance(data, dict):
                logger.warning(
                    "glpi_collector_detail_unexpected",
                    asset_id=asset_id,
                    type=type(data).__name__,
                )
                return None
            return self._parse_full_detail(data)
        finally:
            self._kill_session_sync(session_token)

    # ── Parsed detail helpers ─────────────────────────────────────

    def _parse_full_detail(self, raw: dict) -> dict[str, Any]:
        """Transform a raw GLPI asset into the structured full-detail format."""
        # ── Identification ────────────────────────────────────
        identification = {
            "id": raw.get("id"),
            "name": raw.get("name", ""),
            "serial": raw.get("serial", ""),
            "otherserial": raw.get("otherserial", ""),
            "uuid": raw.get("uuid", ""),
            "entity": raw.get("entities_id", ""),
            "type": raw.get("computertypes_id", ""),
            "model": raw.get("computermodels_id", ""),
            "manufacturer": raw.get("manufacturers_id", ""),
            "comment": raw.get("comment", ""),
            "last_update": raw.get("date_mod", ""),
            "date_creation": raw.get("date_creation", ""),
            "last_inventory": raw.get("last_inventory_update", ""),
            "last_boot": raw.get("last_boot", ""),
        }

        # ── Location ──────────────────────────────────────────
        location_id = raw.get("locations_id", 0)
        location = {
            "location_id": location_id if not isinstance(location_id, dict) else location_id.get("id"),
            "location_name": location_id if isinstance(location_id, str) else (location_id.get("completename", "") if isinstance(location_id, dict) else ""),
            "contact": raw.get("contact", ""),
            "contact_num": raw.get("contact_num", ""),
        }

        # ── Status ────────────────────────────────────────────
        state_id = raw.get("states_id", 0)
        status = {
            "state_id": state_id,
            "is_deleted": bool(raw.get("is_deleted", 0)),
            "is_dynamic": bool(raw.get("is_dynamic", 0)),
        }

        # ── Network ───────────────────────────────────────────
        network_ports = raw.get("_networkports", {})
        network = self._parse_network(network_ports)

        # ── Hardware ──────────────────────────────────────────
        hardware = self._parse_hardware(raw.get("_devices", {}))

        # ── Disks ─────────────────────────────────────────────
        disks = self._parse_disks(raw.get("_disks", []))

        # ── Software ──────────────────────────────────────────
        software = self._parse_software(raw.get("_softwares", []))

        # ── Audit (logs) ──────────────────────────────────────
        audit = self._parse_audit(raw.get("_logs", []))

        # ── Tickets ───────────────────────────────────────────
        tickets = self._parse_tickets(raw.get("_tickets", []))

        # ── Connections (relationships) ───────────────────────
        connections = raw.get("_connections", [])
        relationships = self._parse_relationships(connections, tickets)

        return {
            "identification": identification,
            "location": location,
            "status": status,
            "network": network,
            "hardware": hardware,
            "disks": disks,
            "software": software,
            "audit": audit,
            "tickets": tickets,
            "relationships": relationships,
        }

    def _parse_network(self, network_ports: dict) -> dict:
        """Extract network info from _networkports."""
        interfaces: list[dict] = []
        primary_ip = ""
        primary_mac = ""

        if not isinstance(network_ports, dict):
            return {"interfaces": [], "primary_ip": "", "primary_mac": ""}

        for port_type, ports in network_ports.items():
            if not isinstance(ports, list):
                continue
            for port in ports:
                iface: dict[str, Any] = {
                    "name": port.get("name", ""),
                    "mac": port.get("mac", ""),
                    "speed": port.get("speed", 0),
                    "type": port_type.replace("NetworkPort", ""),
                    "ips": [],
                }
                # Extract IPs
                net_name = port.get("NetworkName", {})
                if isinstance(net_name, dict):
                    for addr in net_name.get("IPAddress", []):
                        if isinstance(addr, dict):
                            ip = addr.get("name", "")
                            if ip:
                                iface["ips"].append(ip)
                                if not primary_ip and not ip.startswith("127.") and not ip.startswith("::"):
                                    primary_ip = ip

                if not primary_mac and iface["mac"] and iface["mac"] != "00:00:00:00:00:00":
                    primary_mac = iface["mac"]

                interfaces.append(iface)

        return {
            "interfaces": interfaces,
            "primary_ip": primary_ip,
            "primary_mac": primary_mac,
        }

    def _parse_hardware(self, devices: dict) -> dict:
        """Extract hardware info from _devices."""
        result: dict[str, Any] = {
            "processors": [],
            "memory": [],
            "hard_drives": [],
            "graphic_cards": [],
            "sound_cards": [],
            "network_cards": [],
            "controllers": [],
            "firmware": [],
        }
        if not isinstance(devices, dict):
            return result

        # Processors
        for _key, proc in (devices.get("Item_DeviceProcessor") or {}).items():
            if isinstance(proc, dict):
                result["processors"].append({
                    "name": proc.get("deviceprocessors_id", ""),
                    "frequency": proc.get("frequency", 0),
                    "cores": proc.get("nbcores", 0),
                    "threads": proc.get("nbthreads", 0),
                    "serial": proc.get("serial", ""),
                })

        # Memory
        for _key, mem in (devices.get("Item_DeviceMemory") or {}).items():
            if isinstance(mem, dict):
                result["memory"].append({
                    "name": mem.get("devicememories_id", ""),
                    "size_mb": mem.get("size", 0),
                    "serial": mem.get("serial", ""),
                })

        # Hard drives
        for _key, hd in (devices.get("Item_DeviceHardDrive") or {}).items():
            if isinstance(hd, dict):
                result["hard_drives"].append({
                    "name": hd.get("deviceharddrives_id", ""),
                    "capacity_mb": hd.get("capacity", 0),
                    "serial": hd.get("serial", ""),
                })

        # Graphic cards
        for _key, gpu in (devices.get("Item_DeviceGraphicCard") or {}).items():
            if isinstance(gpu, dict):
                result["graphic_cards"].append({
                    "name": gpu.get("devicegraphiccards_id", ""),
                    "memory_mb": gpu.get("memory", 0),
                })

        # Sound cards
        for _key, sc in (devices.get("Item_DeviceSoundCard") or {}).items():
            if isinstance(sc, dict):
                result["sound_cards"].append({
                    "name": sc.get("devicesoundcards_id", ""),
                })

        # Network cards
        for _key, nc in (devices.get("Item_DeviceNetworkCard") or {}).items():
            if isinstance(nc, dict):
                result["network_cards"].append({
                    "name": nc.get("devicenetworkcards_id", ""),
                    "mac": nc.get("mac", ""),
                })

        # Controllers
        for _key, ctrl in (devices.get("Item_DeviceControl") or {}).items():
            if isinstance(ctrl, dict):
                result["controllers"].append({
                    "name": ctrl.get("devicecontrols_id", ""),
                })

        # Firmware / BIOS
        for _key, fw in (devices.get("Item_DeviceFirmware") or {}).items():
            if isinstance(fw, dict):
                result["firmware"].append({
                    "name": fw.get("devicefirmwares_id", ""),
                    "serial": fw.get("serial", ""),
                })

        return result

    def _parse_disks(self, disks_raw: list) -> list[dict]:
        """Extract disk partition info from _disks."""
        disks: list[dict] = []
        if not isinstance(disks_raw, list):
            return disks
        for entry in disks_raw:
            # _disks entries can be nested: {"name": {...actual_data...}}
            disk_data = entry
            if isinstance(entry, dict) and "name" in entry and isinstance(entry["name"], dict):
                disk_data = entry["name"]
            if isinstance(disk_data, dict):
                disks.append({
                    "name": disk_data.get("name", ""),
                    "mountpoint": disk_data.get("mountpoint", ""),
                    "device": disk_data.get("device", ""),
                    "filesystem": disk_data.get("filesystems_id", ""),
                    "total_mb": disk_data.get("totalsize", 0),
                    "free_mb": disk_data.get("freesize", 0),
                    "encrypted": bool(disk_data.get("encryption_status", 0)),
                })
        return disks

    def _parse_software(self, softwares_raw: list) -> list[dict]:
        """Extract software list from _softwares."""
        software: list[dict] = []
        if not isinstance(softwares_raw, list):
            return software
        for sw in softwares_raw:
            if isinstance(sw, dict):
                software.append({
                    "name": sw.get("softwares_id", ""),
                    "version": sw.get("softwareversions_id", ""),
                    "category": sw.get("softwarecategories_id", ""),
                    "is_valid": bool(sw.get("is_valid", 1)),
                })
        return software

    def _parse_audit(self, logs_raw: list) -> list[dict]:
        """Extract audit log entries from _logs."""
        audit: list[dict] = []
        if not isinstance(logs_raw, list):
            return audit
        for log in logs_raw[:50]:  # Limit to most recent 50
            if isinstance(log, dict):
                audit.append({
                    "id": log.get("id"),
                    "date": log.get("date_mod", ""),
                    "user": log.get("user_name", ""),
                    "action": log.get("linked_action", ""),
                    "field": log.get("itemtype_link", ""),
                    "old_value": log.get("old_value", ""),
                    "new_value": log.get("new_value", ""),
                })
        return audit

    def _parse_tickets(self, tickets_raw: list) -> list[dict]:
        """Extract linked tickets from _tickets."""
        tickets: list[dict] = []
        if not isinstance(tickets_raw, list):
            return tickets
        for t in tickets_raw:
            if isinstance(t, dict):
                tickets.append({
                    "id": t.get("id"),
                    "title": t.get("name", ""),
                    "status": t.get("status", 1),
                    "priority": t.get("priority", 3),
                    "date": t.get("date", ""),
                })
        return tickets

    def _parse_relationships(self, connections: list, tickets: list[dict]) -> list[dict]:
        """Build relationships list from connections and tickets."""
        rels: list[dict] = []
        if isinstance(connections, list):
            for conn in connections:
                if isinstance(conn, dict):
                    rels.append({
                        "type": "Conexión",
                        "target_name": conn.get("name", str(conn.get("id", ""))),
                        "target_type": conn.get("itemtype", ""),
                    })
        # Tickets as relationships
        for t in tickets:
            rels.append({
                "type": "Ticket",
                "target_name": t.get("title", f"Ticket #{t.get('id')}"),
                "target_type": "Ticket",
            })
        return rels

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

    def get_full_detail(self, asset_id: int) -> dict | None:
        """Sync accessor: return cached detail only if already fetched (no I/O)."""
        entry = self._details_cache.get(int(asset_id))
        return entry["detail"] if entry else None

    async def ensure_detail(self, asset_id: int, itemtype: str = "Computer") -> dict | None:
        """
        Return the full parsed detail for an asset, fetching from GLPI on
        first access (or when the cached copy is stale: TTL expired or the
        asset's date_mod changed in the list mirror). Never raises — returns
        None if the fetch fails so callers can degrade gracefully.
        """
        asset_id = int(asset_id)
        entry = self._details_cache.get(asset_id)
        now = time.time()

        if entry and (now - entry["fetched_at"]) < DETAIL_TTL_SECONDS:
            # Refrescar si el activo cambió en GLPI (date_mod del mirror cambió)
            mirror = self._raw_by_id.get(asset_id)
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
        self._details_cache[asset_id] = {
            "detail": raw,
            "fetched_at": now,
            "date_mod": self._raw_by_id.get(asset_id, {}).get("date_mod"),
        }
        logger.debug("glpi_detail_cached", asset_id=asset_id)
        return raw

    # ── Background task lifecycle ─────────────────────────────────

    async def start(self) -> None:
        """Start the periodic lightweight list sync."""
        settings = self._settings
        if not settings.glpi_app_token or not settings.glpi_user_token:
            logger.warning(
                "glpi_collector_skipped",
                reason="GLPI_APP_TOKEN or GLPI_USER_TOKEN not configured",
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
        """Run a list-sync cycle immediately. Returns asset count.

        Resilience: skip immediately when the circuit is open (the GLPI
        host has been failing). Never raises — returns 0 if anything fails.
        """
        if self._breaker.is_open():
            logger.debug(
                "glpi_collector_circuit_open_skip",
                seconds_until_retry=round(self._breaker.seconds_until_retry, 1),
            )
            return 0
        if not self._breaker.allow_request():
            # half-open probe already running, skip this tick
            return 0
        try:
            raw_assets = await asyncio.wait_for(
                self._executor.run(self._collect_list_sync),
                timeout=COLLECT_TIMEOUT_SECONDS,
            )
            self._raw_assets = raw_assets
            self._raw_by_id = {
                int(a["id"]): a for a in raw_assets if isinstance(a, dict) and a.get("id") is not None
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
                hint="GLPI host unreachable or stuck; circuit breaker "
                     "will skip further attempts until cooldown",
            )
            return 0
        except Exception as e:
            self._breaker.record_failure()
            logger.error("glpi_collector_sync_failed", error=str(e))
            return 0

    async def _loop(self) -> None:
        """Background loop: sync the lightweight list every COLLECT_INTERVAL."""
        # First run immediately
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
