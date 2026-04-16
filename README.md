<div align="center">

# 🛡️ NetShield Dashboard

**Plataforma unificada de monitoreo, detección de amenazas y gestión de seguridad de red**

[![Python](https://img.shields.io/badge/Python-3.12+-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?style=for-the-badge&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://typescriptlang.org)
[![TailwindCSS](https://img.shields.io/badge/TailwindCSS-v4-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)](https://tailwindcss.com)

*Integra MikroTik CHR · Wazuh SIEM · CrowdSec CTI · Claude AI · GLPI ITSM en un único panel de control*

</div>

---

## ✨ ¿Qué es NetShield?

NetShield Dashboard es una plataforma de monitoreo y gestión de seguridad de red que unifica en un solo lugar:

- **🌐 MikroTik CHR** — Control del router vía API RouterOS: firewall, VLANs, tráfico en tiempo real, portal cautivo
- **🔍 Wazuh SIEM** — Visualización de alertas de seguridad, estado de agentes y eventos MITRE ATT&CK
- **🛡️ CrowdSec** — Inteligencia colaborativa de amenazas: decisiones de bloqueo, reputación de IPs, escenarios, bouncers y heatmaps geográficos
- **🤖 Claude AI** — Generación automática de reportes inteligentes con datos en vivo vía function calling
- **📦 GLPI** — Inventario de activos, tickets de soporte y correlación con eventos Wazuh
- **📄 PDF Export** — Exportación de reportes profesionales con WeasyPrint
- **🎣 Phishing** — Detección de dominios sospechosos, sinkhole DNS, alertas de víctimas
- **🔒 Portal Cautivo** — Gestión de hotspot MikroTik: sesiones, usuarios, perfiles de velocidad

> **Fase actual:** Laboratorio de pruebas. Diseñado para escalar a entornos reales con 1000+ usuarios concurrentes sin reescribir la arquitectura.

---

## 🖥️ Pantallas principales

| Panel | Ruta | Descripción |
|-------|------|-------------|
| **Quick View** | `/` | Vista de seguridad unificada: stat cards, tráfico en vivo, alertas, conexiones activas |
| **Configuración de Seguridad** | `/security/config` | Blacklists, geo-block, DNS sinkhole, reglas de auto-bloqueo |
| **Red & IPs** | `/network` | Tabla ARP, VLANs (CRUD + tráfico en vivo), etiquetas y grupos de IPs, búsqueda global |
| **Firewall** | `/firewall` | Bloqueo de IPs, reglas activas, historial de acciones |
| **Portal Cautivo** | `/portal` | Sesiones en tiempo real, usuarios CRUD, perfiles de velocidad, horarios |
| **Phishing** | `/phishing` | Alertas de phishing, víctimas, gestión de sinkhole DNS |
| **Sistema** | `/system` | Health unificado MikroTik + Wazuh, CLI web integrada (RouterOS y Wazuh Agent) |
| **Reportes IA** | `/reports` | Prompt libre, selector de audiencia/fuentes, editor TipTap, exportar PDF |
| **Inventario (GLPI)** | `/inventory` | Activos en kanban, tickets, correlación Wazuh, cuarentena |
| **CrowdSec — Centro de Comando** | `/crowdsec` | Decisiones activas, métricas en tiempo real, estado de bouncers, top atacantes |
| **CrowdSec — Inteligencia** | `/crowdsec/intelligence` | Lookup de reputación de IPs, escenarios de detección, heatmap geográfico |
| **CrowdSec — Configuración** | `/crowdsec/config` | Whitelist, gestión de bouncers, sincronización con MikroTik firewall |

---

## 🧱 Stack Técnico

### Backend (Python 3.12+)

| Paquete | Propósito |
|---------|-----------|
| **FastAPI** 0.115 | Framework web async |
| **SQLAlchemy** 2.0 + aiosqlite | ORM async con SQLite |
| **routeros-api** | Cliente API MikroTik (ejecutado en thread pool) |
| **httpx** | Cliente HTTP async para Wazuh y CrowdSec |
| **anthropic** | SDK Claude para reportes con IA (function calling) |
| **WeasyPrint** + Jinja2 | Generación de PDF desde plantillas HTML |
| **structlog** | Logging estructurado (console en dev, JSON en prod) |
| **tenacity** | Reintentos con backoff exponencial |
| **Pydantic v2** | Validación de datos y configuración |

### Frontend

| Paquete | Propósito |
|---------|-----------|
| **React 19** | UI framework |
| **Vite 8** + TypeScript | Bundler y tipado estático |
| **TailwindCSS v4** | Estilos con tokens custom vía `@theme` |
| **TanStack Query** | Data fetching, cache y sincronización |
| **Recharts** | Gráficos de tráfico en tiempo real |
| **TipTap** | Editor de texto enriquecido para reportes |
| **Lucide React** | Iconografía |
| **Axios** | Cliente HTTP centralizado |

---

## 🚀 Cómo levantar el proyecto

### Requisitos previos
- Python 3.12+
- Node.js 20+
- `uv` (recomendado) o `pip`

### Backend
```bash
cd backend

# Crear entorno virtual
python -m venv .venv
source .venv/bin/activate

# Instalar dependencias
pip install -r requirements.txt

# Configurar variables de entorno
cp .env.example .env
# Editar .env con tus credenciales reales

# Ejecutar
python main.py
# → API REST:    http://localhost:8000
# → Swagger UI:  http://localhost:8000/docs
```

### Frontend
```bash
cd frontend
npm install
npm run dev
# → http://localhost:5173
```

> El proxy de Vite redirige automáticamente `/api/*` → `localhost:8000` y `/ws/*` → `ws://localhost:8000`. No se necesita configurar CORS manualmente en desarrollo.

---

## 🧪 Modo Mock (Sin infraestructura externa)

NetShield incluye un sistema completo de datos simulados que permite usar **todas las funcionalidades sin tener MikroTik, Wazuh, GLPI, CrowdSec ni una API key de Anthropic**.

```bash
# Activar mock total
cd backend
MOCK_ALL=true python main.py

# O activar servicios específicos en mock
MOCK_WAZUH=true MOCK_GLPI=true python main.py
```

| Variable | Efecto |
|----------|--------|
| `MOCK_ALL=true` | Activa mock en todos los servicios |
| `MOCK_MIKROTIK=true` | Solo MikroTik en mock |
| `MOCK_WAZUH=true` | Solo Wazuh en mock |
| `MOCK_GLPI=true` | Solo GLPI en mock |
| `MOCK_ANTHROPIC=true` | Solo generación de reportes en mock |
| `MOCK_CROWDSEC=true` | Solo CrowdSec en mock |

> **Retrocompatibilidad:** `APP_ENV=lab` sigue funcionando como alias de `MOCK_ALL=true`.

Cuando algún servicio está en mock, el frontend muestra un **badge amarillo** visible en la barra superior indicando qué servicios son simulados.

---

## 🏗️ Arquitectura

```
netShield2/
│
├── backend/
│   ├── main.py                  # App FastAPI, WebSockets, middleware
│   ├── config.py                # Configuración con pydantic-settings
│   ├── database.py              # SQLAlchemy async + SQLite
│   ├── routers/                 # 11 routers REST
│   │   ├── mikrotik.py          # Endpoints MikroTik (interfaces, ARP, firewall)
│   │   ├── vlans.py             # CRUD de VLANs + tráfico
│   │   ├── wazuh.py             # Alertas, agentes, MITRE ATT&CK
│   │   ├── network.py           # Labels y grupos de IPs
│   │   ├── reports.py           # Generación de reportes IA + PDF
│   │   ├── glpi.py              # Inventario, tickets, cuarentena
│   │   ├── portal.py            # Portal cautivo MikroTik Hotspot
│   │   ├── phishing.py          # Sinkhole, alertas, víctimas
│   │   ├── security.py          # Auto-block, geo-block, cuarentena
│   │   ├── crowdsec.py          # Decisiones, métricas, bouncers, CTI
│   │   └── cli.py               # Terminal web (RouterOS + Wazuh Agent)
│   ├── services/                # Lógica de negocio (singletons)
│   │   ├── mikrotik_service.py  # Singleton con asyncio.Lock
│   │   ├── wazuh_service.py     # JWT auth con refresh automático
│   │   ├── glpi_service.py      # CRUD completo de GLPI
│   │   ├── portal_service.py    # Hotspot sessions, users, profiles
│   │   ├── crowdsec_service.py  # LAPI + CTI integration
│   │   ├── ai_service.py        # Claude function calling
│   │   ├── pdf_service.py       # WeasyPrint + Jinja2
│   │   ├── auth_provider.py     # Proveedor de autenticación
│   │   ├── mock_data.py         # Datos simulados reproducibles (seed=42)
│   │   └── mock_service.py      # CRUD en memoria para modo mock
│   ├── models/                  # Modelos SQLAlchemy
│   ├── schemas/                 # Schemas Pydantic v2
│   └── templates/               # Plantilla HTML para PDF
│
├── frontend/
│   └── src/
│       ├── App.tsx              # Rutas SPA (12 vistas)
│       ├── types.ts             # Tipos TypeScript compartidos
│       ├── index.css            # Design system y tokens @theme
│       ├── services/
│       │   └── api.ts           # Cliente API centralizado (Axios)
│       ├── hooks/               # 23 custom hooks (TanStack Query + WebSocket)
│       │   ├── useWebSocket.ts          # Hook base WebSocket con reconexión
│       │   ├── useVlans.ts              # CRUD de VLANs
│       │   ├── useVlanTraffic.ts        # WebSocket tráfico por VLAN
│       │   ├── useSecurityAlerts.ts     # Alertas de seguridad
│       │   ├── useSecurityActions.ts    # Acciones de bloqueo
│       │   ├── useWazuhSummary.ts       # Resumen Wazuh
│       │   ├── useMikrotikHealth.ts     # Health MikroTik
│       │   ├── useGlpiAssets.ts         # Activos GLPI
│       │   ├── useGlpiTickets.ts        # Tickets GLPI
│       │   ├── useGlpiUsers.ts          # Usuarios GLPI
│       │   ├── useGlpiHealth.ts         # Health GLPI
│       │   ├── usePortalSessions.ts     # Sesiones portal cautivo
│       │   ├── usePortalUsers.ts        # Usuarios portal
│       │   ├── usePortalConfig.ts       # Configuración portal
│       │   ├── usePortalStats.ts        # Estadísticas portal
│       │   ├── usePhishing.ts           # Datos de phishing
│       │   ├── useNetworkSearch.ts      # Búsqueda global de red
│       │   ├── useIpContext.ts          # Panel contextual de IPs
│       │   ├── useCrowdSecDecisions.ts  # Decisiones CrowdSec
│       │   ├── useCrowdSecAlerts.ts     # Alertas CrowdSec
│       │   ├── useCrowdSecMetrics.ts    # Métricas CrowdSec
│       │   ├── useSyncStatus.ts         # Estado de sincronización
│       │   └── useQrScanner.ts          # Scanner QR (portal)
│       └── components/          # Componentes por dominio
│           ├── Layout.tsx               # Sidebar glassmorphic + topbar
│           ├── common/                  # Componentes compartidos
│           ├── dashboard/               # Dashboard widgets
│           ├── security/                # QuickView + ConfigView
│           ├── firewall/                # Reglas y bloqueos
│           ├── network/                 # ARP, VLANs, labels, groups
│           ├── portal/                  # Portal cautivo
│           ├── phishing/                # Panel de phishing
│           ├── reports/                 # Editor TipTap + generador IA
│           ├── inventory/               # GLPI kanban + tickets
│           ├── crowdsec/                # 13 componentes CrowdSec
│           ├── system/                  # SystemHealth + CLI
│           ├── vlans/                   # Componentes legacy VLANs
│           └── utils/                   # Utilidades UI
│
├── docs/                        # Documentación técnica
│   ├── architecture-*.md        # Diagramas de arquitectura
│   ├── routes-index-*.md        # Índice de rutas API
│   └── function/                # Documentación por módulo
│
└── postman/                     # Colección Postman (104+ requests)
```

### WebSocket Endpoints

| Endpoint | Descripción |
|----------|-------------|
| `WS /ws/traffic` | Stream de tráfico en tiempo real |
| `WS /ws/alerts` | Stream de alertas de seguridad |
| `WS /ws/vlans/traffic` | Tráfico por VLAN en tiempo real |
| `WS /ws/security/alerts` | Alertas de seguridad enriquecidas |
| `WS /ws/portal/sessions` | Sesiones del portal cautivo en vivo |
| `WS /ws/crowdsec/decisions` | Decisiones CrowdSec en tiempo real |

### Decisiones de arquitectura notables

- **Singleton para MikroTik** — RouterOS tiene límite bajo de sesiones. Un singleton con `asyncio.Lock` garantiza una conexión persistente compartida.
- **`run_in_executor` para routeros-api** — La librería es síncrona y bloquearía el event loop. Se ejecuta en el thread pool del executor.
- **WebSockets para datos en vivo** — Tráfico, alertas, VLANs, sesiones del portal y decisiones CrowdSec se transmiten vía WebSocket con reconexión automática en el frontend.
- **SQLite → PostgreSQL ready** — Solo cambiando `DATABASE_URL` en `.env` a `postgresql+asyncpg://...` se puede migrar sin tocar código.
- **Mock guards en servicios, no en routers** — Los WebSockets no pasan por los routers, así que los guards deben estar en la capa de servicio para funcionar correctamente en modo mock.
- **CrowdSec como capa complementaria** — Se sincroniza con el firewall MikroTik: las decisiones de CrowdSec pueden traducirse automáticamente en reglas de bloqueo en el router.

---

## 🔌 API Reference

La documentación interactiva completa está disponible en `/docs` (Swagger UI) cuando se corre el backend:

```
GET  /api/health                    — Estado del sistema
GET  /api/system/mock-status        — Estado actual de cada servicio (real o mock)

# MikroTik
GET  /api/mikrotik/*                — Interfaces, ARP, firewall, tráfico
POST /api/mikrotik/firewall/block   — Bloquear IP
POST /api/mikrotik/firewall/unblock — Desbloquear IP

# VLANs
GET  /api/vlans                     — Lista de VLANs
POST /api/vlans                     — Crear VLAN
PUT  /api/vlans/:id                 — Actualizar VLAN
DEL  /api/vlans/:id                 — Eliminar VLAN

# Wazuh
GET  /api/wazuh/*                   — Alertas, agentes, MITRE, health

# Network
GET  /api/network/labels            — Etiquetas de IPs
GET  /api/network/groups            — Grupos de IPs

# CrowdSec
GET  /api/crowdsec/decisions        — Decisiones activas
GET  /api/crowdsec/metrics          — Métricas del motor
GET  /api/crowdsec/bouncers         — Estado de bouncers
GET  /api/crowdsec/scenarios        — Escenarios de detección
POST /api/crowdsec/cti/lookup       — Lookup de reputación de IP
POST /api/crowdsec/sync             — Sincronizar con MikroTik

# GLPI
GET  /api/glpi/*                    — Activos, tickets, usuarios, ubicaciones

# Portal Cautivo
GET  /api/portal/*                  — Sesiones, usuarios, perfiles, config

# Reportes
POST /api/reports/generate          — Generar reporte con IA
POST /api/reports/export-pdf        — Exportar a PDF

# Phishing
GET  /api/phishing/*                — Alertas, víctimas, sinkhole

# Security
POST /api/security/*                — Auto-block, geo-block, cuarentena
```

> La carpeta `/postman/` incluye una colección con **104+ requests** y 3 entornos preconfigurados (mock, local real, lab).

---

## 🔒 Consideraciones de seguridad

> Este proyecto está pensado para **laboratorio de pruebas**. Para producción se deben implementar:

- [ ] Autenticación de usuarios (JWT o sesiones)
- [ ] Rate limiting en endpoints
- [ ] Validación de permisos por rol (RBAC)
- [ ] Cache Redis para métricas de tiempo real
- [ ] Reemplazar `verify=False` en HTTPS (Wazuh) con certificados válidos
- [ ] Configuración CORS estricta (sin wildcards)
- [ ] Certificados TLS para CrowdSec LAPI en producción

---

## 📋 Testing

```bash
# Importar colección en Postman
postman/NetShield.postman_collection.json

# Entornos disponibles:
# - env_local_mock.json    → localhost:8000 con MOCK_ALL=true
# - env_local_real.json    → localhost:8000 con servicios reales
# - env_lab.json           → IP remota del laboratorio
```

---

## 📚 Documentación adicional

| Documento | Descripción |
|-----------|-------------|
| [`CONTEXT.md`](CONTEXT.md) | Contexto técnico completo: stack, infraestructura de lab, convenciones de código, estado detallado |
| [`AGENTS.md`](AGENTS.md) | Definición de agentes especializados para asistentes de IA |
| [`docs/`](docs/) | Diagramas de arquitectura, índice de rutas, documentación por módulo |
| [`backend/.env.example`](backend/.env.example) | Variables de entorno del backend con descripción |
| [`.env.example`](.env.example) | Variables de entorno globales de referencia |

---

<div align="center">

**Hecho con ❤️ para monitoreo de redes**

*NetShield Dashboard — v2.0*

</div>
