# Base de datos

## Objetivo funcional

La base de datos guarda el estado propio de NetShield: usuarios, auditoria, vistas personalizadas, labels y grupos de IP, portal, sinkholes, cuarentenas y configuraciones/logs de Telegram. No reemplaza a MikroTik, Wazuh ni GLPI; funciona como capa local de persistencia para identidad, configuracion operativa y trazabilidad.

## Flujo usuario -> frontend -> backend -> servicio -> externo/mock

1. El usuario ejecuta una accion desde una pagina del frontend.
2. El hook llama a `frontend/src/services/api.ts`.
3. El router FastAPI recibe la request y obtiene una sesion con `get_db`.
4. El router o servicio crea/lee/actualiza modelos SQLAlchemy.
5. `get_db` confirma la transaccion si no hubo error o hace rollback si falla.
6. Si la accion tambien afecta un servicio externo, el router combina base de datos local con MikroTik, Wazuh, GLPI, Telegram u otro servicio.
7. En modo mock, parte del estado externo se simula en `MockService`, pero la base local sigue existiendo para modelos propios.

## Archivos principales involucrados

- `backend/database.py`: `Base`, engine async, `async_session_factory`, `get_db`, `init_db`, `close_db`.
- `backend/config.py`: `DATABASE_URL` y configuracion general.
- `backend/main.py`: lifespan que llama `init_db()` al iniciar y `close_db()` al apagar.
- `backend/models/action_log.py`: auditoria.
- `backend/models/user.py`: usuarios de aplicacion.
- `backend/models/custom_view.py`: vistas personalizadas.
- `backend/models/ip_label.py`: etiquetas de IP.
- `backend/models/ip_group.py`: grupos y miembros.
- `backend/models/sinkhole_entry.py`: entradas de sinkhole.
- `backend/models/portal_user.py`: usuarios registrados del portal.
- `backend/models/quarantine_log.py`: eventos de cuarentena GLPI.
- `backend/models/telegram.py`: configuraciones, mensajes y pendientes de Telegram.

## Endpoints, hooks y componentes relevantes

- Auth y usuarios: `backend/routers/auth.py`, `useAuth`, `useUsers`, `LoginPage`, `UsersManagementPage`.
- Auditoria: `/api/actions/history`, `useAuditHistory`, `AuditHistoryPage`.
- Vistas: `backend/routers/views.py`, `backend/routers/widgets.py`, `useCustomViews`, `useWidgetCatalog`, `ViewsListPage`, `ViewBuilderPage`, `ViewDetailPage`.
- GLPI/cuarentena: `backend/routers/glpi.py`, `QuarantineLog`.
- Phishing/sinkhole: `backend/routers/phishing.py`, `SinkholeEntry`.
- Portal: `backend/routers/portal.py`, `PortalUserRegistry`.
- Telegram/reportes: `backend/routers/reports.py`, `TelegramReportConfig`, `TelegramMessageLog`, `TelegramPendingMessage`.

## Datos que lee/escribe

- `users`: credenciales hasheadas, estado activo y metadatos de usuarios.
- `action_logs`: `action_type`, `target_ip`, `details`, `performed_by`, `comment`, `created_at`.
- `custom_views`: nombre, descripcion, layout y widgets seleccionados.
- `ip_labels`, `ip_groups`, `ip_group_members`: clasificacion local de IPs.
- `sinkhole_entries`: dominios/IPs usados por phishing/sinkhole.
- `portal_user_registry`: usuarios hotspot/portal administrados localmente.
- `quarantine_logs`: historial de cuarentena/descuarentena de assets GLPI.
- `telegram_*`: configuraciones, logs de envio y mensajes pendientes.

## Errores, limites y pendientes

- La persistencia local usa SQLAlchemy async y normalmente SQLite. SQLite es suficiente para demo/lab, pero no es ideal para alta concurrencia, multiples procesos escribiendo al mismo tiempo o auditoria regulada a gran escala.
- `init_db()` crea tablas, pero no reemplaza una estrategia formal de migraciones. Si cambian modelos, hace falta revisar si se necesita Alembic u otro mecanismo.
- `details` de `ActionLog` se guarda como texto JSON, no como columna JSON nativa portable.
- Parte del estado mock vive en memoria en `MockService`; ese estado no sobrevive reinicios salvo que tambien se escriba en modelos locales.
- Si una accion externa tiene exito y luego falla el registro local, puede quedar una discrepancia operacional que debe revisarse en logs.

## Pruebas recomendadas

- Iniciar backend limpio y verificar que `init_db()` cree tablas sin errores.
- Crear usuario, editarlo, desactivarlo/eliminarlo y confirmar persistencia.
- Ejecutar acciones de bloqueo/desbloqueo y revisar `/api/actions/history`.
- Crear una vista personalizada, reiniciar backend y confirmar que sigue disponible.
- Crear registros de portal, sinkhole, cuarentena y Telegram y validar que se leen desde endpoints correspondientes.
- Simular error en una escritura y confirmar rollback.
- Para produccion, probar con el motor de base real que se decida usar, no solo con SQLite.
