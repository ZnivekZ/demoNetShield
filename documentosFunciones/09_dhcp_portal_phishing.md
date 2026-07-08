# DHCP, portal cautivo y phishing

## Objetivo funcional

DHCP, portal y phishing cubren el borde usuario/red. DHCP muestra leases, subredes y deteccion de dispositivos o servidores sospechosos. El portal administra usuarios hotspot/sesiones/configuracion. Phishing permite campanas, entrenamiento, sinkhole y alertas asociadas. Estos dominios se cruzan con MikroTik porque la red y el acceso final viven ahi.

## Flujo usuario -> frontend -> backend -> servicio -> externo/mock

1. El usuario abre `/dhcp`, `/portal` o `/phishing`.
2. Componentes `DhcpPage`, `PortalPage` o `PhishingPanel` llaman hooks especificos.
3. `dhcpApi`, `portalApi` o `phishingApi` en `api.ts` llaman a routers FastAPI.
4. `backend/routers/dhcp.py`, `portal.py` o `phishing.py` consultan servicios y modelos.
5. DHCP suele apoyarse en `MikroTikService`.
6. Portal usa `PortalService`, modelos locales y, segun accion, puede integrarse con MikroTik/hotspot.
7. Phishing usa modelos de sinkhole y datos mock/servicio para campanas y detecciones.
8. Acciones sensibles se registran en `ActionLog` si el router las audita.

## Archivos principales involucrados

- `backend/routers/dhcp.py`: endpoints DHCP, discovery, rogue alerts y leases.
- `backend/routers/portal.py`: usuarios, sesiones, stats, config y monitor del portal.
- `backend/routers/phishing.py`: campanas, sinkhole, stats y acciones phishing.
- `backend/services/mikrotik_service.py`: DHCP/leases y red.
- `backend/services/portal_service.py`: logica de portal.
- `backend/models/portal_user.py`: usuarios registrados del portal.
- `backend/models/sinkhole_entry.py`: entradas de sinkhole.
- `backend/services/mock_data.py`: DHCP, portal y phishing mock.
- `backend/services/mock_service.py`: leases/usuarios/sesiones o estado mutable relacionado.
- Frontend: `frontend/src/components/dhcp/DhcpPage.tsx`, `frontend/src/components/portal/*`, `frontend/src/components/phishing/PhishingPanel.tsx`.

## Endpoints, hooks y componentes relevantes

- DHCP: familia `/api/dhcp/*` para leases, subredes, discovery, rogue alerts y acciones.
- Portal: familia `/api/portal/*` para sessions, users, stats, config, monitor y bulk import.
- Phishing: familia `/api/phishing/*` para campanas, stats, sinkhole y detecciones.
- Hooks: `useDhcp`, `usePortalUsers`, `usePortalSessions`, `usePortalStats`, `usePortalConfig`, `usePhishing`.
- Componentes portal: `UsersView`, `UserTable`, `UserFormModal`, `SessionsTable`, `SessionsChart`, `StatsView`, `MonitorView`, `ConfigView`, `SpeedProfiles`, `ScheduleConfig`, `BulkImportModal`.
- Widgets: `DhcpDiscovery`, `DhcpLeasesWidget`, `DhcpSubnetUsage`, `PortalUsage`, `PhishingStats`, `SinkholeEffectiveness`.

## Datos que lee/escribe

- DHCP lee leases, IP, MAC, hostname, estado, subnet, tiempos y alertas rogue.
- Portal lee/escribe usuarios hotspot, sesiones, limites, perfiles de velocidad, horarios y configuracion.
- Phishing lee/escribe campanas, eventos, resultados, dominios/IPs de sinkhole y estadisticas.
- MikroTik puede aportar leases, ARP y enforcement de acceso.
- La base local guarda `PortalUserRegistry` y `SinkholeEntry`.
- `MockData` y `MockService` simulan usuarios, sesiones, leases y resultados.

## Errores, limites y pendientes

- DHCP real puede cambiar rapido; una lease vieja no garantiza usuario actual.
- Detectar rogue DHCP requiere validar la metodologia real de discovery y permisos de red.
- Portal/hotspot real depende de configuracion MikroTik, perfiles, queues y reglas existentes.
- Phishing/sinkhole debe probarse con dominios controlados y sin afectar trafico legitimo.
- Algunos widgets DHCP estan dentro de los errores actuales de `npm run build`, asi que el frontend necesita correcciones TypeScript antes de considerar esta zona cerrada.

## Pruebas recomendadas

- Con mock: listar leases, ver subredes, crear/editar usuarios portal y revisar sesiones/stats.
- Probar bulk import de usuarios portal con datos validos e invalidos.
- Contra MikroTik real: verificar que leases DHCP coincidan con RouterOS y con ARP.
- Probar deteccion rogue en una red de laboratorio.
- Crear entrada sinkhole y confirmar efecto esperado solo en dominio/IP controlado.
- Revisar que acciones relevantes aparezcan en `ActionLog` cuando el flujo lo implemente.
