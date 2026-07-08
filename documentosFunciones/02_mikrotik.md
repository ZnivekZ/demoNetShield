# MikroTik

## Objetivo funcional

MikroTik es la integracion de control de red y firewall. La web lo usa para leer interfaces, trafico, conexiones, ARP, logs, reglas, address lists, NAT, rutas, direcciones, bridge ports, queues, DHCP y acciones de bloqueo/desbloqueo. Tambien es el punto donde se materializan muchas decisiones de seguridad que nacen en Wazuh, CrowdSec, GeoIP, Suricata, phishing o GLPI.

## Flujo usuario -> frontend -> backend -> servicio -> externo/mock

1. El usuario entra a `/network`, `/firewall`, `/dhcp`, `/security/config`, algun widget o una accion de bloqueo.
2. Un hook como `useMikrotikHealth`, `useNetworkSearch`, `useDhcp` o `useSecurityActions` llama a `mikrotikApi` o `securityApi`.
3. El backend recibe la llamada en `backend/routers/mikrotik.py`, `backend/routers/security.py`, `backend/routers/network.py` o `backend/routers/dhcp.py`.
4. El router llama al singleton `MikroTikService`.
5. `MikroTikService` decide si usa RouterOS real o datos mock segun `settings.should_mock_mikrotik`.
6. En real, `_api_call` centraliza la comunicacion con RouterOS API y ejecuta llamadas sincronas en un executor/lock para no bloquear el event loop.
7. En mock, responde con `MockData` o estado mutable de `MockService`.
8. Las acciones criticas registran `ActionLog`.

## Archivos principales involucrados

- `backend/services/mikrotik_service.py`: singleton, conexion RouterOS, `_api_call`, mocks y metodos de red.
- `backend/routers/mikrotik.py`: endpoints directos MikroTik.
- `backend/routers/security.py`: bloqueos, auto-block, cuarentena y geo-block.
- `backend/routers/dhcp.py`: DHCP, rogue devices y leases.
- `backend/routers/network.py`: busqueda/contexto de red.
- `backend/config.py`: host, puerto, usuario, password, SSL y `MOCK_MIKROTIK`.
- `backend/services/mock_data.py`: fixtures de interfaces, trafico, ARP, firewall, DHCP, etc.
- `backend/services/mock_service.py`: estado mutable de bloqueos, DHCP y decisiones sincronizadas.
- Frontend: `frontend/src/components/network/NetworkPage.tsx`, `frontend/src/components/firewall/FirewallPage.tsx`, `frontend/src/components/dhcp/DhcpPage.tsx`, widgets de red/firewall.

## Endpoints, hooks y componentes relevantes

- Endpoints MikroTik: `/api/mikrotik/interfaces`, `/connections`, `/arp`, `/traffic`, `/firewall/rules`, `/firewall/block`, `/logs`, `/health`, `/interfaces/traffic/all`, `/arp/search`, `/address-list`, `/nat-rules`, `/routes`, `/addresses`, `/bridge-ports`, `/queues`.
- Endpoints seguridad: `/api/security/block-ip`, `/api/security/auto-block`, `/api/security/quarantine`, `/api/security/geo-block`.
- Endpoints DHCP: familia `/api/dhcp/*`.
- Hooks: `useMikrotikHealth`, `useNetworkSearch`, `useDhcp`, `useSecurityActions`, `useVlanTraffic`.
- Componentes: `NetworkPage`, `FirewallPage`, `DhcpPage`, `QuickView`, `ConfirmModal`, widgets `FirewallTree`, `NatTable`, `RouteTable`, `BandwidthTop`, `DhcpLeasesWidget`, `DhcpSubnetUsage`.

## Datos que lee/escribe

- Lee interfaces, trafico, conexiones, ARP, logs, reglas firewall, NAT, rutas, direcciones, bridge ports, queues y leases DHCP.
- Escribe address lists como `Blacklist_Automatica` y `Geo_Block`.
- Crea o borra reglas/list entries segun endpoint.
- Puede aplicar queues o acciones relacionadas con portal/DHCP segun flujo.
- Registra `ActionLog` para `block`, `unblock`, `security_block`, `auto_block`, `quarantine` y `geo_block` cuando el router lo implementa.

## Errores, limites y pendientes

- La API RouterOS real requiere credenciales, permisos y formato exacto del router. Los mocks no validan ACLs ni diferencias entre versiones RouterOS.
- `_api_call` reduce repeticion y centraliza errores, pero cada comando RouterOS debe probarse contra un equipo real o laboratorio equivalente.
- Las acciones destructivas o de corte de conectividad deben probarse primero con IPs controladas.
- El endpoint de cuarentena usa un `port_name` derivado como `agent-{id}` en el flujo de seguridad, por lo que puede requerir mapeo real agente/puerto para produccion.
- El build frontend esta fallando en algunos widgets que muestran datos de MikroTik/DHCP (`DhcpDiscovery`, `DhcpLeasesWidget`, `DhcpSubnetUsage`, `NatTable`, `RouteTable`, `QueueBars`), por lo que la UI no puede declararse compilable hasta corregir TypeScript.

## Pruebas recomendadas

- Con `MOCK_ALL=true`: verificar listados, busquedas ARP, firewall, DHCP, NAT, rutas y queues.
- Probar `POST /api/mikrotik/firewall/block` y `DELETE /api/mikrotik/firewall/block` con IP de laboratorio y revisar `ActionLog`.
- Probar `/api/security/block-ip` y confirmar que agrega address list y deja auditoria.
- Contra MikroTik real: validar login RouterOS, permisos, timeout, SSL, nombres de listas, formato de reglas y persistencia de cambios.
- Verificar que WebSocket `/ws/traffic` muestre trafico sin bloquear la UI.
