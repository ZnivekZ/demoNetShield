# NetShield Dashboard — Arquitectura General (v2)

> Vista de alto nivel del sistema. Objetivo: entender el flujo completo en 30 segundos.

## Cambios respecto a v1
- Nuevos endpoints agregados: `GET /api/system/mock-status`, `GET /api/actions/history`
- Nuevos componentes agregados: `MockModeBadge` (topbar), `utils/time.ts` (utilidades compartidas)
- Nuevos servicios agregados: `MockService` (facade CRUD en memoria), `MockData` (repositorio central de datos de prueba)
- Endpoints eliminados o modificados: Sin cambios
- Cambios de arquitectura relevantes:
  - Sistema de mock environment-aware con toggles por servicio (`MOCK_ALL`, `MOCK_MIKROTIK`, `MOCK_WAZUH`, `MOCK_GLPI`, `MOCK_ANTHROPIC`)
  - Mock guards en todos los WebSocket channels (traffic, alerts, vlan_traffic, security_alerts, portal_sessions)
  - Mock guards en todos los servicios (MikroTikService, WazuhService, GLPIService, AIService, PortalService)
  - Retrocompatibilidad: `APP_ENV=lab` sin variables `MOCK_*` explícitas activa `MOCK_ALL` automáticamente
  - Variables GLPI (`GLPI_URL`, `GLPI_APP_TOKEN`, `GLPI_USER_TOKEN`, `GLPI_VERIFY_SSL`) y mock mode agregadas a `backend/.env.example`
  - Total de endpoints subió de 86 a 88 (+2 endpoints en `main.py`)
  - Total de servicios subió de 7 a 9 (+MockService, +MockData)
  - Total de componentes TSX subió de 48 a 49 (+MockModeBadge)

```mermaid
graph TD
  classDef frontend fill:#3B82F6,color:#fff,stroke:#2563EB,stroke-width:2px
  classDef backend fill:#10B981,color:#fff,stroke:#059669,stroke-width:2px
  classDef external fill:#F59E0B,color:#fff,stroke:#D97706,stroke-width:2px
  classDef database fill:#6B7280,color:#fff,stroke:#4B5563,stroke-width:2px
  classDef websocket fill:#8B5CF6,color:#fff,stroke:#7C3AED,stroke-width:2px
  classDef mock fill:#EC4899,color:#fff,stroke:#DB2777,stroke-width:2px

  FE["React Frontend<br/>localhost:5173<br/>TanStack Query + Recharts"]:::frontend
  BE["FastAPI Backend<br/>localhost:8000<br/>10 routers · 109 rutas"]:::backend
  DB[("SQLite<br/>netshield.db<br/>6 tablas")]:::database
  WS["WebSocket Hub<br/>/ws/traffic · /ws/alerts<br/>/ws/vlans/traffic<br/>/ws/security/alerts<br/>/ws/portal/sessions"]:::websocket
  MT["MikroTik CHR<br/>192.168.100.118:8728<br/>routeros-api (sync→executor)"]:::external
  WZ["Wazuh SIEM<br/>100.90.106.121:55000<br/>httpx (async, JWT auth)"]:::external
  GL["GLPI Server<br/>glpi.facultad.local<br/>httpx (async, Session Token)"]:::external
  AI["Anthropic Claude API<br/>claude-sonnet-4<br/>Function calling"]:::external
  MOCK["Mock System<br/>MockService + MockData<br/>Per-service toggles"]:::mock

  FE -->|"HTTP REST<br/>/api/*"| BE
  FE <-->|"WebSocket<br/>real-time data"| WS
  WS -.- BE
  BE -->|"SQLAlchemy async<br/>aiosqlite"| DB
  BE -->|"routeros-api<br/>run_in_executor"| MT
  BE -->|"httpx<br/>verify=False (lab)"| WZ
  BE -->|"httpx<br/>Session Token auth"| GL
  BE -->|"anthropic SDK<br/>tool_use"| AI
  BE -.->|"MOCK_* flags<br/>fallback data"| MOCK
  MOCK -.->|"replaces calls to"| MT
  MOCK -.->|"replaces calls to"| WZ
  MOCK -.->|"replaces calls to"| GL
  MOCK -.->|"replaces calls to"| AI
```

## Flujo de datos principal

| Flujo | Descripción |
|-------|-------------|
| `FE → BE → MT` | Gestión de firewall, VLANs, ARP, tráfico, portal cautivo |
| `FE → BE → WZ` | Alertas de seguridad, agentes, MITRE ATT&CK |
| `FE → BE → GL` | Inventario de activos, tickets, ubicaciones |
| `FE → BE → AI → (WZ+MT)` | Reportes IA con function calling (Claude obtiene datos live) |
| `FE ↔ WS ← MT` | Tráfico en tiempo real cada 2s |
| `FE ↔ WS ← WZ` | Alertas de seguridad en tiempo real cada 5-15s |
| `FE ↔ WS ← MT` | Sesiones de portal cautivo cada 5s |
| `BE → DB` | Auditoría (ActionLog), labels, grupos, sinkhole, cuarentena |
| `BE → MOCK` | Datos simulados cuando `MOCK_*` flags están activos (reemplaza MT/WZ/GL/AI) |
| `FE → BE → /api/system/mock-status` | Frontend consulta qué servicios están en mock (MockModeBadge) |
| `FE → BE → /api/actions/history` | Trail de auditoría global de todas las acciones |

---

Generado el: 2026-04-05T10:59:00-03:00
Versión anterior: docs/architecture-overview.md
Archivos analizados: `backend/main.py`, `backend/routers/*.py` (10), `backend/services/*.py` (9), `backend/models/*.py` (6), `backend/config.py`, `frontend/src/App.tsx`, `frontend/src/components/**/*.tsx` (49), `frontend/src/hooks/*.ts` (18), `frontend/src/services/api.ts`, `frontend/src/types.ts`, `frontend/src/components/utils/time.ts`, `backend/.env.example`, `.env.example`
