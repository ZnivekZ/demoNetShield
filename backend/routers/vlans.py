"""
VLANs Router - Endpoints for VLAN management via RouterOS API.
Prefix: /api/mikrotik/vlans
"""

from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends

from schemas.common import APIResponse
from schemas.vlan import VlanCreate, VlanUpdate
from services.mikrotik_service import MikroTikService, get_mikrotik_service
from services.wazuh_service import WazuhService, get_wazuh_service

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/api/mikrotik/vlans", tags=["VLANs"])


def get_mt_service() -> MikroTikService:
    return get_mikrotik_service()


def get_wz_service() -> WazuhService:
    return get_wazuh_service()


@router.get("/")
async def get_vlans(
    service: MikroTikService = Depends(get_mt_service),
) -> APIResponse:
    """List all VLAN interfaces configured on the MikroTik CHR."""
    try:
        data = await service.get_vlans()
        return APIResponse.ok(data)
    except Exception as e:
        logger.error("api_get_vlans_failed", error=str(e))
        return APIResponse.fail(f"Failed to fetch VLANs: {str(e)}")


@router.post("/")
async def create_vlan(
    request: VlanCreate,
    service: MikroTikService = Depends(get_mt_service),
) -> APIResponse:
    """Create a new VLAN interface on the MikroTik CHR."""
    try:
        data = await service.create_vlan(
            vlan_id=request.vlan_id,
            name=request.name,
            interface=request.interface,
            comment=request.comment,
        )
        logger.info(
            "api_vlan_created",
            vlan_id=request.vlan_id,
            name=request.name,
        )
        return APIResponse.ok(data)
    except Exception as e:
        logger.error("api_create_vlan_failed", vlan_id=request.vlan_id, error=str(e))
        return APIResponse.fail(f"Failed to create VLAN: {str(e)}")


@router.put("/{vlan_id}")
async def update_vlan(
    vlan_id: str,
    request: VlanUpdate,
    service: MikroTikService = Depends(get_mt_service),
) -> APIResponse:
    """
    Update a VLAN's name or comment.
    vlan_id here is the RouterOS internal ID (e.g. *1A).
    """
    try:
        data = await service.update_vlan(
            vlan_ros_id=vlan_id,
            name=request.name,
            comment=request.comment,
        )
        logger.info("api_vlan_updated", ros_id=vlan_id)
        return APIResponse.ok(data)
    except Exception as e:
        logger.error("api_update_vlan_failed", ros_id=vlan_id, error=str(e))
        return APIResponse.fail(f"Failed to update VLAN: {str(e)}")


@router.delete("/{vlan_id}")
async def delete_vlan(
    vlan_id: str,
    service: MikroTikService = Depends(get_mt_service),
) -> APIResponse:
    """
    Delete a VLAN interface from the MikroTik CHR.
    vlan_id is the RouterOS internal ID.
    """
    try:
        data = await service.delete_vlan(vlan_ros_id=vlan_id)
        logger.info("api_vlan_deleted", ros_id=vlan_id)
        return APIResponse.ok(data)
    except Exception as e:
        logger.error("api_delete_vlan_failed", ros_id=vlan_id, error=str(e))
        return APIResponse.fail(f"Failed to delete VLAN: {str(e)}")


@router.get("/traffic/all")
async def get_all_vlan_traffic(
    service: MikroTikService = Depends(get_mt_service),
) -> APIResponse:
    """Get real-time traffic data for all VLANs."""
    try:
        data = await service.get_vlan_traffic()
        return APIResponse.ok(data)
    except Exception as e:
        logger.error("api_get_all_vlan_traffic_failed", error=str(e))
        return APIResponse.fail(f"Failed to fetch VLAN traffic: {str(e)}")


@router.get("/{vlan_id}/traffic")
async def get_vlan_traffic(
    vlan_id: int,
    service: MikroTikService = Depends(get_mt_service),
) -> APIResponse:
    """Get real-time traffic data for a specific VLAN by vlan-id."""
    try:
        all_traffic = await service.get_vlan_traffic()
        vlan_traffic = [t for t in all_traffic if t["vlan_id"] == vlan_id]
        if not vlan_traffic:
            return APIResponse.ok({"vlan_id": vlan_id, "rx_bps": 0, "tx_bps": 0, "status": "ok"})
        return APIResponse.ok(vlan_traffic[0])
    except Exception as e:
        logger.error("api_get_vlan_traffic_failed", vlan_id=vlan_id, error=str(e))
        return APIResponse.fail(f"Failed to fetch VLAN traffic: {str(e)}")


@router.get("/{vlan_id}/alerts")
async def get_vlan_alerts(
    vlan_id: int,
    service: MikroTikService = Depends(get_mt_service),
    wazuh: WazuhService = Depends(get_wz_service),
) -> APIResponse:
    """
    Get active Wazuh alerts associated with a specific VLAN.
    Correlates alert IPs against the subnet assigned to the VLAN interface.
    """
    try:
        import ipaddress

        # Get VLAN interfaces to find the name for this vlan-id
        vlans = await service.get_vlans()
        vlan_info = next((v for v in vlans if v["vlan_id"] == vlan_id), None)
        if not vlan_info:
            return APIResponse.fail(f"VLAN {vlan_id} not found")

        # Get IP addresses assigned to VLAN interfaces
        addresses = await service.get_vlan_addresses()
        vlan_subnets = []
        for addr in addresses:
            if addr["interface"] == vlan_info["name"]:
                try:
                    network = ipaddress.ip_network(addr["address"], strict=False)
                    vlan_subnets.append(network)
                except ValueError:
                    pass

        if not vlan_subnets:
            return APIResponse.ok([])

        # Get recent alerts from Wazuh
        alerts = await wazuh.get_alerts(limit=100)
        matching_alerts = []
        for alert in alerts:
            src_ip = alert.get("src_ip", "")
            dst_ip = alert.get("dst_ip", "")
            agent_ip = alert.get("agent_ip", "")
            for ip_str in [src_ip, dst_ip, agent_ip]:
                if not ip_str:
                    continue
                try:
                    ip = ipaddress.ip_address(ip_str)
                    if any(ip in subnet for subnet in vlan_subnets):
                        matching_alerts.append(alert)
                        break
                except ValueError:
                    pass

        return APIResponse.ok(matching_alerts)
    except Exception as e:
        logger.error("api_get_vlan_alerts_failed", vlan_id=vlan_id, error=str(e))
        return APIResponse.fail(f"Failed to fetch VLAN alerts: {str(e)}")
