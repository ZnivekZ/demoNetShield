# Frontend, vistas y widgets

## Objetivo funcional

El frontend es una SPA React protegida por login que organiza la operacion en paginas de seguridad, red, firewall, portal, DHCP, phishing, sistema, reportes, inventario, CrowdSec, Suricata, vistas custom y administracion. Usa TanStack Query para cache/fetching, Axios namespaces para API, WebSockets para datos vivos y un catalogo de 58 widgets para dashboards/vistas personalizadas.

## Flujo usuario -> frontend -> backend -> servicio -> externo/mock

1. El usuario entra a una ruta de `frontend/src/App.tsx`.
2. `ProtectedRoute` valida sesion y `Layout` monta navegacion.
3. La pagina usa hooks de dominio basados en TanStack Query.
4. Los hooks llaman namespaces de `frontend/src/services/api.ts`.
5. Axios adjunta JWT, maneja errores y usa helpers de `apiResponse.ts` cuando corresponde.
6. El backend resuelve la request en routers por dominio.
7. Las respuestas poblan tablas, tarjetas, widgets o acciones.
8. WebSockets actualizan trafico, alertas, VLAN, portal, CrowdSec y Suricata sin polling completo.

## Archivos principales involucrados

- `frontend/src/App.tsx`: rutas React.
- `frontend/src/components/Layout.tsx`: shell visual y navegacion.
- `frontend/src/components/auth/*`: login y proteccion.
- `frontend/src/services/api.ts`: cliente Axios y namespaces.
- `frontend/src/services/apiResponse.ts`: normalizacion de respuestas.
- `frontend/src/hooks/*`: TanStack Query por dominio.
- `frontend/src/components/views/*`: vistas personalizadas.
- `frontend/src/components/widgets/*`: widgets standard/visual/technical/hybrid.
- `backend/routers/views.py`: CRUD vistas y catalogo.
- `backend/routers/widgets.py`: endpoints auxiliares de widgets.
- `backend/models/custom_view.py`: persistencia de vistas.

## Endpoints, hooks y componentes relevantes

- Rutas principales: `/`, `/security/config`, `/network`, `/firewall`, `/portal`, `/dhcp`, `/phishing`, `/system`, `/reports`, `/inventory`, `/crowdsec`, `/crowdsec/intelligence`, `/crowdsec/config`, `/suricata`, `/suricata/alerts`, `/suricata/network`, `/suricata/rules`, `/views`, `/views/new`, `/views/:id`, `/views/:id/edit`, `/admin/users`, `/admin/audit`.
- Redirect legacy: `/vlans` redirige a `/network`.
- Fallback: cualquier ruta no conocida vuelve a `/`.
- Hooks transversales: `useAuth`, `useWebSocket`, `useCustomViews`, `useWidgetCatalog`.
- Hooks de dominio: `useSecurityActions`, `useGlpiAssets`, `useDhcp`, `useCrowdSecDecisions`, `useSuricataAlerts`, `useGeoIP`, `useTelegramConfigs`, etc.
- WebSockets: `/ws/traffic`, `/ws/alerts`, `/ws/vlans/traffic`, `/ws/security/alerts`, `/ws/portal/sessions`, `/ws/crowdsec/decisions`, `/ws/suricata/alerts`.

## Datos que lee/escribe

- Lee estado de auth/JWT y usuario actual.
- Lee datos de cada dominio via Axios namespaces.
- Escribe mutaciones CRUD: usuarios, vistas, assets/tickets, portal users, decisions/whitelist, Telegram configs y acciones de seguridad.
- Lee/escribe `CustomView` con layout y widgets.
- Renderiza catalogo actual de 58 widgets reales:
  - 16 standard.
  - 12 visual.
  - 15 technical.
  - 15 hybrid.

## Patrones reales del frontend

- Rutas centralizadas en `App.tsx`.
- Layout unico para zonas autenticadas.
- TanStack Query para cache, stale time, retries y mutaciones.
- Axios por namespaces (`authApi`, `mikrotikApi`, `wazuhApi`, `glpiApi`, `crowdsecApi`, `suricataApi`, `geoipApi`, `portalApi`, `phishingApi`, `dhcpApi`, `viewsApi`, `widgetsApi`, reportes/Telegram).
- Hooks por dominio para aislar fetching de componentes.
- `ConfirmModal` para acciones sensibles.
- `MockModeBadge` para visibilidad de modo mock.
- Widgets separados por familias: visual, technical, hybrid y common.

## Errores, limites y pendientes

- `npm run build` esta fallando actualmente por errores TypeScript en widgets (`QuickView`, `DhcpDiscovery`, `DhcpLeasesWidget`, `DhcpSubnetUsage`, `NatTable`, `RouteTable`, `QueueBars`) y duplicados en `countryCodeMap.ts`.
- El backend tiene 232 rutas decoradas incluyendo WebSockets; el frontend no cubre manualmente cada ruta como pagina.
- El catalogo real es 58 widgets, aunque docs o docstrings viejos hablan de 53, 56 o 59.
- Los WebSockets deben probar reconexion, errores y token si se exige seguridad adicional.
- Hay que vigilar que los tipos frontend coincidan con los contratos reales del backend y no solo con mocks.

## Pruebas recomendadas

- Corregir TypeScript y ejecutar `npm run build` hasta verde.
- Navegar todas las rutas protegidas y verificar redireccion sin login.
- Probar TanStack Query: carga, error, retry, invalidacion despues de mutaciones.
- Probar todas las vistas custom: crear, editar, abrir y renderizar widgets.
- Probar WebSockets con backend mock y luego real.
- Verificar responsive y estados vacios/error en tablas y widgets.
