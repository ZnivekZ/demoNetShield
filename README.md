<div align="center">

# 🛡️ NetShield Dashboard

**Plataforma unificada de monitoreo, detección de amenazas y gestión de seguridad de red**

[![Python](https://img.shields.io/badge/Python-3.12+-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?style=for-the-badge&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://typescriptlang.org)
[![TailwindCSS](https://img.shields.io/badge/TailwindCSS-v4-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)](https://tailwindcss.com)

*Integra MikroTik CHR · Wazuh SIEM · CrowdSec CTI · Suricata IDS/IPS/NSM · MaxMind GeoLite2 · Claude AI · GLPI ITSM · Telegram Bot · DHCP Admin en un único panel de control*

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
- **🖧 Administración DHCP** — Gestión completa de DHCP MikroTik: servidores, leases, pools, redes, alertas rogue, opciones custom, correlación GLPI y discovery de dispositivos
- **📊 Vistas Personalizadas** — Sistema de dashboards configurables por el usuario con catálogo de **59 widgets** especializados organizados en 4 categorías
- **🔑 Autenticación JWT** — Login seguro con tokens JWT, bcrypt para contraseñas, gestión de usuarios del dashboard desde el panel de control, registro de auditoría de acciones (login OK/fail, logout, CRUD usuarios) en `action_logs`

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
| **DHCP** | `/dhcp` | Servidores, leases, pools, redes, alertas rogue, opciones, correlación GLPI, discovery |
| **Phishing** | `/phishing` | Alertas de phishing, víctimas, gestión de sinkhole DNS |
| **Sistema** | `/system` | Health unificado MikroTik + Wazuh, estado GeoLite2, CLI web integrada |
| **Reportes** | `/reports` | **Generador IA** (prompt libre, TipTap, PDF) + **Telegram** (bot status, configs automáticos, historial) |
| **Inventario (GLPI)** | `/inventory` | Activos (kanban + eliminar), tickets, usuarios GLPI (CRUD), asignaciones equipo↔usuario, cuarentena |
| **CrowdSec — Centro de Comando** | `/crowdsec` | Decisiones activas + bandera/ciudad/tipo de red por IP, métricas, bouncers, top atacantes |
| **CrowdSec — Inteligencia** | `/crowdsec/intelligence` | Top países atacantes (cross-source), sugerencias de geo-bloqueo, escenarios, heatmap |
| **CrowdSec — Configuración** | `/crowdsec/config` | Bouncers, collections del hub, sincronización con MikroTik firewall |
| **Suricata — Motor** | `/suricata` | Estado del motor IDS/IPS, métricas en tiempo real, categorías de alertas, circuito de auto-response |
| **Suricata — Alertas** | `/suricata/alerts` | Alertas IDS/IPS con live feed WebSocket, timeline, top firmas, filtros avanzados |
| **Suricata — Red NSM** | `/suricata/network` | Flujos de red, consultas DNS, transacciones HTTP, handshakes TLS capturados |
| **Suricata — Reglas** | `/suricata/rules` | Gestión de firmas: toggle on/off, rulesets, actualización vía suricata-update |
| **Vistas** | `/views` | Lista de dashboards personalizados guardados |
| **Vista Detail** | `/views/:id` | Dashboard personalizado con widgets en grid |
| **View Builder** | `/views/:id/edit` | Editor de vistas con catálogo tabulado de **59 widgets** |
| **Gestión de usuarios** | `/admin/users` | CRUD de operadores del dashboard (acceso desde ⚙️ topbar) |
| **Historial de actividad** | `/admin/audit` | Auditoría completa de acciones: filtro por categoría, operador y búsqueda libre (acceso desde ⚙️ topbar) |
| **Login** | `/login` | Autenticación JWT — única ruta pública |

---

## 📊 Sistema de Vistas Personalizadas

NetShield incluye un sistema completo para crear **dashboards configurables por el usuario**, persistidos en SQLite.

> **59 widgets** organizados en 4 categorías.

### Catálogo de widgets (4 categorías, 56 widgets)

#### 🔵 Standard — Widgets esenciales de monitoreo
| Widget | Fuente | Descripción |
|--------|--------|-------------|
| `standard_alert_counter` | Wazuh | Contador de alertas con nivel configurable |
| `standard_agent_status` | Wazuh | Estado de agentes en tiempo real |
| `standard_interface_status` | MikroTik | Estado de interfaces de red |
| `standard_crowdsec_blocks` | CrowdSec | Total de bloqueos activos |
| `standard_mitre_summary` | Wazuh | Resumen de técnicas MITRE ATT&CK |
| `standard_top_agents` | Wazuh | Top agentes por alertas |
| `standard_dhcp_servers` | MikroTik | Estado de servidores DHCP |

#### 🟣 Visual — Visualizaciones especializadas
| Widget | Fuente | Descripción |
|--------|--------|-------------|
| `visual_threat_gauge` | Multi | Gauge de nivel de amenaza (0-100) con desglose por fuente |
| `visual_activity_heatmap` | Wazuh | Calendario heatmap 7×24h de actividad de alertas |
| `visual_agents_thermometer` | Wazuh | Termómetro visual del ratio alertas/agentes |
| `visual_blocks_timeline` | CrowdSec | Línea de tiempo de bloques en las últimas 24h |
| `visual_event_counter` | Multi | Contador giratorio de eventos con velocidad |
| `visual_network_pulse` | MikroTik | ECG animado del tráfico de red en SVG |
| `visual_protocol_donut` | Suricata | Donut de distribución de protocolos NSM |
| `visual_subnet_usage` | MikroTik DHCP | Barras de uso de subredes por pool DHCP |
| `visual_queue_bars` | MikroTik | Barras de ancho de banda up/down por Simple Queue |

#### 🟠 Technical — Vistas técnicas avanzadas
| Widget | Fuente | Descripción |
|--------|--------|-------------|
| `technical_packet_inspector` | Suricata | Inspector de alertas con detalle expandible por firma/IP |
| `technical_flow_table` | Suricata NSM | Tabla de flujos activos con filtro por protocolo |
| `technical_live_logs` | MikroTik | Terminal de logs en tiempo real con auto-scroll |
| `technical_firewall_tree` | MikroTik | Árbol de reglas firewall agrupado por chain |
| `technical_crowdsec_raw` | CrowdSec | Tabla raw de decisiones con confirmación de unblock |
| `technical_correlation_timeline` | Multi | Timeline de correlación cruzada Wazuh+Suricata+CrowdSec |
| `technical_critical_assets` | GLPI | Activos críticos con estado de salud y agente Wazuh |
| `technical_action_log` | Sistema | Log de acciones de seguridad recientes |
| `technical_dhcp_leases` | MikroTik DHCP | Tabla de leases DHCP activos con filtros |
| `technical_nat_table` | MikroTik | Tabla de reglas NAT — masquerade, dst-nat, src-nat |
| `technical_route_table` | MikroTik | Rutas activas con tipo, gateway y distancia administrativa |

#### 🟢 Hybrid — Widgets de correlación multi-fuente
| Widget | Fuente | Descripción |
|--------|--------|-------------|
| `hybrid_world_threat_map` | Multi | Mapa mundial de amenazas con intensidad por país |
| `hybrid_confirmed_threats` | Suricata+CrowdSec | IPs confirmadas como amenaza por múltiples fuentes |
| `hybrid_country_radar` | GeoIP+Multi | Radar de países atacantes con distribución por fuente |
| `hybrid_ip_profiler` | Multi | Perfilador de IP con GeoIP + CrowdSec CTI + red interna |
| `hybrid_incident_lifecycle` | Multi | Ciclo de vida de incidentes: detección → bloqueo → resolución |
| `hybrid_defense_layers` | Multi | Estado visual de todas las capas defensivas |
| `hybrid_geoblock_predictor` | GeoIP | Sugerencias predictivas de geo-bloqueo con un clic |
| `hybrid_suricata_glpi` | Suricata+GLPI | Correlación de alertas con activos del inventario |
| `hybrid_view_report_generator` | Claude AI | Generador de reportes IA desde una vista |
| `hybrid_dhcp_discovery` | DHCP+GLPI | Discovery de dispositivos: registered/unregistered/stale |

### Flujo del View Builder

```
/views → ViewsListPage → [Nueva vista] → ViewBuilderPage
                                              │  (Catálogo tabulado Standard/Visual/Technical/Hybrid)
                                              │  (Drag-and-drop de widgets al grid)
                                              ▼
                                         ViewDetailPage (dashboard en vivo)
                                              │
                                         WidgetRenderer → datos en tiempo real
```

---

## 🧱 Stack Técnico

### Backend (Python 3.12+)

| Paquete | Propósito |
|---------|-----------|
| **FastAPI** 0.115 | Framework web async |
| **SQLAlchemy** 2.0 + aiosqlite | ORM async con SQLite |
| **python-jose** + **passlib[bcrypt]** | Autenticación JWT + hashing de contraseñas |
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
| **Recharts** | Gráficos de tráfico, timelines y charts interactivos |
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
# Editar backend/.env con tus credenciales reales.
# OBLIGATORIO: generar y setear JWT_SECRET_KEY
# python -c "import secrets; print(secrets.token_hex(32))"

# Ejecutar (con venv activado desde la raíz)
cd backend
python main.py
# → API REST:    http://localhost:8000
# → Swagger UI:  http://localhost:8000/docs

# Alternativa sin activar el venv:
cd backend && ../.venv/bin/python main.py
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
- **CountryRadar widget** — Radar multi-fuente de países atacantes en Vistas Personalizadas
- **WorldThreatMap widget** — Mapa mundial de intensidad de amenazas por país
- **IpProfiler widget** — Perfil completo de IP con GeoIP + CTI + estado en red interna
- **SystemHealth** — Estado de las bases de datos GeoLite2 con fecha de build y tamaño de caché

### Configurar GeoLite2 real (producción)

```bash
# 1. Registrarse gratis en:
#    https://www.maxmind.com/en/geolite2/signup

# 2. Agregar al backend/.env:
MAXMIND_LICENSE_KEY=tu_clave_aqui

# 3. Descargar las bases de datos:
python backend/scripts/download_geoip.py

# 4. Reiniciar el backend
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
│   ├── routers/                 # 17 routers REST
│   │   ├── auth.py              # Autenticación JWT: login, me, logout, CRUD usuarios
│   │   ├── mikrotik.py          # Endpoints MikroTik (interfaces, ARP, firewall)
│   │   ├── vlans.py             # CRUD de VLANs + tráfico
│   │   ├── wazuh.py             # Alertas, agentes, MITRE ATT&CK
│   │   ├── network.py           # Labels y grupos de IPs
│   │   ├── reports.py           # Generación de reportes IA + PDF + Telegram (11 endpoints)
│   │   ├── glpi.py              # Inventario, tickets, cuarentena
│   │   ├── portal.py            # Portal cautivo MikroTik Hotspot
│   │   ├── phishing.py          # Sinkhole, alertas, víctimas
│   │   ├── security.py          # Auto-block, geo-block, cuarentena
│   │   ├── crowdsec.py          # Decisiones, métricas, bouncers, CTI
│   │   ├── geoip.py             # Lookup/bulk, top países/ASNs, sugerencias de geo-bloqueo
│   │   ├── suricata.py          # Motor IDS/IPS/NSM (24 endpoints)
│   │   ├── dhcp.py              # Administración DHCP (20 endpoints, Fase 1 + Fase 2 cross-service)
│   │   ├── views.py             # CRUD de vistas personalizadas + widgets (SQLite persistido)
│   │   ├── widgets.py           # Endpoints de datos agregados para widgets (threat level, heatmap,
│   │   │                        #   correlation timeline, confirmed threats, incident lifecycle,
│   │   │                        #   suricata×GLPI, world threat map, view report)
│   │   └── cli.py               # Terminal web (RouterOS + Wazuh Agent)
│   ├── services/                # Lógica de negocio (singletons)
│   │   ├── mikrotik_service.py  # Singleton con asyncio.Lock
│   │   ├── wazuh_service.py     # JWT auth con refresh automático + enriquecimiento GeoIP
│   │   ├── glpi_service.py      # CRUD completo de GLPI
│   │   ├── portal_service.py    # Hotspot sessions, users, profiles
│   │   ├── crowdsec_service.py  # LAPI + CTI + enriquecimiento GeoIP en decisions
│   │   ├── geoip_service.py     # Singleton GeoLite2 + TTLCache(10000, ttl=3600)
│   │   ├── suricata_service.py  # Singleton: Unix socket async, alertas vía Wazuh, flujos NSM,
│   │   │                        #   correlación CrowdSec/Wazuh, auto-response
│   │   ├── telegram_service.py  # Singleton: send_message, send_alert, send_status_summary,
│   │   │                        #   process_incoming_message → answer_query (Claude AI)
│   │   ├── telegram_scheduler.py # APScheduler AsyncIOScheduler: sync de jobs desde DB cada minuto
│   │   ├── ai_service.py        # Claude function calling + TELEGRAM_SYSTEM_PROMPT + answer_telegram_query()
│   │   ├── pdf_service.py       # WeasyPrint + Jinja2
│   ├── models/                  # Modelos SQLAlchemy (11 modelos, incluye User y CustomView)
│   ├── schemas/                 # Schemas Pydantic v2 (18 archivos, incluye auth.py y dhcp.py)
│   └── templates/               # Plantilla HTML para PDF
│
├── frontend/
│   └── src/
│       ├── App.tsx              # Rutas SPA (24 vistas + redirect + fallback) + AuthProvider
│       ├── types.ts             # Tipos TypeScript compartidos (~1700 líneas)
│       ├── index.css            # Design system y tokens @theme
│       ├── services/
│       │   ├── api.ts           # Cliente API centralizado (19+ namespaces + interceptores JWT)
│       │   └── apiResponse.ts   # Utilidades: requireApiSuccess(), getApiErrorMessage()
│       ├── hooks/               # 43+ custom hooks (TanStack Query + WebSocket)
│       │   ├── useWebSocket.ts              # Hook base WebSocket con reconexión
│       │   ├── useTheme.ts                  # Hook de theming (light/dark/system)
│       │   ├── useAuth.ts                   # Estado de autenticación JWT (login/logout/validate)
│       │   ├── useUsers.ts                  # CRUD de usuarios dashboard (TanStack Query)
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
│       │   ├── useDhcp.ts                   # DHCP: 7 read + 10 mutation + 5 Fase 2 hooks
│       │   ├── useCustomViews.ts            # CRUD de vistas personalizadas
│       │   ├── useWidgetCatalog.ts          # Catálogo de widgets tabulado por categoría
│       │   ├── widgets/                     # Hooks por categoría de widget
│       │   │   ├── visual/index.ts          # useActivityHeatmap, useThreatGauge, useSubnetUsageWidget...
│       │   │   ├── technical/index.ts       # usePacketInspector, useFlowTable, useDhcpLeasesWidget...
│       │   │   └── hybrid/index.ts          # useIpProfiler, useConfirmedThreats, useDhcpDiscoveryWidget...
│       │   └── ...                          # + 21 hooks de dominio (portal, GLPI, CrowdSec, DHCP, etc.)
│       └── components/          # Componentes por dominio
│           ├── Layout.tsx               # Sidebar glassmorphic + topbar (status dots + theming + logout)
│           ├── auth/                    # LoginPage · AuthContext · ProtectedRoute
│           ├── admin/                   # UsersManagementPage · UserFormModal · AuditHistoryPage
│           ├── common/                  # Componentes compartidos
│           ├── dashboard/               # Dashboard principal
│           ├── security/                # QuickView + ConfigView
│           ├── firewall/                # Reglas y bloqueos
│           ├── network/                 # ARP, VLANs, labels, groups
│           ├── dhcp/                    # Administración DHCP (DhcpPage.tsx, 36KB)
│           ├── portal/                  # Portal cautivo
│           ├── phishing/                # Panel de phishing
│           ├── reports/                 # Generador IA (TipTap) + Telegram Bot (9 componentes)
│           ├── inventory/               # GLPI kanban + tickets
│           ├── crowdsec/                # 13 componentes CrowdSec
│           ├── suricata/                # 4 páginas: MotorPage · AlertsPage · NSMPage · RulesPage
│           ├── geoip/                   # CountryFlag · NetworkTypeBadge · TopCountriesWidget · GeoBlockSuggestions
│           ├── system/                  # SystemHealth + CLI + GeoIPStatus
│           ├── views/                   # Sistema de vistas personalizadas
│           │   ├── ViewsListPage.tsx        # Lista de dashboards guardados
│           │   ├── ViewDetailPage.tsx       # Dashboard en vivo con widgets
│           │   ├── ViewBuilderPage.tsx      # Editor con catálogo tabulado
│           │   └── WidgetRenderer.tsx       # Renderer dinámico de 56 widgets
│           └── widgets/                 # Biblioteca de widgets por categoría
│               ├── common/              # WidgetSkeleton, WidgetErrorState, WidgetHeader
│               ├── visual/              # ThreatGauge, ActivityHeatmap, NetworkPulse,
│               │                        # DhcpSubnetUsage,
│               │                        # AgentsThermometer, BlocksTimeline, EventCounter,
│               │                        # ProtocolDonut
│               ├── technical/           # PacketInspector, FlowTableWidget, LiveLogs,
│               │                        # DhcpLeasesWidget,
│               │                        # FirewallTree, CrowdSecRaw, CorrelationTimeline,
│               │                        # CriticalAssets, ActionLogWidget
│               └── hybrid/              # WorldThreatMap, ConfirmedThreats, CountryRadar, DhcpDiscovery,
│                                        # IpProfiler, IncidentLifecycle, DefenseLayers,
│                                        # GeoblockPredictor, SuricataGlpiCorrelation,
│                                        # ViewReportGenerator
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
- **WebSockets** — Los WebSockets viven en `main.py` y consumen los services directamente (no pasan por routers).
- **CrowdSec como capa complementaria** — Se sincroniza con el firewall MikroTik: las decisiones de CrowdSec pueden traducirse automáticamente en reglas de bloqueo en el router.
- **Suricata como capa de red** — Complementa a Wazuh (host) y CrowdSec (comunidad). Sus alertas se correlacionan con decisiones CrowdSec para identificar amenazas confirmadas por múltiples fuentes.
- **GeoIP enriquecimiento silencioso** — `geoip_service` usa `try/except` alrededor de cada lookup en las capas de servicio. Si falla, los endpoints devuelven el dato original sin el campo `geo`, nunca un error 500.
- **TTLCache para GeoIP** — Las 10 000 entradas más recientes se mantienen en RAM con TTL de 1 hora, evitando consultas repetidas a las .mmdb.
- **Auto-response circuit** — El circuito Suricata → CrowdSec + MikroTik requiere confirmación humana en el frontend (`ConfirmModal`). El auto-trigger sin interacción está deshabilitado por defecto.
- **Catálogo de widgets server-driven** — El backend define el catálogo completo de widgets con schema de configuración por tipo (`/api/views/widgets/catalog`). El frontend lo consume dinámicamente para renderizar el catálogo tabulado sin hardcodear tipos.
- **DHCP sin servicio propio** — Las operaciones DHCP se implementan como métodos del `MikroTikService` existente (20 métodos) porque todas son llamadas a la API RouterOS. El router `dhcp.py` consume directamente `get_mikrotik_service()`. Los endpoints Fase 2 (correlación GLPI, discovery, enriquecimiento Wazuh) usan lazy imports cross-service.
- **WidgetRenderer desacoplado** — Un único componente mapea cada `widget.type` a su componente React y les pasa `config`. Agregar un widget nuevo solo requiere: (1) registrar en el catálogo del backend, (2) crear el componente React, (3) añadir el `case` en `WidgetRenderer`.
- **Status dots movidos a SystemHealth** — Los 5 indicadores de conectividad (MikroTik, Wazuh, CrowdSec, Suricata, GLPI) se eliminaron del topbar del Layout para reducir queries permanentes en todas las vistas. Ahora viven en `SystemHealth.tsx` con un componente `IntegrationStatusCard` reutilizable y botón de reintento.

---

## 🔌 API Reference

La documentación interactiva completa está disponible en `/docs` (Swagger UI) cuando se corre el backend:

```
# Auth
POST /api/auth/login                    — Login (devuelve JWT)
GET  /api/auth/me                       — Validar sesión activa
POST /api/auth/logout                   — Logout (stateless, limpia token en cliente)
GET  /api/auth/users                    — Listar usuarios del dashboard
POST /api/auth/users                    — Crear usuario
PUT  /api/auth/users/:id                — Editar usuario (email, nombre, contraseña, is_active)
DEL  /api/auth/users/:id                — Eliminar usuario

# Sistema
GET  /api/health                        — Estado del sistema

# MikroTik
GET  /api/mikrotik/*                    — Interfaces, ARP, firewall, tráfico
POST /api/mikrotik/firewall/block       — Bloquear IP
POST /api/mikrotik/firewall/unblock     — Desbloquear IP
GET  /api/mikrotik/nat-rules            — Reglas NAT (masquerade, dst-nat, src-nat)
GET  /api/mikrotik/routes               — Tabla de ruteo activa
GET  /api/mikrotik/addresses            — Direcciones IP asignadas por interfaz
GET  /api/mikrotik/bridge-ports         — Puertos bridge
GET  /api/mikrotik/queues               — Simple Queues
POST /api/mikrotik/queues               — Crear Simple Queue
PUT  /api/mikrotik/queues/:id           — Actualizar Simple Queue
DEL  /api/mikrotik/queues/:id           — Eliminar Simple Queue

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
GET  /api/suricata/flows                — Flujos de red NSM
GET  /api/suricata/flows/stats          — Estadísticas de flujos
GET  /api/suricata/flows/dns            — Consultas DNS capturadas
GET  /api/suricata/flows/http           — Transacciones HTTP capturadas
GET  /api/suricata/flows/tls            — Handshakes TLS (JA3/SNI)
GET  /api/suricata/rules                — Reglas/firmas
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

# Vistas Personalizadas
GET  /api/views                         — Listar vistas
POST /api/views                         — Crear vista
GET  /api/views/:id                     — Obtener vista
PUT  /api/views/:id                     — Actualizar vista
DEL  /api/views/:id                     — Eliminar vista
GET  /api/views/widgets/catalog         — Catálogo tabulado de widgets por categoría

# Widgets (datos agregados)
GET  /api/widgets/threat-level          — Nivel de amenaza actual (0-100) con desglose
GET  /api/widgets/activity-heatmap      — Matriz 7×24h de actividad de alertas
GET  /api/widgets/correlation-timeline  — Timeline multi-fuente (Wazuh+Suricata+CrowdSec)
GET  /api/widgets/confirmed-threats     — IPs confirmadas por múltiples fuentes
GET  /api/widgets/incident-lifecycle/:ip — Ciclo de vida de un incidente por IP
GET  /api/widgets/suricata-asset-correlation — Correlación Suricata × inventario GLPI
GET  /api/widgets/world-threat-map      — Intensidad de amenazas por país (para mapa mundial)
POST /api/widgets/view-report           — Generar reporte IA desde una vista personalizada

# DHCP (20 endpoints)
GET  /api/dhcp/servers                  — Listar servidores DHCP
POST /api/dhcp/servers                  — Crear servidor DHCP
PUT  /api/dhcp/servers/:id/toggle       — Habilitar/deshabilitar servidor
GET  /api/dhcp/leases                   — Listar leases (filtros: server, status, search)
POST /api/dhcp/leases                   — Crear lease estático (reservación)
PUT  /api/dhcp/leases/:id               — Actualizar lease (comment, rate-limit, disabled)
DEL  /api/dhcp/leases/:id               — Eliminar lease
POST /api/dhcp/leases/:id/make-static   — Convertir lease dinámico → estático
PUT  /api/dhcp/leases/:id/block         — Bloquear/desbloquear acceso DHCP del cliente
GET  /api/dhcp/networks                 — Listar configuraciones de red DHCP
POST /api/dhcp/networks                 — Crear configuración de red
PUT  /api/dhcp/networks/:id             — Actualizar configuración de red
GET  /api/dhcp/pools                    — Listar pools de direcciones IP
POST /api/dhcp/pools                    — Crear pool
PUT  /api/dhcp/pools/:id                — Actualizar pool
GET  /api/dhcp/pools/usage              — Utilización de subredes por pool
GET  /api/dhcp/alerts                   — Alertas de servidor DHCP rogue
POST /api/dhcp/alerts                   — Crear configuración de alerta rogue
GET  /api/dhcp/options                  — Opciones DHCP custom
POST /api/dhcp/options                  — Crear opción DHCP
GET  /api/dhcp/correlation/glpi         — Correlación leases ↔ inventario GLPI
GET  /api/dhcp/discovery                — Discovery de dispositivos (registered/unregistered/stale)
GET  /api/dhcp/wazuh/enriched           — Alertas Wazuh enriquecidas con contexto DHCP
POST /api/dhcp/alerts/:id/block-rogue   — Bloquear servidor DHCP rogue vía firewall
POST /api/dhcp/discovery/create-ticket  — Crear ticket GLPI para dispositivo no inventariado

# GLPI
GET  /api/glpi/status                   — Estado de conexión con GLPI
GET  /api/glpi/assets                   — Listar activos con filtros (search, type, status)
POST /api/glpi/assets                   — Crear activo
GET  /api/glpi/assets/:id               — Detalle de activo
PUT  /api/glpi/assets/:id               — Actualizar activo
DEL  /api/glpi/assets/:id               — Eliminar activo
PUT  /api/glpi/assets/:id/assign        — Asignar/desasignar activo a usuario GLPI
POST /api/glpi/assets/:id/quarantine    — Poner activo en cuarentena (bloqueo MikroTik)
POST /api/glpi/assets/:id/unquarantine  — Sacar activo de cuarentena
GET  /api/glpi/assets/stats             — Estadísticas por tipo y estado
GET  /api/glpi/assets/health            — Salud de activos correlacionada con Wazuh
GET  /api/glpi/tickets                  — Listar tickets
POST /api/glpi/tickets                  — Crear ticket
PUT  /api/glpi/tickets/:id/status       — Cambiar estado del ticket
GET  /api/glpi/users                    — Listar usuarios GLPI
GET  /api/glpi/users/:id                — Obtener usuario GLPI por ID
POST /api/glpi/users                    — Crear usuario GLPI
PUT  /api/glpi/users/:id                — Actualizar usuario GLPI
DEL  /api/glpi/users/:id                — Eliminar usuario GLPI
GET  /api/glpi/users/:id/assets         — Activos asignados a un usuario
GET  /api/glpi/locations                — Ubicaciones de activos

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

> La carpeta `/postman/` incluye una colección con **120+ requests** y entornos preconfigurados.

# Audit
GET  /api/actions/history              — Historial paginado de acciones (ActionLog)

---

## 🔒 Consideraciones de seguridad

> Este proyecto está pensado para **laboratorio de pruebas**. Para producción se deben implementar:

- [x] **Autenticación de usuarios (JWT)** — `JWTAuthMiddleware` global + bcrypt + CRUD usuarios
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

*NetShield Dashboard — v2.9*

</div>
