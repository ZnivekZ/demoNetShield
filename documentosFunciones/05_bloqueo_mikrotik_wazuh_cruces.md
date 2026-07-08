# Bloqueo MikroTik x Wazuh y cruces de seguridad

## Objetivo funcional

Este flujo convierte senales de seguridad en acciones de red. Wazuh, CrowdSec, Suricata, GeoIP, Phishing y GLPI pueden aportar contexto; MikroTik materializa el bloqueo o segmentacion; `ActionLog` deja evidencia auditable; el frontend pide confirmacion cuando corresponde mediante `ConfirmModal`.

## Flujo usuario -> frontend -> backend -> servicio -> externo/mock

1. El usuario ve una alerta, IP sospechosa, asset comprometido o recomendacion de bloqueo.
2. El frontend abre `ConfirmModal` para acciones sensibles.
3. Hooks como `useSecurityActions`, `useCrowdSecDecisions`, `useGeoBlockSuggestions`, `useSuricataAutoResponse`, `usePhishing` o `useGlpiHealth` llaman al backend.
4. El router de dominio recibe la accion: `security.py`, `mikrotik.py`, `crowdsec.py`, `suricata.py`, `geoip.py`, `phishing.py` o `glpi.py`.
5. El backend obtiene contexto de Wazuh/GLPI/CrowdSec/Suricata/GeoIP segun el caso.
6. Si hay que cortar trafico, se llama `MikroTikService` para agregar IP a address list, modificar regla, usar cuarentena o aplicar sinkhole.
7. La accion se registra en `ActionLog`.
8. En mock, `MockService` conserva blocked IPs, decisions o respuestas simuladas; `MockData` provee fixtures.

## Archivos principales involucrados

- `backend/routers/security.py`: `security_block`, `auto_block`, `quarantine`, `geo_block`.
- `backend/routers/mikrotik.py`: block/unblock firewall directo.
- `backend/routers/crowdsec.py`: decisiones, whitelist, CTI y sync con MikroTik.
- `backend/routers/suricata.py`: alertas, auto-response y correlaciones.
- `backend/routers/geoip.py`: lookup, top countries y sugerencias geo-block.
- `backend/routers/phishing.py`: campanas, sinkhole y alertas rogue.
- `backend/routers/glpi.py`: quarantine/unquarantine de assets.
- `backend/services/mikrotik_service.py`, `wazuh_service.py`, `glpi_service.py`, `crowdsec_service.py`, `suricata_service.py`, `geoip_service.py`, `portal_service.py`.
- `backend/models/action_log.py`.
- Frontend: `ConfirmModal`, `QuickView`, `FirewallPage`, `CrowdSecCommandCenter`, `SuricataAlertsPage`, `PhishingPanel`, `InventoryPage`.

## Endpoints, hooks y componentes relevantes

- Seguridad: `POST /api/security/block-ip`, `POST /api/security/auto-block`, `POST /api/security/quarantine`, `POST /api/security/geo-block`.
- MikroTik directo: `POST /api/mikrotik/firewall/block`, `DELETE /api/mikrotik/firewall/block`.
- CrowdSec: endpoints de decisions, whitelist, metrics, sync y CTI.
- Suricata: endpoints de alerts, engine, rules, flows, correlation y auto-response.
- GeoIP: endpoints de lookup, top countries y sugerencias.
- Phishing/portal: endpoints de phishing, sinkhole, rogue alerts y portal.
- Hooks: `useSecurityActions`, `useCrowdSecDecisions`, `useSuricataAutoResponse`, `useGeoIP`, `useGeoBlockSuggestions`, `usePhishing`, `useGlpiHealth`.

## Datos que lee/escribe

- Lee IP, motivo, severidad, regla, origen de alerta, pais, asset, usuario, agente Wazuh y contexto de red.
- Escribe address lists MikroTik: por ejemplo `Blacklist_Automatica` o `Geo_Block`.
- Escribe decisiones mock CrowdSec y blocked IPs mock cuando aplica.
- Escribe sinkhole entries y acciones phishing segun flujo.
- Escribe `ActionLog` con tipos como `security_block`, `auto_block`, `quarantine`, `geo_block`, `block`, `unblock`.
- Puede escribir `QuarantineLog` cuando la accion nace desde GLPI asset quarantine.

## Cruces entre servicios externos

- Wazuh -> MikroTik: alerta/agente/IP dispara bloqueo o cuarentena.
- CrowdSec -> MikroTik: decision o CTI de IP puede sincronizarse como bloqueo firewall/address list.
- Suricata -> MikroTik: alerta IDS/NSM o auto-response puede derivar en bloqueo.
- GeoIP -> MikroTik: pais o red sugerida puede transformarse en `Geo_Block` si el usuario confirma.
- Phishing -> MikroTik/Portal: sinkhole o deteccion rogue puede afectar resolucion o acceso de usuario.
- GLPI -> Wazuh -> MikroTik: asset comprometido se identifica por inventario/agente/IP y puede terminar en cuarentena/bloqueo.
- MikroTik -> GLPI/Wazuh: ARP/trafico ayuda a enriquecer el asset o agente que genero la alerta.

## Errores, limites y pendientes

- La correlacion entre IP y agente no es identidad absoluta. DHCP, NAT, multiples interfaces y datos atrasados pueden cruzar mal un evento.
- `auto_block` debe revisarse si se requiere validacion estricta de alerta Wazuh antes de bloquear; hoy el flujo bloquea via MikroTik y audita.
- `quarantine` necesita una relacion real entre agente Wazuh, asset y puerto/VLAN MikroTik para produccion.
- Geo-block manual requiere rangos IP concretos; el pais por si solo no siempre implica una lista completa.
- Los mocks validan UX, contratos y auditoria basica, pero no prueban que el bloqueo corte trafico real.

## Pruebas recomendadas

- Probar cada accion con mock y confirmar cambios visuales y `ActionLog`.
- En laboratorio real, bloquear una IP controlada y verificar en MikroTik que entra a la address list correcta.
- Generar una alerta Wazuh controlada y comprobar el flujo Wazuh -> accion -> ActionLog.
- Sincronizar decision CrowdSec a MikroTik y comprobar lista/regla resultante.
- Ejecutar auto-response Suricata en modo seguro y confirmar que no bloquee activos criticos.
- Probar GeoIP con rangos chicos y reversibles.
- Ensayar cuarentena con un asset GLPI y puerto/VLAN conocidos.
