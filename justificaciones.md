# Justificaciones Tecnológicas — NetShield Dashboard

> Documento que detalla la justificación de cada tecnología utilizada en el proyecto, incluyendo ventajas competitivas, alternativas descartadas, limitaciones conocidas y la relación costo-beneficio que justifica su adopción.

---

## 1. Lenguaje y Runtime

### Python 3.12+

**Rol en el proyecto:** Lenguaje del backend completo (API REST, WebSockets, servicios, IA, PDF).

**¿Por qué Python y no otro lenguaje?**

NetShield integra 8 servicios externos (MikroTik, Wazuh, CrowdSec, Suricata, GLPI, GeoIP, Anthropic, Telegram), cada uno con su propia API y protocolo. Python tiene librerías maduras y mantenidas para todos ellos — `routeros-api`, `httpx`, `geoip2`, `anthropic`, `python-telegram-bot` — mientras que en Go o Rust varias de estas integraciones requerirían escribir clientes desde cero o usar bindings inmaduros.

**Ventajas concretas en este proyecto:**
- Ecosistema de librerías para seguridad de redes sin rival (Wazuh, CrowdSec, Suricata, MaxMind tienen SDKs oficiales o community en Python)
- `asyncio` permite manejar 7 WebSockets concurrentes + 160 endpoints sin necesidad de threading manual
- Prototipado rápido: un solo desarrollador puede mantener 15 servicios + 15 routers + 10 modelos
- Integración directa con el SDK de Anthropic para function calling (el SDK de Python es el más maduro)

**Alternativas consideradas:**
- **Go:** Mejor rendimiento nativo y concurrencia, pero carece de librerías maduras para routeros-api, WeasyPrint, y el SDK de Anthropic es menos completo. Aumentaría el tiempo de desarrollo 3-4x para las integraciones
- **Node.js/TypeScript:** Unificaría el stack con el frontend, pero las librerías de seguridad de redes son significativamente menos maduras. No hay equivalente de `routeros-api` ni `geoip2` con el mismo nivel de soporte
- **Rust:** Rendimiento óptimo pero curva de aprendizaje alta y ecosistema de integraciones de seguridad casi inexistente

**Limitaciones toleradas:**
- **GIL (Global Interpreter Lock):** Limita el paralelismo CPU-bound. Se mitiga con `run_in_executor` para operaciones bloqueantes (routeros-api, WeasyPrint). Para el perfil I/O-bound de NetShield (llamadas HTTP, queries DB, WebSockets), el GIL no es cuello de botella
- **Rendimiento vs Go/Rust:** Python es ~10-50x más lento en cómputo puro. Aceptable porque el bottleneck real son las APIs externas (latencia de red), no el procesamiento local
- **Consumo de memoria:** Mayor que Go. Tolerable en un entorno de laboratorio con objetivo de 1000 usuarios, donde la memoria no es la restricción principal

---

## 2. Framework Web

### FastAPI 0.115

**Rol en el proyecto:** Framework web async para la API REST (15 routers, ~160 endpoints) y 7 WebSockets.

**¿Por qué FastAPI y no otro framework?**

NetShield necesita un framework que soporte nativamente: endpoints REST, WebSockets bidireccionales, validación de datos con Pydantic, documentación automática (Swagger), y async/await en todas las capas. FastAPI es el único framework Python que cumple los cinco requisitos sin plugins externos.

**Ventajas concretas en este proyecto:**
- **Validación automática:** Los 16 archivos de schemas Pydantic se integran nativamente. Cada request se valida sin código boilerplate
- **WebSockets nativos:** Los 7 endpoints WS (`/ws/traffic`, `/ws/alerts`, etc.) se definen con el mismo router que los REST, sin necesidad de un servidor separado
- **Swagger UI automático:** `/docs` genera documentación interactiva de los ~160 endpoints sin configuración. Crítico para debugging y para la colección Postman (104+ requests)
- **Async nativo:** `async def` en todos los endpoints permite que las llamadas concurrentes a Wazuh, CrowdSec, GLPI no bloqueen el servidor
- **Tipado:** La integración con Pydantic v2 garantiza type safety end-to-end (schema Python → respuesta JSON → tipo TypeScript)

**Alternativas consideradas:**
- **Django + DRF:** Más maduro para CRUD y admin, pero su soporte async es parcial (no WebSockets nativos, ORM sync by default). Requeriría Django Channels como dependencia separada para los 7 WS
- **Flask:** Liviano pero síncrono. No tiene WebSockets nativos ni validación integrada. Requeriría Flask-SocketIO + Marshmallow, duplicando dependencias
- **Litestar (ex-Starlite):** Similar a FastAPI pero ecosistema más pequeño y menos documentación. Riesgo de vendor lock-in en un proyecto que necesita estabilidad

**Limitaciones toleradas:**
- **No tiene ORM propio:** Requiere SQLAlchemy como dependencia separada. Aceptable porque SQLAlchemy es el ORM más maduro de Python y la integración async funciona correctamente
- **WebSocket management manual:** No incluye un pub/sub integrado. Cada WS tiene su propio `ConnectionManager`. Para 7 endpoints y escala de laboratorio, es manejable
- **Curva de aprendizaje en typing:** Los genéricos de Pydantic v2 + FastAPI pueden ser verbosos. Compensado por la reducción de bugs en runtime

---

## 3. Base de Datos

### SQLAlchemy 2.0 (async) + aiosqlite + SQLite

**Rol en el proyecto:** ORM async para 10 modelos (IPLabel, ActionLog, CustomView, TelegramReportConfig, etc.) con SQLite como motor.

**¿Por qué SQLite y no PostgreSQL?**

NetShield está en fase de laboratorio. SQLite elimina la dependencia de un servidor de base de datos externo, reduciendo la complejidad de deployment a cero configuración.

**Ventajas concretas en este proyecto:**
- **Zero-config:** No hay servidor de DB que instalar, configurar ni mantener. `netshield.db` se crea automáticamente al iniciar el backend
- **Portabilidad:** El archivo `.db` se puede copiar, respaldar o resetear con un `rm`. Ideal para un laboratorio donde se hacen pruebas destructivas
- **Migración trivial a PostgreSQL:** La arquitectura usa SQLAlchemy async con `DATABASE_URL` configurable. Migrar a PostgreSQL solo requiere cambiar la URL a `postgresql+asyncpg://...` e instalar `asyncpg`. Cero cambios en código
- **Rendimiento suficiente:** Los 10 modelos almacenan datos de configuración y auditoría (labels, action logs, vistas, configs Telegram), no datos de alta frecuencia. El volumen es bajo (cientos de registros, no millones)

**Alternativas consideradas:**
- **PostgreSQL:** Superior en concurrencia, JSONB, y full-text search. Pero agrega un servicio más al stack de laboratorio. Se implementará en producción cuando se necesite
- **MongoDB:** Flexible con JSON, pero agrega complejidad (otro servidor, otro paradigma). Los datos de NetShield son relacionales (IPGroup → IPGroupMember, TelegramReportConfig → TelegramMessageLog)
- **Redis como DB primaria:** Rápido pero volátil. Los action logs y configuraciones de Telegram deben persistir entre reinicios

**Limitaciones toleradas:**
- **Concurrencia limitada:** SQLite usa file-level locking. Con un solo backend y operaciones de escritura poco frecuentes (configs, logs), no es problema. Se convierte en limitante con múltiples workers en producción → migrar a PostgreSQL
- **Sin JSONB nativo:** Los campos `layout` y `widgets` de `CustomView` se almacenan como JSON string. Funciona correctamente para lectura/escritura completa, pero no permite queries parciales dentro del JSON
- **Sin replicación:** Aceptable en laboratorio. En producción, PostgreSQL con réplicas


---

## 4. Validación y Configuración

### Pydantic v2 + pydantic-settings

**Rol en el proyecto:** Validación de datos en 16 archivos de schemas + configuración centralizada desde `.env` (9 mock flags, credenciales, thresholds).

**¿Por qué Pydantic?**

FastAPI lo usa nativamente. Pero más allá de eso, NetShield tiene 16 archivos de schemas que definen contratos estrictos para 8 integraciones externas. Sin validación automática, cada endpoint necesitaría validación manual de IPs, puertos, formatos de cron, etc.

**Ventajas concretas:**
- **Validación en entrada:** `SecurityBlockIPRequest` valida formato IP, `TelegramReportConfigCreate` valida expresión cron, `VlanCreate` valida VLAN ID en rango 1-4094 — todo declarativo
- **Configuración tipada:** `config.py` con `pydantic-settings` carga 40+ variables de `.env` con tipos, defaults y validación. Los 9 mock flags (`should_mock_mikrotik`, etc.) son properties computadas con lógica OR
- **Serialización automática:** `APIResponse[T]` como envelope genérico serializa cualquier tipo a JSON sin código manual
- **Documentación:** Swagger UI genera esquemas automáticos de request/response desde los modelos Pydantic

**Alternativas consideradas:**
- **Marshmallow:** Maduro pero más verboso y no integrado nativamente con FastAPI. Requeriría adaptadores
- **attrs + cattrs:** Más liviano pero sin validación de datos tan completa ni integración con FastAPI
- **Validación manual:** Inviable con 16 archivos de schemas y ~160 endpoints

**Limitaciones toleradas:**
- **Verbosidad en schemas complejos:** Algunos schemas como `GlpiAsset` tienen 15+ campos. Aceptable porque la verbosidad garantiza type safety
- **Overhead de validación:** ~1-5ms por request. Insignificante comparado con las llamadas HTTP a servicios externos (~100-500ms)

---

## 5. Servidor ASGI

### Uvicorn 0.34 [standard]

**Rol en el proyecto:** Servidor ASGI que ejecuta la aplicación FastAPI, incluyendo HTTP y WebSockets.

**¿Por qué Uvicorn?**

Es el servidor ASGI recomendado oficialmente por FastAPI. El extra `[standard]` incluye `websockets`, `httptools` y `watchfiles` — las tres dependencias que NetShield necesita para WebSockets, parsing HTTP optimizado y hot-reload en desarrollo.

**Ventajas concretas:**
- **WebSockets incluidos:** `uvicorn[standard]` instala `websockets` automáticamente. Los 7 WS endpoints funcionan sin configuración adicional
- **Hot-reload:** `--reload` detecta cambios en archivos Python y reinicia el servidor. Crítico para desarrollo de 15 servicios
- **Rendimiento:** `httptools` (parser HTTP en C) y `uvloop` (event loop en C) se activan automáticamente con `[standard]`

**Alternativas consideradas:**
- **Hypercorn:** Soporta HTTP/2, pero menos adoptado y documentado. HTTP/2 no es necesario en un dashboard de laboratorio que corre en localhost
- **Daphne:** Creado para Django Channels. No aporta ventajas con FastAPI
- **Gunicorn + Uvicorn workers:** Para producción con múltiples workers. En fase de laboratorio, un solo worker es suficiente

**Limitaciones toleradas:**
- **Single worker por defecto:** Un solo proceso. Suficiente para laboratorio. En producción, usar Gunicorn como process manager con múltiples Uvicorn workers

---

## 6. Cliente HTTP Async

### httpx 0.28

**Rol en el proyecto:** Cliente HTTP async para comunicación con Wazuh (JWT auth, alertas, agentes), CrowdSec (LAPI, CTI), GLPI (REST API), y servicios que requieren llamadas HTTP desde el backend.

**¿Por qué httpx y no requests?**

NetShield es 100% async. Un `await httpx.get()` no bloquea el event loop, permitiendo que otros requests y WebSockets se procesen simultáneamente. Con `requests`, cada llamada HTTP bloquearía todo el servidor hasta completarse.

**Ventajas concretas:**
- **Async nativo:** `async with httpx.AsyncClient() as client:` se integra directamente con `async def` de FastAPI sin `run_in_executor`
- **API compatible con requests:** La migración desde `requests` es trivial (misma API de `get`, `post`, `put`, `delete`)
- **Timeouts granulares:** Configurable por request. Wazuh tiene timeout de 30s, CrowdSec de 10s
- **`verify=False` para certificados autofirmados:** Wazuh en laboratorio usa cert autofirmado. httpx lo soporta nativamente

**Alternativas consideradas:**
- **requests:** Síncrono. Cada llamada bloquearía el event loop. Solo se usa en `glpi_collector.py` (background task aislado vía `asyncio.to_thread`)
- **aiohttp:** Async pero API diferente a requests y menos intuitiva. httpx tiene mejor DX (developer experience)

**Limitaciones toleradas:**
- **`verify=False` en Wazuh:** Riesgo de MITM. Documentado como decisión de laboratorio. En producción, usar certificados válidos
- **Sin connection pooling explícito:** httpx maneja pools internamente. Suficiente para el volumen de requests del laboratorio

---

## 7. Integraciones de Seguridad

### routeros-api 0.17

**Rol en el proyecto:** Cliente para la API RouterOS de MikroTik CHR. Gestiona interfaces, ARP, firewall, VLANs, logs, health, hotspot y ejecución de comandos.

**¿Por qué routeros-api?**

Es la única librería Python mantenida para la API nativa de RouterOS (protocolo propietario en puerto 8728). La alternativa sería implementar el protocolo desde cero o usar SSH (más lento y menos estructurado).

**Ventajas concretas:**
- **API tipada:** `get_resource("/interface").get()` devuelve listas de diccionarios con los mismos campos que la CLI de RouterOS
- **CRUD completo:** Soporta `print`, `add`, `set`, `remove` sobre cualquier recurso RouterOS
- **Connection pooling:** `RouterOsApiPool` mantiene una conexión persistente reutilizable

**Limitaciones toleradas:**
- **100% síncrono:** Bloquea el thread. Se ejecuta en `run_in_executor` dentro de un singleton con `asyncio.Lock`. El lock garantiza una sola operación MikroTik a la vez (limitación de RouterOS)
- **SyntaxWarning de escape sequences:** Warning inofensivo en Python 3.12+. Se ignora
- **Sin soporte TLS nativo:** Usa `plaintext_login=True`. Solo aceptable en red de laboratorio. En producción, usar API-SSL en puerto 8729

### geoip2 4.8 + cachetools 5.5

**Rol en el proyecto:** Geolocalización local de IPs usando bases de datos MaxMind GeoLite2 (.mmdb) con cache en RAM.

**¿Por qué GeoIP local y no un servicio web?**

NetShield enriquece cada decisión CrowdSec y alerta Wazuh con datos geográficos. Esto puede ser cientos de lookups por minuto. Un servicio web (ipinfo.io, ipapi.com) tendría latencia de red + rate limits + costos. GeoLite2 local hace lookups en microsegundos sin límites.

**Ventajas concretas:**
- **Latencia cero:** Lookup en RAM vs ~100ms de API externa
- **Sin rate limits:** Miles de lookups/segundo sin restricciones
- **Sin costos:** GeoLite2 es gratuito (registro en MaxMind)
- **TTLCache(10000, ttl=3600):** Las 10K IPs más consultadas se cachean 1 hora, evitando re-lecturas del .mmdb
- **Datos completos:** País, ciudad, coordenadas, ASN, tipo de red (ISP/Hosting/Datacenter/Tor)

**Limitaciones toleradas:**
- **Actualización manual:** Las DBs se actualizan semanalmente en MaxMind. Requiere re-descarga periódica. Para un laboratorio, actualización mensual es suficiente
- **Precisión limitada:** GeoLite2 (gratuito) tiene menor precisión que GeoIP2 (pago) a nivel ciudad. A nivel país (que es lo más usado en NetShield para geo-blocking), la precisión es >99%

### anthropic 0.42 (SDK Claude)

**Rol en el proyecto:** Generación de reportes de seguridad con IA y respuesta a consultas en lenguaje natural vía Telegram bot.

**¿Por qué Claude y no GPT-4 o Llama?**

Claude soporta function calling nativo, permitiendo que el modelo decida qué datos consultar en runtime. NetShield define 8 tools (get_wazuh_alerts, get_crowdsec_decisions, get_mikrotik_traffic, etc.) y Claude los invoca según el prompt del usuario, iterando hasta 10 veces.

**Ventajas concretas:**
- **Function calling robusto:** Claude invoca tools, recibe resultados, y genera reportes contextualizados sin prompts engineeringcomplejos
- **4 system prompts por audiencia:** executive, technical, operational, telegram — cada uno adapta el tono y profundidad
- **Context window grande:** Puede procesar respuestas de múltiples tools (alertas + decisiones + tráfico) en una sola generación
- **SDK Python oficial:** `anthropic.Anthropic()` con tipos, retry integrado y streaming

**Alternativas consideradas:**
- **OpenAI GPT-4:** Function calling comparable, pero el SDK de Anthropic tiene mejor integración con Python typing y el modelo es más consistente en seguir system prompts de seguridad
- **Llama local:** Eliminaría costos de API, pero requiere GPU (no disponible en el laboratorio) y el function calling de modelos open-source es significativamente menos confiable
- **Sin IA:** Los reportes serían templates estáticos. La IA permite reportes adaptativos que cambian según el estado actual de la red

**Limitaciones toleradas:**
- **Costo por request:** ~$0.01-0.05 por reporte. Aceptable para uso de laboratorio (decenas de reportes/día). El modo mock elimina costos durante desarrollo
- **Latencia:** 3-15 segundos por reporte con function calling. Aceptable para reportes on-demand, no para datos en tiempo real
- **Dependencia externa:** Sin internet, no hay reportes IA. El mock system genera reportes estáticos como fallback

### python-telegram-bot 22+ y apscheduler 3.10+

**Rol en el proyecto:** Bot bidireccional de Telegram (alertas outbound + consultas IA inbound) y scheduler de reportes automáticos con expresiones cron.

**¿Por qué python-telegram-bot (PTB)?**

Es el SDK más maduro y mantenido para Telegram Bot API en Python. Soporta async nativo (v20+), lo que se integra directamente con el event loop de FastAPI.

**Ventajas concretas:**
- **Async nativo:** `await bot.send_message()` no bloquea el event loop
- **Bidireccional:** Outbound (alertas, resúmenes, reportes) + inbound (consultas en lenguaje natural → Claude AI → respuesta)
- **APScheduler:** Permite programar reportes con expresiones cron (ej: "todos los lunes a las 8am"). Sincroniza jobs desde SQLite cada minuto

**Alternativas consideradas:**
- **Telethon:** Más potente (soporta userbot), pero excesivo para un bot simple. Mayor complejidad de autenticación
- **aiogram:** Alternativa async madura, pero PTB tiene más documentación y comunidad
- **Webhook vs polling:** NetShield usa webhook inbound para recibir mensajes. Más eficiente que polling para un bot que no recibe miles de mensajes/hora

**Limitaciones toleradas:**
- **Dependencia de Telegram:** Si Telegram cae, no hay notificaciones. Aceptable porque es un canal complementario, no el primario (el dashboard web siempre está disponible)
- **Rate limits de Telegram:** 30 mensajes/segundo globales. Suficiente para un laboratorio. En producción con múltiples usuarios, implementar queue


---

## 8. Logging, Resiliencia y Utilidades Backend

### structlog 24.4

**Rol en el proyecto:** Logging estructurado en todos los servicios y routers. Console en desarrollo, JSON en producción.

**¿Por qué structlog y no logging estándar?**

NetShield tiene 15 servicios que se comunican con 8 sistemas externos. Cuando algo falla, necesitamos saber: qué servicio, qué operación, qué IP, qué error, en qué timestamp. `structlog` agrega contexto automáticamente a cada log sin concatenar strings.

**Ventajas concretas:**
- **Contexto automático:** `log.info("blocked_ip", ip=ip, source="crowdsec", duration=3600)` genera logs con campos parseables
- **Dual renderer:** `ConsoleRenderer` colorido en dev para legibilidad, `JSONRenderer` en prod para ingesta en ELK/Loki
- **Sin `print()`:** Convención del proyecto. Todos los logs pasan por structlog para consistencia

**Alternativas consideradas:**
- **logging estándar:** Funcional pero requiere formatters manuales para logs estructurados. Sin contexto automático
- **loguru:** API más simple pero menos control sobre el formato de salida. No soporta JSON rendering tan limpiamente

**Limitaciones toleradas:**
- **Overhead mínimo:** ~0.1ms por log. Insignificante

### tenacity 9.0

**Rol en el proyecto:** Reintentos con backoff exponencial para conexiones a servicios externos (MikroTik, Wazuh, CrowdSec).

**¿Por qué tenacity?**

Los servicios externos del laboratorio son inestables (MikroTik CHR en VM, Wazuh con cert autofirmado, CrowdSec en localhost). Sin retry automático, un timeout temporal se propaga como error al usuario.

**Ventajas concretas:**
- **Decorador declarativo:** `@retry(wait=wait_exponential(min=1, max=10), stop=stop_after_attempt(3))` — una línea
- **Backoff exponencial:** 1s → 2s → 4s → ... → 10s máximo. Evita saturar un servicio que está recuperándose
- **Compatible con async:** Funciona con `async def` nativo

**Alternativas consideradas:**
- **Retry manual con `for`/`try`:** Funcional pero código repetitivo en 15 servicios. Tenacity lo centraliza
- **backoff (librería):** Similar pero menos adoptada y sin integración con async tan madura

### orjson 3.10

**Rol en el proyecto:** Serialización/deserialización JSON de alto rendimiento para las respuestas de la API.

**¿Por qué orjson y no json estándar?**

Los endpoints de widgets agregan datos de múltiples fuentes (Wazuh + CrowdSec + Suricata + GeoIP). Los payloads pueden ser de 50-200KB. orjson serializa 3-10x más rápido que `json` estándar.

**Ventajas concretas:**
- **3-10x más rápido:** Escrito en Rust, compilado como extensión C
- **Soporte nativo de dataclasses y datetime:** No requiere custom encoders
- **Drop-in:** `orjson.dumps()` reemplaza `json.dumps()` sin cambios de API

**Limitaciones toleradas:**
- **Dependencia compilada:** Requiere wheel binario o compilación en Rust. Los wheels precompilados están disponibles para Linux/macOS/Windows

### WeasyPrint 63.1 + Jinja2 3.1

**Rol en el proyecto:** Generación de reportes PDF profesionales desde HTML. El flujo es: Claude AI → HTML → TipTap editor → Jinja2 template → WeasyPrint → bytes PDF.

**¿Por qué WeasyPrint?**

NetShield genera reportes de seguridad exportables como PDF con portada, estilos CSS, tablas y gráficos. WeasyPrint renderiza HTML/CSS a PDF con fidelidad, incluyendo fuentes, colores y layout.

**Ventajas concretas:**
- **CSS completo:** Soporta flexbox, grid, @page, headers/footers — el template `report_base.html` usa CSS moderno
- **Jinja2 integrado:** La plantilla HTML recibe variables dinámicas (título, fecha, contenido del reporte)
- **Python puro:** No requiere navegador headless (a diferencia de Puppeteer/Playwright)

**Alternativas consideradas:**
- **Puppeteer/Playwright:** Renderizado más fiel (Chrome real), pero requiere instalar Chromium (~400MB) en el servidor
- **reportlab:** Más control pixel-perfect, pero requiere programar el layout en Python en vez de HTML/CSS
- **fpdf2:** Liviano pero sin soporte CSS. Los reportes se verían básicos

**Limitaciones toleradas:**
- **CPU-bound:** La generación de PDF bloquea el thread. Se ejecuta en `run_in_executor`. Un reporte tarda ~2-5 segundos
- **Dependencias del sistema:** Requiere `libpango`, `libcairo`, `libgdk-pixbuf`. Se instalan con `apt install` en el laboratorio

---

## 9. Frontend — Framework y Bundler

### React 19

**Rol en el proyecto:** Framework UI para el dashboard completo: 21 rutas, 80+ componentes, 38 custom hooks, 53 widgets, 7 WebSockets en tiempo real.

**¿Por qué React y no Vue/Svelte/Angular?**

NetShield tiene un sistema de widgets dinámicos donde `WidgetRenderer` mapea 53 tipos a sus componentes correspondientes. React con su modelo de composición (componentes como funciones + hooks) es ideal para este patrón de dispatch dinámico.

**Ventajas concretas:**
- **Ecosistema gigante:** TanStack Query, Recharts, TipTap, @dnd-kit, Lucide — todas las librerías que NetShield usa tienen soporte first-class para React
- **Hooks:** Los 38 custom hooks (`useWazuhSummary`, `useCrowdSecDecisions`, `useSuricataAlerts`, etc.) encapsulan data fetching + state + side effects en una API composable
- **React 19:** Concurrent features mejoran la UX de componentes pesados (WidgetRenderer con 53 widgets, ViewBuilderPage con drag-and-drop)
- **Comunidad:** Facilita encontrar soluciones a problemas específicos y reclutar colaboradores

**Alternativas consideradas:**
- **Vue 3:** Excelente reactividad y DX, pero el ecosistema de librerías de visualización (Recharts, TipTap React, @dnd-kit) es más maduro en React
- **Svelte/SvelteKit:** Mejor rendimiento en bundle size, pero ecosistema de componentes más limitado. No hay equivalente de @dnd-kit o TipTap con el mismo nivel de madurez
- **Angular:** Demasiado verbose para un proyecto de un solo desarrollador. El boilerplate de módulos/servicios/inyección de dependencias ralentizaría el desarrollo

**Limitaciones toleradas:**
- **Bundle size:** React + ReactDOM pesan ~45KB gzip. Aceptable para un dashboard de intranet que no necesita optimizar para 3G
- **Re-renders innecesarios:** Con 7 WebSockets actualizando datos cada 2-10 segundos, pueden ocurrir re-renders excesivos. Se mitiga con `React.memo`, `useMemo` y la normalización de TanStack Query

### Vite 8

**Rol en el proyecto:** Bundler y dev server con hot module replacement (HMR), proxy a backend, y build optimizado.

**¿Por qué Vite?**

NetShield tiene 120+ archivos frontend. Vite usa ESM nativo en desarrollo (sin bundling), lo que da HMR instantáneo (<100ms) incluso con un proyecto grande.

**Ventajas concretas:**
- **HMR instantáneo:** Cambiar un componente se refleja en el navegador en <100ms, sin recargar la página
- **Proxy integrado:** `vite.config.ts` redirige `/api/*` → `localhost:8000` y `/ws/*` → `ws://localhost:8000`. Elimina configuración CORS en desarrollo
- **Build optimizado:** Code splitting automático, tree shaking, minificación con esbuild
- **Plugin ecosystem:** `@tailwindcss/vite` y `@vitejs/plugin-react` se integran sin configuración adicional

**Alternativas consideradas:**
- **Webpack:** Más configuración, HMR más lento, config complejo. Vite hace lo mismo con menos configuración
- **Turbopack:** Promete ser más rápido, pero está en beta y acoplado a Next.js
- **esbuild directo:** Rapidísimo pero sin HMR ni proxy integrado

**Limitaciones toleradas:**
- **Menos configuración = menos control:** Para casos edge (custom loaders, module federation), Webpack ofrece más flexibilidad. NetShield no necesita esos features

### TypeScript 5.9

**Rol en el proyecto:** Tipado estático en todo el frontend. `types.ts` (~39KB) espeja los schemas Pydantic del backend.

**¿Por qué TypeScript?**

Con 15+ namespaces de API, 38 hooks, 80+ componentes y 53 widgets, JavaScript sin tipos haría el proyecto inmantenible. TypeScript atrapa errores en compile-time que en JS serían bugs en runtime.

**Ventajas concretas:**
- **Contratos API tipados:** `APIResponse<WazuhAlert[]>` garantiza que el frontend consume las mismas estructuras que el backend produce
- **Refactoring seguro:** Renombrar un campo en `types.ts` muestra todos los componentes afectados instantáneamente
- **Autocompletado:** En un proyecto con 15 APIs y 53 widgets, el autocompletado de TypeScript es productividad directa
- **Errores en compile-time:** `tsc -b && vite build` falla si hay incompatibilidades de tipos, antes de llegar a producción

**Limitaciones toleradas:**
- **Overhead de tipos:** Mantener `types.ts` (~39KB) sincronizado con los schemas Pydantic es trabajo manual. Se tolera porque el beneficio de type safety supera el costo de mantenimiento
- **Complejidad en genéricos:** Algunos tipos como `WidgetConfig` con uniones discriminadas son verbosos. Aceptable para la safety que proveen

---

## 10. Estilos

### TailwindCSS v4

**Rol en el proyecto:** Sistema de estilos con tokens custom (`@theme`), clases utilitarias y componentes CSS reutilizables (`glass-card`, `btn-primary`, `badge-critical`, etc.).

**¿Por qué TailwindCSS v4 y no CSS puro o CSS-in-JS?**

NetShield tiene 6 temas visuales, 80+ componentes y un design system con variables semánticas (brand, surface, severity). TailwindCSS v4 permite definir tokens en CSS nativo vía `@theme` sin `tailwind.config.js`, y las clases utilitarias aceleran el desarrollo de layouts responsivos.

**Ventajas concretas:**
- **`@theme` con CSS nativo:** Los tokens de color (`--color-brand-*`, `--color-severity-*`, `--color-surface-*`) se definen en `index.css` y se usan tanto desde clases Tailwind como desde CSS custom
- **6 temas sin JS:** Cada tema override las variables CSS via `[data-theme="navy"]`, sin runtime JavaScript
- **Clases reutilizables:** `glass-card` (glassmorphism), `stat-card`, `data-table`, `badge-critical` — definidas una vez en `index.css`, usadas en 80+ componentes
- **`@tailwindcss/vite`:** Integración zero-config con Vite. Sin postcss.config.js ni tailwind.config.js

**Alternativas consideradas:**
- **CSS Modules:** Buen scoping pero sin design system integrado. Cada componente necesitaría su propio archivo CSS
- **styled-components/Emotion:** CSS-in-JS con buen DX pero overhead de runtime (~12KB) y peor rendimiento con 53 widgets renderizándose dinámicamente
- **CSS puro:** Máximo control pero desarrollo más lento. Sin utilidades de spacing, flexbox, grid que Tailwind provee out-of-the-box

**Limitaciones toleradas:**
- **`index.css` de 121KB:** El design system creció significativamente con 6 temas + clases custom + animaciones. Se comprime a ~15KB gzip. Aceptable para un dashboard de intranet
- **Curva de aprendizaje:** Las clases utilitarias de Tailwind pueden ser confusas para desarrolladores nuevos. Mitigado con la documentación de clases en `frontend/CONTEXT.md`

---

## 11. Data Fetching y Estado

### TanStack Query 5 (React Query)

**Rol en el proyecto:** Fetching, cache, sincronización y invalidación de datos para los 38 hooks y 53 widgets.

**¿Por qué TanStack Query y no SWR o fetch manual?**

NetShield tiene datos que se actualizan a diferentes frecuencias: tráfico cada 2s (WebSocket), alertas cada 5s, GeoIP lookup cacheable 1 hora, configuraciones casi estáticas. TanStack Query maneja todas estas frecuencias con `staleTime`, `refetchInterval` e invalidación selectiva.

**Ventajas concretas:**
- **Cache inteligente:** `queryKey: ['wazuh-alerts']` cachea el resultado. Si 3 widgets consumen las mismas alertas, solo se hace 1 request
- **Invalidación selectiva:** `queryClient.invalidateQueries({ queryKey: ['crowdsec-decisions'] })` después de un `useMutation` de bloqueo/desbloqueo refresca solo las decisiones
- **Retry automático:** `retry: 2` con backoff. Si Wazuh tarda en responder, TanStack Query reintenta sin código manual
- **DevTools:** Panel de debugging que muestra el estado de cada query (loading, stale, error, data)
- **Mutations con optimistic updates:** Al bloquear una IP, la UI se actualiza inmediatamente sin esperar la respuesta del backend

**Alternativas consideradas:**
- **SWR:** Similar pero sin mutations integradas ni DevTools tan completos. Para un proyecto con CRUD intensivo (GLPI tickets, portal users, CrowdSec whitelist), las mutations de TanStack Query son esenciales
- **Redux Toolkit Query:** Más verbose, requiere boilerplate de slices y store. TanStack Query es más ligero para un proyecto donde el estado global es minimal (la mayoría del estado es server state, no client state)
- **fetch manual + useState:** Funcional para 1-2 endpoints, inviable para 38 hooks con cache, retry, polling y invalidación

**Limitaciones toleradas:**
- **Memory footprint:** El cache en memoria crece con cada query. Con `staleTime: 5000` y `gcTime` por defecto de 5 minutos, las queries inactivas se limpian automáticamente
- **Complejidad de query keys:** Con 20+ query keys, la invalidación cruzada puede ser confusa. Documentado en `frontend/CONTEXT.md`

### Axios 1.14

**Rol en el proyecto:** Cliente HTTP centralizado en `services/api.ts` (~37KB). Todos los 15+ namespaces de API lo usan.

**¿Por qué Axios y no fetch nativo?**

NetShield tiene un patrón de API consistente: `baseURL: '/api'`, timeout 30s, envelope `APIResponse<T>`, unwrap con `.then(r => r.data)`. Axios permite configurar estos defaults una sola vez.

**Ventajas concretas:**
- **Instancia configurada:** `axios.create({ baseURL: '/api', timeout: 30000 })` — todos los namespaces heredan la configuración
- **Interceptors:** Se pueden agregar interceptors para logging, auth headers, o manejo de errores global sin modificar cada namespace
- **Cancelación:** `AbortController` integrado para cancelar requests en desmontaje de componentes

**Alternativas consideradas:**
- **fetch nativo:** Sin instancia configurable, sin timeout nativo, sin interceptors. Requeriría un wrapper custom que replicaría lo que Axios ya provee
- **ky:** Más moderno y basado en fetch, pero menos adoptado. El equipo ya está familiarizado con Axios

**Limitaciones toleradas:**
- **Bundle size:** ~14KB gzip. Aceptable para un dashboard de intranet. `fetch` nativo ahorraría esos 14KB pero a costa de más código custom

---

## 12. Visualización y UI

### Recharts 3.8

**Rol en el proyecto:** Gráficos interactivos: AreaChart de tráfico en vivo (WebSocket), LineChart de sesiones, BarChart de alertas, timeline de correlación, donut de protocolos.

**¿Por qué Recharts y no D3 directo o Chart.js?**

Recharts es una capa React declarativa sobre D3. Los gráficos se definen como componentes JSX (`<AreaChart>`, `<Line>`, `<Tooltip>`), lo que se integra naturalmente con el modelo de React y los hooks de datos.

**Ventajas concretas:**
- **Declarativo:** `<AreaChart data={trafficData}><Area dataKey="rx_bps" /></AreaChart>` — no hay código imperativo de D3
- **Responsive:** `<ResponsiveContainer>` adapta los gráficos al tamaño del widget automáticamente
- **Tooltips y legends:** Integrados sin configuración. Crítico para un dashboard donde cada datapoint necesita contexto
- **Actualización en tiempo real:** Los gráficos de tráfico (WebSocket cada 2s) se actualizan fluidamente al cambiar el prop `data`

**Alternativas consideradas:**
- **D3.js directo:** Máximo control pero API imperativa que no encaja con React. Cada gráfico requeriría refs y `useEffect` manuales
- **Chart.js + react-chartjs-2:** Buena opción pero menos flexible en customización de tooltips y animaciones
- **Nivo:** Hermosos gráficos pero bundle size grande y API más rígida

**Limitaciones toleradas:**
- **Rendimiento con datos grandes:** Recharts puede ser lento con >1000 puntos. Los gráficos de NetShield muestran ventanas de tiempo limitadas (últimos 30 puntos de tráfico, últimas 24h de alertas), manteniendo el rendimiento
- **Bundle size:** ~50KB gzip. Aceptable dado que es la librería de visualización principal

### TipTap 3.22 (7 paquetes @tiptap/*)

**Rol en el proyecto:** Editor de texto enriquecido para reportes. El usuario puede editar el HTML generado por Claude AI antes de exportar a PDF.

**¿Por qué TipTap y no Quill o Draft.js?**

TipTap es el editor WYSIWYG más moderno para React. Basado en ProseMirror, soporta extensiones modulares. NetShield usa 7 paquetes: starter-kit, react, color, highlight, text-align, text-style, underline.

**Ventajas concretas:**
- **Extensible:** Cada funcionalidad (color, highlight, alignment) es un paquete separado que se importa solo si se necesita
- **HTML nativo:** El output es HTML limpio que se pasa directamente a Jinja2 + WeasyPrint para PDF
- **React integration:** `useEditor()` hook se integra con el modelo de React sin wrappers complejos

**Alternativas consideradas:**
- **Quill:** Más simple pero menos extensible y con problemas de mantenimiento (desarrollo lento)
- **Draft.js:** Creado por Meta pero API compleja y ecosistema fragmentado
- **CKEditor 5:** Potente pero licencia comercial para features avanzados

### @dnd-kit (core + sortable + utilities)

**Rol en el proyecto:** Drag-and-drop en ViewBuilderPage para arrastrar widgets del catálogo al grid del dashboard.

**¿Por qué @dnd-kit?**

Es la librería de drag-and-drop más moderna para React, con soporte para keyboard navigation, touch, y sortable lists. El ViewBuilder permite arrastrar 53 tipos de widgets a un grid configurable.

**Ventajas concretas:**
- **Accesibilidad:** Keyboard navigation integrada (WCAG 2.1)
- **Sortable:** Reordenamiento de widgets en el grid con animación suave
- **Modular:** `core` (3KB) + `sortable` (2KB) + `utilities` (1KB) — solo se importa lo necesario

**Alternativas consideradas:**
- **react-beautiful-dnd:** Deprecated por Atlassian. No se mantiene activamente
- **react-dnd:** API más compleja (backends, monitors, connectors). @dnd-kit es más simple para el caso de uso de grid + sortable
- **HTML5 Drag API:** Nativa pero sin soporte touch, sin animaciones, sin accesibilidad

### d3-geo + topojson-client + world-atlas

**Rol en el proyecto:** Mapa mundial de amenazas (WorldThreatMap widget) con intensidad de color por país.

**¿Por qué d3-geo y no una librería de mapas completa?**

NetShield solo necesita un mapa coroplético (coloreado por país) sin tiles, zooming, ni markers. `d3-geo` con proyección `geoMercator` + datos TopoJSON del `world-atlas` cubre este caso con ~20KB vs ~200KB de Leaflet.

**Alternativas consideradas:**
- **Leaflet/MapLibre:** Mapas interactivos completos con tiles. Excesivo para un mapa estático de intensidad por país
- **react-simple-maps:** Wrapper de d3-geo más simple pero menos control sobre la proyección y colores

### Lucide React 1.7

**Rol en el proyecto:** Iconografía consistente en sidebar (19 ítems), topbar, badges, botones y widgets.

**¿Por qué Lucide y no Font Awesome o Heroicons?**

Lucide es tree-shakeable: solo se incluyen los iconos importados. Con ~50 iconos usados en NetShield, el bundle incluye solo esos 50, no los 1000+ del set completo.

**Alternativas consideradas:**
- **Font Awesome:** Popular pero bundle grande (~60KB) si se importa completo. La versión tree-shakeable requiere paquetes pro
- **Heroicons:** Buen set pero más limitado en variedad (300 vs 1500+ de Lucide)
- **Material Icons:** Estilo Google que no encaja con la estética glassmorphic del dashboard

### React Router DOM 7.13

**Rol en el proyecto:** Enrutamiento SPA para 21 rutas, incluyendo rutas dinámicas (`/views/:id`) y redirect legacy (`/vlans` → `/network`).

**Ventajas:** Estándar de facto para routing en React. Soporta nested routes, params dinámicos, redirects.

**Alternativa descartada:** TanStack Router — más moderno pero ecosistema más pequeño y migración costosa.

### clsx + date-fns + html5-qrcode

- **clsx (2.1):** Composición condicional de clases CSS. `clsx('btn', isPrimary && 'btn-primary')`. Alternativa: template literals manuales (más verboso).
- **date-fns (4.1):** Formateo de fechas con tree-shaking. Alternativa: `Intl.DateTimeFormat` nativo (menos ergonómico) o moment.js (deprecated, 70KB).
- **html5-qrcode (2.3):** Scanner QR para identificar activos GLPI con la cámara. Alternativa: integración manual con MediaDevices API (significativamente más código).

---

## 13. Resumen de relación costo-beneficio

| Tecnología | Mayor beneficio | Mayor limitación | ¿Se tolera? |
|---|---|---|---|
| Python 3.12 | Ecosistema de integraciones de seguridad | GIL + rendimiento vs Go | ✅ I/O-bound, GIL no es bottleneck |
| FastAPI | Async + WS + Pydantic + Swagger nativos | Sin ORM propio | ✅ SQLAlchemy lo cubre |
| SQLite | Zero-config, portabilidad | Concurrencia limitada | ✅ Laboratorio, migratable a PostgreSQL |
| Pydantic v2 | Validación declarativa de 16 schemas | Verbosidad | ✅ Type safety > brevedad |
| httpx | Async nativo, compatible con requests | verify=False en lab | ✅ Documentado, producción usará certs |
| routeros-api | Único cliente Python para RouterOS | Síncrono (run_in_executor) | ✅ Lock + executor mitigan |
| geoip2 + cachetools | Microsegundos, sin rate limits | Actualización manual de DBs | ✅ Mensual es suficiente |
| anthropic SDK | Function calling robusto | Costo por request, latencia | ✅ Mock en dev, on-demand en prod |
| python-telegram-bot | Async, bidireccional | Dependencia de Telegram | ✅ Canal complementario |
| structlog | Logs estructurados con contexto | Curva de aprendizaje | ✅ Docs internas |
| tenacity | Retry declarativo | Overhead mínimo | ✅ Esencial para servicios inestables |
| orjson | 3-10x más rápido que json | Dependencia compilada | ✅ Wheels disponibles |
| WeasyPrint | CSS completo en PDF | CPU-bound, deps del sistema | ✅ run_in_executor mitiga |
| React 19 | Ecosistema, hooks, composición | Bundle size ~45KB | ✅ Dashboard de intranet |
| Vite 8 | HMR instantáneo, proxy, zero-config | Menos control que Webpack | ✅ No necesitamos control granular |
| TypeScript 5.9 | Type safety en 80+ componentes | Mantener types.ts manualmente | ✅ Safety > esfuerzo |
| TailwindCSS v4 | @theme nativo, 6 temas, utilidades | index.css 121KB | ✅ ~15KB gzip |
| TanStack Query 5 | Cache, retry, invalidación, mutations | Memory footprint | ✅ gcTime limpia queries inactivas |
| Axios | Instancia configurada, interceptors | 14KB gzip | ✅ Menos código custom |
| Recharts 3 | Declarativo, responsive, real-time | Lento con >1000 puntos | ✅ Ventanas de datos limitadas |
| TipTap 3 | Extensible, HTML output, React hooks | 7 paquetes | ✅ Solo se importa lo necesario |
| @dnd-kit | Accesible, modular, sortable | API específica | ✅ Mejor que react-beautiful-dnd (deprecated) |
| d3-geo | Mapa ligero (~20KB) | Sin interactividad avanzada | ✅ Solo necesitamos coroplético |
| Lucide React | Tree-shakeable, 1500+ iconos | Estilo específico | ✅ Consistente con diseño glassmorphic |

---

*Documento generado: 2026-05-25*
*Basado en: NetShield Dashboard v2.4*
*Tecnologías analizadas: 25 principales + 5 utilidades*
