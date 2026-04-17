<div align="center">

# 🛡️ NetShield Dashboard

**Plataforma unificada de monitoreo, detección de amenazas y gestión de seguridad de red**

[![Python](https://img.shields.io/badge/Python-3.12+-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?style=for-the-badge&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://typescriptlang.org)
[![TailwindCSS](https://img.shields.io/badge/TailwindCSS-v4-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)](https://tailwindcss.com)

*Integra MikroTik CHR · Wazuh SIEM · CrowdSec CTI · Suricata IDS/IPS/NSM · MaxMind GeoLite2 · Claude AI · GLPI ITSM · Telegram Bot en un único panel de control*

</div>

---

## ✨ ¿Qué es NetShield?

NetShield Dashboard es una plataforma de monitoreo y gestión de seguridad de red que unifica en un solo lugar:

- **🌐 MikroTik CHR** — Control del router vía API RouterOS: firewall, VLANs, tráfico en tiempo real, portal cautivo
- **🔍 Wazuh SIEM** — Visualización de alertas de seguridad, estado de agentes y eventos MITRE ATT&CK
- **🛡️ CrowdSec** — Inteligencia colaborativa de amenazas: decisiones de bloqueo, reputación de IPs, escenarios, bouncers y heatmaps geográficos
- **📡 Suricata IDS/IPS/NSM** — Motor de análisis de red: detección de amenazas en capa de red, bloqueo inline (IPS), forense de tráfico (NSM). Flujo: `Tráfico → Suricata (eve.json) → Wazuh → NetShield`
- **🌍 GeoLite2 (MaxMind)** — Geolocalización local de IPs sin latencia: país, ciudad, coordenadas, ASN, tipo de red (ISP/Hosting/Datacenter/Tor). Enriquece automáticamente decisiones CrowdSec y alertas Wazuh
- **🤖 Claude AI** — Generación automática de reportes inteligentes con datos en vivo vía function calling
- **📦 GLPI** — Inventario de activos, tickets de soporte y correlación con eventos Wazuh
- **📄 PDF Export** — Exportación de reportes profesionales con WeasyPrint
- **🎣 Phishing** — Detección de dominios sospechosos, sinkhole DNS, alertas de víctimas
- **🔒 Portal Cautivo** — Gestión de hotspot MikroTik: sesiones, usuarios, perfiles de velocidad
- **💬 Telegram Bot** — Canal de notificaciones bidireccional: alertas outbound automáticas + consultas en lenguaje natural respondidas por Claude AI (inbound)

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
| **Sistema** | `/system` | Health unificado MikroTik + Wazuh, estado GeoLite2, CLI web integrada |
| **Reportes** | `/reports` | **Generador IA** (prompt libre, TipTap, PDF) + **Telegram** (bot status, configs automáticos, historial) |
| **Inventario (GLPI)** | `/inventory` | Activos en kanban, tickets, correlación Wazuh, cuarentena |
| **CrowdSec — Centro de Comando** | `/crowdsec` | Decisiones activas + bandera/ciudad/tipo de red por IP, métricas, bouncers, top atacantes |
| **CrowdSec — Inteligencia** | `/crowdsec/intelligence` | Top países atacantes (cross-source), sugerencias de geo-bloqueo, escenarios, heatmap |
| **CrowdSec — Configuración** | `/crowdsec/config` | Whitelist, gestión de bouncers, sincronización con MikroTik firewall |
| **Suricata — Motor** | `/suricata` | Estado del motor IDS/IPS, métricas en tiempo real, categorías de alertas, circuito de auto-response |
| **Suricata — Alertas** | `/suricata/alerts` | Alertas IDS/IPS con live feed WebSocket, timeline, top firmas, filtros avanzados |
| **Suricata — Red NSM** | `/suricata/network` | Flujos de red, consultas DNS, transacciones HTTP, handshakes TLS capturados |
| **Suricata — Reglas** | `/suricata/rules` | Gestión de firmas: toggle on/off, rulesets, actualización vía suricata-update |

---

## 🧱 Stack Técnico

### Backend (Python 3.12+)

| Paquete | Propósito |
|---------|-----------|
| **FastAPI** 0.115 | Framework web async |
| **SQLAlchemy** 2.0 + aiosqlite | ORM async con SQLite |
| **routeros-api** | Cliente API MikroTik (ejecutado en thread pool) |
| **httpx** | Cliente HTTP async para Wazuh y CrowdSec |
| **geoip2** 4.8.1 | Consulta local de bases de datos MaxMind GeoLite2 |
| **cachetools** 5.5.0 | TTLCache (10 000 entradas, TTL de 1 hora) para lookups GeoIP |
| **anthropic** | SDK Claude para reportes con IA (function calling) + consultas bot Telegram |
| **python-telegram-bot** 22+ | SDK async Telegram Bot API (PTB) |
| **apscheduler** 3.10+ | Scheduler async para reportes automáticos en cron |
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

### Backend

> ⚠️ **El venv se crea en la raíz del proyecto**, no dentro de `backend/`. Siempre activá el venv desde `netShield2/` o usá la ruta relativa `../.venv/bin/python`.

```bash
# Desde la raíz del proyecto
cd netShield2

# Crear entorno virtual (solo la primera vez)
python -m venv .venv
source .venv/bin/activate   # Linux/macOS
# .venv\Scripts\activate    # Windows

# Instalar dependencias
pip install -r backend/requirements.txt

# Configurar variables de entorno
cp backend/.env.example backend/.env
# Editar backend/.env con tus credenciales reales

# Ejecutar (con venv activado desde la raíz)
cd backend
python main.py
# → API REST:    http://localhost:8000
# → Swagger UI:  http://localhost:8000/docs

# Alternativa sin activar el venv:
cd backend && MOCK_ALL=true ../.venv/bin/python main.py
```

### Frontend
```bash
cd frontend
npm install
npm run dev
# → http://localhost:5173
```

> El proxy de Vite redirige automáticamente `/api/*` → `localhost:8000` y `/ws/*` → `ws://localhost:8000`. El backend debe estar corriendo antes que el frontend.

---

## 🧪 Modo Mock (Sin infraestructura externa)

NetShield incluye un sistema completo de datos simulados que permite usar **todas las funcionalidades sin tener MikroTik, Wazuh, GLPI, CrowdSec, Suricata, GeoLite2 ni una API key de Anthropic**.

```bash
# Activar mock total
cd backend
MOCK_ALL=true ../.venv/bin/python main.py

# O activar servicios específicos en mock
MOCK_WAZUH=true MOCK_GLPI=true ../.venv/bin/python main.py
```

| Variable | Efecto |
|----------|--------|
| `MOCK_ALL=true` | Activa mock en todos los servicios |
| `MOCK_MIKROTIK=true` | Solo MikroTik en mock |
| `MOCK_WAZUH=true` | Solo Wazuh en mock |
| `MOCK_GLPI=true` | Solo GLPI en mock |
| `MOCK_ANTHROPIC=true` | Solo generación de reportes en mock |
| `MOCK_CROWDSEC=true` | Solo CrowdSec en mock |
| `MOCK_GEOIP=true` | Solo GeoIP en mock (default: `true`) |
| `MOCK_SURICATA=true` | Solo Suricata en mock (default: `true`) |
| `MOCK_TELEGRAM=true` | Solo Telegram Bot en mock (default: `true`) |

> **Retrocompatibilidad:** `APP_ENV=lab` sigue funcionando como alias de `MOCK_ALL=true`.

Cuando algún servicio está en mock, el frontend muestra un **badge amarillo** visible en la barra superior indicando qué servicios son simulados.

---

## 📡 Suricata IDS/IPS/NSM

NetShield integra **Suricata** como capa de visibilidad de red, complementando a Wazuh (visibilidad de host) y CrowdSec (inteligencia comunitaria).

### Arquitectura del flujo de datos

```
Tráfico de red
    │
    ▼
Suricata (IDS/IPS/NSM)
    │ eve.json
    ▼
Agente Wazuh (recolecta)
    │
    ▼
Wazuh Manager
    │
    ▼
NetShield API ──► Dashboard
```

### Modos de operación

| Modo | Descripción |
|------|-------------|
| **IDS** | Detección pasiva — analiza tráfico y genera alertas sin bloquear |
| **IPS** | Bloqueo inline — descarta paquetes maliciosos en tiempo real |
| **NSM** | Forense de red — registra metadatos (flujos, DNS, HTTP, TLS) para auditoría |

### Circuito de Auto-Response

Cuando Suricata detecta una amenaza que supera el umbral configurado, el circuito puede activar automáticamente:
1. **CrowdSec ban** — Agrega decisión de bloqueo en LAPI
2. **MikroTik block** — Agrega IP a `Blacklist_Automatica` en el firewall

> ⚠️ El auto-trigger sin confirmación humana está **deshabilitado por defecto**. Toda acción de respuesta pasa por `ConfirmModal` en el frontend.

### Configurar Suricata real (producción)

```bash
# Variables en backend/.env:
MOCK_SURICATA=false
SURICATA_SOCKET=/var/run/suricata/suricata.socket
SURICATA_EVE_LOG=/var/log/suricata/eve.json
# SURICATA_HOST=192.168.88.1  # Si corre en host remoto

# El agente Wazuh debe estar configurado para recolectar eve.json:
# /var/ossec/etc/ossec.conf → <localfile> con eve.json
```

---

## 🌍 Geolocalización de IPs (GeoLite2)

NetShield integra las bases de datos **MaxMind GeoLite2** para geolocalizar IPs de forma local — sin latencia de red, sin límites de requests y sin costos adicionales.

### ¿Qué información provee?

| Campo | Descripción |
|-------|-------------|
| `country_code` / `country_name` | País de origen (ISO 3166-1) |
| `city` | Ciudad |
| `latitude` / `longitude` | Coordenadas geográficas |
| `asn` / `as_name` | Número y nombre del sistema autónomo |
| `network_type` | ISP · Hosting · Business · Residential |
| `is_datacenter` | IP de datacenter / hosting cloud |
| `is_tor` | Nodo de salida Tor conocido |

### ¿Dónde aparece en la UI?

- **DecisionsTable (CrowdSec)** — Bandera emoji + ciudad + badge ISP/DC/Tor por cada IP bloqueada
- **IntelligenceView** — Widget "Top Países Atacantes" con filtro por fuente (CrowdSec / Wazuh / MikroTik)
- **IntelligenceView** — Panel de "Sugerencias de Geo-Bloqueo" generadas automáticamente
- **SystemHealth** — Estado de las bases de datos GeoLite2 con fecha de build y tamaño de caché

### Configurar GeoLite2 real (producción)

```bash
# 1. Registrarse gratis en:
#    https://www.maxmind.com/en/geolite2/signup

# 2. Agregar al backend/.env:
MAXMIND_LICENSE_KEY=tu_clave_aqui

# 3. Descargar las bases de datos:
python backend/scripts/download_geoip.py

# 4. Activar modo real:
#    En backend/.env: MOCK_GEOIP=false

# 5. Reiniciar el backend
```

> Las DBs se descargan en `backend/data/geoip/`. MaxMind actualiza GeoLite2 los martes. Se recomienda automatizar la descarga mensualmente.

---

## 🏗️ Arquitectura

```
netShield2/
│
├── backend/
│   ├── main.py                  # App FastAPI, WebSockets, middleware
│   ├── config.py                # Configuración con pydantic-settings
│   ├── database.py              # SQLAlchemy async + SQLite
│   ├── data/
│   │   └── geoip/               # GeoLite2-City.mmdb + GeoLite2-ASN.mmdb (no en git)
│   ├── scripts/
│   │   └── download_geoip.py    # Script de descarga de bases de datos MaxMind
│   ├── routers/                 # 13 routers REST
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
│   │   ├── geoip.py             # Lookup/bulk, top países/ASNs, sugerencias de geo-bloqueo
│   │   ├── suricata.py          # Motor IDS/IPS/NSM: 24 endpoints (engine, alerts, flows, rules, correlation, autoresponse)
│   │   └── cli.py               # Terminal web (RouterOS + Wazuh Agent)
│   ├── services/                # Lógica de negocio (singletons)
│   │   ├── mikrotik_service.py  # Singleton con asyncio.Lock
│   │   ├── wazuh_service.py     # JWT auth con refresh automático + enriquecimiento GeoIP
│   │   ├── glpi_service.py      # CRUD completo de GLPI
│   │   ├── portal_service.py    # Hotspot sessions, users, profiles
│   │   ├── crowdsec_service.py  # LAPI + CTI + enriquecimiento GeoIP en decisions
│   │   ├── geoip_service.py     # Singleton GeoLite2 + TTLCache(10000, ttl=3600)
│   │   ├── suricata_service.py  # Singleton: Unix socket async, alertas vía Wazuh, flujos NSM, correlación CrowdSec/Wazuh, auto-response
│   │   ├── telegram_service.py  # Singleton: send_message (retry×3), send_alert, send_status_summary, process_incoming_message → answer_query (Claude AI), pending queue
│   │   ├── telegram_scheduler.py # APScheduler AsyncIOScheduler: sync de jobs desde DB cada minuto, cron por config
│   │   ├── ai_service.py        # Claude function calling + TELEGRAM_SYSTEM_PROMPT + answer_telegram_query()
│   │   ├── pdf_service.py       # WeasyPrint + Jinja2
│   │   ├── auth_provider.py     # Proveedor de autenticación
│   │   ├── mock_data.py         # Datos simulados reproducibles (seed=42) + MockData.suricata + MockData.telegram
│   │   └── mock_service.py      # CRUD en memoria + estado de mock por servicio (incluye telegram)
│   ├── models/                  # Modelos SQLAlchemy
│   ├── schemas/                 # Schemas Pydantic v2 (incluye suricata.py, geoip.py)
│   └── templates/               # Plantilla HTML para PDF
│
├── frontend/
│   └── src/
│       ├── App.tsx              # Rutas SPA (16 vistas)
│       ├── types.ts             # Tipos TypeScript compartidos (incluye Suricata, GeoIP, Telegram)
│       ├── index.css            # Design system y tokens @theme
│       ├── services/
│       │   └── api.ts           # Cliente API centralizado (suricataApi + geoipApi + telegramApi + ...)
│       ├── hooks/               # 32 custom hooks (TanStack Query + WebSocket)
│       │   ├── useWebSocket.ts              # Hook base WebSocket con reconexión
│       │   ├── useSuricataEngine.ts         # Estado motor + series + reloadRules
│       │   ├── useSuricataAlerts.ts         # Alertas REST + suscripción /ws/suricata/alerts
│       │   ├── useSuricataFlows.ts          # Flujos, DNS, HTTP, TLS
│       │   ├── useSuricataRules.ts          # Reglas + toggle + suricata-update
│       │   ├── useSuricataAutoResponse.ts   # Config + historial + trigger con guard
│       │   ├── useSuricataCorrelation.ts    # Correlación CrowdSec×Suricata + Wazuh×Suricata
│       │   ├── useGeoIP.ts                  # Lookup GeoIP individual (stale 1h)
│       │   ├── useTopCountries.ts           # Top países con polling 5 min
│       │   ├── useGeoBlockSuggestions.ts    # Sugerencias + apply mutation + dismiss local
│       │   ├── useTelegramStatus.ts         # Estado del bot Telegram (polling 30s)
│       │   ├── useTelegramConfigs.ts        # CRUD configs + sendTest + sendSummary
│       │   ├── useTelegramLogs.ts           # Historial de mensajes con filtros
│       │   ├── useVlans.ts                  # CRUD de VLANs
│       │   ├── useVlanTraffic.ts            # WebSocket tráfico por VLAN
│       │   ├── useSecurityAlerts.ts         # Alertas de seguridad
│       │   ├── useSecurityActions.ts        # Acciones de bloqueo
│       │   ├── useWazuhSummary.ts           # Resumen Wazuh
│       │   ├── useMikrotikHealth.ts         # Health MikroTik
│       │   ├── useGlpiAssets.ts             # Activos GLPI
│       │   ├── useGlpiTickets.ts            # Tickets GLPI
│       │   ├── useGlpiUsers.ts              # Usuarios GLPI
│       │   ├── useGlpiHealth.ts             # Health GLPI
│       │   ├── usePortalSessions.ts         # Sesiones portal cautivo
│       │   ├── usePortalUsers.ts            # Usuarios portal
│       │   ├── usePortalConfig.ts           # Configuración portal
│       │   ├── usePortalStats.ts            # Estadísticas portal
│       │   ├── usePhishing.ts               # Datos de phishing
│       │   ├── useNetworkSearch.ts          # Búsqueda global de red
│       │   ├── useIpContext.ts              # Panel contextual de IPs
│       │   ├── useCrowdSecDecisions.ts      # Decisiones CrowdSec
│       │   ├── useCrowdSecAlerts.ts         # Alertas CrowdSec
│       │   ├── useCrowdSecMetrics.ts        # Métricas CrowdSec
│       │   ├── useSyncStatus.ts             # Estado de sincronización
│       │   └── useQrScanner.ts              # Scanner QR (portal)
│       └── components/          # Componentes por dominio
│           ├── Layout.tsx               # Sidebar glassmorphic + topbar (status dot Suricata incluido)
│           ├── common/                  # Componentes compartidos
│           ├── dashboard/               # Dashboard widgets
│           ├── security/                # QuickView + ConfigView
│           ├── firewall/                # Reglas y bloqueos
│           ├── network/                 # ARP, VLANs, labels, groups
│           ├── portal/                  # Portal cautivo
│           ├── phishing/                # Panel de phishing
│           ├── reports/                 # Generador IA (TipTap) + Telegram Bot (9 componentes)
│           │   ├── TelegramTab.tsx          # Orquestador con sub-nav Estado/Configs/Historial
│           │   ├── TelegramStatusCard.tsx   # Estado del bot + guía de configuración
│           │   ├── TelegramConfigList.tsx   # Cards de configs con toggle/trigger/edit/delete
│           │   ├── TelegramConfigModal.tsx  # Modal crear/editar con CronBuilder + MessagePreview
│           │   ├── CronBuilder.tsx          # Selector visual diario/semanal/mensual
│           │   ├── MessagePreview.tsx       # Vista previa del mensaje en estilo Telegram
│           │   ├── TelegramQuickActions.tsx # Enviar prueba + resumen manual
│           │   ├── TelegramHistory.tsx      # Tabla de mensajes con filtros y rows expandibles
│           │   └── BotConversation.tsx      # Historial de consultas bot estilo chat
│           ├── inventory/               # GLPI kanban + tickets
│           ├── crowdsec/                # 13 componentes CrowdSec
│           ├── suricata/                # 4 páginas: MotorPage · AlertsPage · NSMPage · RulesPage
│           ├── geoip/                   # CountryFlag · NetworkTypeBadge · TopCountriesWidget · GeoBlockSuggestions
│           ├── system/                  # SystemHealth + CLI + GeoIPStatus
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
| `WS /ws/alerts` | Stream de alertas Wazuh |
| `WS /ws/vlans/traffic` | Tráfico por VLAN en tiempo real |
| `WS /ws/security/alerts` | Alertas de seguridad enriquecidas |
| `WS /ws/portal/sessions` | Sesiones del portal cautivo en vivo |
| `WS /ws/crowdsec/decisions` | Decisiones CrowdSec en tiempo real |
| `WS /ws/suricata/alerts` | Alertas IDS/IPS Suricata en tiempo real |

### Decisiones de arquitectura notables

- **Singleton para MikroTik** — RouterOS tiene límite bajo de sesiones. Un singleton con `asyncio.Lock` garantiza una conexión persistente compartida.
- **`run_in_executor` para routeros-api** — La librería es síncrona y bloquearía el event loop. Se ejecuta en el thread pool del executor.
- **WebSockets para datos en vivo** — Tráfico, alertas, VLANs, sesiones del portal, decisiones CrowdSec y alertas Suricata se transmiten vía WebSocket con reconexión automática en el frontend.
- **SQLite → PostgreSQL ready** — Solo cambiando `DATABASE_URL` en `.env` a `postgresql+asyncpg://...` se puede migrar sin tocar código.
- **Mock guards en servicios, no en routers** — Los WebSockets no pasan por los routers, así que los guards deben estar en la capa de servicio para funcionar correctamente en modo mock.
- **CrowdSec como capa complementaria** — Se sincroniza con el firewall MikroTik: las decisiones de CrowdSec pueden traducirse automáticamente en reglas de bloqueo en el router.
- **Suricata como capa de red** — Complementa a Wazuh (host) y CrowdSec (comunidad). Sus alertas se correlacionan con decisiones CrowdSec para identificar amenazas confirmadas por múltiples fuentes.
- **GeoIP enriquecimiento silencioso** — `geoip_service` usa `try/except` alrededor de cada lookup en las capas de servicio. Si falla, los endpoints devuelven el dato original sin el campo `geo`, nunca un error 500.
- **TTLCache para GeoIP** — Las 10 000 entradas más recientes se mantienen en RAM con TTL de 1 hora, evitando consultas repetidas a las .mmdb.
- **Auto-response circuit** — El circuito Suricata → CrowdSec + MikroTik requiere confirmación humana en el frontend (`ConfirmModal`). El auto-trigger sin interacción está deshabilitado por defecto.

---

## 🔌 API Reference

La documentación interactiva completa está disponible en `/docs` (Swagger UI) cuando se corre el backend:

```
GET  /api/health                        — Estado del sistema
GET  /api/system/mock-status            — Estado actual de cada servicio (real o mock)

# MikroTik
GET  /api/mikrotik/*                    — Interfaces, ARP, firewall, tráfico
POST /api/mikrotik/firewall/block       — Bloquear IP
POST /api/mikrotik/firewall/unblock     — Desbloquear IP

# VLANs
GET  /api/vlans                         — Lista de VLANs
POST /api/vlans                         — Crear VLAN
PUT  /api/vlans/:id                     — Actualizar VLAN
DEL  /api/vlans/:id                     — Eliminar VLAN

# Wazuh
GET  /api/wazuh/*                       — Alertas, agentes, MITRE, health

# Network
GET  /api/network/labels                — Etiquetas de IPs
GET  /api/network/groups                — Grupos de IPs

# CrowdSec
GET  /api/crowdsec/decisions            — Decisiones activas (enriquecidas con GeoIP)
GET  /api/crowdsec/metrics              — Métricas del motor
GET  /api/crowdsec/bouncers             — Estado de bouncers
GET  /api/crowdsec/scenarios            — Escenarios de detección
POST /api/crowdsec/cti/lookup           — Lookup de reputación de IP
POST /api/crowdsec/sync                 — Sincronizar con MikroTik

# Suricata (24 endpoints)
GET  /api/suricata/engine/status        — Estado del motor (modo, versión, métricas)
GET  /api/suricata/engine/stats         — Métricas + serie temporal
POST /api/suricata/engine/reload-rules  — Recargar reglas en caliente (hot-reload)
GET  /api/suricata/alerts               — Alertas IDS/IPS con filtros
GET  /api/suricata/alerts/timeline      — Timeline de alertas por minuto (IDS vs IPS)
GET  /api/suricata/alerts/top-signatures — Top firmas por hits
GET  /api/suricata/alerts/categories    — Distribución por categoría (donut chart)
GET  /api/suricata/alerts/:id           — Detalle de alerta
GET  /api/suricata/flows                — Flujos de red NSM
GET  /api/suricata/flows/stats          — Estadísticas de flujos
GET  /api/suricata/flows/dns            — Consultas DNS capturadas
GET  /api/suricata/flows/http           — Transacciones HTTP capturadas
GET  /api/suricata/flows/tls            — Handshakes TLS (JA3/SNI)
GET  /api/suricata/rules                — Reglas/firmas
GET  /api/suricata/rules/rulesets       — Rulesets disponibles
GET  /api/suricata/rules/:sid           — Detalle de regla
PUT  /api/suricata/rules/:sid/toggle    — Habilitar/deshabilitar regla
POST /api/suricata/rules/update         — Actualizar reglas (suricata-update)
GET  /api/suricata/correlation/crowdsec — IPs con alertas Suricata + decisión CrowdSec
GET  /api/suricata/correlation/wazuh    — Correlación temporal Suricata × Wazuh
POST /api/suricata/autoresponse/trigger — Activar auto-response (requiere ConfirmModal)
GET  /api/suricata/autoresponse/config  — Configuración del circuito
PUT  /api/suricata/autoresponse/config  — Actualizar configuración

# GeoIP
GET  /api/geoip/lookup/{ip}             — Geolocalizar una IP
POST /api/geoip/lookup/bulk             — Geolocalizar hasta 200 IPs
GET  /api/geoip/stats/top-countries     — Top países atacantes (cross-source)
GET  /api/geoip/stats/top-asns          — Top ASNs atacantes
GET  /api/geoip/suggestions/geo-block   — Sugerencias de geo-bloqueo automáticas
POST /api/geoip/suggestions/{id}/apply  — Aplicar una sugerencia de geo-bloqueo
GET  /api/geoip/db/status               — Estado de las bases de datos GeoLite2

# GLPI
GET  /api/glpi/*                        — Activos, tickets, usuarios, ubicaciones

# Portal Cautivo
GET  /api/portal/*                      — Sesiones, usuarios, perfiles, config

# Reportes
POST /api/reports/generate              — Generar reporte con IA
POST /api/reports/export-pdf            — Exportar a PDF
GET  /api/reports/history               — Historial de reportes

# Telegram Bot (11 endpoints)
GET  /api/reports/telegram/status       — Estado de conexión del bot
POST /api/reports/telegram/test         — Enviar mensaje de prueba
GET  /api/reports/telegram/configs      — Listar configuraciones de reportes
POST /api/reports/telegram/configs      — Crear configuración
PUT  /api/reports/telegram/configs/{id} — Actualizar configuración
DEL  /api/reports/telegram/configs/{id} — Eliminar configuración
POST /api/reports/telegram/configs/{id}/trigger-now — Ejecutar reporte ahora
POST /api/reports/telegram/send-alert   — Enviar alerta manual
POST /api/reports/telegram/send-summary — Enviar resumen del sistema
GET  /api/reports/telegram/logs         — Historial de mensajes (filtros direction/type)
POST /api/reports/telegram/webhook      — Webhook inbound del bot (siempre 200 OK)

# Phishing
GET  /api/phishing/*                    — Alertas, víctimas, sinkhole

# Security
POST /api/security/*                    — Auto-block, geo-block, cuarentena
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
- [ ] Resolución de rangos CIDR por país/ASN para el endpoint `/api/geoip/suggestions/{id}/apply` en modo real
- [ ] Configurar threshold del circuito Suricata auto-response antes de activar `auto_trigger=true` en producción

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

*NetShield Dashboard — v2.3*

</div>
