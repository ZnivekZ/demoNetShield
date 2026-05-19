# NetShield Dashboard — Documentación Funcional V2

## Índice General

> **Última actualización:** 2026-04-28
> **Fuente de verdad:** Codebase (`backend/` + `frontend/src/`)
> **Template:** V2 — Mermaid, REST tables, Pydantic schemas, componentes frontend, mock data, casos de uso

---

## Módulos del Sistema

### Seguridad & Detección

| # | Documento | Descripción | Endpoints | Componentes FE |
|---|---|---|---|---|
| 1 | [wazuh.md](./wazuh.md) | SIEM: agentes, alertas, MITRE ATT&CK, active response, WebSocket | 10 | QuickView, SystemHealth |
| 2 | [crowdsec.md](./crowdsec.md) | Inteligencia colaborativa: decisiones, remediación híbrida, sync MT, IP context | 21 | 13 componentes (CommandCenter, IpContextPanel, etc.) |
| 3 | [suricata.md](./suricata.md) | IDS/IPS/NSM: motor, alertas, reglas, network monitoring | 15+ | MotorPage, AlertsPage, RulesPage, NSMPage |
| 4 | [firewall.md](./firewall.md) | Reglas de filtrado, bloqueo/desbloqueo de IPs, address-lists, cuarentena | 3+4 | FirewallPage, SecurityPage |
| 5 | [phishing.md](./phishing.md) | Anti-phishing: alertas Wazuh, DNS sinkhole en MikroTik | 8 | PhishingPanel |
| 6 | [configuracion.md](./configuracion.md) | Panel de operaciones: bloqueo manual, geo-blocking, cuarentena | 4 | SecurityPage |

### Red & Infraestructura

| # | Documento | Descripción | Endpoints | Componentes FE |
|---|---|---|---|---|
| 7 | [vlans.md](./vlans.md) | VLANs: CRUD, tráfico real-time (WebSocket), correlación alertas Wazuh | 7+WS | VlanPanel (4 sub-componentes) |
| 8 | [red.md](./red.md) | Red & IPs: ARP table, etiquetas, grupos, búsqueda unificada GlobalSearch | 9+2 | NetworkPage (4 tabs) |
| 9 | [portalCautivo.md](./portalCautivo.md) | Hotspot MikroTik: usuarios, perfiles, hosts activos, horarios | 15+ | PortalPage (4 tabs) |

### Inventario & Gestión

| # | Documento | Descripción | Endpoints | Componentes FE |
|---|---|---|---|---|
| 10 | [GLPI.md](./GLPI.md) | ITSM: assets, health cross-service, tickets Kanban, cuarentena, collector | 20 | InventoryPage (4 tabs) |

### Inteligencia & Reportes

| # | Documento | Descripción | Endpoints | Componentes FE |
|---|---|---|---|---|
| 11 | [geolite2.md](./geolite2.md) | GeoIP: lookups, bulk, top countries, sugerencias geo-block, TTLCache | 7 | 5 componentes GeoIP |
| 12 | [reportesIA.md](./reportesIA.md) | Claude AI: function calling, 8 tools, 4 audiencias, TipTap, WeasyPrint→PDF | 8+ | ReportsPage, TelegramTab |
| 13 | [telegram.md](./telegram.md) | Bot Telegram: envío de reportes, configuración automática | 4 | TelegramTab |

### Herramientas

| # | Documento | Descripción | Endpoints | Componentes FE |
|---|---|---|---|---|
| 14 | [cli.md](./cli.md) | CLI remoto: MikroTik (whitelist read-only) + Wazuh (restart/status) | 2 | SystemHealth (sección CLI) |
| 15 | [vistasWidgets.md](./vistasWidgets.md) | Vistas personalizadas: 36 widgets, drag-and-drop, 3 capas | 8 | ViewsListPage, ViewBuilderPage, ViewDetailPage, WidgetRenderer |

### Interfaz & Arquitectura

| # | Documento | Descripción |
|---|---|---|
| 16 | [dashboard.md](./dashboard.md) | Dashboard principal (QuickView): stat cards, timeline, MITRE, status |
| 17 | [layout.md](./layout.md) | Layout: sidebar 7 grupos, topbar 5 status dots, GlobalSearch, rutas, temas |
| 18 | [bdModels.md](./bdModels.md) | Base de datos SQLite: 7 tablas, modelos SQLAlchemy, patrón de uso |
| 19 | [mock_data.md](./mock_data.md) | Sistema mock: 9 flags, MockData (139KB), MockService, WebSocket mocks |

### Transversal

| # | Documento | Descripción |
|---|---|---|
| 20 | [casosUso.md](./casosUso.md) | 12 casos de uso cross-module: SSH brute force, phishing, cuarentena, sync, geo-blocking, reportes, etc. |

---

## Stack Tecnológico

| Capa | Tecnología | Versión |
|---|---|---|
| **Backend** | Python + FastAPI | 3.12 / 0.115 |
| **Frontend** | React + TypeScript | 19 / 5.9 |
| **Estilos** | TailwindCSS v4 + Vanilla CSS | 4.x |
| **Estado** | TanStack Query 5 | 5.x |
| **Gráficos** | Recharts 3 | 3.x |
| **Editor** | TipTap 3 | 3.x |
| **Drag-and-drop** | @dnd-kit | latest |
| **Mapas** | d3-geo | latest |
| **IA** | Claude (Anthropic) | claude-sonnet-4-20250514 |
| **Base de datos** | SQLite + aiosqlite + SQLAlchemy Async | 2.0 |
| **PDF** | WeasyPrint | latest |
| **MikroTik** | routeros-api | latest |
| **HTTP Client** | httpx (async) | latest |
| **Logging** | structlog | latest |
| **Retry** | tenacity | latest |
| **GeoIP** | geoip2 + MaxMind GeoLite2 | latest |

---

## Servicios Externos

| Servicio | Protocolo | Puerto | Auth |
|---|---|---|---|
| MikroTik RouterOS | routeros-api (TCP) | 8728 | User/Pass |
| Wazuh Manager | HTTPS REST | 55000 | JWT (verify=False en lab) |
| CrowdSec LAPI | HTTP REST | 8080 | API Key |
| Suricata | Unix Socket | — | — |
| GLPI | HTTPS REST | 443 | Session Token |
| Telegram Bot | HTTPS | 443 | Bot Token |
| Anthropic (Claude) | HTTPS | 443 | API Key |
| MaxMind GeoLite2 | Local (.mmdb) | — | — |

---

## Convenciones de esta documentación

- **Mermaid:** Todos los diagramas de arquitectura y flujos usan Mermaid
- **Tablas REST:** Método | Ruta | Descripción | ActionLog
- **Schemas:** Todos los schemas Pydantic documentados con campos y tipos
- **Mock:** Cada módulo documenta su comportamiento en modo mock
- **Casos de uso:** Cada módulo incluye CUs específicos; `casosUso.md` contiene CUs cross-module
- **File links:** Links `file:///` a archivos fuente para navegación directa
- **Consistencia:** Todos los documentos siguen el mismo template V2
