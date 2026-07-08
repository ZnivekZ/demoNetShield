# Cruce GLPI x Wazuh x MikroTik

## Objetivo funcional

El cruce GLPI x Wazuh x MikroTik busca responder tres preguntas: que activo es, que riesgo de seguridad tiene y donde esta en la red. GLPI aporta inventario/usuario/ticket; Wazuh aporta agente/alertas/postura; MikroTik aporta ARP, trafico, interfaces y posibilidad de bloqueo/cuarentena.

## Flujo usuario -> frontend -> backend -> servicio -> externo/mock

1. El usuario abre health de inventario, detalle de asset o network context.
2. `InventoryPage`, `HealthView`, `AssetDetail` o widgets hibridos llaman `useGlpiHealth` o `useGlpiAssets`.
3. `glpiApi` llama endpoints de `backend/routers/glpi.py`.
4. El router pide asset/base GLPI a `GLPIService`.
5. Para health/contexto, el servicio consulta Wazuh para agentes/alertas y MikroTik para ARP/red.
6. El backend arma una respuesta compuesta con lo disponible.
7. Si hay accion, puede crear ticket, cuarentena, desbloqueo o `ActionLog`.
8. En mock, `MockData` y `MockService` simulan assets, agentes, ARP, tickets y cuarentenas.

## Archivos principales involucrados

- `backend/routers/glpi.py`: assets, health, network context, tickets y cuarentena.
- `backend/services/glpi_service.py`: correlacion funcional y CRUD GLPI.
- `backend/services/wazuh_service.py`: agentes, alertas y health.
- `backend/services/mikrotik_service.py`: ARP, trafico y acciones de red.
- `backend/services/glpi_collector.py`: cache/detalle completo.
- `backend/models/quarantine_log.py`: evidencia local de cuarentena.
- `backend/models/action_log.py`: auditoria general.
- Frontend: `InventoryPage`, `AssetHealthTable`, `AssetDetail`, `TicketKanban`, `QuarantineTracker`, `SuricataGlpiCorrelation`, `CriticalAssets`.

## Endpoints, hooks y componentes relevantes

- `/api/glpi/assets/health`: health de activos con cruce GLPI + Wazuh + MikroTik.
- `/api/glpi/assets/{id}/network-context`: contexto de red para un asset.
- `/api/glpi/assets/{id}/full-detail`: detalle desde collector/cache.
- `/api/glpi/tickets/network-maintenance`: tickets derivados de contexto de red.
- `/api/glpi/assets/{id}/quarantine` y unquarantine si esta disponible en router.
- Hooks: `useGlpiAssets`, `useGlpiHealth`, `useGlpiTickets`, `useNetworkSearch`, `useSecurityActions`.

## Datos que lee/escribe

- Cruce por IP: asset GLPI IP <-> agente Wazuh IP <-> ARP MikroTik IP.
- Cruce por MAC: asset GLPI MAC <-> ARP MikroTik MAC.
- Cruce por agente: si GLPI conserva relacion o si la IP permite inferir agente Wazuh.
- Cruce por usuario/asset: ticket GLPI o asignacion puede identificar responsable.
- Lee estado de alertas y severidad Wazuh para health.
- Lee ARP/interfaz/trafico MikroTik para network context.
- Escribe tickets de mantenimiento, cuarentenas, `QuarantineLog` y `ActionLog`.

## Fallbacks parciales

- Si GLPI tiene asset pero no hay agente Wazuh: se muestra inventario y red, con seguridad incompleta.
- Si Wazuh tiene agente pero GLPI no tiene asset: se puede mostrar alerta/agente, pero no usuario o ticket asociado.
- Si MikroTik no tiene ARP: puede faltar ubicacion de red en tiempo real.
- Si IP y MAC difieren: se debe preferir evidencia mas reciente y marcar incertidumbre operacional.
- Si todos los mocks estan activos, el cruce se ve completo, pero es una simulacion coherente, no una garantia externa.

## Errores, limites y pendientes

- DHCP puede invalidar una correlacion por IP si no se consulta lease/ARP actualizado.
- NAT puede hacer que Wazuh vea una IP distinta a la que GLPI o MikroTik esperan.
- GLPI puede tener inventario viejo; Wazuh puede tener agente desconectado; MikroTik puede tener ARP expirado.
- No hay una identidad universal obligatoria entre GLPI asset id, Wazuh agent id y puerto MikroTik.
- Para cuarentena robusta falta asegurar el mapeo asset/agente -> puerto/VLAN/queue real.

## Pruebas recomendadas

- Crear un asset mock con IP y MAC conocidas y confirmar health/contexto.
- Probar asset sin IP, sin MAC y sin agente Wazuh para ver degradacion.
- Contra reales, verificar un equipo de laboratorio con GLPI actualizado, agente Wazuh activo y ARP visible en MikroTik.
- Crear un ticket desde mantenimiento de red y confirmar que conserva contexto.
- Ejecutar cuarentena/descuarentena con asset controlado y revisar `QuarantineLog` y `ActionLog`.
