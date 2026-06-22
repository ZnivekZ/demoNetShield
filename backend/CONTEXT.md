# Backend — NetShield Dashboard

## Estructura de carpetas

```
backend/
├── main.py                    # Punto de entrada FastAPI, CORS, 7 WebSockets, lifespan
├── config.py                  # Settings con pydantic-settings, lee .env, 9 mock flags
├── database.py                # SQLAlchemy async engine + session factory + init_db()
├── .env                       # Variables de entorno (NO commitear)
├── .env.example               # Plantilla de variables de entorno (112 líneas)
├── requirements.txt           # Dependencias Python con versiones pinneadas (53 líneas)
│
├── models/                    # Modelos SQLAlchemy (tablas de base de datos)
│   ├── __init__.py            # Re-exporta todos los modelos (11 clases)
│   ├── ip_label.py            # IPLabel: etiquetas asignadas a IPs
│   ├── ip_group.py            # IPGroup + IPGroupMember: grupos de IPs con criterios
│   ├── action_log.py          # ActionLog: auditoría de acciones (bloqueos, reportes, etc.)
│   ├── sinkhole_entry.py      # SinkholeEntry: dominios en sinkhole DNS
│   ├── portal_user.py         # PortalUserRegistry: usuarios del portal cautivo creados via NetShield
│   ├── quarantine_log.py      # QuarantineLog: log de activos GLPI puestos en cuarentena
│   ├── telegram.py            # TelegramReportConfig, TelegramMessageLog, TelegramPendingMessage
│   ├── custom_view.py         # CustomView: vistas personalizadas del dashboard (layout JSON)
│   └── user.py                # User: operadores del dashboard (auth JWT)
│
├── schemas/                   # Pydantic v2 schemas para request/response (18 archivos)
│   ├── __init__.py            # Re-exporta todos los schemas
│   ├── common.py              # APIResponse[T]: envelope genérico {success, data, error}
│   ├── auth.py                # LoginRequest, TokenResponse, UserResponse, UserCreate, UserUpdate
│   ├── mikrotik.py            # InterfaceInfo, ConnectionInfo, ARPEntry, TrafficData, etc.
│   ├── wazuh.py               # WazuhAgent, WazuhAlert, ActiveResponseRequest
│   ├── network.py             # IPLabelCreate/Response, IPGroupCreate/Response
│   ├── reports.py             # ReportGenerateRequest, ReportExportRequest, ReportDraft
│   ├── vlan.py                # VlanCreate, VlanUpdate, VlanInfo, VlanTrafficData
│   ├── security.py            # SecurityBlockIPRequest, QuarantineRequest, GeoBlockRequest, CLI*
│   ├── phishing.py            # PhishingAlert, SuspiciousDomain, PhishingVictim, Sinkhole*
│   ├── portal.py              # PortalSession, PortalUser, PortalProfile, PortalConfig, Schedule*
│   ├── glpi.py                # GlpiAsset, GlpiTicket, GlpiUser, GlpiAssetHealth, Quarantine*
│   ├── crowdsec.py            # ManualDecisionRequest, WhitelistRequest, FullRemediationRequest
│   ├── geoip.py               # GeoIPResult, GeoIPBulkRequest, TopCountriesResponse, GeoBlockSuggestion
│   ├── suricata.py            # AutoResponseTriggerRequest, AutoResponseConfigUpdate, RuleToggle*
│   ├── telegram.py            # TelegramReportConfigCreate/Update/Response, TelegramBotQuery
│   ├── views.py               # CustomViewCreate, CustomViewUpdate
│   └── dhcp.py                # DhcpServer, DhcpLease, DhcpNetwork, DhcpPool, DhcpSubnetUsage,
│                              # DhcpRogueAlert, DhcpOption + 11 schemas de request (Create/Update/Block)
│
├── services/                  # Lógica de negocio (17 archivos)
│   ├── __init__.py
│   ├── auth_service.py        # Singleton: JWT (python-jose) + bcrypt (passlib). CRUD de usuarios. Sin mock.
│   ├── mikrotik_service.py    # Singleton: conexión RouterOS API con reconexión automática (39KB)
│   ├── wazuh_service.py       # Singleton: cliente httpx async con JWT auth (25KB)
│   ├── crowdsec_service.py    # Singleton: bouncer LAPI, decisiones, CTI, sync a MikroTik (18KB)
│   ├── suricata_service.py    # Singleton: Unix socket + Wazuh, auto-response coordinado (30KB)
│   ├── geoip_service.py       # Clase con métodos estáticos: MaxMind GeoLite2, TTLCache (9KB)
│   ├── glpi_service.py        # Singleton: cliente GLPI REST API, doble token (41KB)
│   ├── glpi_collector.py      # Singleton: background task que sincroniza assets GLPI cada 5 min (24KB)
│   ├── portal_service.py      # Singleton: gestión Hotspot MikroTik (50KB)
│   ├── ai_service.py          # NO singleton: instancia por llamada. Claude function calling (17KB)
│   ├── pdf_service.py         # WeasyPrint + Jinja2 para generar PDF (2KB)
│   ├── telegram_service.py    # Singleton: bot bidireccional outbound + inbound (21KB)
│   ├── telegram_scheduler.py  # APScheduler para reportes automáticos (9KB)
│   ├── auth_provider.py       # Autenticación de usuarios hotspot contra MikroTik (7KB)
│   ├── mock_data.py           # Repositorio central de datos simulados, seed=42 (~152KB)
│   └── mock_service.py        # Facade CRUD en memoria + get_mock_status() (20KB)
│                              # GLPI users CRUD en mock: glpi_get_users(), glpi_create_user(),
│                              #   glpi_update_user(), glpi_delete_user(), glpi_assign_asset()
│
├── routers/                   # Endpoints FastAPI, un archivo por dominio (17 archivos)
│   ├── __init__.py
│   ├── auth.py                # /api/auth/* — login, me, logout, CRUD usuarios (JWT dependency)
│   ├── mikrotik.py            # /api/mikrotik/* (7KB)
│   ├── wazuh.py               # /api/wazuh/* (8KB)
│   ├── crowdsec.py            # /api/crowdsec/* (23KB)
│   ├── suricata.py            # /api/suricata/* (20KB)
│   ├── geoip.py               # /api/geoip/* (9KB)
│   ├── glpi.py                # /api/glpi/* — incluye DELETE /assets/{id}, PUT /assets/{id}/assign,
│   │                          #   GET/POST/PUT/DELETE /users/{id} (29KB)
│   ├── portal.py              # /api/portal/* (22KB)
│   ├── reports.py             # /api/reports/* (reportes + telegram, 18KB)
│   ├── network.py             # /api/network/* (11KB)
│   ├── security.py            # /api/security/* (9KB)
│   ├── phishing.py            # /api/phishing/* (17KB)
│   ├── views.py               # /api/views/* (incluye catálogo de widgets, 33KB)
│   ├── widgets.py             # /api/widgets/* (datos agregados multi-servicio, 23KB)
│   ├── vlans.py               # /api/vlans/* (6KB)
│   ├── cli.py                 # /api/cli/* (4KB)
│   └── dhcp.py                # /api/dhcp/* — Fase 1: CRUD DHCP (servers, leases, networks, pools,
│                              #   alerts, options) + Fase 2: correlación GLPI, discovery,
│                              #   enriquecimiento Wazuh, bloqueo rogue, tickets GLPI (29KB)
│
├── scripts/                   # Utilidades de mantenimiento
│   ├── download_geoip.py      # Descarga bases de datos MaxMind GeoLite2 (.mmdb)
│   └── setup_hotspot.py       # Configuración inicial del hotspot MikroTik
│
├── data/                      # Datos persistentes locales
│   └── geoip/                 # GeoLite2-City.mmdb + GeoLite2-ASN.mmdb (no en git)
│
└── templates/                 # Plantillas Jinja2
    └── report_base.html       # Template HTML para PDF con cover page y estilos
```

---

## Servicios externos — patrón de implementación

### `mikrotik_service.py` — MikroTikService

**Patrón:** Singleton vía variable de módulo + `get_mikrotik_service()`.
**Mock guard:** `if settings.should_mock_mikrotik: return MockData.mikrotik.X()`
**Conexión:** `routeros_api.RouterOsApiPool` con `plaintext_login=True`. Todas las llamadas vía `run_in_executor`.
**Reconexión:** Si falla, `_connected = False` → reconexión → reintento. `@retry` de tenacity (3 intentos, backoff 1-10s).
**Tráfico:** `get_traffic()` calcula delta de bytes/paquetes dividido por tiempo transcurrido.
**APIs:** API RouterOS en `MIKROTIK_HOST:MIKROTIK_PORT`.

**Funciones públicas principales:**
`get_interfaces()`, `get_connections()`, `get_arp_table()`, `get_traffic()`, `get_firewall_rules()`, `get_blacklist()`, `block_ip()`, `unblock_ip()`, `get_logs()`, `get_health()`, `get_vlan_traffic()`, `create_vlan()`, `update_vlan()`, `delete_vlan()`, `run_command()`, `get_vlan_addresses()`.

**Funciones de topología de red (5 métodos — Fase 1):**
`get_nat_rules()`, `get_routes()`, `get_ip_addresses()`, `get_bridge_ports()`.

**Funciones QoS / Simple Queues (4 métodos — Fase 1):**
`get_queues()`, `create_queue()`, `update_queue()`, `delete_queue()`.

**Funciones DHCP (20 métodos):**
`get_dhcp_servers()`, `create_dhcp_server()`, `toggle_dhcp_server()`,
`get_dhcp_leases()`, `create_dhcp_lease()`, `update_dhcp_lease()`, `delete_dhcp_lease()`, `make_lease_static()`, `set_dhcp_lease_block()`,
`get_dhcp_networks()`, `create_dhcp_network()`, `update_dhcp_network()`,
`get_ip_pools()`, `create_ip_pool()`, `update_ip_pool()`, `get_dhcp_subnet_usage()`,
`get_dhcp_rogue_alerts()`, `create_dhcp_rogue_alert()`,
`get_dhcp_options()`, `create_dhcp_option()`.

---

### `wazuh_service.py` — WazuhService

**Patrón:** Singleton vía `get_wazuh_service()`.
**Mock guard:** `if settings.should_mock_wazuh: return MockData.wazuh.X()`
**Autenticación:** JWT de dos pasos (POST `/security/user/authenticate` → Bearer token). Auto-refresh en 401.
**Cliente:** `httpx.AsyncClient` con `verify=False` (cert autofirmado), timeout 30s.
**Enriquecimiento GeoIP:** `get_alerts()` agrega campo `geo` vía `GeoIPService.lookup()` (try/except silencioso).

**Funciones públicas:**
`get_agents()`, `get_agents_summary()`, `get_alerts(limit, level_min, offset)`, `get_alerts_by_agent()`, `get_mitre_summary()`, `get_health()`, `get_critical_alerts()`, `send_active_response()`.

---

### `crowdsec_service.py` — CrowdSecService

**Patrón:** Singleton vía `get_crowdsec_service()`.
**Mock guard:** `if settings.should_mock_crowdsec: return MockData.crowdsec.X()`
**Conexión:** LAPI HTTP (puerto 8080), header `X-Api-Key`.
**Enriquecimiento:** Cada decisión se enriquece con `GeoIPService.lookup(ip)`.

**Funciones públicas:**
`get_decisions()`, `get_decisions_stream()`, `add_decision()`, `delete_decision()`, `get_metrics()`, `get_bouncers()`, `get_scenarios()`, `get_alerts()`, `cti_lookup()`, `get_top_attackers()`, `sync_to_mikrotik()`.

---

### `suricata_service.py` — SuricataService

**Patrón:** Singleton vía `get_suricata_service()`.
**Mock guard:** `if settings.should_mock_suricata: return MockData.suricata.X()`
**Dual canal:** Unix socket (control motor) + Wazuh API (alertas y flujos).
**Auto-response:** `trigger_auto_response(ip, ...)` → ActionLog → CrowdSec → MikroTik.

**Funciones públicas:**
`get_engine_status()`, `get_engine_stats()`, `reload_rules()`, `get_alerts()`, `get_alerts_timeline()`, `get_top_signatures()`, `get_alert_categories()`, `get_flows()`, `get_flows_stats()`, `get_dns_queries()`, `get_http_transactions()`, `get_tls_handshakes()`, `get_rules()`, `toggle_rule()`, `get_crowdsec_correlation()`, `get_wazuh_correlation()`, `trigger_auto_response()`.

---

### `geoip_service.py` — GeoIPService

**Patrón:** Clase con métodos estáticos + `get_geoip_service()`.
**Mock guard:** `if settings.should_mock_geoip: return MockData.geoip.X()`
**Carga:** `initialize()` carga `.mmdb` en RAM (llamado en lifespan de FastAPI).
**Cache:** `TTLCache(maxsize=10000, ttl=3600)` — lookups cacheados 1h.

**Funciones públicas:**
`lookup(ip)`, `lookup_bulk(ips)`, `get_top_countries(source_data)`, `get_db_status()`.

---

### `glpi_service.py` — GLPIService
│   │                          #   GET/POST/PUT/DELETE /users/{id} (29KB)
│   ├── portal.py              # /api/portal/* (22KB)
│   ├── reports.py             # /api/reports/* (reportes + telegram, 18KB)
│   ├── network.py             # /api/network/* (11KB)
│   ├── security.py            # /api/security/* (9KB)
│   ├── phishing.py            # /api/phishing/* (17KB)
│   ├── views.py               # /api/views/* (incluye catálogo de widgets, 33KB)
│   ├── widgets.py             # /api/widgets/* (datos agregados multi-servicio, 23KB)
│   ├── vlans.py               # /api/vlans/* (6KB)
│   ├── cli.py                 # /api/cli/* (4KB)
│   └── dhcp.py                # /api/dhcp/* — Fase 1: CRUD DHCP (servers, leases, networks, pools,
│                              #   alerts, options) + Fase 2: correlación GLPI, discovery,
│                              #   enriquecimiento Wazuh, bloqueo rogue, tickets GLPI (29KB)
│
├── scripts/                   # Utilidades de mantenimiento
│   ├── download_geoip.py      # Descarga bases de datos MaxMind GeoLite2 (.mmdb)
│   └── setup_hotspot.py       # Configuración inicial del hotspot MikroTik
│
├── data/                      # Datos persistentes locales
│   └── geoip/                 # GeoLite2-City.mmdb + GeoLite2-ASN.mmdb (no en git)
│
└── templates/                 # Plantillas Jinja2
    └── report_base.html       # Template HTML para PDF con cover page y estilos
```

---

## Servicios externos — patrón de implementación

### `mikrotik_service.py` — MikroTikService

**Patrón:** Singleton vía variable de módulo + `get_mikrotik_service()`.
**Mock guard:** `if settings.should_mock_mikrotik: return MockData.mikrotik.X()`
**Conexión:** `routeros_api.RouterOsApiPool` con `plaintext_login=True`. Todas las llamadas vía `run_in_executor`.
**Reconexión:** Si falla, `_connected = False` → reconexión → reintento. `@retry` de tenacity (3 intentos, backoff 1-10s).
**Tráfico:** `get_traffic()` calcula delta de bytes/paquetes dividido por tiempo transcurrido.
**APIs:** API RouterOS en `MIKROTIK_HOST:MIKROTIK_PORT`.

**Funciones públicas principales:**
`get_interfaces()`, `get_connections()`, `get_arp_table()`, `get_traffic()`, `get_firewall_rules()`, `get_blacklist()`, `block_ip()`, `unblock_ip()`, `get_logs()`, `get_health()`, `get_vlan_traffic()`, `create_vlan()`, `update_vlan()`, `delete_vlan()`, `run_command()`, `get_vlan_addresses()`.

**Funciones de topología de red (5 métodos — Fase 1):**
`get_nat_rules()`, `get_routes()`, `get_ip_addresses()`, `get_bridge_ports()`.

**Funciones QoS / Simple Queues (4 métodos — Fase 1):**
`get_queues()`, `create_queue()`, `update_queue()`, `delete_queue()`.

**Funciones DHCP (20 métodos):**
`get_dhcp_servers()`, `create_dhcp_server()`, `toggle_dhcp_server()`,
`get_dhcp_leases()`, `create_dhcp_lease()`, `update_dhcp_lease()`, `delete_dhcp_lease()`, `make_lease_static()`, `set_dhcp_lease_block()`,
`get_dhcp_networks()`, `create_dhcp_network()`, `update_dhcp_network()`,
`get_ip_pools()`, `create_ip_pool()`, `update_ip_pool()`, `get_dhcp_subnet_usage()`,
`get_dhcp_rogue_alerts()`, `create_dhcp_rogue_alert()`,
`get_dhcp_options()`, `create_dhcp_option()`.

---

### `wazuh_service.py` — WazuhService

**Patrón:** Singleton vía `get_wazuh_service()`.
**Mock guard:** `if settings.should_mock_wazuh: return MockData.wazuh.X()`
**Autenticación:** JWT de dos pasos (POST `/security/user/authenticate` → Bearer token). Auto-refresh en 401.
**Cliente:** `httpx.AsyncClient` con `verify=False` (cert autofirmado), timeout 30s.
**Enriquecimiento GeoIP:** `get_alerts()` agrega campo `geo` vía `GeoIPService.lookup()` (try/except silencioso).

**Funciones públicas:**
`get_agents()`, `get_agents_summary()`, `get_alerts(limit, level_min, offset)`, `get_alerts_by_agent()`, `get_mitre_summary()`, `get_health()`, `get_critical_alerts()`, `send_active_response()`.

---

### `crowdsec_service.py` — CrowdSecService

**Patrón:** Singleton vía `get_crowdsec_service()`.
**Mock guard:** `if settings.should_mock_crowdsec: return MockData.crowdsec.X()`
**Conexión:** LAPI HTTP (puerto 8080), header `X-Api-Key`.
**Enriquecimiento:** Cada decisión se enriquece con `GeoIPService.lookup(ip)`.

**Funciones públicas:**
`get_decisions()`, `get_decisions_stream()`, `add_decision()`, `delete_decision()`, `get_metrics()`, `get_bouncers()`, `get_scenarios()`, `get_alerts()`, `cti_lookup()`, `get_top_attackers()`, `sync_to_mikrotik()`.

---

### `suricata_service.py` — SuricataService

**Patrón:** Singleton vía `get_suricata_service()`.
**Mock guard:** `if settings.should_mock_suricata: return MockData.suricata.X()`
**Dual canal:** Unix socket (control motor) + Wazuh API (alertas y flujos).
**Auto-response:** `trigger_auto_response(ip, ...)` → ActionLog → CrowdSec → MikroTik.

**Funciones públicas:**
`get_engine_status()`, `get_engine_stats()`, `reload_rules()`, `get_alerts()`, `get_alerts_timeline()`, `get_top_signatures()`, `get_alert_categories()`, `get_flows()`, `get_flows_stats()`, `get_dns_queries()`, `get_http_transactions()`, `get_tls_handshakes()`, `get_rules()`, `toggle_rule()`, `get_crowdsec_correlation()`, `get_wazuh_correlation()`, `trigger_auto_response()`.

---

### `geoip_service.py` — GeoIPService

**Patrón:** Clase con métodos estáticos + `get_geoip_service()`.
**Mock guard:** `if settings.should_mock_geoip: return MockData.geoip.X()`
**Carga:** `initialize()` carga `.mmdb` en RAM (llamado en lifespan de FastAPI).
**Cache:** `TTLCache(maxsize=10000, ttl=3600)` — lookups cacheados 1h.

**Funciones públicas:**
`lookup(ip)`, `lookup_bulk(ips)`, `get_top_countries(source_data)`, `get_db_status()`.

---

### `glpi_service.py` — GLPIService

**Patrón:** Singleton vía `get_glpi_service()`.
**Mock guard:** `if settings.should_mock_glpi: return MockData.glpi.X()`
**Autenticación:** Doble token (header `App-Token` fijo + `Session-Token` temporal vía `POST /initSession`).
**Cuarentena:** `quarantine_asset()` llama a `MikroTikService.block_ip()` y registra en `QuarantineLog`.

**Funciones públicas:**
`get_assets()`, `get_asset()`, `create_asset()`, `update_asset()`, `delete_computer()`, `assign_asset()`,
`get_asset_stats()`, `get_asset_health()`,
`get_tickets()`, `create_ticket()`, `update_ticket_status()`,
`get_users()`, `get_user()`, `create_user()`, `update_user()`, `delete_user()`,
`get_locations()`, `quarantine_asset()`, `unquarantine_asset()`.

**Métodos GLPI CRUD (agregados 2026-06-21):**
- `delete_computer(asset_id)` — Elimina un activo vía DELETE `/Computer/{id}`
- `assign_asset(asset_id, user_id)` — Asigna/desasigna activo a usuario (user_id=None para desasignar)
- `get_user(user_id)` — Obtiene un usuario GLPI por ID
- `create_user(data)` — Crea usuario con campos: name, firstname, realname, email, phone, department, location, title
- `update_user(user_id, data)` — Actualiza campos de usuario GLPI
- `delete_user(user_id)` — Elimina usuario GLPI

---

### `glpi_collector.py` — GlpiCollector

**Patrón:** Singleton vía `get_glpi_collector()`.
**Tipo:** Background task async que sincroniza assets de GLPI cada 5 minutos.
**HTTP:** Usa `requests` (sync) vía `asyncio.to_thread()`.
**Cache:** Guarda raw JSON en `services/Integraciones/glpi_full_assets.json` y mantiene cache parsed en memoria.
**Parseo:** Normaliza `_devices`, `_softwares`, `_networkports`, `_disks`, `_logs`, `_tickets` en formato estructurado.

**Funciones públicas:**
`start()`, `stop()`, `collect_now()`, `get_cached_assets()`, `get_full_detail(asset_id)`, `get_all_parsed()`, `get_last_sync()`.

---

### `portal_service.py` — PortalService

**Patrón:** Singleton vía `get_portal_service()`.
**Orquestación:** Todas las operaciones vía `MikroTikService` (Hotspot RouterOS).

**Funciones públicas:**
`check_hotspot_status()`, `get_active_sessions()`, `get_session_history()`, `get_realtime_stats()`, `get_summary_stats()`, `get_users()`, `create_user()`, `update_user()`, `delete_user()`, `bulk_import_users()`, `get_speed_profiles()`, `get_config()`, `update_config()`, `get_schedule()`, `update_schedule()`, `setup_hotspot()`.

---

### `ai_service.py` — AIService

**NO es singleton.** Se crea una instancia por llamada vía `get_ai_service()`.
**Modelo:** `claude-sonnet-4-20250514`, max 8192 tokens.
**Mock guard:** `if settings.should_mock_anthropic: return MockData.ai.mock_report`
**Function calling:** 8 tools: `get_wazuh_alerts`, `get_wazuh_agents`, `get_crowdsec_decisions`, `get_mikrotik_interfaces`, `get_mikrotik_traffic`, `get_suricata_stats`, `get_glpi_assets`, `get_geoip_top_countries`.
**System prompts:** 4 prompts: `executive`, `technical`, `operational`, `telegram`.

**Funciones públicas:**
`generate_report(prompt, audience, data_sources)`, `answer_telegram_query(message, chat_id)`, `collect_view_context(widget_types)`.

---

### `telegram_service.py` — TelegramService

**Patrón:** Singleton vía `get_telegram_service()`.
**Mock guard:** `if settings.should_mock_telegram: return MockData.telegram.X()`
**Bidireccional:** Outbound (`send_message`, `send_alert`, `send_status_summary`) + Inbound (`process_incoming_message` → `AIService.answer_telegram_query()`).

**Funciones públicas:**
`connect()`, `close()`, `send_message()`, `send_alert()`, `send_status_summary()`, `get_status()`, `get_message_logs()`, `process_incoming_message()`.

---

### `telegram_scheduler.py` — TelegramScheduler

**APScheduler** `AsyncIOScheduler`. Sincroniza jobs desde SQLite cada minuto.

**Funciones públicas:**
`start()`, `stop()`, `sync_jobs()`, `_execute_report(config_id)`.

---

### `pdf_service.py` — PDFService

HTML (TipTap) → Jinja2 template (`report_base.html`) → WeasyPrint → bytes PDF.
WeasyPrint se ejecuta en `run_in_executor` (CPU-bound).

---

### `auth_provider.py` — AuthProvider

Autenticación de usuarios hotspot contra la API MikroTik.

**Funciones:**
`verify_credentials(username, password)`, `get_user_session(username)`, `create_guest_session(ip)`.

---

## Patrón de respuesta de endpoints

**Formato estándar** (definido en `schemas/common.py`):

```python
class APIResponse(BaseModel, Generic[T]):
    success: bool
    data: Optional[T] = None
    error: Optional[str] = None

    @classmethod
    def ok(cls, data: T) -> "APIResponse[T]":
        return cls(success=True, data=data, error=None)

    @classmethod
    def fail(cls, error: str) -> "APIResponse":
        return cls(success=False, data=None, error=error)
```

**Patrón de uso en routers:**

```python
@router.get("/mi-endpoint")
async def mi_endpoint() -> APIResponse:
    try:
        data = await mi_servicio.funcion()
        return APIResponse.ok(data)
    except Exception as e:
        return APIResponse.fail(str(e))
```

**Variación:** Algunos endpoints en `main.py` (`/api/health`, `/api/system/mock-status`, `/api/actions/history`) devuelven dicts directos `{"success": True, "data": ..., "error": None}` en lugar de usar `APIResponse`. El formato es el mismo, solo que no pasan por la clase.

---

## Base de datos

### Modelos (11 clases en `models/`)

| Modelo | Tabla | Campos principales |
|--------|-------|-------------------|
| `IPLabel` | `ip_labels` | id, ip_address, label, color, created_at |
| `IPGroup` | `ip_groups` | id, name, description, created_at |
| `IPGroupMember` | `ip_group_members` | id, group_id (FK), ip_address, label |
| `ActionLog` | `action_logs` | id, action_type, target_ip, details (JSON), performed_by, comment, created_at |
| `SinkholeEntry` | `sinkhole_entries` | id, domain, reason, created_at |
| `PortalUserRegistry` | `portal_user_registry` | id, username, created_at |
| `QuarantineLog` | `quarantine_logs` | id, asset_id, ip_address, action, reason, created_at |
| `TelegramReportConfig` | `telegram_report_configs` | id, name, cron_expression, audience, data_sources, enabled, etc. |
| `TelegramMessageLog` | `telegram_message_logs` | id, chat_id, direction, message_type, content, timestamp |
| `TelegramPendingMessage` | `telegram_pending_messages` | id, chat_id, message_text, created_at |
| `CustomView` | `custom_views` | id, name, description, layout (JSON), widgets (JSON), created_at, updated_at |
| `User` | `users` | id, username, email, full_name, hashed_password, is_active, created_at |

### Inicialización

```python
# database.py — init_db()
async with engine.begin() as conn:
    await conn.run_sync(Base.metadata.create_all)
```

Se llama en el lifespan de FastAPI al startup. Crea todas las tablas si no existen.

---

## Schemas Pydantic (18 archivos en `schemas/`)

| Archivo | Propósito |
|---------|-----------|
| `common.py` | `APIResponse[T]` — envelope genérico |
| `auth.py` | `LoginRequest`, `TokenResponse`, `UserResponse`, `UserCreate`, `UserUpdate` |
| `mikrotik.py` | InterfaceInfo, ConnectionInfo, ARPEntry, TrafficData, etc. |
| `wazuh.py` | WazuhAgent, WazuhAlert, ActiveResponseRequest |
| `network.py` | IPLabelCreate/Response, IPGroupCreate/Response |
| `reports.py` | ReportGenerateRequest, ReportExportRequest |
| `vlan.py` | VlanCreate, VlanUpdate, VlanInfo |
| `security.py` | SecurityBlockIPRequest, QuarantineRequest, GeoBlockRequest, CLICommand |
| `phishing.py` | PhishingAlert, SuspiciousDomain, PhishingVictim, SinkholeCreate |
| `portal.py` | PortalSession, PortalUser, PortalProfile, PortalConfig, ScheduleDayConfig |
| `glpi.py` | GlpiAsset, GlpiTicket, GlpiUser, GlpiAssetHealth, QuarantineRequest,<br>**GlpiUserCreate, GlpiUserUpdate, GlpiAssignmentRequest** |
| `crowdsec.py` | ManualDecisionRequest, WhitelistRequest, FullRemediationRequest |
| `geoip.py` | GeoIPResult, GeoIPBulkRequest, TopCountriesResponse, GeoBlockSuggestion |
| `suricata.py` | AutoResponseTriggerRequest, AutoResponseConfigUpdate, RuleToggleRequest |
| `telegram.py` | TelegramReportConfigCreate/Update/Response, TelegramBotQuery |
| `views.py` | CustomViewCreate, CustomViewUpdate |
| `dhcp.py` | DhcpServer, DhcpLease, DhcpNetwork, DhcpPool, DhcpSubnetUsage, DhcpRogueAlert, DhcpOption + 11 schemas de request |

---

## Mock system

### `mock_data.py` (~152KB)

Repositorio central de datos simulados con `seed=42` para reproducibilidad. Secciones:

- `MockData.mikrotik.*` — interfaces, ARP, firewall, logs, health, connections, VLANs, blacklist, **nat_rules, routes, ip_addresses, bridge_ports, queues** (Fase 1)
- `MockData.wazuh.*` — agents, alerts, MITRE, health, agents_summary
- `MockData.crowdsec.*` — decisions, metrics, bouncers, scenarios, CTI, alerts, top_attackers
- `MockData.suricata.*` — engine_status, engine_stats, alerts, flows, rules, DNS, HTTP, TLS, correlation
- `MockData.geoip.*` — lookup results, bulk, top_countries, db_status, suggestions
- `MockData.glpi.*` — assets, tickets, users, locations, health
- `MockData.ai.*` — mock_report (HTML con datos ficticios)
- `MockData.portal.*` — sessions, users, profiles, config, schedule, stats
- `MockData.telegram.*` — bot_status, configs, message_logs
- `MockData.dhcp.*` — servers, leases, networks, pools, subnet_usage, rogue_alerts, options, glpi_correlation, discovery, wazuh_enriched
- `MockData.websocket.*` — traffic_tick(), alerts_tick(), vlan_traffic_tick(), security_alert(), portal_session(), crowdsec_decision_tick(), suricata_alert_tick()

### `mock_service.py` (20KB)

Facade con estado en memoria para operaciones CRUD en modo mock:

- GLPI: `glpi_get_assets()`, `glpi_create_asset()`, `glpi_update_asset()`, `glpi_quarantine()`
- GLPI Tickets: `glpi_get_tickets()`, `glpi_create_ticket()`, `glpi_update_ticket_status()`
- Portal: `portal_get_users()`, `portal_create_user()`, `portal_update_user()`, `portal_delete_user()`
- CrowdSec: `crowdsec_decisions`, whitelist CRUD
- Telegram: `telegram_configs`, `telegram_logs` CRUD
- `get_mock_status()` → `{mock_all, services: {mikrotik, wazuh, ...}, any_mock_active}`

---

## WebSockets implementados

| Ruta | Intervalo | Fuente | Mock | Descripción |
|------|-----------|--------|------|-------------|
| `/ws/traffic` | 2s | MikroTik | `MockData.websocket.traffic_tick(tick)` | Tráfico por interfaz (rx_bps, tx_bps) |
| `/ws/alerts` | 5s | Wazuh | `MockData.websocket.alerts_tick(tick)` | Alertas nuevas |
| `/ws/vlans/traffic` | 2s | MikroTik + Wazuh | `MockData.websocket.vlan_traffic_tick(tick)` | Tráfico por VLAN con status alert |
| `/ws/security/alerts` | 5s | Wazuh + MikroTik | `MockData.websocket.security_alert(tick)` | Alertas alto nivel + interfaz down + phishing |
| `/ws/portal/sessions` | 5s | Portal Service | `MockData.websocket.portal_session(tick)` | Sesiones activas hotspot |
| `/ws/crowdsec/decisions` | 10s | CrowdSec | `MockData.websocket.crowdsec_decision_tick(tick)` | Decisiones nuevas/expiradas |
| `/ws/suricata/alerts` | 5s | Suricata via Wazuh | `MockData.websocket.suricata_alert_tick(tick)` | Alertas IDS/IPS |

Cada WS usa un `ConnectionManager` propio. El mock guard está directamente en el handler del WS en `main.py`, usando los `settings.should_mock_*` flags.

---

## GLPI Collector

`services/glpi_collector.py` — Background task que:
1. Se inicia en el lifespan de FastAPI (si GLPI está configurado y no en mock)
2. Ejecuta `_collect_sync()` vía `asyncio.to_thread()` cada 5 minutos
3. Usa `requests` (sync) para llamar a la API de GLPI
4. Descarga assets con detalles completos vía `getMultipleItems` (batches de 50)
5. Guarda raw JSON en `services/Integraciones/glpi_full_assets.json`
6. Mantiene un cache parsed en memoria (`_parsed_cache: dict[int, dict]`)
7. Parsea: `_networkports`, `_devices`, `_disks`, `_softwares`, `_logs`, `_tickets`, `_connections`

---

## Cómo agregar funcionalidad nueva

### 1. Crear el schema (si se necesitan tipos nuevos)
```python
# schemas/mi_schema.py
from pydantic import BaseModel

class MiRequest(BaseModel):
    campo: str

class MiResponse(BaseModel):
    resultado: str
```

### 2. Agregar lógica en el servicio
```python
# services/mi_service.py o método en servicio existente
async def mi_funcion(self) -> dict:
    if settings.should_mock_X:
        return MockData.X.mi_funcion()
    # Lógica real...
    return {"resultado": "ok"}
```

### 3. Crear o extender el router
```python
# routers/mi_router.py
from fastapi import APIRouter
from schemas.common import APIResponse

router = APIRouter(prefix="/api/mi-dominio", tags=["Mi Dominio"])

@router.get("/mi-endpoint")
async def mi_endpoint() -> APIResponse:
    try:
        data = await mi_servicio.mi_funcion()
        return APIResponse.ok(data)
    except Exception as e:
        return APIResponse.fail(str(e))
```

### 4. Registrar el router en `main.py`
```python
from routers import mi_router
app.include_router(mi_router.router)
```

### 5. Para MikroTik: SIEMPRE usar `_api_call`
```python
# CORRECTO — usa _api_call que maneja threading, locks, y reconexión
return await self._api_call("/mi/ruta", command="print")

# INCORRECTO — no usar getattr ni llamar directo
resource = self.api.get_resource("/mi/ruta")  # ← BLOQUEANTE, NO HACER
```

---

## Errores comunes y soluciones

### `[Errno 98] Address already in use`
```bash
fuser -k 8000/tcp
```

### `mikrotik_connection_failed: timed out`
Verificar: CHR encendido, IP correcta, puerto 8728 no bloqueado, Tailscale conectado.
El backend sigue funcionando — reintenta al primer request a `/api/mikrotik/*`.

### `wazuh_api_error: 401`
Token expirado o credenciales incorrectas. Verificar `WAZUH_USER` y `WAZUH_PASSWORD` en `.env`.

### `ANTHROPIC_API_KEY is not configured`
Solo necesaria para `/api/reports/generate`. Agregar en `.env` o usar `MOCK_ANTHROPIC=true`.

### `GeoLite2 database not found`
```bash
cd backend && python scripts/download_geoip.py
```
Requiere `MAXMIND_LICENSE_KEY`. Alternativa: `MOCK_GEOIP=true`.

### `CrowdSec LAPI connection refused`
Verificar `systemctl status crowdsec` y API key del bouncer. Usar `MOCK_CROWDSEC=true`.

### `SyntaxWarning: invalid escape sequence '\.'`
Warning inofensivo de `routeros-api`. Ignorar.

### `python3 -m venv: ensurepip is not available`
```bash
sudo apt install python3-venv python3.12-venv
# O usar uv: ~/.local/bin/uv venv
```

Última actualización: 2026-06-21
Basado en análisis de: 85+ archivos backend
Versión del proyecto: 2.8

### Cambios Fase 1 (2026-06-16)
- `mikrotik_service.py` — Nuevos métodos: `get_nat_rules()`, `get_routes()`, `get_ip_addresses()`, `get_bridge_ports()`, `get_queues()`, `create_queue()`, `update_queue()`, `delete_queue()`.
- `routers/mikrotik.py` — Nuevos endpoints: `GET /api/mikrotik/nat-rules`, `GET /api/mikrotik/routes`, `GET /api/mikrotik/addresses`, `GET /api/mikrotik/bridge-ports`, CRUD `/api/mikrotik/queues`.
- `mock_data.py` — Mocks para NAT, rutas, IPs, bridge y queues.

### Cambios Auth (2026-06-17)
- `models/user.py` — Modelo `User` (tabla `users`): id, username, email, full_name, hashed_password, is_active, created_at.
- `schemas/auth.py` — `LoginRequest`, `TokenResponse`, `UserResponse`, `UserCreate`, `UserUpdate`.
- `services/auth_service.py` — Singleton `AuthService`: JWT (python-jose) + bcrypt (passlib). Métodos: `authenticate_user()`, `create_access_token()`, `decode_token()`, `get_all_users()`, `get_user_by_id()`, `create_user()`, `update_user()`, `delete_user()`.
- `routers/auth.py` — `/api/auth/*`: POST login, GET me, POST logout, CRUD `/api/auth/users`. Dependency `get_current_user` valida JWT en header `Authorization: Bearer`.
- `main.py` — `JWTAuthMiddleware` global valida JWT en todos los endpoints excepto rutas públicas (`/api/auth/login`, `/api/auth/logout`, `/health`, `/docs`, `/ws/*`).
- `main.py` — `ensure_default_admin()` en lifespan: crea usuario `admin/admin` si la tabla `users` está vacía.
- `config.py` — Variables `JWT_SECRET_KEY` (obligatorio, mínimo 32 chars) y `JWT_EXPIRE_MINUTES` (default 60).
- `requirements.txt` — Agregados: `python-jose[cryptography]`, `passlib[bcrypt]`.

### Cambios GLPI CRUD completo (2026-06-21)
- `routers/glpi.py` — 6 endpoints nuevos:
  - `DELETE /api/glpi/assets/{id}` — Eliminar activo GLPI.
  - `PUT /api/glpi/assets/{id}/assign` — Asignar/desasignar activo a usuario (`user_id: int | null`).
  - `GET /api/glpi/users/{id}` — Obtener usuario GLPI por ID.
  - `POST /api/glpi/users` — Crear usuario GLPI.
  - `PUT /api/glpi/users/{id}` — Actualizar usuario GLPI.
  - `DELETE /api/glpi/users/{id}` — Eliminar usuario GLPI.
- `schemas/glpi.py` — Nuevos schemas: `GlpiAssignmentRequest`, `GlpiUserCreate`, `GlpiUserUpdate`.
- `services/glpi_service.py` — Nuevos métodos: `delete_computer()`, `assign_asset()`, `get_user()`, `create_user()`, `update_user()`, `delete_user()`.
- `services/mock_service.py` — CRUD en memoria de usuarios GLPI: `glpi_get_users()`, `glpi_create_user()`, `glpi_update_user()`, `glpi_delete_user()`, `glpi_assign_asset()`.
