# Backend — NetShield Dashboard

## Estructura de carpetas

```
backend/
├── main.py                    # Punto de entrada FastAPI, CORS, 7 WebSockets, lifespan
├── config.py                  # Settings con pydantic-settings, lee .env, 8 mock flags
├── database.py                # SQLAlchemy async engine + session factory + init_db()
├── .env                       # Variables de entorno (NO commitear)
├── .env.example               # Plantilla de variables de entorno
├── requirements.txt           # Dependencias Python con versiones pinneadas
│
├── models/                    # Modelos SQLAlchemy (tablas de base de datos)
│   ├── __init__.py            # Re-exporta todos los modelos
│   ├── ip_label.py            # IPLabel: etiquetas asignadas a IPs
│   ├── ip_group.py            # IPGroup + IPGroupMember: grupos de IPs con criterios
│   ├── action_log.py          # ActionLog: auditoría de acciones (bloqueos, reportes, etc.)
│   ├── sinkhole_entry.py      # SinkholeEntry: dominios en sinkhole DNS
│   ├── portal_user.py         # PortalUserRegistry: usuarios del portal cautivo creados via NetShield
│   ├── quarantine_log.py      # QuarantineLog: log de activos GLPI puestos en cuarentena
│   ├── telegram.py            # TelegramReportConfig, TelegramMessageLog, TelegramPendingMessage
│   └── custom_view.py         # CustomView: vistas personalizadas del dashboard (layout JSON)
│
├── schemas/                   # Pydantic v2 schemas para request/response
│   ├── __init__.py            # Re-exporta todos los schemas
│   ├── common.py              # APIResponse[T]: envelope genérico {success, data, error}
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
│   └── views.py               # CustomViewCreate, CustomViewUpdate
│
├── services/                  # Lógica de negocio (conexiones a sistemas externos)
│   ├── __init__.py
│   ├── mikrotik_service.py    # Singleton: conexión RouterOS API con reconexión automática
│   ├── wazuh_service.py       # Singleton: cliente httpx async con JWT auth
│   ├── crowdsec_service.py    # Singleton: bouncer LAPI, decisiones, CTI, sync a MikroTik
│   ├── suricata_service.py    # Singleton: Unix socket + Wazuh, IDS/IPS/NSM, auto-response
│   ├── geoip_service.py       # Singleton: MaxMind GeoLite2, TTLCache 10K entradas
│   ├── glpi_service.py        # Singleton: cliente GLPI REST API, doble token
│   ├── portal_service.py      # Singleton: gestión Hotspot MikroTik
│   ├── ai_service.py          # Claude API con 8 tools de function calling para reportes
│   ├── pdf_service.py         # WeasyPrint + Jinja2 para generar PDF
│   ├── telegram_service.py    # Bot bidireccional: notificaciones + consultas IA
│   ├── telegram_scheduler.py  # APScheduler para reportes automáticos vía Telegram
│   ├── auth_provider.py       # Autenticación de usuarios hotspot contra MikroTik
│   ├── mock_data.py           # ← Repositorio central de datos simulados (seed=42)
│   └── mock_service.py        # ← Facade con estado en memoria para CRUD en modo mock
│
├── routers/                   # Endpoints FastAPI, un archivo por dominio
│   ├── __init__.py
│   ├── mikrotik.py            # /api/mikrotik/* (12 endpoints)
│   ├── wazuh.py               # /api/wazuh/* (9 endpoints)
│   ├── crowdsec.py            # /api/crowdsec/* (16 endpoints)
│   ├── suricata.py            # /api/suricata/* (21 endpoints)
│   ├── geoip.py               # /api/geoip/* (8 endpoints)
│   ├── glpi.py                # /api/glpi/* (20 endpoints)
│   ├── portal.py              # /api/portal/* (18 endpoints)
│   ├── reports.py             # /api/reports/* (3 reportes + 14 Telegram)
│   ├── network.py             # /api/network/* (8 endpoints)
│   ├── security.py            # /api/security/* (4 endpoints)
│   ├── phishing.py            # /api/phishing/* (10 endpoints)
│   ├── views.py               # /api/views/* (6 endpoints)
│   ├── widgets.py             # /api/widgets/* (8 endpoints, datos agregados multi-servicio)
│   ├── vlans.py               # /api/vlans/* (5 endpoints)
│   └── cli.py                 # /api/cli/* (2 endpoints)
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

## Cómo funciona cada servicio

### `mikrotik_service.py` — MikroTikService

**Patrón:** Singleton vía variable de módulo + `get_mikrotik_service()`.

**Conexión:** Usa `routeros_api.RouterOsApiPool` con `plaintext_login=True`. Como la librería es síncrona, todas las llamadas se ejecutan dentro de `asyncio.get_event_loop().run_in_executor(None, ...)`.

**Reconexión automática:** Si una llamada API falla, se fuerza `_connected = False`, se reconecta, y se reintenta una vez. La creación de conexión tiene `@retry` de tenacity (3 intentos, backoff exponencial 1-10s).

**Tráfico en tiempo real:** `get_traffic()` guarda los contadores absolutos de bytes/paquetes por interfaz en `_last_traffic`, y al siguiente llamado calcula el delta dividido por el tiempo transcurrido para obtener bytes/sec.

**Métodos públicos:**
| Método | RouterOS Path | Descripción |
|--------|---------------|-------------|
| `get_interfaces()` | `/interface` | Estado de todas las interfaces |
| `get_connections()` | `/ip/firewall/connection` | Tabla de conexiones activas |
| `get_arp_table()` | `/ip/arp` | Tabla ARP |
| `get_traffic()` | `/interface` | Calcula rx/tx bytes/sec por interfaz |
| `get_firewall_rules()` | `/ip/firewall/filter` | Lista reglas de firewall |
| `get_blacklist()` | `/ip/firewall/address-list` | IPs en address-list de bloqueo |
| `block_ip(ip, comment)` | `/ip/firewall/filter` (add) | Agrega regla drop en chain=forward |
| `unblock_ip(ip)` | `/ip/firewall/filter` (remove) | Elimina reglas drop para esa IP |
| `get_logs(limit)` | `/log` | Últimos N logs del sistema |
| `get_health()` | `/system/resource` | Uptime, CPU, memoria, versión RouterOS |
| `get_vlan_traffic()` | `/interface` | Tráfico por VLAN |
| `create_vlan(data)` / `update_vlan()` / `delete_vlan()` | `/interface/vlan` | CRUD de VLANs |
| `run_command(cmd)` | Varios | Ejecuta comando RouterOS arbitrario (CLI web) |

---

### `wazuh_service.py` — WazuhService

**Patrón:** Singleton vía variable de módulo + `get_wazuh_service()`.

**Autenticación:** JWT de dos pasos:
1. POST a `/security/user/authenticate` con Basic Auth → obtiene token JWT
2. Todas las llamadas posteriores usan `Authorization: Bearer {token}`
3. Si recibe 401, refresca el token automáticamente y reintenta

**Cliente HTTP:** `httpx.AsyncClient` con `verify=False` (cert autofirmado en el lab). Timeout de 30s general, 10s para conexión.

**Enriquecimiento GeoIP:** `get_alerts()` llama internamente a `GeoIPService.lookup(src_ip)` y agrega campo `geo` a cada alerta (try/except silencioso si GeoIP no está disponible).

**Métodos públicos:**
| Método | Wazuh Endpoint | Descripción |
|--------|----------------|-------------|
| `get_agents()` | `GET /agents` | Todos los agentes con status |
| `get_agents_summary()` | `GET /agents/summary/status` | Conteo por estado (active/disconnected) |
| `get_alerts(limit, level_min, offset)` | `GET /alerts` | Alertas con filtro de severidad, enriquecidas con GeoIP |
| `get_alerts_by_agent(agent_id)` | `GET /alerts` | Alertas de un agente específico |
| `get_mitre_summary()` | `GET /rules/groups` | Técnicas MITRE ATT&CK detectadas |
| `get_health()` | `GET /manager/status` | Health del manager Wazuh |
| `get_critical_alerts(threshold)` | `GET /alerts` | Alertas por encima del umbral |
| `send_active_response(agent_id, command, args)` | `PUT /active-response/{id}` | Ejecutar acción en agente |

---

### `crowdsec_service.py` — CrowdSecService

**Patrón:** Singleton vía variable de módulo + `get_crowdsec_service()`.

**Conexión:** LAPI local (HTTP, puerto 8080) usando API key de bouncer vía header `X-Api-Key`.

**Enriquecimiento:** Cada decisión se enriquece con `GeoIPService.lookup(ip)` para agregar país, ciudad, tipo de red.

**Métodos públicos:**
| Método | Descripción |
|--------|-------------|
| `get_decisions()` | Decisiones activas enriquecidas con GeoIP |
| `get_decisions_stream(startup)` | Stream de nuevas/expiradas (para WebSocket) |
| `add_decision(ip, duration, reason, type)` | Agrega decisión de bloqueo |
| `delete_decision(id)` | Elimina decisión |
| `get_metrics()` | Estadísticas del motor CrowdSec |
| `get_bouncers()` | Bouncers registrados |
| `get_scenarios()` | Escenarios de detección activos |
| `get_alerts()` | Alertas del LAPI (pre-decisión) |
| `cti_lookup(ip)` | Reputación comunitaria CTI API |
| `get_top_attackers(limit)` | Top IPs por número de hits |
| `sync_to_mikrotik()` | Traduce decisiones → reglas drop en MikroTik |

---

### `suricata_service.py` — SuricataService

**Patrón:** Singleton vía variable de módulo + `get_suricata_service()`.

**Dual canal:**
- **Unix socket** — Control directo del motor (status, reload rules)
- **Wazuh API** — Alertas y flujos (Wazuh indexa las alertas de `eve.json`)

**Auto-response coordinado:** El circuito `trigger_auto_response(ip, ...)` puede ejecutar en cadena: registrar en ActionLog → añadir decisión en CrowdSec → bloquear en MikroTik.

**Métodos públicos:**
| Método | Descripción |
|--------|-------------|
| `get_engine_status()` | Modo (IDS/IPS/NSM), versión, estado socket |
| `get_engine_stats()` | Métricas en tiempo real + serie temporal |
| `reload_rules()` | Hot-reload de firmas vía socket |
| `get_alerts(limit, filters)` | Alertas vía WazuhService (`rule.groups=suricata`) |
| `get_alerts_timeline()` | Timeline minute-by-minute |
| `get_top_signatures()` / `get_alert_categories()` | Agregaciones para gráficos |
| `get_flows(filters)` | Flujos NSM capturados |
| `get_flows_stats()` / `get_dns_queries()` / `get_http_transactions()` / `get_tls_handshakes()` | Datos NSM |
| `get_rules(filters)` | Lista de firmas con estado enabled/disabled |
| `toggle_rule(sid, enabled)` | Activa/desactiva una regla |
| `get_crowdsec_correlation()` | IPs con alertas Suricata + decisión CrowdSec activa |
| `get_wazuh_correlation()` | Correlación temporal Wazuh × Suricata |
| `trigger_auto_response(ip, ...)` | Bloqueo coordinado: ActionLog → CrowdSec → MikroTik |

---

### `geoip_service.py` — GeoIPService

**Patrón:** Clase con métodos estáticos + `get_geoip_service()`.

**Carga en startup:** `initialize()` carga `GeoLite2-City.mmdb` y `GeoLite2-ASN.mmdb` en RAM (llamado en el lifespan de FastAPI).

**Cache:** `TTLCache(maxsize=10000, ttl=3600)` — cada lookup se cachea 1h.

**Métodos públicos:**
| Método | Descripción |
|--------|-------------|
| `lookup(ip)` | Geolocaliza IP: país, ciudad, lat/lon, ASN, tipo de red, is_tor |
| `lookup_bulk(ips)` | Vectorizado hasta 200 IPs |
| `get_top_countries(source_data)` | Agrega conteo de IPs por país |
| `get_db_status()` | Estado de las .mmdb (fecha build, tamaño del caché) |

---

### `glpi_service.py` — GLPIService

**Patrón:** Singleton vía variable de módulo + `get_glpi_service()`.

**Autenticación:** Doble token:
1. Header `App-Token` fijo (configurado en GLPI)
2. `POST /initSession` → Session-Token temporal

**Cuarentena:** `quarantine_asset(id, ip)` llama a `MikroTikService.block_ip()` y registra en `QuarantineLog`.

**Métodos públicos:**
| Método | Descripción |
|--------|-------------|
| `get_assets(filters)` / `get_asset(id)` | Inventario de activos |
| `create_asset(data)` / `update_asset(id, data)` | CRUD de activos |
| `get_asset_stats()` | Conteos por tipo/estado/criticidad |
| `get_asset_health()` | Correlación activos × agentes Wazuh |
| `get_tickets(filters)` / `create_ticket(data)` / `update_ticket_status(id, status)` | CRUD de tickets |
| `get_users()` / `get_locations()` | Catálogos de referencia |
| `quarantine_asset(id, ip)` / `unquarantine_asset(id)` | Cuarentena vía MikroTik |

---

### `portal_service.py` — PortalService

**Patrón:** Singleton vía variable de módulo + `get_portal_service()`.

**Orquestación:** Todas las operaciones se ejecutan a través del `MikroTikService` (API del Hotspot RouterOS).

**Métodos públicos:**
| Método | Descripción |
|--------|-------------|
| `check_hotspot_status()` | Verifica si el hotspot está inicializado |
| `get_active_sessions()` | Sesiones activas con métricas de ancho de banda |
| `get_session_history(page, limit)` | Historial paginado |
| `get_realtime_stats()` / `get_summary_stats()` | Métricas en tiempo real e históricas |
| `get_users()` / `create_user()` / `update_user()` / `delete_user()` | CRUD usuarios |
| `bulk_import_users(data_list)` | Importación masiva |
| `get_speed_profiles()` / CRUD profiles | Perfiles de velocidad |
| `get_config()` / `update_config()` | Configuración del hotspot |
| `get_schedule()` / `update_schedule()` | Horarios de acceso |
| `setup_hotspot()` | Inicialización completa del hotspot |

---

### `ai_service.py` — AIService

**No es singleton.** Se crea una instancia por llamada vía `get_ai_service()`.

**Modelo:** `claude-sonnet-4-20250514`, max 8192 tokens de salida.

**Function calling:** Claude tiene acceso a 8 herramientas:
- `get_wazuh_alerts` — Obtener alertas del SIEM
- `get_wazuh_agents` — Estado de agentes
- `get_crowdsec_decisions` — Decisiones activas de CrowdSec
- `get_mikrotik_interfaces` — Estado de interfaces de red
- `get_mikrotik_traffic` — Tráfico en tiempo real
- `get_suricata_stats` — Estadísticas del motor IDS/IPS
- `get_glpi_assets` — Inventario de activos
- `get_geoip_top_countries` — Top países atacantes

**Flujo de generación:**
1. Se construye el prompt del usuario + system prompt según audiencia (executive/technical/operational)
2. Se envía a Claude con las herramientas disponibles (filtradas por `data_sources`)
3. Si Claude responde con `stop_reason == "tool_use"`, se ejecutan las funciones contra los servicios reales
4. Se envían los resultados de vuelta a Claude
5. Se repite hasta que Claude produce texto final (máximo 10 iteraciones)
6. Se extrae el HTML, el título (del primer `<h1>`), y se devuelve

**System prompts:** Hay 3 prompts según audiencia + 1 para Telegram:
- `executive` — Sin jerga técnica, enfoque en impacto de negocio
- `technical` — IOCs, MITRE ATT&CK, datos crudos
- `operational` — Pasos accionables, checklists
- `telegram` — Respuestas concisas para chat

**Funciones adicionales:**
- `answer_telegram_query(message, chat_id)` — Responde consulta inbound del bot
- `collect_view_context(widget_types)` — Recopila datos multi-fuente para reportes de vistas

---

### `telegram_service.py` — TelegramService

**Patrón:** Singleton vía variable de módulo + `get_telegram_service()`.

**Bidireccional:**
- **Outbound:** `send_message()`, `send_alert()`, `send_status_summary()` — con retry ×3
- **Inbound:** `process_incoming_message(update)` → `AIService.answer_telegram_query()` → respuesta

**Métodos públicos:**
| Método | Descripción |
|--------|-------------|
| `connect()` / `close()` | Verifica credenciales del bot |
| `send_message(chat_id, text)` | Envío con retry ×3 (tenacity) |
| `send_alert(alert_data)` | Formatea y envía alerta de seguridad |
| `send_status_summary()` | Recopila estado MikroTik+Wazuh+CrowdSec+Suricata y envía resumen |
| `get_status()` | Estado de conexión (username, chat_id, mock mode) |
| `get_message_logs(filters)` | Historial de mensajes (SQLite) |
| `process_incoming_message(update)` | Maneja mensaje inbound → Claude → respuesta |

---

### `telegram_scheduler.py` — TelegramScheduler

**APScheduler** `AsyncIOScheduler` que sincroniza jobs desde SQLite cada minuto.

**Métodos públicos:**
| Método | Descripción |
|--------|-------------|
| `start()` / `stop()` | Inicia/para el scheduler |
| `sync_jobs()` | Reconcilia `TelegramReportConfig` con jobs activos |
| `_execute_report(config_id)` | AIService.generate_report() → TelegramService.send_message() |

---

### `pdf_service.py` — PDFService

**Flujo:** HTML (del editor TipTap) → Jinja2 template (`report_base.html`) → WeasyPrint → bytes PDF.

La plantilla incluye:
- Página de portada con logo, título, autor, fecha y badge de clasificación
- Headers/footers con paginación automática (`@page`)
- Estilos para tablas, badges de severidad, code blocks, info boxes
- Soporta metric cards con valores destacados

---

### `auth_provider.py` — AuthProvider

**Proveedor de autenticación** para el portal captivo. Verifica credenciales de usuarios hotspot contra la API MikroTik.

**Métodos:**
| Método | Descripción |
|--------|-------------|
| `verify_credentials(username, password)` | Verifica contra el hotspot |
| `get_user_session(username)` | Obtiene sesión activa |
| `create_guest_session(ip)` | Crea sesión guest temporal |

---

## Patrones usados

| Patrón | Dónde | Por qué |
|--------|-------|---------|
| Singleton | Todos los servicios de conexión externa | Limitar conexiones concurrentes a sistemas externos |
| Retry exponencial | `_create_connection()`, `_authenticate()` | Resilencia ante fallas de red transitorias |
| Envelope de respuesta | `APIResponse[T]` en `schemas/common.py` | Consistencia en todas las respuestas de la API |
| Dependency injection | `Depends(get_db)`, `Depends(get_service)` | Testabilidad y desacoplamiento |
| Run-in-executor | `mikrotik_service.py`, `pdf_service.py` | Ejecutar código síncrono/CPU-bound sin bloquear el event loop |
| Lifespan context manager | `main.py` | Inicialización/cleanup ordenado de DB y servicios |
| Function calling (agentic loop) | `ai_service.py` | Claude decide qué datos necesita en runtime |
| **Mock guard** | Todos los servicios (8) | Guard al inicio de cada método: si `settings.should_mock_*` delega a `MockData`/`MockService` |
| Lazy import | Cross-service calls | Evita circular imports entre servicios (ej: `suricata → wazuh`, `wazuh → geoip`) |
| TTLCache | `geoip_service.py` | Cache en RAM con expiración para lookups GeoIP |

---

## Cómo agregar un nuevo endpoint

### 1. Crear el schema (si se necesitan tipos nuevos)
```python
# schemas/mi_schema.py
from pydantic import BaseModel

class MiRequest(BaseModel):
    campo: str

class MiResponse(BaseModel):
    resultado: str
```

### 2. Agregar lógica en el servicio correspondiente
```python
# services/mi_service.py o agregar método en servicio existente
async def mi_funcion(self) -> dict:
    # IMPORTANTE para MikroTik: usar SIEMPRE self._api_call para llamadas al router,
    # ya que maneja el thread-safety (bloquea colisiones) y las reconexiones automáticas.
    # Ejemplo:
    # return await self._api_call("/mi/ruta", command="print", parametro="valor")
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

---

## Variables de entorno

| Variable | Requerida | Descripción |
|----------|-----------|-------------|
| `MIKROTIK_HOST` | Sí | IP del MikroTik CHR (lab: `192.168.100.118`) |
| `MIKROTIK_PORT` | No | Puerto API RouterOS (default: `8728`) |
| `MIKROTIK_USER` | Sí | Usuario RouterOS (lab: `admin`) |
| `MIKROTIK_PASSWORD` | Sí | Contraseña RouterOS |
| `WAZUH_HOST` | Sí | IP del servidor Wazuh (lab: `100.90.106.121`) |
| `WAZUH_PORT` | No | Puerto API Wazuh (default: `55000`) |
| `WAZUH_USER` | Sí | Usuario API Wazuh (lab: `wazuh`) |
| `WAZUH_PASSWORD` | Sí | Contraseña API Wazuh |
| `CROWDSEC_URL` | Solo CrowdSec | URL de la LAPI (default: `http://localhost:8080`) |
| `CROWDSEC_API_KEY` | Solo CrowdSec | API key del bouncer registrado en CrowdSec |
| `SURICATA_SOCKET` | Solo Suricata | Path al Unix socket de control (default: `/var/run/suricata/suricata-command.socket`) |
| `SURICATA_EVE_LOG` | Solo Suricata | Path al archivo eve.json (default: `/var/log/suricata/eve.json`) |
| `GEOIP_CITY_DB` | Solo GeoIP | Path a GeoLite2-City.mmdb (default: `data/geoip/GeoLite2-City.mmdb`) |
| `GEOIP_ASN_DB` | Solo GeoIP | Path a GeoLite2-ASN.mmdb (default: `data/geoip/GeoLite2-ASN.mmdb`) |
| `MAXMIND_LICENSE_KEY` | Solo descarga | Clave para descargar las .mmdb via `scripts/download_geoip.py` |
| `GLPI_URL` | Solo GLPI | URL base de GLPI (lab: `http://glpi.facultad.local`) |
| `GLPI_APP_TOKEN` | Solo GLPI | Token de aplicación GLPI |
| `GLPI_USER_TOKEN` | Solo GLPI | Token de usuario GLPI |
| `ANTHROPIC_API_KEY` | Solo reportes | API key de Anthropic para Claude |
| `TELEGRAM_BOT_TOKEN` | Solo Telegram | Token del bot de Telegram |
| `TELEGRAM_CHAT_ID` | Solo Telegram | Chat ID por defecto para notificaciones |
| `TELEGRAM_ADMIN_IDS` | Solo Telegram | Lista de IDs de admin separados por coma |
| `DATABASE_URL` | No | String de conexión SQLAlchemy (default: `sqlite+aiosqlite:///./netshield.db`) |
| `APP_ENV` | No | `development` o `production` (default: `development`) |
| `LOG_LEVEL` | No | Nivel de log: `DEBUG`, `INFO`, `WARNING`, `ERROR` (default: `DEBUG`) |
| `CORS_ORIGINS` | No | JSON array de orígenes permitidos (default: `["http://localhost:5173"]`) |
| **`MOCK_ALL`** | No | `true` → activa mock en todos los servicios externos |
| **`MOCK_MIKROTIK`** | No | `true` → solo MikroTik en mock |
| **`MOCK_WAZUH`** | No | `true` → solo Wazuh en mock |
| **`MOCK_GLPI`** | No | `true` → solo GLPI en mock |
| **`MOCK_ANTHROPIC`** | No | `true` → solo Anthropic/IA en mock |
| **`MOCK_CROWDSEC`** | No | `true` → solo CrowdSec en mock |
| **`MOCK_GEOIP`** | No | `true` → solo GeoIP en mock (default: `true`) |
| **`MOCK_SURICATA`** | No | `true` → solo Suricata en mock (default: `true`) |
| **`MOCK_TELEGRAM`** | No | `true` → solo Telegram en mock (default: `true`) |

> `APP_ENV=lab` es alias retrocompatible de `MOCK_ALL=true`.

---

## Errores comunes y cómo resolverlos

### `[Errno 98] Address already in use`
El puerto 8000 ya está ocupado por otra instancia.
```bash
fuser -k 8000/tcp
```

### `mikrotik_connection_failed: timed out`
El MikroTik CHR no es accesible desde la máquina actual. Verificar:
- Que el CHR está encendido y la IP es correcta
- Que el firewall del host no bloquea el puerto 8728
- Que Tailscale está conectado (si se accede vía VPN)
El backend seguirá funcionando — reintentará al recibir el primer request a `/api/mikrotik/*`.

### `wazuh_api_error: 401`
Token expirado o credenciales incorrectas. El servicio refresca el token automáticamente, pero si las credenciales son inválidas:
- Verificar `WAZUH_USER` y `WAZUH_PASSWORD` en `.env`
- Verificar que el usuario tiene permisos en Wazuh

### `ANTHROPIC_API_KEY is not configured`
Falta la API key de Anthropic. Solo se necesita para el endpoint `/api/reports/generate`. Agregar en `.env`:
```
ANTHROPIC_API_KEY=sk-ant-...
```

### `GeoLite2 database not found`
Las bases de datos MaxMind no están descargadas. Ejecutar:
```bash
cd backend
python scripts/download_geoip.py
```
Requiere `MAXMIND_LICENSE_KEY` en `.env`. Alternativamente, usar `MOCK_GEOIP=true`.

### `CrowdSec LAPI connection refused`
CrowdSec no está corriendo o la URL es incorrecta. Verificar:
- Que `cscli` está instalado y corriendo: `systemctl status crowdsec`
- Que la API key del bouncer es válida: `cscli bouncers list`
Usar `MOCK_CROWDSEC=true` para desarrollo sin CrowdSec.

### `SyntaxWarning: invalid escape sequence '\.`
Warning inofensivo de la librería `routeros-api`. No afecta funcionalidad. Se puede ignorar.

### `python3 -m venv: ensurepip is not available`
Instalar el paquete del sistema:
```bash
sudo apt install python3-venv python3.12-venv
```
O usar `uv` como alternativa (ya instalado en `~/.local/bin/uv`):
```bash
~/.local/bin/uv venv
source .venv/bin/activate
~/.local/bin/uv pip install -r requirements.txt
```
