# Mocks, testing y garantias

## Objetivo funcional

Los mocks permiten operar la web en modo demo/lab sin depender de todos los servicios reales. `MockData` entrega fixtures deterministicos y `MockService` mantiene estado mutable para operaciones que necesitan simular cambios. Sirven para probar UX, contratos, flujos y auditoria basica, pero no sustituyen validaciones reales de red, seguridad ni integraciones externas.

## Flujo usuario -> frontend -> backend -> servicio -> externo/mock

1. El usuario ejecuta la web con flags mock (`MOCK_ALL=true` o flags por servicio).
2. El frontend no cambia su forma de llamar endpoints.
3. El backend evalua `settings.should_mock_*` en `backend/config.py`.
4. El servicio correspondiente elige `MockData`/`MockService` en vez de API externa.
5. La respuesta conserva forma compatible con frontend.
6. Algunas mutaciones cambian estado en memoria en `MockService`.
7. `MockModeBadge` y `/api/system/mock-status` ayudan a ver que servicios estan mockeados.

## Archivos principales involucrados

- `backend/config.py`: flags `MOCK_ALL`, `MOCK_MIKROTIK`, `MOCK_WAZUH`, `MOCK_GLPI`, `MOCK_CROWDSEC`, `MOCK_SURICATA`, `MOCK_GEOIP`, `MOCK_TELEGRAM` y propiedades `should_mock_*`.
- `backend/services/mock_data.py`: datos base para MikroTik, Wazuh, GLPI, CrowdSec, Suricata, GeoIP, AI, portal, Telegram, DHCP y WebSocket.
- `backend/services/mock_service.py`: estado mutable para GLPI assets/tickets/users, portal users, blocked IPs, CrowdSec decisions/whitelist, Suricata autoresponse y DHCP leases.
- `backend/main.py`: `/api/system/mock-status`.
- `frontend/src/components/common/MockModeBadge.tsx`: indicacion visual.
- Todos los servicios de dominio: `mikrotik_service.py`, `wazuh_service.py`, `glpi_service.py`, `crowdsec_service.py`, `suricata_service.py`, `geoip_service.py`, `portal_service.py`, `telegram_service.py`, `ai_service.py`.

## Endpoints, hooks y componentes relevantes

- Estado mock: `/api/system/mock-status`.
- Health general: `/api/health`.
- Hooks que deben funcionar igual con mock o real: `useAuth`, `useSecurityActions`, `useGlpiAssets`, `useDhcp`, `useCrowdSecDecisions`, `useSuricataAlerts`, `useGeoIP`, `useTelegramStatus`, `useWidgetCatalog`, `useWebSocket`.
- Componentes de validacion visual: `MockModeBadge`, dashboards, tablas de cada dominio, vistas custom y widgets.

## Datos que lee/escribe

- `MockData` lee fixtures en memoria y genera respuestas coherentes.
- `MockService` escribe cambios temporales: IPs bloqueadas, GLPI assets/tickets/users, whitelist/decisions CrowdSec, auto-response Suricata, DHCP leases y portal users.
- La base local sigue escribiendo modelos propios como `ActionLog`, `User`, `CustomView`, `QuarantineLog`, `SinkholeEntry`, `PortalUserRegistry` y modelos Telegram.
- Los mocks no escriben cambios en MikroTik, Wazuh, GLPI, CrowdSec, Suricata, GeoIP, Telegram ni Anthropic reales.

## Que garantizan los mocks

- Que el frontend puede consumir la forma esperada de muchas respuestas.
- Que los routers responden sin servicios externos disponibles.
- Que los hooks y componentes pueden mostrar estados normales con datos representativos.
- Que algunas mutaciones actualizan estado visible durante la sesion.
- Que `ActionLog` puede registrar acciones locales cuando el router lo implementa.
- Que el modo demo permite recorrer flujos de login, seguridad, inventario, red, reportes, portal, DHCP y widgets.
- Que el catalogo actual de 58 widgets puede listarse/renderizarse a nivel funcional si el frontend compila.

## Que no garantizan los mocks

- No garantizan credenciales, permisos ni certificados de servicios reales.
- No garantizan que MikroTik corte trafico real.
- No garantizan que Wazuh ejecute active response real.
- No garantizan que GLPI acepte campos, tokens o flujos CRUD reales.
- No garantizan deteccion real de CrowdSec o Suricata.
- No garantizan exactitud GeoIP ni cobertura de rangos.
- No garantizan envio real de Telegram ni calidad/coste de Claude.
- No garantizan performance, latencia, paginacion real ni errores de red.
- No garantizan build frontend: hoy `npm run build` sigue fallando por TypeScript.

## Errores, limites y pendientes

- El estado de `MockService` es en memoria y puede perderse al reiniciar.
- Los fixtures pueden quedarse atrasados si cambian contratos backend/frontend.
- Hay documentos viejos con conteos desactualizados de widgets y endpoints; esta carpeta usa 58 widgets y 232 rutas decoradas como estado actual verificado.
- Falta una bateria automatizada completa que compare contratos reales vs mocks.
- Las acciones de seguridad deben probarse en laboratorio real antes de usarse en produccion.

## Pruebas recomendadas

- Test manual mock completo:
  - Iniciar backend con `MOCK_ALL=true`.
  - Login.
  - Recorrer rutas principales.
  - Ejecutar bloqueo/desbloqueo de IP controlada.
  - Crear/editar asset GLPI mock.
  - Crear ticket mock.
  - Crear vista custom con widgets.
  - Ver `/api/system/mock-status`.
  - Revisar `/admin/audit`.

- Test real por integracion:
  - MikroTik: health, ARP, reglas, address list, DHCP y bloqueo reversible.
  - Wazuh: auth, agentes, alertas, MITRE y active response en laboratorio.
  - GLPI: status, assets, tickets, users, assign y quarantine.
  - CrowdSec: decisions, whitelist, CTI y sync a MikroTik.
  - Suricata: alertas EVE, reglas, flows y auto-response.
  - GeoIP: lookup y sugerencias con IPs conocidas.
  - Telegram: envio real a chat de prueba.
  - Anthropic/Claude: resumen corto con limites controlados.

- Test de frontend:
  - Arreglar errores TypeScript y ejecutar `npm run build`.
  - Probar rutas, loaders, errores, estados vacios y responsive.
  - Probar WebSockets y reconexion.

- Test de auditoria:
  - Confirmar que acciones sensibles escriban `ActionLog`.
  - Confirmar que CRUD usuario escriba eventos auth.
  - Confirmar que cuarentena escriba `QuarantineLog` cuando corresponde.
