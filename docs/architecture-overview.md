# NetShield Dashboard — Arquitectura General

> Vista de alto nivel del sistema. Objetivo: entender el flujo completo en 30 segundos.

```mermaid
graph TD
  classDef frontend fill:#3B82F6,color:#fff,stroke:#2563EB,stroke-width:2px
  classDef backend fill:#10B981,color:#fff,stroke:#059669,stroke-width:2px
  classDef external fill:#F59E0B,color:#fff,stroke:#D97706,stroke-width:2px
  classDef database fill:#6B7280,color:#fff,stroke:#4B5563,stroke-width:2px
  classDef websocket fill:#8B5CF6,color:#fff,stroke:#7C3AED,stroke-width:2px

  FE["React Frontend<br/>localhost:5173<br/>TanStack Query + Recharts"]:::frontend
  BE["FastAPI Backend<br/>localhost:8000<br/>10 routers · 107 rutas"]:::backend
  DB[("SQLite<br/>netshield.db<br/>6 tablas")]:::database
  WS["WebSocket Hub<br/>/ws/traffic · /ws/alerts<br/>/ws/vlans/traffic<br/>/ws/security/alerts<br/>/ws/portal/sessions"]:::websocket
  MT["MikroTik CHR<br/>192.168.100.118:8728<br/>routeros-api (sync→executor)"]:::external
  WZ["Wazuh SIEM<br/>100.90.106.121:55000<br/>httpx (async, JWT auth)"]:::external
  GL["GLPI Server<br/>glpi.facultad.local<br/>httpx (async, Session Token)"]:::external
  AI["Anthropic Claude API<br/>claude-sonnet-4<br/>Function calling"]:::external

  FE -->|"HTTP REST<br/>/api/*"| BE
  FE <-->|"WebSocket<br/>real-time data"| WS
  WS -.- BE
  BE -->|"SQLAlchemy async<br/>aiosqlite"| DB
  BE -->|"routeros-api<br/>run_in_executor"| MT
  BE -->|"httpx<br/>verify=False (lab)"| WZ
  BE -->|"httpx<br/>Session Token auth"| GL
  BE -->|"anthropic SDK<br/>tool_use"| AI
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

---

Generado el: 2026-04-04T18:24:00-03:00
Basado en el análisis de: `backend/main.py`, `backend/routers/*.py` (10), `backend/services/*.py` (7), `backend/models/*.py` (6), `backend/config.py`, `frontend/src/App.tsx`, `frontend/src/components/**/*.tsx` (48), `frontend/src/hooks/*.ts` (18), `frontend/src/services/api.ts`, `backend/.env.example`
Versión del proyecto: frontend 0.0.0 / backend 1.0.0
