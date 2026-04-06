# NetShield Dashboard

## ¿Qué es este proyecto?

NetShield Dashboard es una plataforma web de monitoreo y control de seguridad de red. Integra un router MikroTik CHR (vía API RouterOS) y un SIEM Wazuh (vía API REST) en un único panel de control con capacidades de generación de reportes con IA (Claude de Anthropic).

**Fase actual:** Laboratorio de pruebas.
**Objetivo futuro:** Escalar a entornos reales soportando picos de 1000 usuarios concurrentes sin reescribir la arquitectura.

---

## Stack técnico

### Backend (Python 3.12+)
| Paquete | Versión | Propósito |
|---------|---------|-----------|
| FastAPI | 0.115.6 | Framework web async |
| Uvicorn | 0.34.0 | Servidor ASGI |
| Pydantic | 2.10.4 | Validación de datos |
| pydantic-settings | 2.7.1 | Configuración desde `.env` |
| SQLAlchemy | 2.0.36 | ORM async |
| aiosqlite | 0.20.0 | Driver async para SQLite |
| routeros-api | 0.17.0 | Cliente API MikroTik |
| httpx | 0.28.1 | Cliente HTTP async para Wazuh |
| anthropic | 0.42.0 | SDK de Claude para reportes con IA |
| weasyprint | 63.1 | Generación de PDF |
| Jinja2 | 3.1.5 | Plantillas HTML para PDF |
| structlog | 24.4.0 | Logging estructurado |
| tenacity | 9.0.0 | Reintentos con backoff exponencial |
| redis | 5.2.1 | Cache (opcional, no implementado aún) |

### Frontend
| Paquete | Versión | Propósito |
|---------|---------|-----------|
| React | 19.2.4 | UI framework |
| Vite | 8.0.1 | Bundler y dev server |
| TypeScript | 5.9.3 | Tipado estático |
| TailwindCSS | 4.2.2 | Estilos (vía plugin Vite `@tailwindcss/vite`) |
| TanStack Query | 5.96.0 | Fetching, cache y sincronización de datos |
| Recharts | 3.8.1 | Gráficos de tráfico |
| TipTap | 3.22.0 | Editor de texto enriquecido para reportes |
| React Router DOM | 7.13.2 | Enrutamiento SPA |
| Axios | 1.14.0 | Cliente HTTP |
| Lucide React | 1.7.0 | Iconografía |

---

## Infraestructura del laboratorio

```
┌─────────────────────────────────────────────────────┐
│  Windows 10 (Host) - Tailscale habilitado            │
│  ┌───────────────────┐  ┌────────────────────┐      │
│  │ MikroTik CHR      │  │ Wazuh Manager      │      │
│  │ 192.168.100.118   │  │ 100.90.106.121     │      │
│  │ API: puerto 8728  │  │ API: puerto 55000  │      │
│  │ plaintext_login   │  │ cert autofirmado   │      │
│  └────────┬──────────┘  └────────┬───────────┘      │
│           │                      │                   │
│  ┌────────┴──────────────────────┴───────────┐      │
│  │ Subnet 192.168.88.0/24                     │      │
│  │  ├── 192.168.88.10 (Lubuntu + Wazuh agent) │      │
│  │  └── 192.168.88.11 (Lubuntu + Wazuh agent) │      │
│  └────────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────┘
```

- **Acceso remoto:** Tailscale (red 100.x.x.x con subnet routing)
- **MikroTik API:** Puerto 8728, login plaintext (solo lab)
- **Wazuh API:** Puerto 55000, HTTPS con `verify=False` (cert autofirmado, solo lab)

---

## Cómo correr el proyecto

### Backend
```bash
cd backend

# Crear entorno virtual (usando uv, ya instalado en el sistema)
~/.local/bin/uv venv
source .venv/bin/activate
~/.local/bin/uv pip install -r requirements.txt

# Configurar variables (editar .env con credenciales reales)
cp .env.example .env
nano .env

# Ejecutar
python main.py
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

### Nota sobre proxy
El proxy de Vite (`vite.config.ts`) redirige automáticamente:
- `/api/*` → `http://localhost:8000`
- `/ws/*` → `ws://localhost:8000`

No se necesita configurar CORS manualmente para desarrollo local.

---

## Convenciones de código

### Backend
- **Respuesta consistente:** Todo endpoint devuelve `{"success": bool, "data": ..., "error": null | "mensaje"}`
- **Un router por dominio:** `routers/mikrotik.py`, `routers/wazuh.py`, `routers/network.py`, `routers/reports.py`
- **Servicios como singletons:** MikroTikService y WazuhService usan patrón singleton vía `__new__`
- **Async everywhere:** Todo es async. Las librerías síncronas (routeros-api) se ejecutan en `run_in_executor`
- **Logging:** `structlog` con formato console en dev, JSON en producción
- **Errores:** Try/except en cada endpoint, nunca propagar excepciones sin envolver en `APIResponse.fail()`
- **Nombres de archivos:** snake_case para todo
- **Credenciales:** Jamás hardcodeadas. Todo vía `config.py` → `.env`

### Frontend
- **Componentes:** PascalCase, un archivo por componente, agrupados por dominio (`dashboard/`, `firewall/`, etc.)
- **Hooks:** Prefijo `use`, en `src/hooks/`
- **Servicios API:** Centralizados en `src/services/api.ts`
- **Tipos:** Todos en `src/types.ts`, espejo de los schemas Pydantic del backend
- **Estilos:** TailwindCSS v4 con tokens personalizados (colores `brand-*`, `surface-*`, `severity-*`) definidos en `index.css` vía `@theme`
- **Clases CSS reutilizables:** `glass-card`, `stat-card`, `badge-*`, `btn-*`, `data-table`, `input` definidas en `index.css`
- **Data fetching:** TanStack Query con `queryKey` descriptivos y `refetchInterval` para polling

---

## Estado actual

### Backend
- [x] `config.py` — Configuración con pydantic-settings
- [x] `database.py` — SQLAlchemy async con SQLite
- [x] Modelos: `IPLabel`, `IPGroup`, `IPGroupMember`, `ActionLog`
- [x] Schemas Pydantic v2 para todos los endpoints
- [x] `mikrotik_service.py` — Singleton, reconexión, tráfico en tiempo real
- [x] `wazuh_service.py` — JWT auth, refresh automático, alertas y agentes
- [x] `glpi_service.py` — Inventario GLPI, tickets, cuarentena, correlación Wazuh
- [x] `portal_service.py` — Portal Cautivo MikroTik Hotspot, sesiones, perfiles, horarios
- [x] `ai_service.py` — Claude function calling con tools para datos en vivo
- [x] `pdf_service.py` — WeasyPrint + Jinja2 con plantilla profesional
- [x] **`mock_data.py`** — Repositorio centralizado de datos simulados (MikroTik, Wazuh, GLPI, Portal, IA)
- [x] **`mock_service.py`** — Facade con estado en memoria para CRUD en modo mock
- [x] **Mock guards** en todos los servicios (`mikrotik`, `wazuh`, `glpi`, `ai`, `portal`)
- [x] Router MikroTik (12 endpoints + VLANs CRUD)
- [x] Router Wazuh (9 endpoints)
- [x] Router Network (8 endpoints: labels CRUD, groups CRUD)
- [x] Router Reports (3 endpoints: generate, export-pdf, history)
- [x] Router GLPI (20 endpoints: assets CRUD, tickets, users, locations)
- [x] Router Portal Cautivo (18 endpoints: setup, sessions, users CRUD, profiles, config)
- [x] Router Phishing (10 endpoints: sinkhole, alertas, víctimas)
- [x] Router Security (4 endpoints: block-ip, auto-block, quarantine, geo-block)
- [x] Router CLI (2 endpoints: mikrotik, wazuh-agent)
- [x] WebSocket `/ws/traffic`, `/ws/alerts`, `/ws/vlans/traffic`, `/ws/security/alerts`, `/ws/portal/sessions`
- [x] **`GET /api/system/mock-status`** — Estado actual de mocks por servicio
- [x] Endpoint `/api/health` y `/api/actions/history`
- [x] Plantilla PDF (`templates/report_base.html`)
- [ ] Cache Redis para métricas de tiempo real
- [ ] Tests unitarios y de integración
- [ ] Autenticación de usuarios (JWT/sesiones)
- [ ] Rate limiting en endpoints
- [ ] Validación de permisos por rol

### Frontend
- [x] Layout con sidebar glassmorphic y navegación responsive
- [x] Dashboard: 4 stat cards, gráfico de tráfico en vivo, tabla de conexiones, feed de alertas
- [x] Panel Firewall: formulario de bloqueo, tabla de reglas, historial de acciones
- [x] Panel VLANs: CRUD de VLANs, tráfico por VLAN en tiempo real
- [x] Panel Red & IPs: tabla ARP, etiquetas CRUD, grupos CRUD, búsqueda global
- [x] Panel Reportes: prompt IA, selector audiencia/fuentes, editor TipTap, exportar PDF
- [x] Panel GLPI: inventario de activos, tickets kanban, cuarentena, correlación Wazuh
- [x] Panel Portal Cautivo: sesiones en tiempo real, usuarios CRUD, perfiles, horarios
- [x] Panel Phishing: alertas, víctimas, sinkhole de dominios
- [x] Panel Seguridad: bloqueo de IPs, cuarentena, geo-block
- [x] Panel CLI: terminal web para RouterOS y Wazuh
- [x] Status dots para MikroTik y Wazuh en topbar
- [x] **`MockModeBadge`** — Badge amarillo en topbar cuando servicios están en modo mock
- [x] WebSocket hooks con reconexión automática y backoff exponencial
- [x] Diseño dark mode premium con animaciones y glassmorphism
- [ ] Toggle enable/disable de reglas firewall individuales
- [ ] Responsive optimizado para móviles (funcional pero no refinado)
- [ ] Autenticación de usuario en frontend

### Testing / Colección Postman
- [x] **`postman/NetShield.postman_collection.json`** — 104 requests, 11 módulos
- [x] **`postman/env_local_mock.postman_environment.json`** — `localhost:8000`, `MOCK_ALL=true`
- [x] **`postman/env_local_real.postman_environment.json`** — `localhost:8000`, servicios reales
- [x] **`postman/env_lab.postman_environment.json`** — `192.168.100.115:8000`, lab remoto

---

## Sistema de Mock Data

> Permite correr el backend **sin infraestructura externa** (MikroTik, Wazuh, GLPI, Anthropic).

### Variables de entorno

| Variable | Efecto |
|----------|--------|
| `MOCK_ALL=true` | Activa mock en todos los servicios |
| `MOCK_MIKROTIK=true` | Solo MikroTik en mock |
| `MOCK_WAZUH=true` | Solo Wazuh en mock |
| `MOCK_GLPI=true` | Solo GLPI en mock |
| `MOCK_ANTHROPIC=true` | Solo Anthropic/IA en mock |

> **Retrocompatibilidad:** `APP_ENV=lab` sigue funcionando como alias de `MOCK_ALL=true`.

### Iniciar en modo mock completo
```bash
cd backend
MOCK_ALL=true uvicorn main:app --reload
# → http://localhost:8000
# → GET /api/system/mock-status para ver estado de mocks
```

### Modo híbrido (ejemplo: MikroTik real, resto mock)
```bash
MOCK_WAZUH=true MOCK_GLPI=true MOCK_ANTHROPIC=true uvicorn main:app --reload
```

### Arquitectura del sistema de mock

```
mock_data.py         ← Datos estáticos reproducibles (seed=42)
   ├── MockData.mikrotik.*    interfaces, ARP, firewall, logs, traffic…
   ├── MockData.wazuh.*       agents, alerts, MITRE, health…
   ├── MockData.glpi.*        computers, tickets, users, locations…
   ├── MockData.ai.*          mock_report() → HTML de reporte simulado
   ├── MockData.portal.*      sessions, users, profiles, stats…
   └── MockData.websocket.*   traffic_tick(), alerts_tick(), portal_session()…

mock_service.py      ← Estado mutable en memoria (CRUD funcional)
   ├── glpi_get_assets / create / update / quarantine…
   ├── glpi_get_tickets / create / update_status…
   ├── portal_get_users / create / update / delete…
   └── get_mock_status() → {mock_all, services, any_mock_active}
```

### Entidades coherentes entre servicios

Las entidades mock son consistentes entre MikroTik, Wazuh y GLPI:

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
- Polling cada 30 s a `GET /api/system/mock-status`

---

## Decisiones de arquitectura

### ¿Por qué singleton para MikroTik?
RouterOS tiene un límite bajo de sesiones API concurrentes. Un singleton con `asyncio.Lock` garantiza una sola conexión persistente compartida entre todos los requests. La reconexión es automática si la conexión se cae.

### ¿Por qué `run_in_executor` para routeros-api?
La librería `routeros-api` es 100% síncrona y bloquea el event loop. Se ejecuta en el thread pool default del executor para no bloquear el servidor async.

### ¿Por qué httpx en vez de requests para Wazuh?
`httpx` soporta async nativo, lo que es consistente con la arquitectura async de FastAPI. Además soporta HTTP/2 si se necesita en el futuro.

### ¿Por qué SQLite y no PostgreSQL?
Para el laboratorio, SQLite elimina la dependencia de un servidor de base de datos adicional. La arquitectura está preparada para migrar: solo se cambia `DATABASE_URL` en `.env` a un string de PostgreSQL (`postgresql+asyncpg://...`) y se instala `asyncpg`.

### ¿Por qué function calling en la IA?
Claude puede decidir qué datos necesita fetch en runtime según lo que el usuario pidió en su prompt. Esto evita enviar datos innecesarios y permite reportes más inteligentes que correlacionan múltiples fuentes.

### ¿Por qué TailwindCSS v4 con `@theme` en vez de tailwind.config.js?
TailwindCSS v4 usa CSS nativo para configuración de tokens. No hay archivo `tailwind.config.js`. Los tokens se definen con `@theme` en `index.css` y se integra via el plugin Vite `@tailwindcss/vite`.

### ¿Por qué TipTap y no otro editor?
TipTap es el editor más flexible para React, permite extensiones custom, y genera HTML limpio que WeasyPrint puede renderizar directamente a PDF sin conversiones intermedias.

### ¿Por qué mock guards en cada servicio y no en los routers?
Los guards en los servicios permiten reusar la misma lógica de mock desde los WebSockets (que no pasan por los routers). Si estuvieran solo en los routers, los WS seguirían intentando conectarse a sistemas externos incluso en modo mock.
