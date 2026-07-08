# GLPI

## Objetivo funcional

GLPI es la integracion de inventario y soporte. La web lo usa para administrar assets, usuarios, tickets, asignaciones, ubicaciones, health de activos, network context, collector/cache y flujos de cuarentena. En NetShield, GLPI responde la pregunta "que activo o usuario esta detras de esta IP o incidente".

## Flujo usuario -> frontend -> backend -> servicio -> externo/mock

1. El usuario abre `/inventory` o widgets relacionados con activos.
2. Componentes como `AssetsView`, `HealthView`, `TicketsView`, `AssignmentsView` o `AssetDetail` llaman hooks GLPI.
3. Los hooks (`useGlpiAssets`, `useGlpiHealth`, `useGlpiTickets`, `useGlpiUsers`) llaman a `glpiApi`.
4. `backend/routers/glpi.py` procesa la request y llama a `GLPIService`.
5. `GLPIService` decide entre GLPI real, `MockService` o `MockData`.
6. Para health y network context, GLPI se cruza con `WazuhService` y `MikroTikService`.
7. Las operaciones de CRUD, asignacion o cuarentena registran `ActionLog` y, si corresponde, `QuarantineLog`.

## Archivos principales involucrados

- `backend/services/glpi_service.py`: cliente GLPI, auth con app token/session token, CRUD, tickets, usuarios, health, quarantine.
- `backend/services/glpi_collector.py`: collector/cache de activos completos.
- `backend/routers/glpi.py`: endpoints de inventario.
- `backend/models/quarantine_log.py`: historial local de cuarentena.
- `backend/services/mock_service.py`: estado mock mutable de assets/tickets/users.
- `backend/services/mock_data.py`: fixtures GLPI.
- `backend/config.py`: URL, tokens, flags y collector.
- Frontend: `frontend/src/components/inventory/*`.

## Endpoints, hooks y componentes relevantes

- Endpoints principales: `/api/glpi/status`, `/assets`, `/assets/stats`, `/assets/search`, `/assets/health`, `/assets/by-location/{id}`, `/assets/{id}`, `/assets/{id}/full-detail`, `/assets/{id}/network-context`.
- CRUD/operacion: crear, actualizar, borrar assets; asignar assets; quarantine/unquarantine.
- Tickets: endpoints de tickets CRUD, estado y ticket de mantenimiento de red.
- Usuarios y ubicaciones: endpoints de users, assets de usuario y locations.
- Hooks: `useGlpiAssets`, `useGlpiHealth`, `useGlpiTickets`, `useGlpiUsers`, `useQrScanner`.
- Componentes: `InventoryPage`, `AssetsView`, `AssetDetail`, `AssetSearch`, `AssetHealthTable`, `TicketKanban`, `TicketFormModal`, `UsersView`, `AssignmentsView`, `LocationMap`.

## Datos que lee/escribe

- Lee assets GLPI: id, nombre, IP, MAC, ubicacion, usuario, estado, tipo y metadatos.
- Lee/escribe tickets: titulo, descripcion, estado, prioridad, usuario/asignacion.
- Lee/escribe usuarios GLPI segun modo real/mock.
- Lee health enriquecido con Wazuh (agentes/alertas) y MikroTik (ARP/contexto red).
- Escribe cuarentenas/descuarentenas en GLPI/mock y en `QuarantineLog`.
- Registra `ActionLog` para altas, ediciones, borrados, asignaciones y cuarentena.

## Errores, limites y pendientes

- GLPI real depende de app token, session token, permisos y estructura de campos. El mock no detecta diferencias de version o custom fields.
- El collector/cache ayuda con detalle completo, pero puede quedar desactualizado frente a cambios recientes de GLPI.
- La correlacion por IP/MAC puede fallar si DHCP reasigno IPs, si hay NAT o si GLPI no tiene inventario actualizado.
- La cuarentena de un asset puede necesitar mapear asset -> IP/MAC -> puerto real en MikroTik; no siempre alcanza con el dato GLPI.
- El CRUD mock/real puede divergir si GLPI tiene validaciones de negocio no representadas en `MockService`.

## Pruebas recomendadas

- Con mock: crear asset, editarlo, buscarlo, asignarlo, crear ticket y ejecutar quarantine/unquarantine.
- Contra GLPI real: validar tokens, permisos, paginacion, campos obligatorios y actualizacion de session token.
- Probar `/assets/health` con activos con y sin agente Wazuh asociado.
- Probar `/assets/{id}/network-context` con IP presente en ARP MikroTik y con IP ausente.
- Confirmar registros en `ActionLog` y `QuarantineLog`.
