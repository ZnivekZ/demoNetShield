# Lo que falta para producción — NetShield Dashboard

> Análisis de brechas entre el estado actual (laboratorio) y un deployment usable en servidor.

---

## Resumen ejecutivo

```
Estado actual:  LABORATORIO — funcional, con autenticación JWT básica
Objetivo:       SERVIDOR — usable por un equipo real

Brechas encontradas: 11
  ✅ Resueltas:                         1  (autenticación JWT)
  🔴 Críticas (bloquean deployment):    3
  🟡 Importantes (usable pero riesgoso): 4
  🟢 Mejoras (nice-to-have):            4
```

---

## ✅ RESUELTO — Autenticación de usuarios (Login)

> **Implementado el 2026-06-17**

**Estado anterior:** CERO autenticación. Cualquiera con acceso a la URL podía operar el dashboard completo.

**Lo que se implementó:**

| Componente | Estado |
|-----------|--------|
| `models/user.py` | ✅ Modelo SQLAlchemy: `id`, `username`, `email`, `hashed_password`, `is_active`, `created_at` |
| `passlib[bcrypt]` | ✅ Hashing de contraseñas con bcrypt |
| `python-jose[cryptography]` | ✅ JWT con expiración configurable (`JWT_EXPIRE_MINUTES`, default 60min) |
| `JWT_SECRET_KEY` | ✅ Obligatorio en `.env`. El backend falla al arrancar si no está configurado |
| `JWTAuthMiddleware` | ✅ Middleware HTTP global en `main.py` — valida token en **todos** los endpoints |
| `services/auth_service.py` | ✅ Singleton: `create_token`, `verify_token`, `authenticate_user`, CRUD usuarios |
| `POST /api/auth/login` | ✅ Devuelve JWT |
| `GET /api/auth/me` | ✅ Valida sesión activa |
| `POST /api/auth/logout` | ✅ Stateless (limpia token en cliente) |
| `GET/POST /api/auth/users` | ✅ Listar y crear usuarios |
| `PUT/DELETE /api/auth/users/:id` | ✅ Editar y eliminar usuarios |
| `ensure_default_admin()` | ✅ Crea `admin/admin` al arrancar si la DB está vacía |
| Frontend: `LoginPage.tsx` | ✅ Glassmorphism + shake on error + show/hide password |
| Frontend: `AuthContext.tsx` | ✅ Context provider global del estado de autenticación |
| Frontend: `ProtectedRoute.tsx` | ✅ Guard de rutas: redirige a `/login` si no autenticado |
| Frontend: Axios interceptor | ✅ Inyecta `Authorization: Bearer` en cada request |
| Frontend: 401 handler | ✅ Si token inválido/expirado → limpia localStorage → `/login` |
| `/admin/users` | ✅ Panel CRUD de usuarios (acceso desde ⚙️ SettingsDrawer) |
| Logout en sidebar | ✅ Footer del sidebar muestra usuario y botón "Salir" |

**Rutas públicas** (sin token): `/api/auth/login`, `/api/auth/logout`, `/health`, `/docs`, `/ws/*`

**Credenciales por defecto:** `admin` / `admin` — **cambiar en producción**

> [!CAUTION]
> Los WebSockets (`/ws/*`) están actualmente exentos del middleware JWT por compatibilidad.
> Para producción, implementar validación de token como query param: `/ws/traffic?token=XXX`

---

## 🔴 Críticas — Sin esto NO se puede alojar

### 1. HTTPS / TLS

**Estado actual:** Todo es HTTP plaintext. Las credenciales de login viajan en texto claro en la red.

**¿Qué se necesita?**

**Opción A — Reverse proxy (recomendada):**
```
Internet → Nginx/Caddy (TLS) → Backend :8000 (HTTP interno)
                              → Frontend estático
```

**Opción B — Uvicorn directo con SSL:**
```python
uvicorn.run("main:app", ssl_certfile="cert.pem", ssl_keyfile="key.pem")
```

| Componente | Detalle |
|-----------|---------|
| Certificado | Let's Encrypt (gratis) via Certbot o Caddy (auto-provision) |
| Reverse proxy | Nginx o Caddy sirviendo frontend estático + proxy a backend |
| Frontend build | `npm run build` → archivos estáticos en `dist/` |
| WebSocket proxy | `wss://` en vez de `ws://` |

**Esfuerzo estimado:** 4-6 horas

---

### 2. Containerización (Docker)

**Estado actual:** No existe `Dockerfile`, `docker-compose.yml`, ni `.dockerignore`. El proyecto se ejecuta manualmente con `python main.py` y `npm run dev`.

**¿Qué se necesita?**

| Archivo | Propósito |
|---------|-----------|
| `backend/Dockerfile` | Multi-stage: instalar deps → copiar código → CMD uvicorn |
| `frontend/Dockerfile` | Multi-stage: `npm run build` → Nginx sirviendo estáticos |
| `docker-compose.yml` | Orquestar: backend + frontend + (optional) PostgreSQL + Redis |
| `.dockerignore` | Excluir `.venv/`, `node_modules/`, `.git/`, `*.db` |
| `nginx.conf` | Proxy config: `/api/*` → backend, `/ws/*` → backend, `/*` → estáticos |

```yaml
# docker-compose.yml (esqueleto)
services:
  backend:
    build: ./backend
    ports: ["8000:8000"]
    env_file: ./backend/.env
    volumes: ["./backend/data:/app/data"]  # GeoIP DBs

  frontend:
    build: ./frontend
    ports: ["80:80", "443:443"]
    depends_on: [backend]
    # Nginx sirve estáticos + proxy a backend
```

**Esfuerzo estimado:** 6-8 horas

---

### 3. Build de producción del frontend

**Estado actual:** El frontend se sirve con `npm run dev` (Vite dev server). Esto NO es para producción: sin minificación, sin optimización, sin caché de assets, hot reload innecesario.

**¿Qué se necesita?**

```bash
cd frontend && npm run build
# → dist/ con HTML + JS/CSS minificados + assets hasheados
```

Luego servir `dist/` desde Nginx/Caddy con:
- Caché agresiva para assets hasheados (`Cache-Control: max-age=31536000`)
- `index.html` sin caché (siempre fresco)
- Fallback SPA: `try_files $uri /index.html` para React Router

**Esfuerzo estimado:** 1-2 horas (el build ya funciona, solo falta servir)

---

## 🟡 Importantes — Funciona sin esto, pero es riesgoso

### 4. Rate Limiting

**Estado actual:** CERO rate limiting. El endpoint de login puede recibir ataques de brute force.

**¿Por qué importa?** Sin rate limit:
- Brute force al login (aunque bcrypt hace cada intento lento, no es suficiente)
- Saturar la API de MikroTik/Wazuh con requests en cascada
- DoS al backend con endpoints pesados (reportes IA, GLPI sync)

**Solución recomendada:** `slowapi` (wrapper de `limits` para FastAPI)

```python
from slowapi import Limiter
limiter = Limiter(key_func=get_remote_address)

@router.post("/auth/login")
@limiter.limit("5/minute")  # Max 5 intentos de login por minuto
async def login(request: Request, ...): ...

@router.post("/cli/execute")
@limiter.limit("10/minute")  # CLI remoto: max 10/min
async def execute_cli(...): ...
```

**Esfuerzo estimado:** 3-4 horas

---

### 5. RBAC (Control de acceso por roles)

**Estado actual:** Todos los usuarios autenticados tienen acceso completo a todas las funciones (bloquear IPs, CLI remota, reportes, config).

**¿Qué se necesita?**

| Rol | Puede hacer |
|-----|------------|
| `viewer` | Solo lectura: dashboards, widgets, alertas |
| `operator` | Lectura + acciones: block/unblock, active response, reportes |
| `admin` | Todo: configuración, CLI, gestión de usuarios, reglas |

Implementación: campo `role` en modelo `User` + dependency `require_role("admin")` en endpoints sensibles.

**Esfuerzo estimado:** 4-6 horas (auth ya está, solo falta el campo role + dependency)

---

### 6. Base de datos de producción

**Estado actual:** SQLite con `aiosqlite`. Funciona perfecto para laboratorio, pero tiene un **single-writer lock** — solo un proceso puede escribir a la vez.

**¿Cuándo migrar?** Si se espera:
- Más de 1 instancia del backend (horizontal scaling)
- Writes concurrentes pesados (muchos action logs simultáneos)
- Persistencia robusta (SQLite puede corromperse en crashes)

**Migración:** Cambiar `DATABASE_URL` en `.env`:
```
# De:
DATABASE_URL=sqlite+aiosqlite:///./netshield.db
# A:
DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/netshield
```
Instalar `asyncpg`. Los modelos SQLAlchemy no cambian.

**Esfuerzo estimado:** 2-3 horas (incluye agregar PostgreSQL a docker-compose)

---

### 7. Variables de entorno seguras

**Estado actual:** `.env` con credenciales en plaintext en el filesystem.

**¿Qué se necesita?**
- `.env` NUNCA en el repositorio (ya está en `.gitignore` ✅)
- `JWT_SECRET_KEY` generada con `secrets.token_hex(32)` ✅ (ya en `.env`)
- En producción: usar Docker secrets, o vault (HashiCorp Vault), o variables de entorno del host
- Rotar `CROWDSEC_API_KEY`, `ANTHROPIC_API_KEY`, `TELEGRAM_BOT_TOKEN` regularmente
- **Cambiar la contraseña del admin por defecto** (`admin/admin` → contraseña fuerte)

**Esfuerzo estimado:** 1-2 horas

---

## 🟢 Mejoras — Nice-to-have

### 8. Validar JWT en WebSockets

**Estado actual:** Los 7 WebSockets (`/ws/*`) están exentos del `JWTAuthMiddleware` por compatibilidad con la conexión inicial.

**¿Qué se necesita?**
```python
# En cada websocket endpoint, al conectar:
token = websocket.query_params.get("token")
payload = decode_token(token)
if not payload:
    await websocket.close(code=1008)  # Policy Violation
    return
```

El frontend debe cambiar:
```ts
useWebSocket('/ws/traffic')
// → useWebSocket(`/ws/traffic?token=${localStorage.getItem('netshield_token')}`)
```

**Esfuerzo estimado:** 2-3 horas

---

### 9. Tests automatizados

**Estado actual:** CERO tests. No hay `pytest`, no hay directorio `tests/`, no hay CI/CD.

**¿Qué se necesita?**

| Tipo | Cobertura mínima | Herramienta |
|------|-----------------|-------------|
| Unit tests | Servicios + schemas + auth | `pytest` + `pytest-asyncio` |
| Integration tests | Endpoints REST | `httpx` + `TestClient` de FastAPI |
| Frontend tests | Componentes críticos | `vitest` + `@testing-library/react` |

**Esfuerzo estimado:** 15-20 horas (cobertura básica)

---

### 10. Logging centralizado

**Estado actual:** `structlog` a stdout/stderr. Los logs se pierden al reiniciar.

**En producción:**
- Redirigir logs a archivo rotado (`logging.handlers.RotatingFileHandler`)
- O enviar a un servicio: Loki, ELK, CloudWatch
- Agregar `request_id` a cada request para tracing

**Esfuerzo estimado:** 3-4 horas

---

### 11. Health checks y monitoring

**Estado actual:** Existe `GET /api/health` pero es básico (solo dice "healthy").

**¿Qué agregar?**
- Verificar conexión a cada servicio externo (MikroTik, Wazuh, etc.)
- Endpoint `/api/health/ready` (para Kubernetes readiness probe)
- Métricas Prometheus (`prometheus-fastapi-instrumentator`)
- Uptime monitoring externo (UptimeRobot, Healthchecks.io)

**Esfuerzo estimado:** 4-5 horas

---

### 12. Backup de base de datos

**Estado actual:** No hay backup automático. Si se pierde `netshield.db`, se pierden todos los action logs, vistas personalizadas, usuarios y configuraciones.

**Solución simple:** Cron job que copie el archivo SQLite cada N horas. Con PostgreSQL: `pg_dump` programado.

**Esfuerzo estimado:** 1-2 horas

---

## Roadmap de implementación sugerido

```
Fase 1: MÍNIMO PARA ALOJAR (1 semana)
──────────────────────────────────────
  ✅ DONE:  #AUTH  Login JWT + middleware global
  Día 1-2:  #3 Build frontend producción
  Día 3-4:  #2 Docker (Dockerfile + compose)
  Día 4-5:  #1 HTTPS con Caddy/Nginx
  Día 5:    #7 Variables seguras (cambiar admin/admin)

  → Resultado: Dashboard alojable con login real ✅

Fase 2: ENDURECIMIENTO (1 semana más)
──────────────────────────────────────
  Día 6-7:   #4 Rate limiting (slowapi)
  Día 8-9:   #5 RBAC (3 roles)
  Día 10:    #6 Migrar a PostgreSQL
  Día 10:    #12 Backup automático

  → Resultado: Dashboard seguro para equipo real

Fase 3: HARDENING WEBSOCKETS + OPERACIONES
────────────────────────────────────────────
  #8  JWT en WebSockets (query param)
  #9  Tests automatizados
  #10 Logging centralizado
  #11 Health checks avanzados + Prometheus

  → Resultado: Dashboard production-grade
```

---

## Resumen visual

```
LO QUE TENÉS                    LO QUE FALTA
─────────────                   ─────────────
✅ 185 endpoints REST            🔴 HTTPS/TLS
✅ 7 WebSockets                  🔴 Docker
✅ 59 widgets                    🔴 Build producción frontend
✅ 17 servicios                  🟡 Rate limiting
✅ Mock system completo          🟡 Roles (RBAC)
✅ 6 temas visuales              🟡 PostgreSQL
✅ Auditoría (ActionLog)         🟡 Secrets management (cambiar admin/admin)
✅ Reportes con IA               🟢 JWT en WebSockets
✅ Bot Telegram                  🟢 Tests
✅ GeoIP enrichment              🟢 Logging persistente
✅ Drag-and-drop views           🟢 Health checks avanzados
✅ 25 rutas frontend             🟢 Backup automático
✅ Login JWT (admin/admin)
✅ Gestión de usuarios
✅ JWTAuthMiddleware global
```

> [!IMPORTANT]
> **El bloqueador #1 anterior (autenticación) está ✅ resuelto.**
> El nuevo bloqueador para alojar en producción es **HTTPS/TLS** — sin él, las credenciales del login viajan en texto claro.

> [!CAUTION]
> **Cambiar `admin/admin` antes de cualquier deployment público.** Desde `/admin/users` o vía `PUT /api/auth/users/1`.
