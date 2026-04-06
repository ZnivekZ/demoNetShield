# NetShield Dashboard — Arquitectura Detallada (v2)

> Diagrama de componentes interno: cada servicio, router, modelo, hook y componente.

## Cambios respecto a v1
- Nuevos endpoints agregados: `GET /api/system/mock-status` (main.py), `GET /api/actions/history` (main.py)
- Nuevos componentes agregados: `MockModeBadge` (common), `utils/time.ts` (utilidades)
- Nuevos servicios agregados: `MockService` (facade con CRUD en memoria), `MockData` (repositorio central de datos de prueba)
- Endpoints eliminados o modificados: Sin cambios
- Cambios de arquitectura relevantes:
  - Sistema de mock por servicio con flags `MOCK_ALL`, `MOCK_MIKROTIK`, `MOCK_WAZUH`, `MOCK_GLPI`, `MOCK_ANTHROPIC`
  - Mock guards en los 5 WebSocket channels
  - `MockService` mantiene estado mutable en memoria (GLPI assets/tickets, Portal users, blocked IPs)
  - `MockData` provee datos estáticos reproducibles con `Random(seed=42)`
  - `config.py` tiene nuevas propiedades: `should_mock_*`, `_effective_mock_all`, `_has_explicit_mock_vars`
  - `backend/.env.example` incluye sección de GLPI y Mock Mode
  - API client (`api.ts`) incluye `systemApi.getMockStatus()`
  - `types.ts` incluye `MockStatus` y `MockServiceStatus`

## 1. Backend — Servicios y conexiones externas

```mermaid
graph LR
  classDef service fill:#10B981,color:#fff,stroke:#059669
  classDef router fill:#3B82F6,color:#fff,stroke:#2563EB
  classDef model fill:#6B7280,color:#fff,stroke:#4B5563
  classDef external fill:#F59E0B,color:#fff,stroke:#D97706
  classDef mock fill:#EC4899,color:#fff,stroke:#DB2777

  subgraph Services ["Backend Services (Singleton)"]
    MTS["MikroTikService<br/>routeros-api<br/>connect/reconnect<br/>asyncio.Lock"]:::service
    WZS["WazuhService<br/>httpx AsyncClient<br/>JWT token auth<br/>tenacity retry"]:::service
    GLS["GLPIService<br/>httpx AsyncClient<br/>Session Token<br/>mock fallback"]:::service
    AIS["AIService<br/>Anthropic SDK<br/>function calling<br/>3 audience prompts"]:::service
    PDS["PDFService<br/>WeasyPrint + Jinja2<br/>report_base.html<br/>CPU-bound → executor"]:::service
    PTS["PortalService<br/>composes MikroTikService<br/>session cache deque<br/>schedule via firewall"]:::service
    APS["AuthProvider<br/>abstract interface<br/>MikrotikAuthProvider<br/>LDAP planned"]:::service
  end

  subgraph MockLayer ["Mock System (NEW v2)"]
    MSVC["MockService<br/>Facade + CRUD en memoria<br/>GLPI/Portal state<br/>reset on restart"]:::mock
    MDATA["MockData<br/>Repositorio central<br/>Random(seed=42)<br/>Entidades coherentes"]:::mock
  end

  MTS -->|"API port 8728"| MT_EXT["MikroTik CHR"]:::external
  WZS -->|"HTTPS :55000"| WZ_EXT["Wazuh Manager"]:::external
  GLS -->|"HTTP REST API"| GL_EXT["GLPI Server"]:::external
  AIS -->|"HTTPS API"| CL_EXT["Claude API"]:::external
  PTS -.->|"delegates calls"| MTS
  AIS -.->|"tool: get_wazuh_alerts"| WZS
  AIS -.->|"tool: get_connections"| MTS
  MSVC -.->|"uses static data"| MDATA
  MTS -.->|"mock guard"| MSVC
  WZS -.->|"mock guard"| MSVC
  GLS -.->|"mock guard"| MSVC
  AIS -.->|"mock guard"| MDATA
  PTS -.->|"mock guard"| MSVC
```

## 2. Backend — Routers y sus dependencias

```mermaid
graph TB
  classDef router fill:#3B82F6,color:#fff,stroke:#2563EB
  classDef service fill:#10B981,color:#fff,stroke:#059669
  classDef model fill:#EF4444,color:#fff,stroke:#DC2626
  classDef standalone fill:#8B5CF6,color:#fff,stroke:#7C3AED

  subgraph Routers ["10 API Routers (prefix)"]
    R_MT["/api/mikrotik<br/>10 endpoints"]:::router
    R_WZ["/api/wazuh<br/>8 endpoints"]:::router
    R_NET["/api/network<br/>8 endpoints"]:::router
    R_SEC["/api/security<br/>4 endpoints"]:::router
    R_PH["/api/phishing<br/>9 endpoints"]:::router
    R_VLAN["/api/mikrotik/vlans<br/>7 endpoints"]:::router
    R_RPT["/api/reports<br/>3 endpoints"]:::router
    R_CLI["/api/cli<br/>2 endpoints"]:::router
    R_POR["/api/portal<br/>17 endpoints"]:::router
    R_GLPI["/api/glpi<br/>18 endpoints"]:::router
  end

  subgraph Standalone ["Standalone Endpoints (main.py, NEW v2)"]
    E_HEALTH["/api/health<br/>GET"]:::standalone
    E_MOCK["/api/system/mock-status<br/>GET"]:::standalone
    E_ACTIONS["/api/actions/history<br/>GET"]:::standalone
  end

  subgraph Services
    S_MT["MikroTikService"]:::service
    S_WZ["WazuhService"]:::service
    S_GL["GLPIService"]:::service
    S_AI["AIService<br/>+ PDFService"]:::service
    S_PT["PortalService"]:::service
    S_MOCK["MockService"]:::service
  end

  subgraph Models ["DB Models (SQLite)"]
    M_AL["ActionLog"]:::model
    M_IL["IPLabel"]:::model
    M_IG["IPGroup<br/>IPGroupMember"]:::model
    M_SH["SinkholeEntry"]:::model
    M_PR["PortalUserRegistry"]:::model
    M_QL["QuarantineLog"]:::model
  end

  R_MT --> S_MT
  R_MT --> M_AL
  R_WZ --> S_WZ
  R_WZ --> M_AL
  R_NET --> M_IL
  R_NET --> M_IG
  R_NET --> S_MT
  R_NET --> S_WZ
  R_NET --> S_GL
  R_SEC --> S_MT
  R_SEC --> S_WZ
  R_SEC --> M_AL
  R_PH --> S_MT
  R_PH --> S_WZ
  R_PH --> M_AL
  R_PH --> M_SH
  R_VLAN --> S_MT
  R_VLAN --> S_WZ
  R_RPT --> S_AI
  R_RPT --> M_AL
  R_CLI --> S_MT
  R_CLI --> S_WZ
  R_POR --> S_PT
  R_POR --> M_AL
  R_GLPI --> S_GL
  R_GLPI --> S_MT
  R_GLPI --> S_WZ
  R_GLPI --> M_AL
  R_GLPI --> M_QL
  E_MOCK --> S_MOCK
  E_ACTIONS --> M_AL
```

## 3. Backend — WebSocket channels

```mermaid
graph LR
  classDef ws fill:#8B5CF6,color:#fff,stroke:#7C3AED
  classDef source fill:#F59E0B,color:#fff,stroke:#D97706
  classDef mock fill:#EC4899,color:#fff,stroke:#DB2777

  WS1["/ws/traffic<br/>intervalo: 2s"]:::ws
  WS2["/ws/alerts<br/>intervalo: 5s"]:::ws
  WS3["/ws/vlans/traffic<br/>intervalo: 2s"]:::ws
  WS4["/ws/security/alerts<br/>intervalo: 5s"]:::ws
  WS5["/ws/portal/sessions<br/>intervalo: 5s"]:::ws

  MT_SRC["MikroTikService<br/>get_traffic()"]:::source
  WZ_SRC["WazuhService<br/>get_alerts()"]:::source
  VLAN_SRC["MikroTikService<br/>get_vlan_traffic()"]:::source
  CRIT_SRC["WazuhService + MikroTik<br/>alerts + interfaces"]:::source
  PORT_SRC["PortalService<br/>get_active_sessions()"]:::source
  MOCK_SRC["MockData.websocket<br/>traffic_tick / alerts_tick<br/>vlan_traffic_tick<br/>security_alert / portal_session"]:::mock

  MT_SRC --> WS1
  WZ_SRC --> WS2
  VLAN_SRC --> WS3
  CRIT_SRC --> WS4
  PORT_SRC --> WS5
  MOCK_SRC -.->|"when MOCK_* active"| WS1
  MOCK_SRC -.->|"when MOCK_* active"| WS2
  MOCK_SRC -.->|"when MOCK_* active"| WS3
  MOCK_SRC -.->|"when MOCK_* active"| WS4
  MOCK_SRC -.->|"when MOCK_* active"| WS5
```

## 4. Frontend — Componentes por ruta

```mermaid
graph TB
  classDef page fill:#3B82F6,color:#fff,stroke:#2563EB
  classDef component fill:#06B6D4,color:#fff,stroke:#0891B2
  classDef hook fill:#EC4899,color:#fff,stroke:#DB2777
  classDef newv2 fill:#F97316,color:#fff,stroke:#EA580C

  subgraph Security ["/ Seguridad"]
    QV["QuickView /"]:::page
    CV["ConfigView /security/config"]:::page
    QV_C1["LastIncidentCard"]:::component
    QV_C2["NotificationPanel"]:::component
  end

  subgraph Infra ["Infraestructura"]
    NP["NetworkPage /network"]:::page
    FP["FirewallPage /firewall"]:::page
    PP["PortalPage /portal"]:::page
    PP_MON["MonitorView"]:::component
    PP_USR["UsersView + UserTable"]:::component
    PP_STAT["StatsView + UsageHeatmap"]:::component
    PP_CFG["ConfigView + ScheduleConfig"]:::component
    PP_SP["SpeedProfiles"]:::component
  end

  subgraph Tools ["Herramientas"]
    PH["PhishingPanel /phishing"]:::page
    SH["SystemHealth /system"]:::page
    RP["ReportsPage /reports"]:::page
    SH_CLI["RemoteCLI"]:::component
  end

  subgraph Inventory ["Inventario GLPI"]
    INV["InventoryPage /inventory"]:::page
    INV_HV["HealthView"]:::component
    INV_AV["AssetsView + AssetDetail"]:::component
    INV_TV["TicketsView + TicketKanban"]:::component
    INV_UV["UsersView"]:::component
    INV_QR["QrScanner"]:::component
  end

  subgraph Common ["Compartidos"]
    LAYOUT["Layout (sidebar + nav)"]:::component
    SEARCH["GlobalSearch"]:::component
    MODAL["ConfirmModal"]:::component
    MOCKBADGE["MockModeBadge (NEW v2)"]:::newv2
  end

  subgraph Utilities ["Utilidades (NEW v2)"]
    TIMEUTILS["utils/time.ts<br/>formatDistanceToNow<br/>formatTime · formatDateTime<br/>severityClass"]:::newv2
  end

  subgraph Hooks ["Custom Hooks (18)"]
    H_SEC["useSecurityAlerts<br/>useSecurityActions"]:::hook
    H_WZ["useWazuhSummary"]:::hook
    H_MT["useMikrotikHealth"]:::hook
    H_NET["useNetworkSearch"]:::hook
    H_PH["usePhishing"]:::hook
    H_VLAN["useVlans · useVlanTraffic"]:::hook
    H_WS["useWebSocket"]:::hook
    H_PORT["usePortalSessions<br/>usePortalUsers<br/>usePortalStats<br/>usePortalConfig"]:::hook
    H_GLPI["useGlpiAssets<br/>useGlpiHealth<br/>useGlpiTickets<br/>useGlpiUsers<br/>useQrScanner"]:::hook
  end

  QV --> H_SEC
  QV --> H_WZ
  QV --> H_MT
  CV --> H_SEC
  NP --> H_NET
  NP --> H_VLAN
  NP --> H_WS
  PH --> H_PH
  SH --> H_MT
  SH --> H_WZ
  PP --> H_PORT
  INV --> H_GLPI
  LAYOUT --> MOCKBADGE
```

## 5. Base de datos — Modelos SQLAlchemy

```mermaid
erDiagram
  ActionLog {
    int id PK
    string action_type
    string target_ip
    text details
    string performed_by
    string comment
    datetime created_at
  }

  IPLabel {
    int id PK
    string ip_address UK
    string label
    string description
    string color
    string criteria
    datetime created_at
  }

  IPGroup {
    int id PK
    string name
    string description
    string color
    string criteria
    datetime created_at
  }

  IPGroupMember {
    int id PK
    int group_id FK
    string ip_address
    string added_reason
    datetime created_at
  }

  SinkholeEntry {
    int id PK
    string domain UK
    string reason
    string added_by
    datetime created_at
  }

  PortalUserRegistry {
    int id PK
    string username UK
    string created_by
    datetime created_at
  }

  QuarantineLog {
    int id PK
    int asset_id_glpi
    string reason
    string wazuh_alert_id
    string mikrotik_block_id
    datetime created_at
    datetime resolved_at
  }

  IPGroup ||--o{ IPGroupMember : "has members"
```

## 6. Stack tecnológico

### Backend
| Componente | Tecnología | Versión / Nota |
|------------|-----------|----------------|
| Framework | FastAPI | async |
| ORM | SQLAlchemy | async + aiosqlite |
| DB | SQLite | `netshield.db` |
| Logging | structlog | JSON structured |
| Retry | tenacity | exponential backoff |
| MikroTik conn | routeros-api | sync → `run_in_executor` |
| Wazuh conn | httpx | async, JWT, `verify=False` |
| GLPI conn | httpx | async, Session Token |
| AI | anthropic | Claude claude-sonnet-4, tool_use |
| PDF | WeasyPrint + Jinja2 | CPU-bound → executor |
| Validation | Pydantic v2 | pydantic-settings |
| Mock System | MockService + MockData | **NEW v2** — per-service toggles, seeded RNG |

### Frontend
| Componente | Tecnología |
|------------|-----------|
| Framework | React 19 + TypeScript |
| Bundler | Vite |
| State / Fetch | TanStack Query v5 |
| Routing | react-router-dom v6 |
| Charts | Recharts |
| HTTP Client | Axios |
| CSS | TailwindCSS v4 + custom design system |
| QR Scanning | html5-qrcode |
| Rich text editor | TipTap |
| Icons | lucide-react |

---

Generado el: 2026-04-05T10:59:00-03:00
Versión anterior: docs/architecture-detail.md
Archivos analizados: `backend/main.py`, `backend/routers/*.py` (10), `backend/services/*.py` (9), `backend/services/mock_service.py`, `backend/services/mock_data.py`, `backend/models/*.py` (6), `backend/config.py`, `frontend/src/App.tsx`, `frontend/src/components/**/*.tsx` (49), `frontend/src/hooks/*.ts` (18), `frontend/src/services/api.ts`, `frontend/src/types.ts`, `frontend/src/components/utils/time.ts`, `frontend/src/components/common/MockModeBadge.tsx`, `backend/.env.example`, `.env.example`
