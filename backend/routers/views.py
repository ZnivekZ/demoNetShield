"""
Views Router — Vistas personalizadas del dashboard.
Prefix: /api/views

Endpoints:
  GET    /api/views                    — Lista todas las vistas
  POST   /api/views                    — Crear vista
  GET    /api/views/{id}              — Detalle de una vista
  PUT    /api/views/{id}              — Actualizar vista
  DELETE /api/views/{id}              — Eliminar vista
  PUT    /api/views/{id}/default      — Marcar como vista por defecto
  GET    /api/views/widgets/catalog   — Catálogo categorizado de widgets
"""

from __future__ import annotations

import json

import structlog
from fastapi import APIRouter, Depends
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models.custom_view import CustomView
from schemas.common import APIResponse
from schemas.views import CustomViewCreate, CustomViewUpdate

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/api/views", tags=["Views"])


# ── Widget Catalog ────────────────────────────────────────────────

# Catálogo categorizado de widgets.
# Cada categoría tiene id, label, description, icon y lista de widgets.
# El frontend renderiza los 4 tabs basándose en esta estructura.

_WIDGETS_STANDARD = [
    # ── Wazuh ────────────────────────────────────────────────────
    {
        "type": "wazuh_alerts",
        "title": "Alertas Wazuh",
        "description": "Tabla de alertas recientes con nivel de severidad y agente",
        "icon": "ShieldAlert",
        "source": "wazuh",
        "default_size": "large",
        "available_sizes": ["medium", "large", "full"],
        "preview_color": "#f59e0b",
        "config_schema": {"limit": {"type": "number", "default": 20, "label": "Cantidad de alertas"},
                          "min_level": {"type": "number", "default": 0, "label": "Nivel mínimo"}},
    },
    {
        "type": "wazuh_agents",
        "title": "Agentes Wazuh",
        "description": "Estado de los agentes monitoreados",
        "icon": "Monitor",
        "source": "wazuh",
        "default_size": "medium",
        "available_sizes": ["small", "medium", "large"],
        "preview_color": "#f59e0b",
        "config_schema": {},
    },
    {
        "type": "wazuh_summary",
        "title": "Resumen de Seguridad",
        "description": "Contadores de alertas por severidad",
        "icon": "BarChart2",
        "source": "wazuh",
        "default_size": "small",
        "available_sizes": ["small", "medium"],
        "preview_color": "#f59e0b",
        "config_schema": {},
    },
    # ── MikroTik ─────────────────────────────────────────────────
    {
        "type": "traffic_chart",
        "title": "Tráfico en tiempo real",
        "description": "Gráfico de tráfico de red en tiempo real",
        "icon": "Activity",
        "source": "mikrotik",
        "default_size": "large",
        "available_sizes": ["medium", "large", "full"],
        "preview_color": "#3b82f6",
        "config_schema": {"interface": {"type": "string", "default": "", "label": "Interfaz (vacío = todas)"}},
    },
    {
        "type": "firewall_rules",
        "title": "Reglas de Firewall",
        "description": "Reglas activas de firewall MikroTik",
        "icon": "Flame",
        "source": "mikrotik",
        "default_size": "large",
        "available_sizes": ["medium", "large", "full"],
        "preview_color": "#3b82f6",
        "config_schema": {"limit": {"type": "number", "default": 15, "label": "Cantidad de reglas"}},
    },
    {
        "type": "blocked_ips",
        "title": "IPs Bloqueadas",
        "description": "Lista de IPs actualmente bloqueadas",
        "icon": "Ban",
        "source": "mikrotik",
        "default_size": "medium",
        "available_sizes": ["small", "medium", "large"],
        "preview_color": "#3b82f6",
        "config_schema": {"limit": {"type": "number", "default": 10, "label": "Cantidad"}},
    },
    {
        "type": "mikrotik_health",
        "title": "Estado MikroTik",
        "description": "CPU, memoria y uptime del router",
        "icon": "Server",
        "source": "mikrotik",
        "default_size": "small",
        "available_sizes": ["small", "medium"],
        "preview_color": "#3b82f6",
        "config_schema": {},
    },
    # ── CrowdSec ──────────────────────────────────────────────────
    {
        "type": "crowdsec_decisions",
        "title": "Decisiones CrowdSec",
        "description": "Decisiones de bloqueo activas de CrowdSec",
        "icon": "ShieldCheck",
        "source": "crowdsec",
        "default_size": "medium",
        "available_sizes": ["small", "medium", "large"],
        "preview_color": "#10b981",
        "config_schema": {"limit": {"type": "number", "default": 10, "label": "Cantidad"}},
    },
    {
        "type": "crowdsec_metrics",
        "title": "Métricas CrowdSec",
        "description": "Alertas activas, bans, escenarios disparados",
        "icon": "TrendingUp",
        "source": "crowdsec",
        "default_size": "small",
        "available_sizes": ["small", "medium"],
        "preview_color": "#10b981",
        "config_schema": {},
    },
    # ── Suricata ──────────────────────────────────────────────────
    {
        "type": "suricata_alerts",
        "title": "Alertas IDS/IPS",
        "description": "Alertas de Suricata en tiempo real",
        "icon": "Radar",
        "source": "suricata",
        "default_size": "large",
        "available_sizes": ["medium", "large", "full"],
        "preview_color": "#8b5cf6",
        "config_schema": {"limit": {"type": "number", "default": 20, "label": "Cantidad"}},
    },
    {
        "type": "suricata_flows",
        "title": "Flujos de Red (NSM)",
        "description": "Top flujos de red por protocolo y puerto",
        "icon": "Eye",
        "source": "suricata",
        "default_size": "medium",
        "available_sizes": ["medium", "large"],
        "preview_color": "#8b5cf6",
        "config_schema": {},
    },
    # ── GLPI ──────────────────────────────────────────────────────
    {
        "type": "glpi_assets",
        "title": "Inventario de Assets",
        "description": "Listado de equipos del inventario GLPI",
        "icon": "Package",
        "source": "glpi",
        "default_size": "large",
        "available_sizes": ["medium", "large", "full"],
        "preview_color": "#ec4899",
        "config_schema": {"limit": {"type": "number", "default": 15, "label": "Cantidad"}},
    },
    {
        "type": "glpi_tickets",
        "title": "Tickets GLPI",
        "description": "Tickets abiertos de soporte",
        "icon": "Ticket",
        "source": "glpi",
        "default_size": "medium",
        "available_sizes": ["medium", "large"],
        "preview_color": "#ec4899",
        "config_schema": {"limit": {"type": "number", "default": 10, "label": "Cantidad"}},
    },
    # ── Phishing ──────────────────────────────────────────────────
    {
        "type": "phishing_detections",
        "title": "Detecciones Phishing",
        "description": "Alertas de phishing detectadas recientemente",
        "icon": "Fish",
        "source": "phishing",
        "default_size": "medium",
        "available_sizes": ["medium", "large"],
        "preview_color": "#f97316",
        "config_schema": {"limit": {"type": "number", "default": 10, "label": "Cantidad"}},
    },
    # ── General ───────────────────────────────────────────────────
    {
        "type": "action_log",
        "title": "Historial de Acciones",
        "description": "Últimas acciones ejecutadas en el dashboard",
        "icon": "Clock",
        "source": "general",
        "default_size": "medium",
        "available_sizes": ["small", "medium", "large"],
        "preview_color": "#6b7280",
        "config_schema": {"limit": {"type": "number", "default": 10, "label": "Cantidad"}},
    },
    {
        "type": "top_countries",
        "title": "Top Países Atacantes",
        "description": "GeoIP: países con más intentos de ataque",
        "icon": "Globe",
        "source": "general",
        "default_size": "medium",
        "available_sizes": ["small", "medium", "large"],
        "preview_color": "#6b7280",
        "config_schema": {"limit": {"type": "number", "default": 5, "label": "Cantidad de países"}},
    },
]

_WIDGETS_VISUAL = [
    {
        "type": "visual_threat_gauge",
        "title": "Medidor de Amenaza",
        "description": "Gauge semicircular del nivel de amenaza global (0-100) con color dinámico",
        "icon": "Gauge",
        "source": "mixed",
        "category": "visual",
        "default_size": "small",
        "available_sizes": ["small", "medium"],
        "preview_color": "#ef4444",
        "config_schema": {},
    },
    {
        "type": "visual_network_pulse",
        "title": "Pulso de Red",
        "description": "Visualización ECG animada del tráfico de red en tiempo real",
        "icon": "Activity",
        "source": "mikrotik",
        "category": "visual",
        "default_size": "medium",
        "available_sizes": ["small", "medium", "large"],
        "preview_color": "#3b82f6",
        "config_schema": {"interface": {"type": "string", "default": "ether1", "label": "Interfaz"}},
    },
    {
        "type": "visual_event_counter",
        "title": "Contador de Eventos",
        "description": "Contador flip animado de alertas totales del día con delta en 24h",
        "icon": "Hash",
        "source": "wazuh",
        "category": "visual",
        "default_size": "small",
        "available_sizes": ["small", "medium"],
        "preview_color": "#f59e0b",
        "config_schema": {
            "source": {"type": "string", "default": "wazuh", "label": "Fuente (wazuh|crowdsec|suricata)"},
        },
    },
    {
        "type": "visual_activity_heatmap",
        "title": "Heatmap de Actividad",
        "description": "Calendar heatmap 7×24h — actividad de alertas por día y hora",
        "icon": "Grid",
        "source": "wazuh",
        "category": "visual",
        "default_size": "large",
        "available_sizes": ["medium", "large", "full"],
        "preview_color": "#f59e0b",
        "config_schema": {},
    },
    {
        "type": "visual_protocol_donut",
        "title": "Distribución de Protocolos",
        "description": "Donut chart de uso de protocolos de red (Suricata NSM)",
        "icon": "PieChart",
        "source": "suricata",
        "category": "visual",
        "default_size": "small",
        "available_sizes": ["small", "medium"],
        "preview_color": "#8b5cf6",
        "config_schema": {},
    },
    {
        "type": "visual_agents_thermometer",
        "title": "Termómetro de Agentes",
        "description": "Termómetro vertical SVG del % de agentes Wazuh activos",
        "icon": "Thermometer",
        "source": "wazuh",
        "category": "visual",
        "default_size": "small",
        "available_sizes": ["small", "medium"],
        "preview_color": "#10b981",
        "config_schema": {},
    },
    {
        "type": "visual_blocks_timeline",
        "title": "Timeline de Bloqueos",
        "description": "AreaChart de bloqueos CrowdSec + MikroTik en las últimas 24h",
        "icon": "AreaChart",
        "source": "crowdsec",
        "category": "visual",
        "default_size": "medium",
        "available_sizes": ["medium", "large"],
        "preview_color": "#10b981",
        "config_schema": {},
    },
    {
        "type": "visual_portal_usage",
        "title": "Uso del Portal Cautivo",
        "description": "Donut de sesiones activas vs capacidad + bandwidth en tiempo real",
        "icon": "Wifi",
        "source": "portal",
        "category": "visual",
        "default_size": "small",
        "available_sizes": ["small", "medium"],
        "preview_color": "#06b6d4",
        "config_schema": {},
    },
    {
        "type": "visual_phishing_stats",
        "title": "Estadísticas de Phishing",
        "description": "3 stat cards: alertas totales, dominios sinkholed y víctimas detectadas",
        "icon": "Fish",
        "source": "phishing",
        "category": "visual",
        "default_size": "small",
        "available_sizes": ["small", "medium"],
        "preview_color": "#f97316",
        "config_schema": {},
    },
    {
        "type": "visual_agent_alert_heatmap",
        "title": "Heatmap por Agente",
        "description": "Grid de alertas por agente Wazuh × hora — intensidad por celda",
        "icon": "Grid",
        "source": "wazuh",
        "category": "visual",
        "default_size": "large",
        "available_sizes": ["medium", "large", "full"],
        "preview_color": "#f59e0b",
        "config_schema": {"hours": {"type": "number", "default": 12, "label": "Ventana (horas)"}},
    },
]

_WIDGETS_TECHNICAL = [
    {
        "type": "technical_action_log",
        "title": "Log de Acciones Detallado",
        "description": "Tabla compacta con scroll del historial completo de acciones del dashboard",
        "icon": "ClipboardList",
        "source": "general",
        "category": "technical",
        "default_size": "medium",
        "available_sizes": ["medium", "large", "full"],
        "preview_color": "#6b7280",
        "config_schema": {"limit": {"type": "number", "default": 50, "label": "Cantidad"}},
    },
    {
        "type": "technical_packet_inspector",
        "title": "Inspector de Paquetes",
        "description": "Tabla de alertas Suricata expandibles con datos raw de red",
        "icon": "Search",
        "source": "suricata",
        "category": "technical",
        "default_size": "large",
        "available_sizes": ["medium", "large", "full"],
        "preview_color": "#8b5cf6",
        "config_schema": {"limit": {"type": "number", "default": 20, "label": "Alertas"}},
    },
    {
        "type": "technical_flow_table",
        "title": "Tabla de Flujos NSM",
        "description": "Tabla detallada de flujos de red con filtros por protocolo e IP",
        "icon": "Table",
        "source": "suricata",
        "category": "technical",
        "default_size": "large",
        "available_sizes": ["medium", "large", "full"],
        "preview_color": "#8b5cf6",
        "config_schema": {"limit": {"type": "number", "default": 30, "label": "Flujos"}},
    },
    {
        "type": "technical_firewall_tree",
        "title": "Árbol de Firewall",
        "description": "Reglas MikroTik agrupadas por chain con accordeon expandible",
        "icon": "GitBranch",
        "source": "mikrotik",
        "category": "technical",
        "default_size": "medium",
        "available_sizes": ["medium", "large"],
        "preview_color": "#3b82f6",
        "config_schema": {},
    },
    {
        "type": "technical_live_logs",
        "title": "Live Logs MikroTik",
        "description": "Terminal de logs MikroTik en tiempo real con scroll automático",
        "icon": "Terminal",
        "source": "mikrotik",
        "category": "technical",
        "default_size": "large",
        "available_sizes": ["medium", "large", "full"],
        "preview_color": "#1e293b",
        "config_schema": {
            "limit": {"type": "number", "default": 100, "label": "Líneas máximas"},
            "filter": {"type": "string", "default": "", "label": "Filtro de texto"},
        },
    },
    {
        "type": "technical_crowdsec_raw",
        "title": "CrowdSec Raw",
        "description": "Tabla técnica de decisiones CrowdSec con opción de desbloqueo por fila",
        "icon": "Database",
        "source": "crowdsec",
        "category": "technical",
        "default_size": "medium",
        "available_sizes": ["medium", "large"],
        "preview_color": "#10b981",
        "config_schema": {"limit": {"type": "number", "default": 25, "label": "Cantidad"}},
    },
    {
        "type": "technical_correlation_timeline",
        "title": "Timeline de Correlación",
        "description": "3 series alineadas en tiempo: Wazuh + Suricata + CrowdSec",
        "icon": "LineChart",
        "source": "mixed",
        "category": "technical",
        "default_size": "large",
        "available_sizes": ["medium", "large", "full"],
        "preview_color": "#f59e0b",
        "config_schema": {"minutes": {"type": "number", "default": 120, "label": "Ventana (minutos)"}},
    },
    {
        "type": "technical_critical_assets",
        "title": "Activos Críticos",
        "description": "Assets GLPI ordenados por número de alertas Suricata/Wazuh asociadas",
        "icon": "AlertOctagon",
        "source": "glpi",
        "category": "technical",
        "default_size": "medium",
        "available_sizes": ["medium", "large"],
        "preview_color": "#ef4444",
        "config_schema": {"limit": {"type": "number", "default": 10, "label": "Cantidad"}},
    },
    {
        "type": "technical_dns_monitor",
        "title": "Monitor DNS",
        "description": "Tabla de queries DNS capturados por Suricata NSM — dominio, tipo, respuesta",
        "icon": "Globe",
        "source": "suricata",
        "category": "technical",
        "default_size": "large",
        "available_sizes": ["medium", "large", "full"],
        "preview_color": "#8b5cf6",
        "config_schema": {"limit": {"type": "number", "default": 30, "label": "Cantidad"}},
    },
    {
        "type": "technical_tls_fingerprint",
        "title": "TLS Fingerprints",
        "description": "Handshakes TLS con JA3/SNI — resalta certs expirados y self-signed",
        "icon": "Lock",
        "source": "suricata",
        "category": "technical",
        "default_size": "large",
        "available_sizes": ["medium", "large", "full"],
        "preview_color": "#8b5cf6",
        "config_schema": {"limit": {"type": "number", "default": 20, "label": "Cantidad"}},
    },
    {
        "type": "technical_bandwidth_top",
        "title": "Top Consumidores",
        "description": "Top N IPs locales por consumo de ancho de banda con barra proporcional",
        "icon": "BarChart2",
        "source": "mikrotik",
        "category": "technical",
        "default_size": "medium",
        "available_sizes": ["small", "medium", "large"],
        "preview_color": "#3b82f6",
        "config_schema": {"limit": {"type": "number", "default": 10, "label": "Top N"}},
    },
    {
        "type": "technical_http_inspector",
        "title": "Inspector HTTP",
        "description": "Transacciones HTTP de Suricata NSM — método, URL, user-agent, status",
        "icon": "Globe2",
        "source": "suricata",
        "category": "technical",
        "default_size": "large",
        "available_sizes": ["medium", "large", "full"],
        "preview_color": "#8b5cf6",
        "config_schema": {"limit": {"type": "number", "default": 25, "label": "Transacciones"}},
    },
]

_WIDGETS_HYBRID = [
    {
        "type": "hybrid_ip_profiler",
        "title": "Perfilador de IP",
        "description": "Ingresá una IP y ve todo en una vista: ARP, alertas, bloqueos, geo",
        "icon": "Crosshair",
        "source": "mixed",
        "category": "hybrid",
        "default_size": "large",
        "available_sizes": ["medium", "large", "full"],
        "preview_color": "#a855f7",
        "config_schema": {"default_ip": {"type": "string", "default": "", "label": "IP inicial (opcional)"}},
    },
    {
        "type": "hybrid_confirmed_threats",
        "title": "Amenazas Confirmadas",
        "description": "IPs en Suricata + CrowdSec + Wazuh simultáneamente — confirmación multi-fuente",
        "icon": "ShieldX",
        "source": "mixed",
        "category": "hybrid",
        "default_size": "medium",
        "available_sizes": ["medium", "large"],
        "preview_color": "#ef4444",
        "config_schema": {},
    },
    {
        "type": "hybrid_country_radar",
        "title": "Radar de Países",
        "description": "Radar de países atacantes con 3 ejes: CrowdSec, Wazuh, Suricata",
        "icon": "Radar",
        "source": "mixed",
        "category": "hybrid",
        "default_size": "medium",
        "available_sizes": ["small", "medium", "large"],
        "preview_color": "#06b6d4",
        "config_schema": {"limit": {"type": "number", "default": 6, "label": "Países"}},
    },
    {
        "type": "hybrid_incident_lifecycle",
        "title": "Ciclo de Vida de Incidente",
        "description": "Timeline horizontal de un incidente: detección → alerta → bloqueo → ticket → resolución",
        "icon": "GitMerge",
        "source": "mixed",
        "category": "hybrid",
        "default_size": "large",
        "available_sizes": ["medium", "large", "full"],
        "preview_color": "#f97316",
        "config_schema": {"ip": {"type": "string", "default": "203.0.113.45", "label": "IP del incidente"}},
    },
    {
        "type": "hybrid_defense_layers",
        "title": "Capas de Defensa",
        "description": "Anillos concéntricos SVG — estado de CrowdSec, MikroTik, Suricata y Wazuh",
        "icon": "Shield",
        "source": "mixed",
        "category": "hybrid",
        "default_size": "medium",
        "available_sizes": ["small", "medium", "large"],
        "preview_color": "#10b981",
        "config_schema": {},
    },
    {
        "type": "hybrid_geoblock_predictor",
        "title": "Predictor Geo-Block",
        "description": "Sugerencias de geo-bloqueo con evidence de múltiples fuentes",
        "icon": "MapPin",
        "source": "mixed",
        "category": "hybrid",
        "default_size": "medium",
        "available_sizes": ["medium", "large"],
        "preview_color": "#06b6d4",
        "config_schema": {},
    },
    {
        "type": "hybrid_suricata_glpi",
        "title": "Suricata × GLPI",
        "description": "Activos GLPI que están siendo atacados según Suricata — enriquecido con propietario y ubicación",
        "icon": "PackageOpen",
        "source": "mixed",
        "category": "hybrid",
        "default_size": "large",
        "available_sizes": ["medium", "large", "full"],
        "preview_color": "#ec4899",
        "config_schema": {"limit": {"type": "number", "default": 10, "label": "Resultados"}},
    },
    {
        "type": "hybrid_world_threat_map",
        "title": "Mapa Mundial de Amenazas",
        "description": "Mapa SVG interactivo con heatmap de amenazas por país (GeoIP + Multi-fuente)",
        "icon": "Globe2",
        "source": "mixed",
        "category": "hybrid",
        "default_size": "full",
        "available_sizes": ["large", "full"],
        "preview_color": "#a855f7",
        "config_schema": {},
    },
    {
        "type": "hybrid_view_report_generator",
        "title": "Generador de Reporte",
        "description": "Genera un reporte IA desde los widgets activos de esta vista — exporta PDF o envía por Telegram",
        "icon": "FileOutput",
        "source": "mixed",
        "category": "hybrid",
        "default_size": "medium",
        "available_sizes": ["medium", "large"],
        "preview_color": "#f59e0b",
        "config_schema": {
            "audience": {"type": "string", "default": "technical", "label": "Audiencia (executive|technical|compliance)"},
            "output": {"type": "string", "default": "pdf", "label": "Salida (pdf|telegram|both)"},
        },
    },
    {
        "type": "hybrid_telegram_activity",
        "title": "Actividad Telegram",
        "description": "Timeline de mensajes + contadores hoy + estado del bot bidireccional",
        "icon": "MessageCircle",
        "source": "mixed",
        "category": "hybrid",
        "default_size": "medium",
        "available_sizes": ["medium", "large"],
        "preview_color": "#0ea5e9",
        "config_schema": {"limit": {"type": "number", "default": 20, "label": "Mensajes"}},
    },
    {
        "type": "hybrid_mitre_matrix",
        "title": "Matriz MITRE ATT&CK",
        "description": "Grid tácticas × técnicas detectadas por Wazuh con intensidad por frecuencia",
        "icon": "LayoutGrid",
        "source": "wazuh",
        "category": "hybrid",
        "default_size": "full",
        "available_sizes": ["large", "full"],
        "preview_color": "#ef4444",
        "config_schema": {},
    },
    {
        "type": "hybrid_vlan_health",
        "title": "Salud por VLAN",
        "description": "Barras de salud por VLAN correlacionando tráfico MikroTik con alertas Wazuh",
        "icon": "Network",
        "source": "mixed",
        "category": "hybrid",
        "default_size": "medium",
        "available_sizes": ["small", "medium", "large"],
        "preview_color": "#3b82f6",
        "config_schema": {},
    },
    {
        "type": "hybrid_quarantine_tracker",
        "title": "Tracker de Cuarentena",
        "description": "Activos actualmente en cuarentena derivados del ActionLog con tiempo transcurrido",
        "icon": "Lock",
        "source": "mixed",
        "category": "hybrid",
        "default_size": "medium",
        "available_sizes": ["small", "medium", "large"],
        "preview_color": "#ef4444",
        "config_schema": {},
    },
    {
        "type": "hybrid_sinkhole_effectiveness",
        "title": "Efectividad del Sinkhole",
        "description": "Gauge de efectividad + lista de dominios sinkholed con hits bloqueados",
        "icon": "ShieldOff",
        "source": "phishing",
        "category": "hybrid",
        "default_size": "medium",
        "available_sizes": ["medium", "large"],
        "preview_color": "#f97316",
        "config_schema": {},
    },
]

WIDGET_CATALOG = {
    "categories": [
        {
            "id": "standard",
            "label": "Estándar",
            "description": "Widgets del dashboard principal — listos para usar",
            "icon": "LayoutDashboard",
            "widgets": _WIDGETS_STANDARD,
        },
        {
            "id": "visual",
            "label": "Visuales",
            "description": "Simples y vistosos — ideal para pantallas de monitoreo",
            "icon": "Sparkles",
            "widgets": _WIDGETS_VISUAL,
        },
        {
            "id": "technical",
            "label": "Técnicos",
            "description": "Densos en datos — para análisis y auditoría",
            "icon": "Terminal",
            "widgets": _WIDGETS_TECHNICAL,
        },
        {
            "id": "hybrid",
            "label": "Híbridos",
            "description": "Cruzan múltiples fuentes — correlación e inteligencia",
            "icon": "GitMerge",
            "widgets": _WIDGETS_HYBRID,
        },
    ]
}


@router.get("/widgets/catalog")
async def get_widget_catalog() -> APIResponse:
    """
    Retorna el catálogo categorizado de widgets con 4 secciones:
    standard (17), visual (10), technical (12), hybrid (14). Total: 53 widgets.
    """
    return APIResponse.ok(WIDGET_CATALOG)


# ── Views CRUD ────────────────────────────────────────────────────

@router.get("")
async def list_views(db: AsyncSession = Depends(get_db)) -> APIResponse:
    """Lista todas las vistas personalizadas ordenadas por fecha de creación."""
    try:
        result = await db.execute(
            select(CustomView).order_by(CustomView.created_at.desc())
        )
        views = result.scalars().all()
        return APIResponse.ok([v.to_dict() for v in views])
    except Exception as e:
        logger.error("list_views_failed", error=str(e))
        return APIResponse.fail(f"Error al listar vistas: {str(e)}")


@router.post("")
async def create_view(
    request: CustomViewCreate,
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """Crea una nueva vista personalizada."""
    try:
        widgets_json = json.dumps(
            [w.model_dump() for w in request.widgets], ensure_ascii=False
        )
        new_view = CustomView(
            name=request.name,
            description=request.description,
            widgets=widgets_json,
            icon=request.icon,
            color=request.color,
        )
        db.add(new_view)
        await db.flush()
        await db.refresh(new_view)
        logger.info("view_created", view_id=new_view.id, name=new_view.name)
        return APIResponse.ok(new_view.to_dict())
    except Exception as e:
        logger.error("create_view_failed", error=str(e))
        return APIResponse.fail(f"Error al crear vista: {str(e)}")


@router.get("/{view_id}")
async def get_view(
    view_id: str,
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """Obtiene el detalle de una vista por ID."""
    try:
        result = await db.execute(
            select(CustomView).where(CustomView.id == view_id)
        )
        view = result.scalar_one_or_none()
        if not view:
            return APIResponse.fail(f"Vista '{view_id}' no encontrada")
        return APIResponse.ok(view.to_dict())
    except Exception as e:
        logger.error("get_view_failed", view_id=view_id, error=str(e))
        return APIResponse.fail(f"Error al obtener vista: {str(e)}")


@router.put("/{view_id}")
async def update_view(
    view_id: str,
    request: CustomViewUpdate,
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """Actualiza los campos de una vista existente (partial update)."""
    try:
        result = await db.execute(
            select(CustomView).where(CustomView.id == view_id)
        )
        view = result.scalar_one_or_none()
        if not view:
            return APIResponse.fail(f"Vista '{view_id}' no encontrada")

        if request.name is not None:
            view.name = request.name
        if request.description is not None:
            view.description = request.description
        if request.widgets is not None:
            view.widgets = json.dumps(
                [w.model_dump() for w in request.widgets], ensure_ascii=False
            )
        if request.icon is not None:
            view.icon = request.icon
        if request.color is not None:
            view.color = request.color

        await db.flush()
        await db.refresh(view)
        logger.info("view_updated", view_id=view_id)
        return APIResponse.ok(view.to_dict())
    except Exception as e:
        logger.error("update_view_failed", view_id=view_id, error=str(e))
        return APIResponse.fail(f"Error al actualizar vista: {str(e)}")


@router.delete("/{view_id}")
async def delete_view(
    view_id: str,
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """Elimina una vista personalizada."""
    try:
        result = await db.execute(
            select(CustomView).where(CustomView.id == view_id)
        )
        view = result.scalar_one_or_none()
        if not view:
            return APIResponse.fail(f"Vista '{view_id}' no encontrada")
        await db.delete(view)
        await db.flush()
        logger.info("view_deleted", view_id=view_id)
        return APIResponse.ok({"deleted": view_id})
    except Exception as e:
        logger.error("delete_view_failed", view_id=view_id, error=str(e))
        return APIResponse.fail(f"Error al eliminar vista: {str(e)}")


@router.put("/{view_id}/default")
async def set_default_view(
    view_id: str,
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """Marca una vista como la vista por defecto (desactiva las demás)."""
    try:
        # Verificar que la vista existe
        result = await db.execute(
            select(CustomView).where(CustomView.id == view_id)
        )
        view = result.scalar_one_or_none()
        if not view:
            return APIResponse.fail(f"Vista '{view_id}' no encontrada")

        # Quitar default de todas las vistas
        await db.execute(
            update(CustomView).values(is_default=False)
        )
        # Marcar esta como default
        view.is_default = True
        await db.flush()
        await db.refresh(view)
        logger.info("view_set_default", view_id=view_id)
        return APIResponse.ok(view.to_dict())
    except Exception as e:
        logger.error("set_default_view_failed", view_id=view_id, error=str(e))
        return APIResponse.fail(f"Error al marcar vista como default: {str(e)}")
