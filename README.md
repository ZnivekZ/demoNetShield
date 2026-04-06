<div align="center">

# 🛡️ NetShield Dashboard

**Plataforma web de monitoreo y control de seguridad de red**

[![Python](https://img.shields.io/badge/Python-3.12+-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?style=for-the-badge&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://typescriptlang.org)
[![TailwindCSS](https://img.shields.io/badge/TailwindCSS-v4-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)](https://tailwindcss.com)

*Integra MikroTik CHR + Wazuh SIEM + Claude AI en un único panel de control*

</div>

---

## ✨ ¿Qué es NetShield?

NetShield Dashboard es una plataforma de monitoreo y gestión de seguridad de red que unifica en un solo lugar:

- **🌐 MikroTik CHR** — Control del router vía API RouterOS: firewall, VLANs, tráfico en tiempo real, portal cautivo
- **🔍 Wazuh SIEM** — Visualización de alertas de seguridad, estado de agentes y eventos MITRE ATT&CK
- **🤖 Claude AI** — Generación automática de reportes inteligentes con datos en vivo vía function calling
- **📦 GLPI** — Inventario de activos, tickets de soporte y correlación con eventos Wazuh
- **📄 PDF Export** — Exportación de reportes profesionales con WeasyPrint

> **Fase actual:** Laboratorio de pruebas. Diseñado para escalar a entornos reales con 1000+ usuarios concurrentes sin reescribir la arquitectura.

---

## 🖥️ Pantallas principales

| Panel | Descripción |
|-------|-------------|
| **Dashboard** | Stat cards, gráfico de tráfico en vivo, tabla de conexiones, feed de alertas |
| **Firewall** | Bloqueo de IPs, reglas activas, historial de acciones |
| **VLANs** | CRUD de VLANs, tráfico por VLAN en tiempo real vía WebSocket |
| **Red & IPs** | Tabla ARP, etiquetas y grupos de IPs con búsqueda global |
| **Portal Cautivo** | Sesiones activas, usuarios, perfiles de velocidad, horarios |
| **Seguridad** | Bloqueo de IPs, cuarentena, geo-block, alertas de phishing |
| **GLPI** | Inventario kanban, tickets, correlación Wazuh, marcado en cuarentena |
| **Reportes IA** | Prompt libre, selector de audiencia/fuentes, editor TipTap, exportar PDF |
| **CLI Web** | Terminal web integrada para RouterOS y Wazuh Agent |

---

## 🧱 Stack Técnico

### Backend (Python 3.12+)

| Paquete | Propósito |
|---------|-----------|
| **FastAPI** 0.115 | Framework web async |
| **SQLAlchemy** 2.0 + aiosqlite | ORM async con SQLite |
| **routeros-api** | Cliente API MikroTik (ejecutado en thread pool) |
| **httpx** | Cliente HTTP async para Wazuh |
| **anthropic** | SDK Claude para reportes con IA (function calling) |
| **WeasyPrint** + Jinja2 | Generación de PDF desde plantillas HTML |
| **structlog** | Logging estructurado (console en dev, JSON en prod) |
| **tenacity** | Reintentos con backoff exponencial |
| **Pydantic v2** | Validación de datos y configuración |

### Frontend

| Paquete | Propósito |
|---------|-----------|
| **React 19** | UI framework |
| **Vite 8** + TypeScript | Bundler y tipado estático |
| **TailwindCSS v4** | Estilos con tokens custom vía `@theme` |
| **TanStack Query** | Data fetching, cache y sincronización |
| **Recharts** | Gráficos de tráfico en tiempo real |
| **TipTap** | Editor de texto enriquecido para reportes |
| **Lucide React** | Iconografía |

---

## 🚀 Cómo levantar el proyecto

### Requisitos previos
- Python 3.12+
- Node.js 20+
- `uv` (recomendado) o `pip`

### Backend
```bash
cd backend

# Crear entorno virtual
python -m venv .venv
source .venv/bin/activate

# Instalar dependencias
pip install -r requirements.txt

# Configurar variables de entorno
cp .env.example .env
# Editar .env con tus credenciales reales

# Ejecutar
python main.py
# → API REST:    http://localhost:8000
# → Swagger UI:  http://localhost:8000/docs
```

### Frontend
```bash
cd frontend
npm install
npm run dev
# → http://localhost:5173
```

> El proxy de Vite redirige automáticamente `/api/*` → `localhost:8000` y `/ws/*` → `ws://localhost:8000`. No se necesita configurar CORS manualmente en desarrollo.

---

## 🧪 Modo Mock (Sin infraestructura externa)

NetShield incluye un sistema completo de datos simulados que permite usar **todas las funcionalidades sin tener MikroTik, Wazuh, GLPI ni una API key de Anthropic**.

```bash
# Activar mock total
cd backend
MOCK_ALL=true python main.py

# O activar servicios específicos en mock
MOCK_WAZUH=true MOCK_GLPI=true python main.py
```

| Variable | Efecto |
|----------|--------|
| `MOCK_ALL=true` | Activa mock en todos los servicios |
| `MOCK_MIKROTIK=true` | Solo MikroTik en mock |
| `MOCK_WAZUH=true` | Solo Wazuh en mock |
| `MOCK_GLPI=true` | Solo GLPI en mock |
| `MOCK_ANTHROPIC=true` | Solo generación de reportes en mock |

Cuando algún servicio está en mock, el frontend muestra un badge amarillo visible en la barra superior indicando qué servicios son simulados.

---

## 🏗️ Arquitectura

```
netShield2/
│
├── backend/
│   ├── main.py              # App FastAPI, WebSockets, middleware
│   ├── config.py            # Configuración con pydantic-settings
│   ├── database.py          # SQLAlchemy async + SQLite
│   ├── routers/             # Endpoints REST por dominio
│   │   ├── mikrotik.py      # 12 endpoints + VLANs CRUD
│   │   ├── wazuh.py         # 9 endpoints de alertas y agentes
│   │   ├── network.py       # 8 endpoints de labels y grupos
│   │   ├── reports.py       # Generación de reportes IA + PDF
│   │   ├── glpi.py          # 20 endpoints de inventario y tickets
│   │   └── portal.py        # 18 endpoints de portal cautivo
│   ├── services/            # Lógica de negocio (singletons)
│   │   ├── mikrotik_service.py
│   │   ├── wazuh_service.py
│   │   ├── ai_service.py    # Claude function calling
│   │   ├── pdf_service.py   # WeasyPrint + Jinja2
│   │   ├── mock_data.py     # Datos simulados reproducibles
│   │   └── mock_service.py  # CRUD en memoria para modo mock
│   ├── schemas/             # Schemas Pydantic v2
│   └── templates/           # Plantilla HTML para PDF
│
└── frontend/
    └── src/
        ├── App.tsx           # Rutas SPA
        ├── types.ts          # Tipos TypeScript compartidos
        ├── index.css         # Design system y tokens @theme
        ├── services/
        │   └── api.ts        # Cliente API centralizado (Axios)
        ├── hooks/            # Custom hooks (TanStack Query + WebSocket)
        └── components/       # Componentes por dominio
            ├── dashboard/
            ├── firewall/
            ├── network/
            ├── reports/
            ├── glpi/
            └── portal/
```

### Decisiones de arquitectura notables

- **Singleton para MikroTik** — RouterOS tiene límite bajo de sesiones. Un singleton con `asyncio.Lock` garantiza una conexión persistente compartida.
- **`run_in_executor` para routeros-api** — La librería es síncrona y bloquearía el event loop. Se ejecuta en el thread pool del executor.
- **WebSockets para datos en vivo** — Tráfico, alertas, VLANs y sesiones del portal se transmiten vía WebSocket con reconexión automática en el frontend.
- **SQLite → PostgreSQL ready** — Solo cambiando `DATABASE_URL` en `.env` a `postgresql+asyncpg://...` se puede migrar sin tocar código.
- **Mock guards en servicios, no en routers** — Los WebSockets no pasan por los routers, así que los guards deben estar en la capa de servicio para funcionar correctamente en modo mock.

---

## 🔌 API Reference

La documentación interactiva completa está disponible en `/docs` (Swagger UI) cuando se corre el backend:

- `GET /api/health` — Estado del sistema
- `GET /api/system/mock-status` — Estado actual de cada servicio (real o mock)
- `WS /ws/traffic` — Stream de tráfico en tiempo real
- `WS /ws/alerts` — Stream de alertas de seguridad
- `WS /ws/portal/sessions` — Sesiones del portal cautivo en vivo

> La carpeta `/postman/` incluye una colección con **104 requests** y 3 entornos preconfigurados (mock, local real, lab).

---

## 🔒 Consideraciones de seguridad

> Este proyecto está pensado para **laboratorio de pruebas**. Para producción se deben implementar:

- [ ] Autenticación de usuarios (JWT o sesiones)
- [ ] Rate limiting en endpoints
- [ ] Validación de permisos por rol (RBAC)
- [ ] Cache Redis para métricas de tiempo real
- [ ] Reemplazar `verify=False` en HTTPS (Wazuh) con certificados válidos
- [ ] Configuración CORS estricta (sin wildcards)

---

## 📋 Testing

```bash
# Importar colección en Postman
postman/NetShield.postman_collection.json

# Entornos disponibles:
# - env_local_mock.json    → localhost:8000 con MOCK_ALL=true
# - env_local_real.json    → localhost:8000 con servicios reales
# - env_lab.json           → IP remota del laboratorio
```

---

<div align="center">

**Hecho con ❤️ para monitoreo de redes**

</div>
