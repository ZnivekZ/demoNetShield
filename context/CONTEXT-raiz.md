# NetShield Dashboard

## ¿Qué es este proyecto?

NetShield Dashboard es una plataforma web de monitoreo y gestión de seguridad de red para entornos de laboratorio. Integra un router MikroTik CHR (API RouterOS), un SIEM Wazuh (API REST), un motor IDS/IPS/NSM Suricata, un motor de reputación CrowdSec, un ITSM GLPI, inteligencia GeoIP (MaxMind GeoLite2), un bot bidireccional de Telegram, y generación de reportes con IA (Claude de Anthropic) — todo en un único panel de control con 53 widgets configurables y 6 temas visuales.

**Fase actual:** Laboratorio de pruebas.
**Objetivo futuro:** Escalar a entornos reales soportando picos de 1000 usuarios concurrentes sin reescribir la arquitectura.

---

## Stack tecnológico real

### Backend (Python 3.12+)

| Paquete | Versión | Propósito |
|---------|---------|-----------|
| FastAPI | 0.115.6 | Framework web async |
| Uvicorn | 0.34.0 | Servidor ASGI (incluye `websockets` y `httptools` via `[standard]`) |
| Pydantic | 2.10.4 | Validación de datos |
| pydantic-settings | 2.7.1 | Configuración desde `.env` |
| SQLAlchemy | 2.0.36 | ORM async (con extra `[asyncio]`) |
| aiosqlite | 0.20.0 | Driver async para SQLite |
| routeros-api | 0.17.0 | Cliente API MikroTik (síncrono, ejecutado en `run_in_executor`) |
| httpx | 0.28.1 | Cliente HTTP async para Wazuh, CrowdSec, GLPI |
| anthropic | 0.42.0 | SDK de Claude para reportes con function calling |
| weasyprint | 63.1 | Generación de PDF |
| Jinja2 | 3.1.5 | Plantillas HTML para PDF |
| structlog | 24.4.0 | Logging estructurado (console en dev, JSON en prod) |
| tenacity | 9.0.0 | Reintentos con backoff exponencial |
| geoip2 | 4.8.1 | Lectura de bases de datos MaxMind GeoLite2 (.mmdb) |
| cachetools | 5.5.0 | TTLCache para GeoIP lookups (10K entradas, TTL 1h) |
| python-telegram-bot | ≥20.0 | Bot de Telegram bidireccional |
| apscheduler | ≥3.10.0 | Scheduler para reportes automáticos vía Telegram |
| redis | 5.2.1 | Cache (opcional, no implementado aún) |
| python-dotenv | 1.0.1 | Lectura de archivos `.env` |
| aiofiles | 24.1.0 | I/O de archivos async |
| websockets | 14.1 | Protocolo WebSocket (incluido via uvicorn[standard]) |
| python-multipart | 0.0.20 | Upload de archivos |
| orjson | 3.10.13 | Serialización JSON rápida |
| requests | (transitiva) | Usado por `glpi_collector.py` para sync HTTP via `asyncio.to_thread` |

### Frontend

| Paquete | Versión | Propósito |
|---------|---------|-----------|
| React | 19.2.4 | UI framework |
| Vite | 8.0.1 | Bundler y dev server |
| TypeScript | ~5.9.3 | Tipado estático |
| TailwindCSS | 4.2.2 | Estilos (vía plugin Vite `@tailwindcss/vite`) |
| TanStack Query | 5.96.0 | Fetching, cache y sincronización de datos |
| Recharts | 3.8.1 | Gráficos de tráfico, timelines y charts |
| TipTap | 3.22.0 | Editor de texto enriquecido para reportes (7 paquetes `@tiptap/*`) |
| React Router DOM | 7.13.2 | Enrutamiento SPA |
| Axios | 1.14.0 | Cliente HTTP centralizado |
| Lucide React | 1.7.0 | Iconografía |
| @dnd-kit/core | 6.3.1 | Drag and drop (ViewBuilder) |
| @dnd-kit/sortable | 10.0.0 | Reordenamiento de widgets |
| @dnd-kit/utilities | 3.2.2 | Utilidades DnD |
| d3-geo | 3.1.1 | Proyecciones cartográficas (WorldThreatMap) |
| topojson-client | 3.1.0 | Datos geográficos (WorldThreatMap) |
| world-atlas | 2.0.2 | Atlas mundial TopoJSON (WorldThreatMap) |
| date-fns | 4.1.0 | Formateo de fechas |
| clsx | 2.1.1 | Composición de clases CSS |
| html5-qrcode | 2.3.8 | Scanner QR (inventario GLPI) |
| prop-types | 15.8.1 | Tipos de props (Recharts dep) |

---

## Infraestructura del laboratorio

| Servicio | IP / URL | Puerto | Protocolo | Notas |
|----------|----------|--------|-----------|-------|
| MikroTik CHR | 192.168.100.118 | 8728 | RouterOS API (plaintext) | Solo lab — sin SSL |
| Wazuh Manager | 100.90.106.121 | 55000 | HTTPS (cert autofirmado) | `verify=False` en lab |
| CrowdSec LAPI | localhost | 8080 | HTTP | API key de bouncer |
| Suricata | 192.168.88.50 | Unix socket | Socket + EVE → Wazuh | Alertas indexadas vía Wazuh |
| GLPI ITSM | glpi.facultad.local | 80 | HTTP REST API | Doble token (App + Session) |
| GeoLite2 (MaxMind) | Local | — | Archivos .mmdb en RAM | Sin conexión externa |
| Telegram Bot API | api.telegram.org | 443 | HTTPS | Webhook inbound + API outbound |
| Anthropic Claude | api.anthropic.com | 443 | HTTPS | Function calling, modelo `claude-sonnet-4-20250514` |
| NetShield Backend | localhost | 8000 | HTTP + WS | FastAPI + Uvicorn |
| NetShield Frontend | localhost | 5173 | HTTP | Vite dev server |
| Redis | localhost | 6379 | TCP | Opcional, no implementado |

- **Acceso remoto:** Tailscale (red 100.x.x.x con subnet routing)
- **Subred de hosts:** 192.168.88.0/24 (Lubuntu con agentes Wazuh en .10 y .11)

---

## Cómo correr el proyecto

### Backend
```bash
# Desde la raíz del proyecto (el venv se crea en la raíz, no en backend/)
cd netShield2

# Crear entorno virtual (solo la primera vez)
python -m venv .venv
# O con uv (si está instalado): ~/.local/bin/uv venv
source .venv/bin/activate

# Instalar dependencias
pip install -r backend/requirements.txt
# O con uv: ~/.local/bin/uv pip install -r backend/requirements.txt

# Configurar variables de entorno
cp backend/.env.example backend/.env
nano backend/.env  # Editar con credenciales reales

# Ejecutar (dos opciones):
# 1. Con venv activado:
cd backend && python main.py

# 2. Sin activar venv:
cd backend && MOCK_ALL=true ../.venv/bin/python main.py

# → http://localhost:8000
# → Swagger UI: http://localhost:8000/docs (solo en development)
```

### Frontend
```bash
cd frontend
npm install
npm run dev
# → http://localhost:5173 (proxy automático a backend en :8000)
```

### Nota sobre proxy (vite.config.ts)
El proxy de Vite redirige automáticamente:
- `/api/*` → `http://localhost:8000`
- `/ws/*` → `ws://localhost:8000`

No se necesita configurar CORS manualmente para desarrollo local.

---

## Variables de entorno

Todas las variables están en `backend/.env.example`. Agrupadas por servicio:

### MikroTik CHR
| Variable | Default | Descripción |
|----------|---------|-------------|
| `MIKROTIK_HOST` | `192.168.100.118` | IP del MikroTik CHR |
| `MIKROTIK_PORT` | `8728` | Puerto API RouterOS |
| `MIKROTIK_USER` | `admin` | Usuario RouterOS |
| `MIKROTIK_PASSWORD` | — | Contraseña RouterOS |

### Wazuh SIEM
| Variable | Default | Descripción |
|----------|---------|-------------|
| `WAZUH_HOST` | `100.90.106.121` | IP del servidor Wazuh |
| `WAZUH_PORT` | `55000` | Puerto API Wazuh |
| `WAZUH_USER` | `wazuh` | Usuario API |
| `WAZUH_PASSWORD` | — | Contraseña API |

### CrowdSec
| Variable | Default | Descripción |
|----------|---------|-------------|
| `CROWDSEC_URL` | `http://localhost:8080` | URL LAPI local |
| `CROWDSEC_API_KEY` | — | API key del bouncer |

### GeoIP (MaxMind)
| Variable | Default | Descripción |
|----------|---------|-------------|
| `GEOIP_CITY_DB` | `backend/data/geoip/GeoLite2-City.mmdb` | Path a la DB City |
| `GEOIP_ASN_DB` | `backend/data/geoip/GeoLite2-ASN.mmdb` | Path a la DB ASN |
| `MAXMIND_LICENSE_KEY` | — | Clave para descargar las .mmdb |

### Suricata
| Variable | Default | Descripción |
|----------|---------|-------------|
| `SURICATA_SOCKET` | `/var/run/suricata/suricata.socket` | Path al Unix socket |
| `SURICATA_EVE_LOG` | `/var/log/suricata/eve.json` | Path al archivo eve.json |
| `SURICATA_HOST` | `192.168.88.50` | Host donde corre Suricata |

### GLPI
| Variable | Default | Descripción |
|----------|---------|-------------|
| `GLPI_URL` | `http://glpi.facultad.local` | URL base de GLPI |
| `GLPI_APP_TOKEN` | — | App-Token de GLPI |
| `GLPI_USER_TOKEN` | — | User-Token de GLPI |
| `GLPI_VERIFY_SSL` | `false` | Verificar SSL |

### Anthropic
| Variable | Default | Descripción |
|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | — | API key de Anthropic para Claude |

### Telegram
| Variable | Default | Descripción |
|----------|---------|-------------|
| `TELEGRAM_BOT_TOKEN` | — | Token del bot |
| `TELEGRAM_CHAT_ID` | — | Chat/Group/Channel ID principal |
| `TELEGRAM_WEBHOOK_SECRET` | — | Secreto para validar webhook inbound |
| `TELEGRAM_ADMIN_CHAT_IDS` | — | IDs de admin separados por coma |

### Aplicación
| Variable | Default | Descripción |
|----------|---------|-------------|
| `DATABASE_URL` | `sqlite+aiosqlite:///./netshield.db` | String de conexión DB |
| `REDIS_URL` | `redis://localhost:6379` | Cache Redis (no implementado) |
| `APP_ENV` | `development` | `development`, `production`, o `lab` |
| `LOG_LEVEL` | `DEBUG` | Nivel de log |
| `CORS_ORIGINS` | `["http://localhost:5173","http://localhost:3000"]` | JSON array de orígenes |

### Mock Mode
| Variable | Default | Descripción |
|----------|---------|-------------|
| `MOCK_ALL` | `false` | Activa mock en todos los servicios |
| `MOCK_MIKROTIK` | `false` | Solo MikroTik en mock |
| `MOCK_WAZUH` | `false` | Solo Wazuh en mock |
| `MOCK_GLPI` | `false` | Solo GLPI en mock |
| `MOCK_ANTHROPIC` | `false` | Solo Anthropic en mock |
| `MOCK_CROWDSEC` | `false` | Solo CrowdSec en mock |
| `MOCK_GEOIP` | `true` | Solo GeoIP en mock (default true hasta descargar DB) |
| `MOCK_SURICATA` | `true` | Solo Suricata en mock (default true hasta instalación) |
| `MOCK_TELEGRAM` | `true` | Solo Telegram en mock (default true hasta configurar bot) |

> **Retrocompatibilidad:** `APP_ENV=lab` sin ninguna variable `MOCK_*` definida explícitamente = `MOCK_ALL=true`.

### Thresholds de seguridad (en `config.py`)
| Variable | Default | Descripción |
|----------|---------|-------------|
| `alert_notification_threshold` | `10` | Nivel mínimo para push notifications |
| `auto_block_threshold` | `12` | Nivel mínimo para auto-blocking |
| `auto_block_enabled` | `false` | Toggle de bloqueo automático |

### Hotspot / Portal Cautivo (en `config.py`)
| Variable | Default | Descripción |
|----------|---------|-------------|
| `hotspot_interface` | `ether2` | Interfaz del MikroTik para Hotspot |
| `hotspot_server_name` | `hotspot1` | Nombre del servidor Hotspot |
| `hotspot_address_pool` | `hs-pool-1` | Pool de direcciones |

---

## Convenciones de código

### Backend

- **Respuesta consistente:** Todo endpoint devuelve `{"success": bool, "data": ..., "error": null | "mensaje"}`. Implementado vía `APIResponse.ok(data)` y `APIResponse.fail(error)` del schema `schemas/common.py`.
- **Un router por dominio:** `mikrotik.py`, `wazuh.py`, `crowdsec.py`, `suricata.py`, `geoip.py`, `glpi.py`, `portal.py`, `reports.py`, `network.py`, `security.py`, `phishing.py`, `views.py`, `widgets.py`, `vlans.py`, `cli.py` (15 routers).
- **Servicios como singletons:** Variable de módulo + función `get_X_service()`. Excepción: `AIService` crea instancia por llamada.
- **Mock guard en servicios:** Al inicio de cada método: `if settings.should_mock_X: return MockData.X.funcion()`. Los guards están en servicios (no en routers) para que los WebSockets también los respeten.
- **Async everywhere:** Todo es async. Librerías síncronas (`routeros-api`, WeasyPrint, requests) se ejecutan en `run_in_executor` o `asyncio.to_thread`.
- **Logging:** `structlog` con `ConsoleRenderer` en dev, `JSONRenderer` en prod. Nunca `print()`.
- **Errores:** Try/except en cada endpoint, errores envueltos en `APIResponse.fail()`. Nunca propagar excepciones sin envolver.
- **Retry:** `tenacity` con `@retry` decorador — backoff exponencial 1-10s, 3 intentos.
- **Lazy imports:** Cross-service calls usan imports dentro de funciones para evitar circular imports (ej: `suricata → wazuh`, `wazuh → geoip`).
- **Credenciales:** Jamás hardcodeadas. Todo vía `config.py` → `.env`.

### Frontend

- **Componentes:** PascalCase, un archivo por componente, agrupados por dominio (`security/`, `crowdsec/`, `suricata/`, `inventory/`, `portal/`, `reports/`, `views/`, `widgets/`, etc.).
- **Hooks:** Prefijo `use`, un hook por fuente de datos, en `src/hooks/`. Widget hooks en `src/hooks/widgets/{visual,technical,hybrid}/index.ts`.
- **Servicios API:** Centralizados en `src/services/api.ts` (~37KB, 15+ namespaces). Nunca hacer fetch directo.
- **Tipos:** Todos en `src/types.ts` (~39KB), espejo de los schemas Pydantic del backend.
- **Data fetching:** TanStack Query con `queryKey` descriptivos y `refetchInterval` para polling.
- **Estilos:** TailwindCSS v4 con tokens personalizados definidos en `index.css` vía `@theme`. No hay `tailwind.config.js`.
- **Clases CSS reutilizables:** `glass-card`, `stat-card`, `badge-*`, `btn-*`, `data-table`, `input`, `sidebar-link`, `status-dot` definidas en `index.css`.
- **WebSocket:** Hook genérico `useWebSocket(url)` con reconexión automática y backoff exponencial. No existe `useTrafficSocket` — el tráfico se consume directo via `useWebSocket('/ws/traffic')`.

---

## Estado actual del proyecto

### Funcionalidades implementadas y operativas

**Backend:**
- [x] Config con pydantic-settings, 9 flags mock granulares + `MOCK_ALL` [REAL]
- [x] Base de datos SQLAlchemy async con SQLite, 10 modelos [REAL]
- [x] 15 routers REST con ~160 endpoints [REAL + MOCK]
- [x] 7 WebSocket endpoints [REAL + MOCK]
- [x] 15 servicios de lógica de negocio [REAL + MOCK]
- [x] `glpi_collector.py` — Periodic sync de assets GLPI cada 5 min [REAL]
- [x] Function calling de Claude con 5 tools [MOCK ONLY sin API key]
- [x] Mock system completo para todos los servicios [REAL]

**Frontend:**
- [x] 21 rutas (19 reales + 1 redirect + 1 fallback) [REAL]
- [x] Layout con sidebar 7 grupos, topbar con 5 status dots [REAL]
- [x] 53 widgets en 4 categorías (17 standard, 10 visual, 12 technical, 14 hybrid) [REAL]
- [x] 6 temas visuales con escala de fuente [REAL]
- [x] 38 custom hooks de datos [REAL]
- [x] Sistema de vistas personalizadas con drag-and-drop [REAL]
- [ ] Responsive móvil (funcional pero no refinado)
- [ ] Autenticación de usuario

### Rutas del frontend (`App.tsx`)

| Ruta | Componente | Estado |
|------|-----------|--------|
| `/` | `QuickView` | ✅ Operativa |
| `/security/config` | `ConfigView` | ✅ Operativa |
| `/network` | `NetworkPage` | ✅ Operativa |
| `/firewall` | `FirewallPage` | ✅ Operativa |
| `/portal` | `PortalPage` | ✅ Operativa |
| `/phishing` | `PhishingPanel` | ✅ Operativa |
| `/system` | `SystemHealth` | ✅ Operativa |
| `/reports` | `ReportsPage` | ✅ Operativa |
| `/inventory` | `InventoryPage` | ✅ Operativa |
| `/crowdsec` | `CrowdSecCommandCenter` | ✅ Operativa |
| `/crowdsec/intelligence` | `CrowdSecIntelligence` | ✅ Operativa |
| `/crowdsec/config` | `CrowdSecConfig` | ✅ Operativa |
| `/suricata` | `SuricataMotorPage` | ✅ Operativa |
| `/suricata/alerts` | `SuricataAlertsPage` | ✅ Operativa |
| `/suricata/network` | `SuricataNSMPage` | ✅ Operativa |
| `/suricata/rules` | `SuricataRulesPage` | ✅ Operativa |
| `/views` | `ViewsListPage` | ✅ Operativa |
| `/views/new` | `ViewBuilderPage` | ✅ Operativa |
| `/views/:id` | `ViewDetailPage` | ✅ Operativa |
| `/views/:id/edit` | `ViewBuilderPage` | ✅ Operativa |
| `/vlans` | → Redirect a `/network` | ✅ Legacy redirect |

### Servicios externos — estado de integración

| Servicio | Modo REAL | Modo MOCK | Variable |
|----------|-----------|-----------|----------|
| MikroTik | ✅ Completa | ✅ Completa | `MOCK_MIKROTIK` |
| Wazuh | ✅ Completa | ✅ Completa | `MOCK_WAZUH` |
| CrowdSec | ✅ Completa | ✅ Completa | `MOCK_CROWDSEC` |
| Suricata | ✅ Completa | ✅ Completa (default mock) | `MOCK_SURICATA` |
| GeoIP | ✅ Completa | ✅ Completa (default mock) | `MOCK_GEOIP` |
| GLPI | ✅ Completa | ✅ Completa | `MOCK_GLPI` |
| Anthropic | ✅ Completa | ✅ Completa | `MOCK_ANTHROPIC` |
| Telegram | ✅ Completa | ✅ Completa (default mock) | `MOCK_TELEGRAM` |

### Pendientes de implementación

- [ ] Cache Redis para métricas de tiempo real
- [ ] Tests unitarios y de integración
- [ ] Autenticación de usuarios (JWT/sesiones)
- [ ] Rate limiting en endpoints
- [ ] Validación de permisos por rol (RBAC)

---

## Sistema de Mock Data

> Permite correr el backend **sin infraestructura externa**.

### Cómo activar

```bash
# Mock total
cd backend && MOCK_ALL=true python main.py

# Modo híbrido (MikroTik real, resto mock)
MOCK_WAZUH=true MOCK_GLPI=true MOCK_ANTHROPIC=true MOCK_CROWDSEC=true MOCK_SURICATA=true MOCK_GEOIP=true MOCK_TELEGRAM=true python main.py

# Ver estado de mocks
GET http://localhost:8000/api/system/mock-status
```

### Lógica de combinación

Definida en `config.py`:
- `MOCK_ALL=true` → activa mock en todos los servicios
- `MOCK_X=true` → activa mock solo para ese servicio (OR con `MOCK_ALL`)
- `APP_ENV=lab` sin variables `MOCK_*` → equivale a `MOCK_ALL=true` (retrocompatibilidad)
- Cada servicio verifica `settings.should_mock_X` (property que hace OR de `_effective_mock_all || mock_X`)

### Qué datos genera cada mock

- **`mock_data.py`** — Repositorio central de datos estáticos (seed=42). Secciones: `MockData.mikrotik.*`, `MockData.wazuh.*`, `MockData.crowdsec.*`, `MockData.suricata.*`, `MockData.geoip.*`, `MockData.glpi.*`, `MockData.ai.*`, `MockData.portal.*`, `MockData.telegram.*`, `MockData.websocket.*`
- **`mock_service.py`** — Facade con estado en memoria para operaciones CRUD: GLPI assets/tickets, CrowdSec decisions/whitelist, Portal users, Telegram configs/logs. También expone `MockService.get_mock_status()` para el badge del frontend.

### Entidades coherentes entre servicios

| IP | MikroTik ARP | Wazuh Agent | GLPI Asset |
|----|-------------|-------------|-----------|
| `192.168.88.10` | `lubuntu_desk_1` | agente `004` | `PC-Lab-01` |
| `192.168.88.11` | `lubuntu_desk_2` | agente `005` | `PC-Lab-02` |
| `192.168.88.50` | `wazuh-server` | agente `000` | `Server-Wazuh` |
| `203.0.113.45` | — | Atacante brute-force | — |

### Frontend: MockModeBadge

Cuando `any_mock_active = true`, aparece un badge amarillo en el topbar:
- **`MOCK ALL`** si todos los servicios están simulados
- **`MOCK: MIKROTIK · WAZUH`** si solo algunos están simulados
- Polling cada 30s a `GET /api/system/mock-status`

---

## Decisiones de arquitectura importantes

### ¿Por qué singleton para MikroTik?
RouterOS tiene un límite bajo de sesiones API concurrentes. Un singleton con `asyncio.Lock` garantiza una sola conexión persistente compartida. Reconexión automática si la conexión se cae.

### ¿Por qué `run_in_executor` para routeros-api?
La librería es 100% síncrona. Se ejecuta en el thread pool default para no bloquear el event loop async.

### ¿Por qué httpx en vez de requests?
`httpx` soporta async nativo, consistente con la arquitectura async de FastAPI. `requests` se usa solo en `glpi_collector.py` (vía `asyncio.to_thread`) porque es un background task independiente.

### ¿Por qué SQLite y no PostgreSQL?
Elimina la dependencia de un servidor de DB en el laboratorio. Migrar a PostgreSQL: solo cambiar `DATABASE_URL` a `postgresql+asyncpg://...` e instalar `asyncpg`.

### ¿Por qué function calling en la IA?
Claude decide qué datos necesita en runtime según el prompt del usuario. Hay 5 tools disponibles. Máximo 10 iteraciones de tool-use por request.

### ¿Por qué TailwindCSS v4 con `@theme`?
TailwindCSS v4 usa CSS nativo para tokens. No hay `tailwind.config.js`. Los tokens se definen con `@theme` en `index.css` y se integra via `@tailwindcss/vite`.

### ¿Por qué mock guards en servicios y no en routers?
Los WebSockets no pasan por los routers. Si los guards estuvieran solo en routers, los WS seguirían intentando conectarse a sistemas externos en modo mock.

### ¿Por qué GeoIP local?
Sin latencia de red, sin límites de requests. MaxMind GeoLite2 hace lookups en microsegundos contra archivos .mmdb cargados en RAM con TTLCache.

### ¿Por qué el GLPI Collector como background task?
La API de GLPI es lenta y compleja (múltiples roundtrips). El collector sincroniza assets cada 5 minutos vía `asyncio.to_thread` y mantiene un cache parsed en memoria para reads instantáneos.

### ¿Por qué vistas personalizadas con widgets?
El dashboard estático no cubre todos los perfiles de usuario. Las vistas permiten crear dashboards a medida con drag-and-drop de widgets de un catálogo tabulado (Standard/Visual/Technical/Hybrid).

### ¿Por qué 5 status dots en el topbar?
MikroTik, Wazuh, CrowdSec, Suricata y GLPI — cada uno con indicador visual de conectividad en tiempo real.

---

## Cómo extender el proyecto

### Agregar un endpoint nuevo

1. **Schema** (`schemas/mi_schema.py`): Crear `MiRequest(BaseModel)` y `MiResponse(BaseModel)`
2. **Servicio** (`services/mi_service.py`): Agregar método async. Usar `self._api_call()` para MikroTik.
3. **Router** (`routers/mi_router.py`): `@router.get("/mi-endpoint")` → `try: ... return APIResponse.ok(data) except: APIResponse.fail(str(e))`
4. **Registrar** en `main.py`: `app.include_router(mi_router.router)`

### Agregar un servicio externo nuevo

1. Crear `services/mi_service.py` con patrón singleton (`_instance` + `get_mi_service()`)
2. Agregar mock flag en `config.py` (`mock_mi`, `should_mock_mi`).
3. Agregar datos mock en `mock_data.py` (sección `mi`)
4. Agregar mock guard al inicio de cada método: `if settings.should_mock_mi: return MockData.mi.funcion()`
5. Inicializar/cleanup en `main.py` lifespan
6. Agregar variable a `backend/.env.example`

### Agregar un widget nuevo

1. **Hook** (`hooks/widgets/{category}/index.ts`): `export function useMiWidget() { return useQuery({...}) }`
2. **Componente** (`components/widgets/{category}/MiWidget.tsx`): React component
3. **Export** (`components/widgets/{category}/index.ts`): `export { MiWidget } from './MiWidget'`
4. **WidgetRenderer** (`components/views/WidgetRenderer.tsx`): Agregar `case 'mi_widget':` en el switch
5. **Catálogo** (`routers/views.py`): Registrar en el catálogo del backend devuelto por `GET /api/views/widgets/catalog`

### Agregar un ítem al sidebar

En `Layout.tsx`, agregar al array `navGroups`:
```tsx
{ to: '/mi-ruta', icon: MiIcono, label: 'Mi Panel', end: false },
```
Actualmente hay 19 ítems de 20 máximos.

Última actualización: 2026-04-28
Basado en análisis de: 120+ archivos
Versión del proyecto: 2.4 (según README.md)
