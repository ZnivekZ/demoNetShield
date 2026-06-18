# Implementación del Sistema de Login — NetShield Dashboard

> Documento técnico que explica las decisiones de diseño, tecnologías, y funcionamiento del sistema de autenticación JWT implementado en la versión 2.7.

---

## Resumen

Se implementó un sistema de autenticación stateless basado en JWT que protege **todos** los endpoints HTTP del backend con un middleware global. El sistema cubre:

- Login con usuario y contraseña
- Tokens JWT con expiración configurable
- Contraseñas hasheadas con bcrypt
- CRUD de usuarios del dashboard
- Protección de rutas en el frontend
- Interceptores automáticos de Axios para inyectar y validar tokens

**Credenciales por defecto:** `admin` / `admin`
**Archivos creados:** 11 nuevos + 11 modificados = **22 archivos totales**

---

## Arquitectura del flujo de autenticación

```
┌─────────────────────────────────────────────────────────────────────┐
│                          FRONTEND                                   │
│                                                                     │
│  LoginPage.tsx                                                      │
│  ┌──────────────────┐     POST /api/auth/login                      │
│  │ usuario: admin   │────────────────────────────────┐              │
│  │ password: admin   │                                │              │
│  └──────────────────┘                                │              │
│                                                      ▼              │
│                                              ┌──────────────┐       │
│                                              │ Backend      │       │
│                                              │ AuthService  │       │
│                                              │ (bcrypt +    │       │
│                                              │  JWT sign)   │       │
│                                              └──────┬───────┘       │
│                                                     │               │
│                                              { access_token }       │
│                                                     │               │
│  localStorage.setItem('netshield_token', token) ◄───┘               │
│                                                                     │
│  ┌──────────────────────────────────────────────┐                   │
│  │ Axios Request Interceptor                    │                   │
│  │ config.headers.Authorization = Bearer <JWT>  │                   │
│  └────────────────────┬─────────────────────────┘                   │
│                       │                                             │
│                       ▼  CADA request HTTP                          │
│              ┌─────────────────────┐                                │
│              │ JWTAuthMiddleware   │ (main.py)                      │
│              │ ¿path público?      │                                │
│              │   SÍ → pass through │                                │
│              │   NO → validate JWT │                                │
│              │     inválido → 401  │──► Axios Response Interceptor  │
│              │     válido → router │    limpia localStorage         │
│              └─────────────────────┘    redirige a /login           │
│                       │                                             │
│                       ▼                                             │
│              Router endpoint                                        │
│              (mikrotik, wazuh,                                      │
│               crowdsec, etc.)                                       │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Tecnologías y por qué se eligió cada una

### Backend

| Tecnología | Versión | Propósito | ¿Por qué esta y no otra? |
|-----------|---------|-----------|--------------------------|
| **python-jose[cryptography]** | 3.3.0 | Generación y validación de tokens JWT | Librería estándar de JWT en Python. El extra `[cryptography]` usa la librería `cryptography` de Python (implementación C) en vez de la pura de Python, lo que es más rápido y seguro. Alternativa descartada: `PyJWT` — funciona igual, pero `python-jose` es la que recomienda la documentación oficial de FastAPI. |
| **passlib[bcrypt]** | 1.7.4 | Hashing de contraseñas | Wrapper maduro que abstrae el algoritmo de hashing. bcrypt tiene 25+ años de auditoría criptográfica y es el estándar en FastAPI, Django y Flask. Alternativa descartada: `argon2-cffi` — técnicamente superior (ganador de Password Hashing Competition 2015, resistente a GPU), pero agrega dependencia C compilada que puede fallar en Docker multi-platform. |
| **HS256** (HMAC-SHA256) | — | Algoritmo de firma del JWT | Simétrico: usa la misma clave para firmar y verificar. Perfecto para una app donde el mismo backend firma y valida. No necesitamos RS256 (asimétrico) porque no hay servicios externos que necesiten verificar nuestros tokens. |
| **BaseHTTPMiddleware** (Starlette) | — | Middleware global de validación | Intercepta TODA request HTTP antes del routing. Garantiza cobertura total sin error humano (vs. `Depends()` que hay que agregar manualmente a cada endpoint). |
| **model_validator** (Pydantic v2) | — | Validación de `JWT_SECRET_KEY` al arrancar | Fail-fast: si la clave no está o es muy corta, el backend no arranca. Mejor fallar en startup que servir endpoints sin firma válida. |

### Frontend

| Tecnología | Propósito | ¿Por qué esta y no otra? |
|-----------|-----------|--------------------------|
| **Axios interceptors** | Inyectar JWT en headers y manejar 401 | Ya usábamos Axios (`services/api.ts`). Los interceptores son el punto central perfecto: una sola configuración cubre los 18 namespaces y ~185 endpoints. |
| **React Context** (`AuthContext`) | Estado global de autenticación | El estado de auth necesita ser accesible desde cualquier componente (Layout, ProtectedRoute, SettingsDrawer). Context es la herramienta nativa de React para esto. |
| **localStorage** | Almacenamiento del token | Persiste entre sesiones del browser. Alternativa descartada: `sessionStorage` (se pierde al cerrar pestaña — mala UX) y `httpOnly cookies` (requieren configuración de CORS, CSRF tokens, y setup server-side más complejo). |
| **useState + useEffect** (no TanStack Query) | Hook `useAuth` | TanStack Query hace refetch automático en window focus, lo que provocaría validaciones innecesarias de sesión cada vez que el usuario vuelve a la pestaña. Para auth, queremos control manual. |
| **TanStack Query** | Hook `useUsers` (CRUD) | Para el CRUD de usuarios SÍ queremos cache automático, invalidación en mutations, y refetch. Consistente con los otros 40+ hooks del proyecto. |

---

## Decisiones de diseño y sus razones

### 1. Middleware global vs. Depends() por endpoint

**Decisión:** Middleware HTTP global (`JWTAuthMiddleware` en `main.py`).

**Razón:** El proyecto tiene 17 routers y ~185 endpoints. Agregar `Depends(get_current_user)` a cada uno es propenso a errores — basta olvidarlo en un endpoint para tener una brecha de seguridad. El middleware intercepta **antes** del routing, garantizando que ningún endpoint quede expuesto accidentalmente.

**Rutas excluidas** (en `_PUBLIC_PATHS`):
- `/api/auth/login` — genera el token
- `/api/auth/logout` — stateless, solo para el cliente
- `/health` — healthcheck de infraestructura
- `/docs`, `/redoc`, `/openapi.json` — documentación Swagger (solo en dev)
- `/` — root redirect
- `/ws/*` — WebSockets (ver decisión #7)

### 2. JWT stateless vs. sesiones server-side

**Decisión:** JWT stateless almacenado en localStorage.

**Razones:**
- **Coherencia arquitectónica:** el backend es stateless por diseño (FastAPI async, sin Redis implementado). Agregar una tabla `sessions` contradice esa filosofía.
- **Escalabilidad futura:** si se agregan múltiples instancias del backend, no necesitan compartir estado de sesiones.
- **Simplicidad de implementación:** un interceptor Axios + un middleware = autenticación completa. Las cookies requieren: `SameSite` policy, flag `Secure`, flag `HttpOnly`, CSRF tokens, `credentials: 'include'` en Axios, y configuración CORS `allow_credentials`.

**Trade-off aceptado:** no se puede invalidar un JWT individual server-side. El logout solo limpia el token del cliente. Para invalidación real, se necesitaría una blacklist en Redis (pendiente).

### 3. bcrypt con passlib

**Decisión:** `passlib[bcrypt]` con `CryptContext(schemes=["bcrypt"], deprecated="auto")`.

**Razones:**
- `CryptContext` permite migrar de algoritmo en el futuro sin romper passwords existentes (el `deprecated="auto"` re-hashea automáticamente al verificar).
- bcrypt es deliberadamente lento (~100ms por hash), lo que dificulta ataques de fuerza bruta incluso sin rate limiting.
- Es la recomendación explícita de la documentación de FastAPI.

### 4. JWT_SECRET_KEY obligatorio con validación estricta

**Decisión:** El backend falla al arrancar si `JWT_SECRET_KEY` no está configurado o tiene menos de 32 caracteres.

**Razón:** Prevenir deployment accidental sin configurar la clave de firma. Un JWT firmado con una clave débil o vacía es equivalente a no tener autenticación. La validación está en `config.py` con `@model_validator(mode='after')` de Pydantic — se ejecuta al instanciar `Settings`, antes de que FastAPI registre cualquier ruta.

### 5. Credenciales por defecto `admin/admin`

**Decisión:** La función `ensure_default_admin()` crea un usuario admin solo si la tabla `users` está completamente vacía.

**Razones:**
- El proyecto es de laboratorio — necesita funcionar out-of-the-box sin setup manual.
- Solo se crea si no hay usuarios (idempotente — si ya hay usuarios, no hace nada).
- La contraseña se hashea con bcrypt, nunca se almacena en plaintext.

**Riesgo documentado:** para producción, cambiar la contraseña inmediatamente desde `/admin/users` o vía API.

### 6. AuthProvider envuelve toda la app (no TanStack Query)

**Decisión:** `useAuth` usa `useState` + `useEffect` manual, no `useQuery`.

**Razón:** TanStack Query refetcha en window focus, tab switch, y reconnect por defecto. Para el estado de autenticación:
- No queremos que al volver a la pestaña se lance un `GET /api/auth/me` automático.
- No queremos que un error de red temporal desloguee al usuario.
- Queremos control explícito: validar una vez al montar, cambiar solo en login/logout.

### 7. WebSockets exentos del middleware

**Decisión:** Los paths `/ws/*` pasan sin validación JWT.

**Razón técnica:** La Web API de WebSocket del browser **no permite enviar headers custom** en el handshake HTTP Upgrade. Solo se pueden enviar cookies o query params. Implementar JWT via query param (`/ws/traffic?token=XXX`) requiere:
1. Cambiar el hook `useWebSocket` para inyectar el token.
2. Validar el token en cada función `websocket_*()` de `main.py`.
3. Manejar la renovación cuando el token está por expirar.

Esto está marcado como pendiente. El riesgo actual es bajo porque los WebSockets solo transmiten datos de monitoreo (read-only), no ejecutan acciones destructivas.

### 8. Pantalla de login con glassmorphism

**Decisión:** Diseño visual coherente con el dashboard existente.

**Implementación:**
- Fondo con gradiente del tema activo
- Card central con `backdrop-filter: blur()` (glassmorphism)
- Animación shake en credenciales incorrectas
- Toggle show/hide password
- Usa las clases CSS del design system existente (`glass-card`, `input`, `btn-primary`)
- Responsive y centrado vertical/horizontal

### 9. Gestión de usuarios desde SettingsDrawer

**Decisión:** Acceso al panel de usuarios desde el icono ⚙️ del topbar → SettingsDrawer → botón "Gestionar usuarios".

**Razón:** No se agregó un ítem dedicado al sidebar porque la gestión de usuarios es una operación administrativa infrecuente (no operativa). Agregarla al sidebar la pondría al mismo nivel visual que Firewall o Suricata, lo cual no refleja la frecuencia de uso. El SettingsDrawer ya agrupa configuraciones del sistema.

### 10. Un solo rol: admin (sin RBAC)

**Decisión:** Todos los usuarios autenticados tienen acceso total a todas las funciones.

**Razón:** El usuario definió explícitamente "un único rol: todos los usuarios son admin (sin RBAC por ahora)". Implementar RBAC requiere:
- Campo `role` en el modelo `User`
- Dependency `require_role("admin")` en endpoints sensibles
- UI para asignar roles

Esto está documentado como mejora futura en `produccion_faltantes.md`.

---

## Estructura de archivos

### Archivos nuevos

```
backend/
├── models/user.py                           # Modelo SQLAlchemy: tabla users
├── schemas/auth.py                          # Schemas Pydantic: login, token, user CRUD
├── services/auth_service.py                 # Singleton: JWT + bcrypt + CRUD
└── routers/auth.py                          # 7 endpoints /api/auth/*

frontend/src/
├── hooks/
│   ├── useAuth.ts                           # Estado global de autenticación
│   └── useUsers.ts                          # CRUD usuarios (TanStack Query)
├── components/
│   ├── auth/
│   │   ├── AuthContext.tsx                   # React Context + Provider
│   │   ├── ProtectedRoute.tsx               # Guard de rutas
│   │   └── LoginPage.tsx                    # Pantalla de login
│   └── admin/
│       ├── UsersManagementPage.tsx           # Panel CRUD de usuarios
│       └── UserFormModal.tsx                 # Modal crear/editar usuario
```

### Archivos modificados

```
backend/
├── requirements.txt                         # +python-jose, +passlib
├── config.py                                # JWT_SECRET_KEY + validación
├── main.py                                  # JWTAuthMiddleware + router + lifespan
├── models/__init__.py                       # Registrar User
├── schemas/__init__.py                      # Exportar schemas auth
├── .env / .env.example                      # JWT_SECRET_KEY + JWT_EXPIRE_MINUTES

frontend/src/
├── types.ts                                 # Tipos auth
├── services/api.ts                          # Interceptores JWT + authApi namespace
├── App.tsx                                  # AuthProvider + ProtectedRoute + rutas
├── components/Layout.tsx                    # Footer sidebar (user + logout)
└── components/common/SettingsDrawer.tsx      # Sección admin + link usuarios
```

---

## Endpoints implementados

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| `POST` | `/api/auth/login` | ⚪ Pública | Recibe `{username, password}`, devuelve `{access_token, token_type, user}` |
| `GET` | `/api/auth/me` | 🔒 JWT | Valida el token y devuelve los datos del usuario autenticado |
| `POST` | `/api/auth/logout` | ⚪ Pública | Stateless — el cliente limpia el token |
| `GET` | `/api/auth/users` | 🔒 JWT | Lista todos los usuarios del dashboard |
| `POST` | `/api/auth/users` | 🔒 JWT | Crea un nuevo usuario |
| `PUT` | `/api/auth/users/:id` | 🔒 JWT | Edita usuario (email, nombre, contraseña, is_active) |
| `DELETE` | `/api/auth/users/:id` | 🔒 JWT | Elimina un usuario |

---

## Modelo de datos

```sql
CREATE TABLE users (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    username    VARCHAR(50)  UNIQUE NOT NULL,
    email       VARCHAR(100) UNIQUE NOT NULL,
    full_name   VARCHAR(100),
    hashed_password VARCHAR(255) NOT NULL,
    is_active   BOOLEAN DEFAULT TRUE,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

## Estructura del JWT

```json
{
  "sub": "admin",
  "exp": 1750169400
}
```

- `sub` (subject): username del usuario
- `exp` (expiration): timestamp Unix de expiración
- Algoritmo: HS256 (HMAC-SHA256)
- Firmado con: `JWT_SECRET_KEY` (mínimo 32 caracteres)

---

## Variables de entorno

| Variable | Obligatoria | Default | Descripción |
|----------|------------|---------|-------------|
| `JWT_SECRET_KEY` | ✅ Sí | — | Clave de firma HMAC. Mínimo 32 chars. Generar con: `python -c "import secrets; print(secrets.token_hex(32))"` |
| `JWT_EXPIRE_MINUTES` | No | `60` | Tiempo de vida del token en minutos |

---

## Dependencias Python agregadas

```
python-jose[cryptography]==3.3.0    # JWT encode/decode
passlib[bcrypt]==1.7.4               # Password hashing
```

---

## Resumen de seguridad

| Aspecto | Estado | Detalle |
|---------|--------|---------|
| Contraseñas | ✅ Hasheadas | bcrypt via passlib (nunca plaintext en DB) |
| Token | ✅ Firmado | HS256 con clave de 256 bits |
| Validación global | ✅ Middleware | Todos los endpoints HTTP protegidos |
| Clave de firma | ✅ Validada | Falla al arrancar si no existe o es muy corta |
| WebSockets | ⚠️ Sin JWT | Excluidos del middleware (pendiente) |
| Rate limiting | ❌ Pendiente | Login vulnerable a brute force |
| RBAC | ❌ Pendiente | Todos los usuarios son admin |
| Blacklist de tokens | ❌ Pendiente | Logout solo limpia cliente (no invalida server-side) |
| HTTPS | ❌ Pendiente | Tokens viajan en plaintext HTTP |

---

Última actualización: 2026-06-17
Versión: 2.7
