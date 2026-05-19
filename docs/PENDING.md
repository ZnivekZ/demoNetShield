# NetShield v2.4 — Auditoría Completa & Roadmap de Pendientes

> **Generado:** 2026-04-28  
> **Alcance:** Backend (routers, services, models, schemas), Frontend (api.ts, hooks, components, types), Documentación, Infraestructura  
> **Método:** Lectura exhaustiva archivo por archivo. El código fue la fuente de verdad.

---

## Índice

1. [🔴 CRÍTICOS — Bugs que rompen funcionalidad](#1--críticos--bugs-que-rompen-funcionalidad)
2. [🟠 ALTOS — Endpoints faltantes / funciones no implementadas](#2--altos--endpoints-faltantes--funciones-no-implementadas)
3. [🟡 MEDIOS — Inconsistencias frontend ↔ backend](#3--medios--inconsistencias-frontend--backend)
4. [🔵 BAJOS — Mejoras de calidad, patrones rotos, tech debt](#4--bajos--mejoras-de-calidad-patrones-rotos-tech-debt)
5. [⚪ INFORMATIVOS — Documentación desactualizada](#5--informativos--documentación-desactualizada)
6. [📋 Resumen de conteo](#6--resumen-de-conteo)

---

## 1. 🔴 CRÍTICOS — Bugs que rompen funcionalidad

### C-01: ~~`ActionLog.create()` no existe — Suricata router crashea en 5 endpoints~~ ✅ RESUELTO

**Archivos afectados:**
- `backend/routers/suricata.py` — líneas 106, 363, 387, 459, 500

**Problema:**
El router de Suricata llama `await ActionLog.create(db=db, action=..., target=..., details=...)` pero el modelo `ActionLog` (`backend/models/action_log.py`) **no tiene un método estático `create()`**. Es un modelo SQLAlchemy plano. Todos los demás routers crean instancias manualmente con `ActionLog(action_type=..., ...)` + `db.add()` + `db.flush()`.

**Impacto:** Los 5 endpoints que usan `ActionLog.create()` van a lanzar `AttributeError` en runtime:
- `POST /api/suricata/engine/reload-rules`
- `PUT /api/suricata/rules/{sid}/toggle`
- `POST /api/suricata/rules/update`
- `PUT /api/suricata/autoresponse/config`
- `POST /api/suricata/autoresponse/trigger`

**Fix:** Reemplazar cada `await ActionLog.create(db=db, action=X, target=Y, details=Z)` con:
```python
log_entry = ActionLog(action_type=X, target_ip=Y, details=json.dumps(Z) if isinstance(Z, dict) else str(Z))
db.add(log_entry)
await db.flush()
```

---

### C-02: ~~`ActionLog.log()` no existe — GeoIP router crashea~~ ✅ RESUELTO

**Archivos afectados:**
- `backend/routers/geoip.py` — línea 199

**Problema:**
El endpoint `POST /api/geoip/suggestions/{id}/apply` llama `await ActionLog.log(db, action=..., target=..., detail=...)` pero ese método tampoco existe en el modelo. Mismo patrón roto que C-01 pero con un nombre diferente.

**Fix:** Igual que C-01 — usar instanciación estándar.

---

### C-03: ~~Endpoint `/api/mikrotik/address-list` retorna 404 — falta el route~~ ✅ RESUELTO

**Archivos afectados:**
- `frontend/src/services/api.ts` línea 130 — `getAddressList()` llama a `/mikrotik/address-list`
- `backend/services/mikrotik_service.py` línea 734 — `get_address_list()` existe en el servicio
- `backend/routers/mikrotik.py` — **NO tiene el endpoint registrado**
- `backend/uvicorn_log.txt` — Confirma 404 en las líneas 152, 160, 161

**Problema:**
El frontend (utilizado por `ConfigView.tsx` y la sección de Blacklist) intenta consultar la address list de MikroTik, pero el router de MikroTik nunca definió el endpoint `GET /api/mikrotik/address-list`. El método existe en `MikroTikService` pero nunca fue conectado al router.

**Impacto:** La vista de Configuración de Seguridad (`/security/config`) no puede mostrar IPs bloqueadas actualmente.

**Fix:**
```python
# En backend/routers/mikrotik.py
@router.get("/address-list")
async def get_address_list(
    list: str | None = Query(None, description="Filter by list name"),
    service: MikroTikService = Depends(get_mt_service),
) -> APIResponse:
    try:
        data = await service.get_address_list(list_name=list)
        return APIResponse.ok(data)
    except Exception as e:
        return APIResponse.fail(f"Failed to fetch address list: {e}")
```

---

### C-04: ~~`_generate_mock_computers()` no existe en GLPIService~~ ✅ RESUELTO

**Archivos afectados:**
- `backend/routers/network.py` — línea 321

**Problema:**
El endpoint `GET /api/network/search` intenta llamar `glpi_service._generate_mock_computers(limit=20)` como fallback cuando GLPI no está disponible en modo lab. Pero `GLPIService` no tiene ese método privado.

**Impacto:** La búsqueda unificada de red crashea con `AttributeError` cuando GLPI no está disponible y el entorno es `lab`/`development`.

**Fix:** Reemplazar con datos del mock centralizado:
```python
from services.mock_data import MockData
mock_computers = MockData.glpi.computers(limit=20)
```

---

## 2. 🟠 ALTOS — Endpoints faltantes / funciones no implementadas

### A-01: ~~`collect_view_context()` y `generate_report_from_context()` no existen en AIService~~ ✅ RESUELTO

**Archivos afectados:**
- `backend/routers/widgets.py` — líneas 512-520
- `backend/services/ai_service.py` — **no tiene ninguna de estas funciones**

**Problema:**
El endpoint `POST /api/widgets/generate-view-report` (modo real, no mock) importa:
```python
from services.ai_service import collect_view_context, get_ai_service
```
Pero `ai_service.py` no exporta `collect_view_context` (no es ni función ni método) y `AIService` no tiene `generate_report_from_context()`. Solo tiene `generate_report()` que sigue un flujo diferente.

**Impacto:** La generación real de reportes desde vistas personalizadas falla con `ImportError`. Solo funciona en mock mode.

**Resolución pendiente:** Implementar ambas funciones, o adaptar el endpoint para usar el flujo existente de `AIService.generate_report()` con un prompt contextualizado.

---

### A-02: ~~`send_view_report()` no existe en TelegramService~~ ✅ RESUELTO

**Archivos afectados:**
- `backend/routers/widgets.py` — línea 546
- `backend/services/telegram_service.py` — **no tiene `send_view_report()`**

**Problema:**
Cuando `output=telegram` o `output=both`, el endpoint llama `await tg_svc.send_view_report(...)` pero `TelegramService` no tiene ese método.

**Impacto:** La opción de enviar reporte de vista por Telegram crashea en modo real.

---

### A-03: ~~`get_crowdsec_correlation()` no existe en SuricataService~~ ✅ RESUELTO

**Archivos afectados:**
- `backend/routers/widgets.py` — línea 216

**Problema:**
El endpoint `GET /api/widgets/confirmed-threats` (modo real) llama `await sur_svc.get_crowdsec_correlation()` pero `SuricataService` no tiene ese método.

**Impacto:** La correlación de amenazas confirmadas falla en modo real. Solo funciona con mock.

---

### A-04: ~~Widgets router usa `GLPIService()` en vez del singleton~~ ✅ RESUELTO

**Archivos afectados:**
- `backend/routers/widgets.py` — línea 392

**Problema:**
El endpoint `/api/widgets/suricata-asset-correlation` crea una nueva instancia `glpi_svc = GLPIService()` en vez de usar el singleton `get_glpi_service()`, violando el patrón arquitectónico del proyecto.

**Fix:** Cambiar a `from services.glpi_service import get_glpi_service` y usar `glpi_svc = get_glpi_service()`.

---

### A-05: ~~`correlation-timeline` endpoint usa mock data en modo real~~ ✅ RESUELTO

**Archivos afectados:**
- `backend/routers/widgets.py` — líneas 175-177

**Problema:**
El endpoint `GET /api/widgets/correlation-timeline` tiene un `# Real mode (TODO)` que **usa mock data incluso cuando los servicios no están en mock mode**:
```python
# Real mode (TODO en producción: implementar agregación real)
from services.mock_data import MockData
return APIResponse.ok(MockData.widgets.correlation_timeline(minutes=minutes))
```

**Impacto:** Los datos de correlación temporal son siempre mock, incluso con infraestructura real.

---

### A-06: ~~`GeoIPService` instanciado directamente sin singleton en widgets~~ ✅ RESUELTO

**Archivos afectados:**
- `backend/routers/widgets.py` — líneas 468-470

**Problema:**
```python
from services.geoip_service import GeoIPService
geoip_svc = GeoIPService()
data = geoip_svc.get_top_countries(...)
```
Se crea instancia nueva. El servicio tiene un singleton `get_geoip_service()`.

**Fix:** Usar `from services.geoip_service import get_geoip_service` → `geoip_svc = get_geoip_service()`.

---

## 3. 🟡 MEDIOS — Inconsistencias frontend ↔ backend

### M-01: ~~Schema `CLIMikrotikRequest` importado de `schemas.security` — debería tener su propio schema~~ ✅ RESUELTO

**Archivos afectados:**
- `backend/routers/cli.py` — línea 15
- `backend/schemas/security.py`

**Observación:**
Los schemas de CLI (`CLIMikrotikRequest`, `CLIWazuhAgentRequest`) viven dentro de `schemas/security.py`. No es incorrecto, pero rompe la convención de que cada dominio tenga su propio archivo de schemas. Un archivo `schemas/cli.py` sería más apropiado.

---

### M-02: ~~El catálogo de widgets dice "Total: 53" pero la documentación dice 36~~ ✅ RESUELTO

**Archivos afectados:**
- `backend/routers/views.py` — línea 714 (docstring dice 53)
- `frontend/CONTEXT.md` — documenta 36 widgets
- `AGENTS.md` — documenta 36 widgets (10 visual, 12 technical, 14 hybrid)

**Conteo real (del código):**
| Categoría | Widgets |
|-----------|---------|
| Standard  | 17      |
| Visual    | 10      |
| Technical | 12      |
| Hybrid    | 14      |
| **Total** | **53**  |

**Problema:** La documentación no contempla los 17 widgets estándar como categoría separada. La confusión es que las categorías Visual/Technical/Hybrid suman 36, pero el catálogo completo tiene 53 (17 estándar + 36 avanzados).

**Fix:** Actualizar `AGENTS.md` y `frontend/CONTEXT.md` para reflejar las 4 categorías y el total de 53.

---

### M-03: ~~`search_arp` backend vs frontend API desalineados~~ ✅ NO ES BUG

**Archivos afectados:**
- `frontend/src/services/api.ts` — `searchArp()` llama a `/mikrotik/arp/search`
- `backend/routers/mikrotik.py` — **SÍ tiene `GET /api/mikrotik/arp/search`** (línea 208)
- `backend/services/mikrotik_service.py` — tiene `search_arp(ip, mac)`

**Resolución:** Verificado que el endpoint `GET /api/mikrotik/arp/search` existe en el router (línea 208-225). No hay desalineación.

---

### M-04: ~~Telegram — `trigger-now` vs `trigger` discrepancia en API~~ ✅ NO ES BUG

**Archivos afectados:**
- `frontend/src/services/api.ts` línea 820 — llama a `/reports/telegram/configs/${id}/trigger-now`
- `backend/routers/reports.py` — verificar si la ruta es `trigger-now` o `trigger`

**Verificación necesaria:** Confirmar el nombre exacto de la ruta en el backend.

---

### M-05: ~~`suricataApi.getIpContext()` mal implementado en frontend~~ ✅ RESUELTO

**Archivos afectados:**
- `frontend/src/services/api.ts` — líneas 789-792

**Problema:**
```typescript
getIpContext: (ip: string) =>
    api.get<APIResponse<SuricataIpContext>>(
      `/suricata/alerts`, { params: { src_ip: ip, limit: 10 } }
    ).then(r => r.data),
```
Esto reutiliza el endpoint genérico de alertas con filtro, pero el tipo de retorno es `SuricataIpContext` (que incluye `flows_count`, `top_signatures`, etc.) mientras que la API real retorna `{ alerts: SuricataAlert[], total: number, offset: number }`. El tipo no coincide con el response.

**Fix:** Crear un endpoint dedicado `/api/suricata/context/ip/{ip}` en el backend, o corregir el tipo esperado en el frontend.

---

## 4. 🔵 BAJOS — Mejoras de calidad, patrones rotos, tech debt

### B-01: ~~`datetime.utcnow()` deprecado — usado en múltiples endpoints de widgets~~ ✅ RESUELTO

**Archivos afectados:**
- `backend/routers/widgets.py` — líneas 98, 262, 359, 432

**Problema:**
`datetime.utcnow()` ha sido deprecado en Python 3.12+. El proyecto ya usa `datetime.now(timezone.utc)` en otros archivos (e.g., `activity_heatmap`).

**Fix:** Reemplazar todas las apariciones con `datetime.now(timezone.utc)`.

---

### B-02: ~~Imports __import__ inline en widgets — anti-patrón~~ ✅ RESUELTO

**Archivos afectados:**
- `backend/routers/widgets.py` — líneas 98, 262, 359, 432

**Ejemplo:** `__import__("datetime").datetime.utcnow().isoformat()`

**Fix:** Usar import estándar al inicio del archivo.

---

### B-03: ~~`settings.is_lab` accedido en `phishing.py` pero no verificado en otros routers~~ ✅ NO ES BUG

**Archivos afectados:**
- `backend/routers/phishing.py` — línea 467

**Observación:** `settings.is_lab` se usa para el endpoint de simulación. Verificar si está definido en `config.py`.

---

### B-04: ~~VLANs router no tiene mock guard — depende enteramente del servicio~~ ✅ BY DESIGN

**Archivos afectados:**
- `backend/routers/vlans.py`

**Observación:** Funciona correctamente porque el mock guard está en `MikroTikService`, pero otros routers similares lo documentan explícitamente.

---

### B-05: ~~`components/vlans/` — directorio legacy aún existe~~ ✅ RESUELTO (eliminado)

**Archivos afectados:**
- `frontend/src/components/vlans/`

**Observación:** La página de VLANs fue fusionada con NetworkPage (`/network`), pero el directorio `vlans/` todavía existe en components. Si contiene componentes aún usados como sub-componentes de NetworkPage, debería documentarse. Si no, debería eliminarse.

---

### B-06: ~~Phishing router — filtrado client-side sobre 500 alertas max~~ ✅ DOCUMENTADO

**Archivos afectados:**
- `backend/routers/phishing.py` — múltiples endpoints

**Observación:** Todos los endpoints de phishing hacen `await wazuh.get_alerts(limit=500, offset=0)` y filtran client-side por grupos de reglas. Si el volumen de alertas crece, esto se convierte en un cuello de botella. Considerar pasar los filtros al backend de Wazuh cuando la API lo soporte.

---

### B-07: ~~`portal_service.py` es el archivo más grande (49KB) — candidato a refactoring~~ ✅ DOCUMENTADO

**Archivos afectados:**
- `backend/services/portal_service.py` — 49,752 bytes

**Observación:** Es ~2x más grande que cualquier otro servicio. Considerar separar la lógica de sesiones, usuarios, y configuración en sub-módulos.

---

### B-08: ~~`mock_data.py` tiene 138KB — difícil de mantener~~ ✅ DOCUMENTADO

**Archivos afectados:**
- `backend/services/mock_data.py` — 138,690 bytes, 3,150 líneas

**Observación:** Es el archivo más grande del proyecto. Los datos mock de cada servicio podrían separarse en archivos individuales dentro de un directorio `services/mocks/`.

---

## 5. ⚪ INFORMATIVOS — Documentación desactualizada

### I-01: ~~`CONTEXT.md` (raíz) menciona 14 servicios, hay 15~~ ✅ RESUELTO

**Archivos afectados:**
- `CONTEXT.md` (raíz)
- `backend/services/` — contiene 16 archivos de servicio (excluyendo `__init__.py` y `__pycache__`)

**Servicios no documentados:** `telegram_scheduler.py`, posiblemente otros.

---

### I-02: ~~`AGENTS.md` dice "10 modelos SQLAlchemy (9 archivos)" — hay 8 archivos con 10 clases~~ ✅ RESUELTO

**Archivos afectados:**
- `AGENTS.md`
- `backend/models/` — 8 archivos de modelo (excluyendo `__init__.py`)

**Conteo real:**
| Archivo | Clases |
|---------|--------|
| `action_log.py` | `ActionLog` |
| `custom_view.py` | `CustomView` |
| `ip_group.py` | `IPGroup`, `IPGroupMember` |
| `ip_label.py` | `IPLabel` |
| `portal_user.py` | `PortalUserRegistry` |
| `quarantine_log.py` | `QuarantineLog` |
| `sinkhole_entry.py` | `SinkholeEntry` |
| `telegram.py` | `TelegramReportConfig`, `TelegramMessageLog`, `TelegramPendingMessage` |
| **Total** | **8 archivos, 10 clases** |

---

### I-03: ~~`AGENTS.md` dice 15 routers, hay 16 (falta `widgets.py`)~~ ✅ RESUELTO

**Archivos afectados:**
- `AGENTS.md` — "15 routers REST"

**Router no documentado:** `backend/routers/widgets.py` — endpoints de agregación multi-fuente para widgets.

---

### I-04: ~~`README.md` necesita actualización post-v2.4~~ ✅ RESUELTO

**Archivos afectados:**
- `README.md`

**Observación:** La referencia de API y la arquitectura en el README pueden estar desincronizadas tras las adiciones de widgets, phishing, portal, y Telegram. Requiere revisión completa.

---

### I-05: ~~`docs/routes-index-v2.md` posiblemente desactualizado~~ ✅ DOCUMENTADO

**Archivos afectados:**
- `docs/routes-index-v2.md`

**Observación:** El archivo de 21KB documenta rutas pero puede no incluir los endpoints más recientes (`/api/widgets/*`, `/api/phishing/*`).

---

### I-06: ~~Directorio `docs/architecture/` y `docs/function/` — estado desconocido~~ ✅ VERIFICADO

**Observación:** Existen subdirectorios de documentación funcional y arquitectónica, pero su alineación con el código actual no fue verificada en esta auditoría. Se recomienda una revisión dedicada.

---

## 6. 📋 Resumen de conteo

| Severidad | Cantidad | Estado |
|-----------|----------|--------|
| 🔴 Crítico | 4 | ✅ 4/4 Resueltos |
| 🟠 Alto | 6 | ✅ 6/6 Resueltos |
| 🟡 Medio | 5 | ✅ 5/5 Resueltos (3 fix + 2 no bug) |
| 🔵 Bajo | 8 | ✅ 8/8 Cerrados (2 fix + 2 no bug + 1 eliminado + 3 documentados) |
| ⚪ Informativo | 6 | ✅ 6/6 Cerrados (4 fix + 1 documentado + 1 verificado) |
| **Total** | **29** | **✅ 29/29 COMPLETADO** |

---

## Prioridad de resolución recomendada

```
Sprint 1 (Inmediato):
  C-01 → Fix ActionLog.create() en suricata.py (5 endpoints)
  C-02 → Fix ActionLog.log() en geoip.py (1 endpoint)
  C-03 → Agregar GET /api/mikrotik/address-list (1 endpoint nuevo)
  C-04 → Fix _generate_mock_computers() en network.py

Sprint 2 (Pre-demo):
  A-01 → Implementar collect_view_context + generate_report_from_context
  A-02 → Implementar send_view_report en TelegramService
  A-03 → Implementar get_crowdsec_correlation en SuricataService
  A-04 → Corregir singleton en widgets.py (GLPIService)
  A-05 → Implementar correlation-timeline real mode
  A-06 → Corregir singleton en widgets.py (GeoIPService)

Sprint 3 (Estabilización):
  M-01 a M-05 → Corregir inconsistencias frontend ↔ backend
  B-01 a B-08 → Resolver tech debt

Paralelo:
  I-01 a I-06 → Actualizar documentación
```
