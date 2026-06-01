# Patrones de Arquitectura y Diseño — NetShield Dashboard

> Documento que analiza los patrones arquitectónicos y de diseño de software empleados en el proyecto, justificando cada decisión con su contexto, ventajas, alternativas descartadas, limitaciones y relación costo-beneficio.

---

## 1. Arquitectura General

### Monolito Modular (Backend) + SPA (Frontend)

**Descripción:** El backend es una única aplicación FastAPI que expone REST + WebSockets. El frontend es una Single Page Application React que consume esa API. No hay microservicios, no hay BFF (Backend for Frontend), no hay API Gateway.

**¿Por qué monolito y no microservicios?**

NetShield integra 8 servicios externos pero es desarrollado y operado por un solo desarrollador. Un monolito modular permite: un solo proceso que desplegar, un solo log que leer, un solo debug que hacer. La modularidad interna (15 routers + 15 servicios + 16 schemas) da la separación de responsabilidades de microservicios sin la complejidad operacional.

**Ventajas concretas en este proyecto:**
- **Un solo proceso:** `python main.py` levanta REST + 7 WebSockets + background tasks (GLPI collector, Telegram scheduler). Sin orquestación de contenedores
- **Comunicación directa entre servicios:** `SuricataService` puede llamar a `CrowdSecService` y `MikroTikService` en el auto-response circuit sin HTTP interno ni message broker
- **Transacciones simples:** ActionLog se escribe en la misma DB que las vistas y configs de Telegram. Sin sagas ni eventual consistency
- **Refactoring local:** Cambiar el schema de Wazuh afecta `schemas/wazuh.py` → `services/wazuh_service.py` → `routers/wazuh.py`, todos en el mismo codebase

**Alternativas consideradas:**
- **Microservicios:** Un servicio por integración (ms-mikrotik, ms-wazuh, ms-crowdsec...). Beneficio: escalado independiente. Costo: 8+ servicios que desplegar, service discovery, tracing distribuido, circuit breakers — complejidad desproporcionada para un laboratorio con un solo desarrollador
- **Modular monolith con módulos Python:** Separar en paquetes Python instalables (`netshield-mikrotik`, `netshield-wazuh`). Beneficio: versionado independiente. Costo: overhead de packaging sin beneficio real cuando todo se despliega junto
- **Serverless (Lambda/Cloud Functions):** Cada endpoint como función independiente. Incompatible con WebSockets persistentes y conexiones singleton (MikroTik, Wazuh)

**Limitaciones toleradas:**
- **Escalado vertical solamente:** Un monolito escala agregando CPU/RAM, no replicando servicios individuales. Para el objetivo de 1000 usuarios concurrentes, un servidor moderno con Uvicorn + múltiples workers es suficiente
- **Acoplamiento temporal:** Si `MikroTikService` se cuelga en una operación bloqueante mal manejada, puede afectar otros servicios en el mismo proceso. Mitigado con `run_in_executor` + timeouts + `asyncio.Lock`
- **Deploy atómico:** Todo se despliega junto. Un bug en el router de phishing obliga a redesplegar los 15 routers. Aceptable en fase de laboratorio con deploy manual

---

### Separación Frontend-Backend con API REST + WebSocket

**Descripción:** El frontend (React/Vite en `:5173`) y el backend (FastAPI/Uvicorn en `:8000`) son aplicaciones independientes comunicadas por HTTP REST y WebSocket. En desarrollo, Vite proxea `/api/*` y `/ws/*` al backend.

**¿Por qué separación y no SSR (Next.js/Nuxt)?**

NetShield es un dashboard de monitoreo en tiempo real, no un sitio web público. No necesita SEO, no necesita server-side rendering, no necesita hidratación. La separación total permite: desarrollar backend y frontend independientemente, elegir el mejor stack para cada uno (Python para integraciones de seguridad, React para UI interactiva), y escalar cada capa según demanda.

**Ventajas concretas:**
- **Desarrollo independiente:** El backend se puede probar con Postman/Swagger sin frontend. El frontend se puede desarrollar con `MOCK_ALL=true` sin infraestructura real
- **Stack óptimo por capa:** Python con sus librerías de seguridad en backend, React con su ecosistema de UI en frontend
- **API como contrato:** Los 16 archivos de schemas Pydantic + el `types.ts` del frontend definen un contrato explícito. Cualquier cambio incompatible se detecta en compile-time (TypeScript) o runtime (Pydantic validation)
- **Proxy de Vite:** En desarrollo, `vite.config.ts` proxea todo al backend. Sin configuración CORS manual. En producción, un reverse proxy (Nginx) serviría los estáticos y proxearía la API

**Alternativas consideradas:**
- **Next.js (SSR + API Routes):** Unificaría frontend y backend en un solo framework JS/TS. Pero perdería las librerías Python de seguridad (routeros-api, geoip2, anthropic). Requeriría reescribir 15 servicios en TypeScript
- **Django + templates:** Server-side rendering con Python. Sin WebSockets nativos, sin la reactividad de React para 7 feeds en tiempo real, sin el ecosistema de componentes (Recharts, TipTap, @dnd-kit)
- **HTMX:** Enfoque hipermedia progresivo. Elegante para CRUD pero inadecuado para 7 WebSockets en tiempo real, drag-and-drop de widgets, y gráficos interactivos

**Limitaciones toleradas:**
- **Dos procesos en desarrollo:** Hay que correr `python main.py` y `npm run dev` simultáneamente. Mitigado con scripts o docker-compose (pendiente)
- **Duplicación de tipos:** `types.ts` (~39KB) espeja `schemas/` (~16 archivos). No hay generación automática de tipos. Se mantiene manualmente. El costo de mantenimiento se tolera porque la type safety compensa

---

## 2. Patrones del Backend

### Singleton con Factory Function

**Descripción:** Los 12 servicios con estado (MikroTikService, WazuhService, CrowdSecService, etc.) usan el patrón Singleton implementado como variable de módulo + función factory.

```python
# services/mikrotik_service.py
_instance: Optional[MikroTikService] = None

def get_mikrotik_service() -> MikroTikService:
    global _instance
    if _instance is None:
        _instance = MikroTikService()
    return _instance
```

**¿Por qué Singleton y no inyección de dependencias?**

Cada servicio mantiene una conexión persistente a un sistema externo (API RouterOS, cliente httpx con JWT, bouncer LAPI, etc.). Crear una nueva instancia por request significaría: nueva conexión TCP, nueva autenticación, nuevo handshake — overhead inaceptable cuando MikroTik tiene límite bajo de sesiones y Wazuh usa JWT con refresh.

**Ventajas concretas:**
- **Conexión persistente:** `MikroTikService` mantiene una sola conexión `RouterOsApiPool` compartida por todos los endpoints y WebSockets
- **Estado compartido:** `WazuhService` cachea el JWT token y lo refresca cuando expira. Todos los endpoints usan el mismo token sin re-autenticarse
- **Inicialización lazy:** El servicio se crea solo cuando se necesita por primera vez, no al importar el módulo
- **Cleanup centralizado:** En el lifespan de FastAPI, `shutdown` llama a cada singleton para cerrar conexiones

**Excepción al patrón:**
- **`AIService` NO es singleton:** Se crea una instancia por llamada. Cada reporte de IA acumula contexto de function calling (tools invocados, resultados parciales) que no debe compartirse entre requests concurrentes

**Alternativas consideradas:**
- **Dependency Injection con FastAPI `Depends()`:** Más testeable y explícito. Pero `Depends()` solo funciona en routers, no en WebSocket handlers ni en background tasks (GLPI collector, Telegram scheduler). Los servicios se necesitan en contextos donde `Depends()` no aplica
- **Registry pattern:** Un objeto central que registra todos los servicios. Agrega indirección sin beneficio claro. El import directo de `get_X_service()` es más simple y explícito
- **Class-level singleton (`__new__`):** Patrón Python más "puro" pero menos explícito. La variable de módulo es más fácil de entender y debuggear

**Limitaciones toleradas:**
- **Estado global:** Los singletons son estado global mutable. Si un test modifica el estado de `MikroTikService`, afecta a otros tests. Mitigable con fixtures de reset en pytest
- **Testabilidad reducida:** No se puede inyectar un mock fácilmente via constructor. Compensado por el sistema de mock guards interno (`if settings.should_mock_X`)

---

### Mock Guard Pattern

**Descripción:** Al inicio de cada método público de servicio, un guard verifica si el servicio debe operar en modo simulado. Si es así, retorna datos mock inmediatamente sin contactar al sistema externo.

```python
# services/wazuh_service.py
async def get_alerts(self, limit=20, level_min=0):
    if settings.should_mock_wazuh:
        return MockData.wazuh.alerts(limit, level_min)
    # ... lógica real con httpx
```

**¿Por qué mock guards en servicios y no en routers?**

Los WebSockets (7 endpoints en `main.py`) no pasan por los routers. Si los guards estuvieran en los routers, los WebSockets seguirían intentando conectarse a MikroTik, Wazuh, etc. en modo mock. Al ponerlos en la capa de servicio, toda ruta de código (REST, WebSocket, background task) respeta el modo mock.

**Ventajas concretas:**
- **Cobertura total:** REST endpoints, WebSocket handlers y background tasks (GLPI collector, Telegram scheduler) respetan el mock sin duplicar lógica
- **Granularidad por servicio:** `MOCK_MIKROTIK=true` con `MOCK_WAZUH=false` permite operar MikroTik simulado con Wazuh real. Los 9 flags son independientes
- **`MOCK_ALL` como override:** Un solo flag activa mock en todos los servicios. Cada property `should_mock_X` hace OR entre `_effective_mock_all` y `mock_X`
- **Datos coherentes:** `mock_data.py` (139KB, seed=42) define IPs, agentes y assets coherentes entre servicios (ej: `192.168.88.10` existe en ARP, Wazuh y GLPI)
- **CRUD en memoria:** `mock_service.py` mantiene estado mutable para operaciones de escritura (crear ticket GLPI, agregar decisión CrowdSec, etc.)

**Alternativas consideradas:**
- **Middleware que intercepta requests:** Un middleware podría detectar `MOCK_*` y redirigir la respuesta. Pero no funcionaría para WebSockets ni background tasks
- **Mock a nivel de librería (unittest.mock):** Para tests unitarios es ideal, pero para desarrollo local interactivo necesitamos datos persistentes y coherentes, no mocks efímeros
- **Servidor mock separado (WireMock, Mockoon):** Requeriría replicar las APIs de MikroTik, Wazuh, CrowdSec, etc. con sus protocolos específicos. Inviable para 8 servicios con protocolos distintos
- **Feature flags con LaunchDarkly:** Excesivo para un laboratorio. Los flags en `.env` + `pydantic-settings` son suficientes

**Limitaciones toleradas:**
- **Datos estáticos:** Los mocks de `mock_data.py` no reflejan cambios dinámicos reales. Los WebSocket mocks simulan variación con funciones `tick()` que generan datos pseudoaleatorios (seed=42)
- **139KB de mock data:** Archivo grande. Aceptable porque es un repositorio centralizado que evita datos mock dispersos en 15 servicios
- **Mock guard como primera línea de código:** Cada método público tiene un `if` adicional. Overhead cognitivo mínimo porque es un patrón reconocible y consistente en los 12 servicios

---

### Envelope Pattern (APIResponse)

**Descripción:** Todos los endpoints REST devuelven un envelope genérico `APIResponse[T]` con la estructura `{success: bool, data: T | null, error: string | null}`.

```python
# schemas/common.py
class APIResponse(BaseModel, Generic[T]):
    success: bool
    data: Optional[T] = None
    error: Optional[str] = None

    @classmethod
    def ok(cls, data: T) -> "APIResponse[T]":
        return cls(success=True, data=data)

    @classmethod
    def fail(cls, error: str) -> "APIResponse":
        return cls(success=False, data=None, error=error)
```

**¿Por qué envelope y no HTTP status codes puros?**

El frontend tiene un patrón uniforme para manejar respuestas: `if (res.success) { /* usar res.data */ } else { /* mostrar res.error */ }`. No necesita interpretar 10 status codes diferentes ni hacer `try/catch` de errores de Axios. Además, el backend nunca lanza excepciones 500 no controladas — todo error se captura y envuelve en `APIResponse.fail()`.

**Ventajas concretas:**
- **Contrato uniforme:** Los 160 endpoints devuelven la misma estructura. El frontend no necesita lógica de parsing diferente por endpoint
- **Errores descriptivos:** `APIResponse.fail("MikroTik: Connection timed out after 30s")` es más informativo que un HTTP 500 genérico
- **Type safety end-to-end:** `APIResponse[WazuhAlert[]]` en Python se espeja como `APIResponse<WazuhAlert[]>` en TypeScript. El tipo genérico `T` fluye del backend al frontend
- **Nunca HTTP 500:** El patrón `try/except → APIResponse.fail(str(e))` en cada endpoint garantiza que el servidor siempre responde con JSON válido, incluso ante errores internos

**Alternativas consideradas:**
- **HTTP status codes puros (RESTful):** 200, 201, 400, 404, 500 con body específico por código. Más semántico, pero el frontend necesitaría múltiples handlers y el error message dependería del format del body que varía por framework
- **Problem Details (RFC 9457):** Estándar para errores HTTP. Más formal pero agrega complejidad sin beneficio para un proyecto con un solo consumidor (el frontend React)
- **GraphQL errors:** Modelo de errores parciales. Excesivo cuando cada endpoint retorna un solo tipo de dato

**Limitaciones toleradas:**
- **HTTP 200 para errores:** Un `APIResponse.fail()` retorna HTTP 200 con `success: false`. Esto dificulta el monitoreo basado en status codes (ej: alertas por tasa de 5xx). Aceptable en laboratorio donde el monitoreo es visual (badge mock + topbar status dots)
- **Sin error codes numéricos:** El campo `error` es un string libre, no un código tipado. El frontend muestra el mensaje directamente. Para i18n o manejo granular de errores, se necesitarían error codes

---

### Repository Pattern (Mock Data + Mock Service)

**Descripción:** Los datos mock se organizan en dos capas: `mock_data.py` (repositorio de datos estáticos, 139KB) y `mock_service.py` (facade CRUD en memoria, 20KB). Los servicios reales solo necesitan consultar `MockData.X.funcion()` o `MockService.X_action()` sin conocer la estructura interna de los mocks.

**¿Por qué dos archivos y no inline en cada servicio?**

Con 8 servicios mockeables, poner datos mock inline crearía duplicación e inconsistencia. `mock_data.py` centraliza los datos con un seed fijo (42) para reproducibilidad. `mock_service.py` agrega estado mutable para CRUD (crear tickets, bloquear IPs, etc.).

**Ventajas concretas:**
- **Coherencia entre servicios:** La IP `192.168.88.10` aparece en ARP (MikroTik), agente 004 (Wazuh) y asset `PC-Lab-01` (GLPI) — todo definido en un solo archivo
- **Reproducibilidad:** `seed=42` genera los mismos datos en cada ejecución. Útil para tests visuales y screenshots
- **CRUD mutable:** `mock_service.py` permite crear/editar/eliminar entidades en memoria durante una sesión de desarrollo, simulando flujos reales completos

**Alternativas consideradas:**
- **Fixtures JSON:** Archivos `.json` por servicio. Más limpios pero sin lógica de generación dinámica (WebSocket ticks) ni CRUD mutable
- **Factory pattern (factory_boy):** Generación de datos más sofisticada pero overhead de dependencia para mock data estático
- **Base de datos de test:** SQLite separada con datos de prueba. No cubriría los servicios externos (MikroTik, Wazuh, CrowdSec)

**Limitaciones toleradas:**
- **Archivo de 139KB:** `mock_data.py` es el archivo más grande del proyecto. Aceptable como repositorio centralizado vs dispersar datos en 15 archivos

---

### Async Bridge Pattern (run_in_executor / asyncio.to_thread)

**Descripción:** Las librerías síncronas (`routeros-api`, `WeasyPrint`, `requests`) se ejecutan en el thread pool del executor para no bloquear el event loop async de FastAPI.

```python
# services/mikrotik_service.py — _api_call()
result = await asyncio.get_event_loop().run_in_executor(
    None,  # default thread pool
    lambda: resource.get()
)
```

**¿Por qué este patrón?**

El backend es 100% async (`async def` en endpoints, `await` en llamadas HTTP/DB). Pero `routeros-api` es síncrono — una llamada `resource.get()` bloquearía el event loop, congelando todos los WebSockets y requests concurrentes. `run_in_executor` mueve la operación bloqueante a un thread del pool, liberando el event loop.

**Ventajas concretas:**
- **No bloquea el event loop:** Mientras MikroTik procesa una operación (50-200ms), el servidor sigue atendiendo WebSockets y otros requests
- **Thread pool reutilizado:** El pool por defecto de asyncio crea threads bajo demanda (máx ~CPU*5). Sin overhead de crear/destruir threads
- **Compatible con `asyncio.Lock`:** `MikroTikService` usa un lock que se adquiere antes de ejecutar en el executor, serializando las operaciones RouterOS (limitación de la API)

**Dónde se usa:**
| Componente | Librería síncrona | Método de bridge |
|---|---|---|
| `MikroTikService._api_call()` | `routeros-api` | `run_in_executor` + `asyncio.Lock` |
| `PDFService.generate()` | `WeasyPrint` | `run_in_executor` (CPU-bound) |
| `GlpiCollector._collect_sync()` | `requests` | `asyncio.to_thread` |

**Alternativas consideradas:**
- **Reescribir las librerías en async:** Inviable. `routeros-api` implementa un protocolo propietario. WeasyPrint es un renderizador C
- **Proceso separado (ProcessPoolExecutor):** Mayor aislamiento pero overhead de IPC. Solo justificable si WeasyPrint corriera continuamente (no es el caso — se genera un PDF por solicitud)
- **Celery para tareas pesadas:** Requiere Redis/RabbitMQ como broker. Overhead de infraestructura excesivo para el volumen del laboratorio

**Limitaciones toleradas:**
- **GIL comparte el thread pool:** En CPython, los threads no dan paralelismo CPU-bound real. Para I/O-bound (routeros-api esperando red), el GIL se libera durante las llamadas de socket, permitiendo concurrencia efectiva
- **Serialización con Lock:** `MikroTikService` usa `asyncio.Lock`, lo que serializa todas las operaciones MikroTik. Solo un thread ejecuta routeros-api a la vez. Aceptable porque RouterOS tiene límite bajo de sesiones concurrentes

---

### Lazy Import Pattern (Cross-Service Calls)

**Descripción:** Cuando un servicio necesita llamar a otro, el import se hace dentro de la función, no al inicio del módulo.

```python
# services/suricata_service.py
async def trigger_auto_response(self, ip: str, ...):
    # Lazy imports para evitar circular imports
    from services.crowdsec_service import get_crowdsec_service
    from services.mikrotik_service import get_mikrotik_service
    
    crowdsec = get_crowdsec_service()
    mikrotik = get_mikrotik_service()
    await crowdsec.add_decision(ip, ...)
    await mikrotik.block_ip(ip, ...)
```

**¿Por qué lazy imports?**

NetShield tiene dependencias circulares: `SuricataService` → `CrowdSecService` → `GeoIPService` ← `WazuhService` → `MikroTikService`. Si los imports fueran top-level, Python fallaría con `ImportError: circular import`.

**Ventajas concretas:**
- **Resuelve circular imports sin refactoring:** No requiere crear interfaces abstractas ni un módulo mediador
- **Cero overhead en runtime:** El módulo ya está cargado en `sys.modules` después del primer import. Los lazy imports subsecuentes son O(1) — solo un lookup en diccionario
- **Explícito:** Al leer el código, se ve exactamente qué servicios se usan en cada función, proporcionando documentación implícita de dependencias

**Alternativas consideradas:**
- **Mediator pattern:** Un `ServiceMediator` que coordina las llamadas entre servicios. Agrega una capa de indirección sin beneficio claro para 3-4 cross-service calls
- **Event bus:** Desacopla emisor y receptor. Pero el auto-response de Suricata necesita respuestas síncronas (¿se bloqueó la IP exitosamente?). Un event bus sería fire-and-forget
- **Refactoring para eliminar ciclos:** Reestructurar el grafo de dependencias. Posible pero requiere esfuerzo significativo sin beneficio proporcional

**Limitaciones toleradas:**
- **Imports ocultos:** Las dependencias no son visibles en el top del archivo. Mitigado por la consistencia del patrón — siempre es `from services.X import get_X_service` dentro de la función

---

## 3. Patrones del Frontend

### Custom Hook per Data Source

**Descripción:** Cada fuente de datos tiene exactamente un custom hook que encapsula el fetching, cache, polling y mutations con TanStack Query.

```typescript
// hooks/useCrowdSecDecisions.ts
export function useCrowdSecDecisions() {
  const queryClient = useQueryClient();
  
  const { data, isLoading } = useQuery({
    queryKey: ['crowdsec-decisions'],
    queryFn: crowdsecApi.getDecisions,
    refetchInterval: 30_000,
  });

  const addDecision = useMutation({
    mutationFn: crowdsecApi.addDecision,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['crowdsec-decisions'] }),
  });

  return { decisions: data?.data ?? [], isLoading, addDecision };
}
```

**¿Por qué un hook por fuente de datos?**

NetShield tiene 38 hooks de datos. Si la lógica de fetching estuviera directamente en los componentes, habría duplicación masiva: 5 componentes que consumen decisiones CrowdSec repetirían la misma query con la misma key, el mismo interval, y el mismo unwrapping de `APIResponse`.

**Ventajas concretas:**
- **DRY:** `useCrowdSecDecisions()` se llama en `DecisionsTable`, `CommandCenter`, `NotificationPanel`, `SyncStatusBanner`, y widgets — todos comparten el mismo cache
- **Encapsulación:** El componente no sabe que hay polling cada 30s, ni que el retry es 2, ni que la queryKey es `['crowdsec-decisions']`. Solo recibe `decisions`, `isLoading`, `addDecision`
- **Mutations centralizadas:** `addDecision.mutate(...)` invalida el cache automáticamente. Todos los componentes que muestran decisiones se actualizan sin coordinación manual
- **Testabilidad:** El hook se puede testear independientemente del componente que lo consume

**Alternativas consideradas:**
- **Fetching directo en componentes:** `useQuery` inline en cada componente. Funciona si solo un componente consume el dato, pero causa duplicación cuando 5+ componentes comparten la misma fuente
- **Context + Provider:** `CrowdSecProvider` que wrappea toda la app. Excesivo — TanStack Query ya es un cache global. No se necesita un segundo nivel de estado global
- **Redux slices:** Un slice por dominio. Más boilerplate (actions, reducers, selectors) para lograr lo mismo que `useQuery` con invalidación automática

**Limitaciones toleradas:**
- **38 archivos de hooks:** Muchos archivos pero cada uno tiene una responsabilidad clara. La alternativa (hooks combinados) haría archivos grandes e inmanejables

---

### Centralized API Client (Namespace Pattern)

**Descripción:** Todas las llamadas HTTP al backend están centralizadas en `services/api.ts` (~37KB), organizadas en 15+ namespaces.

```typescript
// services/api.ts
const api = axios.create({ baseURL: '/api', timeout: 30000 });

export const crowdsecApi = {
  getDecisions: () => api.get<APIResponse<CrowdSecDecision[]>>('/crowdsec/decisions').then(r => r.data),
  addDecision: (data: ManualDecisionRequest) => api.post<APIResponse<any>>('/crowdsec/decisions', data).then(r => r.data),
  // ...
};

export const wazuhApi = { ... };
export const mikrotikApi = { ... };
// 15+ namespaces
```

**¿Por qué centralizado?**

Con 160 endpoints del backend, tener `fetch()` o `axios.get()` dispersos en 80+ componentes sería inmantenible. Si la URL de un endpoint cambia, habría que buscar y reemplazar en múltiples archivos. El archivo centralizado es el único punto de contacto con el backend.

**Ventajas concretas:**
- **Single source of truth:** Si `/api/crowdsec/decisions` cambia a `/api/v2/crowdsec/decisions`, se modifica una sola línea en `api.ts`
- **Tipado consistente:** Cada función retorna `APIResponse<T>` con el tipo correcto. El compilador TypeScript detecta incompatibilidades
- **Unwrapping uniforme:** `.then(r => r.data)` se hace una vez por función, no en cada componente
- **Interceptors globales:** Logging, auth headers, error handling se configuran en la instancia `api` una sola vez

**Alternativas consideradas:**
- **Fetch directo en hooks:** `useQuery({ queryFn: () => fetch('/api/...') })`. Pierde la tipificación centralizada y la configuración de instancia
- **Generación automática desde OpenAPI:** Generar el cliente desde el schema Swagger de FastAPI. Ideal pero requiere tooling adicional (openapi-generator) y configuración de CI
- **tRPC:** Type safety end-to-end sin generación de código. Requiere que el backend use tRPC también (Node.js), incompatible con FastAPI

**Limitaciones toleradas:**
- **Archivo de 37KB:** Grande pero navigable con búsqueda. Los namespaces actúan como tabla de contenidos
- **Mantenimiento manual:** Cada endpoint nuevo requiere agregar la función en `api.ts`. Sin generación automática

---

### Component-per-Domain Organization

**Descripción:** Los componentes se agrupan en carpetas por dominio funcional: `security/`, `crowdsec/`, `suricata/`, `inventory/`, `portal/`, `reports/`, `views/`, `widgets/`, etc.

**¿Por qué por dominio y no por tipo (pages/, components/, containers/)?**

NetShield tiene 80+ componentes. Agrupar por tipo (`pages/`, `components/`, `containers/`) crearía carpetas con 20+ archivos sin relación semántica. Agrupar por dominio permite navegar el codebase como si fueran módulos independientes.

**Ventajas concretas:**
- **Cohesión:** `crowdsec/` contiene los 13 componentes que solo se usan en las páginas de CrowdSec. Si CrowdSec se eliminara, se borra una carpeta
- **Descubrimiento:** Un nuevo desarrollador busca "dónde está la UI de Suricata" → `components/suricata/` (4 páginas)
- **Aislamiento:** Cambios en `inventory/AssetDetail.tsx` no afectan a `crowdsec/DecisionsTable.tsx`

**Alternativas consideradas:**
- **Atomic Design (atoms/molecules/organisms):** Buen framework conceptual pero agrega overhead de clasificación. ¿Un `DecisionsTable` es un organismo o una molécula?
- **Feature modules (como Angular):** Cada feature con su routing, services, components. En React, los hooks + api.ts ya cumplen esa función sin la formalidad de módulos

---

### Widget Architecture (Catalog + Renderer + Hook)

**Descripción:** El sistema de 53 widgets usa una arquitectura de 3 capas:
1. **Catálogo server-driven:** El backend define qué widgets existen, su categoría y schema de config (`GET /api/views/widgets/catalog`)
2. **Hook de datos:** `hooks/widgets/{category}/index.ts` define un hook por widget que fetchea y combina datos de las APIs existentes
3. **WidgetRenderer dispatcher:** Un componente central (22KB) con un `switch(widget.type)` que mapea tipo → componente React

```
Backend Catalog → ViewBuilder (drag-and-drop) → ViewDetail → WidgetRenderer → Widget Component → Hook → API
```

**¿Por qué server-driven catalog?**

Si el catálogo estuviera hardcodeado en el frontend, agregar un widget requeriría un deploy del frontend. Con catálogo server-driven, el backend puede agregar widgets sin cambiar código frontend (solo agregar el case en WidgetRenderer y el componente).

**Ventajas concretas:**
- **Extensibilidad:** Agregar un widget nuevo = 5 pasos documentados: hook → componente → export → case en Renderer → catálogo backend
- **Categorización:** 4 categorías (Standard, Visual, Technical, Hybrid) con tabs en el ViewBuilder. El usuario encuentra widgets por función, no por nombre
- **Desacoplamiento:** Cada widget es independiente. `ThreatGauge` no sabe que `WorldThreatMap` existe. Comparten datos solo vía query cache de TanStack Query
- **Datos multi-fuente:** Los hooks hybrid usan `Promise.allSettled()` para combinar datos de 2-3 APIs con manejo de fallo parcial (si Wazuh falla, el widget muestra datos parciales de CrowdSec)

**Alternativas consideradas:**
- **Plugin system con dynamic import:** `import(`./widgets/${type}`)`. Más flexible pero pierde type safety y dificulta tree-shaking
- **Config-driven rendering (JSON → UI):** El backend define la UI completa en JSON. Máxima flexibilidad pero pierde la riqueza de componentes React custom (animaciones, SVG, interactividad)
- **iFrames por widget:** Aislamiento total pero peso de múltiples React instances y pérdida de tema compartido

**Limitaciones toleradas:**
- **Switch de 53 cases en WidgetRenderer:** Archivo de 22KB. No es elegante pero es explícito y fácil de debuggear. Un registry pattern reduciría líneas pero agregaría indirección
- **No hay lazy loading de widgets:** Todos los 53 componentes se importan estáticamente. El bundle incluye todos aunque una vista use solo 5. Para 53 widgets medianos, el impacto en bundle (~200KB) es aceptable en intranet

---

### WebSocket Hook with Reconnection

**Descripción:** `useWebSocket(url)` es un hook genérico que abre una conexión WebSocket, parsea mensajes JSON, y reconecta automáticamente con backoff exponencial.

```typescript
const { isConnected, lastMessage } = useWebSocket('/ws/traffic');
// Reconexión: delay = min(1000 * 2^intentos, 30000ms)
```

**¿Por qué un hook genérico y no uno por WebSocket?**

Los 7 WebSockets del backend tienen el mismo protocolo: JSON messages a intervalos fijos. La única diferencia es la URL y la frecuencia. Un hook genérico evita duplicar la lógica de conexión, parsing y reconexión 7 veces.

**Ventajas concretas:**
- **Reconexión automática:** Si el backend se reinicia, el hook reconecta sin intervención del usuario. Backoff exponencial evita saturar el servidor
- **Reutilizable:** 7 WebSockets, un solo hook. Cada componente solo llama `useWebSocket('/ws/X')`
- **Limpieza automática:** El hook cierra la conexión al desmontar el componente (return del useEffect)

**Alternativas consideradas:**
- **Socket.IO:** Abstracción de alto nivel con rooms, namespaces, fallback a polling. Excesivo para 7 feeds unidireccionales simples
- **Server-Sent Events (SSE):** Más simple que WebSockets para feeds unidireccionales. Pero WebSocket es bidireccional (necesario para futuros comandos desde el frontend) y ya está implementado en el backend

---

### Theme System (CSS Custom Properties + data-theme)

**Descripción:** 6 temas visuales implementados con CSS custom properties y el atributo `data-theme` en `<html>`. El hook `useTheme()` persiste la selección en localStorage.

```css
/* index.css */
[data-theme="navy"] {
  --color-surface-50: #0d1117;
  --color-brand-500: #2f81f7;
  /* ... */
}
```

**¿Por qué CSS vars y no JavaScript theming?**

Las CSS custom properties son nativas del navegador — cambiar el tema es instantáneo (un `setAttribute` en el DOM) sin re-render de React. Con JavaScript theming (styled-components, Emotion), cambiar el tema dispararía un re-render de los 53 widgets y 80+ componentes.

**Ventajas concretas:**
- **Zero re-renders:** Cambiar tema = `document.documentElement.setAttribute('data-theme', 'navy')`. Ningún componente React se re-renderiza
- **CSS puro:** Los temas son CSS plano. Un diseñador puede agregar un 7mo tema sin tocar JavaScript
- **Anti-FOUC:** El hook lee de localStorage antes del primer paint, evitando flash de tema incorrecto
- **Font scale integrado:** `--font-scale` permite 4 tamaños de fuente (0.875 a 1.25) con un solo CSS var

**Alternativas consideradas:**
- **CSS-in-JS theming (ThemeProvider):** Re-renders al cambiar tema. Inaceptable con 7 WebSockets actualizando datos en tiempo real
- **Clase CSS por tema (`.theme-dark`):** Similar a `data-theme` pero los atributos data son más semánticos y facilitan selectores CSS
- **prefers-color-scheme only:** Solo claro/oscuro. NetShield tiene 6 temas específicos (OLED, Navy, Purple, Arctic, Light, Sepia)

---

## 4. Patrones de Comunicación

### Polling + WebSocket Dual Strategy

**Descripción:** NetShield usa dos estrategias de actualización de datos simultáneamente:
- **WebSocket (7 endpoints):** Para datos de alta frecuencia (tráfico 2s, alertas 5s, decisiones 10s)
- **REST + polling con TanStack Query:** Para datos de baja frecuencia (health 30s, GeoIP 1h, configs on-demand)

**¿Por qué dual y no solo WebSocket o solo polling?**

El tráfico de red cambia cada 2 segundos — polling HTTP a esa frecuencia generaría overhead de conexiones. Las configuraciones de Telegram cambian una vez por semana — un WebSocket permanente para eso desperdiciaría recursos del servidor.

**Ventajas concretas:**
- **Eficiencia:** WebSocket para datos frecuentes (sin overhead de HTTP handshake por cada update). REST polling para datos infrecuentes (sin WebSocket idle)
- **Resilencia:** Si un WebSocket se desconecta, los datos REST siguen disponibles. El dashboard nunca está completamente ciego
- **Cache diferenciada:** TanStack Query cachea los datos REST con `staleTime` por tipo. Los WebSockets siempre muestran el último dato recibido

**Alternativas consideradas:**
- **Solo WebSocket:** Un WebSocket multiplexado para todo. Simplifica la comunicación pero complica el cache (TanStack Query no gestiona WebSockets nativamente)
- **Solo polling:** Sin WebSockets. Funcional pero el tráfico en tiempo real requeriría polling a 2s — 30 requests/minuto por cliente por feed. Con 7 feeds: 210 requests/minuto por usuario
- **SSE para feeds + REST para CRUD:** Viable pero SSE no es bidireccional. WebSocket permite futura extensión (ej: pausar/filtrar feed desde el frontend)

---

### Cross-Service Coordination (Auto-Response Circuit)

**Descripción:** Cuando Suricata detecta una amenaza, el circuito de auto-response coordina acciones entre múltiples servicios:

```
Suricata detecta amenaza
    → SuricataService.trigger_auto_response()
        → ActionLog (registra en DB)
        → CrowdSecService.add_decision() (ban en LAPI)
        → MikroTikService.block_ip() (regla firewall)
```

**¿Por qué coordinación directa y no event-driven?**

El circuito necesita feedback síncrono: "¿se bloqueó la IP exitosamente en MikroTik?". Si `block_ip()` falla, el frontend debe saberlo inmediatamente para mostrar un error en el `ConfirmModal`. Un event bus fire-and-forget no daría esta garantía.

**Ventajas concretas:**
- **Feedback inmediato:** El endpoint devuelve `APIResponse.ok()` o `APIResponse.fail()` con el resultado de toda la cadena
- **Transaccionalidad parcial:** Si CrowdSec ban tiene éxito pero MikroTik falla, el error se reporta y el ActionLog registra el estado parcial
- **Guard humano:** `ConfirmModal` en el frontend requiere confirmación antes de ejecutar. El auto-trigger sin confirmación está deshabilitado por defecto

**Alternativas consideradas:**
- **Event bus (Redis Pub/Sub):** Desacopla servicios pero pierde feedback síncrono. ¿Cómo sabe el frontend que el bloqueo se completó?
- **Saga pattern:** Rollback automático si un paso falla. Complejidad excesiva para 3 pasos en un laboratorio
- **Webhook chain:** Cada servicio notifica al siguiente vía HTTP. Overhead de configuración y debugging distribuido

---

## 5. Resumen de Patrones y Relación Costo-Beneficio

| Patrón | Beneficio principal | Limitación principal | ¿Se tolera? |
|---|---|---|---|
| Monolito modular | Un proceso, comunicación directa | Escalado solo vertical | ✅ Lab, 1000 users en un server |
| SPA + API separada | Stack óptimo por capa, independencia | Dos procesos en dev | ✅ Scripts/docker-compose |
| Singleton + factory | Conexiones persistentes, estado compartido | Estado global, menos testeable | ✅ Mock guards compensan |
| Mock guard en servicios | Cobertura total (REST, WS, background) | Datos estáticos, 139KB | ✅ Seed=42 da reproducibilidad |
| APIResponse envelope | Contrato uniforme, nunca 500 | HTTP 200 para errores | ✅ Monitoreo visual en lab |
| Repository mock (mock_data) | Coherencia entre 8 servicios | Archivo grande | ✅ Centralizado > disperso |
| Async bridge (run_in_executor) | No bloquea event loop | GIL limita CPU-bound | ✅ Todo es I/O-bound |
| Lazy imports | Resuelve circular imports | Imports ocultos | ✅ Patrón consistente |
| Hook per data source | DRY, cache compartido, mutations | 38 archivos | ✅ Responsabilidad clara |
| Centralized API client | Single source, tipado, unwrapping | 37KB, manual | ✅ Mantenible con namespaces |
| Component-per-domain | Cohesión, descubrimiento | Carpetas numerosas | ✅ Navigable |
| Widget catalog + renderer | Extensible, categorizado, desacoplado | Switch de 53 cases | ✅ Explícito > indirecto |
| WebSocket + reconnection | Automático, genérico, limpio | Solo unidireccional hoy | ✅ Extensible a bidireccional |
| CSS vars theming | Zero re-renders, 6 temas, anti-FOUC | CSS var overhead mínimo | ✅ Nativo del navegador |
| Polling + WebSocket dual | Eficiente, resiliente | Dos estrategias a mantener | ✅ Cada una en su nicho |
| Auto-response circuit | Feedback síncrono, guard humano | Acoplamiento directo | ✅ Solo 3 servicios en cadena |

---

*Documento generado: 2026-05-25*
*Basado en: NetShield Dashboard v2.4*
*Patrones analizados: 16 principales*
