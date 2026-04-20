# Integración de servicios en NetShield

## Visión general

NetShield no es un simple dashboard que hace proxying de APIs. Es una **capa de orquestación** que conecta 8 servicios externos heterogéneos (protocolos diferentes, autenticaciones distintas, formatos incompatibles) y los expone con una interfaz unificada hacia el frontend. Aquí está explicado cómo funciona cada integración.

---

## 1. El núcleo: `config.py` como árbitro central

Todo arranca en `config.py`. Es un singleton de Pydantic `Settings` que:

- Lee variables de entorno / `.env` un sola vez (cacheado con `@lru_cache`)
- Tiene una propiedad `should_mock_X` por cada servicio
- Implementa la lógica de `MOCK_ALL` → activa todos los mocks en cascada
- Cualquier servicio en el sistema consulta `get_settings().should_mock_X` para saber si debe usar datos reales o simulados

```
MOCK_ALL=true
   │
   ▼ settings._effective_mock_all = True
   │
   ├── should_mock_mikrotik → True
   ├── should_mock_wazuh    → True
   ├── should_mock_crowdsec → True
   ├── should_mock_geoip    → True
   ├── should_mock_suricata → True
   └── should_mock_telegram → True
```

Esto significa que los **guards de mock están en los servicios y WebSockets**, no en los routers. Es deliberado: los WebSockets en `main.py` no pasan por los routers, entonces si el guard estuviera solo en el router, el WS transmitiría datos reales aunque `MOCK_ALL=true`.

---

## 2. El patrón de servicios: Singleton con lifecycle

Todos los servicios externos siguen el mismo patrón:

```python
# Singleton perezoso con función factory
_instance: MikrotikService | None = None

def get_mikrotik_service() -> MikrotikService:
    global _instance
    if _instance is None:
        _instance = MikrotikService()
    return _instance
```

**¿Por qué singleton?** MikroTik, Wazuh y GLPI tienen conexiones persistentes (RouterOS API, JWT con expiración, sesión HTTP). Crear una nueva instancia por request desperdiciaría conexiones y autenticaciones. El singleton comparte la conexión.

El **lifecycle completo** ocurre en el `lifespan` de FastAPI en `main.py`:

```
App startup
   │
   ├── init_db()                    SQLAlchemy + SQLite
   ├── mikrotik.connect()           ← RouterOS API TCP
   ├── GeoIPService.initialize()    ← Carga .mmdb en RAM
   ├── suricata.connect()           ← Unix socket
   ├── telegram.connect()           ← Bot API de Telegram
   └── telegram_scheduler.start()  ← APScheduler cron

   [aplicación corriendo...]

App shutdown (graceful)
   ├── mikrotik.disconnect()
   ├── wazuh.close()
   ├── glpi.close()
   ├── crowdsec.close()
   ├── suricata.close()
   ├── telegram_scheduler.stop()
   ├── telegram.close()
   └── close_db()
```

---

## 3. Servicio por servicio

### 🌐 MikroTik CHR — `mikrotik_service.py`

**Protocolo:** RouterOS API (TCP, puerto 8728)  
**Librería:** `routeros-api` (síncrona — importante)

El problema principal: `routeros-api` es **bloqueante**. Cada llamada a la API de MikroTik tarda milisegundos en completar y bloquearía el event loop de asyncio. La solución:

```python
async def get_interfaces(self):
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(None, self._sync_get_interfaces)
    return result
```

Todas las operaciones MikroTik se ejecutan en el **thread pool del executor**, liberando el event loop para otras requests mientras espera la respuesta del router.

Además hay un `asyncio.Lock` global que garantiza que solo una coroutine a la vez acceda al socket de RouterOS (el router tiene un límite bajo de sesiones simultáneas).

**Qué provee:** interfaces, ARP, firewall (bloqueo/desbloqueo), tráfico por interfaz, conexiones activas, VLANs, portal cautivo.

---

### 🔍 Wazuh SIEM — `wazuh_service.py`

**Protocolo:** REST HTTPS (puerto 55000)  
**Auth:** JWT con expiración automática  
**Librería:** `httpx` async

Wazuh usa autenticación JWT. El token expira cada cierto tiempo. El servicio implementa **refresh automático**:

```
Primera request → POST /security/user/authenticate → token
Próximas requests → Authorization: Bearer {token}
Si 401 → refresh automático → reintento transparente
```

El parámetro `verify=False` está en todas las llamadas HTTPS a Wazuh porque en laboratorio usa certificados self-signed. Está documentado como riesgo aceptado para no usar en producción.

**Rol central de Wazuh:** Es el **bus de integración** para Suricata. Suricata escribe en `eve.json` → el agente Wazuh lee ese archivo → lo envía al Wazuh Manager → NetShield lo consulta con `rule.groups=suricata`. Wazuh actúa como transporte para las alertas de Suricata.

---

### 🛡️ CrowdSec — `crowdsec_service.py`

**Protocolo:** REST HTTP (puerto 8080, LAPI local)  
**Auth:** API key en header `X-Api-Key`  
**Librería:** `httpx` async

CrowdSec expone su Local API (LAPI). NetShield se conecta como un **bouncer** (agente consumidor de decisiones). Hay dos tipos de datos:

1. **Decisiones** (`/v1/decisions`) — IPs baneadas actualmente. Enriquecidas con GeoIP antes de enviar al frontend.
2. **CTI** (`/v2/signals/ip/{ip}`) — Reputación de una IP específica del contexto comunitario global.

**Integración cruzada con MikroTik:** La sincronización CrowdSec → MikroTik funciona así: Las decisiones de CrowdSec se convierten en reglas drop en el address-list `Blacklist_Automatica` del firewall de MikroTik. El endpoint `/api/crowdsec/sync` lo hace explícitamente; el auto-response de Suricata también puede dispararlo.

---

### 📡 Suricata IDS/IPS/NSM — `suricata_service.py`

**Interfaces de acceso:**
1. **Unix socket** `/var/run/suricata/suricata.socket` — para control del motor (recargar reglas, ver estadísticas en tiempo real desde Suricata directo)
2. **Wazuh API** — para alertas (Suricata escribe `eve.json` → Wazuh indexa → NetShield consulta)

```
Tráfico de red
     │
     ▼
 Suricata
     ├── eve.json ──────→ Agente Wazuh ──→ Wazuh Manager ──→ NetShield /api/suricata/alerts
     └── socket  ──────→ NetShield /api/suricata/engine/status
```

El circuito de auto-response está implementado en el servicio con un guard de confirmación:

```python
async def trigger_auto_response(ip, alert_id, duration, reason):
    # 1. Registra en ActionLog (SQLite)
    # 2. Si config.actions.crowdsec_ban: llama crowdsec_service.add_decision()
    # 3. Si config.actions.mikrotik_block: llama mikrotik_service.block_ip()
    # 4. Notifica vía Telegram si está configurado
```

---

### 🌍 GeoLite2 — `geoip_service.py`

**Modo de operación:** Local (no hay API externa, no hay latencia de red)  
**Almacenamiento:** Dos archivos `.mmdb` en RAM (`GeoLite2-City.mmdb` + `GeoLite2-ASN.mmdb`)  
**Cache:** `TTLCache(maxsize=10000, ttl=3600)` en memoria

GeoIP es el único servicio que se inicializa en un único momento y no tiene reconexiones. En `main.py`:

```python
GeoIPService.initialize()  # Carga ambas .mmdb en RAM una sola vez
```

Después, cada lookup es puramente en memoria (sin I/O):

```python
reader_city.city(ip_address)   # Microsegundos
reader_asn.asn(ip_address)     # Microsegundos
```

**Enriquecimiento silencioso:** GeoIP enriquece datos de otros servicios sin que el endpoint falle si GeoIP no está disponible. Ejemplo en `crowdsec_service.py`:

```python
for decision in decisions:
    try:
        geo = GeoIPService.lookup(decision["ip"])
        decision["geo"] = geo  # Se agrega si está disponible
    except Exception:
        pass  # Si falla, el decision sigue sin campo "geo"
    # Nunca lanza error 500 por un fallo de GeoIP
```

Lo mismo ocurre en las alertas Wazuh: cada alerta que tiene `src_ip` recibe un campo `geo` si GeoIP está disponible.

---

### 📦 GLPI ITSM — `glpi_service.py`

**Protocolo:** REST HTTP  
**Auth:** Doble token — `App-Token` (por aplicación) + `Session-Token` (por sesión)

La autenticación GLPI es distinta: hay que crear una sesión primero y luego usarla en cada request:

```
POST /apirest.php/initSession
   App-Token: {app_token}
   Authorization: user_token {user_token}
   → Session-Token: abc123

GET /apirest.php/Computer
   App-Token: {app_token}
   Session-Token: abc123
```

GLPI provee el inventario de activos (PCs, servidores, switches) y los correlaciona con alertas Wazuh: cuando un agente Wazuh genera alertas, el widget `CriticalAssets` puede mostrar qué activo de GLPI está siendo afectado, su ubicación física y el estado de salud del agente.

---

### 🤖 Claude AI — `ai_service.py`

**Protocolo:** REST HTTPS (Anthropic API)  
**Patrón:** Function Calling (tool use)

Claude no recibe datos directamente. En cambio, el sistema usa **function calling**: Claude recibe un system prompt describiendo las herramientas disponibles y puede llamar a funciones que traen datos reales:

```
Usuario: "Genera un reporte ejecutivo de amenazas de hoy"
   │
   ▼ Claude recibe tools: get_wazuh_alerts, get_crowdsec_decisions,
   │                       get_suricata_stats, get_mikrotik_traffic...
   │
   ▼ Claude decide: necesito get_wazuh_alerts(level_min=10, limit=20)
   │                          get_crowdsec_decisions()
   │
   ▼ NetShield ejecuta las tool calls contra los servicios reales
   │
   ▼ Claude recibe los resultados y redacta el reporte
```

Hay system prompts distintos por audiencia (`EXECUTIVE`, `TECHNICAL`, `OPERATIONAL`). Esto ajusta el tono y nivel de detalle del reporte generado.

**Telegram + Claude:** Cuando un usuario envía un mensaje al bot de Telegram, el flujo es: `telegram_service.process_incoming_message()` → `ai_service.answer_telegram_query()` → Claude genera la respuesta usando los mismos tools → la respuesta se envía de vuelta al chat.

---

### 💬 Telegram Bot — `telegram_service.py` + `telegram_scheduler.py`

**Librería:** `python-telegram-bot` 22+ (async)  
**Doble función:** outbound (notificaciones) + inbound (consultas)

**Canal outbound:** Cualquier servicio puede llamar a `telegram_service.send_alert()` o `send_status_summary()`. Internamente usa `send_message()` con retry ×3 (tenacity).

**Canal inbound:** El bot recibe mensajes de Telegram vía webhook (`POST /api/reports/telegram/webhook`). El endpoint siempre responde `200 OK` inmediatamente (Telegram requiere esto) y procesa el mensaje en background: pasa por Claude AI, recibe respuesta, la envía de vuelta al chat.

**Scheduler (APScheduler):** `telegram_scheduler.py` corre un `AsyncIOScheduler` que cada minuto sincroniza los jobs desde la base de datos. Cada "config" de reporte en la UI (ej: "enviar resumen todos los lunes a las 8am") se convierte en un cron job en memoria que llama a `ai_service.generate_report()` y luego `telegram_service.send_message()`.

```
SQLite (TelegramConfig tabla)
   │  ← sincroniza cada 1 min
   ▼
APScheduler (jobs en memoria)
   │  ← dispara según cron
   ▼
ai_service.generate_report() → Claude (function calling) → datos en vivo
   │
   ▼
telegram_service.send_message() → Bot API → Chat de Telegram
```

---

## 4. Los canales de datos: REST vs WebSocket

NetShield usa **dos canales paralelos** para distintos tipos de datos:

### REST (polling desde TanStack Query)

Para datos que pueden ser un poco stale:

| Dato | staleTime | refetchInterval |
|------|-----------|-----------------|
| Alertas Wazuh | 30s | — |
| Decisiones CrowdSec | 1 min | 2 min |
| Estado Suricata | 10s | 30s |
| Estado de agentes | 1 min | 2 min |
| GeoIP lookup | 1 hora | — |
| Activos GLPI | 2 min | — |

### WebSocket (push desde el backend)

Para datos que deben ser frescos:

| WebSocket | Intervalo | Fuente |
|-----------|-----------|--------|
| `/ws/traffic` | 2s | MikroTik traffic stats |
| `/ws/alerts` | 5s | Wazuh new alerts |
| `/ws/vlans/traffic` | 2s | MikroTik + Wazuh (VLAN alert status) |
| `/ws/security/alerts` | 5s | Wazuh (nivel alto) + MikroTik (interfaz down) |
| `/ws/portal/sessions` | 5s | Portal cautivo MikroTik |
| `/ws/crowdsec/decisions` | 10s | CrowdSec decision stream |
| `/ws/suricata/alerts` | 5s | Suricata via Wazuh |

Los WebSockets están implementados directamente en `main.py` (no en routers) porque comparten el `ConnectionManager` y necesitan acceder fácilmente al mock guard de settings.

---

## 5. La capa de mock: `mock_data.py` + `mock_service.py`

El sistema de mock tiene dos capas:

### `MockData` — datos estáticos/deterministas
Genera datos simulados con `random.seed(42)`. Cualquier llamada a `MockData.wazuh.get_alerts()` siempre devuelve los mismos datos. Hay clases anidadas por servicio:

```
MockData.wazuh        → alertas, agentes, health
MockData.mikrotik     → interfaces, ARP, firewall
MockData.crowdsec     → decisions, metrics, bouncers
MockData.suricata     → engine status, alerts, flows, rules, correlation
MockData.glpi         → assets, tickets, users
MockData.telegram     → bot status, configs, logs
MockData.websocket    → traffic_tick(n), alerts_tick(n),
                         vlan_traffic_tick(n), security_alert(n),
                         portal_session(n), crowdsec_decision_tick(n),
                         suricata_alert_tick(n)
```

Los métodos `*_tick(n)` son especiales para los WebSockets: aceptan un número de tick y deciden si emitir algo o no (ej: `crowdsec_decision_tick` solo emite cada 6 ticks para simular que los bloqueos no son continuos).

### `MockService` — estado mutable en memoria
Cuando el usuario crea algo en la UI (ej: una config de Telegram, un label de IP, una VLAN), eso se guarda en `MockService` como una lista en memoria. CRUD completo en RAM sin tocar la DB real. Al reiniciar el servidor se resetea — esto es intencional para laboratorio.

---

## 6. Integraciones cruzadas (entre servicios)

Las más importantes:

```
CrowdSec ──────────────────────────────────────────► MikroTik
  /api/crowdsec/sync:                                  block_ip()
  Las decisiones CrowdSec se sincronizan               add_to_address_list()
  como reglas en el firewall MikroTik

Suricata ──────────────────────────────────────────► CrowdSec + MikroTik
  /api/suricata/autoresponse/trigger:                  crowdsec.add_decision()
  Cuando Suricata detecta amenaza con                  mikrotik.block_ip()
  umbral superado → bloqueo coordinado

GeoIP ──────────────────────────────────────────────► CrowdSec + Wazuh
  Enriquecimiento silencioso: cada decisión            decision["geo"] = {...}
  CrowdSec y cada alerta Wazuh con src_ip              alert["geo"] = {...}
  recibe campo geo automáticamente

Suricata ───────────────► Wazuh (como transporte)
  eve.json → agente Wazuh → Wazuh Manager
  NetShield consulta Wazuh filtrando rule.groups=suricata

Telegram ──────────────────────────────────────────► Claude AI
  Mensaje inbound del bot →
  ai_service.answer_telegram_query() →
  Claude llama tools (get_wazuh_alerts, etc.) →
  Claude responde → Telegram envía al chat

Suricata autoresponse ──────────────────────────────► Telegram
  trigger_auto_response() →
  telegram_service.send_alert()
  (notificación del bloqueo automático)

Claude AI (reportes) ──────────────────────────────► Todos
  Function calling llama a:
  get_wazuh_alerts(), get_crowdsec_decisions(),
  get_suricata_stats(), get_mikrotik_traffic(),
  get_glpi_assets(), get_geoip_top_countries()
```

---

## 7. La base de datos SQLite como estado persistente

SQLite no contiene datos de los sistemas externos (esos viven en sus propios servidores). SQLite almacena el **estado propio de NetShield**:

| Tabla | Contenido |
|-------|-----------|
| `action_log` | Historial de bloqueos/desbloqueos (quién, cuándo, qué IP) |
| `network_label` | Etiquetas de IPs (ej: "Servidor DNS") |
| `ip_group` | Grupos de IPs (ej: "Servidores críticos") |
| `custom_view` | Vistas personalizadas del dashboard |
| `widget_instance` | Widgets en cada vista con su configuración |
| `telegram_config` | Configuraciones de reportes automáticos (cron + audiencia) |
| `telegram_log` | Historial de mensajes enviados/recibidos |

---

## 8. El frontend: cómo consume todo esto

El frontend tiene un cliente API centralizado en `api.ts` (~2000 líneas) organizado en namespaces:

```typescript
mikrotikApi.getInterfaces()
wazuhApi.getAlerts({ level_min: 10 })
crowdsecApi.getDecisions()
suricataApi.getEngineStatus()
geoipApi.lookup("1.2.3.4")
glpiApi.getAssets()
telegramApi.getStatus()
widgetsApi.getThreatLevel()
viewsApi.getViews()
```

Todas las llamadas HTTP pasan por `api.ts` — nunca `fetch` directo en componentes. El proxy de Vite redirige `/api/*` → `localhost:8000` y `/ws/*` → `ws://localhost:8000`, así el frontend no sabe si está contra dev o prod.

Los custom hooks con TanStack Query manejan el cache, stale time y refetch automático. Los WebSocket hooks (`useWebSocket.ts` como base) implementan reconexión con backoff exponencial.
