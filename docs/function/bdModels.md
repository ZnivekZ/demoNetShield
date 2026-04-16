# Base de Datos — Modelos, Flujos y Arquitectura de Persistencia

## Descripción General

NetShield utiliza una base de datos **SQLite** local (`netshield.db`) gestionada con **SQLAlchemy async** + **aiosqlite**. Su rol es muy específico y deliberado:

> [!IMPORTANT]
> La BD local **no almacena datos vivos**. Tráfico, alertas, decisiones activas, usuarios Hotspot y activos GLPI viven en los sistemas externos (MikroTik, Wazuh, CrowdSec, GLPI). La BD de NetShield es el **cuaderno de bitácora** del dashboard: guarda metadatos de configuración, anotaciones del operador y el historial de auditoría de las acciones ejecutadas.

| Aspecto | Detalle |
|---|---|
| Motor | SQLite (`sqlite+aiosqlite:///./netshield.db`) en laboratorio |
| Migración posible | Cambiar `DATABASE_URL` env var → PostgreSQL sin cambiar código |
| ORM | SQLAlchemy 2.x (async, typed mapped columns) |
| Sesiones | `async_sessionmaker` con `expire_on_commit=False` |
| Inicialización | `init_db()` en startup de FastAPI (`main.py`) → `Base.metadata.create_all` |
| Cierre | `close_db()` en shutdown → `engine.dispose()` |
| Tablas totales | **7 tablas** (6 entidades + 1 tabla de relación) |

---

## Diagrama Entidad-Relación

```mermaid
erDiagram
    action_logs {
        int id PK
        string action_type "index, max 50"
        string target_ip "index, nullable, max 45"
        text details "JSON payload, nullable"
        string performed_by "default: dashboard_user"
        text comment "nullable"
        datetime created_at "index, server_default: now()"
    }

    ip_labels {
        int id PK
        string ip_address "index, max 45"
        string label "max 255"
        text description "nullable"
        string color "default: #6366f1, max 7"
        text criteria "JSON, nullable"
        string created_by "default: system"
        datetime created_at
        datetime updated_at "onupdate: now()"
    }

    ip_groups {
        int id PK
        string name "unique, max 255"
        text description "nullable"
        string color "default: #8b5cf6, max 7"
        text criteria "JSON, nullable"
        string created_by "default: system"
        datetime created_at
        datetime updated_at "onupdate: now()"
    }

    ip_group_members {
        int id PK
        int group_id FK
        string ip_address "index, max 45"
        string added_reason "default: manual, max 255"
        datetime added_at
    }

    sinkhole_entries {
        int id PK
        string domain "unique, index, max 255"
        string added_by "default: dashboard_user, max 100"
        text reason "nullable"
        datetime created_at "index"
    }

    portal_user_registry {
        int id PK
        string username "unique, index, max 128"
        datetime created_at
        string created_by "default: admin, max 64"
        string notes "nullable, max 512"
    }

    quarantine_logs {
        int id PK
        int asset_id_glpi "index"
        text reason
        datetime quarantined_at "index"
        datetime resolved_at "nullable"
        string wazuh_alert_id "nullable, max 100"
        string mikrotik_block_id "nullable, max 100"
        string created_by "default: dashboard_user"
    }

    ip_groups ||--o{ ip_group_members : "tiene miembros"
```

> [!NOTE]
> La única **Foreign Key** es `ip_group_members.group_id → ip_groups.id` con `ON DELETE CASCADE`. El resto de las tablas son **independientes entre sí**; sus conexiones son conceptuales (ej. `action_logs.target_ip` puede coincidir con `ip_labels.ip_address`) pero no hay FKs declaradas.

---

## Diagrama de Escritura — Quién escribe en cada tabla

```mermaid
graph LR
    subgraph Routers["Routers FastAPI"]
        R_MK["routers/mikrotik.py"]
        R_WZ["routers/wazuh.py"]
        R_CS["routers/crowdsec.py"]
        R_PH["routers/phishing.py"]
        R_SE["routers/security.py"]
        R_GL["routers/glpi.py"]
        R_PO["routers/portal.py"]
        R_RP["routers/reports.py"]
        R_NW["routers/network.py"]
    end

    subgraph Services["Servicios"]
        S_PO["services/portal_service.py"]
    end

    subgraph Tables["Tablas SQLite"]
        AL["action_logs"]
        IL["ip_labels"]
        IG["ip_groups"]
        IGM["ip_group_members"]
        SE["sinkhole_entries"]
        PU["portal_user_registry"]
        QL["quarantine_logs"]
    end

    R_MK -->|"block / unblock"| AL
    R_WZ -->|"active_response"| AL
    R_CS -->|"7 tipos crowdsec_*"| AL
    R_PH -->|"sinkhole_add / sinkhole_remove / phishing_block"| AL
    R_PH -->|"INSERT / DELETE"| SE
    R_SE -->|"security_block / auto_block / quarantine / geo_block"| AL
    R_GL -->|"glpi_* (5 tipos)"| AL
    R_GL -->|"INSERT cuarentena"| QL
    R_GL -->|"UPDATE resolved_at"| QL
    R_PO -->|"portal_* (8 tipos)"| AL
    R_RP -->|"report_generated"| AL
    R_NW -->|"INSERT / UPDATE / DELETE"| IL
    R_NW -->|"INSERT / DELETE"| IG
    R_NW -->|"INSERT / DELETE"| IGM
    S_PO -->|"INSERT / DELETE según MikroTik"| PU

    style Tables fill:#1e293b,stroke:#475569
```

---

## Diagrama de Lectura — Quién consulta cada tabla

```mermaid
graph LR
    subgraph Readers["Lectores"]
        R_RP["routers/reports.py<br/>GET /reports/history"]
        R_AC["routers/actions.py<br/>GET /actions/history"]
        R_PH2["routers/phishing.py<br/>GET /phishing/domains/sinkhole"]
        R_NW2["routers/network.py<br/>GET /network/labels<br/>GET /network/groups"]
        R_GL2["routers/glpi.py<br/>Checks open quarantines"]
        S_PO2["services/portal_service.py<br/>get_users(), bulk sync"]
    end

    subgraph Tables["Tablas SQLite"]
        AL["action_logs"]
        IL["ip_labels"]
        IG["ip_groups + members"]
        SE["sinkhole_entries"]
        PU["portal_user_registry"]
        QL["quarantine_logs"]
    end

    AL -->|"filtrado por action_type=report_generated"| R_RP
    AL -->|"ORDER BY created_at DESC, LIMIT"| R_AC
    SE -->|"full scan"| R_PH2
    IL -->|"ORDER BY created_at DESC"| R_NW2
    IG -->|"JOIN members (selectinload)"| R_NW2
    QL -->|"WHERE resolved_at IS NULL"| R_GL2
    PU -->|"JOIN para enriquecer listado MikroTik"| S_PO2

    style Tables fill:#1e293b,stroke:#475569
```

---

## Detalle por Tabla

### `action_logs` — Auditoría Global

**Propósito:** Registro inmutable de toda acción con efecto secundario ejecutada desde el dashboard. Es el único historial centralizado que abarca todos los módulos.

**Columnas:**

| Columna | Tipo | Índice | Descripción |
|---|---|---|---|
| `id` | `INTEGER` PK | ✓ | Autoincrement |
| `action_type` | `VARCHAR(50)` | ✓ | Tipo de acción (ver catálogo) |
| `target_ip` | `VARCHAR(45)` | ✓ | IP afectada (nullable para acciones sin IP) |
| `details` | `TEXT` | — | JSON con payload completo de la acción |
| `performed_by` | `VARCHAR(100)` | — | Actor (default: `"dashboard_user"`) |
| `comment` | `TEXT` | — | Mensaje libre adicional |
| `created_at` | `DATETIME` | ✓ | Timestamp UTC automático del servidor |

**Quién escribe:** 8 routers + `main.py` (para eventos de WebSocket de seguridad)

**Quién lee:**
- `GET /api/actions/history` — historial general paginado (limit configurable)
- `GET /api/reports/history` — filtrado por `action_type = "report_generated"`

**Ejemplo de fila:**
```json
{
  "id": 142,
  "action_type": "crowdsec_full_remediation",
  "target_ip": "185.220.101.45",
  "details": "{\"crowdsec_blocked\": true, \"mikrotik_blocked\": true, \"trigger\": \"manual\", \"duration\": \"24h\"}",
  "performed_by": "dashboard_user",
  "comment": null,
  "created_at": "2026-04-12T19:45:23"
}
```

> [!TIP]
> El campo `details` es un **JSON serializado como texto**. En SQLite esto es eficiente; en una migración a PostgreSQL podría cambiarse a tipo `JSONB` nativo para hacer queries dentro del JSON.

---

### `ip_labels` — Anotaciones Manuales de IPs

**Propósito:** Permite al operador asignar un nombre/etiqueta y color a una IP para identificarla visualmente en toda la UI del dashboard (ARP table, firewall rules, alerts, etc.).

**Columnas:**

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | `INTEGER` PK | Autoincrement |
| `ip_address` | `VARCHAR(45)` | IP (soporta IPv6, index) |
| `label` | `VARCHAR(255)` | Nombre corto (ej: "Servidor Web") |
| `description` | `TEXT` | Descripción larga, nullable |
| `color` | `VARCHAR(7)` | Color hex (ej: `#6366f1`) |
| `criteria` | `TEXT` | JSON de criterios para membresía automática |
| `created_by` | `VARCHAR(100)` | Actor que la creó |
| `created_at` / `updated_at` | `DATETIME` | Timestamps con auto-update |

**Quién escribe:** `routers/network.py` — `POST /network/labels`, `DELETE /network/labels/{id}`

**Quién lee:** `routers/network.py` — `GET /network/labels` (usado por el GlobalSearch para enriquecer resultados)

**Relaciones externas:** La `ip_address` puede cruzarse con IPs del ARP de MikroTik, con `target_ip` de `action_logs`, y con alertas de Wazuh para mostrar el nombre amigable.

---

### `ip_groups` + `ip_group_members` — Agrupación de IPs

**Propósito:** Permite agrupar IPs bajo criterios lógicos ("Alta Actividad", "Red Interna Confiable", "IPs Sospechosas"). Los grupos pueden tener miembros manuales o criterios automáticos (campo `criteria` JSON).

**`ip_groups`:**

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | `INTEGER` PK | Autoincrement |
| `name` | `VARCHAR(255)` UNIQUE | Nombre del grupo |
| `description` | `TEXT` | Descripción, nullable |
| `color` | `VARCHAR(7)` | Color hex para la UI |
| `criteria` | `TEXT` | JSON: `{"min_connections_per_min": 50, "ip_range": "192.168.88.0/24"}` |
| `created_by` | `VARCHAR(100)` | Actor |
| `created_at` / `updated_at` | `DATETIME` | Timestamps |

**`ip_group_members`:**

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | `INTEGER` PK | Autoincrement |
| `group_id` | `INTEGER` FK | → `ip_groups.id` (CASCADE DELETE) |
| `ip_address` | `VARCHAR(45)` | IP miembro (index) |
| `added_reason` | `VARCHAR(255)` | Motivo de la incorporación |
| `added_at` | `DATETIME` | Timestamp |

**Quién escribe:** `routers/network.py` — CRUD completo (crear grupo, agregar/quitar miembro, eliminar grupo)

**Quién lee:** `routers/network.py` — `GET /network/groups` con `selectinload` de miembros

---

### `sinkhole_entries` — Dominios en DNS Sinkhole

**Propósito:** Registro local de los dominios que el sistema ha enviado al sinkhole DNS de MikroTik (`/ip/dns/static` con destino `127.0.0.1`). La fuente de verdad del sinkhole **activo** es MikroTik; esta tabla es el historial de auditoría con motivos.

**Columnas:**

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | `INTEGER` PK | Autoincrement |
| `domain` | `VARCHAR(255)` UNIQUE | Dominio sinkholeado (index) |
| `added_by` | `VARCHAR(100)` | Actor |
| `reason` | `TEXT` | Motivo del sinkhole, nullable |
| `created_at` | `DATETIME` | Timestamp (index) |

**Quién escribe:** `routers/phishing.py` — `POST /phishing/domains/sinkhole` (INSERT), `DELETE /phishing/domains/sinkhole/{domain}` (DELETE)

**Quién lee:** `routers/phishing.py` — `GET /phishing/domains/sinkhole` (full scan, cross-referenciado con datos de MikroTik en tiempo real para mostrar si el sinkhole sigue activo)

**Relación con sistema externo:** Al agregar, el router llama a `MikroTikService.add_dns_sinkhole(domain)` **y** persiste en esta tabla. Al eliminar, hace lo inverso. Si MikroTik falla, la tabla puede quedar inconsistente.

---

### `portal_user_registry` — Metadatos de Usuarios Hotspot

**Propósito:** MikroTik es la fuente de verdad para usuarios del portal cautivo (usernames, contraseñas, perfiles, MAC). Esta tabla almacena **únicamente** los metadatos que MikroTik no guarda: quién creó el usuario desde el dashboard y cuándo.

**Columnas:**

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | `INTEGER` PK | Autoincrement |
| `username` | `VARCHAR(128)` UNIQUE | username del hotspot (index) |
| `created_at` | `DATETIME` | Cuándo se creó desde el dashboard |
| `created_by` | `VARCHAR(64)` | Quién lo creó (default: `"admin"`) |
| `notes` | `VARCHAR(512)` | Notas adicionales, nullable |

**Quién escribe:** `services/portal_service.py` — llamado desde `routers/portal.py`:
- `create_user()` → INSERT si no existe
- `delete_user()` → DELETE
- En bulk create: INSERT por cada usuario creado exitosamente

**Quién lee:** `services/portal_service.py` — al listar usuarios de MikroTik, hace JOIN conceptual para enriquecer la respuesta con `created_at` y `created_by` de esta tabla. También se usa para filtrar usuarios creados en los últimos N días.

**Dato en schema:** Los campos `created_at` y `created_by` del `PortalUser` schema vienen de esta tabla; si el usuario fue creado fuera del dashboard (ej: desde la CLI de MikroTik), esos campos aparecen como `null`.

---

### `quarantine_logs` — Cuarentena de Activos GLPI

**Propósito:** Registro del ciclo completo de cuarentena de un activo de inventario GLPI. Permite saber cuándo un equipo fue aislado, por qué, qué alerta de Wazuh lo disparó, qué ID de bloqueo en MikroTik existe, y cuándo fue resuelto.

**Columnas:**

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | `INTEGER` PK | Autoincrement |
| `asset_id_glpi` | `INTEGER` | ID del activo en GLPI (index) |
| `reason` | `TEXT` | Motivo de la cuarentena |
| `quarantined_at` | `DATETIME` | Timestamp inicio (index) |
| `resolved_at` | `DATETIME` | Nullable — NULL = en cuarentena activa |
| `wazuh_alert_id` | `VARCHAR(100)` | ID de alerta Wazuh asociada, nullable |
| `mikrotik_block_id` | `VARCHAR(100)` | ID de bloqueo en MikroTik, nullable |
| `created_by` | `VARCHAR(100)` | Actor |

**Quién escribe:** `routers/glpi.py`:
- `POST /glpi/assets/{id}/quarantine` → INSERT nueva fila
- `POST /glpi/assets/{id}/unquarantine` → UPDATE `resolved_at = now()`

**Quién lee:** `routers/glpi.py` — antes de re-cuarentenar, busca si existe una fila con `resolved_at IS NULL` para el mismo `asset_id_glpi`.

**Ciclo de vida:**
```
quarantined_at=T0, resolved_at=NULL  → activo EN CUARENTENA
quarantined_at=T0, resolved_at=T1    → cuarentena RESUELTA (historial)
```

---

## Catálogo de `action_type` — Los 34 Tipos

Todos los `action_type` registrados en `action_logs`, agrupados por módulo:

### MikroTik (`routers/mikrotik.py`)
| action_type | trigger | target_ip |
|---|---|---|
| `block` | `POST /mikrotik/firewall/block` | ✓ IP bloqueada |
| `unblock` | `DELETE /mikrotik/firewall/block` | ✓ IP desbloqueada |

### Wazuh (`routers/wazuh.py`)
| action_type | trigger | target_ip |
|---|---|---|
| `active_response` | `POST /wazuh/active-response` | ✓ IP del agente |

### CrowdSec (`routers/crowdsec.py`)
| action_type | trigger | target_ip |
|---|---|---|
| `crowdsec_manual_decision` | `POST /crowdsec/decisions/manual` | ✓ |
| `crowdsec_delete_decision` | `DELETE /crowdsec/decisions/{id}` | ✓ |
| `crowdsec_unblock_ip` | `DELETE /crowdsec/decisions/ip/{ip}` | ✓ |
| `crowdsec_whitelist_add` | `POST /crowdsec/whitelist` | ✓ |
| `crowdsec_whitelist_remove` | `DELETE /crowdsec/whitelist/{id}` | ✓ |
| `crowdsec_full_remediation` | `POST /crowdsec/remediation/full` | ✓ |
| `crowdsec_sync_apply` | `POST /crowdsec/sync/apply` | — (múltiples IPs en details) |

### Phishing (`routers/phishing.py`)
| action_type | trigger | target_ip |
|---|---|---|
| `sinkhole_add` | `POST /phishing/domains/sinkhole` | — (dominio en details) |
| `sinkhole_remove` | `DELETE /phishing/domains/sinkhole/{domain}` | — |
| `phishing_block` | `POST /phishing/ip/block` | ✓ |

### Security Híbrido (`routers/security.py`)
| action_type | trigger | target_ip |
|---|---|---|
| `security_block` | `POST /security/block-ip` | ✓ |
| `auto_block` | `POST /security/auto-block` | ✓ |
| `quarantine` | `POST /security/quarantine` | ✓ IP del agente |
| `geo_block` | `POST /security/geo-block` | — (country en details) |

### GLPI (`routers/glpi.py`)
| action_type | trigger | target_ip |
|---|---|---|
| `glpi_asset_created` | `POST /glpi/assets` | — |
| `glpi_asset_updated` | `PUT /glpi/assets/{id}` | — |
| `glpi_quarantine` | `POST /glpi/assets/{id}/quarantine` | ✓ IP del activo |
| `glpi_unquarantine` | `POST /glpi/assets/{id}/unquarantine` | ✓ |
| `glpi_ticket_created` | `POST /glpi/tickets` | — |
| `glpi_ticket_status_updated` | `PUT /glpi/tickets/{id}/status` | — |
| `glpi_maintenance_ticket` | `POST /glpi/tickets/network-maintenance` | — |

### Portal Cautivo (`routers/portal.py`)
| action_type | trigger | target_ip |
|---|---|---|
| `portal_setup` | `POST /portal/setup` | — |
| `portal_user_create` | `POST /portal/users` | — |
| `portal_user_update` | `PUT /portal/users/{username}` | — |
| `portal_user_delete` | `DELETE /portal/users/{username}` | — |
| `portal_user_disconnect` | `POST /portal/users/{u}/disconnect` | — |
| `portal_user_bulk_create` | `POST /portal/users/bulk` | — |
| `portal_speed_update` | `PUT /portal/config/unregistered-speed` | — |
| `portal_schedule_update` | `PUT /portal/config/schedule` | — |

### Reportes IA (`routers/reports.py`)
| action_type | trigger | target_ip |
|---|---|---|
| `report_generated` | `POST /reports/generate` | — |

---

## Ciclo de Vida del Dato — De Request a BD

```mermaid
sequenceDiagram
    actor U as Operador
    participant FE as Frontend
    participant RT as Router FastAPI
    participant SC as Schema Pydantic
    participant SV as Service
    participant DB as SQLite (netshield.db)
    participant EXT as Sistema Externo

    U->>FE: POST "Bloquear 185.220.101.45"
    FE->>RT: POST /api/crowdsec/decisions/manual<br/>{ip, duration, reason, type}
    RT->>SC: ManualDecisionRequest.model_validate(body)
    SC-->>RT: OK (ip válida, duration válida)
    RT->>SV: crowdsec_service.add_decision(ip, duration, reason)
    SV->>EXT: POST http://localhost:8080/v1/decisions
    EXT-->>SV: 200 OK
    SV-->>RT: {ip, added: true}

    Note over RT,DB: El router abre una sesión de BD (Depends(get_db))
    RT->>DB: INSERT INTO action_logs<br/>(action_type="crowdsec_manual_decision",<br/>target_ip="185.220.101.45",<br/>details='{"type":"ban","duration":"24h",...}',<br/>performed_by="dashboard_user")
    DB-->>RT: id=143
    Note over RT,DB: Session commit automático al salir del context manager

    RT-->>FE: APIResponse.ok({"ip": "...", "added": true})
    FE->>FE: invalidateQueries(['crowdsec','decisions'])
```

---

## Configuración de la Base de Datos

### `database.py` — Piezas clave

```python
# 1. ENGINE — Swappable entre SQLite y PostgreSQL
engine = create_async_engine(
    settings.database_url,   # sqlite+aiosqlite:///./netshield.db
    echo=settings.is_development,   # Loguea SQL en dev
    connect_args={"check_same_thread": False},  # Requerido solo para SQLite
    pool_pre_ping=True,  # Verifica conexión antes de usar del pool
)

# 2. SESSION FACTORY
async_session_factory = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,  # Evita lazy-load tras commit
)

# 3. DEPENDENCY INJECTION (usada en todos los routers)
async def get_db() -> AsyncSession:
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()     # Auto-commit si no hubo error
        except Exception:
            await session.rollback()   # Rollback si hubo excepción
            raise
        finally:
            await session.close()

# 4. STARTUP / SHUTDOWN (en main.py lifespan)
await init_db()   # → Base.metadata.create_all (crea tablas si no existen)
await close_db()  # → engine.dispose() (libera pool)
```

### Dependency Injection en Routers

```python
# Patrón en cada router que usa la BD:
@router.post("/decisions/manual")
async def add_manual_decision(
    request: ManualDecisionRequest,
    db: AsyncSession = Depends(get_db),  # ← BD inyectada aquí
):
    # ... lógica ...
    log = ActionLog(action_type="crowdsec_manual_decision", ...)
    db.add(log)
    # El commit se ejecuta automáticamente en get_db() al salir
```

---

## Relación con Sistemas Externos — Quién es la Fuente de Verdad

Un aspecto crítico del diseño: la BD local **complementa** a los sistemas externos, no los reemplaza:

```mermaid
graph TB
    subgraph Local ["BD Local — netshield.db"]
        AL["action_logs<br/>(auditoría)"]
        IL["ip_labels<br/>(anotaciones)"]
        IG["ip_groups<br/>(agrupaciones)"]
        SE["sinkhole_entries<br/>(historial sinkhole)"]
        PU["portal_user_registry<br/>(metadata de creación)"]
        QL["quarantine_logs<br/>(ciclo de cuarentena)"]
    end

    subgraph External ["Sistemas Externos — Fuente de Verdad"]
        MK["MikroTik RouterOS<br/>Firewall rules, Address Lists,<br/>DNS Sinkhole, Hotspot Users,<br/>Interfaces, ARP, Traffic"]
        WZ["Wazuh<br/>Agents, Alerts, MITRE,<br/>Active Response"]
        CS["CrowdSec LAPI<br/>Decisions, Alerts, Bouncers,<br/>Scenarios, Hub"]
        GL["GLPI<br/>Assets, Tickets, Users,<br/>Locations"]
    end

    MK -.->|"Firewall block → log"| AL
    MK -.->|"Sinkhole activo ≠ tabla local"| SE
    MK -.->|"Usuarios reales"| PU
    WZ -.->|"active_response → log"| AL
    CS -.->|"Decisions reales"| AL
    GL -.->|"asset_id referenciado"| QL

    style Local fill:#1e293b,stroke:#6366f1
    style External fill:#0f172a,stroke:#475569
```

> [!IMPORTANT]
> **Riesgo de inconsistencia:** Si un registro se borra directamente en el sistema externo (ej. se elimina un bloqueo en MikroTik via CLI), la BD local no se entera. Los logs permanecen como referencia histórica pero pueden no reflejar el estado actual. Esto es diseño intencional para un entorno de laboratorio.

---

## Crecimiento Futuro — Posibles Nuevas Tablas

| Tabla potencial | Motivo | Cuando conviene |
|---|---|---|
| `users` | Autenticación multi-usuario en el dashboard (JWT, hash password) | Si se agrega login de usuarios distintos al admin |
| `user_sessions` | Tokens JWT activos, refresh tokens, historial de sesiones | Con sistema de autenticación |
| `geoip_cache` | Cache de resultados de GeoLite2 para evitar re-lookup de IPs frecuentes | Al integrar MaxMind GeoLite2 |
| `crowdsec_whitelist` | Actualmente la whitelist local de CrowdSec podría migrarse de ser en-memoria del servicio a una tabla | Para persistirla entre reinicios |
| `alert_escalations` | Registro de alertas Wazuh/CrowdSec que fueron escaladas a tickets GLPI | Para trazar la cadena alerta → ticket → resolución |
| `scheduled_blocks` | Bloqueos programados con `start_at` / `end_at` para ejecutar automáticamente | Sistema de bloqueos temporales |
| `report_templates` | Plantillas de reportes guardadas para re-generar con distintos parámetros | Mejora del módulo de reportes IA |
| `notification_settings` | Configuración de alertas WebSocket por usuario (qué tipos mostrar, umbrales) | Con sistemas de autenticación |

### Migración a PostgreSQL

El código **no requiere cambios** para migrar. Solo cambiar la variable de entorno:

```bash
# SQLite (laboratorio)
DATABASE_URL=sqlite+aiosqlite:///./netshield.db

# PostgreSQL (producción)
DATABASE_URL=postgresql+asyncpg://user:password@host:5432/netshield
```

Consideraciones para producción:
- Cambiar `details TEXT` → `details JSONB` para queries dentro del payload
- Agregar `created_at` con timezone (`TIMESTAMPTZ`) en lugar de naive datetime
- Agregar índices compuestos en `action_logs(action_type, created_at)` para queries de historial filtradas
- Habilitar `pool_size` y `max_overflow` en el engine (actualmente no configurados para SQLite)

---

## Archivos Involucrados

| Archivo | Rol |
|---|---|
| [database.py](file:///home/nivek/Documents/netShield2/backend/database.py) | Engine, session factory, `get_db()`, `init_db()`, `close_db()` |
| [models/action_log.py](file:///home/nivek/Documents/netShield2/backend/models/action_log.py) | Tabla `action_logs` — auditoría global |
| [models/ip_label.py](file:///home/nivek/Documents/netShield2/backend/models/ip_label.py) | Tabla `ip_labels` — anotaciones de IPs |
| [models/ip_group.py](file:///home/nivek/Documents/netShield2/backend/models/ip_group.py) | Tablas `ip_groups` + `ip_group_members` |
| [models/sinkhole_entry.py](file:///home/nivek/Documents/netShield2/backend/models/sinkhole_entry.py) | Tabla `sinkhole_entries` — historial de sinkhole |
| [models/portal_user.py](file:///home/nivek/Documents/netShield2/backend/models/portal_user.py) | Tabla `portal_user_registry` — metadata hotspot |
| [models/quarantine_log.py](file:///home/nivek/Documents/netShield2/backend/models/quarantine_log.py) | Tabla `quarantine_logs` — ciclo de cuarentena GLPI |
| [config.py](file:///home/nivek/Documents/netShield2/backend/config.py) | `database_url` (default: SQLite, swappable a PostgreSQL) |
| [main.py](file:///home/nivek/Documents/netShield2/backend/main.py) | Llama `init_db()` en startup, `close_db()` en shutdown |
