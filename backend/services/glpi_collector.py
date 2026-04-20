"""
GLPI Collector — Periodic background task that syncs assets from GLPI API.

Design:
- Runs every 5 minutes as an asyncio background task
- Uses `requests` (sync) via asyncio.to_thread() to not block the event loop
- Saves raw GLPI data to `Integraciones/glpi_full_assets.json`
- Keeps a parsed in-memory cache for fast reads by GLPIService
- Normalizes the rich GLPI data (_devices, _softwares, _networkports, etc.)
  into a structured format consumable by the frontend

Credential source: config.py (GLPI_URL, GLPI_APP_TOKEN, GLPI_USER_TOKEN)
"""

from __future__ import annotations

import asyncio
import json
import math
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests
import structlog

from config import get_settings

logger = structlog.get_logger(__name__)

# Path to the JSON cache file (same dir as the original glpi.py script)
_INTEGRACIONES_DIR = Path(__file__).parent / "Integraciones"
_CACHE_FILE = _INTEGRACIONES_DIR / "glpi_full_assets.json"

ITEM_TYPES = ["Computer", "NetworkEquipment", "Peripheral", "Phone", "Printer"]

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

# Interval in seconds between collection cycles
COLLECT_INTERVAL = 300  # 5 minutes


class GlpiCollector:
    """
    Singleton service that periodically fetches full asset data from GLPI.
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
        self._task: asyncio.Task | None = None
        self._raw_assets: list[dict] = []
        self._parsed_cache: dict[int, dict] = {}  # asset_id → parsed full detail
        self._last_sync: str | None = None
        self._load_existing_cache()

    def _load_existing_cache(self) -> None:
        """Load previously saved JSON if it exists (cold start)."""
        if _CACHE_FILE.exists():
            try:
                with open(_CACHE_FILE, "r", encoding="utf-8") as f:
                    self._raw_assets = json.load(f)
                self._rebuild_parsed_cache()
                logger.info(
                    "glpi_collector_cache_loaded",
                    assets=len(self._raw_assets),
                    file=str(_CACHE_FILE),
                )
            except Exception as e:
                logger.warning("glpi_collector_cache_load_failed", error=str(e))

    # ── Sync GLPI (runs in thread) ────────────────────────────────

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

    def _get_asset_ids_sync(self, session_token: str, itemtype: str) -> list[int]:
        headers = self._get_headers()
        headers["Session-Token"] = session_token
        asset_ids: list[int] = []
        start = 0
        step = 50
        total_count = 1

        while start < total_count:
            end = start + step - 1
            url = f"{self._settings.glpi_base_url}/search/{itemtype}/?range={start}-{end}&forcedisplay[0]=2"
            response = requests.get(url, headers=headers, timeout=30)
            if response.status_code not in (200, 206):
                break
            data = response.json()
            total_count = data.get("totalcount", 0)
            for row in data.get("data", []):
                item_id = row.get("2")
                if item_id:
                    asset_ids.append(int(item_id))
            start += step

        return asset_ids

    def _get_detailed_items_sync(
        self, session_token: str, assets_to_fetch: list[dict]
    ) -> list[dict]:
        headers = self._get_headers()
        headers["Session-Token"] = session_token
        params = dict(DETAIL_PARAMS)
        for idx, asset in enumerate(assets_to_fetch):
            params[f"items[{idx}][itemtype]"] = asset["itemtype"]
            params[f"items[{idx}][items_id]"] = asset["items_id"]

        response = requests.get(
            f"{self._settings.glpi_base_url}/getMultipleItems",
            headers=headers,
            params=params,
            timeout=60,
        )
        if response.status_code == 200:
            return response.json()
        logger.warning(
            "glpi_collector_detail_fetch_failed",
            status=response.status_code,
        )
        return []

    def _collect_sync(self) -> list[dict]:
        """Full collection cycle (synchronous). Returns raw asset list."""
        session_token = self._init_session_sync()
        try:
            assets_to_fetch: list[dict] = []
            for itemtype in ITEM_TYPES:
                ids = self._get_asset_ids_sync(session_token, itemtype)
                for item_id in ids:
                    assets_to_fetch.append(
                        {"itemtype": itemtype, "items_id": item_id}
                    )

            total = len(assets_to_fetch)
            logger.info("glpi_collector_found_assets", total=total)

            all_detailed: list[dict] = []
            batch_size = 50
            for i in range(0, total, batch_size):
                batch = assets_to_fetch[i : i + batch_size]
                detailed = self._get_detailed_items_sync(session_token, batch)
                all_detailed.extend(detailed)

            # Save to file
            _INTEGRACIONES_DIR.mkdir(parents=True, exist_ok=True)
            with open(_CACHE_FILE, "w", encoding="utf-8") as f:
                json.dump(all_detailed, f, indent=4, ensure_ascii=False)

            return all_detailed
        finally:
            self._kill_session_sync(session_token)

    # ── Parsed cache ──────────────────────────────────────────────

    def _rebuild_parsed_cache(self) -> None:
        """Parse raw GLPI assets into structured detail format."""
        cache: dict[int, dict] = {}
        for raw in self._raw_assets:
            asset_id = raw.get("id")
            if asset_id is None:
                continue
            cache[int(asset_id)] = self._parse_full_detail(raw)
        self._parsed_cache = cache

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
        """Return the raw GLPI assets from the last collection."""
        return self._raw_assets

    def get_full_detail(self, asset_id: int) -> dict | None:
        """Return parsed full detail for a specific asset."""
        return self._parsed_cache.get(asset_id)

    def get_all_parsed(self) -> dict[int, dict]:
        """Return all parsed asset details."""
        return self._parsed_cache

    def get_last_sync(self) -> str | None:
        """Timestamp of the last successful sync."""
        return self._last_sync

    # ── Background task lifecycle ─────────────────────────────────

    async def start(self) -> None:
        """Start the periodic collection background task."""
        settings = self._settings
        if not settings.glpi_app_token or not settings.glpi_user_token:
            logger.warning(
                "glpi_collector_skipped",
                reason="GLPI_APP_TOKEN or GLPI_USER_TOKEN not configured",
            )
            return
        if settings.should_mock_glpi:
            logger.info("glpi_collector_skipped_mock_mode")
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
        """Run a collection cycle immediately. Returns asset count."""
        try:
            raw_assets = await asyncio.to_thread(self._collect_sync)
            self._raw_assets = raw_assets
            self._rebuild_parsed_cache()
            self._last_sync = datetime.now(timezone.utc).isoformat()
            logger.info(
                "glpi_collector_sync_complete",
                assets=len(raw_assets),
                timestamp=self._last_sync,
            )
            return len(raw_assets)
        except Exception as e:
            logger.error("glpi_collector_sync_failed", error=str(e))
            return 0

    async def _loop(self) -> None:
        """Background loop: collect every COLLECT_INTERVAL seconds."""
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
