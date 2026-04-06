"""
Mock Data — Repositorio central de datos de prueba.

Todos los datos usan random.Random(seed=42) para reproducibilidad.
Las entidades son coherentes entre servicios:
  192.168.88.10 → lubuntu_desk_1 en MikroTik, agente 004 en Wazuh, PC-Lab-01 en GLPI
  192.168.88.50 → wazuh-server en MikroTik, agente 000 en Wazuh, Server-Wazuh en GLPI
  203.0.113.45  → atacante externo (brute force) en alertas Wazuh

NO importar este módulo a nivel de módulo en los servicios — usar import lazy
dentro de los métodos para evitar circular imports.
"""

from __future__ import annotations

import math
import random as _random_module
from datetime import datetime, timezone, timedelta
from typing import Any

# Seeded RNG for reproducible data
_rng = _random_module.Random(42)

# ── Entidades compartidas (backbone) ──────────────────────────────────────────

_NOW = datetime.now(timezone.utc)

# Hosts del lab (coherentes entre MikroTik ARP, Wazuh, GLPI)
_LAB_HOSTS = [
    {"ip": "192.168.88.1",   "mac": "4C:5E:0C:11:22:33", "name": "MikroTik-GW",    "iface": "bridge"},
    {"ip": "192.168.88.10",  "mac": "52:54:00:AA:BB:01",  "name": "lubuntu_desk_1", "iface": "ether2"},
    {"ip": "192.168.88.11",  "mac": "52:54:00:AA:BB:02",  "name": "lubuntu_desk_2", "iface": "ether2"},
    {"ip": "192.168.88.20",  "mac": "52:54:00:CC:DD:01",  "name": "PC-Aula3-01",   "iface": "ether3"},
    {"ip": "192.168.88.21",  "mac": "52:54:00:CC:DD:02",  "name": "PC-Aula3-02",   "iface": "ether3"},
    {"ip": "192.168.88.50",  "mac": "52:54:00:FF:00:01",  "name": "wazuh-server",   "iface": "ether4"},
    {"ip": "192.168.88.100", "mac": "52:54:00:EE:EE:EE",  "name": "unknown-guest",  "iface": "hotspot"},
    {"ip": "192.168.100.115","mac": "08:00:27:AB:CD:EF",  "name": "wazuh-phy",      "iface": "ether1"},
]

_ATTACKERS = [
    {"ip": "203.0.113.45",  "label": "attacker-brute-force"},
    {"ip": "198.51.100.22", "label": "attacker-port-scan"},
    {"ip": "203.0.113.99",  "label": "attacker-phishing-c2"},
]

def _ts(minutes_ago: int = 0) -> str:
    return (_NOW - timedelta(minutes=minutes_ago)).isoformat()


# ── MockData ──────────────────────────────────────────────────────────────────

class MockData:
    """Repositorio central de datos de prueba. Todo en un solo lugar."""

    # ── MikroTik ──────────────────────────────────────────────────────────────

    class mikrotik:

        @staticmethod
        def interfaces() -> list[dict]:
            return [
                {"id": "*1",  "name": "ether1",   "type": "ether", "mac_address": "4C:5E:0C:00:00:01",
                 "running": True,  "disabled": False, "rx_byte": 8_543_210_000, "tx_byte": 2_100_000_000,
                 "rx_error": 0, "tx_error": 0, "mtu": 1500, "comment": "WAN uplink"},
                {"id": "*2",  "name": "ether2",   "type": "ether", "mac_address": "4C:5E:0C:00:00:02",
                 "running": True,  "disabled": False, "rx_byte": 3_200_000_000, "tx_byte": 1_800_000_000,
                 "rx_error": 0, "tx_error": 0, "mtu": 1500, "comment": "LAN – Lab Redes"},
                {"id": "*3",  "name": "ether3",   "type": "ether", "mac_address": "4C:5E:0C:00:00:03",
                 "running": True,  "disabled": False, "rx_byte": 1_400_000_000, "tx_byte": 900_000_000,
                 "rx_error": 3, "tx_error": 1, "mtu": 1500, "comment": "LAN – Aula 3"},
                {"id": "*4",  "name": "ether4",   "type": "ether", "mac_address": "4C:5E:0C:00:00:04",
                 "running": True,  "disabled": False, "rx_byte": 500_000_000,  "tx_byte": 200_000_000,
                 "rx_error": 0, "tx_error": 0, "mtu": 1500, "comment": "LAN – Servidores"},
                {"id": "*5",  "name": "bridge",   "type": "bridge","mac_address": "4C:5E:0C:00:00:05",
                 "running": True,  "disabled": False, "rx_byte": 0, "tx_byte": 0,
                 "rx_error": 0, "tx_error": 0, "mtu": 1500, "comment": ""},
                {"id": "*6",  "name": "vlan10",   "type": "vlan",  "mac_address": "4C:5E:0C:00:00:06",
                 "running": True,  "disabled": False, "rx_byte": 750_000_000,  "tx_byte": 300_000_000,
                 "rx_error": 0, "tx_error": 0, "mtu": 1500, "comment": "VLAN Docentes"},
                {"id": "*7",  "name": "vlan20",   "type": "vlan",  "mac_address": "4C:5E:0C:00:00:07",
                 "running": True,  "disabled": False, "rx_byte": 200_000_000,  "tx_byte": 80_000_000,
                 "rx_error": 0, "tx_error": 0, "mtu": 1500, "comment": "VLAN Estudiantes"},
                {"id": "*8",  "name": "hotspot1", "type": "ether", "mac_address": "4C:5E:0C:00:00:08",
                 "running": True,  "disabled": False, "rx_byte": 120_000_000,  "tx_byte": 60_000_000,
                 "rx_error": 0, "tx_error": 0, "mtu": 1500, "comment": "Hotspot"},
            ]

        @staticmethod
        def arp_table() -> list[dict]:
            result = []
            for h in _LAB_HOSTS:
                result.append({
                    "ip_address": h["ip"],
                    "mac_address": h["mac"],
                    "interface": h["iface"],
                    "comment": h["name"],
                    "dynamic": True,
                    "complete": True,
                    "invalid": False,
                    "published": False,
                    "dhcp": True,
                })
            return result

        @staticmethod
        def connections() -> list[dict]:
            conns = []
            protocols = ["tcp", "tcp", "tcp", "udp"]
            states = ["established", "established", "time-wait", ""]
            pairs = [
                ("192.168.88.10", "203.0.113.45", 443, 54321),
                ("192.168.88.11", "8.8.8.8",      53,  49152),
                ("192.168.88.20", "192.168.88.50", 1514, 55000),
                ("192.168.88.21", "192.168.88.50", 1514, 55001),
                ("192.168.88.50", "192.168.100.115", 9200, 60001),
                ("192.168.88.10", "198.51.100.22",443, 50001),
            ]
            for i, (src, dst, dport, sport) in enumerate(pairs):
                conns.append({
                    "id": f"conn-{i}",
                    "protocol": protocols[i % len(protocols)],
                    "state": states[i % len(states)],
                    "src_address": f"{src}:{sport}",
                    "dst_address": f"{dst}:{dport}",
                    "reply_src_address": f"{dst}:{dport}",
                    "reply_dst_address": f"{src}:{sport}",
                    "bytes": _rng.randint(1000, 500_000),
                    "packets": _rng.randint(10, 5000),
                })
            return conns

        @staticmethod
        def firewall_rules() -> list[dict]:
            return [
                {"id": "*1",  "chain": "forward", "action": "drop", "comment": "[NetShield] Auto-block 203.0.113.45",
                 "src_address": "203.0.113.45", "dst_address": "", "protocol": "", "disabled": False, "invalid": False, "bytes": 1024, "packets": 8},
                {"id": "*2",  "chain": "forward", "action": "drop", "comment": "[NetShield] Blacklist_Automatica — brute-force",
                 "src_address": "198.51.100.22", "dst_address": "", "protocol": "", "disabled": False, "invalid": False, "bytes": 512, "packets": 4},
                {"id": "*3",  "chain": "forward", "action": "accept","comment": "Allow established",
                 "src_address": "", "dst_address": "", "protocol": "", "disabled": False, "invalid": False, "bytes": 50_000_000, "packets": 400_000},
                {"id": "*4",  "chain": "input",   "action": "drop",  "comment": "Drop invalid",
                 "src_address": "", "dst_address": "", "protocol": "", "disabled": False, "invalid": False, "bytes": 200, "packets": 3},
                {"id": "*5",  "chain": "forward", "action": "drop",  "comment": "[NetShield] Sinkhole: evil-phishing.com",
                 "src_address": "", "dst_address": "203.0.113.99",   "protocol": "tcp", "disabled": False, "invalid": False, "bytes": 0, "packets": 0},
            ]

        @staticmethod
        def address_lists() -> list[dict]:
            return [
                {"id": "*1", "list": "Blacklist_Automatica", "address": "203.0.113.45",  "comment": "[NetShield] brute-force",    "timeout": "23:45:12", "disabled": False, "dynamic": False},
                {"id": "*2", "list": "Blacklist_Automatica", "address": "198.51.100.22", "comment": "[NetShield] port-scan",      "timeout": "12:00:00", "disabled": False, "dynamic": False},
                {"id": "*3", "list": "Geoblock",             "address": "185.220.0.0/16","comment": "Tor exit node range",         "timeout": "",        "disabled": False, "dynamic": False},
                {"id": "*4", "list": "Sinkhole",             "address": "203.0.113.99",  "comment": "evil-phishing.com",          "timeout": "",        "disabled": False, "dynamic": False},
            ]

        @staticmethod
        def vlans() -> list[dict]:
            return [
                {"id": "*A",  "vlan_id": 10, "name": "vlan10", "interface": "bridge", "comment": "VLAN Docentes",     "disabled": False, "running": True},
                {"id": "*B",  "vlan_id": 20, "name": "vlan20", "interface": "bridge", "comment": "VLAN Estudiantes",  "disabled": False, "running": True},
                {"id": "*C",  "vlan_id": 30, "name": "vlan30", "interface": "bridge", "comment": "VLAN Servidores",   "disabled": False, "running": True},
                {"id": "*D",  "vlan_id": 99, "name": "vlan99", "interface": "bridge", "comment": "VLAN Cuarentena",   "disabled": False, "running": False},
            ]

        @staticmethod
        def vlan_traffic() -> list[dict]:
            return [
                {"vlan_id": 10, "name": "vlan10", "rx_bps": 4_200_000, "tx_bps": 1_800_000, "status": "ok"},
                {"vlan_id": 20, "name": "vlan20", "rx_bps": 1_100_000, "tx_bps": 500_000,   "status": "ok"},
                {"vlan_id": 30, "name": "vlan30", "rx_bps": 850_000,   "tx_bps": 200_000,   "status": "ok"},
                {"vlan_id": 99, "name": "vlan99", "rx_bps": 0,         "tx_bps": 0,          "status": "inactive"},
            ]

        @staticmethod
        def vlan_addresses() -> list[dict]:
            return [
                {"interface": "vlan10", "address": "10.10.10.1/24",  "network": "10.10.10.0", "comment": "GW Docentes",    "disabled": False},
                {"interface": "vlan20", "address": "10.10.20.1/24",  "network": "10.10.20.0", "comment": "GW Estudiantes", "disabled": False},
                {"interface": "vlan30", "address": "10.10.30.1/24",  "network": "10.10.30.0", "comment": "GW Servidores",  "disabled": False},
                {"interface": "vlan99", "address": "10.99.99.1/24",  "network": "10.99.99.0", "comment": "GW Cuarentena",  "disabled": False},
            ]

        @staticmethod
        def traffic() -> list[dict]:
            """Base traffic snapshot per interface (no variation — use websocket for dynamic)."""
            ifaces = ["ether1", "ether2", "ether3", "ether4", "vlan10", "vlan20"]
            rx_base = [5_200_000, 3_100_000, 1_400_000, 800_000, 4_200_000, 1_100_000]
            tx_base = [2_100_000, 1_800_000, 900_000,   200_000, 1_800_000, 500_000]
            return [
                {"interface": iface, "rx_bps": rx, "tx_bps": tx, "status": "ok"}
                for iface, rx, tx in zip(ifaces, rx_base, tx_base)
            ]

        @staticmethod
        def logs(limit: int = 20) -> list[dict]:
            entries = [
                ("firewall",  "input",   f"input: in:ether1 out:ether2 src-mac {_LAB_HOSTS[1]['mac']} proto TCP {_LAB_HOSTS[1]['ip']}:54321->{_ATTACKERS[0]['ip']}:443", 5),
                ("firewall",  "forward", f"forward: in:ether2 src {_LAB_HOSTS[1]['ip']} dst {_ATTACKERS[1]['ip']}, chain=forward action=drop",  12),
                ("dhcp",      "info",    f"assigned 192.168.88.20 to {_LAB_HOSTS[3]['mac']}",  20),
                ("dhcp",      "info",    f"assigned 192.168.88.21 to {_LAB_HOSTS[4]['mac']}",  25),
                ("system",    "info",    "router rebooted",  180),
                ("firewall",  "input",   f"input: dropped brute-force from {_ATTACKERS[0]['ip']}",  8),
                ("hotspot",   "info",    "PC-Aula3-01 logged in (user: alumno01)",  15),
                ("hotspot",   "info",    "PC-Aula3-02 logged in (user: alumno02)",  18),
                ("interface", "warning", "ether3: rx-error count increased to 3",  30),
                ("firewall",  "input",   f"port-scan detected from {_ATTACKERS[1]['ip']}",  45),
            ]
            result = []
            for i, (topics, severity, msg, mins_ago) in enumerate(entries[:limit]):
                result.append({
                    "id": str(i + 1),
                    "time": _ts(mins_ago),
                    "topics": topics,
                    "severity": severity,
                    "message": msg,
                })
            return result

        @staticmethod
        def system_health() -> dict:
            return {
                "version": "7.14.2 (stable)",
                "uptime": "15d 4h 22m 13s",
                "cpu_load": 12,
                "free_memory": 512 * 1024 * 1024,
                "total_memory": 1024 * 1024 * 1024,
                "free_disk": 2048 * 1024 * 1024,
                "board_name": "CHR",
                "architecture_name": "x86_64",
                "platform": "MikroTik",
                "bad_blocks": "0%",
            }

        @staticmethod
        def dns_static() -> list[dict]:
            return [
                {"name": "evil-phishing.com", "address": "127.0.0.1", "type": "A",
                 "ttl": "1d", "comment": "[NetShield] Sinkhole", "disabled": False},
                {"name": "malware-c2.net",    "address": "127.0.0.1", "type": "A",
                 "ttl": "1d", "comment": "[NetShield] Sinkhole", "disabled": False},
            ]

    # ── Wazuh ─────────────────────────────────────────────────────────────────

    class wazuh:

        @staticmethod
        def agents() -> list[dict]:
            return [
                {
                    "id": "000", "name": "wazuh-manager", "ip": "192.168.88.50",
                    "status": "active", "os_name": "Ubuntu", "os_version": "22.04",
                    "manager": "wazuh-manager", "node_name": "node01",
                    "group": ["default"], "last_keep_alive": _ts(1),
                    "date_add": _ts(30 * 24 * 60),
                },
                {
                    "id": "001", "name": "wazuh-phy", "ip": "192.168.100.115",
                    "status": "active", "os_name": "Ubuntu", "os_version": "22.04",
                    "manager": "wazuh-manager", "node_name": "node01",
                    "group": ["servers"], "last_keep_alive": _ts(2),
                    "date_add": _ts(20 * 24 * 60),
                },
                {
                    "id": "004", "name": "lubuntu_desk_1", "ip": "192.168.88.10",
                    "status": "active", "os_name": "Lubuntu", "os_version": "22.04",
                    "manager": "wazuh-manager", "node_name": "node01",
                    "group": ["workstations"], "last_keep_alive": _ts(3),
                    "date_add": _ts(10 * 24 * 60),
                },
                {
                    "id": "005", "name": "lubuntu_desk_2", "ip": "192.168.88.11",
                    "status": "active", "os_name": "Lubuntu", "os_version": "22.04",
                    "manager": "wazuh-manager", "node_name": "node01",
                    "group": ["workstations"], "last_keep_alive": _ts(4),
                    "date_add": _ts(8 * 24 * 60),
                },
                {
                    "id": "006", "name": "PC-Aula3-01", "ip": "192.168.88.20",
                    "status": "disconnected", "os_name": "Windows", "os_version": "10",
                    "manager": "wazuh-manager", "node_name": "node01",
                    "group": ["workstations"], "last_keep_alive": _ts(180),
                    "date_add": _ts(5 * 24 * 60),
                },
            ]

        @staticmethod
        def agents_summary() -> dict:
            return {
                "active": 4, "disconnected": 1, "never_connected": 0,
                "pending": 0, "total": 5,
            }

        @staticmethod
        def alerts(
            limit: int = 50,
            level_min: int | None = None,
            agent_id: str | None = None,
        ) -> list[dict]:
            """Generate coherent alerts using seeded RNG."""
            _r = _random_module.Random(42)
            agent_pool = MockData.wazuh.agents()
            if agent_id:
                agent_pool = [a for a in agent_pool if a["id"] == agent_id] or agent_pool[:1]

            _alert_templates = [
                (12, "Authentication failure", "T1110", "Brute Force", "192.168.88.10", _ATTACKERS[0]["ip"]),
                (14, "Multiple authentication failures", "T1110", "Brute Force", "192.168.88.11", _ATTACKERS[0]["ip"]),
                (7,  "Port scan detected", "T1046", "Network Service Discovery", "192.168.88.50", _ATTACKERS[1]["ip"]),
                (10, "Rootkit detection: hidden file", "T1014", "Rootkit", "192.168.88.10", ""),
                (5,  "System audit: command", "T1059", "Command and Scripting Interpreter", "192.168.88.11", ""),
                (8,  "Phishing site access detected", "T1566", "Phishing", "192.168.88.20", _ATTACKERS[2]["ip"]),
                (6,  "Unexpected outbound connection", "T1071", "Application Layer Protocol", "192.168.88.21", _ATTACKERS[0]["ip"]),
                (9,  "Privilege escalation attempt via sudo", "T1548", "Abuse Elevation Control Mechanism", "192.168.88.10", ""),
                (3,  "Log rotation executed", "", "", "192.168.88.50", ""),
                (4,  "Successful SSH login", "", "", "192.168.88.11", ""),
            ]

            result = []
            for i in range(min(limit * 2, 200)):
                if len(result) >= limit:
                    break
                tmpl = _alert_templates[i % len(_alert_templates)]
                level, desc, mitre_id, mitre_name, agent_ip, src_ip = tmpl
                if level_min and level < level_min:
                    continue
                agent = next((a for a in agent_pool if a["ip"] == agent_ip), _r.choice(agent_pool))
                alert: dict[str, Any] = {
                    "id": f"mock-{i:05d}",
                    "timestamp": _ts(_r.randint(1, 120)),
                    "agent_id": agent["id"],
                    "agent_name": agent["name"],
                    "agent_ip": agent["ip"],
                    "rule_id": f"1{_r.randint(1000, 9999)}",
                    "rule_level": level,
                    "rule_description": desc,
                    "rule_groups": [mitre_name.lower().replace(" ", "_")] if mitre_name else ["syslog"],
                    "full_log": f"[mock] {desc} from {src_ip or agent_ip}",
                    "src_ip": src_ip,
                    "dst_ip": "",
                    "location": f"/var/log/auth.log" if "auth" in desc.lower() else f"/var/ossec/logs/active-responses.log",
                    "mitre_technique": mitre_name,
                    "mitre_id": mitre_id,
                    "dst_url": "http://evil-phishing.com/login" if "phishing" in desc.lower() else "",
                    "user": "root" if "privilege" in desc.lower() else "",
                }
                result.append(alert)
            return result

        @staticmethod
        def critical_alerts(limit: int = 50) -> list[dict]:
            return [a for a in MockData.wazuh.alerts(limit=100, level_min=10)][:limit]

        @staticmethod
        def alerts_timeline(level_min: int = 5, minutes: int = 60) -> list[dict]:
            """Return per-minute bucketed alert counts for the past N minutes."""
            _r = _random_module.Random(42)
            result = []
            for i in range(minutes):
                t = _NOW - timedelta(minutes=minutes - i)
                # Spike at minutes 15 and 45
                base = 2 if (i % 15 == 0) else _r.randint(0, 2)
                spike = 8 if (i in (15, 45)) else 0
                result.append({"minute": t.strftime("%Y-%m-%dT%H:%M:00"), "count": base + spike})
            return result

        @staticmethod
        def top_agents(limit: int = 10) -> list[dict]:
            agents = MockData.wazuh.agents()
            counts = [45, 12, 23, 18, 2]
            techniques = ["Brute Force", "Application Layer Protocol", "Brute Force", "Phishing", ""]
            return [
                {
                    "agent_id": a["id"],
                    "agent_name": a["name"],
                    "alert_count": counts[i],
                    "last_alert_timestamp": _ts(i * 5 + 1),
                    "top_mitre_technique": techniques[i],
                }
                for i, a in enumerate(agents[:limit])
                if counts[i] > 0
            ]

        @staticmethod
        def mitre_summary() -> list[dict]:
            techniques = [
                ("T1110", "Brute Force",                        45, 2),
                ("T1566", "Phishing",                           12, 8),
                ("T1046", "Network Service Discovery",          8,  15),
                ("T1014", "Rootkit",                            3,  30),
                ("T1548", "Abuse Elevation Control Mechanism",  2,  60),
                ("T1059", "Command and Scripting Interpreter",  7,  20),
                ("T1071", "Application Layer Protocol",         5,  10),
            ]
            return [
                {
                    "technique_id": tid, "technique_name": name,
                    "count": count, "last_seen": _ts(last_mins),
                }
                for tid, name, count, last_mins in techniques
            ]

        @staticmethod
        def health() -> dict:
            return {
                "services": [
                    {"service_name": "wazuh-analysisd", "status": "running"},
                    {"service_name": "wazuh-remoted",   "status": "running"},
                    {"service_name": "wazuh-syscheckd", "status": "running"},
                    {"service_name": "wazuh-monitord",  "status": "running"},
                    {"service_name": "wazuh-db",        "status": "running"},
                    {"service_name": "wazuh-apid",      "status": "running"},
                    {"service_name": "filebeat",        "status": "running"},
                ],
                "version": "4.7.1",
                "cluster_enabled": False,
            }

        @staticmethod
        def phishing_alerts() -> list[dict]:
            base = MockData.wazuh.alerts(limit=50)
            return [a for a in base if "phishing" in a["rule_description"].lower() or a["dst_url"]]

    # ── GLPI ─────────────────────────────────────────────────────────────────

    class glpi:

        @staticmethod
        def computers(limit: int = 20) -> list[dict]:
            computers = [
                {"id": 1,  "name": "PC-Lab-01",     "ip": "192.168.88.10",  "mac": "52:54:00:AA:BB:01",
                 "os": "Lubuntu 22.04",   "cpu": "AMD Ryzen 5 3600",   "ram": "16",
                 "location": "Lab Redes", "location_id": 3, "status": "activo",
                 "serial": "SN100001", "assigned_user": "juan.perez", "comment": "", "last_update": _ts(60), "tickets": []},
                {"id": 2,  "name": "PC-Lab-02",     "ip": "192.168.88.11",  "mac": "52:54:00:AA:BB:02",
                 "os": "Lubuntu 22.04",   "cpu": "AMD Ryzen 5 3600",   "ram": "16",
                 "location": "Lab Redes", "location_id": 3, "status": "activo",
                 "serial": "SN100002", "assigned_user": "maria.garcia", "comment": "", "last_update": _ts(120), "tickets": []},
                {"id": 3,  "name": "PC-Aula3-01",   "ip": "192.168.88.20",  "mac": "52:54:00:CC:DD:01",
                 "os": "Windows 10",      "cpu": "Intel Core i5-10400",  "ram": "8",
                 "location": "Aula 101",  "location_id": 1, "status": "activo",
                 "serial": "SN100003", "assigned_user": "", "comment": "Wazuh agent disconnected", "last_update": _ts(200), "tickets": []},
                {"id": 4,  "name": "PC-Aula3-02",   "ip": "192.168.88.21",  "mac": "52:54:00:CC:DD:02",
                 "os": "Windows 10",      "cpu": "Intel Core i5-10400",  "ram": "8",
                 "location": "Aula 101",  "location_id": 1, "status": "activo",
                 "serial": "SN100004", "assigned_user": "", "comment": "", "last_update": _ts(180), "tickets": []},
                {"id": 5,  "name": "Server-Wazuh",  "ip": "192.168.88.50",  "mac": "52:54:00:FF:00:01",
                 "os": "Ubuntu 22.04",    "cpu": "Intel Core i7-10700",  "ram": "32",
                 "location": "Sala Servidores", "location_id": 5, "status": "activo",
                 "serial": "SN100005", "assigned_user": "admin", "comment": "[NetShield] Wazuh SIEM server", "last_update": _ts(30), "tickets": []},
                {"id": 6,  "name": "PC-Aula2-01",   "ip": "192.168.88.30",  "mac": "52:54:00:DD:01:01",
                 "os": "Windows 11",      "cpu": "Intel Core i5-12600",  "ram": "16",
                 "location": "Aula 102",  "location_id": 2, "status": "reparacion",
                 "serial": "SN100006", "assigned_user": "", "comment": "Disco duro con sectores dañados", "last_update": _ts(500), "tickets": []},
                {"id": 7,  "name": "PC-Lab-Sis-01", "ip": "192.168.88.40",  "mac": "52:54:00:EE:01:01",
                 "os": "Debian 12",       "cpu": "AMD Ryzen 7 5700",     "ram": "32",
                 "location": "Lab Sistemas", "location_id": 4, "status": "activo",
                 "serial": "SN100007", "assigned_user": "tecnico1", "comment": "", "last_update": _ts(90), "tickets": []},
                {"id": 8,  "name": "PC-Retirado-01","ip": "",               "mac": "",
                 "os": "Windows 7",       "cpu": "Intel Core i3-3220",   "ram": "4",
                 "location": "Aula 101",  "location_id": 1, "status": "retirado",
                 "serial": "SN099001", "assigned_user": "", "comment": "EOL — hardware obsoleto", "last_update": _ts(8640), "tickets": []},
            ]
            return computers[:limit]

        @staticmethod
        def stats() -> dict:
            return {"activo": 5, "reparacion": 1, "retirado": 1, "pendiente": 0, "total": 7}

        @staticmethod
        def tickets(limit: int = 10) -> list[dict]:
            tickets = [
                {"id": 1,  "title": "[NetShield] Alerta crítica — multiple auth failures en PC-Lab-01",
                 "description": "Se detectaron múltiples intentos de autenticación fallida desde 203.0.113.45.",
                 "priority": 5, "priority_label": "Muy Alta", "status": "en_progreso", "status_id": 3,
                 "assigned_user": "tecnico1", "asset_name": "PC-Lab-01", "asset_id": 1,
                 "category": "seguridad", "created_at": _ts(45), "due_date": "", "is_netshield": True},
                {"id": 2,  "title": "Falla de disco — PC-Aula2-01",
                 "description": "Error de E/S en /dev/sda. Requiere reemplazo de disco.",
                 "priority": 4, "priority_label": "Alta", "status": "pendiente", "status_id": 1,
                 "assigned_user": "", "asset_name": "PC-Aula2-01", "asset_id": 6,
                 "category": "hardware", "created_at": _ts(200), "due_date": "", "is_netshield": False},
                {"id": 3,  "title": "Actualización pendiente — PC-Aula3-01",
                 "description": "Windows 10 sin actualizaciones hace 60 días. Wazuh reporta vulnerabilidades.",
                 "priority": 3, "priority_label": "Media", "status": "pendiente", "status_id": 1,
                 "assigned_user": "tecnico1", "asset_name": "PC-Aula3-01", "asset_id": 3,
                 "category": "so", "created_at": _ts(300), "due_date": "", "is_netshield": False},
                {"id": 4,  "title": "[NetShield] Cuarentena automática — PC-Lab-01",
                 "description": "Cuarentena iniciada automáticamente por NetShield Dashboard.\nMotivo: brute-force desde 203.0.113.45",
                 "priority": 5, "priority_label": "Muy Alta", "status": "resuelto", "status_id": 5,
                 "assigned_user": "tecnico1", "asset_name": "PC-Lab-01", "asset_id": 1,
                 "category": "seguridad", "created_at": _ts(480), "due_date": "", "is_netshield": True},
                {"id": 5,  "title": "Error de red — ether3 con errores de RX",
                 "description": "Interface ether3 reporta 3 errores de RX. Requiere revisión de cable.",
                 "priority": 3, "priority_label": "Media", "status": "pendiente", "status_id": 1,
                 "assigned_user": "", "asset_name": "", "asset_id": None,
                 "category": "red", "created_at": _ts(30), "due_date": "", "is_netshield": False},
            ]
            return tickets[:limit]

        @staticmethod
        def users() -> list[dict]:
            return [
                {"id": 1, "name": "juan.perez",    "realname": "Pérez",    "firstname": "Juan",
                 "email": "juan.perez@facultad.edu",    "department": "Docentes",       "display_name": "Juan Pérez"},
                {"id": 2, "name": "maria.garcia",  "realname": "García",   "firstname": "María",
                 "email": "maria.garcia@facultad.edu",  "department": "Administrativos","display_name": "María García"},
                {"id": 3, "name": "tecnico1",      "realname": "López",    "firstname": "Carlos",
                 "email": "tecnico1@facultad.edu",      "department": "IT",             "display_name": "Carlos López"},
                {"id": 4, "name": "admin",         "realname": "Admin",    "firstname": "Sistema",
                 "email": "admin@facultad.edu",         "department": "IT",             "display_name": "Sistema Admin"},
                {"id": 5, "name": "ana.martinez",  "realname": "Martínez", "firstname": "Ana",
                 "email": "ana.martinez@facultad.edu",  "department": "Docentes",       "display_name": "Ana Martínez"},
            ]

        @staticmethod
        def locations() -> list[dict]:
            return [
                {"id": 1, "name": "Aula 101",       "completename": "Edificio A > Aula 101",       "comment": "",                     "building": "A", "room": "101"},
                {"id": 2, "name": "Aula 102",       "completename": "Edificio A > Aula 102",       "comment": "",                     "building": "A", "room": "102"},
                {"id": 3, "name": "Lab Redes",      "completename": "Edificio B > Lab Redes",      "comment": "Laboratorio de redes", "building": "B", "room": "201"},
                {"id": 4, "name": "Lab Sistemas",   "completename": "Edificio B > Lab Sistemas",   "comment": "",                     "building": "B", "room": "202"},
                {"id": 5, "name": "Sala Servidores","completename": "Edificio C > Sala Servidores","comment": "Rack principal",       "building": "C", "room": "001"},
            ]

    # ── Anthropic ─────────────────────────────────────────────────────────────

    class anthropic:

        @staticmethod
        def report_html() -> dict:
            html = """
<h1>Informe de Seguridad — NetShield Dashboard</h1>
<p><em>Período: últimas 24 horas | Audiencia: Técnico</em></p>

<h2>Resumen Ejecutivo</h2>
<p>Durante el período analizado se detectaron <strong>45 alertas de seguridad</strong>,
de las cuales <strong>14 son críticas</strong> (nivel ≥ 10). La amenaza principal identificada
es un ataque de fuerza bruta sostenido desde <code>203.0.113.45</code> contra
<code>PC-Lab-01 (192.168.88.10)</code>.</p>

<h2>Alertas por Severidad</h2>
<ul>
  <li><strong>Críticas (≥10):</strong> 14 alertas</li>
  <li><strong>Altas (7-9):</strong> 18 alertas</li>
  <li><strong>Medias (4-6):</strong> 13 alertas</li>
</ul>

<h2>Técnicas MITRE ATT&amp;CK Detectadas</h2>
<table>
  <thead><tr><th>Técnica</th><th>ID</th><th>Ocurrencias</th></tr></thead>
  <tbody>
    <tr><td>Brute Force</td><td>T1110</td><td>45</td></tr>
    <tr><td>Phishing</td><td>T1566</td><td>12</td></tr>
    <tr><td>Network Service Discovery</td><td>T1046</td><td>8</td></tr>
  </tbody>
</table>

<h2>Acciones Recomendadas</h2>
<ol>
  <li>Mantener bloqueo de <code>203.0.113.45</code> en Blacklist_Automatica.</li>
  <li>Revisar logs de autenticación en <code>PC-Lab-01</code> y <code>PC-Lab-02</code>.</li>
  <li>Actualizar sistema operativo en <code>PC-Aula3-01</code> (Windows 10 sin parches).</li>
  <li>Revisar cable de interface <code>ether3</code> (errores de RX detectados).</li>
</ol>
"""
            return {
                "title": "Informe de Seguridad — últimas 24h",
                "html": html.strip(),
                "audience": "tecnico",
                "tokens_used": 1247,
                "mock": True,
            }

    # ── AI (Anthropic) ────────────────────────────────────────────────────────

    class ai:

        @staticmethod
        def mock_report(prompt: str = "", audience: str = "technical") -> dict:
            """Return a pre-built mock HTML report without calling Anthropic API."""
            base = MockData.anthropic.report_html()
            return {
                "html_content": base["html"],
                "title": base["title"],
                "summary": prompt[:200] if prompt else "Informe de seguridad de demostración generado en modo mock.",
                "data_sources_used": ["get_wazuh_alerts", "get_mikrotik_connections"],
                "tokens_used": base["tokens_used"],
                "mock": True,
            }

    # ── Portal Cautivo ────────────────────────────────────────────────────────

    class portal:

        @staticmethod
        def profiles() -> list[dict]:
            return [
                {"name": "default",        "rate_limit": "10M/10M",    "session_timeout": "8h",  "idle_timeout": "30m", "shared_users": 1},
                {"name": "docentes",       "rate_limit": "50M/50M",    "session_timeout": "12h", "idle_timeout": "1h",  "shared_users": 1},
                {"name": "estudiantes",    "rate_limit": "5M/5M",      "session_timeout": "4h",  "idle_timeout": "15m", "shared_users": 1},
                {"name": "unregistered",   "rate_limit": "1M/1M",      "session_timeout": "1h",  "idle_timeout": "10m", "shared_users": 0},
                {"name": "administracion", "rate_limit": "100M/100M",  "session_timeout": "24h", "idle_timeout": "2h",  "shared_users": 1},
            ]

        @staticmethod
        def users() -> list[dict]:
            return [
                {"name": "juan.perez",  "profile": "docentes",    "password": "***", "comment": "Docente Lab Redes", "uptime_limit": "", "bytes_in": 1_234_567, "bytes_out": 456_789, "disabled": False},
                {"name": "maria.garcia","profile": "docentes",    "password": "***", "comment": "Docente Sistemas",  "uptime_limit": "", "bytes_in": 876_543,   "bytes_out": 234_567, "disabled": False},
                {"name": "alumno01",    "profile": "estudiantes", "password": "***", "comment": "Aula 3",           "uptime_limit": "4h", "bytes_in": 234_567, "bytes_out": 56_789,  "disabled": False},
                {"name": "alumno02",    "profile": "estudiantes", "password": "***", "comment": "Aula 3",           "uptime_limit": "4h", "bytes_in": 198_765, "bytes_out": 43_210,  "disabled": False},
                {"name": "admin",       "profile": "administracion","password":"***", "comment": "Administrador",   "uptime_limit": "", "bytes_in": 5_678_901,  "bytes_out": 2_345_678, "disabled": False},
            ]

        @staticmethod
        def active_sessions() -> list[dict]:
            return [
                {"id": "sess-001", "user": "alumno01",   "address": "192.168.88.20", "mac": "52:54:00:CC:DD:01",
                 "uptime": "1h 23m", "idle": "0s", "bytes_in": 234_567, "bytes_out": 56_789, "session_time_left": "2h 37m"},
                {"id": "sess-002", "user": "alumno02",   "address": "192.168.88.21", "mac": "52:54:00:CC:DD:02",
                 "uptime": "0h 45m", "idle": "2m", "bytes_in": 198_765, "bytes_out": 43_210, "session_time_left": "3h 15m"},
                {"id": "sess-003", "user": "juan.perez", "address": "192.168.88.10", "mac": "52:54:00:AA:BB:01",
                 "uptime": "4h 12m", "idle": "0s", "bytes_in": 1_234_567, "bytes_out": 456_789, "session_time_left": "7h 48m"},
                {"id": "sess-004", "user": "",           "address": "192.168.88.100","mac": "52:54:00:EE:EE:EE",
                 "uptime": "0h 05m", "idle": "0s", "bytes_in": 12_345, "bytes_out": 4_567, "session_time_left": "0h 55m"},
            ]

        @staticmethod
        def session_history(limit: int = 20) -> list[dict]:
            history = []
            users = ["alumno01", "alumno02", "juan.perez", "maria.garcia", "", "alumno01"]
            for i, user in enumerate(users[:limit]):
                history.append({
                    "id": f"hist-{i:03d}",
                    "user": user or "(no registrado)",
                    "address": _LAB_HOSTS[i % len(_LAB_HOSTS)]["ip"],
                    "mac": _LAB_HOSTS[i % len(_LAB_HOSTS)]["mac"],
                    "from": _ts((i + 1) * 60),
                    "till": _ts(i * 60),
                    "uptime": f"{(i % 4) + 1}h {(i * 7) % 60}m",
                    "bytes_in": (i + 1) * 100_000,
                    "bytes_out": (i + 1) * 30_000,
                })
            return history

        @staticmethod
        def realtime_stats() -> dict:
            sessions = MockData.portal.active_sessions()
            total_in  = sum(s["bytes_in"]  for s in sessions)
            total_out = sum(s["bytes_out"] for s in sessions)
            return {
                "active_sessions": len(sessions),
                "registered_sessions": 3,
                "unregistered_sessions": 1,
                "total_bytes_in": total_in,
                "total_bytes_out": total_out,
                "peak_sessions_today": 12,
                "hotspot_initialized": True,
            }

        @staticmethod
        def summary_stats() -> dict:
            return {
                "total_unique_users": 23,
                "sessions_today": 15,
                "sessions_this_week": 87,
                "top_users": [
                    {"user": "juan.perez", "session_count": 5, "total_bytes_in": 5_678_901},
                    {"user": "maria.garcia", "session_count": 4, "total_bytes_in": 3_456_789},
                    {"user": "alumno01", "session_count": 12, "total_bytes_in": 1_234_567},
                ],
                "heatmap": [
                    {"hour": h, "day": d, "count": _rng.randint(0, 8)}
                    for d in range(7) for h in range(24)
                ],
                "hotspot_initialized": True,
            }

        @staticmethod
        def hotspot_config() -> dict:
            return {
                "hotspot_initialized": True,
                "server": {"name": "hotspot1", "interface": "hotspot1", "address_pool": "hs-pool-1"},
                "profile": {"name": "hsprof1", "login_by": "http chap", "use_radius": False},
                "dns_name": "hotspot.facultad.local",
            }

        @staticmethod
        def hotspot_status() -> dict:
            return {"hotspot_initialized": True, "server_name": "hotspot1", "interface": "hotspot1"}

        @staticmethod
        def schedule() -> dict:
            return {
                "enabled": False,
                "allowed_hours": {"hour_from": 7, "hour_to": 22},
                "blocked_days": ["saturday", "sunday"],
                "scope": "unregistered",
            }

        @staticmethod
        def setup_result() -> dict:
            return {
                "success": True,
                "message": "Hotspot inicializado en modo demo. No se realizaron cambios en el MikroTik real.",
                "mock": True,
                "steps": [
                    {"step": "ip_pool",     "status": "ok", "detail": "Pool hs-pool-1 (demo)"},
                    {"step": "profile",     "status": "ok", "detail": "Perfil hsprof1 (demo)"},
                    {"step": "server",      "status": "ok", "detail": "Servidor hotspot1 (demo)"},
                    {"step": "users",       "status": "ok", "detail": "Usuarios default cargados (demo)"},
                ],
            }

        @staticmethod
        def session_chart() -> list[dict]:
            result = []
            for i in range(30):
                t = _NOW - timedelta(minutes=(30 - i) * 2)
                base = 3
                spike = 2 if i in (10, 20) else 0
                result.append({"timestamp": t.isoformat(), "active": base + spike})
            return result

    # ── WebSocket generators (dynamic, tick-based) ────────────────────────────

    class websocket:

        @staticmethod
        def traffic_tick(tick: int) -> dict:
            """Generate traffic data. ±10% variation, spike at tick % 30 == 0."""
            _r = _random_module.Random(tick)
            base_interfaces = [
                ("ether1",  5_200_000, 2_100_000),
                ("ether2",  3_100_000, 1_800_000),
                ("ether3",  1_400_000,   900_000),
                ("ether4",    800_000,   200_000),
                ("vlan10",  4_200_000, 1_800_000),
                ("vlan20",  1_100_000,   500_000),
            ]
            spike = tick % 30 == 0
            interfaces = []
            for name, rx_base, tx_base in base_interfaces:
                factor = 2.5 if spike else 1.0
                jitter = _r.uniform(0.9, 1.1)
                interfaces.append({
                    "interface": name,
                    "rx_bps": int(rx_base * factor * jitter),
                    "tx_bps": int(tx_base * factor * jitter),
                    "status": "ok",
                })
            return {"tick": tick, "timestamp": datetime.now(timezone.utc).isoformat(), "interfaces": interfaces}

        @staticmethod
        def vlan_traffic_tick(tick: int) -> dict:
            _r = _random_module.Random(tick + 1000)
            vlans = [
                (10, "vlan10", 4_200_000, 1_800_000),
                (20, "vlan20", 1_100_000,   500_000),
                (30, "vlan30",   850_000,   200_000),
                (99, "vlan99",         0,         0),
            ]
            result = []
            for vid, name, rx_base, tx_base in vlans:
                jitter = _r.uniform(0.88, 1.12) if rx_base > 0 else 1.0
                result.append({"vlan_id": vid, "name": name,
                                "rx_bps": int(rx_base * jitter),
                                "tx_bps": int(tx_base * jitter), "status": "ok"})
            return {"tick": tick, "timestamp": datetime.now(timezone.utc).isoformat(), "vlans": result}

        @staticmethod
        def alerts_tick(tick: int) -> dict | None:
            """Emit a Wazuh alert every ~5 ticks (25s)."""
            if tick % 5 != 0:
                return None
            alerts = MockData.wazuh.alerts(limit=20)
            idx = (tick // 5) % len(alerts)
            alert = dict(alerts[idx])
            alert["id"] = f"ws-{tick:05d}"
            alert["timestamp"] = datetime.now(timezone.utc).isoformat()
            return alert

        @staticmethod
        def security_alert(tick: int) -> dict | None:
            """Emit a security notification every ~9 ticks (~45s)."""
            if tick % 9 != 0:
                return None
            _r = _random_module.Random(tick)
            options = [
                {"type": "new_block",    "ip": _ATTACKERS[0]["ip"], "reason": "brute-force",  "level": "critical"},
                {"type": "alert_spike",  "ip": "",                  "reason": "12 alertas en 1 minuto", "level": "warning"},
                {"type": "phishing",     "ip": _ATTACKERS[2]["ip"], "reason": "acceso a dominio sinkhole","level": "high"},
            ]
            return _r.choice(options)

        @staticmethod
        def portal_session(tick: int) -> dict:
            """Return portal session snapshot. ±1 session every 15 ticks."""
            sessions = MockData.portal.active_sessions()
            if tick % 15 == 0:
                count = len(sessions) + 1
            elif tick % 15 == 7:
                count = max(1, len(sessions) - 1)
            else:
                count = len(sessions)
            return {
                "tick": tick,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "active_sessions": count,
                "sessions": sessions[:count],
            }
