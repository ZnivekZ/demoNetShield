# documentosFunciones - indice funcional

## Objetivo funcional

Esta carpeta documenta como funciona el proyecto desde el punto de vista funcional y tecnico, usando el codigo actual como fuente principal. Es una guia de lectura para entender la web completa: frontend, backend, base de datos, integraciones externas, mocks, flujos de bloqueo, auditoria, reportes y widgets.

La carpeta esta fuera de `docs/` a proposito, porque `docs/` esta ignorada por git en este repo. Estos archivos nuevos deben aparecer en `git status` como documentacion funcional nueva.

## Estado de vigencia

Estos documentos se escriben contra el estado actual del codigo. Cuando haya conflicto con documentos historicos, manda el codigo. En especial:

- El catalogo actual de widgets en `backend/routers/views.py` suma 58 widgets reales: 16 standard, 12 visual, 15 technical y 15 hybrid.
- El conteo estatico actual de rutas decoradas da 232 rutas, incluyendo `backend/main.py`, routers HTTP y WebSockets.
- El build frontend esta fallando actualmente con errores TypeScript ya identificados en widgets y `countryCodeMap.ts`.
- Documentos historicos como `docs/routes-index-v2.md`, `docs/functionv2/*`, `docs/function/*`, `docs/architecture/*` y `docs/oldV/*` pueden estar parcialmente desactualizados u obsoletos por tema.

## Orden recomendado de lectura

1. `01_base_de_datos.md`: persistencia, modelos SQLAlchemy, inicializacion y limites de SQLite.
2. `07_login_y_registro_actividades.md`: JWT, usuarios, middleware, rutas protegidas y ActionLog.
3. `11_frontend_vistas_widgets.md`: rutas del SPA, TanStack Query, Axios, WebSockets, vistas y widgets.
4. `02_mikrotik.md`, `03_wazuh.md` y `04_glpi.md`: integraciones externas principales.
5. `05_bloqueo_mikrotik_wazuh_cruces.md` y `06_cruce_glpi_wazuh_mikrotik.md`: cruces entre servicios y acciones de seguridad.
6. `08_crowdsec_suricata_geoip.md` y `09_dhcp_portal_phishing.md`: fuentes secundarias de inteligencia, red y usuarios.
7. `10_reportes_telegram_ia.md`: reportes, PDF, Telegram, scheduler e IA.
8. `12_mocks_testing_y_garantias.md`: como validar, que garantizan los mocks y que solo se confirma con servicios reales.

## Mapa funcional rapido

- Identidad y auditoria: login con JWT, usuarios administrables, middleware global y `ActionLog`.
- Red y firewall: MikroTik expone interfaces, ARP, trafico, reglas, address lists, NAT, rutas, DHCP, bridge ports y queues.
- Seguridad endpoint/SIEM: Wazuh aporta agentes, alertas, MITRE, critical alerts y active response.
- Inventario y soporte: GLPI aporta assets, usuarios, tickets, asignaciones, health, collector y cuarentenas.
- Inteligencia y deteccion: CrowdSec, Suricata, GeoIP y Phishing enriquecen IPs, eventos y decisiones.
- Operacion: frontend React con rutas protegidas, namespaces Axios, hooks TanStack Query y WebSockets.
- Reportes: Claude/Anthropic, generacion PDF, Telegram bot, scheduler y logs.
- Mocks: `MockData` y `MockService` permiten lab/demo sin dependencias externas completas.

## Flujo usuario -> frontend -> backend -> servicio -> externo/mock

El patron general se repite en casi toda la web:

1. El usuario entra por una ruta React protegida por `ProtectedRoute`.
2. Un componente llama un hook de TanStack Query o una mutacion.
3. El hook llama un namespace de `frontend/src/services/api.ts`.
4. Axios adjunta el JWT y normaliza errores/respuestas.
5. FastAPI recibe la llamada en un router por dominio.
6. El router valida payload, llama un servicio singleton o el servicio de base de datos y registra `ActionLog` cuando corresponde.
7. El servicio decide entre API externa real y mock segun `settings.should_mock_*`.
8. La respuesta vuelve con el formato esperado por el frontend, normalmente envuelta por `APIResponse` en backend o normalizada por `apiResponse.ts`.

## Archivos principales involucrados

- Backend core: `backend/main.py`, `backend/config.py`, `backend/database.py`.
- Routers: `backend/routers/*.py`.
- Servicios: `backend/services/*.py`.
- Modelos: `backend/models/*.py`.
- Frontend core: `frontend/src/App.tsx`, `frontend/src/services/api.ts`, `frontend/src/components/Layout.tsx`.
- Autenticacion: `frontend/src/components/auth/*`, `frontend/src/hooks/useAuth.ts`, `backend/routers/auth.py`, `backend/services/auth_service.py`.
- Vistas y widgets: `backend/routers/views.py`, `backend/routers/widgets.py`, `frontend/src/components/views/*`, `frontend/src/components/widgets/*`.

## Endpoints, hooks y componentes relevantes

- Endpoints globales: `/api/health`, `/api/system/mock-status`, `/api/actions/history`.
- WebSockets: `/ws/traffic`, `/ws/alerts`, `/ws/vlans/traffic`, `/ws/security/alerts`, `/ws/portal/sessions`, `/ws/crowdsec/decisions`, `/ws/suricata/alerts`.
- Hooks transversales: `useAuth`, `useAuditHistory`, `useSecurityActions`, `useWebSocket`, `useWidgetCatalog`.
- Componentes transversales: `Layout`, `ProtectedRoute`, `ConfirmModal`, `MockModeBadge`, `SettingsDrawer`.

## Datos que lee/escribe

- Lee configuracion desde `.env` o variables usadas por `backend/config.py`.
- Lee y escribe SQLite mediante SQLAlchemy async.
- Lee APIs externas reales si no hay mock activo.
- Escribe auditoria en `ActionLog`.
- Escribe usuarios, vistas custom, grupos/labels IP, sinkholes, portal users, cuarentenas y configuraciones/logs de Telegram.
- Escribe estado mock en memoria cuando se usa `MockService`.

## Errores, limites y pendientes

- Los mocks garantizan contratos basicos y demos, pero no prueban credenciales, latencia, permisos ni formatos exactos de servicios reales.
- SQLite es practico para demo/local, pero limita concurrencia y operaciones de produccion.
- Hay docstrings y documentos viejos con conteos anteriores de widgets/rutas.
- `npm run build` no esta verde; antes de declarar frontend listo para produccion hay que corregir errores TypeScript.
- Algunos cruces estan implementados como correlacion por mejores datos disponibles, no como identidad fuerte garantizada entre sistemas.

## Pruebas recomendadas

- Validar login, renovacion visual del usuario actual, logout y rutas protegidas.
- Probar acciones con `MOCK_ALL=true` para confirmar UX y payloads.
- Probar acciones criticas contra servicios reales en entorno controlado: MikroTik, Wazuh, GLPI, CrowdSec, Suricata, GeoIP y Telegram.
- Verificar que `ActionLog` registre acciones manuales y automatizadas.
- Repetir conteo de widgets y rutas al modificar routers o catalogos.
- Corregir y volver a ejecutar `npm run build`.
