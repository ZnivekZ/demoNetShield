"""
AI Service - OpenRouter integration with function calling for report generation.

Design decisions:
- Uses OpenAI Python SDK configured to point to OpenRouter (base_url override)
- OpenRouter exposes an OpenAI-compatible API, supporting tool calling
- Default model: openrouter/auto (free tier, auto-selects best available free model)
- Model is fixed to openrouter/auto — selection is not exposed to users
- Functions exposed to AI cover all backend services: MikroTik, Wazuh, CrowdSec,
  Suricata, GLPI, and system health aggregation
- Audience parameter adjusts system prompt for tone/depth
- HTML output ready for TipTap editor and WeasyPrint PDF export
"""

from __future__ import annotations

import json
from typing import Any

import structlog
try:
    from openai import OpenAI
except ImportError:
    OpenAI = None  # type: ignore


from config import get_settings
from services.mikrotik_service import get_mikrotik_service
from services.wazuh_service import get_wazuh_service

logger = structlog.get_logger(__name__)

# ── Report Templates ──────────────────────────────────────────────

REPORT_TEMPLATES = [
    {
        "id": "weekly_security",
        "name": "Reporte Semanal de Seguridad",
        "description": "Resumen ejecutivo de alertas críticas, tendencias y recomendaciones de la semana",
        "icon": "📊",
        "audience": "executive",
        "data_sources": ["wazuh_alerts", "crowdsec_decisions", "system_health"],
        "prompt": "Genera un reporte ejecutivo semanal de seguridad. Incluye: resumen de alertas críticas detectadas, tendencias de amenazas, IPs bloqueadas más relevantes, estado general de la infraestructura, y recomendaciones priorizadas para la próxima semana.",
    },
    {
        "id": "firewall_audit",
        "name": "Auditoría de Firewall",
        "description": "Análisis de reglas activas, puertos expuestos y anomalías de tráfico detectadas",
        "icon": "🛡️",
        "audience": "technical",
        "data_sources": ["firewall_rules", "arp_table", "mikrotik_connections", "mikrotik_nat", "mikrotik_address_lists"],
        "prompt": "Realiza una auditoría técnica completa del firewall. Analiza: reglas activas (indicando cuáles son redundantes u obsoletas), reglas NAT, listas de direcciones bloqueadas/permitidas, conexiones activas sospechosas, tabla ARP (dispositivos no reconocidos), y propone mejoras de configuración con comandos específicos.",
    },
    {
        "id": "incident_analysis",
        "name": "Análisis de Incidente",
        "description": "Reporte post-incidente: cronología, IOCs, impacto y plan de remediación",
        "icon": "🚨",
        "audience": "technical",
        "data_sources": ["wazuh_critical", "crowdsec_alerts", "suricata_alerts", "wazuh_mitre"],
        "prompt": "Genera un reporte de análisis post-incidente de seguridad. Incluye: cronología detallada de eventos, indicadores de compromiso (IOCs) identificados, técnicas MITRE ATT&CK relevantes, alcance e impacto del incidente, acciones de contención realizadas, y plan de remediación paso a paso.",
    },
    {
        "id": "infrastructure_status",
        "name": "Estado de Infraestructura",
        "description": "Salud de servicios, métricas de rendimiento e inventario de activos",
        "icon": "💻",
        "audience": "operational",
        "data_sources": ["system_health", "mikrotik_health", "mikrotik_interfaces", "glpi_inventory", "glpi_stats"],
        "prompt": "Genera un reporte operacional del estado actual de la infraestructura. Incluye: métricas de salud de todos los servicios (CPU, RAM, uptime), estado de interfaces de red, inventario de activos según GLPI, estadísticas de activos, servicios con problemas o degradados, y checklist de tareas de mantenimiento recomendadas.",
    },
    {
        "id": "compliance_report",
        "name": "Reporte de Cumplimiento",
        "description": "Controles de seguridad activos, brechas identificadas y plan de remediación",
        "icon": "📋",
        "audience": "executive",
        "data_sources": ["wazuh_alerts", "firewall_rules", "glpi_inventory", "glpi_tickets"],
        "prompt": "Genera un reporte de cumplimiento de seguridad. Evalúa: controles de seguridad activos y su efectividad, brechas de cumplimiento identificadas, vulnerabilidades conocidas en el inventario de activos, tickets de soporte abiertos relacionados con seguridad, nivel de riesgo global (Crítico/Alto/Medio/Bajo), y plan de remediación con responsables y plazos sugeridos.",
    },
]

# ── Tool definitions (OpenAI format for tool calling) ─────────────
# Each tool maps to an existing service method in the backend.

TOOLS = [
    # ── MikroTik ──────────────────────────────────────────────────
    {
        "type": "function",
        "function": {
            "name": "get_mikrotik_connections",
            "description": "Fetch active network connections from MikroTik router. Returns source/destination IPs, protocols, connection states and timeouts.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_firewall_rules",
            "description": "Fetch current firewall filter rules from MikroTik. Returns chain, action, src/dst addresses, and packet/byte counters.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_arp_table",
            "description": "Fetch the ARP table from MikroTik router. Returns IP-to-MAC address mappings for all devices on the local network.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_mikrotik_interfaces",
            "description": "Fetch network interface status from MikroTik. Returns each interface name, type, up/down state, TX/RX traffic bytes, MTU, and MAC address.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_mikrotik_vlans",
            "description": "Fetch VLAN configuration from MikroTik. Returns active VLANs with ID, name, interface, and traffic stats.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_mikrotik_address_lists",
            "description": "Fetch firewall address lists from MikroTik. Returns IP addresses grouped by list name (e.g., blocked IPs, allowed IPs, custom lists).",
            "parameters": {
                "type": "object",
                "properties": {
                    "list_name": {
                        "type": "string",
                        "description": "Optional: name of a specific address list to fetch. If omitted, returns all lists.",
                    }
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_mikrotik_dns",
            "description": "Fetch static DNS records configured on MikroTik. Returns domain-to-IP mappings for locally resolved hostnames.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_mikrotik_dhcp",
            "description": "Fetch active DHCP leases from MikroTik. Returns assigned IP addresses with MAC address, hostname, expiry time, and server name.",
            "parameters": {
                "type": "object",
                "properties": {
                    "server": {
                        "type": "string",
                        "description": "Optional: filter by specific DHCP server name.",
                    }
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_mikrotik_logs",
            "description": "Fetch recent log entries from MikroTik router. Returns timestamped entries with topic (firewall, dhcp, system) and message.",
            "parameters": {
                "type": "object",
                "properties": {
                    "limit": {"type": "integer", "description": "Maximum log entries to return (default: 50)"},
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_mikrotik_health",
            "description": "Fetch MikroTik system health: CPU usage %, RAM usage %, uptime, temperature, and voltage.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_mikrotik_nat",
            "description": "Fetch NAT rules from MikroTik. Returns DNAT/SNAT rules with chain, action, src/dst addresses and ports.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    # ── Wazuh ─────────────────────────────────────────────────────
    {
        "type": "function",
        "function": {
            "name": "get_wazuh_alerts",
            "description": "Fetch recent security alerts from Wazuh SIEM. Returns alerts with severity level, agent info, rule ID, and description.",
            "parameters": {
                "type": "object",
                "properties": {
                    "limit": {"type": "integer", "description": "Maximum number of alerts to fetch (default: 50)"},
                    "level_min": {"type": "integer", "description": "Minimum alert level to filter (1-15). Higher = more critical."},
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_wazuh_critical_alerts",
            "description": "Fetch only critical Wazuh alerts (level >= 12). Returns alerts with MITRE ATT&CK technique information.",
            "parameters": {
                "type": "object",
                "properties": {
                    "limit": {"type": "integer", "description": "Maximum number of critical alerts to return (default: 20)"},
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_wazuh_agents",
            "description": "Fetch Wazuh agent details. Returns each agent's name, status (active/disconnected), OS, version, IP, and last connection time.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_wazuh_mitre",
            "description": "Fetch MITRE ATT&CK summary from Wazuh. Returns techniques and tactics detected with alert counts, mapped to the ATT&CK framework.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    # ── CrowdSec ──────────────────────────────────────────────────
    {
        "type": "function",
        "function": {
            "name": "get_crowdsec_decisions",
            "description": "Fetch active CrowdSec decisions (currently blocked IPs/ranges). Returns IP, type, duration, scenario, and origin for each decision.",
            "parameters": {
                "type": "object",
                "properties": {
                    "limit": {"type": "integer", "description": "Maximum number of decisions to return (default: 100)"},
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_crowdsec_alerts",
            "description": "Fetch CrowdSec scenario alerts (detected attacks). Returns brute-force attempts, port scans, and other threat scenarios with details.",
            "parameters": {
                "type": "object",
                "properties": {
                    "limit": {"type": "integer", "description": "Maximum number of alerts to return (default: 50)"},
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_crowdsec_metrics",
            "description": "Fetch CrowdSec engine metrics: parser performance, bouncer statistics, and scenario execution counts.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    # ── Suricata ──────────────────────────────────────────────────
    {
        "type": "function",
        "function": {
            "name": "get_suricata_alerts",
            "description": "Fetch recent Suricata IDS/IPS alerts. Returns detected threats with signature name, severity, category, and source/destination IPs.",
            "parameters": {
                "type": "object",
                "properties": {
                    "limit": {"type": "integer", "description": "Maximum number of alerts to return (default: 50)"},
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_suricata_flows",
            "description": "Fetch network flows monitored by Suricata. Returns TCP/UDP flows with source/destination IP:port, bytes transferred, and duration.",
            "parameters": {
                "type": "object",
                "properties": {
                    "limit": {"type": "integer", "description": "Maximum number of flows to return (default: 100)"},
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_suricata_dns",
            "description": "Fetch DNS queries captured by Suricata. Returns queried domains, record types (A, AAAA, MX), and DNS responses.",
            "parameters": {
                "type": "object",
                "properties": {
                    "limit": {"type": "integer", "description": "Maximum number of DNS queries to return (default: 100)"},
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_suricata_http",
            "description": "Fetch HTTP transactions captured by Suricata. Returns URLs accessed, HTTP methods, response codes, user-agents, and server info.",
            "parameters": {
                "type": "object",
                "properties": {
                    "limit": {"type": "integer", "description": "Maximum number of HTTP transactions to return (default: 100)"},
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_suricata_tls",
            "description": "Fetch TLS handshakes captured by Suricata. Returns certificate info, TLS version, SNI (hostname), and cipher suites used in encrypted connections.",
            "parameters": {
                "type": "object",
                "properties": {
                    "limit": {"type": "integer", "description": "Maximum number of TLS handshakes to return (default: 100)"},
                },
                "required": [],
            },
        },
    },
    # ── GLPI ──────────────────────────────────────────────────────
    {
        "type": "function",
        "function": {
            "name": "get_glpi_inventory",
            "description": "Fetch asset inventory from GLPI. Returns computers and devices with model, operating system, status, location, and assigned user.",
            "parameters": {
                "type": "object",
                "properties": {
                    "limit": {"type": "integer", "description": "Maximum number of assets to return (default: 50)"},
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_glpi_stats",
            "description": "Fetch asset statistics from GLPI. Returns totals by asset type, operational status counts, and location distribution.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_glpi_tickets",
            "description": "Fetch support tickets from GLPI. Returns open incidents and service requests with priority, status, assigned technician, and creation date.",
            "parameters": {
                "type": "object",
                "properties": {
                    "limit": {"type": "integer", "description": "Maximum number of tickets to return (default: 30)"},
                    "status": {"type": "integer", "description": "Filter by ticket status (1=new, 2=assigned, 3=planned, 4=pending, 5=solved, 6=closed)"},
                },
                "required": [],
            },
        },
    },
    # ── System ────────────────────────────────────────────────────
    {
        "type": "function",
        "function": {
            "name": "get_system_health",
            "description": "Fetch consolidated health status from all systems: MikroTik (CPU/RAM/uptime), Wazuh (agents/alert counts), CrowdSec (active decisions), Suricata (engine status). Use this for overview queries.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
]

# ── System prompts by audience ────────────────────────────────────

SYSTEM_PROMPTS = {
    "executive": """You are a senior cybersecurity analyst writing a security report for C-level executives and board members.
Your writing must be:
- Clear, concise, and free of technical jargon
- Focused on business impact, risk levels, and recommended actions
- Use bullet points and summaries over detailed technical analysis
- Include risk ratings (Critical/High/Medium/Low) with business context
- Highlight trends and patterns, not individual events
- End with clear, prioritized recommendations
Output the report as clean HTML suitable for PDF export.""",
    "technical": """You are a senior cybersecurity engineer writing a detailed technical security report for the SOC team.
Your writing must be:
- Technically precise with IP addresses, port numbers, protocols, and rule IDs
- Include IOCs (Indicators of Compromise) when applicable
- Reference specific Wazuh rule IDs and MITRE ATT&CK techniques where relevant
- Provide correlation analysis between different data sources
- Include raw data tables where helpful
- Suggest specific remediation steps with commands/configurations
Output the report as clean HTML suitable for PDF export.""",
    "operational": """You are a network security analyst writing an operational security report for the IT operations team.
Your writing must be:
- Actionable and procedural
- Include specific steps to address each finding
- Balance technical detail with clarity
- Organize by priority and affected systems
- Include relevant network topology context
- Provide checklists for remediation tasks
Output the report as clean HTML suitable for PDF export.""",
}

TELEGRAM_SYSTEM_PROMPT = """You are the NetShield security bot responding to queries via Telegram.
Your responses must be:
- Concise: maximum 500 words, prefer bullet points and short lines
- Use Telegram HTML format: <b>bold</b>, <i>italic</i>, <code>code</code>
- Use emojis for visual hierarchy: 🚨 ✅ ⚠️ 🔒 📊 💻
- NEVER execute destructive actions (block, quarantine, delete)
- Only report information, status, and recommendations
- If asked to perform an action, explain that actions must be taken from the dashboard
- Include relevant numbers, timestamps, and IP addresses when available
- Be helpful and security-focused
"""

# ── Source ID → tool name mapping ────────────────────────────────
# Used to filter which tools are exposed based on selected data_sources

SOURCE_TO_TOOL: dict[str, str] = {
    # MikroTik
    "mikrotik_connections":   "get_mikrotik_connections",
    "firewall_rules":         "get_firewall_rules",
    "arp_table":              "get_arp_table",
    "mikrotik_interfaces":    "get_mikrotik_interfaces",
    "mikrotik_vlans":         "get_mikrotik_vlans",
    "mikrotik_address_lists": "get_mikrotik_address_lists",
    "mikrotik_dns":           "get_mikrotik_dns",
    "mikrotik_dhcp":          "get_mikrotik_dhcp",
    "mikrotik_logs":          "get_mikrotik_logs",
    "mikrotik_health":        "get_mikrotik_health",
    "mikrotik_nat":           "get_mikrotik_nat",
    # Wazuh
    "wazuh_alerts":           "get_wazuh_alerts",
    "wazuh_critical":         "get_wazuh_critical_alerts",
    "wazuh_agents":           "get_wazuh_agents",
    "wazuh_mitre":            "get_wazuh_mitre",
    # CrowdSec
    "crowdsec_decisions":     "get_crowdsec_decisions",
    "crowdsec_alerts":        "get_crowdsec_alerts",
    "crowdsec_metrics":       "get_crowdsec_metrics",
    # Suricata
    "suricata_alerts":        "get_suricata_alerts",
    "suricata_flows":         "get_suricata_flows",
    "suricata_dns":           "get_suricata_dns",
    "suricata_http":          "get_suricata_http",
    "suricata_tls":           "get_suricata_tls",
    # GLPI
    "glpi_inventory":         "get_glpi_inventory",
    "glpi_stats":             "get_glpi_stats",
    "glpi_tickets":           "get_glpi_tickets",
    # System
    "system_health":          "get_system_health",
}


class AIService:
    """
    Service for AI-powered report generation using OpenRouter API.
    Uses OpenAI-compatible function calling to fetch live data during report generation.
    Model is fixed to openrouter/auto (free tier) — not exposed to end users.
    """

    def __init__(self) -> None:
        self._settings = get_settings()
        self._client: OpenAI | None = None

    def _get_client(self) -> Any:
        """Lazy-init the OpenAI client pointed at OpenRouter."""
        if OpenAI is None:
            raise ImportError("El paquete 'openai' no está instalado en el entorno.")
        if self._client is None:
            if not self._settings.openrouter_api_key:
                raise ValueError(
                    "OPENROUTER_API_KEY is not configured. "
                    "Get a free key at https://openrouter.ai/keys and add it to backend/.env"
                )
            self._client = OpenAI(
                base_url="https://openrouter.ai/api/v1",
                api_key=self._settings.openrouter_api_key,
                default_headers={
                    "HTTP-Referer": "https://netshield.local",
                    "X-Title": "NetShield Dashboard",
                },
            )
        return self._client

    async def _execute_tool(self, tool_name: str, tool_input: dict) -> Any:
        """
        Execute a function call requested by the AI model.
        Routes to the appropriate service method.
        """
        logger.info("ai_tool_called", tool=tool_name)

        mt = get_mikrotik_service
        wazuh = get_wazuh_service

        # ── MikroTik ────────────────────────────────────────────
        if tool_name == "get_mikrotik_connections":
            return await mt().get_connections()
        elif tool_name == "get_firewall_rules":
            return await mt().get_firewall_rules()
        elif tool_name == "get_arp_table":
            return await mt().get_arp_table()
        elif tool_name == "get_mikrotik_interfaces":
            return await mt().get_interfaces()
        elif tool_name == "get_mikrotik_vlans":
            return await mt().get_vlans()
        elif tool_name == "get_mikrotik_address_lists":
            return await mt().get_address_list(tool_input.get("list_name"))
        elif tool_name == "get_mikrotik_dns":
            return await mt().get_dns_static()
        elif tool_name == "get_mikrotik_dhcp":
            return await mt().get_dhcp_leases(tool_input.get("server"))
        elif tool_name == "get_mikrotik_logs":
            return await mt().get_logs(limit=tool_input.get("limit", 50))
        elif tool_name == "get_mikrotik_health":
            return await mt().get_system_health()
        elif tool_name == "get_mikrotik_nat":
            # NAT rules share the same base API call format
            try:
                raw = await mt()._api_call("/ip/firewall/nat", "print")
                return raw
            except Exception as e:
                return {"error": str(e)}

        # ── Wazuh ───────────────────────────────────────────────
        elif tool_name == "get_wazuh_alerts":
            return await wazuh().get_alerts(
                limit=tool_input.get("limit", 50),
                level_min=tool_input.get("level_min"),
            )
        elif tool_name == "get_wazuh_critical_alerts":
            return await wazuh().get_critical_alerts(limit=tool_input.get("limit", 20))
        elif tool_name == "get_wazuh_agents":
            return await wazuh().get_agents()
        elif tool_name == "get_wazuh_mitre":
            return await wazuh().get_mitre_summary()

        # ── CrowdSec ────────────────────────────────────────────
        elif tool_name == "get_crowdsec_decisions":
            from services.crowdsec_service import get_crowdsec_service
            cs = get_crowdsec_service()
            decisions = await cs.get_decisions()
            return {"total": len(decisions), "decisions": decisions[:tool_input.get("limit", 100)]}
        elif tool_name == "get_crowdsec_alerts":
            from services.crowdsec_service import get_crowdsec_service
            cs = get_crowdsec_service()
            alerts = await cs.get_alerts(limit=tool_input.get("limit", 50))
            return {"total": len(alerts), "alerts": alerts}
        elif tool_name == "get_crowdsec_metrics":
            from services.crowdsec_service import get_crowdsec_service
            cs = get_crowdsec_service()
            return await cs.get_metrics()

        # ── Suricata ────────────────────────────────────────────
        elif tool_name == "get_suricata_alerts":
            from services.suricata_service import get_suricata_service
            sur = get_suricata_service()
            alerts = await sur.get_alerts(limit=tool_input.get("limit", 50))
            return {"total": len(alerts), "alerts": alerts}
        elif tool_name == "get_suricata_flows":
            from services.suricata_service import get_suricata_service
            sur = get_suricata_service()
            flows = await sur.get_flows(limit=tool_input.get("limit", 100))
            return {"total": len(flows), "flows": flows}
        elif tool_name == "get_suricata_dns":
            from services.suricata_service import get_suricata_service
            sur = get_suricata_service()
            queries = await sur.get_dns_queries(limit=tool_input.get("limit", 100))
            return {"total": len(queries), "queries": queries}
        elif tool_name == "get_suricata_http":
            from services.suricata_service import get_suricata_service
            sur = get_suricata_service()
            txns = await sur.get_http_transactions(limit=tool_input.get("limit", 100))
            return {"total": len(txns), "transactions": txns}
        elif tool_name == "get_suricata_tls":
            from services.suricata_service import get_suricata_service
            sur = get_suricata_service()
            tls = await sur.get_tls_handshakes(limit=tool_input.get("limit", 100))
            return {"total": len(tls), "handshakes": tls}

        # ── GLPI ────────────────────────────────────────────────
        elif tool_name == "get_glpi_inventory":
            from services.glpi_service import get_glpi_service
            glpi = get_glpi_service()
            computers = await glpi.get_computers(limit=tool_input.get("limit", 50))
            return {"total": len(computers), "assets": computers}
        elif tool_name == "get_glpi_stats":
            from services.glpi_service import get_glpi_service
            glpi = get_glpi_service()
            return await glpi.get_asset_stats()
        elif tool_name == "get_glpi_tickets":
            from services.glpi_service import get_glpi_service
            glpi = get_glpi_service()
            tickets = await glpi.get_tickets(
                limit=tool_input.get("limit", 30),
                status=tool_input.get("status"),
            )
            return {"total": len(tickets), "tickets": tickets}

        # ── System ──────────────────────────────────────────────
        elif tool_name == "get_system_health":
            return await self._get_system_health()

        else:
            return {"error": f"Unknown tool: {tool_name}"}

    async def generate_report(
        self,
        prompt: str,
        audience: str = "technical",
        attached_documents: list[str] | None = None,
        data_sources: list[str] | None = None,
        date_range: dict | None = None,
        comparison_range: dict | None = None,
    ) -> dict:
        """
        Generate a security report using OpenRouter (free models, openrouter/auto) with function calling.

        The flow:
        1. Send user prompt + system prompt to the model with available tools
        2. Model may call tools to fetch live data (alerts, connections, etc.)
        3. Execute tool calls and send results back to model
        4. Model generates the final HTML report

        Returns: {html_content, title, summary, data_sources_used, tokens_used, model_used}
        """
        client = self._get_client()
        model = self._settings.openrouter_model  # Fixed: openrouter/auto
        system_prompt = SYSTEM_PROMPTS.get(audience, SYSTEM_PROMPTS["technical"])

        # Build user message
        user_content = f"Generate a security report based on the following request:\n\n{prompt}\n"

        if attached_documents:
            user_content += "\n\nAttached reference documents:\n"
            for i, doc in enumerate(attached_documents, 1):
                user_content += f"\n--- Document {i} ---\n{doc}\n"

        if date_range:
            user_content += f"\nPrimary analysis period: {date_range.get('from_date', 'N/A')} to {date_range.get('to_date', 'N/A')}\n"

        if comparison_range:
            user_content += (
                f"\nComparison period: {comparison_range.get('from_date', 'N/A')} to {comparison_range.get('to_date', 'N/A')}\n"
                "Please compare data between the primary period and the comparison period. "
                "Highlight differences, trends, and anomalies between both periods.\n"
            )

        user_content += (
            "\nPlease use the available tools to fetch the latest data from our security systems before writing the report."
            "\nStructure the report with: Title, Executive Summary, Key Findings, Detailed Analysis, Recommendations."
            "\nOutput as clean, well-formatted HTML."
        )

        # Filter tools based on selected data_sources
        if data_sources:
            tool_names = {SOURCE_TO_TOOL[s] for s in data_sources if s in SOURCE_TO_TOOL}
            active_tools = [t for t in TOOLS if t["function"]["name"] in tool_names]
        else:
            active_tools = TOOLS

        messages: list[dict] = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content},
        ]
        data_sources_used: list[str] = []
        total_tokens = 0
        response = None

        # Agentic loop
        for iteration in range(10):
            response = client.chat.completions.create(
                model=model,
                max_tokens=8192,
                messages=messages,
                tools=active_tools,
                tool_choice="auto",
            )
            if response.usage:
                total_tokens += response.usage.prompt_tokens + response.usage.completion_tokens

            message = response.choices[0].message

            if message.tool_calls:
                messages.append({
                    "role": "assistant",
                    "content": message.content or "",
                    "tool_calls": [
                        {
                            "id": tc.id,
                            "type": "function",
                            "function": {"name": tc.function.name, "arguments": tc.function.arguments},
                        }
                        for tc in message.tool_calls
                    ],
                })
                for tool_call in message.tool_calls:
                    tool_input = json.loads(tool_call.function.arguments or "{}")
                    tool_result = await self._execute_tool(tool_call.function.name, tool_input)
                    data_sources_used.append(tool_call.function.name)
                    messages.append({
                        "role": "tool",
                        "tool_call_id": tool_call.id,
                        "content": json.dumps(tool_result, default=str, ensure_ascii=False)[:50000],
                    })
            else:
                break

        html_content = ""
        if response and response.choices:
            html_content = response.choices[0].message.content or ""

        # Extract title from HTML
        title = "NetShield Security Report"
        if "<h1>" in html_content and "</h1>" in html_content:
            import re
            start = html_content.index("<h1>") + 4
            end = html_content.index("</h1>")
            title = re.sub(r"<[^>]+>", "", html_content[start:end]).strip()

        logger.info(
            "ai_report_generated",
            audience=audience,
            tools_used=data_sources_used,
            tokens=total_tokens,
            model=model,
        )

        return {
            "html_content": html_content,
            "title": title,
            "summary": prompt[:200],
            "data_sources_used": list(set(data_sources_used)),
            "tokens_used": total_tokens,
            "model_used": model,
        }

    async def _get_system_health(self) -> dict:
        """Aggregate health data from all services."""
        result: dict = {}
        try:
            mt = get_mikrotik_service()
            result["mikrotik"] = await mt.get_system_health()
        except Exception as e:
            result["mikrotik"] = {"error": str(e)}
        try:
            wazuh = get_wazuh_service()
            agents = await wazuh.get_agents()
            alerts = await wazuh.get_alerts(limit=100)
            active = sum(1 for a in agents if a.get("status") == "active")
            critical = sum(1 for a in alerts if int(a.get("rule_level", 0)) >= 12)
            result["wazuh"] = {
                "total_agents": len(agents),
                "active_agents": active,
                "alerts_count": len(alerts),
                "critical_alerts": critical,
            }
        except Exception as e:
            result["wazuh"] = {"error": str(e)}
        try:
            from services.crowdsec_service import get_crowdsec_service
            decisions = await get_crowdsec_service().get_decisions()
            result["crowdsec"] = {"active_decisions": len(decisions)}
        except Exception as e:
            result["crowdsec"] = {"error": str(e)}
        try:
            from services.suricata_service import get_suricata_service
            result["suricata"] = await get_suricata_service().get_engine_stats()
        except Exception as e:
            result["suricata"] = {"error": str(e)}
        return result

    async def answer_telegram_query(self, query: str, chat_id: str) -> str:
        """Answer a Telegram bot query using OpenRouter with all tools available."""
        client = self._get_client()
        messages: list[dict] = [
            {"role": "system", "content": TELEGRAM_SYSTEM_PROMPT},
            {
                "role": "user",
                "content": (
                    f"User query from Telegram (chat_id: {chat_id}):\n\n{query}\n\n"
                    "Use the available tools to fetch current data before answering. "
                    "Respond concisely in Telegram HTML format."
                ),
            },
        ]
        total_tokens = 0
        response = None

        for iteration in range(5):
            response = client.chat.completions.create(
                model=self._settings.openrouter_model,
                max_tokens=2048,
                messages=messages,
                tools=TOOLS,
                tool_choice="auto",
            )
            if response.usage:
                total_tokens += response.usage.prompt_tokens + response.usage.completion_tokens

            message = response.choices[0].message
            if message.tool_calls:
                messages.append({
                    "role": "assistant",
                    "content": message.content or "",
                    "tool_calls": [
                        {
                            "id": tc.id,
                            "type": "function",
                            "function": {"name": tc.function.name, "arguments": tc.function.arguments},
                        }
                        for tc in message.tool_calls
                    ],
                })
                for tool_call in message.tool_calls:
                    tool_input = json.loads(tool_call.function.arguments or "{}")
                    tool_result = await self._execute_tool(tool_call.function.name, tool_input)
                    messages.append({
                        "role": "tool",
                        "tool_call_id": tool_call.id,
                        "content": json.dumps(tool_result, default=str, ensure_ascii=False)[:20000],
                    })
            else:
                break

        text = ""
        if response and response.choices:
            text = response.choices[0].message.content or ""

        logger.info("ai_telegram_answered", query=query[:50], tokens=total_tokens)
        return text


def get_ai_service() -> AIService:
    return AIService()
