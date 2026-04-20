# Backend — Estructura de Carpetas y Archivos

> Directorio raíz del backend: `netShield2/backend/`
> Framework: FastAPI 0.115 · Python 3.12+ · SQLAlchemy 2.0 async + SQLite

---

## Archivos raíz del backend

### `main.py`
**Punto de entrada de la aplicación.** Define la app FastAPI y orquesta todo el sistema.

Responsabilidades:
- Registra los 15 routers (`app.include_router(...)`)
- Define el `lifespan` (startup/shutdown): inicializa DB, conecta MikroTik, carga GeoIP, conecta Suricata, inicia bot Telegram y APScheduler
- Define los 7 WebSocket endpoints directamente (no en routers, para que accedan a `ConnectionManager` y a los mock guards de settings)
- Define `GET /api/health` y `GET /api/system/mock-status`
- Define `GET /api/actions/history` (audit log)
- Configura structlog (ConsoleRenderer en dev, JSONRenderer en prod)
- Configura CORS desde `settings.cors_origins`

Clases exportadas:
- `ConnectionManager` — gestiona listas de WebSockets activos; método `broadcast(data)` envía a todos los conectados

WebSockets definidos aquí:
| Endpoint | Intervalo | Fuente de datos |
|----------|-----------|-----------------|
| `/ws/traffic` | 2s | `MikroTikService.get_traffic()` |
| `/ws/alerts` | 5s | `WazuhService.get_alerts()` |
| `/ws/vlans/traffic` | 2s | MikroTik + correlación Wazuh por subred |
| `/ws/security/alerts` | 5s | Wazuh nivel alto + MikroTik interfaz down |
| `/ws/portal/sessions` | 5s | `PortalService.get_active_sessions()` |
| `/ws/crowdsec/decisions` | 10s | `CrowdSecService.get_decisions_stream()` |
| `/ws/suricata/alerts` | 5s | `SuricataService.get_alerts()` vía Wazuh |

---

### `config.py`
**Configuración central.** Singleton de Pydantic `Settings` (cacheado con `@lru_cache`). Única fuente de verdad para todas las credenciales y flags de mock.

Clase `Settings(BaseSettings)`:
- Lee de `.env` automáticamente
- Credenciales: `mikrotik_*`, `wazuh_*`, `anthropic_api_key`, `glpi_*`, `crowdsec_*`, `telegram_*`, `geoip_*`, `suricata_*`
- Flags mock: `mock_all`, `mock_mikrotik`, `mock_wazuh`, `mock_glpi`, `mock_anthropic`, `mock_crowdsec`, `mock_geoip=True`, `mock_suricata=True`, `mock_telegram=True`
- Propiedades derivadas: `should_mock_mikrotik`, `should_mock_wazuh`, ..., `should_mock_telegram`
- Lógica de retrocompatibilidad: `APP_ENV=lab` sin variables `MOCK_*` explícitas → activa `MOCK_ALL`
- Umbrales de seguridad: `alert_notification_threshold=10`, `auto_block_threshold=12`, `auto_block_enabled=False`

Función exportada:
- `get_settings() -> Settings` — singleton cacheado, llamado desde cualquier parte del sistema

---

### `database.py`
**Configuración de SQLAlchemy async.**

Objetos exportados:
- `engine` — `AsyncEngine` creado desde `settings.database_url` (SQLite por defecto, PostgreSQL-ready)
- `async_session_factory` — `async_sessionmaker` para crear sesiones
- `Base` — `DeclarativeBase` del que heredan todos los modelos
- `get_db()` — dependencia FastAPI que yield una `AsyncSession` con commit/rollback automático
- `init_db()` — crea todas las tablas al iniciar (llamado en el `lifespan`)
- `close_db()` — dispone el engine al apagar

---

### `requirements.txt`
Dependencias pinned. Paquetes clave:
`fastapi`, `uvicorn[standard]`, `sqlalchemy[asyncio]`, `aiosqlite`, `routeros-api`, `httpx`, `structlog`, `tenacity`, `pydantic-settings`, `anthropic`, `python-telegram-bot`, `apscheduler`, `weasyprint`, `jinja2`, `geoip2`, `cachetools`

---

## `routers/` — Endpoints REST

Cada router es un `APIRouter` registrado en `main.py`. Todos usan el patrón `APIResponse.ok(data)` / `APIResponse.fail(error)` definido en `schemas/common.py`.

### `__init__.py`
Re-exporta los routers para import limpio en `main.py`.

### `mikrotik.py` · prefijo `/api/mikrotik`
Expone el control del router MikroTik.
- `GET /interfaces` — lista de interfaces con estado y tráfico
- `GET /arp` — tabla ARP activa
- `GET /connections` — conexiones activas (NAT/firewall)
- `GET /firewall/rules` — reglas activas del firewall
- `GET /firewall/blacklist` — IPs en address-list de bloqueo
- `POST /firewall/block` — bloquea IP (escribe en `ActionLog`)
- `POST /firewall/unblock` — desbloquea IP (escribe en `ActionLog`)
- `GET /logs` — logs del sistema RouterOS
- `GET /health` — salud del router (uptime, versión, CPU, memoria)

Importa: `MikroTikService`, `ActionLog` (modelo), `BlockIPRequest`/`UnblockIPRequest` (schemas)

### `wazuh.py` · prefijo `/api/wazuh`
Expone datos del SIEM Wazuh.
- `GET /alerts` — alertas filtradas por nivel, agente, fecha
- `GET /agents` — estado de agentes registrados
- `GET /agents/summary` — conteo por estado (active/disconnected/never_connected)
- `GET /mitre/summary` — top técnicas MITRE ATT&CK detectadas
- `GET /health` — salud del manager Wazuh
- `POST /agents/{id}/active-response` — ejecuta active response en un agente

Importa: `WazuhService`, `ActionLog`, `ActiveResponseRequest`

### `network.py` · prefijo `/api/network`
CRUD de etiquetas y grupos de IPs almacenados en SQLite.
- `GET/POST /labels` — etiquetas para IPs individuales
- `GET/PUT/DELETE /labels/{id}` — CRUD individual
- `GET/POST /groups` — grupos de IPs (con miembros)
- `GET/PUT/DELETE /groups/{id}` — CRUD individual
- `POST /groups/{id}/members` — agrega IP a grupo
- `DELETE /groups/{id}/members/{ip}` — quita IP de grupo
- `GET /search` — búsqueda global de IPs en ARP + etiquetas + grupos

Importa: `IPLabel`, `IPGroup`, `IPGroupMember` (modelos), schemas de `network`

### `vlans.py` · prefijo `/api/vlans`
CRUD de VLANs con datos de tráfico en vivo.
- `GET /` — lista VLANs + tráfico actual por interfaz
- `POST /` — crea VLAN en MikroTik
- `PUT /{id}` — actualiza VLAN
- `DELETE /{id}` — elimina VLAN
- `GET /traffic` — snapshot de tráfico por VLAN

Importa: `MikroTikService`, `WazuhService`, `VlanCreate`/`VlanUpdate`

### `security.py` · prefijo `/api/security`
Acciones de seguridad automatizadas y configuración de auto-bloqueo.
- `POST /block` — bloquea IP manually (con logging)
- `POST /quarantine` — pone agente en cuarentena vía Wazuh + MikroTik
- `POST /geo-block` — bloquea un país entero en el firewall MikroTik
- `GET /config` — configuración de umbrales de auto-bloqueo
- `PUT /config` — actualiza umbrales

Importa: `MikroTikService`, `WazuhService`, `ActionLog`, schemas de `security`

### `cli.py` · prefijo `/api/cli`
Terminal web para comandos remotos.
- `POST /mikrotik` — ejecuta comando RouterOS y devuelve output
- `POST /wazuh/agent` — ejecuta active response en agente Wazuh

Importa: `MikroTikService`, `WazuhService`, `CLIMikrotikRequest`/`CLIWazuhAgentRequest`

### `phishing.py` · prefijo `/api/phishing`
Gestión de detección de phishing y sinkhole DNS.
- `GET /alerts` — alertas de phishing detectadas por Wazuh
- `GET /domains` — dominios sospechosos
- `GET /victims` — IPs víctimas detectadas
- `GET /stats` — estadísticas generales
- `POST /sinkhole` — agrega dominio al sinkhole DNS (via MikroTik static DNS)
- `DELETE /sinkhole/{domain}` — quita del sinkhole
- `GET /sinkhole` — lista de entradas en sinkhole (desde SQLite)
- `POST /simulate` — simula alerta de phishing (para testing)

Importa: `MikroTikService`, `WazuhService`, `SinkholeEntry` (modelo), `ActionLog`

### `portal.py` · prefijo `/api/portal`
Gestión completa del Hotspot MikroTik (Portal Cautivo).
- `GET /status` — estado de inicialización del hotspot
- `GET /sessions` — sesiones activas en tiempo real
- `GET /sessions/history` — historial de sesiones
- `GET /stats/realtime` — métricas de ancho de banda en tiempo real
- `GET /stats/summary` — resumen de uso del portal
- `GET /users` — usuarios registrados
- `POST /users` — crea usuario
- `PUT /users/{id}` — actualiza usuario
- `DELETE /users/{id}` — elimina usuario
- `POST /users/bulk` — importación masiva de usuarios
- `GET /profiles` — perfiles de velocidad
- `POST /profiles` — crea perfil
- `PUT /profiles/{id}` — actualiza perfil
- `DELETE /profiles/{id}` — elimina perfil
- `GET /config` — configuración del hotspot
- `PUT /config` — actualiza configuración
- `GET /schedule` — configuración de horarios de acceso
- `PUT /schedule` — actualiza horarios
- `POST /setup` — inicializa el hotspot en MikroTik

Importa: `PortalService`, `HotspotNotInitializedError`, `ActionLog`, schemas de `portal`

### `reports.py` · prefijo `/api/reports`
Generación de reportes IA y gestión del bot Telegram.
- `POST /generate` — genera reporte con Claude AI (function calling)
- `POST /export-pdf` — exporta HTML a PDF con WeasyPrint
- `GET /history` — historial de reportes guardados
- `GET /telegram/status` — estado de conexión del bot Telegram
- `POST /telegram/test` — envía mensaje de prueba
- `GET /telegram/configs` — configuraiones de reportes automáticos
- `POST /telegram/configs` — crea configuración
- `PUT /telegram/configs/{id}` — actualiza configuración
- `DELETE /telegram/configs/{id}` — elimina configuración
- `POST /telegram/configs/{id}/trigger-now` — ejecuta reporte ahora
- `POST /telegram/send-alert` — envía alerta manual al chat
- `POST /telegram/send-summary` — envía resumen del sistema
- `GET /telegram/logs` — historial de mensajes (filtros direction/type)
- `POST /telegram/webhook` — webhook inbound de Telegram (siempre 200 OK)

Importa: `AIService`, `PDFService`, `TelegramService`, `TelegramScheduler`, modelos `telegram`, schemas de `reports`/`telegram`

### `glpi.py` · prefijo `/api/glpi`
Inventario y tickets de GLPI ITSM.
- `GET /assets` — lista activos con filtros
- `GET /assets/{id}` — detalle de un activo
- `POST /assets` — crea activo
- `PUT /assets/{id}` — actualiza activo
- `GET /assets/stats` — estadísticas del inventario
- `GET /assets/health` — salud de activos correlacionada con agentes Wazuh
- `GET /tickets` — lista de tickets
- `POST /tickets` — crea ticket
- `PUT /tickets/{id}/status` — actualiza estado
- `GET /users` — usuarios de GLPI
- `GET /locations` — ubicaciones físicas
- `GET /availability` — disponibilidad del servicio GLPI
- `POST /assets/{id}/quarantine` — pone activo en cuarentena (bloquea en MikroTik + registra)
- `POST /assets/{id}/unquarantine` — quita de cuarentena
- `POST /network-maintenance` — activa mantenimiento de red

Importa: `GLPIService`, `MikroTikService`, `WazuhService`, `ActionLog`, `QuarantineLog`, schemas de `glpi`

### `crowdsec.py` · prefijo `/api/crowdsec`
Centro de comando CrowdSec.
- `GET /decisions` — decisiones activas enriquecidas con GeoIP
- `GET /decisions/stream` — stream de nuevas decisiones e iborra
- `GET /metrics` — métricas del motor CrowdSec
- `GET /bouncers` — estado de bouncers registrados
- `GET /scenarios` — escenarios de detección activos
- `GET /alerts` — alertas del LAPI (diferente a decisions)
- `POST /cti/lookup` — reputación de IP en el contexto comunitario
- `POST /decisions/manual` — agrega decisión manual de bloqueo
- `DELETE /decisions/{id}` — elimina decisión
- `POST /whitelist` — agrega IP a whitelist
- `DELETE /whitelist/{ip}` — quita de whitelist
- `GET /whitelist` — lista de IPs en whitelist
- `POST /remediation/full` — remediación completa de una IP
- `POST /sync` — sincroniza decisiones CrowdSec → firewall MikroTik
- `GET /sync/status` — estado de última sincronización
- `GET /top-attackers` — top IPs atacantes por hits

Importa: `CrowdSecService`, `MikroTikService`, `WazuhService`, `ActionLog`, schemas de `crowdsec`

### `geoip.py` · prefijo `/api/geoip`
Geolocalización local de IPs con MaxMind GeoLite2.
- `GET /lookup/{ip}` — geolocaliza una IP (país, ciudad, ASN, tipo de red)
- `POST /lookup/bulk` — geolocaliza hasta 200 IPs
- `GET /stats/top-countries` — top países atacantes (cross-source: CrowdSec + Wazuh + MikroTik)
- `GET /stats/top-asns` — top sistemas autónomos atacantes
- `GET /suggestions/geo-block` — sugerencias automáticas de países a bloquear
- `POST /suggestions/{id}/apply` — aplica sugerencia (bloqueo por país en firewall)
- `DELETE /suggestions/{id}` — descarta sugerencia
- `GET /db/status` — estado de las bases de datos .mmdb (build date, tamaño de caché)

Importa: `GeoIPService`, `ActionLog`, schemas de `geoip`

### `suricata.py` · prefijo `/api/suricata`
Motor IDS/IPS/NSM Suricata (24 endpoints).
- `GET /engine/status` — modo (IDS/IPS/NSM), versión, estado del socket
- `GET /engine/stats` — métricas en tiempo real + serie temporal
- `POST /engine/reload-rules` — recarga reglas en caliente
- `GET /alerts` — alertas IDS/IPS con filtros (firma, severidad, protocolo)
- `GET /alerts/timeline` — timeline por minuto (IDS vs IPS)
- `GET /alerts/top-signatures` — top firmas por hits
- `GET /alerts/categories` — distribución por categoría (donut)
- `GET /flows` — flujos de red capturados
- `GET /flows/stats` — estadísticas de flujos
- `GET /flows/dns` — consultas DNS registradas
- `GET /flows/http` — transacciones HTTP capturadas
- `GET /flows/tls` — handshakes TLS con JA3/SNI
- `GET /rules` — lista de reglas/firmas
- `PUT /rules/{sid}/toggle` — habilita/deshabilita regla por SID
- `POST /rules/update` — ejecuta `suricata-update`
- `GET /correlation/crowdsec` — IPs con alertas Suricata + decisión CrowdSec activa
- `GET /correlation/wazuh` — correlación temporal Suricata × Wazuh
- `GET /autoresponse/config` — configuración del circuito auto-response
- `PUT /autoresponse/config` — actualiza configuración
- `POST /autoresponse/trigger` — dispara auto-response manual (requiere confirmación en UI)
- `GET /autoresponse/history` — historial de triggers

Importa: `SuricataService`, `ActionLog`, schemas de `suricata`

### `views.py` · prefijo `/api/views`
CRUD de vistas personalizadas del dashboard (persistido en SQLite).
- `GET /` — lista todas las vistas del usuario
- `POST /` — crea vista nueva
- `GET /{id}` — obtiene vista con sus widgets
- `PUT /{id}` — actualiza nombre/descripción/layout
- `DELETE /{id}` — elimina vista
- `GET /widgets/catalog` — catálogo tabulado de widgets disponibles por categoría (Standard/Visual/Technical/Hybrid)

Importa: `CustomView` (modelo), `CustomViewCreate`/`CustomViewUpdate` (schemas), `get_db`

### `widgets.py` · prefijo `/api/widgets`
Datos agregados para los widgets del catálogo. Cada endpoint orquesta múltiples servicios y devuelve datos listos para consumir por el `WidgetRenderer`.
- `GET /threat-level` — nivel de amenaza 0–100 con desglose por fuente
- `GET /activity-heatmap` — matriz 7×24h horas de alertas Wazuh
- `GET /correlation-timeline` — timeline multi-fuente (Wazuh + Suricata + CrowdSec)
- `GET /confirmed-threats` — IPs confirmadas por múltiples fuentes
- `GET /incident-lifecycle/{ip}` — ciclo de vida de un incidente por IP
- `GET /suricata-asset-correlation` — correlación Suricata × inventario GLPI
- `GET /world-threat-map` — intensidad de amenazas por país (para mapa mundial)
- `POST /view-report` — genera reporte IA desde datos de una vista personalizada

Importa (lazy, dentro de cada handler): `WazuhService`, `CrowdSecService`, `SuricataService`, `MikroTikService`, `GLPIService`, `GeoIPService`, `AIService`, `PDFService`, `TelegramService`, `MockData`

---

## `services/` — Lógica de Negocio

Todos los servicios externos siguen el **patrón singleton**: variable de módulo + función `get_X_service()`. Las operaciones bloqueantes (routeros-api) se delegan al executor con `run_in_executor`.

### `mikrotik_service.py`
**Servicio MikroTik CHR.** Conecta al router via RouterOS API (TCP 8728).

Clase `MikroTikService`:
- `connect()` / `disconnect()` — gestión del ciclo de vida de la conexión
- `get_interfaces()` — lista de interfaces con estado y tráfico
- `get_arp_table()` — tabla ARP
- `get_connections()` — conexiones activas (NAT/conexiones firewall)
- `get_firewall_rules()` — reglas activas del firewall
- `get_blacklist()` — address-list de IPs bloqueadas
- `block_ip(ip, comment)` — agrega IP a address-list de bloqueo
- `unblock_ip(ip)` — elimina IP del address-list
- `get_traffic()` — snapshot de ancho de banda por interfaz
- `get_vlan_traffic()` — tráfico por VLAN
- `get_vlan_addresses()` — subredes asignadas a interfaces VLAN
- `create_vlan(data)` / `update_vlan(id, data)` / `delete_vlan(id)` — CRUD de VLANs
- `get_logs()` — últimos logs del sistema RouterOS
- `run_command(cmd)` — ejecuta comando arbitrario RouterOS (CLI web)
- `get_health()` — uptime, CPU, memoria, versión RouterOS

**Patrón técnico clave:** `asyncio.Lock` global + `run_in_executor` para cada operación síncrona de routeros-api.

Función factory exportada: `get_mikrotik_service() -> MikroTikService`

### `wazuh_service.py`
**Servicio Wazuh SIEM.** Conecta via HTTPS REST con JWT y refresh automático.

Clase `WazuhService`:
- `authenticate()` — obtiene token JWT, maneja expiración y refresh
- `get_alerts(limit, level_min, agent_id, date_from)` — alertas filtradas con enriquecimiento GeoIP
- `get_agents()` / `get_agents_summary()` — estado de agentes
- `get_mitre_summary()` — técnicas ATT&CK detectadas
- `get_health()` — health del manager Wazuh
- `run_active_response(agent_id, command, arguments)` — ejecuta active response
- `get_critical_alerts(threshold)` — alertas por encima del umbral

**Enriquecimiento GeoIP:** `get_alerts()` llama internamente a `GeoIPService.lookup(src_ip)` y agrega campo `geo` a cada alerta si está disponible (try/except silencioso).

Función factory exportada: `get_wazuh_service() -> WazuhService`

### `crowdsec_service.py`
**Servicio CrowdSec.** Conecta a la LAPI local (HTTP, puerto 8080) como bouncer.

Clase `CrowdSecService`:
- `get_decisions()` — decisiones activas, enriquecidas con `GeoIPService.lookup(ip)`
- `get_decisions_stream(startup)` — stream de nuevas/expiradas (para WebSocket)
- `add_decision(ip, duration, reason, type)` — agrega decisión de bloqueo
- `delete_decision(id)` — elimina decisión
- `get_metrics()` — estadísticas del agente CrowdSec
- `get_bouncers()` — bouncers registrados en la LAPI
- `get_scenarios()` — escenarios de detección activos
- `get_alerts()` — alertas del LAPI (pre-decisión)
- `cti_lookup(ip)` — consulta reputación comunitaria en CTI API
- `get_top_attackers(limit)` — top IPs por número de hits
- `sync_to_mikrotik()` — traduce decisiones activas a reglas drop en MikroTik

Función factory exportada: `get_crowdsec_service() -> CrowdSecService`

### `wazuh_service.py` (nota de dependencias cruzadas)
Depende lazy de `GeoIPService` para enriquecer alertas.

### `geoip_service.py`
**Servicio GeoIP.** Carga local de bases de datos MaxMind .mmdb. Sin reconexiones — inicializado una sola vez en startup.

Clase `GeoIPService` (métodos de clase, no instancia):
- `initialize()` — carga `GeoLite2-City.mmdb` y `GeoLite2-ASN.mmdb` en RAM
- `lookup(ip: str) -> dict` — devuelve `{country_code, country_name, city, lat, lon, asn, as_name, network_type, is_datacenter, is_tor}`. Resultado cacheado en `TTLCache(maxsize=10000, ttl=3600)`.
- `lookup_bulk(ips: list[str]) -> list[dict]` — vectorizado, hasta 200 IPs
- `get_top_countries(source_data) -> list[dict]` — agrega conteo de IPs por país
- `get_db_status() -> dict` — estado de ambas .mmdb (fecha de build, tamaño del caché)

En mock (`MOCK_GEOIP=true`): devuelve datos desde `MockData.geoip`.

Función exportada: `get_geoip_service() -> GeoIPService` (aunque mayormente se usa la clase directamente)

### `suricata_service.py`
**Servicio Suricata IDS/IPS/NSM.** Doble canal: Unix socket para control del motor, Wazuh API para alertas.

Clase `SuricataService`:
- `connect()` / `close()` — verifica conectividad al socket Unix
- `get_engine_status()` — modo (IDS/IPS/NSM), versión, estado socket, métricas básicas
- `get_engine_stats()` — métricas detalladas en tiempo real + serie temporal
- `reload_rules()` — envía comando al socket para hot-reload de firmas
- `get_alerts(limit, filters)` — consulta alertas vía `WazuhService` filtrando `rule.groups=suricata`
- `get_alerts_timeline()` — timeline minute-by-minute
- `get_top_signatures()` / `get_alert_categories()` — agregaciones para gráficos
- `get_flows(filters)` — flujos NSM capturados
- `get_flows_stats()` / `get_dns_queries()` / `get_http_transactions()` / `get_tls_handshakes()` — datos NSM
- `get_rules(filters)` — lista de firmas con estado enabled/disabled
- `toggle_rule(sid, enabled)` — activa/desactiva una regla
- `update_rules()` — ejecuta suricata-update
- `get_crowdsec_correlation()` — IPs con alertas Suricata que tienen decisión en `CrowdSecService`
- `get_wazuh_correlation()` — correlación temporal Wazuh × Suricata
- `get_config()` / `update_config(data)` — configuración del circuito auto-response
- `trigger_auto_response(ip, alert_id, duration, reason)` — ejecuta bloqueo coordinado: registra en `ActionLog` → llama `CrowdSecService.add_decision()` → llama `MikroTikService.block_ip()`
- `get_auto_response_history()` — historial de triggers

Función factory exportada: `get_suricata_service() -> SuricataService`

### `glpi_service.py`
**Servicio GLPI ITSM.** Conecta via REST con doble token (App-Token + Session-Token).

Clase `GLPIService`:
- `authenticate()` — `POST /apirest.php/initSession` → Session-Token
- `get_assets(filters)` / `get_asset(id)` — inventario de activos (Computer, NetworkEquipment, etc.)
- `create_asset(data)` / `update_asset(id, data)` — CRUD de activos
- `get_asset_stats()` — conteos por tipo/estado/criticidad
- `get_asset_health()` — correlaciona activos con agentes Wazuh (enriquecimiento)
- `get_tickets(filters)` / `create_ticket(data)` / `update_ticket_status(id, status)` — CRUD de tickets
- `get_users()` / `get_locations()` — catálogos de referencia
- `get_availability()` — check de disponibilidad del servicio GLPI
- `quarantine_asset(id, ip)` / `unquarantine_asset(id)` — llama a `MikroTikService.block_ip()` y registra en `QuarantineLog`

Función factory exportada: `get_glpi_service() -> GLPIService`

### `portal_service.py`
**Servicio Portal Cautivo MikroTik Hotspot.** Orquesta llamadas al `MikroTikService` con lógica de negocio adicional.

Clase `PortalService`:
- `check_hotspot_status()` — verifica si el hotspot está inicializado en el router
- `get_active_sessions()` — sesiones activas del hotspot con métricas de ancho de banda
- `get_session_history(page, limit)` — historial paginado de sesiones
- `get_realtime_stats()` — métricas en tiempo real (usuarios, ancho de banda total)
- `get_summary_stats()` — resumen histórico de uso
- `get_users()` / `create_user(data)` / `update_user(id, data)` / `delete_user(id)` — CRUD de usuarios hotspot
- `bulk_import_users(data_list)` — importación masiva
- `get_speed_profiles()` / `create_profile(data)` / `update_profile(id, data)` / `delete_profile(id)` — CRUD de perfiles de velocidad
- `get_config()` / `update_config(data)` — configuración general del hotspot
- `get_schedule()` / `update_schedule(data)` — horarios de acceso
- `setup_hotspot()` — inicialización completa del hotspot en MikroTik (crea server, pool, address, profile, etc.)
- `get_session_chart_history()` — datos históricos para el gráfico de sesiones en el WebSocket

Accede a `MikroTikService` localmente (import lazy dentro de `__init__`).

Función factory exportada: `get_portal_service() -> PortalService`

### `ai_service.py`
**Servicio Claude AI.** Implementa reportes con function calling y respuestas del bot Telegram.

Clase `AIService`:
- `generate_report(prompt, audience, sources)` — genera reporte: construye el system prompt según audiencia (`EXECUTIVE`/`TECHNICAL`/`OPERATIONAL`) → envía a Claude con tools → itera tool calls hasta que Claude responde texto final
- `answer_telegram_query(user_message, chat_id)` — responde consulta inbound del bot: llama a Claude con `TELEGRAM_SYSTEM_PROMPT` → resuelve tool calls → devuelve respuesta en texto

Constante `TOOLS` — lista de tools disponibles para Claude:
`get_wazuh_alerts`, `get_wazuh_agents`, `get_crowdsec_decisions`, `get_mikrotik_interfaces`, `get_mikrotik_traffic`, `get_suricata_stats`, `get_glpi_assets`, `get_geoip_top_countries`

Constante `SYSTEM_PROMPTS` — dict por audiencia con el system prompt completo.

Función `_execute_tool(tool_name, params)` — despacha cada tool call al servicio correspondiente (lazy import).

Función `collect_view_context(widget_types)` — recopila datos de múltiples fuentes para un reporte de vista personalizada.

Función factory exportada: `get_ai_service() -> AIService`

### `pdf_service.py`
**Servicio de exportación PDF.** Jinja2 → HTML → WeasyPrint → bytes.

Clase `PDFService`:
- `generate_pdf(html_content, title)` — renderiza el HTML con la plantilla `templates/report_base.html` usando Jinja2, luego convierte a PDF con WeasyPrint ejecutado en executor (CPU-bound).

Función factory exportada: `get_pdf_service() -> PDFService`

### `telegram_service.py`
**Servicio Telegram Bot.** Bidireccional: envío de notificaciones (outbound) + recepción de consultas (inbound).

Clase `TelegramService`:
- `connect()` / `close()` — conecta al Bot API de Telegram, verifica credenciales
- `send_message(chat_id, text, parse_mode)` — envío con retry ×3 (tenacity)
- `send_alert(alert_data)` — formatea alerta de seguridad y la envía
- `send_status_summary()` — recopila estado del sistema (MikroTik, Wazuh, CrowdSec, Suricata) y envía resumen al chat
- `get_status()` — estado de conexión del bot (username, chat_id configurado, mock mode)
- `get_message_logs(filters)` — historial de mensajes guardados en SQLite
- `process_incoming_message(update)` — maneja mensaje inbound del webhook, llama a `AIService.answer_telegram_query()` y envía respuesta

Accede lazy a: `MikroTikService`, `WazuhService`, `CrowdSecService`, `SuricataService`, `AIService`

Función factory exportada: `get_telegram_service() -> TelegramService`

### `telegram_scheduler.py`
**APScheduler para reportes automáticos.** Sincroniza jobs desde SQLite cada minuto.

Clase `TelegramScheduler`:
- `start()` / `stop()` — inicia/para el `AsyncIOScheduler` de APScheduler
- `sync_jobs()` — consulta `TelegramReportConfig` en SQLite y reconcilia con los jobs activos en el scheduler (agrega/modifica/elimina según corresponda)
- `_execute_report(config_id)` — ejecuta un reporte:  llama a `AIService.generate_report()` → formatea → llama a `TelegramService.send_message()`

Función factory exportada: `get_telegram_scheduler() -> TelegramScheduler`

### `mock_data.py`
**Datos mock deterministas.** Generados con `random.seed(42)`, siempre reproducibles.

Clases anidadas por dominio:
- `MockData.wazuh` → alertas, agentes, health, MITRE summary
- `MockData.mikrotik` → interfaces, ARP, firewall, tráfico, logs
- `MockData.crowdsec` → decisions, metrics, bouncers, scenarios, CTI lookup
- `MockData.suricata` → engine status, alerts, flows (DNS/HTTP/TLS), rules, correlation
- `MockData.glpi` → assets, tickets, users, locations, health
- `MockData.geoip` → lookup, bulk, top countries, top ASNs, suggestions
- `MockData.portal` → sessions, users, profiles, stats, config
- `MockData.telegram` → bot status, configs, logs
- `MockData.websocket` → métodos `*_tick(n)` para simular streams en tiempo real

### `mock_service.py`
**Estado mutable en memoria.** CRUD en RAM para operaciones de escritura en modo mock.

Clase `MockService`:
- Listas en memoria por dominio: `_vlans`, `_labels`, `_groups`, `_whitelist`, `_crowdsec_decisions`, `_portal_users`, `_portal_profiles`, `_telegram_configs`, `_telegram_logs`
- CRUD completo por dominio (create/update/delete con IDs autoincrementales)
- `get_mock_status() -> dict` — devuelve qué servicios están en mock (llamado por `/api/system/mock-status`)

### `auth_provider.py`
**Proveedor de autenticación para el portal captivo.** Implementa la verificación de credenciales de usuarios hotspot contra MikroTik.

Clase `AuthProvider`:
- `verify_credentials(username, password)` — verifica usuario/contraseña contra el hotspot de MikroTik via API
- `get_user_session(username)` — obtiene sesión activa del usuario
- `create_guest_session(ip)` — crea sesión guest temporal

---

## `models/` — SQLAlchemy ORM

Todos heredan de `Base` definida en `database.py`.

### `__init__.py`
Re-exporta todos los modelos para que `init_db()` los encuentre al crear tablas.

### `action_log.py`
**Tabla `action_log`** — Historial de acciones de seguridad.
Campos: `id`, `action_type`, `target_ip`, `details` (JSON), `performed_by`, `comment`, `created_at`

### `ip_label.py`
**Tabla `ip_label`** — Etiquetas de IPs individuales.
Campos: `id`, `ip`, `label`, `color`, `created_at`

### `ip_group.py`
**Tablas `ip_group` y `ip_group_member`** — Grupos de IPs con miembros.
Campos grupo: `id`, `name`, `description`, `created_at`
Campos miembro: `id`, `group_id` (FK), `ip`, `added_at`

### `sinkhole_entry.py`
**Tabla `sinkhole_entry`** — Dominios en el sinkhole DNS.
Campos: `id`, `domain`, `reason`, `created_at`, `created_by`

### `portal_user.py`
**Tabla `portal_user_registry`** — Registro interno de usuarios del portal cautivo creados via NetShield.
Campos: `id`, `username`, `mac_address`, `created_at`, `profile_name`, `comment`

### `quarantine_log.py`
**Tabla `quarantine_log`** — Log de activos GLPI puestos en cuarentena.
Campos: `id`, `asset_id`, `asset_name`, `ip`, `reason`, `quarantined_at`, `unquarantined_at`, `is_active`

### `telegram.py`
**Tres tablas** para el módulo Telegram:

`TelegramReportConfig` — Configuraciones de reportes automáticos.
Campos: `id`, `name`, `schedule_cron`, `audience`, `prompt`, `sources` (JSON), `chat_id`, `is_active`, `created_at`

`TelegramMessageLog` — Historial de mensajes enviados y recibidos.
Campos: `id`, `direction` (outbound/inbound), `message_type`, `chat_id`, `content`, `sent_at`, `status`

`TelegramPendingMessage` — Cola de mensajes pendientes de envío.
Campos: `id`, `chat_id`, `content`, `scheduled_at`, `config_id` (FK)

### `custom_view.py`
**Tabla `custom_view`** — Vistas personalizadas del dashboard.
Campos: `id`, `name`, `description`, `layout` (JSON con widgets y posiciones), `created_at`, `updated_at`

---

## `schemas/` — Pydantic v2 (Request/Response)

Cada archivo define los modelos Pydantic de validación de entrada y serialización de salida. Todos los endpoints devuelven `APIResponse` del `common.py`.

### `common.py`
- `APIResponse` — wrapper genérico: `{success: bool, data: Any, error: str | None}`, métodos de clase `ok(data)` y `fail(error)`

### `mikrotik.py` — `InterfaceInfo`, `ConnectionInfo`, `ARPEntry`, `TrafficData`, `FirewallRule`, `BlockIPRequest`, `UnblockIPRequest`, `LogEntry`
### `wazuh.py` — `WazuhAgent`, `WazuhAlert`, `ActiveResponseRequest`
### `network.py` — `IPLabelCreate`, `IPLabelResponse`, `IPGroupCreate`, `IPGroupResponse`, `IPGroupMemberAdd`
### `vlan.py` — `VlanCreate`, `VlanUpdate`, `VlanInfo`, `VlanTrafficData`
### `security.py` — `SecurityBlockIPRequest`, `QuarantineRequest`, `GeoBlockRequest`, `CLIMikrotikRequest`, `CLIWazuhAgentRequest`, `CriticalAlert`, `AlertTimelinePoint`, `TopAgent`, `AgentsSummary`, `MitreSummaryItem`, `SystemHealthMikrotik`, `WazuhHealthItem`, `NetworkSearchResult`, `CLIResponse`
### `phishing.py` — `PhishingAlert`, `SuspiciousDomain`, `PhishingVictim`, `PhishingStats`, `SinkholeEntryResponse`, `SinkholeRequest`, `PhishingBlockIPRequest`, `PhishingSimulateRequest`
### `portal.py` — `PortalSession`, `PortalUser`, `PortalProfile`, `PortalConfig`, `ScheduleConfig`, `HotspotSetupResult` y variantes Create/Update
### `glpi.py` — `GlpiAsset`, `GlpiTicket`, `GlpiUser`, `GlpiAssetHealth`, `GlpiNetworkContext`, `GlpiLocation`, `GlpiQuarantineRequest`, `NetworkMaintenanceRequest`, `GlpiAvailability`
### `crowdsec.py` — `ManualDecisionRequest`, `WhitelistRequest`, `FullRemediationRequest`, `SyncApplyRequest`
### `geoip.py` — `GeoIPResult`, `GeoIPBulkRequest`, `TopCountriesResponse`, `GeoBlockSuggestion`, `GeoIPDbStatus`
### `suricata.py` — `AutoResponseTriggerRequest`, `AutoResponseConfigUpdate`, `RuleToggleRequest`, `AlertFilterParams`, `FlowFilterParams`, `RuleFilterParams`
### `reports.py` — `ReportGenerateRequest`, `ReportExportRequest`, `ReportDraft`
### `telegram.py` — `TelegramAlert`, `TelegramReportConfigCreate/Update/Response`, `TelegramBotQuery`, `TelegramMessageLogResponse`, `TelegramStatusResponse`, `TelegramSendSummaryRequest`
### `views.py` — `CustomViewCreate`, `CustomViewUpdate`

---

## `scripts/` — Utilidades de mantenimiento

### `download_geoip.py`
Descarga las dos bases de datos MaxMind GeoLite2 usando la `MAXMIND_LICENSE_KEY` del `.env`. Guarda en `backend/data/geoip/`. Debe ejecutarse manualmente antes de activar `MOCK_GEOIP=false`.

### `setup_hotspot.py`
Script de configuración inicial del hotspot MikroTik. Alternativa al endpoint `/api/portal/setup` para ejecución desde línea de comandos.

---

## `templates/`

### `report_base.html`
Plantilla Jinja2 para los reportes PDF. Incluye estilos CSS inline optimizados para WeasyPrint (no usa CDNs, todo embebido). `PDFService` la renderiza con el contenido del reporte generado por Claude AI.

---

## `data/`

### `geoip/` (directorio)
Contiene `GeoLite2-City.mmdb` y `GeoLite2-ASN.mmdb` descargados por `download_geoip.py`. Ignorados en `.gitignore` porque MaxMind requiere licencia propia.
