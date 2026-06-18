# 50 Preguntas y Respuestas — NetShield Dashboard

---

## Parte 1: Diseño de Software (15 preguntas)

### 1. ¿Qué patrón arquitectónico sigue NetShield?

**Cliente-servidor con API REST + WebSockets.** El frontend (React SPA en `:5173`) consume el backend (FastAPI en `:8000`) via endpoints REST y 7 canales WebSocket. No es monolítico: el frontend podría reemplazarse sin tocar el backend.

### 2. ¿Por qué los servicios del backend son singletons?

Porque las conexiones a sistemas externos (MikroTik, Wazuh, CrowdSec) son costosas de crear y tienen límites de sesiones concurrentes. El patrón singleton (`_instance` + `get_X_service()`) garantiza una sola conexión persistente compartida por todos los requests. Excepción: `AIService` crea instancia por llamada porque cada reporte tiene contexto independiente.

### 3. ¿Cómo se logra que todo el backend sea async si routeros-api es síncrono?

Con `run_in_executor`. MikroTik usa `routeros-api` (100% síncrono), así que cada llamada se ejecuta en el thread pool default del event loop. El método `_api_call()` en `MikroTikService` es el único punto de entrada — maneja threading, `asyncio.Lock` y reconexión automática.

### 4. ¿Por qué `APIResponse.ok(data)` y `APIResponse.fail(error)` en vez de excepciones HTTP?

Para tener un **envelope consistente** en todas las respuestas: `{"success": bool, "data": ..., "error": ...}`. El frontend siempre sabe cómo parsear la respuesta sin inspeccionar status codes. Definido en `schemas/common.py`.

### 5. ¿Cómo funciona el sistema de mock y por qué los guards están en servicios y no en routers?

Cada método público de servicio empieza con: `if settings.should_mock_X: return MockData.X.funcion()`. Están en servicios porque los **WebSockets no pasan por routers**. Si los guards estuvieran en routers, los WS intentarían conectarse a sistemas externos en modo mock.

La lógica de combinación es: `should_mock_X = MOCK_ALL || MOCK_X`. Retrocompatibilidad: `APP_ENV=lab` sin variables `MOCK_*` explícitas equivale a `MOCK_ALL=true`.

### 6. ¿Cómo maneja el frontend el data fetching y la caché?

**TanStack Query** (React Query). Cada fuente de datos tiene un custom hook con `useQuery` que define:
- `queryKey`: identificador único para la caché (`['widget', 'threat-gauge']`)
- `staleTime`: cuánto tiempo los datos son "frescos" (5s-5min según criticidad)
- `refetchInterval`: polling automático (10s para tráfico, 5min para inventario)

No se usa `fetch` directo en componentes — todo pasa por `services/api.ts` (18 namespaces).

### 7. ¿Cómo se estructura el sistema de 56 widgets?

Arquitectura de 3 capas:

1. **Hook** (`hooks/widgets/{category}/index.ts`): `useQuery` que llama a APIs existentes
2. **Componente** (`components/widgets/{category}/Widget.tsx`): React component visual
3. **Dispatcher** (`WidgetRenderer.tsx`): `switch(widget.type)` que renderiza el componente correcto

4 categorías: Standard (18), Visual (11), Technical (13), Hybrid (14). El catálogo se sirve desde `GET /api/views/widgets/catalog` en `routers/views.py`.

### 8. ¿Cómo se persisten las vistas personalizadas?

En **SQLite** via modelo `CustomView` (SQLAlchemy async + aiosqlite). Cada vista guarda: nombre, descripción, ícono, color, y un campo `widgets` que es un JSON stringificado con la configuración de cada widget (tipo, posición, tamaño, config). El drag-and-drop usa `@dnd-kit`.

### 9. ¿Cómo se manejan los errores de conexión a servicios externos?

Con **tenacity** (`@retry` decorator): backoff exponencial 1-10 segundos, máximo 3 intentos. Aplica a `httpx.ConnectError` y `httpx.TimeoutException` (Wazuh, CrowdSec) y `ConnectionRefusedError` (Suricata socket). Si los 3 intentos fallan, el endpoint devuelve `APIResponse.fail()` — nunca crashea.

### 10. ¿Cómo se evitan los circular imports entre servicios?

Con **lazy imports dentro de funciones**. Ejemplo: `suricata_service.py` necesita llamar a Wazuh para obtener alertas, pero no importa `WazuhService` al nivel del módulo — lo importa dentro de `_fetch_wazuh_suricata_alerts()`. Esto rompe el ciclo de dependencias en tiempo de carga.

### 11. ¿Qué base de datos usa y por qué no PostgreSQL?

**SQLite** (via `aiosqlite`). Elimina la dependencia de un servidor de DB en el laboratorio. Para migrar a PostgreSQL, solo se cambia `DATABASE_URL` a `postgresql+asyncpg://...` e instala `asyncpg` — sin cambios de código.

Modelos: `ActionLog`, `QuarantineLog`, `CustomView`, `NetworkLabel`, `NetworkGroup`, `PortalUser`, `AuthAttempt`, `TelegramConfig`, `TelegramLog`, `PhishingDetection`.

### 12. ¿Cómo funciona el design system del frontend?

**TailwindCSS v4** con tokens CSS nativos via `@theme` en `index.css` (121KB). No hay `tailwind.config.js`. Clases reutilizables predefinidas:
- Layout: `glass-card`, `stat-card`, `sidebar`
- Datos: `data-table`, `badge-critical/high/medium/low`
- Botones: `btn-primary/danger/ghost/success`
- Estado: `status-dot active/disconnected`
- Animación: `animate-fade-in-up`, `loading-spinner`

6 temas definidos en `config/themes.ts`, gestionados por `hooks/useTheme.ts`.

### 13. ¿Cómo se validan los datos de entrada en el backend?

Con **schemas Pydantic** en `schemas/`. Cada endpoint POST/PUT/DELETE tiene un schema de request (`BlockIPRequest`, `ManualDecisionRequest`, etc.) que valida tipos, rangos y formatos antes de llegar al servicio. Hay 17 archivos de schemas incluyendo `dhcp.py` y `cli.py`.

### 14. ¿Cómo funciona la auditoría de acciones?

Toda acción destructiva (block/unblock IP, toggle rule, remediation) crea un `ActionLog` en SQLite con: `action_type`, `target_ip`, `details` (JSON), `comment`, `timestamp`. El widget `ActionLog` y la página de historial consumen este registro.

### 15. ¿Cómo se genera el reporte con IA?

`AIService` usa Claude (`claude-sonnet-4-20250514`) con **function calling**. Flujo:
1. El usuario pide un reporte con audiencia (executive/technical/operational)
2. Claude decide qué datos necesita e invoca tools (5 disponibles: alertas Wazuh, conexiones MikroTik, reglas firewall, etc.)
3. Máximo 10 iteraciones de tool-use
4. Claude genera HTML → TipTap lo renderiza → WeasyPrint lo convierte a PDF

`AIService` NO es singleton — se crea instancia por llamada.

---

## Parte 2: Comunicación entre Herramientas (15 preguntas)

### 16. ¿Cómo se conecta NetShield a MikroTik?

Via **RouterOS API** (puerto 8728, protocolo plaintext). Librería: `routeros-api` (síncrona). Cada operación pasa por `_api_call()` que: adquiere `asyncio.Lock`, ejecuta en `run_in_executor`, maneja reconexión si la conexión se cae. Es el único punto de entrada para todas las operaciones MikroTik.

### 17. ¿Cómo se conecta NetShield a Wazuh?

Via **REST API HTTPS** (puerto 55000). Librería: `httpx` (async). Autenticación: Basic Auth para obtener JWT, luego Bearer token. El token se renueva automáticamente en respuestas 401. `verify=False` porque el certificado es autofirmado (riesgo documentado de laboratorio).

### 18. ¿Cómo se conecta NetShield a CrowdSec?

Via **Local API (LAPI)** HTTP (puerto 8080). Librería: `httpx`. Autenticación: header `X-Api-Key` con API key de bouncer. Endpoints principales: `/v1/decisions` (bans), `/v1/alerts` (detecciones), `/v1/bouncers` (agentes).

### 19. ¿Cómo se conecta NetShield a Suricata?

**Dos canales:**
1. **Unix socket** (`/var/run/suricata/suricata.socket`) → Control del motor: stats, reload-rules, running-mode. Protocolo JSON de Suricata (una línea por mensaje).
2. **Via Wazuh API** → Alertas y NSM: Suricata escribe `eve.json`, el agente Wazuh lo recolecta, Wazuh Manager lo indexa. NetShield consulta con filtro `rule.groups=suricata`.

### 20. ¿Cómo se conecta NetShield a GLPI?

Via **REST API HTTP** (puerto 80). Librería: `httpx`. Autenticación de doble token: `App-Token` (header fijo) + `Session-Token` (obtenido con `User-Token` via `initSession`). El `GLPICollector` sincroniza assets cada 5 minutos en background via `asyncio.to_thread`.

### 21. ¿Cómo fluyen las alertas de Suricata hasta el dashboard?

```
Tráfico → Suricata → eve.json → Wazuh Agent → Wazuh Manager → NetShield API → Frontend
```

Suricata analiza tráfico y escribe alertas/flujos en `eve.json`. El agente Wazuh (instalado en el mismo host) lee ese archivo y lo envía al Manager. NetShield consulta Wazuh API con filtro `rule.groups=suricata` y normaliza los datos.

### 22. ¿Cómo funciona la sincronización CrowdSec↔MikroTik?

El endpoint `GET /api/crowdsec/sync/status` compara las IPs baneadas en CrowdSec (`/v1/decisions`) con la address list `Blacklist_Automatica` de MikroTik. Muestra: IPs solo en CrowdSec, solo en MikroTik, y sincronizadas. `POST /api/crowdsec/sync/apply` pushea las diferencias.

### 23. ¿Cómo funciona el circuito de auto-response de Suricata?

Cuando se activa (manual o automático):
1. Verifica que el circuito esté habilitado en la configuración
2. Si `crowdsec_ban=true` → llama a `CrowdSecService.add_decision()` para banear la IP
3. Si `mikrotik_block=true` → llama a `MikroTikService.block_ip()` para agregar a la blacklist
4. Registra en historial de autoresponse
5. Crea `ActionLog` para auditoría

### 24. ¿Cómo funciona la Full Remediation de CrowdSec?

El endpoint `POST /api/crowdsec/remediation/full` bloquea una IP en **ambos sistemas simultáneamente**: agrega decisión en CrowdSec LAPI + agrega a `Blacklist_Automatica` en MikroTik. Si uno falla, el otro sigue — reporta resultado parcial.

### 25. ¿Cómo funciona el IP Context unificado?

El endpoint `GET /api/crowdsec/context/ip/{ip}` consulta **3 sistemas en paralelo** (`asyncio.gather`):
- CrowdSec: decisions + alerts + CTI score
- MikroTik: presencia en ARP + presencia en blacklist
- Wazuh: alertas recientes con esa src_ip + agentes afectados

Devuelve un objeto unificado con toda la información de esa IP.

### 26. ¿Cómo funciona el cruce de alertas Suricata×GLPI?

El endpoint `GET /api/widgets/suricata-asset-correlation` cruza alertas Suricata (via Wazuh) con inventario GLPI. Para cada alerta donde `dst_ip` corresponde a un activo GLPI registrado, devuelve: nombre del activo, propietario, ubicación, severidad del ataque.

### 27. ¿Cómo se enriquecen las alertas con GeoIP?

Automáticamente en `WazuhService.get_alerts()` y `CrowdSecService.get_decisions()`. Después de obtener los datos, se filtran IPs externas (no `192.168.*`, `10.*`), se hace `GeoIPService.lookup_bulk()` contra las .mmdb locales, y se agrega el campo `geo` con: country, city, lat/lon, is_datacenter, is_tor.

### 28. ¿Cómo se comunica el frontend con el backend en tiempo real?

**7 WebSockets** definidos en `main.py`:
- `/ws/traffic` — tráfico MikroTik en tiempo real
- `/ws/alerts` — alertas Wazuh
- `/ws/crowdsec` — decisiones CrowdSec stream
- `/ws/suricata` — alertas Suricata
- `/ws/connections` — conexiones activas MikroTik
- `/ws/portal` — sesiones hotspot
- `/ws/dhcp` — eventos DHCP

Hook genérico `useWebSocket(url)` con reconexión automática y backoff.

### 29. ¿Cómo funciona la cuarentena de un activo GLPI?

El endpoint `POST /api/glpi/quarantine` hace:
1. Busca el activo en GLPI por ID
2. Obtiene su IP del inventario
3. Bloquea la IP en MikroTik (firewall drop)
4. Actualiza el estado del activo en GLPI a "en cuarentena"
5. Crea un ticket GLPI automático documentando la acción
6. Registra en `QuarantineLog` y `ActionLog`

### 30. ¿Cómo se correlacionan las amenazas confirmadas?

El endpoint `GET /api/widgets/confirmed-threats` cruza IPs de 3 fuentes en paralelo:
- Suricata: IPs con alertas IDS
- CrowdSec: IPs con decisiones activas
- Wazuh: IPs con alertas nivel ≥7

Si una IP aparece en ≥2 fuentes, es "confirmada". Se ordena por nivel de confirmación (3 fuentes > 2 fuentes).

---

## Parte 3: Comprensión General (20 preguntas)

### 31. ¿Qué rol cumple cada herramienta en el stack?

| Herramienta | Rol | Capa | Ve... |
|-------------|-----|------|-------|
| **MikroTik** | Router/Firewall | L2-L4 | Tráfico, ARP, DHCP, reglas |
| **Wazuh** | SIEM | L5-L7 en hosts | Logs, integridad, alertas de host |
| **Suricata** | IDS/IPS/NSM | L3-L7 en red | Firmas, DNS, HTTP, TLS deep inspection |
| **CrowdSec** | Reputation/IPS | Threat Intel | Reputación IP, community data |
| **GLPI** | ITSM/Inventario | Gestión | Activos, tickets, propietarios |

### 32. ¿Qué diferencia a Suricata de Wazuh? ¿No detectan lo mismo?

**No.** Wazuh analiza **logs de host** (brute force SSH, cambios de archivos, login failures). Suricata analiza **tráfico de red** (firmas de exploit, DNS tunneling, TLS anómalos). Son complementarios: Wazuh ve lo que pasa *dentro* del host, Suricata ve lo que pasa *en el cable*.

### 33. ¿Qué diferencia a CrowdSec de Suricata?

Suricata detecta ataques por **firmas** (reglas que matchean patrones en el tráfico). CrowdSec detecta ataques por **comportamiento** (rate limiting, escenarios) y agrega **inteligencia comunitaria** (CTI: "esta IP fue reportada por 200 usuarios globalmente"). Suricata es local, CrowdSec es colaborativo.

### 34. ¿Cómo se estructura el frontend?

- **25 rutas** en `App.tsx` con React Router (incluye `/login` público y `/admin/users` protegido)
- **Layout.tsx**: sidebar (7 grupos) + topbar (5 status dots) + footer con logout
- **services/api.ts**: 18 namespaces API (única fuente HTTP) + interceptores JWT (request inyecta Bearer, response maneja 401)
- **types.ts**: ~1900 líneas de tipos TypeScript (espejo de Pydantic)
- **hooks/**: 42+ custom hooks de datos (incluye `useAuth` y `useUsers`)
- **components/**: organizados por dominio (`security/`, `crowdsec/`, `suricata/`, `inventory/`, `auth/`, `admin/`, etc.)
- **AuthProvider** envuelve toda la app. `ProtectedRoute` bloquea rutas si no hay JWT válido.

### 35. ¿Qué son los 5 status dots del topbar?

Indicadores de conectividad en tiempo real de: MikroTik, Wazuh, CrowdSec, Suricata, GLPI. Cada uno hace polling a su endpoint `/health` y muestra verde (conectado), rojo (desconectado) o amarillo (mock).

### 36. ¿Cómo funciona el proxy de Vite en desarrollo?

`vite.config.ts` redirige automáticamente:
- `/api/*` → `http://localhost:8000` (REST)
- `/ws/*` → `ws://localhost:8000` (WebSocket)

El frontend en `:5173` nunca habla directo a `:8000` — el proxy evita problemas de CORS en desarrollo.

### 37. ¿Qué pasa si una herramienta externa se cae?

Nada se rompe. Cada servicio tiene:
1. **Retry con tenacity** (3 intentos, backoff exponencial)
2. **Mock fallback** si `MOCK_X=true`
3. **`APIResponse.fail()`** si todo falla — el frontend muestra error graceful

Los widgets híbridos usan `Promise.allSettled()` para manejar fallo parcial: si Suricata responde pero Wazuh no, muestra los datos disponibles.

### 38. ¿Cómo funciona el threat level score?

El endpoint `GET /api/widgets/threat-level` calcula un score 0-100:
- Alertas Wazuh críticas (última hora) → peso 40%
- Decisiones CrowdSec activas → peso 30%
- Alertas Suricata severity=1 (última hora) → peso 30%

Cada fuente se normaliza a 0-100 con saturación y se aplica el peso.

### 39. ¿Cómo funciona el lifecycle de un incidente?

El endpoint `GET /api/widgets/incident-lifecycle?ip=X` construye una timeline de 5 pasos:
1. **Detección** — Primera alerta Wazuh para esa IP
2. **Alerta crítica** — Alerta nivel ≥10
3. **Bloqueo** — Decisión CrowdSec o regla MikroTik
4. **Ticket GLPI** — Ticket creado para esa IP
5. **Resolución** — Ticket cerrado

Cada paso muestra status (done/pending), timestamp y fuente.

### 40. ¿Cómo funciona el DHCP management?

20 métodos en `MikroTikService` que operan contra RouterOS API:
- **Servers**: CRUD de servidores DHCP
- **Leases**: listar, crear estáticas, eliminar
- **Pools**: gestión de rangos IP
- **Networks**: configuración de opciones DHCP
- **Rogue alerts**: detección de servidores DHCP no autorizados

La Fase 2 (discovery) cruza leases DHCP con inventario GLPI para detectar dispositivos no registrados.

### 41. ¿Cómo funciona el sistema de phishing?

Dos componentes:
1. **Detección**: alertas Wazuh con reglas de phishing (URLs sospechosas, dominios nuevos)
2. **Sinkhole**: MikroTik DNS estático que redirige dominios maliciosos a una IP nula

Endpoints para: listar detecciones, agregar/quitar sinkholes, obtener stats de dominios bloqueados.

### 42. ¿Cómo funciona el portal cautivo (hotspot)?

16 funciones en `PortalService` que operan contra MikroTik Hotspot API:
- Crear/eliminar usuarios hotspot
- Listar sesiones activas
- Obtener estadísticas en tiempo real (bytes up/down)
- Autenticar usuarios via `AuthProvider`
- Gestionar pools de direcciones

### 43. ¿Cómo funciona el bot de Telegram?

**Bidireccional:**
- **Outbound**: NetShield envía notificaciones al canal (alertas críticas, reportes)
- **Inbound**: usuarios autorizados envían comandos al bot (`/status`, `/block IP`, `/report`)

Usa `python-telegram-bot` ≥20.0 con webhook inbound validado por `TELEGRAM_WEBHOOK_SECRET`. Los chat IDs autorizados se configuran en `TELEGRAM_ADMIN_CHAT_IDS`.

### 44. ¿Qué es el GeoIP enrichment y cómo funciona?

**MaxMind GeoLite2** — bases de datos locales (.mmdb) cargadas en RAM con `TTLCache` (10K entradas, TTL 1h). Para cada IP externa en alertas/decisiones, se busca: país, ciudad, lat/lon, ASN, tipo de red (datacenter, residencial, tor). Sin conexión a internet, sin latencia, sin rate limits.

### 45. ¿Cómo funciona el CLI remoto?

El endpoint `POST /api/cli/execute` ejecuta comandos read-only en MikroTik via API. Tiene un **whitelist de comandos** permitidos (solo `print`, nunca `set`, `add`, `remove`). Sanitiza input para prevenir inyección de comandos. Cada ejecución se registra en `ActionLog`.

### 46. ¿Cómo se manejan las VLANs?

CRUD completo contra MikroTik API (`/interface/vlan`). El widget `hybrid_vlan_health` cruza: VLANs de MikroTik con alertas Wazuh para determinar la "salud" de cada VLAN. Si una VLAN tiene muchas alertas asociadas, se marca como `critical`.

### 47. ¿Cómo funciona el sistema de temas?

6 temas en `config/themes.ts`, gestionados por `useTheme.ts`. Cada tema define variables CSS que sobrescriben los tokens `@theme` de `index.css`. El tema se persiste en `localStorage`. También hay escala de fuente configurable.

### 48. ¿Qué es el `GLPICollector` y por qué existe?

La API de GLPI es lenta (múltiples roundtrips para normalizar datos). El `GLPICollector` corre como **background task** que sincroniza assets cada 5 minutos via `asyncio.to_thread` (porque usa `requests`, que es síncrono). Mantiene un cache parseado en memoria para reads instantáneos desde endpoints.

### 49. ¿Cómo sería el flujo completo de un ataque detectado?

1. **Suricata** detecta exploit en tráfico → escribe alerta en `eve.json`
2. **Wazuh Agent** lee `eve.json` → envía al Manager → indexa
3. **NetShield** consulta Wazuh API → muestra en SuricataAlertsPage
4. **Operador** ve la alerta → click "Auto-Response"
5. **NetShield** banea IP en **CrowdSec** + bloquea en **MikroTik**
6. **GeoIP** enriquece la IP → "Origen: datacenter en Rusia"
7. Si la IP atacada es un activo **GLPI** → muestra propietario y ubicación
8. Operador genera **reporte IA** → Claude analiza los datos → PDF
9. Se envía resumen por **Telegram** al canal de seguridad
10. Se registra todo en **ActionLog** para auditoría

### 50. ¿Cuáles son las limitaciones conocidas del proyecto?

| Limitación | Causa | Impacto |
|-----------|-------|---------|
| Sin rate limiting | No implementado | Endpoints de login vulnerables a brute force |
| `verify=False` en Wazuh | Cert autofirmado de lab | Riesgo de MITM en producción |
| Cuarentena física placeholder | Lab VirtualBox sin switch real | `quarantine_agent_port` no opera en VLANs |
| Sin tests automatizados | Pendiente | Riesgo de regresiones |
| SQLite single-writer | Diseño de lab | Bottleneck en alta concurrencia |
| Suricata default mock | Sin hardware dedicado | NSM no opera sin instalación real |
| Wazuh Vulnerabilities no consumido | No implementado en NetShield | Capacidad core de Wazuh desaprovechada |
| WebSockets sin JWT | Middleware excluye `/ws/*` | Conexión WS no valida token (pendiente) |
| Sin RBAC | Solo rol admin implementado | Todos los usuarios tienen acceso total |

---

## Parte 4: Bonus — Preguntas Avanzadas (25 preguntas)

### 51. ¿Cómo decide el frontend cuándo hacer polling vs WebSocket?

**WebSocket** se usa para datos que cambian cada pocos segundos y necesitan push del server: tráfico MikroTik, alertas en vivo, conexiones activas. **Polling** (via `refetchInterval` de TanStack Query) se usa para datos que cambian cada minutos: inventario GLPI, métricas CrowdSec, health checks.

Regla: si el dato necesita actualización <10s → WebSocket. Si >30s → polling REST.

### 52. ¿Qué pasa si el frontend pierde la conexión WebSocket?

El hook `useWebSocket` implementa **reconexión automática con backoff exponencial**. Si el WS se cierra inesperadamente, intenta reconectar con delays crecientes (1s, 2s, 4s, 8s...). El frontend muestra los últimos datos cacheados mientras reconecta — no pantalla vacía.

### 53. ¿Cómo funciona el `_api_call()` de MikroTik internamente?

Es el método más crítico del backend:
1. Adquiere `asyncio.Lock()` (solo 1 operación MikroTik a la vez)
2. Verifica si la conexión está viva, reconecta si no
3. Ejecuta la llamada síncrona de `routeros-api` dentro de `loop.run_in_executor(None, fn)`
4. Parsea la respuesta del protocolo RouterOS
5. Libera el lock

Si falla → `tenacity` reintenta 3 veces con backoff.

### 54. ¿Por qué `services/api.ts` tiene 18 namespaces y no 18 archivos?

Por **centralización**: un solo archivo con `axios.create()` configurado una vez (baseURL, interceptors, headers). Los namespaces (`mikrotikApi`, `wazuhApi`, `crowdsecApi`, etc.) agrupan lógicamente los endpoints sin duplicar configuración. Si se necesita cambiar el baseURL o agregar un interceptor de auth, se hace en un solo lugar.

### 55. ¿Cómo se maneja el CORS?

En desarrollo: **no se necesita** — el proxy de Vite redirige todo a `:8000`. En producción: `main.py` configura `CORSMiddleware` con los orígenes de `CORS_ORIGINS` (variable de entorno, JSON array). El default es `["http://localhost:5173", "http://localhost:3000"]`.

### 56. ¿Cuál es la diferencia entre `mock_data.py` y `mock_service.py`?

- **`mock_data.py`** (~152KB): Datos **estáticos**. Funciones puras que devuelven siempre lo mismo (seed=42). Alertas, agentes, interfaces, etc.
- **`mock_service.py`**: Estado **mutable en memoria**. Facade para operaciones CRUD: agregar/eliminar decisiones CrowdSec, crear tickets GLPI, etc. Los datos persisten durante la sesión del servidor.

### 57. ¿Cómo sabe el frontend si está en modo mock?

Polling cada 30s a `GET /api/system/mock-status`. La respuesta incluye qué servicios están en mock. El componente `MockModeBadge` en el topbar muestra:
- **"MOCK ALL"** si todos están simulados
- **"MOCK: MIKROTIK · WAZUH"** si solo algunos
- Nada si todo es real

### 58. ¿Qué es el `Promise.allSettled()` y por qué se usa en widgets híbridos?

A diferencia de `Promise.all()` (que falla si UNA promesa falla), `allSettled()` espera a que TODAS se resuelvan o rechacen. En widgets que cruzan 3+ fuentes (ej: `useDefenseLayers` consulta Wazuh + MikroTik + CrowdSec + Suricata), si CrowdSec está caído, el widget sigue mostrando los datos de las otras 3 fuentes. El campo `partial: true` indica fallo parcial.

### 59. ¿Cómo funciona el ActionLog técnicamente?

Modelo SQLAlchemy con campos:
```python
id: int (PK autoincrement)
action_type: str        # "block", "unblock", "quarantine", "suricata_reload_rules"...
target_ip: str | None   # IP afectada (si aplica)
details: str            # JSON stringificado con datos específicos
comment: str | None     # Comentario del operador
timestamp: datetime     # Auto-generado
```
Cada endpoint destructivo crea un `ActionLog`, hace `db.add()` + `db.flush()`. No usa commit explícito — la sesión async de SQLAlchemy autocommitea.

### 60. ¿Qué pasa si MikroTik se desconecta a mitad de una operación?

El `_api_call()` captura la excepción, marca la conexión como inválida, y en el siguiente intento (tenacity retry) reconecta automáticamente. Si los 3 reintentos fallan, el endpoint devuelve `APIResponse.fail()`. El status dot del topbar se pone rojo.

### 61. ¿Cómo funciona la generación de PDF?

1. Claude genera HTML con el contenido del reporte
2. `PDFService` usa **WeasyPrint** (CSS→PDF engine)
3. Se aplica la plantilla `backend/templates/report_base.html` (estilos, header, footer)
4. WeasyPrint es CPU-bound → se ejecuta en `run_in_executor` para no bloquear el event loop
5. El PDF se devuelve como bytes para descarga

### 62. ¿Qué son las "entidades coherentes" del mock?

Los mock data están diseñados para que las IPs sean consistentes entre servicios:
- `192.168.88.10` → ARP dice "lubuntu_desk_1", Wazuh dice agente 004, GLPI dice "PC-Lab-01"
- `203.0.113.45` → atacante brute-force que aparece en alertas Wazuh Y decisiones CrowdSec

Esto permite que los widgets de correlación funcionen correctamente en modo mock.

### 63. ¿Cómo funciona la búsqueda ARP en MikroTik?

El endpoint `GET /api/mikrotik/arp/search?ip=X&mac=Y` consulta la tabla ARP completa (`/ip/arp`) y filtra client-side. No hay query directo en RouterOS API para buscar por MAC — se descarga toda la tabla y se filtra en Python.

### 64. ¿Por qué Suricata necesita un host dedicado?

Suricata hace **deep packet inspection** — necesita ver todo el tráfico de red en modo mirror/span. No puede correr en el mismo host que MikroTik (CHR virtualizado). El host Suricata (`192.168.88.50`) recibe una copia del tráfico via port mirroring en el switch/router.

### 65. ¿Cómo funciona el CrowdSec CTI lookup?

El método `get_cti_score(ip)` consulta la API pública de CrowdSec: `https://cti.api.crowdsec.net/v2/smoke/{ip}`. No requiere autenticación. Devuelve: community score (0-100), si es atacante conocido, cuántos usuarios lo reportaron, si es background noise, y clasificaciones (scanner, bruteforcer, etc.).

### 66. ¿Cómo se protege el endpoint CLI contra command injection?

1. **Whitelist de comandos**: solo comandos `print` están permitidos (ej: `/ip/route/print`)
2. **Nunca se ejecutan** `set`, `add`, `remove`, `enable`, `disable`
3. El input se sanitiza antes de enviarlo a RouterOS API
4. Cada ejecución se registra en `ActionLog`

### 67. ¿Qué es el `GLPICollector` y en qué se diferencia de `GLPIService`?

- **`GLPIService`**: consultas on-demand (cuando un endpoint la necesita)
- **`GLPICollector`**: tarea de fondo que corre cada 5 minutos, descarga TODOS los assets y los cachea en memoria

El collector existe porque GLPI es lento (múltiples roundtrips HTTP por asset). Con el cache, los endpoints de health/correlation leen datos locales en microsegundos.

### 68. ¿Cómo se manejan los temas del frontend técnicamente?

Cada tema define un conjunto de variables CSS (`--color-primary`, `--color-surface`, etc.) que sobrescriben los tokens `@theme` de `index.css`. `useTheme.ts` aplica el tema con `document.documentElement.setAttribute('data-theme', nombre)`. El CSS tiene selectores `[data-theme="dark"] { ... }` para cada tema.

### 69. ¿Por qué hay 7 grupos en el sidebar y exactamente 20 items?

Los 7 grupos organizan por dominio funcional: Monitoreo, Seguridad, Red, Infraestructura, Inteligencia, Reportes, Configuración. 20 items es el máximo definido por diseño para mantener la sidebar navegable sin scroll excesivo. Array `navGroups` en `Layout.tsx`.

### 70. ¿Cómo funciona el ViewBuilder con drag-and-drop?

Usa `@dnd-kit` (3 paquetes). El catálogo de widgets se muestra en 4 tabs. El usuario arrastra widgets al grid. Cada widget se guarda como: `{type, position: {x, y}, size: "small|medium|large|full", config: {...}}`. Al guardar, se serializa a JSON y se persiste en `CustomView.widgets`.

### 71. ¿Cuál es la superficie de ataque más crítica del proyecto?

1. **CLI remoto** (`/api/cli/execute`) — ejecución de comandos en el router
2. **Firewall block/unblock** — modificación de reglas activas
3. **CrowdSec decisions** — agregar/eliminar bans
4. **Active Response Wazuh** — ejecutar comandos en agentes

Todos requieren `ConfirmModal` en el frontend. Desde la v2.7, **todos los endpoints HTTP requieren JWT válido** (`JWTAuthMiddleware` global), por lo que un atacante necesita credenciales válidas del dashboard para ejecutar cualquiera de estas operaciones. Sin embargo, falta rate limiting en el endpoint de login y RBAC para diferenciar permisos.

### 72. ¿Cómo se despliega en producción?

Actualmente no hay Docker. El plan documentado es:
- Backend: `Dockerfile` multi-stage con Python 3.12 + `requirements.txt`
- Frontend: build estático con `npm run build` + Nginx/Caddy como reverse proxy
- Proxy: `/api/*` y `/ws/*` → backend `:8000`, el resto → archivos estáticos
- DB: migrar a PostgreSQL con `asyncpg`

### 73. ¿Cómo difiere el modo real del modo mock para un operador?

Visualmenmte: el badge "MOCK" en el topbar. Funcionalmente:
- **Mock**: datos estáticos con seed fija, CRUD en memoria (se resetea al reiniciar), sin latencia real
- **Real**: datos del router/SIEM en tiempo real, acciones reales (bloquear IP realmente bloquea tráfico), latencia de red

Los widgets se ven idénticos — el sistema de mock está diseñado para que la experiencia sea indistinguible.

### 74. ¿Qué pasa si se quiere agregar una herramienta nueva al stack?

Seguir los 6 pasos de `CONTEXT.md`:
1. Crear `services/mi_service.py` con patrón singleton
2. Agregar mock flag en `config.py` (`mock_mi`, `should_mock_mi`)
3. Agregar datos mock en `mock_data.py`
4. Agregar mock guard en cada método público
5. Inicializar/cleanup en `main.py` lifespan
6. Agregar variables a `.env.example`

Después: crear router, schemas, hooks frontend, y opcionalmente widgets.

### 75. ¿Cuántos endpoints tiene el backend en total?

~185 endpoints distribuidos en 17 routers:

| Router | Endpoints | Dominio |
|--------|-----------|--------|
| auth | ~7 | Autenticación JWT + CRUD usuarios |
| mikrotik | ~12 | Router/Firewall |
| wazuh | ~9 | SIEM |
| crowdsec | ~16 | Reputation/IPS |
| suricata | ~24 | IDS/IPS/NSM |
| glpi | ~20 | Inventario/Tickets |
| dhcp | ~29 | Administración DHCP |
| views | ~6 + catálogo | Vistas personalizadas |
| widgets | ~8 | Widgets agregados |
| network | ~8 | Labels/Groups |
| portal | ~10 | Hotspot |
| reports | ~8 | Reportes IA |
| phishing | ~6 | Detección phishing |
| geoip | ~5 | Geolocalización |
| vlans | ~6 | VLANs |
| cli | ~2 | CLI remoto |
| security | ~5 | Config seguridad |

### 76. ¿Qué estructura tiene la base de datos actualmente? ¿SQLite es la única? ¿Quién la usa?

**Sí, SQLite es la única base de datos.** El archivo se llama `netshield.db` y se conecta vía `aiosqlite` (driver async). La URL de conexión por defecto es `sqlite+aiosqlite:///./netshield.db` en `config.py`. El código en `database.py` está preparado para migrar a PostgreSQL cambiando solo esa URL.

#### Estructura de Tablas (11 modelos, 9 archivos):
- `users` (`User`): Operadores del dashboard (username, email, hashed_password, is_active). Creado por `auth_service.ensure_default_admin()` al arrancar.
- `action_logs` (`ActionLog`): Auditoría de acciones de seguridad (block/unblock/report).
- `custom_views` (`CustomView`): Vistas de dashboard personalizadas con widgets JSON.
- `ip_groups` y `ip_group_members` (`IPGroup`, `IPGroupMember`): Agrupación lógica de IPs por criterio y membresía IP↔Grupo (FK a `ip_groups`).
- `ip_labels` (`IPLabel`): Etiquetas humanas para IPs.
- `portal_user_registry` (`PortalUserRegistry`): Metadatos de usuarios hotspot creados desde el dashboard.
- `quarantine_logs` (`QuarantineLog`): Auditoría de cuarentena de assets GLPI.
- `sinkhole_entries` (`SinkholeEntry`): Dominios enviados a DNS sinkhole en MikroTik.
- `telegram_report_configs`, `telegram_message_logs` y `telegram_pending_messages`: Configuración de reportes por Telegram, logs de mensajes y cola de mensajes pendientes.

#### ¿Quién la usa?
La dependencia `get_db()` se inyecta en **14 routers**: `auth.py`, `network.py`, `mikrotik.py`, `views.py`, `reports.py`, `portal.py`, `glpi.py`, `security.py`, `wazuh.py`, `crowdsec.py`, `suricata.py`, `dhcp.py`, `phishing.py` y `geoip.py` (además del servicio `geoip_service.py`). Almacena datos puramente locales de auditoría, labels, usuarios del dashboard y configuraciones.

---

## Parte 5: Sistema de Autenticación JWT (12 preguntas)

### 77. ¿Cómo funciona la autenticación del dashboard?

**JWT stateless con middleware global.** El flujo es:

1. El usuario envía `POST /api/auth/login` con `username` + `password`
2. `AuthService` busca el usuario en SQLite, verifica la contraseña con bcrypt
3. Si es válido, genera un JWT firmado con `JWT_SECRET_KEY` (algoritmo HS256) con expiración configurable
4. El frontend guarda el token en `localStorage['netshield_token']`
5. Axios interceptor inyecta `Authorization: Bearer <token>` en cada request HTTP
6. `JWTAuthMiddleware` en `main.py` valida el token antes de que llegue a cualquier router
7. Si el token expira o es inválido → 401 → interceptor Axios limpia localStorage → redirige a `/login`

### 78. ¿Por qué un middleware HTTP global y no un `Depends()` en cada router?

Por **cobertura total sin error humano**. Con `Depends(get_current_user)` habría que agregar la dependencia a cada uno de los 17 routers (~185 endpoints). Si un desarrollador olvida ponerlo en un endpoint nuevo, queda expuesto sin autenticación.

El middleware `JWTAuthMiddleware` (clase `BaseHTTPMiddleware` de Starlette) intercepta **todas** las requests HTTP antes del routing. Solo las rutas listadas en `_PUBLIC_PATHS` (login, logout, health, docs) y los paths que empiezan con `/ws` pasan sin validación.

### 79. ¿Por qué JWT y no sesiones con cookies?

Por tres razones:

1. **Stateless**: el backend no necesita almacenar sesiones. Cada token se autovalida con la firma HMAC. Esto es coherente con la arquitectura async del backend — no hay tabla `sessions` ni Redis.
2. **Escalabilidad**: si el backend crece a múltiples instancias, no necesitan compartir estado de sesiones.
3. **Simplicidad con Axios**: agregar `Authorization: Bearer` en un interceptor es trivial. Las cookies requieren manejo de `SameSite`, `Secure`, `HttpOnly`, CSRF tokens, y configuración específica de CORS.

Desventaja: no se puede "invalidar" un JWT individual server-side (habría que agregar una blacklist en Redis). Por ahora, el logout solo limpia el token del cliente.

### 80. ¿Por qué bcrypt y no argon2?

**Compatibilidad y simplicidad.** `passlib[bcrypt]` es el estándar de facto en el ecosistema Python (FastAPI docs, Django, Flask-Security). Bcrypt tiene 25+ años de auditoría criptográfica. `argon2id` es técnicamente superior (resistente a GPU attacks), pero agrega una dependencia C compilada (`argon2-cffi`) que puede dar problemas en Docker multi-platform. Para un dashboard de laboratorio, bcrypt es más que suficiente.

### 81. ¿Qué pasa si `JWT_SECRET_KEY` no está configurado?

**El backend no arranca.** La validación está en `config.py` con un `@model_validator(mode='after')` de Pydantic. Si `JWT_SECRET_KEY` está vacío o tiene menos de 32 caracteres, lanza `ValueError` en el arranque — antes de que FastAPI registre cualquier ruta. Esto previene que alguien despliegue sin configurar la clave de firma.

### 82. ¿Cómo funciona el interceptor Axios en el frontend?

Dos interceptores registrados en la instancia `api` de Axios en `services/api.ts`:

1. **Request interceptor**: antes de cada request, lee `localStorage.getItem('netshield_token')`. Si existe, agrega el header `Authorization: Bearer <token>`. Si no existe, el request sale sin header (solo funcionará si la ruta es pública).

2. **Response interceptor**: si la respuesta es 401 Y no es el endpoint de login, limpia el token de localStorage, setea `window.location.href = '/login'`, y rechaza la promesa. Esto garantiza que cualquier token expirado lleve al login automáticamente, sin importar en qué página esté el usuario.

### 83. ¿Por qué `useAuth` no usa TanStack Query?

Porque TanStack Query hace **refetch automático** en window focus, tab switch y reconexiones de red. Para el estado de autenticación global, esto provocaría validaciones de sesión innecesarias cada vez que el usuario vuelve a la pestaña. `useAuth` usa `useState` + `useEffect` manual: valida una sola vez al montar y solo cambia en login/logout explícito.

Los hooks CRUD como `useUsers` sí usan TanStack Query (con `queryKey: ['auth-users']`) porque ahí sí queremos cache e invalidación automática.

### 84. ¿Cómo funciona el `ProtectedRoute`?

Es un componente wrapper que envuelve todas las rutas protegidas en `App.tsx`:

```tsx
<Route element={<ProtectedRoute />}>
  <Route path="/" element={<Layout />}>
    {/* ... todas las rutas protegidas ... */}
  </Route>
</Route>
<Route path="/login" element={<LoginPage />} />  {/* fuera del guard */}
```

Internamente, `ProtectedRoute` lee el estado de `useAuthContext()`. Si `isAuthenticated` es false y no está `loading`, redirige a `/login` con `<Navigate>`. Si está cargando (validando token al montar), muestra un spinner. Si está autenticado, renderiza `<Outlet />`.

### 85. ¿Qué pasa con el usuario `admin/admin` por defecto?

La función `ensure_default_admin()` se ejecuta en el `lifespan` de FastAPI (startup). Verifica si la tabla `users` está vacía. Si no hay ningún usuario, crea uno con username `admin`, password `admin` (hasheada con bcrypt), email `admin@netshield.local` y nombre `Administrador`. Si ya existe al menos un usuario, no hace nada.

> **Importante para producción:** cambiar la contraseña del admin desde `/admin/users` o via `PUT /api/auth/users/1` inmediatamente después del primer despliegue.

### 86. ¿Por qué los WebSockets están exentos del middleware JWT?

Porque el protocolo WebSocket inicia con un HTTP Upgrade handshake donde **no se pueden enviar headers `Authorization` arbitrarios** desde el browser. El estándar WebSocket del browser solo permite enviar cookies o query params, no headers custom.

La solución pendiente es validar el token como query parameter: `/ws/traffic?token=XXX`. En el middleware, los paths que empiezan con `/ws` pasan sin validación para mantener compatibilidad mientras se implementa.

### 87. ¿Cómo se gestiona la gestión de usuarios del dashboard?

Desde la UI: icono ⚙️ en el topbar → SettingsDrawer → botón "Gestionar usuarios" → `/admin/users`.

La página `UsersManagementPage.tsx` muestra una tabla con: username, email, nombre, estado (activo/inactivo), fecha de creación. Acciones: crear usuario (modal), editar, toggle activación, eliminar (con confirmación). El username es inmutable después de la creación. No se puede eliminar al propio usuario logueado.

Endpoints del backend: `GET/POST /api/auth/users`, `PUT/DELETE /api/auth/users/:id`.

### 88. ¿Qué archivos se crearon y modificaron para implementar el login?

**Archivos nuevos (12):**

| Archivo | Propósito |
|---------|----------|
| `backend/models/user.py` | Modelo SQLAlchemy: tabla `users` |
| `backend/schemas/auth.py` | Schemas Pydantic: `LoginRequest`, `TokenResponse`, `UserCreate`, `UserUpdate` |
| `backend/services/auth_service.py` | Singleton: JWT + bcrypt + CRUD usuarios |
| `backend/routers/auth.py` | 7 endpoints `/api/auth/*` |
| `frontend/src/hooks/useAuth.ts` | Estado de autenticación global (login/logout/validate) |
| `frontend/src/hooks/useUsers.ts` | CRUD de usuarios con TanStack Query |
| `frontend/src/components/auth/AuthContext.tsx` | React Context + Provider |
| `frontend/src/components/auth/ProtectedRoute.tsx` | Guard de rutas protegidas |
| `frontend/src/components/auth/LoginPage.tsx` | Pantalla de login glassmorphism |
| `frontend/src/components/admin/UsersManagementPage.tsx` | Panel CRUD de usuarios |
| `frontend/src/components/admin/UserFormModal.tsx` | Modal crear/editar usuario |

**Archivos modificados (11):**

| Archivo | Cambio |
|---------|--------|
| `backend/requirements.txt` | +`python-jose[cryptography]`, +`passlib[bcrypt]` |
| `backend/config.py` | `JWT_SECRET_KEY` + `JWT_EXPIRE_MINUTES` + validación estricta |
| `backend/main.py` | `JWTAuthMiddleware` global + registro router auth + `ensure_default_admin` en lifespan |
| `backend/models/__init__.py` | Registrar `User` |
| `backend/schemas/__init__.py` | Exportar schemas auth |
| `backend/.env` / `.env.example` | `JWT_SECRET_KEY` + `JWT_EXPIRE_MINUTES` |
| `frontend/src/types.ts` | Tipos auth: `LoginRequest`, `TokenResponse`, `AuthUser`, etc. |
| `frontend/src/services/api.ts` | Interceptores JWT + namespace `authApi` |
| `frontend/src/App.tsx` | `AuthProvider` + `ProtectedRoute` + rutas `/login` y `/admin/users` |
| `frontend/src/components/Layout.tsx` | Footer sidebar con user display + logout |
| `frontend/src/components/common/SettingsDrawer.tsx` | Sección "Administración" con link a gestión de usuarios |
