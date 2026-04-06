# Backend — NetShield Dashboard

## Estructura de carpetas

```
backend/
├── main.py                    # Punto de entrada FastAPI, CORS, WebSockets, lifespan
├── config.py                  # Settings con pydantic-settings, lee .env
├── database.py                # SQLAlchemy async engine + session factory + init_db()
├── .env                       # Variables de entorno (NO commitear)
├── .env.example               # Plantilla de variables de entorno
├── requirements.txt           # Dependencias Python con versiones pinneadas
│
├── models/                    # Modelos SQLAlchemy (tablas de base de datos)
│   ├── __init__.py            # Re-exporta todos los modelos
│   ├── ip_label.py            # IPLabel: etiquetas asignadas a IPs
│   ├── ip_group.py            # IPGroup + IPGroupMember: grupos de IPs con criterios
│   └── action_log.py          # ActionLog: auditoría de acciones (bloqueos, reportes, etc.)
│
├── schemas/                   # Pydantic v2 schemas para request/response
│   ├── __init__.py            # Re-exporta todos los schemas
│   ├── common.py              # APIResponse[T]: envelope genérico {success, data, error}
│   ├── mikrotik.py            # InterfaceInfo, ConnectionInfo, ARPEntry, TrafficData, etc.
│   ├── wazuh.py               # WazuhAgent, WazuhAlert, ActiveResponseRequest
│   ├── network.py             # IPLabelCreate/Response, IPGroupCreate/Response
│   └── reports.py             # ReportGenerateRequest, ReportExportRequest, ReportDraft
│
├── services/                  # Lógica de negocio (conexiones a sistemas externos)
│   ├── __init__.py
│   ├── mikrotik_service.py    # Singleton: conexión RouterOS API con reconexión automática
│   ├── wazuh_service.py       # Singleton: cliente httpx async con JWT auth
│   ├── glpi_service.py        # Singleton: cliente GLPI REST API
│   ├── portal_service.py      # Singleton: gestión Hotspot MikroTik
│   ├── ai_service.py          # Claude API con function calling para reportes
│   ├── pdf_service.py         # WeasyPrint + Jinja2 para generar PDF
│   ├── mock_data.py           # ← Repositorio central de datos simulados (seed=42)
│   └── mock_service.py        # ← Facade con estado en memoria para CRUD en modo mock
│
├── routers/                   # Endpoints FastAPI, un archivo por dominio
│   ├── __init__.py
│   ├── mikrotik.py            # /api/mikrotik/* (12 endpoints)
│   ├── vlans.py               # /api/mikrotik/vlans/* (7 endpoints)
│   ├── wazuh.py               # /api/wazuh/* (9 endpoints)
│   ├── network.py             # /api/network/* (8 endpoints)
│   ├── reports.py             # /api/reports/* (3 endpoints)
│   ├── glpi.py                # /api/glpi/* (20 endpoints)
│   ├── portal.py              # /api/portal/* (18 endpoints)
│   ├── phishing.py            # /api/phishing/* (10 endpoints)
│   ├── security.py            # /api/security/* (4 endpoints)
│   └── cli.py                 # /api/cli/* (2 endpoints)
│
├── postman/                   # Colección Postman para testing
│   ├── NetShield.postman_collection.json
│   ├── env_local_mock.postman_environment.json
│   ├── env_local_real.postman_environment.json
│   └── env_lab.postman_environment.json
│
└── templates/                 # Plantillas Jinja2
    └── report_base.html       # Template HTML para PDF con cover page y estilos
```

---

## Cómo funciona cada servicio

### `mikrotik_service.py` — MikroTikService

**Patrón:** Singleton vía `__new__()` + flag `_initialized`.

**Conexión:** Usa `routeros_api.RouterOsApiPool` con `plaintext_login=True`. Como la librería es síncrona, todas las llamadas se ejecutan dentro de `asyncio.get_event_loop().run_in_executor(None, ...)`.

**Reconexión automática:** Si una llamada API falla, se fuerza `_connected = False`, se reconecta, y se reintenta una vez. La creación de conexión tiene `@retry` de tenacity (3 intentos, backoff exponencial 1-10s).

**Tráfico en tiempo real:** `get_traffic()` no lee un contador de "velocidad" directamente. Guarda los contadores absolutos de bytes/paquetes por interfaz en `_last_traffic`, y al siguiente llamado calcula el delta dividido por el tiempo transcurrido para obtener bytes/sec.

**Métodos públicos:**
| Método | RouterOS Path | Descripción |
|--------|---------------|-------------|
| `get_interfaces()` | `/interface` | Estado de todas las interfaces |
| `get_connections()` | `/ip/firewall/connection` | Tabla de conexiones activas |
| `get_arp_table()` | `/ip/arp` | Tabla ARP |
| `get_traffic()` | `/interface` | Calcula rx/tx bytes/sec por interfaz |
| `get_firewall_rules()` | `/ip/firewall/filter` | Lista reglas de firewall |
| `block_ip(ip, comment)` | `/ip/firewall/filter` (add) | Agrega regla drop en chain=forward |
| `unblock_ip(ip)` | `/ip/firewall/filter` (remove) | Elimina reglas drop para esa IP |
| `get_logs(limit)` | `/log` | Últimos N logs del sistema |

---

### `wazuh_service.py` — WazuhService

**Patrón:** Singleton vía `__new__()`.

**Autenticación:** JWT de dos pasos:
1. POST a `/security/user/authenticate` con Basic Auth → obtiene token JWT
2. Todas las llamadas posteriores usan `Authorization: Bearer {token}`
3. Si recibe 401, refresca el token automáticamente y reintenta

**Cliente HTTP:** `httpx.AsyncClient` con `verify=False` (cert autofirmado en el lab). Timeout de 30s general, 10s para conexión.

**Normalización:** Las respuestas crudas de Wazuh (`agent.id`, `rule.level`, etc.) se normalizan a un formato plano consistente antes de devolverlas.

**Métodos públicos:**
| Método | Wazuh Endpoint | Descripción |
|--------|----------------|-------------|
| `get_agents()` | `GET /agents` | Todos los agentes con status |
| `get_alerts(limit, level_min, offset)` | `GET /alerts` | Alertas con filtro de severidad |
| `get_alerts_by_agent(agent_id)` | `GET /alerts` | Alertas de un agente específico |
| `send_active_response(agent_id, command, args)` | `PUT /active-response/{id}` | Ejecutar acción en agente |

---

### `ai_service.py` — AIService

**No es singleton.** Se crea una instancia por llamada vía `get_ai_service()`.

**Modelo:** `claude-sonnet-4-20250514`, max 8192 tokens de salida.

**Function calling:** Claude tiene acceso a 4 herramientas:
- `get_wazuh_alerts` — Obtener alertas del SIEM
- `get_mikrotik_connections` — Obtener conexiones activas
- `get_firewall_rules` — Obtener reglas de firewall
- `get_arp_table` — Obtener tabla ARP

**Flujo de generación:**
1. Se construye el prompt del usuario + system prompt según audiencia (executive/technical/operational)
2. Se envía a Claude con las herramientas disponibles (filtradas por `data_sources`)
3. Si Claude responde con `stop_reason == "tool_use"`, se ejecutan las funciones contra los servicios reales
4. Se envían los resultados de vuelta a Claude
5. Se repite hasta que Claude produce texto final (máximo 10 iteraciones)
6. Se extrae el HTML, el título (del primer `<h1>`), y se devuelve

**System prompts:** Hay 3 prompts diferentes según la audiencia:
- `executive` — Sin jerga técnica, enfoque en impacto de negocio
- `technical` — IOCs, MITRE ATT&CK, datos crudos
- `operational` — Pasos accionables, checklists

---

### `pdf_service.py` — PDFService

**Flujo:** HTML (del editor TipTap) → Jinja2 template (`report_base.html`) → WeasyPrint → bytes PDF.

La plantilla incluye:
- Página de portada con logo, título, autor, fecha y badge de clasificación
- Headers/footers con paginación automática (`@page`)
- Estilos para tablas, badges de severidad, code blocks, info boxes
- Soporta metric cards con valores destacados

---

## Patrones usados

| Patrón | Dónde | Por qué |
|--------|-------|---------|
| Singleton | `MikroTikService`, `WazuhService`, `GLPIService`, `PortalService` | Limitar conexiones concurrentes a sistemas externos |
| Retry exponencial | `_create_connection()`, `_authenticate()` | Resilencia ante fallas de red transitorias |
| Envelope de respuesta | `APIResponse[T]` en `schemas/common.py` | Consistencia en todas las respuestas de la API |
| Dependency injection | `Depends(get_db)`, `Depends(get_service)` | Testabilidad y desacoplamiento |
| Run-in-executor | `mikrotik_service.py` | Ejecutar código síncrono sin bloquear el event loop |
| Lifespan context manager | `main.py` | Inicialización/cleanup ordenado de DB y servicios |
| Function calling (agentic loop) | `ai_service.py` | Claude decide qué datos necesita en runtime |
| **Mock guard** | Todos los servicios | Guard al inicio de cada método: si `settings.should_mock_*` delega a `MockData`/`MockService` |

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
| `GLPI_URL` | Solo GLPI | URL base de GLPI (lab: `http://glpi.facultad.local`) |
| `GLPI_APP_TOKEN` | Solo GLPI | Token de aplicación GLPI |
| `GLPI_USER_TOKEN` | Solo GLPI | Token de usuario GLPI |
| `ANTHROPIC_API_KEY` | Solo reportes | API key de Anthropic para Claude |
| `DATABASE_URL` | No | String de conexión SQLAlchemy (default: `sqlite+aiosqlite:///./netshield.db`) |
| `APP_ENV` | No | `development` o `production` (default: `development`) |
| `LOG_LEVEL` | No | Nivel de log: `DEBUG`, `INFO`, `WARNING`, `ERROR` (default: `DEBUG`) |
| `CORS_ORIGINS` | No | JSON array de orígenes permitidos (default: `["http://localhost:5173"]`) |
| **`MOCK_ALL`** | No | `true` → activa mock en todos los servicios externos |
| **`MOCK_MIKROTIK`** | No | `true` → solo MikroTik en mock |
| **`MOCK_WAZUH`** | No | `true` → solo Wazuh en mock |
| **`MOCK_GLPI`** | No | `true` → solo GLPI en mock |
| **`MOCK_ANTHROPIC`** | No | `true` → solo Anthropic/IA en mock |

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

### `SyntaxWarning: invalid escape sequence '\.'`
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
