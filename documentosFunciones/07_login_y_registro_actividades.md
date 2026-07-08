# Login y registro de actividades

## Objetivo funcional

El login protege la web con JWT y permite saber quien hizo cada accion relevante. El registro de actividades se apoya en `ActionLog`, que funciona como auditoria operativa para bloqueos, desbloqueos, cuarentenas, CRUD de usuarios, CRUD GLPI, reportes y otros eventos sensibles.

## Flujo usuario -> frontend -> backend -> servicio -> externo/mock

1. El usuario entra a `/login` y envia credenciales.
2. `LoginPage` usa `AuthContext`/`useAuth` y llama `authApi.login`.
3. `backend/routers/auth.py` valida credenciales con `AuthService`.
4. Si son validas, backend genera JWT y el frontend lo guarda para llamadas posteriores.
5. `ProtectedRoute` permite entrar al layout solo si hay sesion valida.
6. Axios interceptors en `frontend/src/services/api.ts` adjuntan el token a cada request y manejan errores de autorizacion.
7. `JWTAuthMiddleware` en `backend/main.py` valida el token en endpoints HTTP protegidos.
8. Las acciones relevantes crean filas en `ActionLog`.
9. `/admin/audit` permite revisar el historial desde el frontend.

## Archivos principales involucrados

- `backend/routers/auth.py`: login, me, logout y CRUD de usuarios.
- `backend/services/auth_service.py`: hashing, verificacion de password, creacion/decodificacion de JWT.
- `backend/services/auth_provider.py`: dependencias/proveedor de usuario actual si se usa desde routers.
- `backend/main.py`: `JWTAuthMiddleware` y rutas publicas.
- `backend/models/user.py`: tabla de usuarios.
- `backend/models/action_log.py`: tabla de auditoria.
- `frontend/src/components/auth/LoginPage.tsx`: formulario de login.
- `frontend/src/components/auth/AuthContext.tsx`: estado de autenticacion.
- `frontend/src/components/auth/ProtectedRoute.tsx`: proteccion de rutas.
- `frontend/src/hooks/useAuth.ts`, `frontend/src/hooks/useUsers.ts`, `frontend/src/hooks/useAuditHistory.ts`.
- `frontend/src/components/admin/UsersManagementPage.tsx`, `AuditHistoryPage.tsx`.
- `frontend/src/services/api.ts`: namespaces e interceptors Axios.

## Endpoints, hooks y componentes relevantes

- Auth: `/api/auth/login`, `/api/auth/me`, `/api/auth/logout`.
- Usuarios: endpoints CRUD de `/api/auth/users`.
- Auditoria: `/api/actions/history`.
- Rutas frontend: `/login`, `/admin/users`, `/admin/audit` y todas las rutas protegidas dentro de `Layout`.
- Hooks: `useAuth`, `useUsers`, `useAuditHistory`.
- Componentes: `LoginPage`, `AuthProvider`, `ProtectedRoute`, `SettingsDrawer`, `UsersManagementPage`, `AuditHistoryPage`.

## Datos que lee/escribe

- Lee usuario/password al hacer login.
- Lee/escribe `users`: usuario, password hash, rol/estado activo y timestamps segun modelo.
- Emite JWT con `sub` como user id y expiracion configurada.
- Lee JWT en `Authorization: Bearer ...`.
- Escribe `ActionLog` para `auth_login`, `auth_login_failed`, `auth_logout`, `auth_user_created`, `auth_user_updated`, `auth_user_deleted` y acciones de otros dominios.
- Lee auditoria con filtros/paginacion segun endpoint.

## Errores, limites y pendientes

- `JWT_SECRET_KEY` debe existir y tener longitud suficiente; si se usa un secreto debil o rotado sin plan, las sesiones se rompen o quedan inseguras.
- El middleware saltea rutas publicas y WebSockets; las conexiones WS deben revisarse si se exige autenticacion fuerte a nivel socket.
- `ActionLog.details` guarda JSON como texto; conviene estandarizar payloads para auditorias complejas.
- El frontend depende de interceptors para comportamiento uniforme; hay que revisar cualquier llamada fuera de `api.ts`.
- Los mocks no sustituyen pruebas de expiracion de JWT, cambio de secreto, roles/permisos reales o hardening de cookies/local storage.

## Pruebas recomendadas

- Login exitoso, login fallido y logout, revisando `ActionLog`.
- Acceso a ruta protegida sin token: debe redirigir a `/login`.
- Token invalido/expirado: backend debe rechazar y frontend debe manejar el estado.
- Crear, editar y borrar/desactivar usuarios desde `/admin/users`.
- Revisar `/admin/audit` despues de acciones de seguridad y administracion.
- Verificar que endpoints publicos sigan accesibles: `/api/auth/login`, `/api/health`, docs si estan habilitadas.
