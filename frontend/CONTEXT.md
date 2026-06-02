# Frontend — NetShield Dashboard

## Estructura de carpetas real

```
frontend/src/
├── main.tsx                           # Entry point, monta App en #root
├── App.tsx                            # QueryClientProvider + BrowserRouter + Routes (23 rutas)
├── index.css                          # Design system completo (TailwindCSS v4 + clases custom, 121KB)
├── types.ts                           # Tipos TypeScript (~39KB, espejo de schemas Pydantic)
│
├── services/
│   └── api.ts                         # Cliente Axios centralizado (~37KB, 15+ namespaces)
│                                      # Namespaces: mikrotikApi, wazuhApi, networkApi, reportsApi,
│                                      # securityApi, vlansApi, phishingApi, portalApi, glpiApi,
│                                      # crowdsecApi, geoipApi, suricataApi, telegramApi,
│                                      # viewsApi, widgetsApi, systemApi, actionsApi, dhcpApi
│
├── config/
│   └── themes.ts                      # 6 temas disponibles (ThemeConfig[], ThemeId, font scale options)
│
├── lib/
│   └── countryCodeMap.ts              # Mapa {CountryName → ISO2} para banderas emoji
│
├── hooks/
│   ├── useWebSocket.ts                # Hook base: reconexión con backoff exponencial
│   ├── useTheme.ts                    # Gestión de temas: localStorage + CSS vars + data-theme
│   │
│   │   # — Data hooks (40 hooks) —
│   ├── useWazuhSummary.ts             # Alertas + agents + MITRE summary + health export
│   ├── useMikrotikHealth.ts           # Health del router
│   ├── useCrowdSecDecisions.ts        # Decisions CRUD + mutations
│   ├── useCrowdSecMetrics.ts          # Métricas del motor CrowdSec + health export
│   ├── useCrowdSecAlerts.ts           # Alertas del LAPI
│   ├── useGeoIP.ts                    # Lookup individual con staleTime 1h
│   ├── useTopCountries.ts             # Top países atacantes
│   ├── useGeoBlockSuggestions.ts      # Sugerencias geo-block + apply mutation
│   ├── useSuricataEngine.ts           # Status + stats + reload mutation + isHealthy export
│   ├── useSuricataAlerts.ts           # Alertas + timeline + top firmas + WebSocket
│   ├── useSuricataFlows.ts            # Flows + DNS + HTTP + TLS
│   ├── useSuricataRules.ts            # Rules + toggle + update mutations
│   ├── useSuricataAutoResponse.ts     # Config + history + trigger mutation
│   ├── useSuricataCorrelation.ts      # CrowdSec × Wazuh correlation
│   ├── useGlpiAssets.ts               # Assets CRUD + stats + health + quarantine
│   ├── useGlpiTickets.ts              # Tickets CRUD
│   ├── useGlpiUsers.ts               # Users lista
│   ├── useGlpiHealth.ts              # Health correlacionada
│   ├── usePortalSessions.ts           # Sessions + WebSocket
│   ├── usePortalUsers.ts              # Users CRUD + bulk import
│   ├── usePortalConfig.ts             # Config + schedule + setup
│   ├── usePortalStats.ts              # Stats históricas
│   ├── usePhishing.ts                 # Alertas + víctimas + sinkhole CRUD
│   ├── useSecurityActions.ts          # Block, quarantine, geo-block mutations
│   ├── useSecurityAlerts.ts           # WebSocket /ws/security/alerts + notificaciones
│   ├── useVlans.ts                    # VLANs CRUD
│   ├── useVlanTraffic.ts              # WebSocket /ws/vlans/traffic
│   ├── useIpContext.ts                # CTI CrowdSec + GeoIP lookup combinado
│   ├── useNetworkSearch.ts            # Búsqueda global con debounce
│   ├── useSyncStatus.ts              # Estado sync CrowdSec → MikroTik
│   ├── useCustomViews.ts             # Views CRUD
│   ├── useWidgetCatalog.ts            # Catálogo de widgets por categoría
│   ├── useTelegramStatus.ts           # Estado del bot (refetch 30s)
│   ├── useTelegramConfigs.ts          # Configs CRUD + trigger + test
│   ├── useTelegramLogs.ts             # Historial de mensajes con filtros
│   └── useQrScanner.ts               # Cámara + QR decode (estado local, sin API)
│   ├── useDhcp.ts                    # DHCP: 7 read + 10 mutation + 5 Fase 2 hooks
│   │
│   └── widgets/                       # Hooks de datos para widgets del catálogo
│       ├── visual/index.ts            # 11 hooks: ThreatGauge, ActivityHeatmap, NetworkPulse,
│       │                              #   EventCounter, ProtocolDonut, AgentsThermometer,
│       │                              #   BlocksTimeline, PortalUsage, PhishingStats, AgentAlertHeatmap,
│       │                              #   SubnetUsageWidget
│       ├── technical/index.ts         # 13 hooks: PacketInspector, FlowTable, LiveLogs, FirewallTree,
│       │                              #   CrowdSecRaw, CorrelationTimeline, CriticalAssets, ActionLog,
│       │                              #   DnsMonitor, TlsFingerprint, BandwidthTop, HttpInspector,
│       │                              #   DhcpLeasesWidget
│       └── hybrid/index.ts            # 15 hooks: IpProfiler, ConfirmedThreats, CountryRadar,
│                                      #   IncidentLifecycle, DefenseLayers, GeoblockPredictor,
│                                      #   SuricataGlpi, WorldThreatMap, ViewReportGenerator,
│                                      #   TelegramActivity, MitreMatrix, VlanHealth,
│                                      #   QuarantineTracker, SinkholeEffectiveness, DhcpDiscoveryWidget
│
└── components/
    ├── Layout.tsx                      # Sidebar glassmorphic 7 grupos + topbar (5 status dots) +
    │                                   # GlobalSearch + MockModeBadge + NotificationPanel + SettingsDrawer
    │
    ├── common/                         # 6 componentes compartidos
    │   ├── MockModeBadge.tsx           # Badge amarillo en topbar cuando hay servicios en mock
    │   ├── GlobalSearch.tsx            # Búsqueda global de IPs y hosts
    │   ├── ConfirmModal.tsx            # Modal de confirmación genérico (acciones destructivas)
    │   ├── SettingsDrawer.tsx          # Panel lateral config: tema + fuente
    │   ├── ThemeCard.tsx               # Card preview de tema (swatches + label)
    │   └── FontSizeSlider.tsx          # Slider tamaño de fuente
    │
    ├── security/                       # 4 componentes
    │   ├── QuickView.tsx              # Vista principal ("/") — stats, tráfico, alertas, conexiones
    │   ├── ConfigView.tsx             # Config seguridad: blacklist, umbrales, geo-block, sinkhole
    │   ├── NotificationPanel.tsx      # Panel deslizable alertas en tiempo real multi-fuente
    │   └── LastIncidentCard.tsx       # Card del último incidente detectado
    │
    ├── dashboard/                      # 4 componentes (algunos reusados en QuickView)
    │   ├── DashboardPage.tsx          # Página legacy (reemplazada por QuickView)
    │   ├── TrafficChart.tsx           # Recharts AreaChart con datos WebSocket en vivo
    │   ├── ConnectionsTable.tsx       # Tabla filtrable de conexiones activas
    │   └── AlertsFeed.tsx             # Feed scrollable de alertas con badges severidad
    │
    ├── firewall/
    │   └── FirewallPage.tsx           # Bloqueo de IPs + tabla reglas + historial acciones
    │
    ├── network/
    │   └── NetworkPage.tsx            # Tabs: ARP / VLANs / Labels / Groups (con CRUD)
    │
    ├── dhcp/                          # 1 componente — Administración DHCP MikroTik
    │   └── DhcpPage.tsx               # Página completa con 7 tabs (servidores, leases, pools,
    │                                  # redes, alertas rogue, opciones, correlación GLPI/discovery)
    │
    ├── vlans/                          # 4 componentes (embebidos en NetworkPage)
    │   ├── VlanPanel.tsx              # Panel principal con lista y estado de alerta
    │   ├── VlanTable.tsx              # Tabla CRUD de VLANs
    │   ├── VlanTrafficCard.tsx         # Card tráfico en tiempo real por VLAN (WebSocket)
    │   └── VlanFormModal.tsx           # Modal creación/edición de VLAN
    │
    ├── portal/                         # 13 componentes — Portal Cautivo MikroTik Hotspot
    │   ├── PortalPage.tsx             # Contenedor tabbed (Monitor/Users/Profiles/Stats/Config)
    │   ├── MonitorView.tsx            # Monitoreo en tiempo real
    │   ├── SessionsTable.tsx          # Tabla sesiones activas
    │   ├── SessionsChart.tsx          # Gráfico de sesiones (Recharts LineChart)
    │   ├── StatsView.tsx              # Stats históricas
    │   ├── UsersView.tsx              # Gestión de usuarios
    │   ├── UserTable.tsx              # Tabla de usuarios con acciones inline
    │   ├── UserFormModal.tsx           # Modal creación/edición usuario
    │   ├── BulkImportModal.tsx         # Modal importación masiva (CSV/JSON)
    │   ├── SpeedProfiles.tsx           # Gestión perfiles velocidad
    │   ├── ConfigView.tsx             # Config general del hotspot
    │   ├── ScheduleConfig.tsx          # Horarios de acceso por día/hora
    │   └── UsageHeatmap.tsx            # Heatmap de uso por hora
    │
    ├── phishing/
    │   └── PhishingPanel.tsx          # Alertas, víctimas, sinkhole DNS, estadísticas
    │
    ├── system/                         # 3 componentes
    │   ├── SystemHealth.tsx           # MikroTik + Wazuh + CrowdSec sync + GeoIP DB
    │   ├── RemoteCLI.tsx              # Terminal web RouterOS y Wazuh agent
    │   └── GeoIPStatus.tsx            # Estado de las bases de datos GeoLite2
    │
    ├── reports/                        # 10 componentes — Reportes IA + Telegram
    │   ├── ReportsPage.tsx            # Tabs: Generador IA + Telegram
    │   ├── TelegramTab.tsx            # Contenedor de pestañas Telegram
    │   ├── TelegramStatusCard.tsx     # Estado del bot (online/offline)
    │   ├── TelegramConfigList.tsx      # Lista de reportes automáticos
    │   ├── TelegramConfigModal.tsx     # Modal creación/edición config
    │   ├── CronBuilder.tsx            # Selector visual de expresiones cron
    │   ├── MessagePreview.tsx          # Preview del mensaje antes de guardar
    │   ├── TelegramQuickActions.tsx    # Botones rápidos: prueba, resumen, alerta
    │   ├── TelegramHistory.tsx         # Historial de mensajes con filtros
    │   └── BotConversation.tsx         # Chat UI conversaciones inbound
    │
    ├── inventory/                      # 14 componentes — GLPI ITSM
    │   ├── InventoryPage.tsx          # Contenedor tabbed (Assets/Tickets/Users/Health)
    │   ├── AssetsView.tsx             # Vista principal con búsqueda y filtros
    │   ├── AssetDetail.tsx            # Detalle de activo + contexto red + alertas (20KB)
    │   ├── AssetFormModal.tsx          # Modal creación/edición activo
    │   ├── AssetSearch.tsx            # Búsqueda de activos
    │   ├── AssetHealthTable.tsx        # Tabla salud correlacionada con Wazuh
    │   ├── HealthView.tsx             # Vista dedicada de salud
    │   ├── TicketsView.tsx            # Lista y gestión de tickets
    │   ├── TicketKanban.tsx           # Vista kanban por estado
    │   ├── TicketCard.tsx             # Card individual en kanban
    │   ├── TicketFormModal.tsx         # Modal creación/edición ticket
    │   ├── UsersView.tsx              # Lista usuarios GLPI
    │   ├── LocationMap.tsx            # Mapa de ubicaciones de activos
    │   └── QrScanner.tsx              # Scanner QR para identificar activos
    │
    ├── crowdsec/                       # 13 componentes — Centro de Comando CrowdSec
    │   ├── CommandCenter.tsx          # Página principal: decisions, timeline, sync, top attackers
    │   ├── DecisionsTable.tsx         # Tabla decisions enriquecidas con GeoIP
    │   ├── DecisionsTimeline.tsx       # Timeline de últimas decisiones (WebSocket)
    │   ├── IntelligenceView.tsx        # Top countries, geo-block, heatmap, scenarios
    │   ├── TopAttackers.tsx           # Top IPs atacantes
    │   ├── CountryHeatmap.tsx          # Heatmap de intensidad por país
    │   ├── ScenariosTable.tsx          # Tabla de escenarios
    │   ├── IpContextPanel.tsx          # Perfil IP: GeoIP + CTI + alertas (11KB)
    │   ├── CommunityScoreBadge.tsx     # Badge score reputación CrowdSec
    │   ├── BouncerStatus.tsx          # Estado de bouncers
    │   ├── SyncStatusBanner.tsx        # Banner sync CrowdSec ↔ MikroTik
    │   ├── ConfigView.tsx             # Whitelist, bouncers config
    │   └── WhitelistManager.tsx        # CRUD whitelist de IPs
    │
    ├── suricata/                       # 4 páginas
    │   ├── MotorPage.tsx              # Motor: status, métricas, categorías, auto-response (19KB)
    │   ├── AlertsPage.tsx             # Alertas IDS/IPS: tabla + timeline + top firmas (16KB)
    │   ├── NSMPage.tsx                # NSM: Flows / DNS / HTTP / TLS (tabs) (15KB)
    │   └── RulesPage.tsx              # Gestión de reglas: toggle, filtros, update (12KB)
    │
    ├── geoip/                          # 5 componentes
    │   ├── CountryFlag.tsx            # Emoji bandera dado código ISO2
    │   ├── NetworkTypeBadge.tsx        # Badge tipo de red (ISP/Hosting/Tor/etc.)
    │   ├── TopCountriesWidget.tsx      # Top países atacantes con barras
    │   ├── GeoBlockSuggestions.tsx     # Panel sugerencias geo-block
    │   └── SuggestionCard.tsx          # Card individual de sugerencia
    │
    ├── views/                          # 4 componentes — Sistema de Vistas Personalizadas
    │   ├── ViewsListPage.tsx          # Lista de dashboards guardados
    │   ├── ViewBuilderPage.tsx         # Editor: grid + catálogo tabulado + drag-and-drop
    │   ├── ViewDetailPage.tsx          # Dashboard en vivo con widgets
    │   └── WidgetRenderer.tsx          # Dispatcher dinámico: widget.type → componente (22KB)
    │
    ├── widgets/                        # Biblioteca de 39 Widgets
    │   ├── common/index.tsx           # WidgetSkeleton, WidgetErrorState, WidgetHeader
    │   ├── visual/                    # 11 widgets
    │   │   ├── ThreatGauge.tsx        # Gauge semicircular 0–100
    │   │   ├── ActivityHeatmap.tsx     # Calendario 7×24h alertas
    │   │   ├── NetworkPulse.tsx       # ECG animado tráfico SVG
    │   │   ├── AgentsThermometer.tsx   # Termómetro alertas/agentes
    │   │   ├── BlocksTimeline.tsx      # Timeline bloqueos CrowdSec 24h
    │   │   ├── EventCounter.tsx       # Contador giratorio eventos
    │   │   ├── ProtocolDonut.tsx      # Donut protocolos NSM
    │   │   ├── PortalUsage.tsx        # Uso del portal cautivo
    │   │   ├── PhishingStats.tsx      # Estadísticas de phishing
    │   │   ├── AgentAlertHeatmap.tsx   # Heatmap agentes × horas
    │   │   ├── DhcpSubnetUsage.tsx    # Barras de uso de subredes DHCP
    │   │   └── index.ts               # Re-exports
    │   ├── technical/                 # 13 widgets
    │   │   ├── PacketInspector.tsx     # Alertas Suricata expandibles
    │   │   ├── FlowTableWidget.tsx     # Tabla flujos NSM
    │   │   ├── LiveLogs.tsx           # Terminal logs RouterOS
    │   │   ├── FirewallTree.tsx       # Árbol reglas por chain
    │   │   ├── CrowdSecRaw.tsx        # Tabla raw decisions
    │   │   ├── CorrelationTimeline.tsx # Timeline multi-fuente
    │   │   ├── CriticalAssets.tsx      # Activos GLPI críticos
    │   │   ├── ActionLogWidget.tsx     # Log acciones recientes
    │   │   ├── DnsMonitor.tsx         # Consultas DNS capturadas
    │   │   ├── TlsFingerprint.tsx     # Handshakes TLS JA3/SNI
    │   │   ├── BandwidthTop.tsx       # Top IPs por consumo de ancho de banda
    │   │   ├── HttpInspector.tsx      # Transacciones HTTP capturadas
    │   │   ├── DhcpLeasesWidget.tsx   # Tabla de leases DHCP activos
    │   │   └── index.ts               # Re-exports
    │   └── hybrid/                    # 15 widgets
    │       ├── WorldThreatMap.tsx      # Mapa mundial por país (d3-geo + topojson)
    │       ├── ConfirmedThreats.tsx    # IPs multi-fuente
    │       ├── CountryRadar.tsx       # Radar países por fuente
    │       ├── IpProfiler.tsx         # Perfil IP completo
    │       ├── IncidentLifecycle.tsx   # Ciclo detección→resolución
    │       ├── DefenseLayers.tsx      # Capas defensivas visuales
    │       ├── GeoblockPredictor.tsx   # Sugerencias predictivas
    │       ├── SuricataGlpiCorrelation.tsx # Alertas × activos
    │       ├── ViewReportGenerator.tsx # Reportes IA desde vista
    │       ├── TelegramActivity.tsx   # Actividad bot Telegram
    │       ├── MitreMatrix.tsx        # Matriz MITRE ATT&CK
    │       ├── VlanHealth.tsx         # Salud de VLANs
    │       ├── QuarantineTracker.tsx   # Tracker de cuarentenas
    │       ├── SinkholeEffectiveness.tsx # Efectividad sinkhole DNS
    │       ├── DhcpDiscovery.tsx      # Discovery dispositivos DHCP (registered/unregistered/stale)
    │       └── index.ts               # Re-exports
    │
    └── utils/
        └── time.ts                    # Helpers de formateo de fechas/tiempo
```

---

## Sistema de navegación

### Rutas reales en `App.tsx` (23 rutas)

| Ruta | Componente | Grupo |
|------|-----------|-------|
| `/` | `QuickView` | Seguridad |
| `/security/config` | `ConfigView` | Seguridad |
| `/network` | `NetworkPage` | Infraestructura |
| `/firewall` | `FirewallPage` | Infraestructura |
| `/portal` | `PortalPage` | Infraestructura |
| `/dhcp` | `DhcpPage` | Infraestructura |
| `/phishing` | `PhishingPanel` | Herramientas |
| `/system` | `SystemHealth` | Herramientas |
| `/reports` | `ReportsPage` | Herramientas |
| `/inventory` | `InventoryPage` | Inventario |
| `/crowdsec` | `CrowdSecCommandCenter` | CrowdSec |
| `/crowdsec/intelligence` | `CrowdSecIntelligence` | CrowdSec |
| `/crowdsec/config` | `CrowdSecConfig` | CrowdSec |
| `/suricata` | `SuricataMotorPage` | Suricata |
| `/suricata/alerts` | `SuricataAlertsPage` | Suricata |
| `/suricata/network` | `SuricataNSMPage` | Suricata |
| `/suricata/rules` | `SuricataRulesPage` | Suricata |
| `/views` | `ViewsListPage` | Mis Vistas |
| `/views/new` | `ViewBuilderPage` | Mis Vistas |
| `/views/:id` | `ViewDetailPage` | Mis Vistas |
| `/views/:id/edit` | `ViewBuilderPage` | Mis Vistas |
| `/vlans` | → `Navigate` to `/network` | Legacy redirect |

### Sidebar (`Layout.tsx`)

7 grupos de navegación definidos en el array `navGroups`:

```typescript
const navGroups = [
  { label: 'Seguridad', items: [/* 2 items */] },
  { label: 'Infraestructura', items: [/* 4 items */] },
  { label: 'Herramientas', items: [/* 3 items */] },
  { label: 'CrowdSec', items: [/* 3 items */] },
  { label: 'Suricata', items: [/* 4 items */] },
  { label: 'Inventario', items: [/* 1 item */] },
  { label: 'Mis Vistas', items: [/* 1 item */] },
];
```

**Total actual:** 20 ítems de 20 máximos (0 slots disponibles).

### Agregar una ruta nueva y un ítem al sidebar

1. Crear el componente en `components/mi-dominio/MiPage.tsx`
2. Importar en `App.tsx` y agregar `<Route path="/mi-ruta" element={<MiPage />} />`
3. En `Layout.tsx`, agregar al grupo correspondiente:
```tsx
{ to: '/mi-ruta', icon: MiIcono, label: 'Mi Panel', end: false },
```

---

## Design system real

### Tokens CSS en `index.css` (`@theme`)

```css
@theme {
  /* Brand — Indigo/violeta */
  --color-brand-50 a --color-brand-900

  /* Surface — Escala de grises slate para fondos y texto */
  --color-surface-50 a --color-surface-950

  /* Severity — Colores semánticos para alertas */
  --color-severity-critical: #ef4444;
  --color-severity-high: #f97316;
  --color-severity-medium: #eab308;
  --color-severity-low: #3b82f6;
  --color-severity-info: #6b7280;

  /* Estado */
  --color-success: #10b981;
  --color-warning: #f59e0b;
  --color-danger: #ef4444;
}
```

### 6 temas implementados (`config/themes.ts`)

| `data-theme` | Nombre | Tipo | Colores representativos |
|-------------|--------|------|------------------------|
| `dark` | Dark OLED | Dark | #000000, #0a0a0a, #3b82f6 |
| `navy` | Navy Blue | Dark | #0d1117, #161b22, #2f81f7 |
| `purple` | Purple Dark | Dark | #1e1e2e, #27273a, #cba6f7 |
| `arctic` | Arctic Blue | Dark | #2e3440, #3b4252, #88c0d0 |
| `light` | Light | Light | #ffffff, #f1f5f9, #3b82f6 |
| `sepia` | Sepia | Light | #f4ede4, #ede4d8, #8b5e3c |

Default: `dark`. Persiste en localStorage (`netshield_theme`).

### Hook `useTheme`

```typescript
const { theme, fontScale, applyTheme, applyFontScale, reset } = useTheme();
```

- Lee/escribe `data-theme` en `document.documentElement`
- Lee/escribe `--font-scale` como CSS custom property
- Persiste en localStorage (anti-FOUC compatible)
- Escalas de fuente: 0.875 (Pequeño), 1.0 (Normal), 1.125 (Grande), 1.25 (Muy grande)

### Clases CSS del design system

| Categoría | Clases |
|-----------|--------|
| Layout | `glass-card`, `stat-card`, `sidebar`, `sidebar-link`, `sidebar-section-title` |
| Datos | `data-table`, `badge`, `badge-critical/high/medium/low/info/success/danger` |
| Interacción | `btn`, `btn-primary/danger/ghost/success`, `input` |
| Estado | `status-dot active/disconnected/pending` |
| Animación | `animate-fade-in-up`, `stagger-1/2/3/4`, `loading-spinner` |
| Editor | `tiptap-editor`, `tiptap-toolbar` |
| Settings | `settings-gear-btn` |

---

## Cliente HTTP (`services/api.ts`)

### Configuración base

```typescript
const api = axios.create({
  baseURL: '/api',  // Proxied by Vite to localhost:8000
  timeout: 30000,
});
```

### Namespaces disponibles

`mikrotikApi`, `wazuhApi`, `networkApi`, `reportsApi`, `securityApi`, `vlansApi`, `phishingApi`, `portalApi`, `glpiApi`, `crowdsecApi`, `geoipApi`, `suricataApi`, `telegramApi`, `viewsApi`, `widgetsApi`, `systemApi`, `actionsApi`, `dhcpApi`.

### Cómo hacer llamadas

```typescript
// GET
const res = await mikrotikApi.getHealth();  // → APIResponse<T>
if (res.success) { /* res.data */ }

// POST
const res = await securityApi.blockIP({ ip, reason, duration_hours, source });

// DELETE
const res = await networkApi.deleteLabel(id);
```

### Manejo de errores

Todas las funciones en `api.ts` usan `.then(r => r.data)` para unwrap el response de Axios. El backend siempre devuelve `{success, data, error}`. Verificar `res.success` antes de usar `res.data`.

---

## WebSockets en el frontend

### Hook `useWebSocket(url)`

```typescript
const { isConnected, lastMessage } = useWebSocket('/ws/traffic');
```

- Abre conexión WebSocket usando `ws://` o `wss://` según el protocolo del navegador
- Host: `window.location.host` (funciona con proxy de Vite y en producción)
- Reconexión automática con backoff exponencial: `delay = min(1000 * 2^intentos, 30000ms)`
- Expone `isConnected: boolean` y `lastMessage: any | null`
- **No existe `useTrafficSocket.ts`** — el tráfico se consume directo via `useWebSocket('/ws/traffic')`

### WebSockets disponibles

| Endpoint | Intervalo | Componente que lo consume |
|----------|-----------|--------------------------|
| `/ws/traffic` | 2s | `TrafficChart`, `QuickView` |
| `/ws/alerts` | 5s | `AlertsFeed`, `QuickView` |
| `/ws/vlans/traffic` | 2s | `VlanTrafficCard` |
| `/ws/security/alerts` | 5s | `NotificationPanel`, `useSecurityAlerts` |
| `/ws/portal/sessions` | 5s | `MonitorView`, `usePortalSessions` |
| `/ws/crowdsec/decisions` | 10s | `DecisionsTimeline`, `NotificationPanel` |
| `/ws/suricata/alerts` | 5s | `AlertsPage`, `useSuricataAlerts` |

---

## TanStack Query

### Configuración global (`App.tsx`)

```typescript
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 2,
      staleTime: 5_000,
    },
  },
});
```

### Claves de query usadas (para invalidación de cache)

| Query Key | Hook | Datos |
|-----------|------|-------|
| `['wazuh-agents']` | `useWazuhSummary` | Agentes Wazuh |
| `['wazuh-alerts']` | `useWazuhSummary` | Alertas Wazuh |
| `['mikrotik-health']` | `useMikrotikHealth` | Health MikroTik |
| `['firewall-rules']` | (FirewallPage) | Reglas firewall |
| `['crowdsec-decisions']` | `useCrowdSecDecisions` | Decisiones CrowdSec |
| `['crowdsec-metrics']` | `useCrowdSecMetrics` | Métricas CrowdSec |
| `['suricata-engine']` | `useSuricataEngine` | Estado motor |
| `['suricata-alerts']` | `useSuricataAlerts` | Alertas Suricata |
| `['geoip-lookup', ip]` | `useGeoIP` | Lookup individual |
| `['top-countries']` | `useTopCountries` | Top países |
| `['glpi-assets']` | `useGlpiAssets` | Assets GLPI |
| `['glpi-tickets']` | `useGlpiTickets` | Tickets GLPI |
| `['portal-users']` | `usePortalUsers` | Usuarios portal |
| `['custom-views']` | `useCustomViews` | Vistas personalizadas |
| `['widget-catalog']` | `useWidgetCatalog` | Catálogo de widgets |
| `['telegram-status']` | `useTelegramStatus` | Status bot |
| `['telegram-configs']` | `useTelegramConfigs` | Configs Telegram |
| `['widget', '<type>']` | Widget hooks | Datos de widget |
| `['dhcp', 'servers']` | `useDhcpServers` | Servidores DHCP |
| `['dhcp', 'leases']` | `useDhcpLeases` | Leases DHCP |
| `['dhcp', 'networks']` | `useDhcpNetworks` | Redes DHCP |
| `['dhcp', 'pools']` | `useDhcpPools` | Pools DHCP |
| `['dhcp', 'usage']` | `useDhcpSubnetUsage` | Uso de subredes |
| `['dhcp', 'alerts']` | `useDhcpRogueAlerts` | Alertas rogue |
| `['dhcp', 'options']` | `useDhcpOptions` | Opciones DHCP |

### Cómo agregar una query nueva

```typescript
// hooks/useMiDato.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { miApi } from '../services/api';

export function useMiDato() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['mi-dato'],
    queryFn: miApi.getDatos,
  });

  const crear = useMutation({
    mutationFn: (params: { nombre: string }) => miApi.crear(params.nombre),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['mi-dato'] }),
  });

  return { datos: data?.data ?? [], isLoading, crear };
}
```

---

## Sistema de widgets

### Cómo funciona `WidgetRenderer.tsx`

Componente dispatcher (24KB) que recibe un `widget` object con `type` y `config`, y renderiza el componente correspondiente via un switch:

```tsx
switch (widget.type) {
  case 'visual_threat_gauge':
    return <ThreatGauge config={widget.config} />;
  case 'technical_packet_inspector':
    return <PacketInspector config={widget.config} />;
  // ... 39 cases
}
```

### Catálogo de widgets implementados

**Visual (11):** ThreatGauge, ActivityHeatmap, NetworkPulse, AgentsThermometer, BlocksTimeline, EventCounter, ProtocolDonut, PortalUsage, PhishingStats, AgentAlertHeatmap, DhcpSubnetUsage

**Technical (13):** PacketInspector, FlowTableWidget, LiveLogs, FirewallTree, CrowdSecRaw, CorrelationTimeline, CriticalAssets, ActionLogWidget, DnsMonitor, TlsFingerprint, BandwidthTop, HttpInspector, DhcpLeasesWidget

**Hybrid (15):** WorldThreatMap, ConfirmedThreats, CountryRadar, IpProfiler, IncidentLifecycle, DefenseLayers, GeoblockPredictor, SuricataGlpiCorrelation, ViewReportGenerator, TelegramActivity, MitreMatrix, VlanHealth, QuarantineTracker, SinkholeEffectiveness, DhcpDiscovery

**Total: 39 widgets (componentes)** + 17 Standard (sin componente propio) = **56 en catálogo**

### Hook de widget → Componente

Cada widget tiene:
1. **Hook** en `hooks/widgets/{category}/index.ts` que fetch los datos
2. **Componente** en `components/widgets/{category}/MiWidget.tsx` que renderiza
3. **Case** en `WidgetRenderer.tsx` que mapea `widget.type → <Componente />`

### Cómo agregar un widget nuevo

1. Crear hook en `hooks/widgets/{category}/index.ts`
2. Crear componente en `components/widgets/{category}/MiWidget.tsx`
3. Exportar en `components/widgets/{category}/index.ts`
4. Agregar case en `WidgetRenderer.tsx`
5. Registrar en el catálogo del backend (`routers/views.py`)

---

## Sistema de vistas personalizadas

### ViewBuilder (`ViewBuilderPage.tsx`)

Editor con drag-and-drop (`@dnd-kit`) que permite:
- Crear vistas nuevas (`/views/new`)
- Editar vistas existentes (`/views/:id/edit`)
- Catálogo tabulado por categoría (Standard/Visual/Technical/Hybrid)
- Grid configurable de widgets

### ViewDetail (`ViewDetailPage.tsx`)

Dashboard en vivo que renderiza los widgets de una vista guardada usando `WidgetRenderer`.

### Persistencia

Las vistas se guardan en SQLite vía API:
- `GET /api/views` → listar
- `POST /api/views` → crear
- `PUT /api/views/:id` → actualizar
- `DELETE /api/views/:id` → eliminar
- `GET /api/views/widgets/catalog` → catálogo de widgets disponibles

---

## ConfirmModal

**Ubicación:** `components/common/ConfirmModal.tsx`

### Props

```typescript
interface ConfirmModalProps {
  title: string;
  description: string;
  data?: Record<string, string>;    // Pares clave-valor a mostrar
  confirmLabel?: string;            // Default: "Confirmar"
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
}
```

### Acciones que lo usan actualmente

- Bloqueo de IP (desde GlobalSearch, NotificationPanel, Layout)
- Desbloqueo de IP (FirewallPage)
- Eliminación de reglas firewall
- Eliminación de vistas personalizadas
- Auto-response Suricata → CrowdSec + MikroTik
- Sincronización CrowdSec → MikroTik
- Cuarentena de activos GLPI

---

## Tipos TypeScript (`types.ts`)

Archivo de ~39KB con ~1600 líneas. Espejo de los schemas Pydantic del backend. Contiene:

- `APIResponse<T>` — envelope genérico
- Tipos MikroTik: `InterfaceInfo`, `ConnectionInfo`, `ARPEntry`, `TrafficData`, `FirewallRule`
- Tipos Wazuh: `WazuhAgent`, `WazuhAlert`, `MitreSummary`
- Tipos CrowdSec: `CrowdSecDecision`, `CrowdSecMetrics`, `CTIResult`, `WhitelistEntry`
- Tipos Suricata: `SuricataEngineStatus`, `SuricataAlert`, `SuricataFlow`, `SuricataRule`, `AutoResponseConfig`
- Tipos GeoIP: `GeoIPResult`, `TopCountryEntry`, `GeoBlockSuggestion`
- Tipos GLPI: `GlpiAsset`, `GlpiTicket`, `GlpiUser`, `AssetHealth`
- Tipos Portal: `PortalSession`, `PortalUser`, `PortalProfile`, `PortalConfig`
- Tipos Telegram: `TelegramBotStatus`, `TelegramReportConfig`, `TelegramMessageLog`
- Tipos Vistas: `CustomView`, `WidgetConfig`, `WidgetCatalogItem`
- Tipos DHCP: `DhcpServer`, `DhcpLease`, `DhcpNetwork`, `DhcpPool`, `DhcpSubnetUsage`, `DhcpRogueAlert`, `DhcpOption`, `DhcpLeaseGlpiCorrelation`, `DhcpDiscoveryDevice`, `DhcpEnrichedAlert`
- Tipos Phishing: `PhishingAlert`, `PhishingVictim`, `SinkholeEntry`
- Tipos Security: `SecurityBlockRequest`, `ActionLogEntry`
- Tipos Network: `IPLabel`, `IPGroup`, `VlanInfo`

### Convención para agregar tipos nuevos

1. Agregar la interface en `types.ts`
2. Nombrarla igual que el schema Pydantic del backend
3. Importar desde `../../types` en componentes y hooks

---

## Cómo agregar funcionalidad nueva

### Flujo completo: nuevo endpoint → UI

1. **Tipo** en `types.ts`: `export interface MiDato { id: string; nombre: string; }`
2. **API** en `services/api.ts`: `export const miApi = { getDatos: () => api.get<APIResponse<MiDato[]>>('/mi-dominio').then(r => r.data), }`
3. **Hook** en `hooks/useMiDato.ts`: `useQuery({ queryKey: ['mi-dato'], queryFn: miApi.getDatos })`
4. **Componente** en `components/mi-dominio/MiPage.tsx`: Usar el hook
5. **Ruta** en `App.tsx`: `<Route path="/mi-ruta" element={<MiPage />} />`
6. **Sidebar** en `Layout.tsx`: Agregar al array `navGroups`

Última actualización: 2026-06-02
Basado en análisis de: 65+ archivos frontend
Versión del proyecto: 2.5
