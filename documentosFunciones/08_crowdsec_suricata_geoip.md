# CrowdSec, Suricata y GeoIP

## Objetivo funcional

CrowdSec, Suricata y GeoIP son fuentes de inteligencia y deteccion complementarias. CrowdSec aporta decisiones, CTI, escenarios, whitelist y sincronizacion hacia MikroTik. Suricata aporta IDS/NSM, alertas, flujos, reglas, motor y auto-response. GeoIP aporta pais, ASN/tipo de red, top countries y sugerencias de geo-block. Juntos enriquecen IPs y ayudan a decidir bloqueos mas informados.

## Flujo usuario -> frontend -> backend -> servicio -> externo/mock

1. El usuario revisa `/crowdsec`, `/crowdsec/intelligence`, `/suricata`, `/suricata/alerts`, `/suricata/network`, `/suricata/rules` o widgets de inteligencia.
2. Hooks como `useCrowdSecDecisions`, `useCrowdSecAlerts`, `useCrowdSecMetrics`, `useIpContext`, `useSuricataAlerts`, `useSuricataFlows`, `useSuricataEngine`, `useSuricataCorrelation`, `useGeoIP` y `useGeoBlockSuggestions` consultan el backend.
3. Routers `crowdsec.py`, `suricata.py` y `geoip.py` llaman sus servicios.
4. Los servicios consultan APIs reales o `MockData`/`MockService` segun flags.
5. Si una decision implica bloqueo, el backend puede llamar `MikroTikService`.
6. Cuando hay accion operativa, se registra `ActionLog`.

## Archivos principales involucrados

- `backend/routers/crowdsec.py`, `backend/services/crowdsec_service.py`.
- `backend/routers/suricata.py`, `backend/services/suricata_service.py`.
- `backend/routers/geoip.py`, `backend/services/geoip_service.py`.
- `backend/services/mikrotik_service.py`: destino de sync/bloqueos.
- `backend/models/action_log.py`: auditoria.
- `backend/services/mock_data.py`: fixtures de CrowdSec, Suricata y GeoIP.
- `backend/services/mock_service.py`: decisiones, whitelist y auto-response mutables.
- Frontend: `frontend/src/components/crowdsec/*`, `frontend/src/components/suricata/*`, `frontend/src/components/geoip/*`, widgets hibridos.

## Endpoints, hooks y componentes relevantes

- CrowdSec: familia `/api/crowdsec/*` para decisions, alerts, metrics, scenarios, whitelist, CTI, context y sync.
- Suricata: familia `/api/suricata/*` para alerts, engine, rules, flows, correlation, NSM y auto-response.
- GeoIP: familia `/api/geoip/*` para lookup, top countries, status y sugerencias de geoblock.
- Hooks CrowdSec: `useCrowdSecDecisions`, `useCrowdSecAlerts`, `useCrowdSecMetrics`, `useIpContext`, `useSyncStatus`.
- Hooks Suricata: `useSuricataAlerts`, `useSuricataEngine`, `useSuricataRules`, `useSuricataFlows`, `useSuricataCorrelation`, `useSuricataAutoResponse`.
- Hooks GeoIP: `useGeoIP`, `useGeoBlockSuggestions`, `useTopCountries`.
- Componentes: `CrowdSecCommandCenter`, `CrowdSecIntelligence`, `CrowdSecConfig`, `SuricataMotorPage`, `SuricataAlertsPage`, `SuricataNSMPage`, `SuricataRulesPage`, `GeoBlockSuggestions`, `TopCountriesWidget`.

## Datos que lee/escribe

- CrowdSec lee decisions, alerts, escenarios, metricas, CTI, reputacion, whitelist y estado de sync.
- Suricata lee alertas IDS, reglas, flujos, estadisticas de motor, correlaciones y eventos NSM.
- GeoIP lee IP/pais/ASN/tipo de red y conteos por pais.
- Puede escribir whitelist/decisions mock, estado de sync y acciones de auto-response.
- Puede escribir bloqueos en MikroTik si una decision se sincroniza.
- Registra `ActionLog` cuando una accion deja de ser solo lectura y pasa a operacion.

## Errores, limites y pendientes

- CrowdSec real depende de Local API, bouncer/API keys, escenarios instalados y formato de decisiones.
- Suricata real depende de EVE JSON/logs, reglas cargadas, permisos de lectura y modo IDS/IPS/NSM.
- GeoIP depende de base local o proveedor; una ubicacion IP nunca debe tratarse como identidad de usuario.
- La sync a MikroTik debe evitar duplicados, respetar whitelist y ser reversible.
- La correlacion multi-fuente puede elevar confianza, pero no reemplaza confirmacion manual en acciones de alto impacto.
- Los mocks prueban paneles y flujos, no calidad de deteccion real.

## Pruebas recomendadas

- Con mock: revisar dashboards, crear/quitar whitelist, simular decision y auto-response.
- Contra CrowdSec real: validar health, listar decisions, probar sync a MikroTik con una IP controlada.
- Contra Suricata real: generar alerta de prueba, verificar EVE ingestion, reglas y correlacion.
- Contra GeoIP real: hacer lookup de IPs publicas conocidas y verificar sugerencias.
- Probar que whitelist evite bloqueos no deseados.
- Confirmar auditoria en `ActionLog` para acciones de bloqueo/sync.
