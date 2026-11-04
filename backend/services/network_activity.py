"""Read-only, short-lived view of RouterOS connection tracking.

Counters belong to *currently tracked* connections. They are not a history or
an interface bandwidth meter. One cached snapshot is shared by all viewers.
"""

from __future__ import annotations

import asyncio
import ipaddress
import time
from datetime import datetime, timezone
from typing import Any

import structlog

from config import get_settings
from services.glpi_collector import get_glpi_collector
from services.glpi_legacy import get_asset_ip_map
from services.mikrotik_service import get_mikrotik_service

logger = structlog.get_logger(__name__)
SNAPSHOT_TTL = 20.0


def _valid_ip(value: Any) -> ipaddress.IPv4Address | None:
    try:
        ip = ipaddress.ip_address(str(value or ""))
        return ip if isinstance(ip, ipaddress.IPv4Address) else None
    except ValueError:
        return None


def _in_scope(value: Any, network: ipaddress.IPv4Network) -> bool:
    ip = _valid_ip(value)
    return ip is not None and ip in network


def _bool(value: Any) -> bool:
    return str(value).lower() in ("true", "yes", "1")


def _mac(value: Any) -> str:
    return str(value or "").upper().replace("-", ":")


def _mac_kind(value: str) -> str:
    try:
        first = int(value.split(":")[0], 16)
        return "local_o_aleatoria" if first & 2 else "global"
    except (ValueError, IndexError):
        return "desconocida"


def _assets(cached_assets: list[dict], ip_map: dict[str, str], details: dict[tuple[str, int], dict]) -> tuple[dict, dict]:
    by_ip: dict[str, dict] = {}
    by_mac: dict[str, dict] = {}
    duplicate_ips: set[str] = set()
    duplicate_macs: set[str] = set()
    for raw in cached_assets:
        asset_id = raw.get("id")
        itemtype = raw.get("_itemtype") or "Computer"
        if not isinstance(asset_id, int):
            continue
        name = str(raw.get("name") or f"{itemtype} #{asset_id}")
        asset = {"name": name, "asset_id": asset_id, "asset_type": itemtype}
        ip = ip_map.get(f"{itemtype}:{asset_id}")
        if ip and _valid_ip(ip):
            if ip in by_ip:
                duplicate_ips.add(ip)
            by_ip[ip] = asset
        detail = details.get((itemtype, asset_id)) or {}
        network = detail.get("network") or {}
        mac = _mac(network.get("primary_mac"))
        if mac:
            if mac in by_mac:
                duplicate_macs.add(mac)
            by_mac[mac] = asset
    for ip in duplicate_ips:
        by_ip.pop(ip, None)
    for mac in duplicate_macs:
        by_mac.pop(mac, None)
    return by_ip, by_mac


def _identity(ip: str, arp: dict, leases: dict, glpi_ip: dict, glpi_mac: dict) -> dict:
    lease = leases.get(ip) or {}
    entry = arp.get(ip) or {}
    mac = _mac(lease.get("active_mac_address") or lease.get("mac_address") or entry.get("mac_address"))
    asset = glpi_ip.get(ip)
    source = "glpi_ip" if asset else "ip"
    if not asset and mac:
        asset = glpi_mac.get(mac)
        if asset:
            source = "glpi_mac"
    if asset:
        label = asset["name"]
    elif lease.get("host_name"):
        label, source = lease["host_name"], "dhcp"
    else:
        label = ip
    return {
        "label": label, "source": source, "mac": mac,
        "mac_kind": _mac_kind(mac) if mac else "desconocida",
        "asset_id": asset.get("asset_id") if asset else None,
        "asset_type": asset.get("asset_type") if asset else None,
    }


def _nat_target(conn: dict, rules: list[dict], network: ipaddress.IPv4Network) -> tuple[str, str, str]:
    """Prefer the translated address in conntrack; use a unique NAT rule as a hint."""
    reply = str(conn.get("reply_src_address") or "")
    if _in_scope(reply, network):
        return reply, str(conn.get("reply_src_port") or conn.get("dst_port") or ""), "conntrack_nat"
    candidates = []
    for rule in rules:
        if rule.get("disabled") or rule.get("chain") != "dstnat":
            continue
        if rule.get("protocol") and rule["protocol"] != conn.get("protocol"):
            continue
        if rule.get("dst_address") and rule["dst_address"] != conn.get("dst_address"):
            continue
        ports = str(rule.get("dst_port") or "")
        if ports and str(conn.get("dst_port") or "") not in ports.split(","):
            continue
        target = str(rule.get("to_addresses") or "")
        if _in_scope(target, network):
            candidates.append((target, str(rule.get("to_ports") or conn.get("dst_port") or "")))
    if len(candidates) == 1:
        return *candidates[0], "nat_rule_inferred"
    return "", "", "unknown"


def build_snapshot(
    connections: list[dict], arp_rows: list[dict], lease_rows: list[dict],
    nat_rules: list[dict], cached_assets: list[dict], ip_map: dict[str, str],
    details: dict[tuple[str, int], dict], cidr: str,
) -> dict:
    network = ipaddress.ip_network(cidr, strict=False)
    if not isinstance(network, ipaddress.IPv4Network):
        raise ValueError("NETWORK_ACTIVITY_CIDR debe ser una red IPv4")
    arp = {row.get("ip_address"): row for row in arp_rows if row.get("ip_address") and row.get("complete", True)}
    leases = {
        row.get("active_address") or row.get("address"): row for row in lease_rows
        if row.get("active_address") or (row.get("address") and row.get("status") == "bound")
    }
    glpi_ip, glpi_mac = _assets(cached_assets, ip_map, details)
    people: dict[str, dict] = {}
    grouped: dict[tuple, dict] = {}
    skipped_ipv6 = 0

    for conn in connections:
        src, dst = _valid_ip(conn.get("src_address")), _valid_ip(conn.get("dst_address"))
        if not src or not dst:
            skipped_ipv6 += 1
            continue
        src_in, dst_in = src in network, dst in network
        translated = _bool(conn.get("dstnat")) or _in_scope(conn.get("reply_src_address"), network)
        translated_ip, translated_port, translated_source = (
            _nat_target(conn, nat_rules, network) if translated and not dst_in else ("", "", "unknown")
        )
        if src_in and (dst_in or translated_ip):
            direction = "internal"
        elif src_in:
            direction = "outbound"
        elif dst_in or translated:
            direction = "inbound"
        else:
            continue

        target_ip, target_port, target_source = str(dst), str(conn.get("dst_port") or ""), "direct"
        if direction in ("inbound", "internal") and not dst_in:
            target_ip, target_port, target_source = translated_ip, translated_port, translated_source
            if not target_ip:
                # A public destination with no known translated target cannot
                # safely be presented as a service inside the infrastructure.
                continue

        bytes_total = max(0, int(conn.get("orig_bytes") or 0)) + max(0, int(conn.get("repl_bytes") or 0))
        for ip in {str(src), target_ip}:
            if _in_scope(ip, network):
                person = people.setdefault(ip, {"ip": ip, "bytes": 0, "connections": 0})
                person["bytes"] += bytes_total
                person["connections"] += 1

        key = (direction, str(src), str(dst), str(conn.get("dst_port") or ""),
               str(conn.get("protocol") or ""), target_ip, target_port, target_source)
        row = grouped.setdefault(key, {
            "direction": direction, "source_ip": str(src), "destination_ip": str(dst),
            "destination_port": str(conn.get("dst_port") or ""),
            "protocol": str(conn.get("protocol") or ""),
            "target_ip": target_ip, "target_port": target_port,
            "target_source": target_source, "connections": 0, "bytes": 0,
            "responded": 0, "without_reply": 0,
        })
        row["connections"] += 1
        row["bytes"] += bytes_total
        row["responded" if _bool(conn.get("seen_reply")) else "without_reply"] += 1

    total_attributed = sum(row["bytes"] for row in people.values())
    participants = []
    for ip, row in people.items():
        participants.append({
            **row, "percent": round(100 * row["bytes"] / total_attributed, 2) if total_attributed else 0,
            "identity": _identity(ip, arp, leases, glpi_ip, glpi_mac),
        })
    participants.sort(key=lambda row: (-row["bytes"], -row["connections"], row["ip"]))
    accesses = {name: [] for name in ("outbound", "inbound", "internal")}
    for row in grouped.values():
        row["source_identity"] = _identity(row["source_ip"], arp, leases, glpi_ip, glpi_mac) if _in_scope(row["source_ip"], network) else None
        row["target_identity"] = _identity(row["target_ip"], arp, leases, glpi_ip, glpi_mac) if _in_scope(row["target_ip"], network) else None
        accesses[row["direction"]].append(row)
    for rows in accesses.values():
        rows.sort(key=lambda row: (-row["connections"], -row["bytes"], row["source_ip"], row["destination_ip"]))
    return {
        "observed_at": datetime.now(timezone.utc).isoformat(),
        "cidr": str(network), "connection_count": len(connections),
        "skipped_invalid_or_ipv6": skipped_ipv6,
        "total_attributed_bytes": total_attributed,
        "participants": participants, "accesses": accesses,
        "glpi_ip_available": bool(ip_map),
    }


class NetworkActivity:
    def __init__(self) -> None:
        self._lock = asyncio.Lock()
        self._snapshot: dict | None = None
        self._snapshot_at = 0.0

    async def snapshot(self) -> dict:
        if self._snapshot and time.monotonic() - self._snapshot_at < SNAPSHOT_TTL:
            return self._snapshot
        async with self._lock:
            if self._snapshot and time.monotonic() - self._snapshot_at < SNAPSHOT_TTL:
                return self._snapshot
            mikrotik = get_mikrotik_service()
            connections = await mikrotik.get_connections()
            async def optional(call, label):
                try:
                    return await call(), True
                except Exception as exc:  # enrichment must not hide observed traffic
                    logger.warning("network_activity_enrichment_failed", source=label, error=str(exc))
                    return [], False
            arp_rows, arp_ok = await optional(mikrotik.get_arp_table, "arp")
            lease_rows, dhcp_ok = await optional(mikrotik.get_dhcp_leases, "dhcp")
            nat_rules, nat_ok = await optional(mikrotik.get_nat_rules, "nat")
            collector = get_glpi_collector()
            cached_assets = collector.get_cached_assets()
            details = {
                (raw.get("_itemtype") or "Computer", raw["id"]): detail
                for raw in cached_assets if isinstance(raw.get("id"), int)
                if (detail := collector.get_full_detail(raw["id"], raw.get("_itemtype") or "Computer"))
            }
            ip_map = await get_asset_ip_map() if cached_assets else {}
            result = build_snapshot(connections, arp_rows, lease_rows, nat_rules,
                                    cached_assets, ip_map, details,
                                    get_settings().network_activity_cidr)
            result["sources"] = {"arp": arp_ok, "dhcp": dhcp_ok, "nat": nat_ok,
                                 "glpi_assets": bool(cached_assets), "glpi_ip": bool(ip_map)}
            self._snapshot, self._snapshot_at = result, time.monotonic()
            return result


service = NetworkActivity()
