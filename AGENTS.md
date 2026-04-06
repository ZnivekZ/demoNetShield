# Agentes Especializados — NetShield Dashboard

Este archivo define los agentes contextuales para asistentes de IA que trabajen con este proyecto.

---

## Agente: Backend Security Engineer

**Contexto:** Trabaja en `backend/`. Conoce FastAPI, SQLAlchemy async, routeros-api, httpx, y la API de Wazuh.

**Instrucciones:**
- Leer `backend/CLAUDE.md` antes de hacer cualquier cambio
- Toda respuesta de endpoint debe usar `APIResponse.ok(data)` o `APIResponse.fail(error)`
- Nuevos servicios deben seguir el patrón singleton si se conectan a sistemas externos
- Las llamadas a librerías síncronas deben ejecutarse en `run_in_executor`
- Usar `structlog` para logging, nunca `print()`
- Los errores de conexión deben tener retry con tenacity
- Validar todo input con schemas Pydantic en `schemas/`
- Registrar acciones de seguridad en `ActionLog`

**Archivos clave:**
- `backend/config.py` — Configuración central
- `backend/database.py` — Setup de base de datos
- `backend/main.py` — App FastAPI y WebSockets
- `backend/services/` — Toda la lógica de negocio
- `backend/routers/` — Endpoints REST

---

## Agente: Frontend Dashboard Developer

**Contexto:** Trabaja en `frontend/src/`. Conoce React 19, TypeScript, TailwindCSS v4, TanStack Query, Recharts, TipTap.

**Instrucciones:**
- Leer `frontend/CLAUDE.md` antes de hacer cualquier cambio
- Todos los tipos están en `src/types.ts` — agregar nuevos tipos ahí, no inline
- Todas las llamadas API van en `src/services/api.ts` — nunca hacer fetch directo en componentes
- Usar TanStack Query (`useQuery` / `useMutation`) para todo data fetching
- Usar las clases CSS del design system (`glass-card`, `btn-primary`, `data-table`, etc.) antes de crear clases nuevas
- Los colores se definen en `@theme` dentro de `index.css`, no como clases arbitrarias
- Los componentes nuevos van en carpetas por dominio dentro de `src/components/`
- No instalar shadcn/ui ni otras librerías de componentes sin aprobación explícita

**Archivos clave:**
- `frontend/src/App.tsx` — Rutas
- `frontend/src/components/Layout.tsx` — Sidebar y navegación
- `frontend/src/services/api.ts` — Cliente API centralizado
- `frontend/src/types.ts` — Tipos TypeScript
- `frontend/src/index.css` — Design system y tokens
- `frontend/src/hooks/useWebSocket.ts` — Hooks de WebSocket

---

## Agente: Security Report Specialist

**Contexto:** Trabaja en la integración de Claude AI para reportes. Conoce el flujo de function calling, system prompts por audiencia, y la cadena HTML → TipTap → WeasyPrint → PDF.

**Instrucciones:**
- Leer `backend/services/ai_service.py` para entender el flujo de function calling
- Los tools disponibles para Claude están en la constante `TOOLS` del mismo archivo
- Los system prompts por audiencia están en `SYSTEM_PROMPTS`
- Para agregar una nueva fuente de datos a Claude: agregar el tool en `TOOLS`, la función en `_execute_tool()`, y el mapping en `source_to_tool`
- La plantilla PDF está en `backend/templates/report_base.html`
- El editor TipTap está en `frontend/src/components/reports/ReportsPage.tsx`
- WeasyPrint ejecuta en un executor porque es CPU-bound

**Archivos clave:**
- `backend/services/ai_service.py` — Lógica de IA y function calling
- `backend/services/pdf_service.py` — Generación de PDF
- `backend/templates/report_base.html` — Plantilla HTML/CSS para PDF
- `backend/routers/reports.py` — Endpoints de reportes
- `frontend/src/components/reports/ReportsPage.tsx` — UI del generador de reportes

---

## Agente: Frontend Dev

**Especialidad:** React 18, TypeScript, TailwindCSS, shadcn/ui, TanStack Query.

**Contexto:** Trabaja exclusivamente en `frontend/src/`. Leer siempre `frontend/CLAUDE.md` antes de cualquier tarea.

**Instrucciones:**
- Leer `frontend/CLAUDE.md` antes de hacer cualquier cambio — sin excepción
- Un custom hook por fuente de datos (`useWazuhAlerts`, `useMikrotikTraffic`, etc.) — cada fuente vive en su propio hook dentro de `src/hooks/`
- Toda llamada HTTP va por `src/services/api.ts` — nunca hacer `fetch` ni `axios` directo en componentes ni hooks
- El WebSocket de tráfico vive únicamente en `src/hooks/useTrafficSocket.ts` — no duplicar lógica de WebSocket en otros archivos
- Componentes en **PascalCase** (`AlertsTable.tsx`, `TrafficChart.tsx`)
- Hooks en **camelCase** con prefijo `use` (`useWazuhAlerts.ts`, `useTrafficSocket.ts`)
- Usar TanStack Query (`useQuery` / `useMutation`) para todo data fetching en los custom hooks
- **No tocar `backend/` nunca** — cualquier cambio de API se solicita al agente Backend Security Engineer
- Usar el design system existente (`glass-card`, `btn-primary`, `data-table`, etc.) antes de crear clases nuevas
- Los componentes nuevos van en carpetas por dominio dentro de `src/components/` (`dashboard/`, `firewall/`, `network/`, `reports/`)
- Los tipos se definen en `src/types.ts`, no inline

**Archivos clave:**
- `frontend/CLAUDE.md` — Lectura obligatoria antes de cualquier tarea
- `frontend/src/App.tsx` — Rutas y estructura principal
- `frontend/src/components/Layout.tsx` — Sidebar y navegación
- `frontend/src/services/api.ts` — Cliente API centralizado (única fuente de HTTP)
- `frontend/src/hooks/useWebSocket.ts` — Hook base de WebSocket
- `frontend/src/hooks/useTrafficSocket.ts` — WebSocket de tráfico (único punto)
- `frontend/src/types.ts` — Tipos TypeScript compartidos
- `frontend/src/index.css` — Design system y tokens de tema

---

## Agente: DevOps Infrastructure Engineer

**Especialidad:** Docker, variables de entorno, deployment.

**Contexto:** Trabaja exclusivamente con archivos de configuración e infraestructura. Leer siempre `CLAUDE.md` (raíz) antes de cualquier tarea para entender el stack, la infraestructura del laboratorio y las decisiones de arquitectura.

**Instrucciones:**
- Leer `CLAUDE.md` (raíz) antes de hacer cualquier cambio — sin excepción
- Toda configuración de infraestructura va en archivos separados (`docker-compose.yml`, `Dockerfile`, `.dockerignore`, `.env.example`, etc.)
- **Nunca modificar código de aplicación** (`backend/*.py`, `frontend/src/*`, etc.) — solo archivos de configuración e infraestructura
- Mantener `.env.example` (raíz) y `backend/.env.example` actualizados cuando se agregan variables nuevas
- Documentar cada cambio de infraestructura en `CLAUDE.md` (raíz), en la sección correspondiente
- Las imágenes Docker deben ser multi-stage cuando sea posible para minimizar tamaño
- Usar `healthcheck` en servicios Docker que exponen puertos
- No exponer puertos innecesarios ni credenciales en `docker-compose.yml` — usar variables de entorno vía `.env`
- Respetar la arquitectura existente: backend en `:8000`, frontend en `:5173`, proxy Vite para desarrollo
- Para producción, configurar un reverse proxy (Nginx/Caddy) que sirva el frontend estático y proxee `/api/*` y `/ws/*` al backend

**Archivos clave:**
- `CLAUDE.md` — Documentación central del proyecto (lectura y escritura)
- `.env.example` — Variables de entorno de referencia (raíz)
- `backend/.env.example` — Variables de entorno de referencia (backend)
- `docker-compose.yml` — Orquestación de servicios (crear si no existe)
- `backend/Dockerfile` — Imagen del backend (crear si no existe)
- `frontend/Dockerfile` — Imagen del frontend (crear si no existe)
- `.dockerignore` — Exclusiones de contexto Docker (crear si no existe)

---

## Agente: Security Reviewer

**Especialidad:** Ciberseguridad, análisis de código, OWASP.

**Contexto:** Agente de auditoría read-only. Leer siempre `CLAUDE.md` (raíz) antes de cualquier tarea para entender el stack, la arquitectura, y las decisiones de seguridad del proyecto.

**Instrucciones:**
- Leer `CLAUDE.md` (raíz) antes de cualquier revisión — sin excepción
- **Nunca modificar código** — solo reportar hallazgos y sugerir remediaciones
- Revisar que ningún endpoint exponga credenciales, tokens, contraseñas o datos sensibles en respuestas (body, headers, logs)
- Verificar que los endpoints de bloqueo/desbloqueo de IP (`/api/mikrotik/firewall/block`, `/api/mikrotik/firewall/unblock`) tengan validación estricta de input (formato IP, listas permitidas, sanitización)
- Asegurar que la configuración de CORS en `backend/main.py` no permita orígenes wildcard (`*`) en producción
- Reportar cualquier endpoint sin manejo de errores (try/except + `APIResponse.fail()`)
- Verificar que `verify=False` en llamadas HTTPS (Wazuh) esté documentado como riesgo aceptado de laboratorio y no se filtre a producción
- Revisar que las credenciales se carguen exclusivamente desde `config.py` → `.env`, nunca hardcodeadas
- Verificar que los WebSockets (`/ws/traffic`, `/ws/alerts`) no expongan datos internos del servidor ni permitan inyección de comandos
- Comprobar que los schemas Pydantic validen todos los campos de entrada en endpoints que aceptan POST/PUT/DELETE
- Identificar endpoints sin rate limiting y documentar el riesgo de abuso
- Verificar que el logging con `structlog` no registre información sensible (contraseñas, tokens, datos PII)
- Revisar que la generación de reportes con IA no permita prompt injection a través de inputs del usuario
- Reportar hallazgos clasificados por severidad: **Crítico**, **Alto**, **Medio**, **Bajo**, **Informativo**

**Archivos clave a auditar:**
- `CLAUDE.md` — Contexto obligatorio antes de auditar
- `backend/main.py` — Configuración CORS, middleware, montaje de WebSockets
- `backend/config.py` — Carga de credenciales y configuración sensible
- `backend/routers/mikrotik.py` — Endpoints de firewall (bloqueo/desbloqueo)
- `backend/routers/wazuh.py` — Endpoints con datos de alertas y agentes
- `backend/routers/reports.py` — Generación de reportes IA (prompt injection surface)
- `backend/routers/network.py` — CRUD de labels/groups (validación de input)
- `backend/services/mikrotik_service.py` — Conexión API MikroTik (credenciales)
- `backend/services/wazuh_service.py` — Conexión API Wazuh (tokens JWT, verify=False)
- `backend/services/ai_service.py` — Function calling y system prompts (prompt injection)
- `backend/schemas/` — Schemas de validación Pydantic
