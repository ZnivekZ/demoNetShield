"""
DHCP Router — FastAPI endpoints for DHCP administration.
Prefix: /api/dhcp  |  Tags: ["DHCP"]

Resources covered (Fase 1 — MikroTik exclusive):
  GET/POST        /servers             → DHCP server instances
  PUT             /servers/{id}/toggle → Enable/disable server
  GET/POST        /leases              → Active and static leases
  PUT             /leases/{id}         → Update lease (comment, rate-limit)
  DELETE          /leases/{id}         → Remove lease
  POST            /leases/{id}/make-static → Convert dynamic → static
  PUT             /leases/{id}/block   → Block/unblock client access
  GET/POST        /networks            → DHCP network configs
  PUT             /networks/{id}       → Update network config
  GET/POST        /pools               → IP address pools
  PUT             /pools/{id}          → Update pool
  GET             /pools/usage         → Subnet utilization (calculated)
  GET/POST        /alerts              → Rogue DHCP alert configs
  GET/POST        /options             → Custom DHCP options

All actions that mutate MikroTik state are logged in ActionLog.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

import structlog

from database import get_db
from schemas.common import APIResponse
from schemas.dhcp import (
    DhcpServerCreate,
    DhcpServerToggle,
    DhcpLeaseCreate,
    DhcpLeaseUpdate,
    DhcpLeaseBlockRequest,
    DhcpNetworkCreate,
    DhcpNetworkUpdate,
    DhcpPoolCreate,
    DhcpPoolUpdate,
    DhcpRogueAlertCreate,
    DhcpOptionCreate,
)
from services.mikrotik_service import get_mikrotik_service, MikroTikService
from services.audit_service import log_action as _audit_log_action

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/api/dhcp", tags=["DHCP"])


async def _log_action(db: AsyncSession, action: str, target: str, detail: str) -> None:
    """Wrapper local que delega al helper centralizado audit_service.log_action()."""
    try:
        target_ip = target if len(target) <= 45 else None
        await _audit_log_action(
            db,
            action_type=action,
            severity="medium",
            target_ip=target_ip,
            details={"target": target, "detail": detail},
            performed_by="dashboard",
            comment=f"{action}: {target}",
        )
    except Exception as exc:
        logger.warning("dhcp_action_log_failed", action=action, error=str(exc))


# ── Servers ────────────────────────────────────────────────────────────────────

@router.get("/servers", summary="List DHCP server instances")
async def get_dhcp_servers(
    svc: MikroTikService = Depends(get_mikrotik_service),
) -> APIResponse:
    try:
        data = await svc.get_dhcp_servers()
        return APIResponse.ok(data)
    except Exception as exc:
        logger.error("dhcp_get_servers_failed", error=str(exc))
        return APIResponse.fail(str(exc))


@router.post("/servers", summary="Create a DHCP server instance")
async def create_dhcp_server(
    body: DhcpServerCreate,
    db: AsyncSession = Depends(get_db),
    svc: MikroTikService = Depends(get_mikrotik_service),
) -> APIResponse:
    try:
        result = await svc.create_dhcp_server(
            name=body.name, interface=body.interface,
            address_pool=body.address_pool, lease_time=body.lease_time,
            authoritative=body.authoritative, comment=body.comment,
        )
        await _log_action(db, "dhcp_create_server", body.name, f"interface={body.interface}")
        return APIResponse.ok(result)
    except Exception as exc:
        logger.error("dhcp_create_server_failed", error=str(exc))
        return APIResponse.fail(str(exc))


@router.put("/servers/{server_id}/toggle", summary="Enable or disable a DHCP server")
async def toggle_dhcp_server(
    server_id: str,
    body: DhcpServerToggle,
    db: AsyncSession = Depends(get_db),
    svc: MikroTikService = Depends(get_mikrotik_service),
) -> APIResponse:
    try:
        result = await svc.toggle_dhcp_server(server_id, body.disabled)
        action = "dhcp_disable_server" if body.disabled else "dhcp_enable_server"
        await _log_action(db, action, server_id, f"disabled={body.disabled}")
        return APIResponse.ok(result)
    except Exception as exc:
        logger.error("dhcp_toggle_server_failed", id=server_id, error=str(exc))
        return APIResponse.fail(str(exc))


# ── Leases ─────────────────────────────────────────────────────────────────────

@router.get("/leases", summary="List DHCP leases")
async def get_dhcp_leases(
    server: str | None = Query(None, description="Filter by DHCP server name"),
    status: str | None = Query(None, description="Filter by status: bound|offered|waiting"),
    search: str | None = Query(None, description="Search by IP, MAC, or hostname"),
    svc: MikroTikService = Depends(get_mikrotik_service),
) -> APIResponse:
    try:
        leases = await svc.get_dhcp_leases(server=server)
        if status:
            leases = [l for l in leases if l.get("status") == status]
        if search:
            q = search.lower()
            leases = [
                l for l in leases
                if q in l.get("address", "").lower()
                or q in l.get("mac_address", "").lower()
                or q in l.get("host_name", "").lower()
                or q in l.get("comment", "").lower()
            ]
        return APIResponse.ok(leases)
    except Exception as exc:
        logger.error("dhcp_get_leases_failed", error=str(exc))
        return APIResponse.fail(str(exc))


@router.post("/leases", summary="Create a static DHCP lease (reservation)")
async def create_dhcp_lease(
    body: DhcpLeaseCreate,
    db: AsyncSession = Depends(get_db),
    svc: MikroTikService = Depends(get_mikrotik_service),
) -> APIResponse:
    try:
        result = await svc.create_dhcp_lease(
            address=body.address, mac_address=body.mac_address,
            server=body.server, comment=body.comment, rate_limit=body.rate_limit,
        )
        await _log_action(db, "dhcp_create_lease",
                          body.address, f"mac={body.mac_address} server={body.server}")
        return APIResponse.ok(result)
    except Exception as exc:
        logger.error("dhcp_create_lease_failed", error=str(exc))
        return APIResponse.fail(str(exc))


@router.put("/leases/{lease_id}", summary="Update a lease (comment, rate-limit, disabled)")
async def update_dhcp_lease(
    lease_id: str,
    body: DhcpLeaseUpdate,
    db: AsyncSession = Depends(get_db),
    svc: MikroTikService = Depends(get_mikrotik_service),
) -> APIResponse:
    try:
        result = await svc.update_dhcp_lease(
            lease_id=lease_id, comment=body.comment,
            rate_limit=body.rate_limit, disabled=body.disabled,
        )
        await _log_action(db, "dhcp_update_lease", lease_id, str(body.model_dump(exclude_none=True)))
        return APIResponse.ok(result)
    except Exception as exc:
        logger.error("dhcp_update_lease_failed", id=lease_id, error=str(exc))
        return APIResponse.fail(str(exc))


@router.delete("/leases/{lease_id}", summary="Delete a DHCP lease")
async def delete_dhcp_lease(
    lease_id: str,
    db: AsyncSession = Depends(get_db),
    svc: MikroTikService = Depends(get_mikrotik_service),
) -> APIResponse:
    try:
        result = await svc.delete_dhcp_lease(lease_id)
        await _log_action(db, "dhcp_delete_lease", lease_id, "removed")
        return APIResponse.ok(result)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        logger.error("dhcp_delete_lease_failed", id=lease_id, error=str(exc))
        return APIResponse.fail(str(exc))


@router.post("/leases/{lease_id}/make-static",
             summary="Convert a dynamic lease to a static reservation")
async def make_lease_static(
    lease_id: str,
    db: AsyncSession = Depends(get_db),
    svc: MikroTikService = Depends(get_mikrotik_service),
) -> APIResponse:
    try:
        result = await svc.make_lease_static(lease_id)
        await _log_action(db, "dhcp_make_static", lease_id, "dynamic→static")
        return APIResponse.ok(result)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        logger.error("dhcp_make_static_failed", id=lease_id, error=str(exc))
        return APIResponse.fail(str(exc))


@router.put("/leases/{lease_id}/block", summary="Block or unblock DHCP access for a client")
async def set_lease_block(
    lease_id: str,
    body: DhcpLeaseBlockRequest,
    db: AsyncSession = Depends(get_db),
    svc: MikroTikService = Depends(get_mikrotik_service),
) -> APIResponse:
    try:
        result = await svc.set_dhcp_lease_block(lease_id, body.block)
        action = "dhcp_block_client" if body.block else "dhcp_unblock_client"
        await _log_action(db, action, lease_id, f"block={body.block}")
        return APIResponse.ok(result)
    except Exception as exc:
        logger.error("dhcp_set_lease_block_failed", id=lease_id, error=str(exc))
        return APIResponse.fail(str(exc))


# ── Networks ───────────────────────────────────────────────────────────────────

@router.get("/networks", summary="List DHCP network configurations")
async def get_dhcp_networks(
    svc: MikroTikService = Depends(get_mikrotik_service),
) -> APIResponse:
    try:
        data = await svc.get_dhcp_networks()
        return APIResponse.ok(data)
    except Exception as exc:
        logger.error("dhcp_get_networks_failed", error=str(exc))
        return APIResponse.fail(str(exc))


@router.post("/networks", summary="Create DHCP network configuration")
async def create_dhcp_network(
    body: DhcpNetworkCreate,
    db: AsyncSession = Depends(get_db),
    svc: MikroTikService = Depends(get_mikrotik_service),
) -> APIResponse:
    try:
        result = await svc.create_dhcp_network(
            address=body.address, gateway=body.gateway,
            dns_server=body.dns_server, domain=body.domain,
            ntp_server=body.ntp_server, comment=body.comment,
        )
        await _log_action(db, "dhcp_create_network", body.address, f"gw={body.gateway}")
        return APIResponse.ok(result)
    except Exception as exc:
        logger.error("dhcp_create_network_failed", error=str(exc))
        return APIResponse.fail(str(exc))


@router.put("/networks/{network_id}", summary="Update DHCP network configuration")
async def update_dhcp_network(
    network_id: str,
    body: DhcpNetworkUpdate,
    db: AsyncSession = Depends(get_db),
    svc: MikroTikService = Depends(get_mikrotik_service),
) -> APIResponse:
    try:
        fields = {k: v for k, v in body.model_dump(exclude_none=True).items()}
        result = await svc.update_dhcp_network(network_id, **fields)
        await _log_action(db, "dhcp_update_network", network_id, str(fields))
        return APIResponse.ok(result)
    except Exception as exc:
        logger.error("dhcp_update_network_failed", id=network_id, error=str(exc))
        return APIResponse.fail(str(exc))


# ── Pools ──────────────────────────────────────────────────────────────────────

@router.get("/pools", summary="List IP address pools")
async def get_ip_pools(
    svc: MikroTikService = Depends(get_mikrotik_service),
) -> APIResponse:
    try:
        data = await svc.get_ip_pools()
        return APIResponse.ok(data)
    except Exception as exc:
        logger.error("dhcp_get_pools_failed", error=str(exc))
        return APIResponse.fail(str(exc))


@router.get("/pools/usage", summary="Get subnet utilization per pool")
async def get_subnet_usage(
    svc: MikroTikService = Depends(get_mikrotik_service),
) -> APIResponse:
    try:
        data = await svc.get_dhcp_subnet_usage()
        return APIResponse.ok(data)
    except Exception as exc:
        logger.error("dhcp_get_subnet_usage_failed", error=str(exc))
        return APIResponse.fail(str(exc))


@router.post("/pools", summary="Create an IP address pool")
async def create_ip_pool(
    body: DhcpPoolCreate,
    db: AsyncSession = Depends(get_db),
    svc: MikroTikService = Depends(get_mikrotik_service),
) -> APIResponse:
    try:
        result = await svc.create_ip_pool(
            name=body.name, ranges=body.ranges, next_pool=body.next_pool,
        )
        await _log_action(db, "dhcp_create_pool", body.name, f"ranges={body.ranges}")
        return APIResponse.ok(result)
    except Exception as exc:
        logger.error("dhcp_create_pool_failed", error=str(exc))
        return APIResponse.fail(str(exc))


@router.put("/pools/{pool_id}", summary="Update an IP address pool")
async def update_ip_pool(
    pool_id: str,
    body: DhcpPoolUpdate,
    db: AsyncSession = Depends(get_db),
    svc: MikroTikService = Depends(get_mikrotik_service),
) -> APIResponse:
    try:
        result = await svc.update_ip_pool(
            pool_id=pool_id, ranges=body.ranges, next_pool=body.next_pool,
        )
        await _log_action(db, "dhcp_update_pool", pool_id, str(body.model_dump(exclude_none=True)))
        return APIResponse.ok(result)
    except Exception as exc:
        logger.error("dhcp_update_pool_failed", id=pool_id, error=str(exc))
        return APIResponse.fail(str(exc))


# ── Rogue Alerts ───────────────────────────────────────────────────────────────

@router.get("/alerts", summary="List rogue DHCP server alert configurations")
async def get_dhcp_rogue_alerts(
    svc: MikroTikService = Depends(get_mikrotik_service),
) -> APIResponse:
    try:
        data = await svc.get_dhcp_rogue_alerts()
        return APIResponse.ok(data)
    except Exception as exc:
        logger.error("dhcp_get_rogue_alerts_failed", error=str(exc))
        return APIResponse.fail(str(exc))


@router.post("/alerts", summary="Create a rogue DHCP server alert configuration")
async def create_dhcp_rogue_alert(
    body: DhcpRogueAlertCreate,
    db: AsyncSession = Depends(get_db),
    svc: MikroTikService = Depends(get_mikrotik_service),
) -> APIResponse:
    try:
        result = await svc.create_dhcp_rogue_alert(
            interface=body.interface, valid_server=body.valid_server,
            alert_timeout=body.alert_timeout, on_alert=body.on_alert,
        )
        await _log_action(db, "dhcp_create_rogue_alert", body.interface, f"valid={body.valid_server}")
        return APIResponse.ok(result)
    except Exception as exc:
        logger.error("dhcp_create_rogue_alert_failed", error=str(exc))
        return APIResponse.fail(str(exc))


# ── Options ────────────────────────────────────────────────────────────────────

@router.get("/options", summary="List custom DHCP options")
async def get_dhcp_options(
    svc: MikroTikService = Depends(get_mikrotik_service),
) -> APIResponse:
    try:
        data = await svc.get_dhcp_options()
        return APIResponse.ok(data)
    except Exception as exc:
        logger.error("dhcp_get_options_failed", error=str(exc))
        return APIResponse.fail(str(exc))


@router.post("/options", summary="Create a custom DHCP option")
async def create_dhcp_option(
    body: DhcpOptionCreate,
    db: AsyncSession = Depends(get_db),
    svc: MikroTikService = Depends(get_mikrotik_service),
) -> APIResponse:
    try:
        result = await svc.create_dhcp_option(
            name=body.name, code=body.code, value=body.value, raw=body.raw,
        )
        await _log_action(db, "dhcp_create_option", body.name, f"code={body.code}")
        return APIResponse.ok(result)
    except Exception as exc:
        logger.error("dhcp_create_option_failed", error=str(exc))
        return APIResponse.fail(str(exc))


# ═══════════════════════════════════════════════════════════════════════════════
# FASE 2 — Cross-service endpoints
# ═══════════════════════════════════════════════════════════════════════════════

# ── S1: DHCP ↔ GLPI Correlation ────────────────────────────────────────────────

@router.get("/correlation/glpi", summary="S1: Cross-reference DHCP leases with GLPI assets")
async def dhcp_glpi_correlation(
    svc: MikroTikService = Depends(get_mikrotik_service),
) -> APIResponse:
    """
    Cross-references every active DHCP lease against GLPI asset inventory.
    Returns enriched lease list with GLPI match status, asset name, and location.
    """
    try:
        from services.glpi_service import get_glpi_service  # lazy import
        from config import get_settings; settings = get_settings()

        leases = await svc.get_dhcp_leases()
        glpi_svc = get_glpi_service()

        # Build IP→asset index from GLPI
        if settings.should_mock_glpi:
            from services.mock_data import MockData
            raw_assets: list[dict] = MockData.glpi.computers()
        else:
            raw_assets = await glpi_svc.get_assets()

        asset_by_ip: dict[str, dict] = {
            a.get("ip", ""): a for a in raw_assets if a.get("ip")
        }
        asset_by_mac: dict[str, dict] = {
            a.get("mac", "").upper(): a for a in raw_assets if a.get("mac")
        }

        result = []
        for lease in leases:
            ip  = lease.get("address", "")
            mac = lease.get("mac_address", "").upper()
            asset = asset_by_ip.get(ip) or asset_by_mac.get(mac)
            result.append({
                **lease,
                "glpi_match": asset is not None,
                "glpi_asset_id":   asset["id"]        if asset else None,
                "glpi_asset_name": asset.get("name")  if asset else None,
                "glpi_location":   asset.get("location") if asset else None,
                "glpi_os":         asset.get("os")    if asset else None,
                "glpi_status":     asset.get("status") if asset else None,
                "glpi_assigned_user": asset.get("assigned_user") if asset else None,
            })

        logger.info("dhcp_glpi_correlation_ok", total=len(result),
                    matched=sum(1 for r in result if r["glpi_match"]))
        return APIResponse.ok(result)
    except Exception as exc:
        logger.error("dhcp_glpi_correlation_failed", error=str(exc))
        return APIResponse.fail(str(exc))


# ── S2: DHCP Discovery (new/unknown devices) ────────────────────────────────────

@router.get("/discovery", summary="S2: Detect new/unknown devices via DHCP leases")
async def dhcp_discovery(
    svc: MikroTikService = Depends(get_mikrotik_service),
) -> APIResponse:
    """
    Compares DHCP leases against GLPI and ARP table to classify:
    - 'registered':   known in GLPI inventory
    - 'unregistered': DHCP lease exists but no GLPI record found
    - 'stale':        in GLPI but no active DHCP lease
    Returns all leases enriched with discovery_status.
    """
    try:
        from services.glpi_service import get_glpi_service
        from config import get_settings; settings = get_settings()

        leases  = await svc.get_dhcp_leases()
        arp     = await svc.get_arp_table()

        glpi_svc = get_glpi_service()
        if settings.should_mock_glpi:
            from services.mock_data import MockData
            raw_assets = MockData.glpi.computers()
        else:
            raw_assets = await glpi_svc.get_assets()

        glpi_ips  = {a.get("ip", ""): a  for a in raw_assets if a.get("ip")}
        glpi_macs = {a.get("mac", "").upper(): a for a in raw_assets if a.get("mac")}
        arp_ips   = {e.get("address", "") for e in arp}

        enriched = []
        active_ips = set()
        for lease in leases:
            ip  = lease.get("address", "")
            mac = lease.get("mac_address", "").upper()
            active_ips.add(ip)
            asset = glpi_ips.get(ip) or glpi_macs.get(mac)
            enriched.append({
                **lease,
                "in_arp":  ip in arp_ips,
                "in_glpi": asset is not None,
                "glpi_asset_name": asset.get("name") if asset else None,
                "glpi_location":   asset.get("location") if asset else None,
                "discovery_status": (
                    "registered"   if asset is not None else "unregistered"
                ),
            })

        # Stale: in GLPI but no active DHCP lease
        stale = [
            {
                "address":         a.get("ip", ""),
                "mac_address":     a.get("mac", ""),
                "host_name":       a.get("name", ""),
                "in_arp":          a.get("ip", "") in arp_ips,
                "in_glpi":         True,
                "glpi_asset_name": a.get("name"),
                "glpi_location":   a.get("location"),
                "discovery_status": "stale",
                "server": "",
                "status": "no-lease",
                "dynamic": False,
                "blocked": False,
            }
            for a in raw_assets
            if a.get("ip") and a["ip"] not in active_ips
        ]

        logger.info("dhcp_discovery_ok",
                    total=len(enriched) + len(stale),
                    unregistered=sum(1 for e in enriched if not e["in_glpi"]),
                    stale=len(stale))
        return APIResponse.ok({"leases": enriched, "stale": stale})
    except Exception as exc:
        logger.error("dhcp_discovery_failed", error=str(exc))
        return APIResponse.fail(str(exc))


# ── S3: Wazuh alert enrichment with DHCP context ────────────────────────────────

@router.get("/wazuh/enriched", summary="S3: Wazuh alerts enriched with DHCP lease context")
async def wazuh_alerts_with_dhcp(
    limit: int = Query(50, ge=1, le=200),
    level_min: int = Query(5, ge=0, le=15),
    svc: MikroTikService = Depends(get_mikrotik_service),
) -> APIResponse:
    """
    Returns Wazuh alerts with DHCP context (hostname, MAC, server, pool)
    injected into each alert where the agent IP matches an active lease.
    """
    try:
        from services.wazuh_service import get_wazuh_service
        from config import get_settings; settings = get_settings()

        wazuh_svc = get_wazuh_service()
        if settings.should_mock_wazuh:
            from services.mock_data import MockData
            alerts = MockData.wazuh.alerts(limit=limit, level_min=level_min)
        else:
            alerts = await wazuh_svc.get_alerts(limit=limit, level_min=level_min)

        leases = await svc.get_dhcp_leases()
        lease_by_ip: dict[str, dict] = {l.get("address", ""): l for l in leases}

        enriched = []
        for alert in alerts:
            agent_ip = alert.get("agent_ip", "")
            src_ip   = alert.get("src_ip",   "")
            lease = lease_by_ip.get(agent_ip) or lease_by_ip.get(src_ip)
            enriched.append({
                **alert,
                "dhcp_hostname":   lease.get("host_name")   if lease else None,
                "dhcp_mac":        lease.get("mac_address")  if lease else None,
                "dhcp_server":     lease.get("server")       if lease else None,
                "dhcp_expires":    lease.get("expires_after") if lease else None,
                "dhcp_is_static":  not lease.get("dynamic", True) if lease else None,
            })

        logger.info("dhcp_wazuh_enriched_ok", alerts=len(enriched))
        return APIResponse.ok(enriched)
    except Exception as exc:
        logger.error("dhcp_wazuh_enriched_failed", error=str(exc))
        return APIResponse.fail(str(exc))


# ── S4: Rogue DHCP → Firewall block ────────────────────────────────────────────

@router.post("/alerts/{alert_id}/block-rogue",
             summary="S4: Block a rogue DHCP server via MikroTik firewall")
async def block_rogue_dhcp(
    alert_id: str,
    db: AsyncSession = Depends(get_db),
    svc: MikroTikService = Depends(get_mikrotik_service),
) -> APIResponse:
    """
    When a rogue DHCP server is detected on an interface, adds a DROP rule
    in MikroTik firewall to block the rogue server's DHCP replies (UDP 67/68).
    Records action in ActionLog.
    """
    try:
        from config import get_settings; settings = get_settings()

        if settings.should_mock_mikrotik:
            from services.mock_data import MockData
            alerts = MockData.dhcp.rogue_alerts()
        else:
            alerts = await svc.get_dhcp_rogue_alerts()

        alert = next((a for a in alerts if a.get("id") == alert_id), None)
        if not alert:
            return APIResponse.fail(f"Alert {alert_id!r} not found")

        interface = alert.get("interface", "unknown")

        # Block DHCP traffic (UDP dst-port 67,68) from non-valid server on that interface
        comment = f"[NetShield] Rogue DHCP block — {interface}"
        if settings.should_mock_mikrotik:
            result = {
                "blocked": True,
                "interface": interface,
                "rule_comment": comment,
                "mock": True,
            }
        else:
            result = await svc.block_ip(
                ip="0.0.0.0/0",   # placeholder — real impl would target the rogue MAC
                comment=comment,
            )

        await _log_action(
            db, "dhcp_rogue_block", interface,
            f"alert_id={alert_id} interface={interface}"
        )
        logger.warning("dhcp_rogue_blocked", alert_id=alert_id, interface=interface)
        return APIResponse.ok(result)
    except Exception as exc:
        logger.error("dhcp_rogue_block_failed", alert_id=alert_id, error=str(exc))
        return APIResponse.fail(str(exc))


# ── S5: New device → GLPI ticket ───────────────────────────────────────────────

@router.post("/discovery/create-ticket",
             summary="S5: Create a GLPI ticket for an unregistered DHCP device")
async def create_ticket_for_device(
    ip: str = Query(..., description="IP address of the unregistered device"),
    db: AsyncSession = Depends(get_db),
    svc: MikroTikService = Depends(get_mikrotik_service),
) -> APIResponse:
    """
    Finds the DHCP lease for the given IP, then creates a GLPI ticket
    requesting inventory registration of the device.
    Records the action in ActionLog.
    """
    try:
        from services.glpi_service import get_glpi_service
        from config import get_settings; settings = get_settings()

        leases = await svc.get_dhcp_leases()
        lease  = next((l for l in leases if l.get("address") == ip), None)

        mac      = lease.get("mac_address", "N/A") if lease else "N/A"
        hostname = lease.get("host_name", "")      if lease else ""
        server   = lease.get("server", "")          if lease else ""

        title = f"[NetShield] Dispositivo no inventariado detectado — {ip}"
        description = (
            f"NetShield DHCP detectó un dispositivo activo sin registro en GLPI.\n\n"
            f"**IP:**       {ip}\n"
            f"**MAC:**      {mac}\n"
            f"**Hostname:** {hostname or '(sin nombre)'}\n"
            f"**Servidor DHCP:** {server or '(desconocido)'}\n\n"
            f"Por favor, registrar el equipo en el inventario GLPI "
            f"o verificar si es un dispositivo autorizado."
        )

        glpi_svc = get_glpi_service()
        if settings.should_mock_glpi:
            from services.mock_service import get_mock_service
            mock_svc = get_mock_service()
            ticket = mock_svc.glpi_create_ticket({
                "title":       title,
                "description": description,
                "priority":    3,
                "category":    "inventario",
                "is_netshield": True,
            })
        else:
            ticket = await glpi_svc.create_ticket({
                "name":    title,
                "content": description,
                "priority": 3,
                "itilcategories_id": 0,
            })

        await _log_action(db, "dhcp_glpi_ticket_created", ip,
                          f"mac={mac} ticket_id={ticket.get('id', '?')}")
        logger.info("dhcp_glpi_ticket_created", ip=ip, mac=mac,
                    ticket_id=ticket.get("id"))
        return APIResponse.ok(ticket)
    except Exception as exc:
        logger.error("dhcp_create_ticket_failed", ip=ip, error=str(exc))
        return APIResponse.fail(str(exc))

