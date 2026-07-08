"""
NetShield Dashboard - Main Application Entry Point

FastAPI application with:
- CORS configured for frontend (localhost:5173)
- All routers registered (mikrotik, wazuh, network, reports)
- WebSocket endpoint for real-time traffic data
- Database initialization on startup
- Structured logging with structlog
- Graceful shutdown of service connections
"""

from __future__ import annotations

import asyncio
import json
import logging
import sys
from contextlib import asynccontextmanager

import structlog
import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

from config import get_settings
from database import close_db, init_db
from routers import cli, mikrotik, network, phishing, portal, reports, security, vlans, wazuh
from routers import glpi as glpi_router
from routers import crowdsec as crowdsec_router
from routers import geoip as geoip_router
from routers import suricata as suricata_router
from routers import views as views_router
from routers import widgets as widgets_router
from routers import dhcp as dhcp_router
from routers import auth as auth_router
from services.mikrotik_service import get_mikrotik_service
from services.wazuh_service import get_wazuh_service
from services.glpi_service import get_glpi_service
from services.crowdsec_service import get_crowdsec_service
from services.geoip_service import GeoIPService
from services.suricata_service import get_suricata_service
from services.telegram_service import get_telegram_service
from services.telegram_scheduler import get_telegram_scheduler
from services.report_scheduler import get_report_scheduler
from services.glpi_collector import get_glpi_collector

# ── Structured Logging Setup ─────────────────────────────────────

settings = get_settings()

structlog.configure(
    processors=[
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.StackInfoRenderer(),
        structlog.dev.set_exc_info,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.dev.ConsoleRenderer() if settings.is_development
        else structlog.processors.JSONRenderer(),
    ],
    wrapper_class=structlog.make_filtering_bound_logger(
        logging.getLevelName(settings.log_level)
    ),
    context_class=dict,
    logger_factory=structlog.PrintLoggerFactory(),
    cache_logger_on_first_use=True,
)

logger = structlog.get_logger(__name__)


# ── Application Lifespan ─────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application startup and shutdown."""
    # Startup
    logger.info("netshield_starting", env=settings.app_env)
    await init_db()
    logger.info("database_initialized")

    # Create default admin user if no users exist
    from services.auth_service import get_auth_service
    auth_service = get_auth_service()
    await auth_service.ensure_default_admin()

    # Try to connect to MikroTik (non-blocking - will retry on first request if fails)
    try:
        mt_service = get_mikrotik_service()
        await mt_service.connect()
        logger.info("mikrotik_initial_connection_ok")
    except Exception as e:
        logger.warning("mikrotik_initial_connection_failed", error=str(e),
                       msg="Will retry on first API request")

    # Initialize GeoIP service (loads .mmdb readers into memory, or sets mock mode)
    GeoIPService.initialize()

    # Initialize Suricata service (verify socket connectivity, or set mock mode)
    try:
        sur_service = get_suricata_service()
        await sur_service.connect()
    except Exception as e:
        logger.warning("suricata_initial_connection_failed", error=str(e))

    # Initialize Telegram bot and scheduler
    try:
        tg_service = get_telegram_service()
        await tg_service.connect()
    except Exception as e:
        logger.warning("telegram_initial_connection_failed", error=str(e))
    try:
        tg_scheduler = get_telegram_scheduler()
        await tg_scheduler.start()
    except Exception as e:
        logger.warning("telegram_scheduler_start_failed", error=str(e))

    # Start GLPI Collector (periodic sync every 5 min)
    try:
        glpi_collector = get_glpi_collector()
        await glpi_collector.start()
    except Exception as e:
        logger.warning("glpi_collector_start_failed", error=str(e))

    # Start Report Scheduler (automated AI report generation)
    try:
        report_scheduler = get_report_scheduler()
        await report_scheduler.start()
    except Exception as e:
        logger.warning("report_scheduler_start_failed", error=str(e))

    yield

    # Shutdown
    logger.info("netshield_shutting_down")
    try:
        mt_service = get_mikrotik_service()
        await mt_service.disconnect()
    except Exception:
        pass
    try:
        wazuh_service = get_wazuh_service()
        await wazuh_service.close()
    except Exception:
        pass
    try:
        glpi_service = get_glpi_service()
        await glpi_service.close()
    except Exception:
        pass
    try:
        cs_service = get_crowdsec_service()
        await cs_service.close()
    except Exception:
        pass
    try:
        sur_service = get_suricata_service()
        await sur_service.close()
    except Exception:
        pass
    try:
        glpi_collector = get_glpi_collector()
        await glpi_collector.stop()
    except Exception:
        pass
    try:
        report_scheduler = get_report_scheduler()
        await report_scheduler.stop()
    except Exception:
        pass
    try:
        tg_scheduler = get_telegram_scheduler()
        await tg_scheduler.stop()
    except Exception:
        pass
    try:
        tg_service = get_telegram_service()
        await tg_service.close()
    except Exception:
        pass
    await close_db()
    logger.info("netshield_shutdown_complete")


# ── FastAPI App ───────────────────────────────────────────────────

app = FastAPI(
    title="NetShield Dashboard API",
    description="Security monitoring and control platform for MikroTik + Wazuh environments",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs" if settings.is_development else None,
    redoc_url="/redoc" if settings.is_development else None,
)

# ── CORS ──────────────────────────────────────────────────────────

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── JWT Auth Middleware ─────────────────────────────────────────────

# Routes that DON'T require authentication
_PUBLIC_PATHS: frozenset[str] = frozenset({
    "/api/auth/login",
    "/api/auth/logout",
    "/health",
    "/",
    "/docs",
    "/redoc",
    "/openapi.json",
})

class JWTAuthMiddleware(BaseHTTPMiddleware):
    """
    Global HTTP middleware that validates JWT tokens on every request.

    - Public paths (login, logout, health, docs) pass through without validation.
    - WebSocket paths (/ws/*) pass through — they handle auth at the connection level.
    - All other paths require a valid 'Authorization: Bearer <token>' header.
    - Returns standard APIResponse envelope on 401 so the frontend interceptor
      catches it consistently.
    """

    async def dispatch(self, request: Request, call_next):
        path = request.url.path

        # Allow public paths and WebSocket upgrades through
        if path in _PUBLIC_PATHS or path.startswith("/ws"):
            return await call_next(request)

        # Validate Bearer token
        authorization = request.headers.get("Authorization", "")
        if not authorization.startswith("Bearer "):
            return JSONResponse(
                status_code=401,
                content={"success": False, "data": None, "error": "Token de autenticación requerido"},
            )

        token = authorization.split(" ", 1)[1]

        # Lazy import to avoid circular dependency at module load time
        from services.auth_service import decode_token
        payload = decode_token(token)

        if payload is None:
            return JSONResponse(
                status_code=401,
                content={"success": False, "data": None, "error": "Token inválido o expirado"},
            )

        return await call_next(request)


app.add_middleware(JWTAuthMiddleware)


# ── Routers ───────────────────────────────────────────────────────

app.include_router(mikrotik.router)
app.include_router(wazuh.router)
app.include_router(network.router)
app.include_router(reports.router)
app.include_router(vlans.router)
app.include_router(phishing.router)
app.include_router(security.router)
app.include_router(cli.router)
app.include_router(portal.router)
app.include_router(glpi_router.router)
app.include_router(crowdsec_router.router)
app.include_router(geoip_router.router)
app.include_router(suricata_router.router)
app.include_router(views_router.router)
app.include_router(widgets_router.router)
app.include_router(dhcp_router.router)
app.include_router(auth_router.router)


# ── Root & Health Check ───────────────────────────────────────────

from fastapi.responses import RedirectResponse

@app.get("/", include_in_schema=False)
async def root():
    """Redirect to docs or show info."""
    return RedirectResponse(url="/docs")

@app.get("/api/health")
async def health_check():
    """Health check endpoint for monitoring."""
    return {
        "success": True,
        "data": {
            "status": "healthy",
            "version": "1.0.0",
            "environment": settings.app_env,
        },
        "error": None,
    }


@app.get("/api/system/mock-status")
async def get_mock_status():
    """Return which services are running in mock mode. Used by the frontend MockModeBadge."""
    from services.mock_service import MockService
    return {"success": True, "data": MockService.get_mock_status(), "error": None}


# ── Action Log History ────────────────────────────────────────────

@app.get("/api/actions/history")
async def get_action_history(
    # Parámetros de paginación estilo frontend (page/page_size)
    page: int = 1,
    page_size: int = 50,
    # Parámetros legacy mantenidos por retrocompatibilidad
    limit: int | None = None,
    offset: int | None = None,
    # Filtros
    severity: str | None = None,
    action_type: str | None = None,
    performed_by: str | None = None,
    search: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    target_ip: str | None = None,
):
    """
    Historial de auditoría con filtros server-side y paginación real.

    Params (paginación):
        page         — Número de página 1-based (default 1)
        page_size    — Registros por página (default 50)
        limit/offset — Parámetros legacy (se ignoran si se usa page/page_size)

    Params (filtros):
        severity     — Filtrar por nivel exacto: critical|high|medium|low|info
        action_type  — Filtrar por prefijo de action_type (ej: "auth_")
        performed_by — Filtrar por operador exacto
        target_ip    — Filtrar por IP objetivo exacta
        search       — Búsqueda libre en target_ip, comment, details y action_type
        date_from    — ISO datetime inicio del rango (ej: "2026-06-01T00:00:00")
        date_to      — ISO datetime fin del rango (ej: "2026-06-28T23:59:59")
    """
    from datetime import datetime as dt
    from sqlalchemy import func as sqlfunc, select
    from database import async_session_factory
    from models.action_log import ActionLog

    # Calcular offset a partir de page/page_size
    effective_page_size = limit if limit is not None else page_size
    effective_offset = offset if offset is not None else (page - 1) * effective_page_size

    try:
        async with async_session_factory() as session:
            # ── Construir query base ───────────────────────────────────────
            base_q = select(ActionLog)
            count_q = select(sqlfunc.count(ActionLog.id))

            # ── Aplicar filtros ────────────────────────────────────────────
            conditions = []

            if severity:
                conditions.append(ActionLog.severity == severity)

            if action_type:
                conditions.append(ActionLog.action_type.startswith(action_type))

            if performed_by:
                conditions.append(ActionLog.performed_by == performed_by)

            if target_ip:
                conditions.append(ActionLog.target_ip == target_ip)

            if search:
                pattern = f"%{search}%"
                from sqlalchemy import or_
                conditions.append(or_(
                    ActionLog.target_ip.ilike(pattern),
                    ActionLog.comment.ilike(pattern),
                    ActionLog.details.ilike(pattern),
                    ActionLog.action_type.ilike(pattern),
                    ActionLog.performed_by.ilike(pattern),
                ))

            if date_from:
                try:
                    dt_from = dt.fromisoformat(date_from)
                    conditions.append(ActionLog.created_at >= dt_from)
                except ValueError:
                    pass

            if date_to:
                try:
                    dt_to = dt.fromisoformat(date_to)
                    conditions.append(ActionLog.created_at <= dt_to)
                except ValueError:
                    pass

            if conditions:
                from sqlalchemy import and_
                base_q = base_q.where(and_(*conditions))
                count_q = count_q.where(and_(*conditions))

            # ── Conteo total (para metadata de paginación) ─────────────────
            total_result = await session.execute(count_q)
            total = total_result.scalar_one()

            # ── Página actual ──────────────────────────────────────────────
            result = await session.execute(
                base_q
                .order_by(ActionLog.created_at.desc())
                .offset(effective_offset)
                .limit(effective_page_size)
            )
            logs = result.scalars().all()

            items = [
                {
                    "id": log.id,
                    "action_type": log.action_type,
                    "severity": log.severity,
                    "target_ip": log.target_ip,
                    "details": json.loads(log.details) if log.details else None,
                    "performed_by": log.performed_by,
                    "comment": log.comment,
                    "created_at": log.created_at.isoformat(),
                }
                for log in logs
            ]

            # ── Metadata de paginación en el formato que espera el frontend ─
            total_pages = max(1, (total + effective_page_size - 1) // effective_page_size)
            current_page = (effective_offset // effective_page_size) + 1

            return {
                "success": True,
                "data": {
                    "items": items,
                    "pagination": {
                        "page": current_page,
                        "page_size": effective_page_size,
                        "total": total,
                        "total_pages": total_pages,
                        "has_next": current_page < total_pages,
                        "has_prev": current_page > 1,
                    },
                    "filters_applied": {
                        "severity": severity,
                        "action_type": action_type,
                        "performed_by": performed_by,
                        "search": search,
                        "target_ip": target_ip,
                        "date_from": date_from,
                        "date_to": date_to,
                    },
                },
                "error": None,
            }

    except Exception as e:
        logger.error("api_action_history_error", error=str(e))
        return {"success": False, "data": None, "error": str(e)}


@app.get("/api/audit/config")
async def get_audit_config():
    """
    Retorna la configuración actual del sistema de auditoría (read-only).
    Los cambios se hacen en .env y requieren reinicio del backend.
    """
    from services.audit_service import get_audit_config_info
    try:
        return {"success": True, "data": get_audit_config_info(), "error": None}
    except Exception as e:
        return {"success": False, "data": None, "error": str(e)}


# ── WebSocket: Real-time Traffic ──────────────────────────────────

class ConnectionManager:
    """Manages WebSocket connections for real-time updates."""

    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info("websocket_connected", total=len(self.active_connections))

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)
        logger.info("websocket_disconnected", total=len(self.active_connections))

    async def broadcast(self, data: dict):
        """Send data to all connected WebSocket clients."""
        disconnected = []
        for connection in self.active_connections:
            try:
                await connection.send_json(data)
            except Exception:
                disconnected.append(connection)
        for conn in disconnected:
            try:
                self.active_connections.remove(conn)
            except ValueError:
                pass


manager = ConnectionManager()


@app.websocket("/ws/traffic")
async def websocket_traffic(websocket: WebSocket):
    """
    WebSocket endpoint for real-time traffic updates.
    Sends traffic data every 2 seconds to all connected clients.
    Also includes connection count and alert summary.
    """
    await manager.connect(websocket)
    mt_service = get_mikrotik_service()
    tick = 0
    try:
        while True:
            try:
                if settings.should_mock_mikrotik:
                    from services.mock_data import MockData
                    payload = MockData.websocket.traffic_tick(tick)
                    await websocket.send_json({"type": "traffic", "data": payload})
                else:
                    traffic = await mt_service.get_traffic()
                    connections = await mt_service.get_connections()
                    await websocket.send_json({
                        "type": "traffic",
                        "data": {
                            "traffic": traffic,
                            "active_connections": len(connections),
                            "timestamp": __import__("time").strftime("%Y-%m-%dT%H:%M:%S"),
                        },
                    })
            except Exception as e:
                await websocket.send_json({
                    "type": "error",
                    "data": {"message": f"Failed to fetch data: {str(e)}"},
                })
            tick += 1
            await asyncio.sleep(2)  # Update every 2 seconds
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        logger.error("websocket_error", error=str(e))
        manager.disconnect(websocket)


@app.websocket("/ws/alerts")
async def websocket_alerts(websocket: WebSocket):
    """
    WebSocket endpoint for real-time alert notifications.
    Polls Wazuh for new alerts every 5 seconds.
    """
    await manager.connect(websocket)
    wazuh_service = get_wazuh_service()
    last_alert_id = None
    tick = 0

    try:
        while True:
            try:
                if settings.should_mock_wazuh:
                    from services.mock_data import MockData
                    alert = MockData.websocket.alerts_tick(tick)
                    if alert:
                        await websocket.send_json({"type": "alerts", "data": {"alerts": [alert]}})
                else:
                    alerts = await wazuh_service.get_alerts(limit=10)
                    if alerts and alerts[0].get("id") != last_alert_id:
                        last_alert_id = alerts[0].get("id")
                        await websocket.send_json({"type": "alerts", "data": {"alerts": alerts}})
            except Exception as e:
                await websocket.send_json({
                    "type": "error",
                    "data": {"message": f"Wazuh error: {str(e)}"},
                })
            tick += 1
            await asyncio.sleep(5)  # Poll every 5 seconds
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        logger.error("websocket_alerts_error", error=str(e))
        manager.disconnect(websocket)


# ── WebSocket: VLAN Traffic ───────────────────────────────────────

vlan_traffic_manager = ConnectionManager()


@app.websocket("/ws/vlans/traffic")
async def websocket_vlan_traffic(websocket: WebSocket):
    """
    WebSocket endpoint for real-time VLAN traffic updates.
    Sends traffic data every 2 seconds with alert status per VLAN.
    Status is 'alert' if any Wazuh alert IP falls within the VLAN's subnet.
    """
    import ipaddress
    import time as _time

    await vlan_traffic_manager.connect(websocket)
    mt_service = get_mikrotik_service()
    wazuh_service = get_wazuh_service()
    tick = 0

    try:
        while True:
            try:
                if settings.should_mock_mikrotik:
                    from services.mock_data import MockData
                    payload = MockData.websocket.vlan_traffic_tick(tick)
                    await websocket.send_json({"type": "vlan_traffic", "data": payload})
                else:
                    vlan_traffic = await mt_service.get_vlan_traffic()
                    vlan_addresses = await mt_service.get_vlan_addresses()
                    iface_subnets: dict[str, list] = {}
                    for addr in vlan_addresses:
                        iface = addr["interface"]
                        try:
                            network = ipaddress.ip_network(addr["address"], strict=False)
                            iface_subnets.setdefault(iface, []).append(network)
                        except ValueError:
                            pass
                    alert_ips: set[str] = set()
                    try:
                        alerts = await wazuh_service.get_alerts(limit=50)
                        for alert in alerts:
                            for ip_field in ["src_ip", "dst_ip", "agent_ip"]:
                                ip_str = alert.get(ip_field, "")
                                if ip_str:
                                    alert_ips.add(ip_str)
                    except Exception:
                        pass
                    for vt in vlan_traffic:
                        vlan_name = vt["name"]
                        subnets = iface_subnets.get(vlan_name, [])
                        for ip_str in alert_ips:
                            try:
                                ip = ipaddress.ip_address(ip_str)
                                if any(ip in subnet for subnet in subnets):
                                    vt["status"] = "alert"
                                    break
                            except ValueError:
                                pass
                    await websocket.send_json({
                        "type": "vlan_traffic",
                        "data": {"timestamp": _time.strftime("%Y-%m-%dT%H:%M:%S"), "vlans": vlan_traffic},
                    })
            except Exception as e:
                await websocket.send_json({
                    "type": "error",
                    "data": {"message": f"VLAN traffic error: {str(e)}"},
                })
            tick += 1
            await asyncio.sleep(2)
    except WebSocketDisconnect:
        vlan_traffic_manager.disconnect(websocket)
    except Exception as e:
        logger.error("websocket_vlan_traffic_error", error=str(e))
        vlan_traffic_manager.disconnect(websocket)


# ── WebSocket: Security Alerts (Multi-source) ──────────────────

security_alert_manager = ConnectionManager()

# Phishing rule groups for filtering
_PHISHING_GROUPS = {
    "web_attack", "phishing", "malicious_url",
    "suspicious_download", "credential_harvesting",
    "web", "attack", "web-attack",
}


@app.websocket("/ws/security/alerts")
async def websocket_security_alerts(websocket: WebSocket):
    """
    WebSocket endpoint for real-time security notifications.
    Polls Wazuh every 15s for high-severity alerts and phishing detections.
    Polls MikroTik every 10s for interface status changes.
    In mock mode: emits MockData.websocket.security_alert(tick) events.
    """
    await security_alert_manager.connect(websocket)
    wazuh_service = get_wazuh_service()
    mt_service = get_mikrotik_service()

    threshold = settings.alert_notification_threshold
    last_wazuh_alert_id = None
    last_interface_state: dict[str, bool] = {}
    tick = 0

    try:
        while True:
            notifications = []

            if settings.should_mock_wazuh and settings.should_mock_mikrotik:
                # Full mock: emit a security notification on schedule
                from services.mock_data import MockData
                notif = MockData.websocket.security_alert(tick)
                if notif:
                    notifications.append(notif)
            else:
                # ── Wazuh polling (every 15s = tick % 3 == 0, each tick is 5s)
                if tick % 3 == 0 and not settings.should_mock_wazuh:
                    try:
                        alerts = await wazuh_service.get_alerts(limit=20, level_min=threshold)
                        for alert in alerts:
                            alert_id = alert.get("id", "")
                            if alert_id == last_wazuh_alert_id:
                                break
                            level = int(alert.get("rule_level", 0))
                            groups = set(g.lower() for g in alert.get("rule_groups", []))
                            is_phishing = bool(groups & _PHISHING_GROUPS)
                            if is_phishing:
                                notifications.append({
                                    "type": "phishing_detected",
                                    "level": "critical" if level >= 12 else "high",
                                    "title": f"Phishing detectado: {alert.get('agent_name', '')}",
                                    "detail": alert.get("rule_description", ""),
                                    "actions": ["block_ip", "sinkhole_domain", "dismiss"],
                                    "data": {"alert_id": alert_id, "agent_name": alert.get("agent_name", ""),
                                             "src_ip": alert.get("src_ip", ""), "dst_url": alert.get("dst_url", ""),
                                             "rule_level": level},
                                })
                            elif level > threshold:
                                severity = "critical" if level >= 12 else "high" if level >= 8 else "medium"
                                notifications.append({
                                    "type": "wazuh_alert",
                                    "level": severity,
                                    "title": f"Alerta nivel {level}: {alert.get('agent_name', '')}",
                                    "detail": alert.get("rule_description", ""),
                                    "actions": ["block_ip", "quarantine", "dismiss"],
                                    "data": {"alert_id": alert_id, "agent_name": alert.get("agent_name", ""),
                                             "agent_id": alert.get("agent_id", ""), "src_ip": alert.get("src_ip", ""),
                                             "rule_level": level, "mitre_technique": alert.get("mitre_technique", "")},
                                })
                        if alerts:
                            last_wazuh_alert_id = alerts[0].get("id", "")
                    except Exception as e:
                        logger.warning("ws_security_wazuh_poll_failed", error=str(e))

                # ── MikroTik polling (every 10s = tick % 2 == 0)
                if tick % 2 == 0 and not settings.should_mock_mikrotik:
                    try:
                        interfaces = await mt_service.get_interfaces()
                        for iface in interfaces:
                            name = iface.get("name", "")
                            running = iface.get("running", False)
                            was_running = last_interface_state.get(name)
                            if was_running is True and not running:
                                notifications.append({
                                    "type": "interface_down",
                                    "level": "critical",
                                    "title": f"Interfaz caída: {name}",
                                    "detail": f"La interfaz {name} ({iface.get('type', '')}) dejó de responder.",
                                    "actions": ["dismiss"],
                                    "data": {"interface": name, "type": iface.get("type", "")},
                                })
                            last_interface_state[name] = running
                    except Exception as e:
                        logger.warning("ws_security_mikrotik_poll_failed", error=str(e))

            if notifications:
                for notif in notifications:
                    try:
                        await websocket.send_json(notif)
                    except Exception:
                        break

            tick += 1
            await asyncio.sleep(5)

    except WebSocketDisconnect:
        security_alert_manager.disconnect(websocket)
    except Exception as e:
        logger.error("websocket_security_alerts_error", error=str(e))
        security_alert_manager.disconnect(websocket)


# ── WebSocket: Portal Cautivo Sessions ───────────────────────────

portal_session_manager = ConnectionManager()


@app.websocket("/ws/portal/sessions")
async def websocket_portal_sessions(websocket: WebSocket):
    """
    WebSocket endpoint for real-time Portal Cautivo session updates.
    Pushes active session state every 5 seconds.
    In mock mode: emits MockData.websocket.portal_session(tick) without calling MikroTik.
    """
    await portal_session_manager.connect(websocket)
    from services.portal_service import get_portal_service
    portal_service = get_portal_service()
    tick = 0

    try:
        while True:
            try:
                if settings.should_mock_mikrotik:
                    from services.mock_data import MockData
                    payload = MockData.websocket.portal_session(tick)
                    await websocket.send_json({"type": "portal_sessions", "data": payload})
                else:
                    status = await portal_service.check_hotspot_status()
                    if not status["initialized"]:
                        await websocket.send_json({
                            "type": "portal_error",
                            "data": {
                                "message": "Hotspot no inicializado. Ejecutá el setup desde Configuración → Inicializar Hotspot",
                                "code": "HOTSPOT_NOT_INITIALIZED",
                            },
                        })
                    else:
                        sessions = await portal_service.get_active_sessions()
                        chart_history = portal_service.get_session_chart_history()
                        await websocket.send_json({
                            "type": "portal_sessions",
                            "data": {
                                "sessions": sessions,
                                "chart_history": chart_history,
                                "timestamp": __import__("time").strftime("%Y-%m-%dT%H:%M:%S"),
                            },
                        })
            except Exception as e:
                await websocket.send_json({
                    "type": "error",
                    "data": {"message": f"Portal sessions error: {str(e)}"},
                })
            tick += 1
            await asyncio.sleep(5)
    except WebSocketDisconnect:
        portal_session_manager.disconnect(websocket)
    except Exception as e:
        logger.error("websocket_portal_sessions_error", error=str(e))
        portal_session_manager.disconnect(websocket)

# ── WebSocket: CrowdSec Decisions ─────────────────────────────

crowdsec_decision_manager = ConnectionManager()


@app.websocket("/ws/crowdsec/decisions")
async def websocket_crowdsec_decisions(websocket: WebSocket):
    """
    WebSocket endpoint for real-time CrowdSec decision stream.
    - Mock mode: emits a new decision every ~60s via crowdsec_decision_tick.
    - Real mode: polls GET /v1/decisions/stream every 10s.
    Frontend NotificationPanel subscribes to receive real-time block events.
    """
    await crowdsec_decision_manager.connect(websocket)
    cs_service = get_crowdsec_service()
    tick = 0

    try:
        while True:
            try:
                if settings.should_mock_crowdsec:
                    from services.mock_data import MockData
                    decision = MockData.websocket.crowdsec_decision_tick(tick)
                    if decision:
                        await websocket.send_json({
                            "type": "crowdsec_decision",
                            "data": decision,
                        })
                else:
                    stream = await cs_service.get_decisions_stream(startup=(tick == 0))
                    new_decisions = stream.get("new", [])
                    if new_decisions:
                        await websocket.send_json({
                            "type": "crowdsec_decision",
                            "data": {"decisions": new_decisions, "count": len(new_decisions)},
                        })
            except Exception as e:
                try:
                    if websocket.client_state.value == 1:  # CONNECTED
                        await websocket.send_json({
                            "type": "error",
                            "data": {"message": f"CrowdSec WS error: {str(e)}"},
                        })
                except Exception:
                    break  # WebSocket already closed, exit the loop
            tick += 1
            await asyncio.sleep(10)  # Poll every 10s
    except WebSocketDisconnect:
        crowdsec_decision_manager.disconnect(websocket)
    except Exception as e:
        logger.error("websocket_crowdsec_decisions_error", error=str(e))
        crowdsec_decision_manager.disconnect(websocket)


# ── WebSocket: Suricata Alerts ──────────────────────────────

suricata_alert_manager = ConnectionManager()


@app.websocket("/ws/suricata/alerts")
async def websocket_suricata_alerts(websocket: WebSocket):
    """
    WebSocket endpoint para alertas Suricata en tiempo real.
    - Mock mode: emite una alerta cada ~4 ticks (~20s) via suricata_alert_tick.
    - Real mode: consulta el Wazuh API cada 10s filtrando rule.groups=suricata.
    Frontend suricata/AlertsView se suscribe para recibir alertas sin polling.
    """
    await suricata_alert_manager.connect(websocket)
    wazuh_service = get_wazuh_service()
    last_alert_id: str | None = None
    tick = 0

    try:
        while True:
            try:
                if settings.should_mock_suricata:
                    from services.mock_data import MockData
                    alert = MockData.websocket.suricata_alert_tick(tick)
                    if alert:
                        await websocket.send_json({
                            "type": "suricata_alert",
                            "data": alert,
                        })
                else:
                    # Real: consultar Wazuh con rule.groups=suricata
                    sur_service = get_suricata_service()
                    alerts = await sur_service.get_alerts(limit=10)
                    if alerts and alerts[0].get("id") != last_alert_id:
                        last_alert_id = alerts[0].get("id")
                        await websocket.send_json({
                            "type": "suricata_alert",
                            "data": alerts[0],
                        })
            except Exception as e:
                await websocket.send_json({
                    "type": "error",
                    "data": {"message": f"Suricata WS error: {str(e)}"},
                })
            tick += 1
            await asyncio.sleep(5)  # Poll every 5s
    except WebSocketDisconnect:
        suricata_alert_manager.disconnect(websocket)
    except Exception as e:
        logger.error("websocket_suricata_alerts_error", error=str(e))
        suricata_alert_manager.disconnect(websocket)


# ── Run ───────────────────────────────────────────────────────────

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.is_development,
        log_level=settings.log_level.lower(),
    )
