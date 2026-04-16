"""
MikroTik Service - Singleton connection manager for RouterOS API.

Design decisions:
- Singleton pattern: one connection shared across all requests to avoid
  overwhelming the CHR with connections (RouterOS has limited session count)
- Automatic reconnection with exponential backoff via tenacity
- Thread-safe via asyncio.Lock for connection management
- All API calls wrapped in try/except with structured logging
- Traffic calculation uses delta between consecutive reads

The routeros-api library is synchronous, so we run it in an executor
to avoid blocking the async event loop.
"""

from __future__ import annotations

import asyncio
import time
from typing import Any

import routeros_api
import structlog
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type,
)

from config import get_settings

logger = structlog.get_logger(__name__)


class MikroTikService:
    """
    Singleton service for MikroTik RouterOS API communication.
    Maintains a persistent connection with automatic reconnection.
    """

    _instance: MikroTikService | None = None
    _lock = asyncio.Lock()

    def __new__(cls) -> MikroTikService:
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def __init__(self) -> None:
        if self._initialized:
            return
        self._initialized = True
        self._connection: routeros_api.RouterOsApiPool | None = None
        self._api: Any = None
        self._connected = False
        self._connect_lock = asyncio.Lock()
        self._api_lock = asyncio.Lock()
        self._settings = get_settings()
        # Traffic tracking: stores {interface_name: {"rx": bytes, "tx": bytes, "time": timestamp}}
        self._last_traffic: dict[str, dict[str, float]] = {}
        # VLAN traffic tracking (separate dict to avoid interfering with general traffic)
        self._last_vlan_traffic: dict[str, dict[str, float]] = {}

    async def connect(self) -> None:
        """
        Establish connection to MikroTik CHR.
        Uses plaintext_login=True for lab environment.
        """
        if self._settings.should_mock_mikrotik:
            self._connected = True
            logger.info("mikrotik_mock_mode_active_skipping_connection")
            return

        async with self._connect_lock:
            if self._connected and self._api is not None:
                return
            try:
                loop = asyncio.get_event_loop()
                self._connection = await loop.run_in_executor(
                    None, self._create_connection
                )
                self._api = self._connection.get_api()
                self._connected = True
                logger.info(
                    "mikrotik_connected",
                    host=self._settings.mikrotik_host,
                    port=self._settings.mikrotik_port,
                )
            except Exception as e:
                self._connected = False
                self._api = None
                logger.error("mikrotik_connection_failed", error=str(e))
                raise

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=10),
        retry=retry_if_exception_type((ConnectionError, OSError)),
    )
    def _create_connection(self) -> routeros_api.RouterOsApiPool:
        """Create RouterOS API connection pool with retry logic."""
        return routeros_api.RouterOsApiPool(
            host=self._settings.mikrotik_host,
            port=self._settings.mikrotik_port,
            username=self._settings.mikrotik_user,
            password=self._settings.mikrotik_password,
            plaintext_login=True,  # Required for CHR lab setup
        )

    async def _ensure_connected(self) -> None:
        """Reconnect if connection was lost."""
        if not self._connected or self._api is None:
            await self.connect()

    async def _api_call(self, path: str, command: str = "print", **kwargs: Any) -> list[dict]:
        """
        Execute a RouterOS API call with automatic reconnection.
        Runs synchronous API calls in an executor to keep async flow.
        """
        await self._ensure_connected()
        loop = asyncio.get_event_loop()
        try:
            async with self._api_lock:
                result = await loop.run_in_executor(
                    None, lambda: self._execute_api(path, command, **kwargs)
                )
            return result
        except Exception as e:
            logger.warning("mikrotik_api_call_failed", path=path, error=str(e))
            # Force reconnection on next call
            self._connected = False
            self._api = None
            # Retry once after reconnection
            await self.connect()
            try:
                async with self._api_lock:
                    result = await loop.run_in_executor(
                        None, lambda: self._execute_api(path, command, **kwargs)
                    )
                return result
            except Exception as retry_error:
                logger.error(
                    "mikrotik_api_call_retry_failed",
                    path=path,
                    error=str(retry_error),
                )
                raise

    def _execute_api(self, path: str, command: str = "print", **kwargs: Any) -> list[dict]:
        """Synchronous API execution against RouterOS."""
        resource = self._api.get_resource(path)
        try:
            if command == "print":
                return resource.get(**kwargs)
            elif command == "add":
                return resource.add(**kwargs)
            elif command == "remove":
                return resource.remove(**kwargs)
            elif command == "set":
                return resource.set(**kwargs)
            else:
                raise ValueError(f"Unknown command: {command}")
        except Exception as e:
            # Handle routeros_api bug where it fails to parse !empty on some endpoints
            if command == "print" and "Malformed sentence" in str(e) and "!empty" in str(e):
                return []
            raise

    # ── Public API Methods ────────────────────────────────────────

    async def get_interfaces(self) -> list[dict]:
        """
        Get all network interfaces with status.
        Returns: list of interface dicts with name, type, running, rx/tx bytes.
        """
        if self._settings.should_mock_mikrotik:
            from services.mock_data import MockData
            return MockData.mikrotik.interfaces()
        try:
            interfaces = await self._api_call("/interface")
            result = []
            for iface in interfaces:
                result.append({
                    "name": iface.get("name", ""),
                    "type": iface.get("type", ""),
                    "running": iface.get("running", "false") == "true",
                    "disabled": iface.get("disabled", "false") == "true",
                    "rx_byte": int(iface.get("rx-byte", 0)),
                    "tx_byte": int(iface.get("tx-byte", 0)),
                    "rx_packet": int(iface.get("rx-packet", 0)),
                    "tx_packet": int(iface.get("tx-packet", 0)),
                    "mtu": int(iface.get("mtu", 1500)),
                    "mac_address": iface.get("mac-address", ""),
                    "comment": iface.get("comment", ""),
                })
            logger.debug("mikrotik_interfaces_fetched", count=len(result))
            return result
        except Exception as e:
            logger.error("mikrotik_get_interfaces_failed", error=str(e))
            raise

    async def get_connections(self) -> list[dict]:
        """
        Get active connection tracking table.
        Returns: list of active connections with src/dst, protocol, state.
        """
        if self._settings.should_mock_mikrotik:
            from services.mock_data import MockData
            return MockData.mikrotik.connections()
        try:
            connections = await self._api_call("/ip/firewall/connection")
            result = []
            for conn in connections:
                src = conn.get("src-address", "")
                dst = conn.get("dst-address", "")
                # Split port from address if present (format: ip:port)
                src_ip, src_port = (src.rsplit(":", 1) + [""])[:2] if ":" in src else (src, "")
                dst_ip, dst_port = (dst.rsplit(":", 1) + [""])[:2] if ":" in dst else (dst, "")
                result.append({
                    "src_address": src_ip,
                    "dst_address": dst_ip,
                    "protocol": conn.get("protocol", ""),
                    "connection_state": conn.get("connection-state", ""),
                    "timeout": conn.get("timeout", ""),
                    "src_port": src_port,
                    "dst_port": dst_port,
                    "orig_bytes": int(conn.get("orig-bytes", 0)),
                    "repl_bytes": int(conn.get("repl-bytes", 0)),
                })
            logger.debug("mikrotik_connections_fetched", count=len(result))
            return result
        except Exception as e:
            logger.error("mikrotik_get_connections_failed", error=str(e))
            raise

    async def get_arp_table(self) -> list[dict]:
        """Get the ARP table."""
        if self._settings.should_mock_mikrotik:
            from services.mock_data import MockData
            return MockData.mikrotik.arp_table()
        try:
            entries = await self._api_call("/ip/arp")
            result = []
            for entry in entries:
                result.append({
                    "ip_address": entry.get("address", ""),
                    "mac_address": entry.get("mac-address", ""),
                    "interface": entry.get("interface", ""),
                    "dynamic": entry.get("dynamic", "false") == "true",
                    "complete": entry.get("complete", "false") == "true",
                })
            logger.debug("mikrotik_arp_fetched", count=len(result))
            return result
        except Exception as e:
            logger.error("mikrotik_get_arp_failed", error=str(e))
            raise

    async def get_traffic(self) -> list[dict]:
        """
        Calculate real-time traffic rates by comparing current counters
        with previously stored values. Returns bytes/sec and packets/sec
        per interface.
        """
        if self._settings.should_mock_mikrotik:
            from services.mock_data import MockData
            return MockData.mikrotik.traffic()
        try:
            interfaces = await self._api_call("/interface")
            current_time = time.time()
            result = []

            for iface in interfaces:
                name = iface.get("name", "")
                rx = int(iface.get("rx-byte", 0))
                tx = int(iface.get("tx-byte", 0))
                rx_pkt = int(iface.get("rx-packet", 0))
                tx_pkt = int(iface.get("tx-packet", 0))

                prev = self._last_traffic.get(name)
                if prev is not None:
                    dt = current_time - prev["time"]
                    if dt > 0:
                        result.append({
                            "interface": name,
                            "rx_bytes_per_sec": round((rx - prev["rx"]) / dt, 2),
                            "tx_bytes_per_sec": round((tx - prev["tx"]) / dt, 2),
                            "rx_packets_per_sec": round(
                                (rx_pkt - prev["rx_pkt"]) / dt, 2
                            ),
                            "tx_packets_per_sec": round(
                                (tx_pkt - prev["tx_pkt"]) / dt, 2
                            ),
                            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S"),
                        })

                # Store current values for next delta calculation
                self._last_traffic[name] = {
                    "rx": rx,
                    "tx": tx,
                    "rx_pkt": rx_pkt,
                    "tx_pkt": tx_pkt,
                    "time": current_time,
                }

            logger.debug("mikrotik_traffic_calculated", interfaces=len(result))
            return result
        except Exception as e:
            logger.error("mikrotik_get_traffic_failed", error=str(e))
            raise

    async def get_firewall_rules(self) -> list[dict]:
        """Get all firewall filter rules."""
        if self._settings.should_mock_mikrotik:
            from services.mock_data import MockData
            return MockData.mikrotik.firewall_rules()
        try:
            rules = await self._api_call("/ip/firewall/filter")
            result = []
            for rule in rules:
                result.append({
                    "id": rule.get(".id", ""),
                    "chain": rule.get("chain", ""),
                    "action": rule.get("action", ""),
                    "src_address": rule.get("src-address", ""),
                    "dst_address": rule.get("dst-address", ""),
                    "protocol": rule.get("protocol", ""),
                    "disabled": rule.get("disabled", "false") == "true",
                    "comment": rule.get("comment", ""),
                    "bytes": int(rule.get("bytes", 0)),
                    "packets": int(rule.get("packets", 0)),
                })
            logger.debug("mikrotik_firewall_rules_fetched", count=len(result))
            return result
        except Exception as e:
            logger.error("mikrotik_get_firewall_rules_failed", error=str(e))
            raise

    async def block_ip(self, ip: str, comment: str = "Blocked via NetShield") -> dict:
        """
        Add a drop rule in chain=forward with src-address=ip.
        Returns the created rule info.
        """
        if self._settings.should_mock_mikrotik:
            from services.mock_service import MockService
            return MockService.mikrotik_block_ip(ip, comment)
        try:
            loop = asyncio.get_event_loop()
            await self._ensure_connected()

            def _add_rule():
                resource = self._api.get_resource("/ip/firewall/filter")
                rule_id = resource.add(
                    chain="forward",
                    action="drop",
                    src_address=ip,
                    comment=comment,
                )
                return rule_id

            rule_id = await loop.run_in_executor(None, _add_rule)
            logger.info("mikrotik_ip_blocked", ip=ip, rule_id=rule_id, comment=comment)
            return {"rule_id": rule_id, "ip": ip, "action": "blocked", "comment": comment}
        except Exception as e:
            logger.error("mikrotik_block_ip_failed", ip=ip, error=str(e))
            raise

    async def unblock_ip(self, ip: str) -> dict:
        """
        Remove all drop rules matching src-address=ip in chain=forward.
        """
        if self._settings.should_mock_mikrotik:
            from services.mock_service import MockService
            return MockService.mikrotik_unblock_ip(ip)
        try:
            rules = await self._api_call("/ip/firewall/filter")
            removed = []
            loop = asyncio.get_event_loop()

            for rule in rules:
                if (
                    rule.get("chain") == "forward"
                    and rule.get("action") == "drop"
                    and rule.get("src-address") == ip
                ):
                    rule_id = rule.get(".id")
                    if rule_id:

                        def _remove(rid=rule_id):
                            resource = self._api.get_resource("/ip/firewall/filter")
                            resource.remove(id=rid)

                        await loop.run_in_executor(None, _remove)
                        removed.append(rule_id)

            logger.info("mikrotik_ip_unblocked", ip=ip, rules_removed=len(removed))
            return {"ip": ip, "action": "unblocked", "rules_removed": removed}
        except Exception as e:
            logger.error("mikrotik_unblock_ip_failed", ip=ip, error=str(e))
            raise

    async def get_logs(self, limit: int = 50) -> list[dict]:
        """Get recent system logs from RouterOS."""
        if self._settings.should_mock_mikrotik:
            from services.mock_data import MockData
            return MockData.mikrotik.logs(limit)
        try:
            logs = await self._api_call("/log")
            result = []
            for log in logs[-limit:]:
                result.append({
                    "id": log.get(".id", ""),
                    "time": log.get("time", ""),
                    "topics": log.get("topics", ""),
                    "message": log.get("message", ""),
                })
            logger.debug("mikrotik_logs_fetched", count=len(result))
            return result
        except Exception as e:
            logger.error("mikrotik_get_logs_failed", error=str(e))
            raise

    # ── VLAN Methods ──────────────────────────────────────────────

    async def get_vlans(self) -> list[dict]:
        """Get all VLAN interfaces from RouterOS."""
        if self._settings.should_mock_mikrotik:
            from services.mock_data import MockData
            return MockData.mikrotik.vlans()
        try:
            vlans = await self._api_call("/interface/vlan")
            result = []
            for vlan in vlans:
                result.append({
                    "id": vlan.get("id", ""),
                    "vlan_id": int(vlan.get("vlan-id", 0)),
                    "name": vlan.get("name", ""),
                    "interface": vlan.get("interface", ""),
                    "running": vlan.get("running", "false") == "true",
                    "disabled": vlan.get("disabled", "false") == "true",
                    "mtu": int(vlan.get("mtu", 1500)),
                    "mac_address": vlan.get("mac-address", ""),
                    "comment": vlan.get("comment", ""),
                })
            logger.debug("mikrotik_vlans_fetched", count=len(result))
            return result
        except Exception as e:
            logger.error("mikrotik_get_vlans_failed", error=str(e))
            raise

    async def create_vlan(
        self, vlan_id: int, name: str, interface: str, comment: str = ""
    ) -> dict:
        """Create a new VLAN interface on RouterOS."""
        if self._settings.should_mock_mikrotik:
            return {"vlan_id": vlan_id, "name": name, "interface": interface, "comment": comment, "mock": True, "action": "created"}
        try:
            kwargs = {
                "vlan_id": str(vlan_id),
                "name": name,
                "interface": interface,
            }
            if comment:
                kwargs["comment"] = comment
            
            result_id = await self._api_call("/interface/vlan", command="add", **kwargs)
            logger.info(
                "mikrotik_vlan_created",
                vlan_id=vlan_id,
                name=name,
                interface=interface,
            )
            return {
                "id": result_id,
                "vlan_id": vlan_id,
                "name": name,
                "interface": interface,
                "comment": comment,
            }
        except Exception as e:
            logger.error("mikrotik_create_vlan_failed", vlan_id=vlan_id, error=str(e))
            raise

    async def update_vlan(
        self, vlan_ros_id: str, name: str | None = None, comment: str | None = None
    ) -> dict:
        """Update an existing VLAN interface (name and/or comment)."""
        if self._settings.should_mock_mikrotik:
            return {"id": vlan_ros_id, "name": name, "comment": comment, "mock": True, "action": "updated"}
        try:
            kwargs: dict[str, Any] = {"id": vlan_ros_id}
            if name is not None:
                kwargs["name"] = name
            if comment is not None:
                kwargs["comment"] = comment
                
            await self._api_call("/interface/vlan", command="set", **kwargs)
            logger.info(
                "mikrotik_vlan_updated",
                ros_id=vlan_ros_id,
                name=name,
                comment=comment,
            )
            return {"id": vlan_ros_id, "name": name, "comment": comment, "action": "updated"}
        except Exception as e:
            logger.error(
                "mikrotik_update_vlan_failed", ros_id=vlan_ros_id, error=str(e)
            )
            raise

    async def delete_vlan(self, vlan_ros_id: str) -> dict:
        """Delete a VLAN interface from RouterOS."""
        if self._settings.should_mock_mikrotik:
            return {"id": vlan_ros_id, "action": "deleted", "mock": True}
        try:
            await self._api_call("/interface/vlan", command="remove", id=vlan_ros_id)
            logger.info("mikrotik_vlan_deleted", ros_id=vlan_ros_id)
            return {"id": vlan_ros_id, "action": "deleted"}
        except Exception as e:
            logger.error(
                "mikrotik_delete_vlan_failed", ros_id=vlan_ros_id, error=str(e)
            )
            raise

    async def get_vlan_traffic(self) -> list[dict]:
        """
        Calculate real-time traffic rates for VLAN interfaces only.
        Uses the same delta-based approach as get_traffic() but with
        a separate tracking dict (_last_vlan_traffic).
        """
        if self._settings.should_mock_mikrotik:
            from services.mock_data import MockData
            return MockData.mikrotik.vlan_traffic()
        try:
            interfaces = await self._api_call("/interface")
            current_time = time.time()
            result = []

            # Also fetch VLAN config to get vlan-id mapping
            vlans = await self._api_call("/interface/vlan")
            vlan_map = {}  # interface name -> vlan-id
            for v in vlans:
                vlan_map[v.get("name", "")] = int(v.get("vlan-id", 0))

            for iface in interfaces:
                name = iface.get("name", "")
                if name not in vlan_map:
                    continue  # Skip non-VLAN interfaces

                rx = int(iface.get("rx-byte", 0))
                tx = int(iface.get("tx-byte", 0))

                prev = self._last_vlan_traffic.get(name)
                if prev is not None:
                    dt = current_time - prev["time"]
                    if dt > 0:
                        rx_bps = round((rx - prev["rx"]) / dt, 2)
                        tx_bps = round((tx - prev["tx"]) / dt, 2)
                        result.append({
                            "vlan_id": vlan_map[name],
                            "name": name,
                            "rx_bps": rx_bps,
                            "tx_bps": tx_bps,
                            "status": "ok",  # Status set by caller with Wazuh data
                        })

                self._last_vlan_traffic[name] = {
                    "rx": rx,
                    "tx": tx,
                    "time": current_time,
                }

            logger.debug("mikrotik_vlan_traffic_calculated", count=len(result))
            return result
        except Exception as e:
            logger.error("mikrotik_get_vlan_traffic_failed", error=str(e))
            raise

    async def get_vlan_addresses(self) -> list[dict]:
        """
        Get IP addresses assigned to VLAN interfaces.
        Used to map VLAN → subnet for alert correlation.
        """
        if self._settings.should_mock_mikrotik:
            from services.mock_data import MockData
            return MockData.mikrotik.vlan_addresses()
        try:
            vlans = await self._api_call("/interface/vlan")
            vlan_iface_names = {v.get("name", "") for v in vlans}

            result = []
            for addr in addresses:
                iface = addr.get("interface", "")
                if iface in vlan_iface_names:
                    result.append({
                        "address": addr.get("address", ""),  # e.g. "192.168.10.1/24"
                        "network": addr.get("network", ""),  # e.g. "192.168.10.0"
                        "interface": iface,
                    })
            logger.debug("mikrotik_vlan_addresses_fetched", count=len(result))
            return result
        except Exception as e:
            logger.error("mikrotik_get_vlan_addresses_failed", error=str(e))
            raise

    # ── Security & System Methods ───────────────────────────────────

    async def get_system_health(self) -> dict:
        """
        [MikroTik API] Get system resource metrics.
        Resource: /system/resource
        """
        if self._settings.should_mock_mikrotik:
            from services.mock_data import MockData
            return MockData.mikrotik.system_health()
        try:
            if resources:
                r = resources[0]
                total_ram = int(r.get("total-memory", 0))
                free_ram = int(r.get("free-memory", 0))
                used_ram = total_ram - free_ram
                return {
                    "cpu_percent": float(r.get("cpu-load", 0)),
                    "ram_used_mb": round(used_ram / (1024 * 1024), 1),
                    "ram_total_mb": round(total_ram / (1024 * 1024), 1),
                    "ram_percent": round((used_ram / total_ram * 100), 1) if total_ram > 0 else 0,
                    "uptime": r.get("uptime", ""),
                    "temperature": r.get("cpu-temperature", "N/A"),
                    "board_name": r.get("board-name", ""),
                    "version": r.get("version", ""),
                }
            return {}
        except Exception as e:
            logger.error("mikrotik_get_system_health_failed", error=str(e))
            raise

    async def search_arp(self, ip: str | None = None, mac: str | None = None) -> list[dict]:
        """
        [MikroTik API] Search ARP table by IP or MAC.
        Resource: /ip/arp
        """
        if self._settings.should_mock_mikrotik:
            from services.mock_data import MockData
            arp = MockData.mikrotik.arp_table()
            if ip:
                arp = [a for a in arp if ip.lower() in a["ip_address"].lower()]
            if mac:
                arp = [a for a in arp if mac.lower() in a["mac_address"].lower()]
            return arp
        try:
            entries = await self._api_call("/ip/arp")
            result = []
            for entry in entries:
                entry_ip = entry.get("address", "")
                entry_mac = entry.get("mac-address", "")
                if ip and ip.lower() not in entry_ip.lower():
                    continue
                if mac and mac.lower() not in entry_mac.lower():
                    continue
                result.append({
                    "ip_address": entry_ip,
                    "mac_address": entry_mac,
                    "interface": entry.get("interface", ""),
                    "dynamic": entry.get("dynamic", "false") == "true",
                    "complete": entry.get("complete", "false") == "true",
                })
            logger.debug("mikrotik_arp_search", query_ip=ip, query_mac=mac, results=len(result))
            return result
        except Exception as e:
            logger.error("mikrotik_search_arp_failed", error=str(e))
            raise

    async def add_to_address_list(
        self, ip: str, list_name: str, timeout: str = "24h", comment: str = ""
    ) -> dict:
        """
        [MikroTik API] Add IP to an address list with optional expiration.
        Resource: /ip/firewall/address-list
        """
        if self._settings.should_mock_mikrotik:
            return {"id": "mock-addr", "ip": ip, "list": list_name, "timeout": timeout, "mock": True}
        try:
            kwargs = {
                "address": ip,
                "list": list_name,
                "timeout": timeout,
            }
            if comment:
                kwargs["comment"] = comment

            result_id = await self._api_call("/ip/firewall/address-list", command="add", **kwargs)
            logger.info(
                "mikrotik_address_list_added",
                ip=ip,
                list=list_name,
                timeout=timeout,
            )
            return {"id": result_id, "ip": ip, "list": list_name, "timeout": timeout}
        except Exception as e:
            logger.error("mikrotik_add_to_address_list_failed", ip=ip, list=list_name, error=str(e))
            raise

    async def remove_from_address_list(self, ip: str, list_name: str) -> dict:
        """
        [MikroTik API] Remove IP from an address list.
        Resource: /ip/firewall/address-list
        """
        if self._settings.should_mock_mikrotik:
            return {"ip": ip, "list": list_name, "entries_removed": ["mock-id"], "mock": True}
        try:
            entries = await self._api_call("/ip/firewall/address-list")
            removed = []
            loop = asyncio.get_event_loop()

            for entry in entries:
                if entry.get("address") == ip and entry.get("list") == list_name:
                    entry_id = entry.get(".id")
                    if entry_id:
                        def _remove(rid=entry_id):
                            resource = self._api.get_resource("/ip/firewall/address-list")
                            resource.remove(id=rid)

                        async with self._api_lock:
                            await loop.run_in_executor(None, _remove)
                        removed.append(entry_id)

            logger.info("mikrotik_address_list_removed", ip=ip, list=list_name, removed=len(removed))
            return {"ip": ip, "list": list_name, "entries_removed": removed}
        except Exception as e:
            logger.error("mikrotik_remove_from_address_list_failed", ip=ip, error=str(e))
            raise

    async def get_address_list(self, list_name: str | None = None) -> list[dict]:
        """
        [MikroTik API] Get entries from address lists.
        Resource: /ip/firewall/address-list
        """
        if self._settings.should_mock_mikrotik:
            from services.mock_data import MockData
            return MockData.mikrotik.address_lists()
        try:
            entries = await self._api_call("/ip/firewall/address-list")
            result = []
            for entry in entries:
                if list_name and entry.get("list") != list_name:
                    continue
                result.append({
                    "id": entry.get(".id", ""),
                    "address": entry.get("address", ""),
                    "list": entry.get("list", ""),
                    "timeout": entry.get("timeout", ""),
                    "comment": entry.get("comment", ""),
                    "disabled": entry.get("disabled", "false") == "true",
                    "dynamic": entry.get("dynamic", "false") == "true",
                    "creation_time": entry.get("creation-time", ""),
                })
            logger.debug("mikrotik_address_list_fetched", list=list_name, count=len(result))
            return result
        except Exception as e:
            logger.error("mikrotik_get_address_list_failed", error=str(e))
            raise

    async def add_dns_static(
        self, domain: str, address: str = "127.0.0.1", comment: str = ""
    ) -> dict:
        """
        [MikroTik API] Add a static DNS entry (sinkhole).
        Resource: /ip/dns/static
        """
        if self._settings.should_mock_mikrotik:
            return {"id": "mock-dns", "domain": domain, "address": address, "mock": True}
        try:
            kwargs = {
                "name": domain,
                "address": address,
            }
            if comment:
                kwargs["comment"] = comment

            result_id = await self._api_call("/ip/dns/static", command="add", **kwargs)
            logger.info("mikrotik_dns_sinkhole_added", domain=domain, address=address)
            return {"id": result_id, "domain": domain, "address": address}
        except Exception as e:
            logger.error("mikrotik_add_dns_static_failed", domain=domain, error=str(e))
            raise

    async def remove_dns_static(self, domain: str) -> dict:
        """
        [MikroTik API] Remove a static DNS entry by domain name.
        Resource: /ip/dns/static
        """
        if self._settings.should_mock_mikrotik:
            return {"domain": domain, "entries_removed": ["mock-dns-id"], "mock": True}
        try:
            entries = await self._api_call("/ip/dns/static")
            removed = []
            loop = asyncio.get_event_loop()

            for entry in entries:
                if entry.get("name") == domain:
                    entry_id = entry.get(".id")
                    if entry_id:
                        def _remove(rid=entry_id):
                            resource = self._api.get_resource("/ip/dns/static")
                            resource.remove(id=rid)

                        async with self._api_lock:
                            await loop.run_in_executor(None, _remove)
                        removed.append(entry_id)

            logger.info("mikrotik_dns_sinkhole_removed", domain=domain, removed=len(removed))
            return {"domain": domain, "entries_removed": removed}
        except Exception as e:
            logger.error("mikrotik_remove_dns_static_failed", domain=domain, error=str(e))
            raise

    async def get_dns_static(self) -> list[dict]:
        """
        [MikroTik API] Get all static DNS entries (sinkhole list).
        Resource: /ip/dns/static
        """
        if self._settings.should_mock_mikrotik:
            from services.mock_data import MockData
            return MockData.mikrotik.dns_static()
        try:
            entries = await self._api_call("/ip/dns/static")
            result = []
            for entry in entries:
                result.append({
                    "id": entry.get(".id", ""),
                    "domain": entry.get("name", ""),
                    "address": entry.get("address", ""),
                    "comment": entry.get("comment", ""),
                    "disabled": entry.get("disabled", "false") == "true",
                    "ttl": entry.get("ttl", ""),
                })
            logger.debug("mikrotik_dns_static_fetched", count=len(result))
            return result
        except Exception as e:
            logger.error("mikrotik_get_dns_static_failed", error=str(e))
            raise

    async def execute_readonly_command(self, path: str) -> list[dict]:
        """
        [MikroTik API] Execute a read-only (print) command.
        SECURITY: Only 'print' is allowed. Destructive commands are blocked.
        """
        # Whitelist of allowed paths (read-only)
        allowed_paths = [
            "/ip/address",
            "/ip/route",
            "/ip/arp",
            "/ip/dns/static",
            "/ip/dns/cache",
            "/ip/firewall/filter",
            "/ip/firewall/nat",
            "/ip/firewall/mangle",
            "/ip/firewall/address-list",
            "/ip/firewall/connection",
            "/interface",
            "/interface/vlan",
            "/interface/bridge",
            "/interface/bridge/port",
            "/interface/bridge/vlan",
            "/system/resource",
            "/system/identity",
            "/system/clock",
            "/system/routerboard",
            "/log",
            "/queue/simple",
            "/routing/ospf/neighbor",
        ]

        # Normalize path
        clean_path = path.strip().rstrip("/")
        if not clean_path.startswith("/"):
            clean_path = f"/{clean_path}"

        if clean_path not in allowed_paths:
            raise ValueError(
                f"Path '{clean_path}' is not in the whitelist of allowed read-only commands. "
                f"Allowed: {', '.join(allowed_paths)}"
            )

        try:
            result = await self._api_call(clean_path, command="print")
            logger.info("mikrotik_cli_executed", path=clean_path, results=len(result))
            return result
        except Exception as e:
            logger.error("mikrotik_cli_execution_failed", path=clean_path, error=str(e))
            raise

    async def quarantine_agent_port(self, port_name: str, vlan_id: int) -> dict:
        """
        [MikroTik API] Move a bridge port to a quarantine VLAN.
        Resource: /interface/bridge/vlan

        PLACEHOLDER: This function requires a physical MikroTik bridge with
        per-port VLAN configuration. The lab uses VirtualBox internal networking
        without a physical switch, so this operation will log the intention
        but return a descriptive message instead of executing.

        In production with a physical bridge:
        1. Find the bridge port for the agent's interface
        2. Update the bridge VLAN assignment to the quarantine VLAN
        3. Remove the port from its current VLAN
        """
        logger.warning(
            "mikrotik_quarantine_placeholder",
            port=port_name,
            vlan=vlan_id,
            msg="Quarantine requires physical bridge with per-port VLANs. "
                "Lab topology uses VirtualBox internal networking.",
        )
        return {
            "action": "quarantine_requested",
            "port": port_name,
            "target_vlan": vlan_id,
            "executed": False,
            "message": (
                "Quarantine requires a physical MikroTik bridge with per-port VLAN "
                "configuration. The current lab topology uses VirtualBox internal "
                "networking without a managed switch. The quarantine intention has been "
                "logged. To enable this feature, configure a bridge with VLAN filtering "
                "on physical interfaces."
            ),
        }

    async def disconnect(self) -> None:
        """Cleanly close the RouterOS connection."""
        if self._connection:
            try:
                self._connection.disconnect()
            except Exception:
                pass
            self._connection = None
            self._api = None
            self._connected = False
            logger.info("mikrotik_disconnected")


# Module-level singleton accessor
def get_mikrotik_service() -> MikroTikService:
    """Get the MikroTik service singleton."""
    return MikroTikService()

