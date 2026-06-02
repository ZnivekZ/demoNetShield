# Agentes Especializados — NetShield Dashboard

Este archivo define los agentes contextuales para asistentes de IA que trabajen con este proyecto.

---

## Agente: Backend Security Engineer

**Contexto:** Trabaja en `backend/`. Conoce FastAPI, SQLAlchemy async, routeros-api, httpx, y las APIs de Wazuh, CrowdSec, Suricata, GLPI y Telegram.

**Instrucciones:**
- Leer `backend/CONTEXT.md` antes de hacer cualquier cambio
- Toda respuesta de endpoint debe usar `APIResponse.ok(data)` o `APIResponse.fail(error)` (definido en `schemas/common.py`)
- Nuevos servicios deben seguir el patrón singleton: variable de módulo + función `get_X_service()`
- Excepción al singleton: `AIService` crea instancia por llamada
- Las llamadas a librerías síncronas (`routeros-api`, `weasyprint`, `requests`) deben ejecutarse en `run_in_executor` o `asyncio.to_thread`
- Usar `structlog` para logging, nunca `print()`
- Los errores de conexión deben tener retry con `tenacity` (`@retry`, backoff 1-10s, 3 intentos)
- Validar todo input con schemas Pydantic en `schemas/`
- Registrar acciones de seguridad en `ActionLog`
- Mock guard al inicio de cada método de servicio: `if settings.should_mock_X: return MockData.X.funcion()`
- Los mock guards van en servicios (no en routers) para que los WebSockets también los respeten
- Para llamadas cross-service usar lazy imports dentro de funciones para evitar circular imports
- `_api_call()` es el único punto de entrada para operaciones MikroTik (maneja threading, locks, reconexión)

**Archivos clave:**
- `backend/CONTEXT.md` — Lectura obligatoria
- `backend/config.py` — Settings con pydantic-settings (9 mock flags + `MOCK_ALL`)
- `backend/database.py` — SQLAlchemy async engine + session factory
- `backend/main.py` — App FastAPI, lifespan (startup/shutdown), 7 WebSockets, CORS
- `backend/schemas/common.py` — `APIResponse[T]` envelope
- `backend/services/` — 16 servicios de lógica de negocio
- `backend/services/mock_data.py` — Datos mock estáticos (~152KB)
- `backend/services/mock_service.py` — Facade CRUD en memoria para modo mock
- `backend/routers/` — 16 routers REST
- `backend/models/` — 10 modelos SQLAlchemy (8 archivos)

---

## Agente: Frontend Dashboard Developer

**Contexto:** Trabaja en `frontend/src/`. Conoce React 19, TypeScript 5.9, TailwindCSS v4, TanStack Query 5, Recharts 3, TipTap 3, @dnd-kit, d3-geo.

**Instrucciones:**
- Leer `frontend/CONTEXT.md` antes de hacer cualquier cambio
- Todos los tipos están en `src/types.ts` (~39KB) — agregar nuevos tipos ahí, no inline
- Todas las llamadas API van en `src/services/api.ts` (~37KB, 15+ namespaces) — nunca hacer fetch directo en componentes
- Usar TanStack Query (`useQuery` / `useMutation`) para todo data fetching
- Un custom hook por fuente de datos en `src/hooks/` — Widget hooks en `src/hooks/widgets/{visual,technical,hybrid}/index.ts`
- WebSocket de tráfico: `useWebSocket('/ws/traffic')` directo — **NO existe** `useTrafficSocket.ts`
- Usar las clases CSS del design system antes de crear clases nuevas:
  - Layout: `glass-card`, `stat-card`, `sidebar`, `sidebar-link`
  - Datos: `data-table`, `badge-critical/high/medium/low/info/success/danger`
  - Interacción: `btn-primary/danger/ghost/success`, `input`
  - Estado: `status-dot active/disconnected/pending`
  - Animación: `animate-fade-in-up`, `loading-spinner`
- Los colores se definen en `@theme` dentro de `index.css`, no como clases arbitrarias
- Los componentes nuevos van en carpetas por dominio dentro de `src/components/`
- Componentes en **PascalCase** (`AlertsTable.tsx`, `TrafficChart.tsx`)
- Hooks en **camelCase** con prefijo `use` (`useWazuhSummary.ts`, `useGlpiAssets.ts`)
- No instalar shadcn/ui ni otras librerías de componentes sin aprobación explícita
- Sidebar: 7 grupos, 20/20 ítems usados (0 slots libres). Array `navGroups` en `Layout.tsx`
- Topbar: 5 status dots (MikroTik, Wazuh, CrowdSec, Suricata, GLPI)
- 6 temas definidos en `config/themes.ts`, gestionados por `hooks/useTheme.ts`

**Archivos clave:**
- `frontend/CONTEXT.md` — Lectura obligatoria
- `frontend/src/App.tsx` — 23 rutas con QueryClientProvider
- `frontend/src/components/Layout.tsx` — Sidebar 7 grupos + topbar
- `frontend/src/services/api.ts` — Cliente API centralizado (18 namespaces, única fuente HTTP)
- `frontend/src/types.ts` — Tipos TypeScript (~1909 líneas, espejo de schemas Pydantic)
- `frontend/src/index.css` — Design system, tokens `@theme`, clases custom (121KB)
- `frontend/src/hooks/useWebSocket.ts` — Hook base WebSocket con reconexión
- `frontend/src/config/themes.ts` — 6 temas + font scale config

---

## Agente: Widget Developer

**Contexto:** Trabaja en el sistema de 56 widgets configurables (4 categorías). Conoce la arquitectura de 3 capas: Hook → Componente → WidgetRenderer.

**Instrucciones:**
- Leer `frontend/CONTEXT.md` sección "Sistema de widgets" antes de hacer cualquier cambio
- Para agregar un widget nuevo, seguir estos 5 pasos:
  1. **Hook** en `hooks/widgets/{category}/index.ts`: `export function useMiWidget() { return useQuery({...}) }`
  2. **Componente** en `components/widgets/{category}/MiWidget.tsx`
  3. **Export** en `components/widgets/{category}/index.ts`
  4. **Case** en `components/views/WidgetRenderer.tsx` (switch por `widget.type`)
  5. **Catálogo backend** en `routers/views.py` → `GET /api/views/widgets/catalog`
- Los hooks de widgets siempre usan APIs existentes de `services/api.ts` — nunca endpoints custom
- Los hooks multi-fuente usan `Promise.allSettled()` con manejo de fallo parcial
- Componentes comunes en `components/widgets/common/index.tsx`: `WidgetSkeleton`, `WidgetErrorState`, `WidgetHeader`

| Categoría | Widgets | Hooks |
|-----------|---------|-------|
| Standard  | 18      | N/A (usan hooks existentes de cada módulo) |
| Visual | 11 | `hooks/widgets/visual/index.ts` |
| Technical | 13 | `hooks/widgets/technical/index.ts` |
| Hybrid | 14 | `hooks/widgets/hybrid/index.ts` |
| **Total** | **56** | |

**Archivos clave:**
- `frontend/src/components/views/WidgetRenderer.tsx` — Dispatcher central (24KB)
- `frontend/src/hooks/widgets/visual/index.ts` — 11 hooks visuales
- `frontend/src/hooks/widgets/technical/index.ts` — 13 hooks técnicos
- `frontend/src/hooks/widgets/hybrid/index.ts` — 15 hooks híbridos
- `frontend/src/hooks/useDhcp.ts` — DHCP: 7 read + 10 mutation + 5 Fase 2
- `frontend/src/components/widgets/{visual,technical,hybrid}/` — Componentes
- `frontend/src/components/views/ViewBuilderPage.tsx` — Editor drag-and-drop

---

## Agente: Security Report Specialist

**Contexto:** Trabaja en la integración de Claude AI para reportes. Conoce el flujo de function calling, system prompts por audiencia, y la cadena HTML → TipTap → WeasyPrint → PDF.

**Instrucciones:**
- Leer `backend/services/ai_service.py` para entender el flujo de function calling
- Los tools disponibles para Claude están en la constante `TOOLS` del mismo archivo (5 tools)
- Los system prompts por audiencia están en `SYSTEM_PROMPTS` (4: executive, technical, operational, telegram)
- Para agregar una nueva fuente de datos a Claude: agregar el tool en `TOOLS`, la función en `_execute_tool()`, y el mapping en `source_to_tool`
- La plantilla PDF está en `backend/templates/report_base.html`
- El editor TipTap está en `frontend/src/components/reports/ReportsPage.tsx`
- WeasyPrint ejecuta en un executor porque es CPU-bound
- Modelo: `claude-sonnet-4-20250514`, max 8192 tokens, max 10 iteraciones de tool use
- `AIService` NO es singleton — se crea instancia por llamada

**Archivos clave:**
- `backend/services/ai_service.py` — Lógica de IA y function calling (17KB)
- `backend/services/pdf_service.py` — Generación de PDF (2KB)
- `backend/templates/report_base.html` — Plantilla HTML/CSS para PDF
- `backend/routers/reports.py` — Endpoints de reportes + Telegram (18KB)
- `frontend/src/components/reports/ReportsPage.tsx` — UI del generador de reportes
- `frontend/src/components/reports/TelegramTab.tsx` — Integración Telegram

---

## Agente: DevOps Infrastructure Engineer

**Especialidad:** Docker, variables de entorno, deployment.

**Contexto:** Trabaja exclusivamente con archivos de configuración e infraestructura. Leer siempre `CONTEXT.md` (raíz) antes de cualquier tarea para entender el stack, la infraestructura del laboratorio y las decisiones de arquitectura.

**Instrucciones:**
- Leer `CONTEXT.md` (raíz) antes de hacer cualquier cambio — sin excepción
- Toda configuración de infraestructura va en archivos separados (`docker-compose.yml`, `Dockerfile`, `.dockerignore`, `.env.example`, etc.)
- **Nunca modificar código de aplicación** (`backend/*.py`, `frontend/src/*`, etc.) — solo archivos de configuración e infraestructura
- Mantener `.env.example` (raíz) y `backend/.env.example` actualizados cuando se agregan variables nuevas
- Documentar cada cambio de infraestructura en `CONTEXT.md` (raíz), en la sección correspondiente
- Las imágenes Docker deben ser multi-stage cuando sea posible para minimizar tamaño
- Usar `healthcheck` en servicios Docker que exponen puertos
- No exponer puertos innecesarios ni credenciales en `docker-compose.yml` — usar variables de entorno vía `.env`
- Respetar la arquitectura existente: backend en `:8000`, frontend en `:5173`, proxy Vite para desarrollo
- Para producción, configurar un reverse proxy (Nginx/Caddy) que sirva el frontend estático y proxee `/api/*` y `/ws/*` al backend
- El venv está en la raíz (`netShield2/.venv/`), no en `backend/`

**Archivos clave:**
- `CONTEXT.md` — Documentación central del proyecto (lectura y escritura)
- `.env.example` — Variables de entorno de referencia (raíz, 45 líneas — **incompleto, expandir**)
- `backend/.env.example` — Variables de entorno completas del backend (112 líneas)
- `backend/requirements.txt` — Dependencias Python (53 líneas)
- `frontend/package.json` — Dependencias Node (59 líneas)
- `docker-compose.yml` — Orquestación de servicios (crear si no existe)
- `backend/Dockerfile` — Imagen del backend (crear si no existe)
- `frontend/Dockerfile` — Imagen del frontend (crear si no existe)
- `.dockerignore` — Exclusiones de contexto Docker (crear si no existe)

---

## Agente: Security Reviewer

**Especialidad:** Ciberseguridad, análisis de código, OWASP.

**Contexto:** Agente de auditoría read-only. Leer siempre `CONTEXT.md` (raíz) antes de cualquier tarea para entender el stack, la arquitectura, y las decisiones de seguridad del proyecto.

**Instrucciones:**
- Leer `CONTEXT.md` (raíz) antes de cualquier revisión — sin excepción
- **Nunca modificar código** — solo reportar hallazgos y sugerir remediaciones
- Revisar que ningún endpoint exponga credenciales, tokens, contraseñas o datos sensibles en respuestas (body, headers, logs)
- Verificar que los endpoints de bloqueo/desbloqueo de IP (`/api/mikrotik/firewall/block`, `/api/mikrotik/firewall/unblock`) tengan validación estricta de input (formato IP, listas permitidas, sanitización)
- Asegurar que la configuración de CORS en `backend/main.py` no permita orígenes wildcard (`*`) en producción
- Reportar cualquier endpoint sin manejo de errores (try/except + `APIResponse.fail()`)
- Verificar que `verify=False` en llamadas HTTPS (Wazuh) esté documentado como riesgo aceptado de laboratorio y no se filtre a producción
- Revisar que las credenciales se carguen exclusivamente desde `config.py` → `.env`, nunca hardcodeadas
- Verificar que los WebSockets (7 endpoints en `main.py`) no expongan datos internos del servidor ni permitan inyección de comandos
- Comprobar que los schemas Pydantic validen todos los campos de entrada en endpoints que aceptan POST/PUT/DELETE
- Identificar endpoints sin rate limiting y documentar el riesgo de abuso
- Verificar que el logging con `structlog` no registre información sensible (contraseñas, tokens, datos PII)
- Revisar que la generación de reportes con IA no permita prompt injection a través de inputs del usuario
- Auditar `glpi_collector.py`: verifica que credenciales no se persistan en el JSON cache
- Reportar hallazgos clasificados por severidad: **Crítico**, **Alto**, **Medio**, **Bajo**, **Informativo**

**Archivos clave a auditar:**
- `CONTEXT.md` — Contexto obligatorio antes de auditar
- `backend/main.py` — Configuración CORS, middleware, montaje de 7 WebSockets
- `backend/config.py` — Carga de credenciales y configuración sensible
- `backend/routers/mikrotik.py` — Endpoints de firewall (bloqueo/desbloqueo)
- `backend/routers/wazuh.py` — Endpoints con datos de alertas y agentes
- `backend/routers/reports.py` — Generación de reportes IA + Telegram (prompt injection surface)
- `backend/routers/network.py` — CRUD de labels/groups (validación de input)
- `backend/routers/cli.py` — Ejecución de comandos remotos RouterOS (alto riesgo)
- `backend/services/mikrotik_service.py` — Conexión API MikroTik (credenciales)
- `backend/services/wazuh_service.py` — Conexión API Wazuh (tokens JWT, verify=False)
- `backend/services/ai_service.py` — Function calling y system prompts (prompt injection)
- `backend/services/glpi_collector.py` — Background sync con credenciales GLPI
- `backend/services/auth_provider.py` — Autenticación de usuarios hotspot
- `backend/schemas/` — Schemas de validación Pydantic (17 archivos, incluye `dhcp.py` y `cli.py`)
- `backend/routers/dhcp.py` — Endpoints DHCP Fase 1 + Fase 2 (29KB, superficie de bloqueo)
