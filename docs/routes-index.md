# NetShield Dashboard — Índice Completo de Rutas

> Referencia rápida de todos los endpoints REST, WebSockets, rutas frontend y servicios.

---

## Backend REST API — 86 endpoints

### `/api/mikrotik` — MikroTik Router (10 endpoints)

| Método | Ruta | Descripción | Fuente | Auth/Log |
|--------|------|-------------|--------|----------|
| `GET` | `/api/mikrotik/interfaces` | Interfaces de red con estado y contadores | MikroTik API | — |
| `GET` | `/api/mikrotik/connections` | Tabla de conexiones activas (conntrack) | MikroTik API | — |
| `GET` | `/api/mikrotik/arp` | Tabla ARP (IP↔MAC) | MikroTik API | — |
| `GET` | `/api/mikrotik/traffic` | Tráfico rx/tx por interfaz (delta-based) | MikroTik API | — |
| `GET` | `/api/mikrotik/firewall/rules` | Reglas de firewall filter | MikroTik API | — |
| `POST` | `/api/mikrotik/firewall/block` | Bloquear IP (drop rule en chain=forward) | MikroTik API | `ActionLog` |
| `DELETE` | `/api/mikrotik/firewall/block` | Desbloquear IP (remover drop rules) | MikroTik API | `ActionLog` |
| `GET` | `/api/mikrotik/logs` | Logs del sistema RouterOS | MikroTik API | — |
| `GET` | `/api/mikrotik/health` | Salud del sistema (CPU, RAM, uptime, temp) | MikroTik API | — |
| `GET` | `/api/mikrotik/interfaces/traffic/all` | Tráfico en tiempo real por interfaz | MikroTik API | — |
| `GET` | `/api/mikrotik/arp/search` | Buscar en ARP por IP o MAC | MikroTik API | — |

---

### `/api/wazuh` — Wazuh SIEM (8 endpoints)

| Método | Ruta | Descripción | Fuente | Auth/Log |
|--------|------|-------------|--------|----------|
| `GET` | `/api/wazuh/agents` | Lista de agentes con estado de conexión | Wazuh API | — |
| `GET` | `/api/wazuh/alerts` | Alertas recientes (limit, level_min, offset) | Wazuh API | — |
| `GET` | `/api/wazuh/alerts/agent/{agent_id}` | Alertas filtradas por agente | Wazuh API | — |
| `POST` | `/api/wazuh/active-response` | Enviar active response a un agente | Wazuh API | `ActionLog` |
| `GET` | `/api/wazuh/alerts/critical` | Alertas críticas (level > 10) + MITRE | Wazuh API | — |
| `GET` | `/api/wazuh/alerts/timeline` | Conteo de alertas por minuto (60 min) | Wazuh API | — |
| `GET` | `/api/wazuh/alerts/last-critical` | Última alerta crítica con detalle | Wazuh API | — |
| `GET` | `/api/wazuh/agents/top` | Top N agentes por cantidad de alertas | Wazuh API | — |
| `GET` | `/api/wazuh/agents/summary` | Resumen de agentes por estado | Wazuh API | — |
| `GET` | `/api/wazuh/mitre/summary` | Técnicas MITRE ATT&CK detectadas | Wazuh API | — |
| `GET` | `/api/wazuh/health` | Salud del manager Wazuh | Wazuh API | — |

---

### `/api/network` — Network Management (8 endpoints)

| Método | Ruta | Descripción | Fuente | Auth/Log |
|--------|------|-------------|--------|----------|
| `POST` | `/api/network/labels` | Crear/actualizar un label de IP | DB | — |
| `GET` | `/api/network/labels` | Listar todos los labels | DB | — |
| `DELETE` | `/api/network/labels/{label_id}` | Eliminar un label | DB | — |
| `POST` | `/api/network/groups` | Crear un grupo de IPs | DB | — |
| `GET` | `/api/network/groups` | Listar grupos con miembros | DB | — |
| `POST` | `/api/network/groups/{group_id}/members` | Agregar IP a un grupo | DB | — |
| `DELETE` | `/api/network/groups/{group_id}/members/{ip}` | Remover IP de un grupo | DB | — |
| `DELETE` | `/api/network/groups/{group_id}` | Eliminar grupo completo | DB | — |
| `GET` | `/api/network/search` | Búsqueda unificada ARP+Wazuh+GLPI | MikroTik+Wazuh+GLPI | — |

---

### `/api/security` — Security Operations (4 endpoints)

| Método | Ruta | Descripción | Fuente | Auth/Log |
|--------|------|-------------|--------|----------|
| `POST` | `/api/security/block-ip` | Bloquear IP en lista "Blacklist_Automatica" | MikroTik API | `ActionLog` |
| `POST` | `/api/security/auto-block` | Auto-bloqueo por alerta severa (level ≥ 12) | MikroTik+Wazuh | `ActionLog` |
| `POST` | `/api/security/quarantine` | Cuarentena de agente (mover VLAN) | MikroTik+Wazuh | `ActionLog` |
| `POST` | `/api/security/geo-block` | Bloquear rangos IP por país (CIDR) | MikroTik API | `ActionLog` |

---

### `/api/phishing` — Phishing Detection (9 endpoints)

| Método | Ruta | Descripción | Fuente | Auth/Log |
|--------|------|-------------|--------|----------|
| `GET` | `/api/phishing/alerts` | Alertas de phishing (filtro por rule groups) | Wazuh API | — |
| `GET` | `/api/phishing/domains/suspicious` | Dominios sospechosos agrupados con conteo | Wazuh API+DB | — |
| `GET` | `/api/phishing/urls/timeline` | Timeline de intentos de phishing (60 min) | Wazuh API | — |
| `GET` | `/api/phishing/victims` | Agentes/usuarios que accedieron a URLs maliciosos | Wazuh API | — |
| `GET` | `/api/phishing/stats` | Estadísticas generales de phishing | Wazuh API | — |
| `POST` | `/api/phishing/domains/sinkhole` | Agregar dominio al DNS sinkhole | MikroTik+DB | `ActionLog` |
| `DELETE` | `/api/phishing/domains/sinkhole/{domain}` | Remover dominio del sinkhole | MikroTik+DB | `ActionLog` |
| `GET` | `/api/phishing/domains/sinkhole` | Listar dominios en sinkhole | MikroTik+DB | — |
| `POST` | `/api/phishing/ip/block` | Bloquear IP fuente de phishing | MikroTik API | `ActionLog` |
| `POST` | `/api/phishing/simulate` | Simular alerta de phishing (lab only) | Internal | — |

---

### `/api/mikrotik/vlans` — VLAN Management (7 endpoints)

| Método | Ruta | Descripción | Fuente | Auth/Log |
|--------|------|-------------|--------|----------|
| `GET` | `/api/mikrotik/vlans/` | Listar todas las VLANs | MikroTik API | — |
| `POST` | `/api/mikrotik/vlans/` | Crear nueva VLAN | MikroTik API | — |
| `PUT` | `/api/mikrotik/vlans/{vlan_id}` | Actualizar VLAN | MikroTik API | — |
| `DELETE` | `/api/mikrotik/vlans/{vlan_id}` | Eliminar VLAN | MikroTik API | — |
| `GET` | `/api/mikrotik/vlans/traffic/all` | Tráfico de todas las VLANs | MikroTik API | — |
| `GET` | `/api/mikrotik/vlans/{vlan_id}/traffic` | Tráfico de una VLAN específica | MikroTik API | — |
| `GET` | `/api/mikrotik/vlans/{vlan_id}/alerts` | Alertas Wazuh correlacionadas con IP de VLAN | MikroTik+Wazuh | — |

---

### `/api/reports` — AI Reports (3 endpoints)

| Método | Ruta | Descripción | Fuente | Auth/Log |
|--------|------|-------------|--------|----------|
| `POST` | `/api/reports/generate` | Generar reporte IA con function calling | Claude API | `ActionLog` |
| `POST` | `/api/reports/export-pdf` | Exportar HTML a PDF (WeasyPrint) | Internal | — |
| `GET` | `/api/reports/history` | Historial de reportes generados | DB | — |

---

### `/api/cli` — Remote CLI (2 endpoints)

| Método | Ruta | Descripción | Fuente | Auth/Log |
|--------|------|-------------|--------|----------|
| `POST` | `/api/cli/mikrotik` | Ejecutar comando read-only en MikroTik | MikroTik API | — |
| `POST` | `/api/cli/wazuh-agent` | Acción sobre agente Wazuh (restart/status) | Wazuh API | — |

---

### `/api/portal` — Portal Cautivo / Hotspot (17 endpoints)

| Método | Ruta | Descripción | Fuente | Auth/Log |
|--------|------|-------------|--------|----------|
| `POST` | `/api/portal/setup` | Inicializar servidor Hotspot | MikroTik API | `ActionLog` |
| `GET` | `/api/portal/sessions/active` | Sesiones activas del Hotspot | MikroTik API | — |
| `GET` | `/api/portal/sessions/history` | Historial de sesiones | MikroTik API | — |
| `GET` | `/api/portal/sessions/chart` | Datos del gráfico de sesiones (in-memory) | Internal | — |
| `GET` | `/api/portal/stats/realtime` | Estadísticas en tiempo real del Hotspot | MikroTik API | — |
| `GET` | `/api/portal/stats/summary` | Estadísticas históricas agregadas | MikroTik API | — |
| `GET` | `/api/portal/users` | Listar usuarios Hotspot | MikroTik API | — |
| `POST` | `/api/portal/users` | Crear usuario Hotspot | MikroTik API | `ActionLog` |
| `PUT` | `/api/portal/users/{username}` | Actualizar usuario Hotspot | MikroTik API | `ActionLog` |
| `DELETE` | `/api/portal/users/{username}` | Eliminar usuario Hotspot | MikroTik API | `ActionLog` |
| `POST` | `/api/portal/users/{username}/disconnect` | Desconectar sesiones activas de un usuario | MikroTik API | `ActionLog` |
| `POST` | `/api/portal/users/bulk` | Crear múltiples usuarios (batch) | MikroTik API | `ActionLog` |
| `GET` | `/api/portal/profiles` | Listar perfiles de velocidad | MikroTik API | — |
| `POST` | `/api/portal/profiles` | Crear perfil de velocidad | MikroTik API | — |
| `PUT` | `/api/portal/profiles/{name}` | Actualizar perfil de velocidad | MikroTik API | — |
| `GET` | `/api/portal/config` | Obtener configuración del Hotspot | MikroTik API | — |
| `PUT` | `/api/portal/config/unregistered-speed` | Actualizar velocidad de no-registrados | MikroTik API | `ActionLog` |
| `PUT` | `/api/portal/config/schedule` | Configurar horario de acceso | MikroTik API | `ActionLog` |
| `GET` | `/api/portal/config/schedule` | Obtener horario actual | MikroTik API | — |
| `GET` | `/api/portal/status` | Estado del Hotspot (inicializado o no) | MikroTik API | — |

---

### `/api/glpi` — GLPI Inventario (18 endpoints)

| Método | Ruta | Descripción | Fuente | Auth/Log |
|--------|------|-------------|--------|----------|
| `GET` | `/api/glpi/status` | Verificar disponibilidad de GLPI | GLPI API | — |
| `GET` | `/api/glpi/assets` | Listar equipos (con búsqueda y filtros) | GLPI API / Mock | — |
| `GET` | `/api/glpi/assets/stats` | Conteo por estado (activo/reparación/etc.) | GLPI API / Mock | — |
| `GET` | `/api/glpi/assets/search` | Búsqueda full-text de equipos | GLPI API / Mock | — |
| `GET` | `/api/glpi/assets/health` | Dashboard de salud cruzada (GLPI+Wazuh+ARP) | GLPI+Wazuh+MikroTik | — |
| `GET` | `/api/glpi/assets/by-location/{id}` | Equipos por ubicación | GLPI API / Mock | — |
| `GET` | `/api/glpi/assets/{id}` | Detalle completo de un activo | GLPI API / Mock | — |
| `GET` | `/api/glpi/assets/{id}/network-context` | Contexto de red (ARP lookup) | GLPI+MikroTik | — |
| `POST` | `/api/glpi/assets` | Crear nuevo activo | GLPI API / Mock | `ActionLog` |
| `PUT` | `/api/glpi/assets/{id}` | Actualizar activo | GLPI API / Mock | `ActionLog` |
| `POST` | `/api/glpi/assets/{id}/quarantine` | Cuarentena GLPI (estado + ticket) | GLPI API + DB | `ActionLog` + `QuarantineLog` |
| `POST` | `/api/glpi/assets/{id}/unquarantine` | Levantar cuarentena GLPI | GLPI API + DB | `ActionLog` |
| `GET` | `/api/glpi/tickets` | Listar tickets (con kanban) | GLPI API / Mock | — |
| `POST` | `/api/glpi/tickets` | Crear ticket de incidente | GLPI API / Mock | `ActionLog` |
| `PUT` | `/api/glpi/tickets/{id}/status` | Actualizar estado de ticket (Kanban D&D) | GLPI API / Mock | `ActionLog` |
| `POST` | `/api/glpi/tickets/network-maintenance` | Crear ticket de mantenimiento de red | MikroTik+GLPI | `ActionLog` |
| `GET` | `/api/glpi/users` | Listar usuarios GLPI | GLPI API / Mock | — |
| `GET` | `/api/glpi/users/{id}/assets` | Equipos asignados a un usuario | GLPI API / Mock | — |
| `GET` | `/api/glpi/locations` | Listar ubicaciones físicas | GLPI API / Mock | — |

---

## WebSocket Channels — 5 canales

| Ruta | Intervalo | Fuente | Datos |
|------|-----------|--------|-------|
| `/ws/traffic` | 2s | MikroTikService | Tráfico rx/tx por interfaz |
| `/ws/alerts` | 15s | WazuhService | Alertas recientes |
| `/ws/vlans/traffic` | 3s | MikroTikService | Tráfico por VLAN |
| `/ws/security/alerts` | 5s | WazuhService | Alertas críticas (level > 10) |
| `/ws/portal/sessions` | 5s | PortalService | Sesiones activas del Hotspot |

---

## Frontend Routes — 10 rutas

| Ruta | Componente | Grupo nav | Descripción |
|------|-----------|-----------|-------------|
| `/` | `QuickView` | Seguridad | Panel de seguridad rápida |
| `/security/config` | `ConfigView` | Seguridad | Blacklist, geo-block, sinkhole |
| `/network` | `NetworkPage` | Infraestructura | Tráfico, ARP, labels, grupos, VLANs |
| `/firewall` | `FirewallPage` | Infraestructura | Reglas de firewall, bloqueos |
| `/portal` | `PortalPage` | Infraestructura | Portal cautivo (Hotspot MikroTik) |
| `/phishing` | `PhishingPanel` | Herramientas | Detección de phishing y sinkhole |
| `/system` | `SystemHealth` | Herramientas | Salud MikroTik + Wazuh, CLI remoto |
| `/reports` | `ReportsPage` | Herramientas | Reportes IA + exportación PDF |
| `/inventory` | `InventoryPage` | Inventario | GLPI: activos, tickets, usuarios |
| `/vlans` | → redirect `/network` | Legacy | Redirige a NetworkPage |

---

## Backend Services — 7 servicios

| Servicio | Patrón | Conexión | Descripción |
|----------|--------|----------|-------------|
| `MikroTikService` | Singleton + Lock | routeros-api sync → executor | Conexión persistente al CHR |
| `WazuhService` | Singleton | httpx async, JWT Bearer | Cliente REST API Wazuh |
| `GLPIService` | Singleton | httpx async, Session Token | Cliente REST API GLPI + mock |
| `AIService` | Per-request | anthropic SDK | Claude function calling para reportes |
| `PDFService` | Per-request | WeasyPrint + Jinja2 | Generación PDF (CPU-bound) |
| `PortalService` | Singleton | Compone MikroTikService | Hotspot management + session cache |
| `AuthProvider` | Factory | MikrotikAuthProvider (extensible) | Interfaz abstracta de autenticación |

---

## DB Models — 7 modelos

| Modelo | Tabla | Uso principal |
|--------|-------|---------------|
| `ActionLog` | `action_logs` | Auditoría de todas las acciones destructivas |
| `IPLabel` | `ip_labels` | Etiquetas personalizadas por IP |
| `IPGroup` | `ip_groups` | Grupos de IPs (ej: "Servidores") |
| `IPGroupMember` | `ip_group_members` | Miembros de un grupo |
| `SinkholeEntry` | `sinkhole_entries` | Dominios en DNS sinkhole |
| `PortalUserRegistry` | `portal_user_registry` | Metadata local de usuarios Hotspot |
| `QuarantineLog` | `quarantine_logs` | Registro de cuarentenas GLPI |

---

## Frontend Hooks — 18 hooks

| Hook | Descripción |
|------|-------------|
| `useSecurityAlerts` | Alertas críticas + timeline + MITRE |
| `useSecurityActions` | Mutations: block-ip, auto-block, quarantine, geo-block |
| `useWazuhSummary` | Resumen de agentes + health |
| `useMikrotikHealth` | Salud del sistema MikroTik |
| `useNetworkSearch` | Búsqueda unificada ARP+Wazuh+GLPI |
| `usePhishing` | Alertas, dominios, víctimas, stats, sinkhole |
| `useVlans` | CRUD de VLANs |
| `useVlanTraffic` | Tráfico por VLAN (polling + WS) |
| `useWebSocket` | Hook base para conexiones WebSocket |
| `usePortalSessions` | Sesiones activas + historial |
| `usePortalUsers` | CRUD usuarios Hotspot |
| `usePortalStats` | Estadísticas realtime + summary |
| `usePortalConfig` | Configuración Hotspot + schedule |
| `useGlpiAssets` | CRUD activos GLPI |
| `useGlpiHealth` | Dashboard de salud GLPI+Wazuh+ARP |
| `useGlpiTickets` | Tickets GLPI + Kanban |
| `useGlpiUsers` | Usuarios GLPI |
| `useQrScanner` | Escáner QR para identificación de activos |

---

## Frontend Components — 48 archivos TSX

### Por dominio:

| Dominio | Componentes |
|---------|-------------|
| **common** | `ConfirmModal`, `GlobalSearch` |
| **dashboard** (legacy) | `DashboardPage`, `AlertsFeed`, `ConnectionsTable`, `TrafficChart` |
| **security** | `QuickView`, `ConfigView`, `LastIncidentCard`, `NotificationPanel` |
| **network** | `NetworkPage` |
| **firewall** | `FirewallPage` |
| **phishing** | `PhishingPanel` |
| **portal** | `PortalPage`, `MonitorView`, `UsersView`, `UserTable`, `UserFormModal`, `BulkImportModal`, `StatsView`, `UsageHeatmap`, `SessionsTable`, `SessionsChart`, `SpeedProfiles`, `ConfigView`, `ScheduleConfig` |
| **system** | `SystemHealth`, `RemoteCLI` |
| **reports** | `ReportsPage` |
| **inventory** | `InventoryPage`, `HealthView`, `AssetsView`, `AssetDetail`, `AssetFormModal`, `AssetSearch`, `AssetHealthTable`, `LocationMap`, `TicketsView`, `TicketKanban`, `TicketCard`, `TicketFormModal`, `UsersView`, `QrScanner` |
| **vlans** | `VlanPanel`, `VlanTable`, `VlanFormModal`, `VlanTrafficCard` |
| **Layout** | `Layout` (sidebar/nav) |

---

Generado el: 2026-04-04T18:26:00-03:00
