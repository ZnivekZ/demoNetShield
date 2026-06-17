# Análisis Completo del Código — NetShield Dashboard v2.4

> Análisis técnico exhaustivo del codebase generado a partir de la lectura directa de: `CONTEXT.md`, `backend/CONTEXT.md`, `frontend/CONTEXT.md`, `README.md`, `backend/requirements.txt`, `frontend/package.json`. Este documento sirve como referencia para futuras preguntas sobre la arquitectura, decisiones de diseño y estado del proyecto.

---

## 1. Visión General del Proyecto

**NetShield Dashboard** es una plataforma web de monitoreo y gestión de seguridad de red para entornos de laboratorio. Integra 8 servicios externos en un único panel de control:

| Servicio | Protocolo | Función en NetShield |
|----------|-----------|---------------------|
| MikroTik CHR | RouterOS API (puerto 8728) | Router, firewall, VLANs, tráfico, portal cautivo |
| Wazuh SIEM | REST API HTTPS (puerto 55000) | Alertas de seguridad, agentes, MITRE ATT&CK |
| CrowdSec | LAPI HTTP (puerto 8080) | Inteligencia de amenazas, decisiones de bloqueo, reputación IP |
| Suricata | Unix socket + EVE → Wazuh | IDS/IPS/NSM: detección de amenazas en red |
| GLPI ITSM | REST API HTTP | Inventario de activos, tickets, correlación |
| MaxMind GeoLite2 | Archivos .mmdb locales | Geolocalización de IPs sin latencia |
| Anthropic Claude | REST API HTTPS | Reportes IA con function calling |
| Telegram Bot | Bot API HTTPS | Notificaciones bidireccionales |

**Fase actual:** Laboratorio de pruebas.
**Objetivo futuro:** Escalar a 1000 usuarios concurrentes sin reescribir la arquitectura.
**Desarrollador:** Un solo desarrollador.

---

## 2. Stack Tecnológico Completo

### Backend (Python 3.12+)

| Paquete | Versión | Propósito | Notas |
|---------|---------|-----------|-------|
| FastAPI | 0.115.6 | Framework web async | REST + WebSocket nativos |
| Uvicorn | 0.34.0 | Servidor ASGI | Incluye websockets + httptools via `[standard]` |
| Pydantic | 2.10.4 | Validación de datos | 16 archivos de schemas |
| pydantic-settings | 2.7.1 | Configuración desde .env | 9 mock flags + credenciales |
| SQLAlchemy | 2.0.36 | ORM async | Con extra `[asyncio]` |
| aiosqlite | 0.20.0 | Driver async SQLite | Zero-config DB |
| routeros-api | 0.17.0 | Cliente MikroTik | Síncrono, ejecutado en run_in_executor |
| httpx | 0.28.1 | Cliente HTTP async | Para Wazuh, CrowdSec, GLPI |
| anthropic | 0.42.0 | SDK Claude | Function calling con 8 tools |
| weasyprint | 63.1 | Generación PDF | CPU-bound, en run_in_executor |
| Jinja2 | 3.1.5 | Plantillas HTML | Template para PDF |
| structlog | 24.4.0 | Logging estructurado | Console en dev, JSON en prod |
| tenacity | 9.0.0 | Reintentos con backoff | 3 intentos, 1-10s exponencial |
| geoip2 | 4.8.1 | GeoIP local | Lectura de .mmdb en RAM |
| cachetools | 5.5.0 | TTLCache | 10K entradas, TTL 1h para GeoIP |
| python-telegram-bot | ≥20.0 | Bot Telegram | Async nativo (v20+) |
| apscheduler | ≥3.10.0 | Scheduler cron | Reportes automáticos Telegram |
| redis | 5.2.1 | Cache | Opcional, NO implementado aún |
| orjson | 3.10.13 | JSON rápido | 3-10x más rápido que json estándar |
| aiofiles | 24.1.0 | I/O async | Lectura/escritura de archivos |
| websockets | 14.1 | Protocolo WS | Incluido via uvicorn[standard] |
| python-multipart | 0.0.20 | Upload de archivos | Multipart form data |
| python-dotenv | 1.0.1 | Lectura de .env | Carga de variables de entorno |
| requests | (transitiva) | HTTP sync | Solo en glpi_collector.py vía asyncio.to_thread |

### Frontend

| Paquete | Versión | Propósito |
|---------|---------|-----------|
| React | 19.2.4 | UI framework |
| Vite | 8.0.1 | Bundler + dev server |
| TypeScript | ~5.9.3 | Tipado estático |
| TailwindCSS | 4.2.2 | Estilos con @theme |
| @tailwindcss/vite | 4.2.2 | Plugin Vite para Tailwind |
| TanStack Query | 5.96.0 | Data fetching + cache |
| Recharts | 3.8.1 | Gráficos interactivos |
| TipTap | 3.22.0 | Editor rich text (7 paquetes @tiptap/*) |
| React Router DOM | 7.13.2 | Routing SPA |
| Axios | 1.14.0 | Cliente HTTP |
| Lucide React | 1.7.0 | Iconografía |
| @dnd-kit/core | 6.3.1 | Drag-and-drop |
| @dnd-kit/sortable | 10.0.0 | Reordenamiento |
| @dnd-kit/utilities | 3.2.2 | Utilidades DnD |
| d3-geo | 3.1.1 | Proyecciones cartográficas |
| topojson-client | 3.1.0 | Datos geográficos |
| world-atlas | 2.0.2 | Atlas mundial TopoJSON |
| date-fns | 4.1.0 | Formateo de fechas |
| clsx | 2.1.1 | Composición de clases CSS |
| html5-qrcode | 2.3.8 | Scanner QR |
| prop-types | 15.8.1 | Tipos de props (dep de Recharts) |

### DevDependencies del Frontend

| Paquete | Versión | Propósito |
|---------|---------|-----------|
| @vitejs/plugin-react | 6.0.1 | Plugin React para Vite |
| @eslint/js | 9.39.4 | ESLint base |
| eslint | 9.39.4 | Linter |
| eslint-plugin-react-hooks | 7.0.1 | Reglas de hooks |
| eslint-plugin-react-refresh | 0.5.2 | HMR para React |
| typescript-eslint | 8.57.0 | ESLint + TypeScript |
| globals | 17.4.0 | Globals para ESLint |
| @types/d3-geo | 3.1.0 | Tipos d3-geo |
| @types/node | 24.12.0 | Tipos Node |
| @types/react | 19.2.14 | Tipos React |
| @types/react-dom | 19.2.3 | Tipos ReactDOM |
| @types/react-router-dom | 5.3.3 | Tipos React Router |
| @types/topojson-client | 3.1.5 | Tipos TopoJSON |

---

## 3. Infraestructura del Laboratorio

| Servicio | IP / URL | Puerto | Protocolo | Notas |
|----------|----------|--------|-----------|-------|
| MikroTik CHR | 192.168.100.118 | 8728 | RouterOS API plaintext | Solo lab, sin SSL |
| Wazuh Manager | 100.90.106.121 | 55000 | HTTPS cert autofirmado | verify=False |
| CrowdSec LAPI | localhost | 8080 | HTTP | API key de bouncer |
| Suricata | 192.168.88.50 | Unix socket | Socket + EVE → Wazuh | Alertas vía Wazuh |
| GLPI ITSM | glpi.facultad.local | 80 | HTTP REST API | Doble token |
| GeoLite2 | Local | — | Archivos .mmdb en RAM | Sin red |
| Telegram Bot | api.telegram.org | 443 | HTTPS | Webhook + API |
| Anthropic Claude | api.anthropic.com | 443 | HTTPS | claude-sonnet-4-20250514 |
| Backend NetShield | localhost | 8000 | HTTP + WS | FastAPI + Uvicorn |
| Frontend NetShield | localhost | 5173 | HTTP | Vite dev server |
| Redis | localhost | 6379 | TCP | Opcional, no implementado |

- **Acceso remoto:** Tailscale (red 100.x.x.x con subnet routing)
- **Subred de hosts:** 192.168.88.0/24 (Lubuntu con agentes Wazuh en .10 y .11)
- **venv:** En la raíz del proyecto (`netShield2/.venv/`), NO en `backend/`

---

## 4. Estructura del Backend

### Estructura de carpetas

```
backend/
├── main.py                    # App FastAPI, CORS, 7 WebSockets, lifespan
├── config.py                  # Settings con pydantic-settings, 9 mock flags
├── database.py                # SQLAlchemy async engine + session factory
├── .env / .env.example        # Variables de entorno (112 líneas)
├── requirements.txt           # Dependencias Python (53 líneas)
│
├── models/                    # 10 modelos SQLAlchemy
│   ├── ip_label.py            # IPLabel
│   ├── ip_group.py            # IPGroup + IPGroupMember
│   ├── action_log.py          # ActionLog (auditoría)
│   ├── sinkhole_entry.py      # SinkholeEntry
│   ├── portal_user.py         # PortalUserRegistry
│   ├── quarantine_log.py      # QuarantineLog
│   ├── telegram.py            # TelegramReportConfig, MessageLog, PendingMessage
│   └── custom_view.py         # CustomView (layout JSON + widgets JSON)
│
├── schemas/                   # 16 archivos Pydantic v2
│   ├── common.py              # APIResponse[T] — envelope genérico
│   ├── mikrotik.py            # InterfaceInfo, ARPEntry, TrafficData, etc.
│   ├── wazuh.py               # WazuhAgent, WazuhAlert
│   ├── network.py             # IPLabelCreate/Response, IPGroupCreate/Response
│   ├── reports.py             # ReportGenerateRequest, ReportExportRequest
│   ├── vlan.py                # VlanCreate, VlanUpdate, VlanInfo
│   ├── security.py            # SecurityBlockIPRequest, QuarantineRequest
│   ├── phishing.py            # PhishingAlert, SuspiciousDomain, Sinkhole
│   ├── portal.py              # PortalSession, PortalUser, PortalProfile
│   ├── glpi.py                # GlpiAsset, GlpiTicket, GlpiUser
│   ├── crowdsec.py            # ManualDecisionRequest, WhitelistRequest
│   ├── geoip.py               # GeoIPResult, GeoIPBulkRequest
│   ├── suricata.py            # AutoResponseTriggerRequest, RuleToggle
│   ├── telegram.py            # TelegramReportConfigCreate/Update
│   └── views.py               # CustomViewCreate, CustomViewUpdate
│
├── services/                  # 16 archivos de lógica de negocio
│   ├── mikrotik_service.py    # Singleton, 39KB, RouterOS API
│   ├── wazuh_service.py       # Singleton, 25KB, httpx + JWT
│   ├── crowdsec_service.py    # Singleton, 18KB, LAPI + CTI
│   ├── suricata_service.py    # Singleton, 30KB, Unix socket + Wazuh
│   ├── geoip_service.py       # Estático, 9KB, MaxMind + TTLCache
│   ├── glpi_service.py        # Singleton, 41KB, REST API doble token
│   ├── glpi_collector.py      # Singleton, 24KB, background task cada 5 min
│   ├── portal_service.py      # Singleton, 50KB, Hotspot MikroTik
│   ├── ai_service.py          # NO singleton, 17KB, instancia por llamada
│   ├── pdf_service.py         # 2KB, WeasyPrint + Jinja2
│   ├── telegram_service.py    # Singleton, 21KB, bot bidireccional
│   ├── telegram_scheduler.py  # 9KB, APScheduler AsyncIOScheduler
│   ├── auth_provider.py       # 7KB, autenticación hotspot
│   ├── mock_data.py           # 139KB, datos simulados seed=42
│   └── mock_service.py        # 20KB, CRUD en memoria
│
├── routers/                   # 15 routers REST
│   ├── mikrotik.py            # /api/mikrotik/* (7KB)
│   ├── wazuh.py               # /api/wazuh/* (8KB)
│   ├── crowdsec.py            # /api/crowdsec/* (23KB)
│   ├── suricata.py            # /api/suricata/* (20KB, 24 endpoints)
│   ├── geoip.py               # /api/geoip/* (9KB)
│   ├── glpi.py                # /api/glpi/* (21KB)
│   ├── portal.py              # /api/portal/* (22KB)
│   ├── reports.py             # /api/reports/* (18KB, incluye Telegram)
│   ├── network.py             # /api/network/* (11KB)
│   ├── security.py            # /api/security/* (9KB)
│   ├── phishing.py            # /api/phishing/* (17KB)
│   ├── views.py               # /api/views/* (33KB, incluye catálogo widgets)
│   ├── widgets.py             # /api/widgets/* (23KB, datos agregados)
│   ├── vlans.py               # /api/vlans/* (6KB)
│   └── cli.py                 # /api/cli/* (4KB)
│
├── scripts/
│   ├── download_geoip.py      # Descarga .mmdb de MaxMind
│   └── setup_hotspot.py       # Config inicial hotspot MikroTik
│
├── data/geoip/                # GeoLite2-City.mmdb + GeoLite2-ASN.mmdb
└── templates/report_base.html # Plantilla HTML para PDF
```

### Cifras clave del backend

- **15 routers REST** con ~160 endpoints
- **7 WebSocket endpoints** (tráfico 2s, alertas 5s, decisiones 10s)
- **16 servicios** de lógica de negocio (12 singletons + 1 instancia por llamada + 3 utilidades)
- **10 modelos** SQLAlchemy (en 8 archivos)
- **16 archivos** de schemas Pydantic
- **9 mock flags** granulares + `MOCK_ALL`

---

## 5. Análisis de Servicios del Backend

### Patrones de implementación por servicio

| Servicio | Patrón | Conexión | Mock Guard | Tamaño |
|----------|--------|----------|------------|--------|
| MikroTikService | Singleton + asyncio.Lock | RouterOsApiPool (síncrono) | should_mock_mikrotik | 39KB |
| WazuhService | Singleton | httpx.AsyncClient + JWT | should_mock_wazuh | 25KB |
| CrowdSecService | Singleton | httpx (header X-Api-Key) | should_mock_crowdsec | 18KB |
| SuricataService | Singleton | Unix socket + Wazuh API | should_mock_suricata | 30KB |
| GeoIPService | Clase estática | .mmdb en RAM + TTLCache | should_mock_geoip | 9KB |
| GLPIService | Singleton | httpx (doble token) | should_mock_glpi | 41KB |
| GlpiCollector | Singleton | requests vía asyncio.to_thread | should_mock_glpi | 24KB |
| PortalService | Singleton | Vía MikroTikService | should_mock_mikrotik | 50KB |
| AIService | **NO singleton** | anthropic SDK | should_mock_anthropic | 17KB |
| PDFService | Instancia simple | WeasyPrint (run_in_executor) | N/A | 2KB |
| TelegramService | Singleton | python-telegram-bot | should_mock_telegram | 21KB |
| TelegramScheduler | Singleton | APScheduler AsyncIOScheduler | N/A | 9KB |
| AuthProvider | Instancia simple | Vía MikroTikService | N/A | 7KB |
| MockData | Clase estática | N/A | N/A | 139KB |
| MockService | Clase estática | Estado en memoria | N/A | 20KB |

### Funciones públicas principales por servicio

**MikroTikService:** `get_interfaces()`, `get_connections()`, `get_arp_table()`, `get_traffic()`, `get_firewall_rules()`, `get_blacklist()`, `block_ip()`, `unblock_ip()`, `get_logs()`, `get_health()`, `get_vlan_traffic()`, `create_vlan()`, `update_vlan()`, `delete_vlan()`, `run_command()`, `get_vlan_addresses()`

**WazuhService:** `get_agents()`, `get_agents_summary()`, `get_alerts(limit, level_min, offset)`, `get_alerts_by_agent()`, `get_mitre_summary()`, `get_health()`, `get_critical_alerts()`, `send_active_response()`

**CrowdSecService:** `get_decisions()`, `get_decisions_stream()`, `add_decision()`, `delete_decision()`, `get_metrics()`, `get_bouncers()`, `get_scenarios()`, `get_alerts()`, `cti_lookup()`, `get_top_attackers()`, `sync_to_mikrotik()`

**SuricataService:** `get_engine_status()`, `get_engine_stats()`, `reload_rules()`, `get_alerts()`, `get_alerts_timeline()`, `get_top_signatures()`, `get_alert_categories()`, `get_flows()`, `get_flows_stats()`, `get_dns_queries()`, `get_http_transactions()`, `get_tls_handshakes()`, `get_rules()`, `toggle_rule()`, `get_crowdsec_correlation()`, `get_wazuh_correlation()`, `trigger_auto_response()`

**GeoIPService:** `lookup(ip)`, `lookup_bulk(ips)`, `get_top_countries(source_data)`, `get_db_status()`

**GLPIService:** `get_assets()`, `get_asset()`, `create_asset()`, `update_asset()`, `get_asset_stats()`, `get_asset_health()`, `get_tickets()`, `create_ticket()`, `update_ticket_status()`, `get_users()`, `get_locations()`, `quarantine_asset()`, `unquarantine_asset()`

**AIService:** `generate_report(prompt, audience, data_sources)`, `answer_telegram_query(message, chat_id)`, `collect_view_context(widget_types)`. Tiene 8 tools de function calling: `get_wazuh_alerts`, `get_wazuh_agents`, `get_crowdsec_decisions`, `get_mikrotik_interfaces`, `get_mikrotik_traffic`, `get_suricata_stats`, `get_glpi_assets`, `get_geoip_top_countries`. 4 system prompts: executive, technical, operational, telegram. Máx 10 iteraciones de tool use.

**TelegramService:** `connect()`, `close()`, `send_message()`, `send_alert()`, `send_status_summary()`, `get_status()`, `get_message_logs()`, `process_incoming_message()`

**PortalService:** `check_hotspot_status()`, `get_active_sessions()`, `get_session_history()`, `get_realtime_stats()`, `get_summary_stats()`, `get_users()`, `create_user()`, `update_user()`, `delete_user()`, `bulk_import_users()`, `get_speed_profiles()`, `get_config()`, `update_config()`, `get_schedule()`, `update_schedule()`, `setup_hotspot()`

### WebSockets implementados

| Ruta | Intervalo | Fuente | Mock function |
|------|-----------|--------|---------------|
| `/ws/traffic` | 2s | MikroTik | `MockData.websocket.traffic_tick(tick)` |
| `/ws/alerts` | 5s | Wazuh | `MockData.websocket.alerts_tick(tick)` |
| `/ws/vlans/traffic` | 2s | MikroTik + Wazuh | `MockData.websocket.vlan_traffic_tick(tick)` |
| `/ws/security/alerts` | 5s | Wazuh + MikroTik | `MockData.websocket.security_alert(tick)` |
| `/ws/portal/sessions` | 5s | Portal Service | `MockData.websocket.portal_session(tick)` |
| `/ws/crowdsec/decisions` | 10s | CrowdSec | `MockData.websocket.crowdsec_decision_tick(tick)` |
| `/ws/suricata/alerts` | 5s | Suricata vía Wazuh | `MockData.websocket.suricata_alert_tick(tick)` |

### Base de datos — 10 modelos

| Modelo | Tabla | Campos principales |
|--------|-------|-------------------|
| IPLabel | ip_labels | id, ip_address, label, color, created_at |
| IPGroup | ip_groups | id, name, description, created_at |
| IPGroupMember | ip_group_members | id, group_id (FK), ip_address, label |
| ActionLog | action_logs | id, action_type, target_ip, details (JSON), performed_by, comment, created_at |
| SinkholeEntry | sinkhole_entries | id, domain, reason, created_at |
| PortalUserRegistry | portal_user_registry | id, username, created_at |
| QuarantineLog | quarantine_logs | id, asset_id, ip_address, action, reason, created_at |
| TelegramReportConfig | telegram_report_configs | id, name, cron_expression, audience, data_sources, enabled, etc. |
| TelegramMessageLog | telegram_message_logs | id, chat_id, direction, message_type, content, timestamp |
| TelegramPendingMessage | telegram_pending_messages | id, chat_id, message_text, created_at |
| CustomView | custom_views | id, name, description, layout (JSON), widgets (JSON), created_at, updated_at |

### Sistema de Mock — Entidades coherentes

| IP | MikroTik ARP | Wazuh Agent | GLPI Asset |
|----|-------------|-------------|------------|
| 192.168.88.10 | lubuntu_desk_1 | agente 004 | PC-Lab-01 |
| 192.168.88.11 | lubuntu_desk_2 | agente 005 | PC-Lab-02 |
| 192.168.88.50 | wazuh-server | agente 000 | Server-Wazuh |
| 203.0.113.45 | — | Atacante brute-force | — |


---

## 6. Estructura del Frontend

### Estructura de carpetas

```
frontend/src/
├── main.tsx                           # Entry point
├── App.tsx                            # QueryClientProvider + BrowserRouter + 21 rutas
├── index.css                          # Design system completo (121KB)
├── types.ts                           # Tipos TypeScript (~39KB, ~1600 líneas)
│
├── services/
│   └── api.ts                         # Cliente Axios centralizado (~37KB, 15+ namespaces)
│
├── config/
│   └── themes.ts                      # 6 temas (ThemeConfig[], ThemeId, font scale)
│
├── lib/
│   └── countryCodeMap.ts              # Mapa CountryName → ISO2
│
├── hooks/                             # 38 custom hooks de datos
│   ├── useWebSocket.ts                # Hook base: reconexión + backoff exponencial
│   ├── useTheme.ts                    # Gestión de temas: localStorage + CSS vars
│   ├── useWazuhSummary.ts             # Alertas + agents + MITRE + health
│   ├── useMikrotikHealth.ts           # Health del router
│   ├── useCrowdSecDecisions.ts        # Decisions CRUD + mutations
│   ├── useCrowdSecMetrics.ts          # Métricas + health export
│   ├── useCrowdSecAlerts.ts           # Alertas LAPI
│   ├── useGeoIP.ts                    # Lookup individual (staleTime 1h)
│   ├── useTopCountries.ts             # Top países atacantes
│   ├── useGeoBlockSuggestions.ts      # Sugerencias + apply mutation
│   ├── useSuricataEngine.ts           # Status + stats + reload + isHealthy
│   ├── useSuricataAlerts.ts           # Alertas + timeline + top firmas + WebSocket
│   ├── useSuricataFlows.ts            # Flows + DNS + HTTP + TLS
│   ├── useSuricataRules.ts            # Rules + toggle + update mutations
│   ├── useSuricataAutoResponse.ts     # Config + history + trigger
│   ├── useSuricataCorrelation.ts      # CrowdSec × Wazuh correlation
│   ├── useGlpiAssets.ts               # Assets CRUD + stats + health + quarantine
│   ├── useGlpiTickets.ts              # Tickets CRUD
│   ├── useGlpiUsers.ts               # Users lista
│   ├── useGlpiHealth.ts              # Health correlacionada
│   ├── usePortalSessions.ts           # Sessions + WebSocket
│   ├── usePortalUsers.ts              # Users CRUD + bulk import
│   ├── usePortalConfig.ts             # Config + schedule + setup
│   ├── usePortalStats.ts              # Stats históricas
│   ├── usePhishing.ts                 # Alertas + víctimas + sinkhole CRUD
│   ├── useSecurityActions.ts          # Block, quarantine, geo-block mutations
│   ├── useSecurityAlerts.ts           # WebSocket /ws/security/alerts + notificaciones
│   ├── useVlans.ts                    # VLANs CRUD
│   ├── useVlanTraffic.ts              # WebSocket /ws/vlans/traffic
│   ├── useIpContext.ts                # CTI CrowdSec + GeoIP combinado
│   ├── useNetworkSearch.ts            # Búsqueda global con debounce
│   ├── useSyncStatus.ts              # Sync CrowdSec → MikroTik
│   ├── useCustomViews.ts             # Views CRUD
│   ├── useWidgetCatalog.ts            # Catálogo de widgets por categoría
│   ├── useTelegramStatus.ts           # Estado bot (refetch 30s)
│   ├── useTelegramConfigs.ts          # Configs CRUD + trigger + test
│   ├── useTelegramLogs.ts             # Historial mensajes con filtros
│   └── useQrScanner.ts               # Cámara + QR decode (estado local)
│   │
│   └── widgets/                       # Hooks de datos para widgets
│       ├── visual/index.ts            # 10 hooks
│       ├── technical/index.ts         # 12 hooks
│       └── hybrid/index.ts            # 14 hooks
│
└── components/
    ├── Layout.tsx                      # Sidebar 7 grupos + topbar (5 status dots)
    ├── common/                         # 6 componentes: MockModeBadge, GlobalSearch, ConfirmModal, SettingsDrawer, ThemeCard, FontSizeSlider
    ├── security/                       # 4: QuickView, ConfigView, NotificationPanel, LastIncidentCard
    ├── dashboard/                      # 4: DashboardPage, TrafficChart, ConnectionsTable, AlertsFeed
    ├── firewall/                       # 1: FirewallPage
    ├── network/                        # 1: NetworkPage (tabs: ARP/VLANs/Labels/Groups)
    ├── vlans/                          # 4: VlanPanel, VlanTable, VlanTrafficCard, VlanFormModal
    ├── portal/                         # 13: PortalPage, MonitorView, SessionsTable, SessionsChart, StatsView, UsersView, UserTable, UserFormModal, BulkImportModal, SpeedProfiles, ConfigView, ScheduleConfig, UsageHeatmap
    ├── phishing/                       # 1: PhishingPanel
    ├── system/                         # 3: SystemHealth, RemoteCLI, GeoIPStatus
    ├── reports/                        # 10: ReportsPage, TelegramTab, TelegramStatusCard, TelegramConfigList, TelegramConfigModal, CronBuilder, MessagePreview, TelegramQuickActions, TelegramHistory, BotConversation
    ├── inventory/                      # 14: InventoryPage, AssetsView, AssetDetail, AssetFormModal, AssetSearch, AssetHealthTable, HealthView, TicketsView, TicketKanban, TicketCard, TicketFormModal, UsersView, LocationMap, QrScanner
    ├── crowdsec/                       # 13: CommandCenter, DecisionsTable, DecisionsTimeline, IntelligenceView, TopAttackers, CountryHeatmap, ScenariosTable, IpContextPanel, CommunityScoreBadge, BouncerStatus, SyncStatusBanner, ConfigView, WhitelistManager
    ├── suricata/                       # 4: MotorPage (19KB), AlertsPage (16KB), NSMPage (15KB), RulesPage (12KB)
    ├── geoip/                          # 5: CountryFlag, NetworkTypeBadge, TopCountriesWidget, GeoBlockSuggestions, SuggestionCard
    ├── views/                          # 4: ViewsListPage, ViewBuilderPage, ViewDetailPage, WidgetRenderer (22KB)
    └── widgets/                        # 36+ componentes de widget
        ├── common/index.tsx            # WidgetSkeleton, WidgetErrorState, WidgetHeader
        ├── visual/                     # 10: ThreatGauge, ActivityHeatmap, NetworkPulse, AgentsThermometer, BlocksTimeline, EventCounter, ProtocolDonut, PortalUsage, PhishingStats, AgentAlertHeatmap
        ├── technical/                  # 12: PacketInspector, FlowTableWidget, LiveLogs, FirewallTree, CrowdSecRaw, CorrelationTimeline, CriticalAssets, ActionLogWidget, DnsMonitor, TlsFingerprint, BandwidthTop, HttpInspector
        └── hybrid/                     # 14: WorldThreatMap, ConfirmedThreats, CountryRadar, IpProfiler, IncidentLifecycle, DefenseLayers, GeoblockPredictor, SuricataGlpiCorrelation, ViewReportGenerator, TelegramActivity, MitreMatrix, VlanHealth, QuarantineTracker, SinkholeEffectiveness
```

### Cifras clave del frontend

- **21 rutas** (19 reales + 1 redirect + 1 fallback)
- **80+ componentes** en carpetas por dominio
- **38 custom hooks** de datos
- **53 widgets** en 4 categorías (17 standard + 10 visual + 12 technical + 14 hybrid)
- **15+ namespaces** de API en api.ts (~37KB)
- **~1600 líneas** de tipos en types.ts (~39KB)
- **121KB** de design system en index.css
- **6 temas** visuales + 4 escalas de fuente

---

## 7. Rutas del Frontend

| Ruta | Componente | Grupo Sidebar |
|------|-----------|---------------|
| `/` | QuickView | Seguridad |
| `/security/config` | ConfigView | Seguridad |
| `/network` | NetworkPage | Infraestructura |
| `/firewall` | FirewallPage | Infraestructura |
| `/portal` | PortalPage | Infraestructura |
| `/phishing` | PhishingPanel | Herramientas |
| `/system` | SystemHealth | Herramientas |
| `/reports` | ReportsPage | Herramientas |
| `/inventory` | InventoryPage | Inventario |
| `/crowdsec` | CrowdSecCommandCenter | CrowdSec |
| `/crowdsec/intelligence` | CrowdSecIntelligence | CrowdSec |
| `/crowdsec/config` | CrowdSecConfig | CrowdSec |
| `/suricata` | SuricataMotorPage | Suricata |
| `/suricata/alerts` | SuricataAlertsPage | Suricata |
| `/suricata/network` | SuricataNSMPage | Suricata |
| `/suricata/rules` | SuricataRulesPage | Suricata |
| `/views` | ViewsListPage | Mis Vistas |
| `/views/new` | ViewBuilderPage | Mis Vistas |
| `/views/:id` | ViewDetailPage | Mis Vistas |
| `/views/:id/edit` | ViewBuilderPage | Mis Vistas |
| `/vlans` | → Redirect a `/network` | Legacy |

**Sidebar:** 7 grupos, 19 de 20 ítems máximos usados (1 slot libre).
**Topbar:** 5 status dots (MikroTik, Wazuh, CrowdSec, Suricata, GLPI).

---

## 8. Design System

### Tokens CSS (@theme en index.css)

```css
@theme {
  --color-brand-50 a --color-brand-900       /* Indigo/violeta */
  --color-surface-50 a --color-surface-950   /* Grises slate */
  --color-severity-critical: #ef4444;
  --color-severity-high: #f97316;
  --color-severity-medium: #eab308;
  --color-severity-low: #3b82f6;
  --color-severity-info: #6b7280;
  --color-success: #10b981;
  --color-warning: #f59e0b;
  --color-danger: #ef4444;
}
```

### 6 Temas implementados

| data-theme | Nombre | Tipo | Colores principales |
|-----------|--------|------|---------------------|
| dark | Dark OLED | Dark | #000000, #0a0a0a, #3b82f6 |
| navy | Navy Blue | Dark | #0d1117, #161b22, #2f81f7 |
| purple | Purple Dark | Dark | #1e1e2e, #27273a, #cba6f7 |
| arctic | Arctic Blue | Dark | #2e3440, #3b4252, #88c0d0 |
| light | Light | Light | #ffffff, #f1f5f9, #3b82f6 |
| sepia | Sepia | Light | #f4ede4, #ede4d8, #8b5e3c |

Default: `dark`. Persiste en localStorage (`netshield_theme`).

### Clases CSS reutilizables del design system

| Categoría | Clases |
|-----------|--------|
| Layout | `glass-card`, `stat-card`, `sidebar`, `sidebar-link`, `sidebar-section-title` |
| Datos | `data-table`, `badge`, `badge-critical/high/medium/low/info/success/danger` |
| Interacción | `btn`, `btn-primary/danger/ghost/success`, `input` |
| Estado | `status-dot active/disconnected/pending` |
| Animación | `animate-fade-in-up`, `stagger-1/2/3/4`, `loading-spinner` |
| Editor | `tiptap-editor`, `tiptap-toolbar` |
| Settings | `settings-gear-btn` |

### TanStack Query — Configuración global

```typescript
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 2,
      staleTime: 5_000,
    },
  },
});
```

### Query Keys principales

| Query Key | Hook | Datos |
|-----------|------|-------|
| `['wazuh-agents']` | useWazuhSummary | Agentes Wazuh |
| `['wazuh-alerts']` | useWazuhSummary | Alertas Wazuh |
| `['mikrotik-health']` | useMikrotikHealth | Health MikroTik |
| `['firewall-rules']` | (FirewallPage) | Reglas firewall |
| `['crowdsec-decisions']` | useCrowdSecDecisions | Decisiones CrowdSec |
| `['crowdsec-metrics']` | useCrowdSecMetrics | Métricas CrowdSec |
| `['suricata-engine']` | useSuricataEngine | Estado motor |
| `['suricata-alerts']` | useSuricataAlerts | Alertas Suricata |
| `['geoip-lookup', ip]` | useGeoIP | Lookup individual |
| `['top-countries']` | useTopCountries | Top países |
| `['glpi-assets']` | useGlpiAssets | Assets GLPI |
| `['glpi-tickets']` | useGlpiTickets | Tickets GLPI |
| `['portal-users']` | usePortalUsers | Usuarios portal |
| `['custom-views']` | useCustomViews | Vistas personalizadas |
| `['widget-catalog']` | useWidgetCatalog | Catálogo widgets |
| `['telegram-status']` | useTelegramStatus | Status bot |
| `['telegram-configs']` | useTelegramConfigs | Configs Telegram |
| `['widget', '<type>']` | Widget hooks | Datos de widget |

---

## 9. Convenciones de Código

### Backend

- **Respuesta consistente:** `APIResponse.ok(data)` / `APIResponse.fail(error)` — siempre `{success, data, error}`
- **Un router por dominio:** 15 routers con prefijo `/api/{dominio}`
- **Servicios singleton:** Variable de módulo + `get_X_service()`. Excepción: AIService (instancia por llamada)
- **Mock guard en servicios:** Primera línea de cada método: `if settings.should_mock_X: return MockData.X.funcion()`
- **Async everywhere:** Todo es async. Síncronos en `run_in_executor` o `asyncio.to_thread`
- **Logging:** `structlog` siempre, nunca `print()`
- **Errores:** Try/except → `APIResponse.fail(str(e))`. Nunca propagar excepciones
- **Retry:** `tenacity @retry` — backoff 1-10s, 3 intentos
- **Lazy imports:** Cross-service calls con import dentro de función
- **Credenciales:** Todo vía `config.py` → `.env`. Nunca hardcodeadas
- **MikroTik:** SIEMPRE usar `_api_call()` (maneja threading, locks, reconexión)

### Frontend

- **Componentes:** PascalCase, un archivo por componente, por dominio
- **Hooks:** Prefijo `use`, un hook por fuente de datos
- **API:** Todo en `services/api.ts`, nunca fetch directo
- **Tipos:** Todo en `types.ts`, espejo de schemas Pydantic
- **Data fetching:** TanStack Query con queryKey descriptivos
- **Estilos:** TailwindCSS v4 con @theme en index.css. Sin tailwind.config.js
- **WebSocket:** Hook genérico `useWebSocket(url)`. NO existe `useTrafficSocket.ts`

---

## 10. Estado Actual y Pendientes

### Implementado y operativo

**Backend:**
- [x] Config con pydantic-settings, 9 flags mock + MOCK_ALL
- [x] Base de datos SQLAlchemy async, 10 modelos
- [x] 15 routers REST con ~160 endpoints
- [x] 7 WebSocket endpoints
- [x] 15 servicios de lógica de negocio
- [x] GLPI collector background task
- [x] Function calling Claude (8 tools)
- [x] Mock system completo

**Frontend:**
- [x] 21 rutas (19 reales + 1 redirect + 1 fallback)
- [x] Layout con sidebar 7 grupos + topbar 5 status dots
- [x] 53 widgets en 4 categorías
- [x] 6 temas visuales con font scale
- [x] 38 custom hooks de datos
- [x] Sistema de vistas drag-and-drop
- [ ] Responsive móvil (funcional pero no refinado)
- [ ] Autenticación de usuario

### Pendientes de implementación

- [ ] Cache Redis para métricas en tiempo real
- [ ] Tests unitarios y de integración
- [ ] Autenticación de usuarios (JWT/sesiones)
- [ ] Rate limiting en endpoints
- [ ] Validación de permisos por rol (RBAC)
- [ ] Docker Compose para deployment
- [ ] CI/CD pipeline

### Riesgos de seguridad conocidos (aceptados para laboratorio)

- `verify=False` en HTTPS hacia Wazuh (cert autofirmado)
- RouterOS API en plaintext (puerto 8728, sin TLS)
- CrowdSec LAPI en HTTP local (sin TLS)
- CORS permite `localhost:5173` y `localhost:3000`
- Sin autenticación de usuarios en endpoints
- Sin rate limiting
- CLI web ejecuta comandos RouterOS remotos

---

## 11. Decisiones de Arquitectura Clave

1. **Singleton para MikroTik:** RouterOS tiene límite bajo de sesiones. asyncio.Lock serializa operaciones.
2. **run_in_executor para routeros-api:** Librería 100% síncrona. Thread pool evita bloquear event loop.
3. **httpx en vez de requests:** Async nativo, consistente con la arquitectura. requests solo en glpi_collector.
4. **SQLite en vez de PostgreSQL:** Zero-config para laboratorio. Migrable cambiando DATABASE_URL.
5. **Function calling en IA:** Claude decide qué datos necesita en runtime. 8 tools, max 10 iteraciones.
6. **TailwindCSS v4 @theme:** CSS nativo para tokens. Sin tailwind.config.js.
7. **Mock guards en servicios, no routers:** Los WebSockets no pasan por routers.
8. **GeoIP local:** Sin latencia, sin rate limits. TTLCache(10000, ttl=3600).
9. **GLPI Collector como background task:** API GLPI lenta, collector cada 5min + cache en memoria.
10. **Vistas personalizadas con widgets:** Dashboard estático no cubre todos los perfiles.
11. **Catálogo server-driven:** Backend define widgets disponibles, frontend consume dinámicamente.
12. **WidgetRenderer desacoplado:** Un switch mapea type → componente. Extensible en 5 pasos.

---

## 13. Arquitectura del Frontend: SPA (Single-Page Application)

NetShield Dashboard es una **SPA (Single-Page Application)** con renderizado enteramente en el cliente (**CSR — Client-Side Rendering**). A continuación las evidencias concretas extraídas del código fuente.

### 13.1 Un solo archivo HTML servido al navegador

En `frontend/index.html` existe un único `<div id="root">` donde React monta toda la aplicación. El servidor nunca genera HTML dinámico — sirve este archivo estático una sola vez y JavaScript toma el control total del DOM.

### 13.2 Client-Side Routing con React Router

En `frontend/src/App.tsx` se usa `BrowserRouter` + `<Routes>` de `react-router-dom`. Esto significa que la navegación entre las ~23 rutas (`/`, `/network`, `/firewall`, `/crowdsec`, etc.) ocurre **sin recargar la página**. React Router intercepta los cambios de URL y renderiza el componente correspondiente directamente en el cliente.

### 13.3 Layout persistente con `<Outlet />`

En `frontend/src/components/Layout.tsx`, el sidebar, topbar y status indicators se renderizan **una sola vez**. Solo el contenido interno cambia vía `<Outlet />` (línea 298 de Layout.tsx). La estructura visual persiste entre navegaciones — rasgo definitorio de una SPA.

### 13.4 Bundled por Vite (CSR puro, sin SSR)

En `frontend/vite.config.ts` se configura Vite como bundler con `@vitejs/plugin-react`. **No hay SSR** (Server-Side Rendering), ni SSG (Static Site Generation), ni metaframework tipo Next.js o Remix. Es React "vanilla" con Vite — 100% client-side.

### 13.5 Data fetching asíncrono desde el cliente

Todo el data fetching se realiza con **TanStack Query** (`useQuery` / `useMutation`) llamando a un backend API en `:8000` vía proxy de Vite. No hay pre-rendering ni datos inyectados desde el servidor en el HTML.

### 13.6 Tabla resumen

| Característica | Valor |
|---|---|
| **Arquitectura** | SPA (Single-Page Application) |
| **Rendering** | CSR (Client-Side Rendering) |
| **Router** | React Router v7 (`BrowserRouter`) |
| **Bundler** | Vite 8 |
| **Framework UI** | React 19 (sin metaframework) |
| **Data Fetching** | TanStack Query 5 → REST API + 7 WebSockets |
| **SSR / SSG** | No |

> **Definición formal:** Una SPA con renderizado enteramente en el cliente (CSR), routing declarativo client-side, y comunicación con el backend vía API REST y WebSockets.

---

*Análisis generado: 2026-05-25*
*Fuentes: CONTEXT.md, backend/CONTEXT.md, frontend/CONTEXT.md, README.md, requirements.txt, package.json*
*Versión del proyecto: 2.4*
*Total de archivos analizados: 120+*
