# Frontend — Estructura de Carpetas y Archivos

> Directorio raíz del frontend: `netShield2/frontend/src/`
> Stack: React 19 · TypeScript 5.9 · Vite 8 · TailwindCSS v4 · TanStack Query · Recharts

---

## Archivos raíz de `src/`

### `main.tsx`
Punto de entrada de React. Monta `<App />` en `#root` con `StrictMode`.

### `App.tsx`
**Enrutador principal SPA.** Configura `QueryClient` global, `BrowserRouter`, y define las 19 rutas:

| Ruta | Componente |
|------|------------|
| `/` | `QuickView` |
| `/security/config` | `ConfigView` |
| `/network` | `NetworkPage` |
| `/firewall` | `FirewallPage` |
| `/portal` | `PortalPage` |
| `/phishing` | `PhishingPanel` |
| `/system` | `SystemHealth` |
| `/reports` | `ReportsPage` |
| `/inventory` | `InventoryPage` |
| `/crowdsec` | `CrowdSecCommandCenter` |
| `/crowdsec/intelligence` | `CrowdSecIntelligence` |
| `/crowdsec/config` | `CrowdSecConfig` |
| `/suricata` | `SuricataMotorPage` |
| `/suricata/alerts` | `SuricataAlertsPage` |
| `/suricata/network` | `SuricataNSMPage` |
| `/suricata/rules` | `SuricataRulesPage` |
| `/views` | `ViewsListPage` |
| `/views/:id` | `ViewDetailPage` |
| `/views/:id/edit`, `/views/new` | `ViewBuilderPage` |

Todos los componentes de página están envueltos en `<Layout />`.

### `types.ts`
**Source of truth de todos los tipos TypeScript** (~1600 líneas). Ningún componente o hook define tipos inline; todos importan desde aquí.

Grupos de tipos definidos:
- `TrafficData`, `InterfaceInfo`, `ARPEntry`, `ConnectionInfo`, `LogEntry`, `FirewallRule` — MikroTik
- `WazuhAgent`, `WazuhAlert`, `MitreSummaryItem`, `AgentsSummary` — Wazuh
- `CrowdSecDecision`, `CrowdSecMetrics`, `CrowdSecBouncer`, `CrowdSecScenario`, `IpContext` — CrowdSec
- `GeoIPResult`, `GeoBlockSuggestion`, `SourceCounts`, `TopCountryItem` — GeoIP
- `SuricataEngineStatus`, `SuricataAlert`, `SuricataRule`, `NetworkFlow`, `DnsQuery`, `HttpTransaction`, `TlsHandshake`, `SuricataCorrelation`, `AutoResponseConfig` — Suricata
- `GlpiAsset`, `GlpiTicket`, `GlpiUser`, `GlpiAssetHealth`, `GlpiLocation` — GLPI
- `PortalSession`, `PortalUser`, `PortalProfile`, `PortalConfig` — Portal Cautivo
- `PhishingAlert`, `SuspiciousDomain`, `PhishingVictim` — Phishing
- `TelegramBotStatus`, `TelegramReportConfig`, `TelegramMessageLog` — Telegram
- `CustomView`, `WidgetInstance`, `WidgetCatalogEntry` — Vistas Personalizadas
- `ActionLogEntry`, `ThreatLevel`, `ActivityHeatmapData`, `CorrelationEvent`, `GlpiAssetHealth`, `ConfirmedThreat`, `IncidentLifecycle`, `WorldThreatMapData` — Widgets Agregados

### `index.css`
**Design system y tokens del tema** (~120 KB). Define:
- Variables CSS en `@theme` para TailwindCSS v4 — colores (`--color-primary`, `--color-background`, etc.), tipografías, bordes, sombras, radios
- Clases utilitarias del design system: `glass-card`, `btn-primary`, `btn-secondary`, `btn-danger`, `data-table`, `badge-*`, `stat-card`
- Tokens para todos los temas de color (light/dark + variantes)
- `@font-face` para tipografías locales
- Animaciones CSS: `pulse`, `fade-in`, `slide-up`

---

## `services/`

### `api.ts`
**Cliente API centralizado** (~2000 líneas, 12+ namespaces). Única fuente de llamadas HTTP — ningún componente o hook hace `fetch`/`axios` directo.

Configuración base: `axios` instance con `baseURL: ''` (el proxy de Vite redirige `/api/*` → `localhost:8000`).

Namespaces exportados:
- `mikrotikApi` — `getInterfaces()`, `getArpTable()`, `getConnections()`, `getFirewallRules()`, `getBlacklist()`, `blockIp(data)`, `unblockIp(data)`, `getLogs()`, `getHealth()`
- `wazuhApi` — `getAlerts(params)`, `getAgents()`, `getAgentsSummary()`, `getMitreSummary()`, `getHealth()`, `runActiveResponse(agent_id, data)`
- `networkApi` — `getLabels()`, `createLabel(data)`, `updateLabel(id, data)`, `deleteLabel(id)`, `getGroups()`, `createGroup(data)`, `addGroupMember(id, ip)`, `removeGroupMember(id, ip)`, `search(q)`
- `vlanApi` — `getVlans()`, `createVlan(data)`, `updateVlan(id, data)`, `deleteVlan(id)`, `getVlanTraffic()`
- `securityApi` — `blockIp(data)`, `quarantine(data)`, `geoBlock(data)`, `getConfig()`, `updateConfig(data)`
- `phishingApi` — `getAlerts()`, `getDomains()`, `getVictims()`, `getStats()`, `addSinkhole(data)`, `removeSinkhole(domain)`, `getSinkhole()`, `simulate(data)`
- `portalApi` — `getStatus()`, `getSessions()`, `getHistory()`, `getUsers()`, `createUser(data)`, `updateUser(id, data)`, `deleteUser(id)`, `bulkImport(list)`, `getProfiles()`, `createProfile(data)`, `getConfig()`, `updateConfig(data)`, `getSchedule()`, `updateSchedule(data)`, `setupHotspot()`
- `reportsApi` — `generate(data)`, `exportPdf(data)`, `getHistory()`
- `glpiApi` — `getAssets(params)`, `getAsset(id)`, `createAsset(data)`, `updateAsset(id, data)`, `getStats()`, `getHealth()`, `getTickets()`, `createTicket(data)`, `updateTicketStatus(id, status)`, `getUsers()`, `getLocations()`, `quarantine(id, data)`, `unquarantine(id)`
- `crowdsecApi` — `getDecisions()`, `getMetrics()`, `getBouncers()`, `getScenarios()`, `ctiLookup(ip)`, `addDecision(data)`, `deleteDecision(id)`, `addWhitelist(data)`, `removeWhitelist(ip)`, `sync()`, `getSyncStatus()`, `getTopAttackers()`
- `geoipApi` — `lookup(ip)`, `lookupBulk(ips)`, `getTopCountries(params)`, `getTopAsns()`, `getGeoBlockSuggestions()`, `applyGeoBlockSuggestion(id)`, `getDbStatus()`
- `suricataApi` — `getEngineStatus()`, `getEngineStats()`, `reloadRules()`, `getAlerts(params)`, `getAlertsTimeline()`, `getTopSignatures()`, `getAlertCategories()`, `getFlows(params)`, `getFlowsStats()`, `getDnsQueries()`, `getHttpTransactions()`, `getTlsHandshakes()`, `getRules(params)`, `toggleRule(sid, data)`, `updateRules()`, `getCrowdsecCorrelation()`, `getWazuhCorrelation()`, `getAutoResponseConfig()`, `updateAutoResponseConfig(data)`, `triggerAutoResponse(data)`, `getAutoResponseHistory()`
- `telegramApi` — `getStatus()`, `sendTest()`, `getConfigs()`, `createConfig(data)`, `updateConfig(id, data)`, `deleteConfig(id)`, `triggerNow(id)`, `sendAlert(data)`, `sendStatusSummary(data)`, `getLogs(params)`
- `viewsApi` — `getViews()`, `createView(data)`, `getView(id)`, `updateView(id, data)`, `deleteView(id)`, `getWidgetCatalog()`
- `widgetsApi` — `getThreatLevel()`, `getActivityHeatmap()`, `getCorrelationTimeline()`, `getConfirmedThreats()`, `getIncidentLifecycle(ip)`, `getSuricataAssetCorrelation()`, `getWorldThreatMap()`, `generateViewReport(data)`

---

## `config/`

### `themes.ts`
Define la lista de temas disponibles con nombre, colores primary/background/surface y metadata (modo light/dark). Consumido por `useTheme.ts` y `SettingsDrawer.tsx`.

---

## `lib/`

### `countryCodeMap.ts`
Mapa estático `{CountryName → ISO2 code}`. Usado por `CountryFlag.tsx` para convertir nombres de países a códigos ISO para mostrar emojis de bandera.

---

## `assets/`

- `hero.png` — imagen decorativa
- `vite.svg` — logo por defecto de Vite (no usado en producción)

---

## `hooks/` — Custom Hooks (38 hooks + subcarpeta `widgets/`)

Todos los hooks de datos usan TanStack Query (`useQuery` / `useMutation`). **Ningún hook hace fetch directo** — todas las llamadas pasan por `api.ts`.

### `useWebSocket.ts`
**Hook base de WebSocket.** Reutilizable por todos los hooks de datos en tiempo real.
- Maneja conexión/desconexión, reconexión con backoff exponencial
- Recibe `url`, `onMessage`, `onError`
- Construye la URL WS a partir del origen de la página

### `useTheme.ts`
**Gestión del tema visual.**
- Lee/escribe en `localStorage`
- Aplica tokens CSS en `document.documentElement`
- Detecta preferencia del sistema (`prefers-color-scheme`)
- Exporta: `{ theme, setTheme, availableThemes }`

### `useWazuhSummary.ts`
- `useQuery` → `wazuhApi.getAlerts()` + `wazuhApi.getAgentsSummary()` + `wazuhApi.getMitreSummary()`
- Calculado: nivel de amenaza, top alertas, distribución por agente

### `useMikrotikHealth.ts`
- `useQuery` → `mikrotikApi.getHealth()`

### `useCrowdSecDecisions.ts`
- `useQuery` → `crowdsecApi.getDecisions()`
- `useMutation` → `crowdsecApi.deleteDecision(id)` / `crowdsecApi.addDecision(data)`

### `useCrowdSecMetrics.ts`
- `useQuery` → `crowdsecApi.getMetrics()` (refetch 30s)

### `useCrowdSecAlerts.ts`
- `useQuery` → `crowdsecApi.getAlerts()`

### `useGeoIP.ts`
- `useQuery` → `geoipApi.lookup(ip)` con `staleTime: 1h`

### `useTopCountries.ts`
- `useQuery` → `geoipApi.getTopCountries()` con `refetchInterval: 5min`

### `useGeoBlockSuggestions.ts`
- `useQuery` → `geoipApi.getGeoBlockSuggestions()`
- `useMutation` → `geoipApi.applyGeoBlockSuggestion(id)` + dismiss local optimista

### `useSuricataEngine.ts`
- `useQuery` → `suricataApi.getEngineStatus()` (refetch 30s)
- `useQuery` → `suricataApi.getEngineStats()`
- `useMutation` → `suricataApi.reloadRules()`

### `useSuricataAlerts.ts`
- `useQuery` → `suricataApi.getAlerts(params)` + `getAlertsTimeline()` + `getTopSignatures()` + `getAlertCategories()`
- Suscripción adicional via `useWebSocket` → `/ws/suricata/alerts` para live feed

### `useSuricataFlows.ts`
- `useQuery` → `suricataApi.getFlows()` + `getFlowsStats()` + `getDnsQueries()` + `getHttpTransactions()` + `getTlsHandshakes()`

### `useSuricataRules.ts`
- `useQuery` → `suricataApi.getRules(params)`
- `useMutation` → `suricataApi.toggleRule(sid, data)` / `updateRules()`

### `useSuricataAutoResponse.ts`
- `useQuery` → `suricataApi.getAutoResponseConfig()` + `getAutoResponseHistory()`
- `useMutation` → `suricataApi.updateAutoResponseConfig(data)` + `triggerAutoResponse(data)`

### `useSuricataCorrelation.ts`
- `useQuery` → `suricataApi.getCrowdsecCorrelation()` + `getWazuhCorrelation()`

### `useGlpiAssets.ts`
- `useQuery` → `glpiApi.getAssets(params)` + `getStats()` + `getHealth()`
- `useMutation` → `glpiApi.createAsset(data)` / `updateAsset(id, data)` / `quarantine(id, data)` / `unquarantine(id)`

### `useGlpiTickets.ts`
- `useQuery` → `glpiApi.getTickets()`
- `useMutation` → `glpiApi.createTicket(data)` / `updateTicketStatus(id, status)`

### `useGlpiUsers.ts`
- `useQuery` → `glpiApi.getUsers()`

### `useGlpiHealth.ts`
- `useQuery` → `glpiApi.getHealth()`

### `usePortalSessions.ts`
- `useQuery` → `portalApi.getSessions()`
- Suscripción adicional via `useWebSocket` → `/ws/portal/sessions`

### `usePortalUsers.ts`
- `useQuery` → `portalApi.getUsers()`
- `useMutation` → CRUD + `portalApi.bulkImport(list)`

### `usePortalConfig.ts`
- `useQuery` → `portalApi.getConfig()` + `getSchedule()` + `getStatus()`
- `useMutation` → `portalApi.updateConfig(data)` / `updateSchedule(data)` / `setupHotspot()`

### `usePortalStats.ts`
- `useQuery` → `portalApi.getHistory()` (stats históricas)

### `usePhishing.ts`
- `useQuery` → `phishingApi.getAlerts()` + `getDomains()` + `getVictims()` + `getStats()` + `getSinkhole()`
- `useMutation` → `phishingApi.addSinkhole(data)` / `removeSinkhole(domain)` / `simulate(data)`

### `useSecurityActions.ts`
- `useMutation` → `securityApi.blockIp(data)` / `quarantine(data)` / `geoBlock(data)`

### `useSecurityAlerts.ts`
- **WebSocket combinado** via `useWebSocket` → `/ws/security/alerts`
- Acumula notificaciones multi-source (Wazuh alto nivel + MikroTik interfaz down)
- Exporta: lista de notificaciones activas, `dismissNotification(id)`, `clearAll()`

### `useVlans.ts`
- `useQuery` → `vlanApi.getVlans()`
- `useMutation` → CRUD via `vlanApi`

### `useVlanTraffic.ts`
- `useWebSocket` → `/ws/vlans/traffic` (tráfico en vivo por VLAN)

### `useIpContext.ts`
- `useQuery` → `crowdsecApi.ctiLookup(ip)` + `geoipApi.lookup(ip)`
- Combinado: perfil completo de una IP (GeoIP + CTI CrowdSec + estado en red interna)

### `useNetworkSearch.ts`
- `useQuery` → `networkApi.search(q)` con debounce

### `useSyncStatus.ts`
- `useQuery` → `crowdsecApi.getSyncStatus()`

### `useCustomViews.ts`
- `useQuery` → `viewsApi.getViews()` / `getView(id)`
- `useMutation` → `viewsApi.createView(data)` / `updateView(id, data)` / `deleteView(id)`

### `useWidgetCatalog.ts`
- `useQuery` → `viewsApi.getWidgetCatalog()`
- Devuelve el catálogo tabulado por categoría (Standard/Visual/Technical/Hybrid)

### `useTelegramStatus.ts`
- `useQuery` → `telegramApi.getStatus()` con `refetchInterval: 30s`

### `useTelegramConfigs.ts`
- `useQuery` → `telegramApi.getConfigs()`
- `useMutation` → CRUD + `triggerNow(id)` + `sendTest()` + `sendStatusSummary(data)`

### `useTelegramLogs.ts`
- `useQuery` → `telegramApi.getLogs(params)` con filtros direction/type

### `useQrScanner.ts`
- Lógica de cámara + decodificación QR (para GLPI `QrScanner.tsx`)
- No hace llamadas API, es puro estado local

---

## `hooks/widgets/` — Hooks de datos para widgets del catálogo

Cada subcarpeta es un `index.ts` que exporta todos los hooks de esa categoría.

### `hooks/widgets/visual/index.ts`
- `useActivityHeatmap()` → `widgetsApi.getActivityHeatmap()`
- `useThreatGauge()` → `widgetsApi.getThreatLevel()`
- `useNetworkPulse()` → `useWebSocket('/ws/traffic')` (datos en tiempo real)
- `useAgentsThermometer()` → `wazuhApi.getAgentsSummary()`
- `useBlocksTimeline()` → `crowdsecApi.getMetrics()` + historial de decisiones
- `useEventCounter()` → combina counts de Wazuh + CrowdSec + Suricata
- `useProtocolDonut()` → `suricataApi.getFlowsStats()`

### `hooks/widgets/technical/index.ts`
- `usePacketInspector()` → `suricataApi.getAlerts()`
- `useFlowTable()` → `suricataApi.getFlows()`
- `useLiveLogs()` → `mikrotikApi.getLogs()`
- `useFirewallTree()` → `mikrotikApi.getFirewallRules()`
- `useCrowdSecRaw()` → `crowdsecApi.getDecisions()` + `deleteDecision(id)` mutation
- `useCorrelationTimeline()` → `widgetsApi.getCorrelationTimeline()`
- `useCriticalAssets()` → `glpiApi.getHealth()`
- `useActionLog()` → `GET /api/actions/history`

### `hooks/widgets/hybrid/index.ts`
- `useWorldThreatMap()` → `widgetsApi.getWorldThreatMap()`
- `useConfirmedThreats()` → `widgetsApi.getConfirmedThreats()`
- `useCountryRadar()` → `geoipApi.getTopCountries()`
- `useIpProfiler(ip)` → `useIpContext(ip)` (wrapper)
- `useIncidentLifecycle(ip)` → `widgetsApi.getIncidentLifecycle(ip)`
- `useDefenseLayers()` → múltiples servicios en paralelo (health de cada capa)
- `useGeoblockPredictor()` → `geoipApi.getGeoBlockSuggestions()` + apply mutation
- `useSuricataGlpi()` → `widgetsApi.getSuricataAssetCorrelation()`
- `useViewReportGenerator()` → `widgetsApi.generateViewReport(data)` + export PDF mutation

---

## `components/` — Componentes por dominio

### `Layout.tsx`
**Shell de la aplicación.** Sidebar glassmorphic + topbar con status indicators.
- Sidebar: 7 grupos de navegación con íconos y submenús colapsables
- Topbar: `MockModeBadge`, indicadores de conexión (MikroTik/Wazuh/CrowdSec), botón de notificaciones, `SettingsDrawer`
- Integra `NotificationPanel` para alertas en tiempo real
- Integra `GlobalSearch` para búsqueda de IPs a nivel global

---

### `common/` — Componentes compartidos

| Archivo | Propósito |
|---------|-----------|
| `ConfirmModal.tsx` | Modal de confirmación reutilizable. Usado por cualquier acción destructiva (bloqueo de IPs, auto-response, cuarentena). Props: `title`, `message`, `onConfirm`, `onCancel`, `danger` |
| `MockModeBadge.tsx` | Badge visual en la topbar que muestra qué servicios están en mock. Consulta `GET /api/system/mock-status` cada 30s |
| `GlobalSearch.tsx` | Búsqueda global de IPs (nombre, etiqueta, grupo, ARP, GeoIP). Usa `useNetworkSearch` con debounce |
| `SettingsDrawer.tsx` | Panel lateral de configuración de usuario (tema, tamaño de fuente). Usa `useTheme` |
| `ThemeCard.tsx` | Card de previsualización de un tema. Usado dentro de `SettingsDrawer` |
| `FontSizeSlider.tsx` | Slider para ajustar el tamaño de fuente base (aplica CSS var) |

---

### `dashboard/` — Dashboard principal

| Archivo | Propósito |
|---------|-----------|
| `DashboardPage.tsx` | Página principal (legacy — en la práctica reemplazada por `QuickView`) |
| `TrafficChart.tsx` | Gráfico de tráfico en tiempo real (Recharts AreaChart). Consume datos del WebSocket `/ws/traffic` vía `useWebSocket` |
| `AlertsFeed.tsx` | Feed de últimas alertas Wazuh. Consume `useWebSocket('/ws/alerts')` |
| `ConnectionsTable.tsx` | Tabla de conexiones activas. Consume `mikrotikApi.getConnections()` |

---

### `security/` — Vista principal de seguridad

| Archivo | Propósito |
|---------|-----------|
| `QuickView.tsx` | **Vista principal** (`/`). Vista unificada de seguridad: stat cards (alertas, agentes, bloqueos), `TrafficChart`, `AlertsFeed`, `ConnectionsTable`, últimas acciones del log. Usa múltiples hooks |
| `ConfigView.tsx` | Configuración de seguridad (`/security/config`): blacklist CRUD, sliders de umbral, geo-block, DNS sinkhole. Usa `useSecurityActions`, `useCrowdSecDecisions` |
| `NotificationPanel.tsx` | Panel deslizable de notificaciones en tiempo real (alertas críticas, interfaz caída). Consume `useSecurityAlerts` (WebSocket `/ws/security/alerts`) |
| `LastIncidentCard.tsx` | Tarjeta resumen del último incidente detectado. Se alimenta de los datos del `NotificationPanel` |

---

### `firewall/`

| Archivo | Propósito |
|---------|-----------|
| `FirewallPage.tsx` | Página de firewall completa (`/firewall`): tabla de reglas activas (via `mikrotikApi.getFirewallRules()`), lista de IPs bloqueadas, historial de acciones de bloqueo, formulario para bloquear IP con `ConfirmModal` |

---

### `network/`

| Archivo | Propósito |
|---------|-----------|
| `NetworkPage.tsx` | Página de red (`/network`): tabbed page con 4 pestañas — ARP Table, VLANs, Labels, Groups. Integra `VlanPanel`, tablas de etiquetas/grupos, `GlobalSearch`. Usa múltiples hooks |

---

### `vlans/`

| Archivo | Propósito |
|---------|-----------|
| `VlanPanel.tsx` | Panel principal de VLANs. Muestra la lista con estado de alerta y abre `VlanTable` |
| `VlanTable.tsx` | Tabla de VLANs con acciones CRUD. Usa `useVlans` |
| `VlanTrafficCard.tsx` | Tarjeta de tráfico en tiempo real por VLAN via WebSocket. Usa `useVlanTraffic` |
| `VlanFormModal.tsx` | Modal de creación/edición de VLAN. Usa `useVlans` mutations |

---

### `portal/` — Portal Cautivo

| Archivo | Propósito |
|---------|-----------|
| `PortalPage.tsx` | Contenedor tabbed del portal (`/portal`). Integra: Monitor, Usuarios, Perfiles, Stats, Config |
| `MonitorView.tsx` | Vista de monitoreo en tiempo real: `SessionsTable` + `SessionsChart` + `StatsView`. Usa `usePortalSessions` (WebSocket) |
| `SessionsTable.tsx` | Tabla de sesiones activas con datos de ancho de banda. |
| `SessionsChart.tsx` | Gráfico de sesiones a lo largo del tiempo (Recharts LineChart) |
| `StatsView.tsx` | Estadísticas de uso: datos históricos, top usuarios por consumo. Usa `usePortalStats` |
| `UsersView.tsx` | Vista de gestión de usuarios: lista + búsqueda + acciones CRUD |
| `UserTable.tsx` | Tabla de usuarios del portal con acciones inline |
| `UserFormModal.tsx` | Modal de creación/edición de usuario. Usa `usePortalUsers` mutations |
| `BulkImportModal.tsx` | Modal de importación masiva de usuarios (CSV/JSON) |
| `SpeedProfiles.tsx` | Gestión de perfiles de velocidad. Usa `usePortalConfig` mutations |
| `ConfigView.tsx` | Configuración general del hotspot (interfaz, pool, servidor). |
| `ScheduleConfig.tsx` | Configuración de horarios de acceso por día/hora |
| `UsageHeatmap.tsx` | Heatmap de uso por hora del día |

---

### `phishing/`

| Archivo | Propósito |
|---------|-----------|
| `PhishingPanel.tsx` | Página completa de phishing (`/phishing`): alertas, víctimas, gestión del sinkhole DNS, estadísticas. Usa `usePhishing` |

---

### `system/` — Salud del sistema

| Archivo | Propósito |
|---------|-----------|
| `SystemHealth.tsx` | Página de salud del sistema (`/system`). MikroTik health cards + Wazuh manager health + estado de sincronización CrowdSec + estado GeoIP. Integra `RemoteCLI` y `GeoIPStatus` |
| `RemoteCLI.tsx` | Terminal web interactiva (WebSocket-like). Send/receive de comandos RouterOS y Wazuh agent. Usa `securityApi.cliMikrotik()` / `cliWazuhAgent()` |
| `GeoIPStatus.tsx` | Card de estado de las bases de datos GeoLite2: fecha de build, entradas en caché, cuántos lookups se hicieron. Usa `geoipApi.getDbStatus()` |

---

### `reports/` — Reportes y Telegram

| Archivo | Propósito |
|---------|-----------|
| `ReportsPage.tsx` | Página de reportes (`/reports`). Dos tabs: **Generador IA** + **Telegram**. Tab Generador: TipTap editor + panel de configuración (audiencia, fuentes, prompt) + botones generar/exportar PDF. Tab Telegram: renderiza `TelegramTab` |
| `TelegramTab.tsx` | Contenedor de las pestañas de Telegram: Status, Configs, Historial, Chat |
| `TelegramStatusCard.tsx` | Card con estado de conexión del bot (online/offline, username, mock mode). Usa `useTelegramStatus` |
| `TelegramConfigList.tsx` | Lista de configuraciones de reportes automáticos con acciones. Usa `useTelegramConfigs` |
| `TelegramConfigModal.tsx` | Modal de creación/edición de una configuración. Integra `CronBuilder` y `MessagePreview` |
| `CronBuilder.tsx` | Selector visual de expresiones cron (días, hora). Sin dependencias externas |
| `MessagePreview.tsx` | Preview del mensaje que enviará una configuración antes de guardar |
| `TelegramQuickActions.tsx` | Botones rápidos: Enviar prueba, Enviar resumen ahora, Enviar alerta manual |
| `TelegramHistory.tsx` | Historial de mensajes con filtros (direction, type, fecha). Usa `useTelegramLogs` |
| `BotConversation.tsx` | Chat UI para ver conversaciones inbound del bot. Usa `useTelegramLogs` filtrado por inbound |

---

### `inventory/` — GLPI

| Archivo | Propósito |
|---------|-----------|
| `InventoryPage.tsx` | Contenedor de pestaña (`/inventory`). Integra AssetsView, TicketsView, UsersView, HealthView |
| `AssetsView.tsx` | Vista principal de activos: kanban por categoría + grid/list. Usa `useGlpiAssets` |
| `AssetDetail.tsx` | Modal/panel de detalle de un activo: info técnica, contexto de red, alertas Wazuh asociadas |
| `AssetFormModal.tsx` | Modal de creación/edición de activo |
| `AssetSearch.tsx` | Barra de búsqueda de activos en tiempo real |
| `AssetHealthTable.tsx` | Tabla de salud de activos correlacionada con agentes Wazuh. Usa `useGlpiHealth` |
| `HealthView.tsx` | Vista dedicada de salud: `AssetHealthTable` + indicadores de criticidad |
| `TicketsView.tsx` | Lista y gestión de tickets de soporte |
| `TicketKanban.tsx` | Vista kanban de tickets por estado |
| `TicketCard.tsx` | Card individual de ticket en el kanban |
| `TicketFormModal.tsx` | Modal de creación/edición de ticket |
| `UsersView.tsx` | Lista de usuarios de GLPI |
| `LocationMap.tsx` | Mapa estático de ubicaciones físicas de activos |
| `QrScanner.tsx` | Scanner QR para identificar activos por código. Usa `useQrScanner` |

---

### `crowdsec/` — Centro CrowdSec

| Archivo | Propósito |
|---------|-----------|
| `CommandCenter.tsx` | Página principal CrowdSec (`/crowdsec`). Integra `DecisionsTable`, `DecisionsTimeline`, `SyncStatusBanner`, `TopAttackers`, botones de acción rápida |
| `DecisionsTable.tsx` | Tabla de decisiones activas enriquecidas con GeoIP (bandera, ciudad, tipo de red). Usa `useCrowdSecDecisions`. Integra `CountryFlag`, `NetworkTypeBadge`, `CommunityScoreBadge` |
| `DecisionsTimeline.tsx` | Timeline de las últimas decisiones. Usa WebSocket `/ws/crowdsec/decisions` |
| `IntelligenceView.tsx` | Página de inteligencia (`/crowdsec/intelligence`). Integra `TopCountriesWidget`, `GeoBlockSuggestions`, `CountryHeatmap`, `ScenariosTable` |
| `TopAttackers.tsx` | Widget de top IPs atacantes por hits |
| `CountryHeatmap.tsx` | Heatmap de intensidad de ataques por país ("calor" por color) |
| `ScenariosTable.tsx` | Tabla de escenarios detección activos. Usa `useCrowdSecMetrics` |
| `IpContextPanel.tsx` | Panel de perfil completo de una IP: GeoIP + CTI CrowdSec + historial de alertas. Usa `useIpContext` |
| `CommunityScoreBadge.tsx` | Badge con score de reputación comunitaria de CrowdSec CTI |
| `BouncerStatus.tsx` | Estado de bouncers registrados en la LAPI |
| `SyncStatusBanner.tsx` | Banner de estado de sincronización CrowdSec ↔ MikroTik |
| `ConfigView.tsx` | Configuración de CrowdSec (`/crowdsec/config`): whitelist, gestión de bouncers |
| `WhitelistManager.tsx` | CRUD de whitelist de IPs. Usa `crowdsecApi` directamente via mutation |

---

### `suricata/` — Motor IDS/IPS/NSM

| Archivo | Propósito |
|---------|-----------|
| `MotorPage.tsx` | Página del motor Suricata (`/suricata`). Estado en tiempo real (modo, métricas), series de tráfico, categorías de alertas (donut), circuito auto-response. Usa `useSuricataEngine`, `useSuricataAutoResponse` |
| `AlertsPage.tsx` | Página de alertas IDS/IPS (`/suricata/alerts`). Tabla de alertas + timeline + top firmas + datos del WebSocket. Usa `useSuricataAlerts` |
| `NSMPage.tsx` | Página NSM (`/suricata/network`). Tabs: Flujos, DNS, HTTP, TLS. Usa `useSuricataFlows` |
| `RulesPage.tsx` | Gestión de reglas (`/suricata/rules`). Toggle enable/disable por SID, filtros por categoría, botón update. Usa `useSuricataRules` |

---

### `geoip/` — Geolocalización

| Archivo | Propósito |
|---------|-----------|
| `CountryFlag.tsx` | Micro-componente: emoji de bandera dado un código de país ISO2. Usa `countryCodeMap.ts` |
| `NetworkTypeBadge.tsx` | Badge coloreado con el tipo de red (ISP/Hosting/Business/Residential/Tor). |
| `TopCountriesWidget.tsx` | Widget de top países atacantes con barras de progreso. Usa `useTopCountries` |
| `GeoBlockSuggestions.tsx` | Panel de sugerencias de geo-bloqueo con botón "Aplicar". Usa `useGeoBlockSuggestions` |
| `SuggestionCard.tsx` | Card individual de sugerencia de geo-bloqueo con detalles de IPs y botón de acción |

---

### `widgets/` — Biblioteca de Widgets del Catálogo

#### `common/index.tsx`
Componentes de soporte para widgets:
- `WidgetSkeleton` — placeholder de carga con animación
- `WidgetErrorState` — estado de error con mensaje y botón retry
- `WidgetHeader` — header reutilizable de widget con título, icono y acciones

#### `visual/` — Widgets visuales (7)
| Archivo | Hook | Descripción |
|---------|------|-------------|
| `ThreatGauge.tsx` | `useThreatGauge` | Gauge semicircular 0–100 con colores por nivel |
| `ActivityHeatmap.tsx` | `useActivityHeatmap` | Calendario 7×24h con intensidad de alertas |
| `NetworkPulse.tsx` | `useNetworkPulse` | ECG animado de tráfico de red en SVG |
| `AgentsThermometer.tsx` | `useAgentsThermometer` | Termómetro visual del ratio alertas/agentes |
| `BlocksTimeline.tsx` | `useBlocksTimeline` | Línea de tiempo de bloqueos CrowdSec en 24h |
| `EventCounter.tsx` | `useEventCounter` | Contador giratorio de eventos totales |
| `ProtocolDonut.tsx` | `useProtocolDonut` | Donut de distribución de protocolos NSM |
| `index.ts` | — | Re-exporta todos los componentes visuales |

#### `technical/` — Widgets técnicos (8)
| Archivo | Hook | Descripción |
|---------|------|-------------|
| `PacketInspector.tsx` | `usePacketInspector` | Alertas Suricata con detalle expandible |
| `FlowTableWidget.tsx` | `useFlowTable` | Tabla de flujos activos NSM |
| `LiveLogs.tsx` | `useLiveLogs` | Terminal de logs RouterOS con auto-scroll |
| `FirewallTree.tsx` | `useFirewallTree` | Árbol de reglas firewall agrupado por chain |
| `CrowdSecRaw.tsx` | `useCrowdSecRaw` | Tabla raw de decisiones CrowdSec |
| `CorrelationTimeline.tsx` | `useCorrelationTimeline` | Timeline multi-fuente Wazuh+Suricata+CrowdSec |
| `CriticalAssets.tsx` | `useCriticalAssets` | Activos GLPI críticos con estado de salud |
| `ActionLogWidget.tsx` | `useActionLog` | Log de acciones de seguridad recientes |

#### `hybrid/` — Widgets de correlación (9)
| Archivo | Hook | Descripción |
|---------|------|-------------|
| `WorldThreatMap.tsx` | `useWorldThreatMap` | Mapa mundial con intensidad por país |
| `ConfirmedThreats.tsx` | `useConfirmedThreats` | IPs confirmadas por múltiples fuentes |
| `CountryRadar.tsx` | `useCountryRadar` | Radar de países atacantes por fuente |
| `IpProfiler.tsx` | `useIpProfiler` | Perfil completo de IP: GeoIP+CTI+red interna |
| `IncidentLifecycle.tsx` | `useIncidentLifecycle` | Ciclo detección→bloqueo→resolución |
| `DefenseLayers.tsx` | `useDefenseLayers` | Estado visual de todas las capas defensivas |
| `GeoblockPredictor.tsx` | `useGeoblockPredictor` | Sugerencias predictivas de geo-bloqueo |
| `SuricataGlpiCorrelation.tsx` | `useSuricataGlpi` | Alertas Suricata ↔ activos GLPI |
| `ViewReportGenerator.tsx` | `useViewReportGenerator` | Generador de reportes IA desde una vista |

---

### `views/` — Sistema de Vistas Personalizadas

| Archivo | Propósito |
|---------|-----------|
| `ViewsListPage.tsx` | Lista de dashboards guardados (`/views`). Cards con nombre, descripción, fecha. Botón "Nueva vista". Usa `useCustomViews` |
| `ViewBuilderPage.tsx` | Editor de vistas (`/views/:id/edit`, `/views/new`). Canvas de grid + catálogo tabulado de widgets. Permite arrastrar widgets al grid, configurar tamaño y guardar. Usa `useCustomViews` mutations + `useWidgetCatalog` |
| `ViewDetailPage.tsx` | Dashboard en vivo (`/views/:id`). Carga la vista desde SQLite y renderiza cada widget via `WidgetRenderer`. Usa `useCustomViews` |
| `WidgetRenderer.tsx` | **Dispatcher dinámico de widgets** (~19KB). Switch sobre `widget.type` → renderiza el componente correspondiente con su `config`. Importa todos los widgets de `widgets/visual/`, `widgets/technical/`, `widgets/hybrid/`. Agregar un widget nuevo solo requiere: (1) registrar en backend, (2) crear componente, (3) agregar `case` aquí |
