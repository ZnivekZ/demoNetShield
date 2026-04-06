"""
Network Router - IP labels, groups, network management, and unified search.
Prefix: /api/network
"""

from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from database import get_db
from models.ip_group import IPGroup, IPGroupMember
from models.ip_label import IPLabel
from schemas.common import APIResponse
from schemas.network import (
    IPGroupCreate,
    IPGroupMemberAdd,
    IPGroupResponse,
    IPLabelCreate,
    IPLabelResponse,
)

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/api/network", tags=["Network"])


# ── Labels ────────────────────────────────────────────────────────


@router.post("/labels")
async def create_label(
    request: IPLabelCreate,
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """
    Assign a label to an IP address.
    Updates existing label if one already exists for the IP.
    """
    try:
        # Check for existing label on this IP
        result = await db.execute(
            select(IPLabel).where(IPLabel.ip_address == request.ip_address)
        )
        existing = result.scalar_one_or_none()

        if existing:
            existing.label = request.label
            existing.description = request.description
            existing.color = request.color
            existing.criteria = request.criteria
            await db.flush()
            await db.refresh(existing)
            label_data = IPLabelResponse.model_validate(existing)
        else:
            new_label = IPLabel(
                ip_address=request.ip_address,
                label=request.label,
                description=request.description,
                color=request.color,
                criteria=request.criteria,
            )
            db.add(new_label)
            await db.flush()
            await db.refresh(new_label)
            label_data = IPLabelResponse.model_validate(new_label)

        logger.info(
            "label_assigned",
            ip=request.ip_address,
            label=request.label,
        )
        return APIResponse.ok(label_data.model_dump())
    except Exception as e:
        logger.error("create_label_failed", error=str(e))
        return APIResponse.fail(f"Failed to assign label: {str(e)}")


@router.get("/labels")
async def list_labels(
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """List all IP labels."""
    try:
        result = await db.execute(select(IPLabel).order_by(IPLabel.created_at.desc()))
        labels = result.scalars().all()
        data = [IPLabelResponse.model_validate(l).model_dump() for l in labels]
        return APIResponse.ok(data)
    except Exception as e:
        logger.error("list_labels_failed", error=str(e))
        return APIResponse.fail(f"Failed to list labels: {str(e)}")


@router.delete("/labels/{label_id}")
async def delete_label(
    label_id: int,
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """Delete an IP label by ID."""
    try:
        result = await db.execute(select(IPLabel).where(IPLabel.id == label_id))
        label = result.scalar_one_or_none()
        if not label:
            return APIResponse.fail(f"Label {label_id} not found")
        await db.delete(label)
        await db.flush()
        return APIResponse.ok({"deleted": label_id})
    except Exception as e:
        logger.error("delete_label_failed", error=str(e))
        return APIResponse.fail(f"Failed to delete label: {str(e)}")


# ── Groups ────────────────────────────────────────────────────────


@router.post("/groups")
async def create_group(
    request: IPGroupCreate,
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """Create a new IP group with optional criteria."""
    try:
        new_group = IPGroup(
            name=request.name,
            description=request.description,
            color=request.color,
            criteria=request.criteria,
        )
        db.add(new_group)
        await db.flush()
        await db.refresh(new_group)
        group_data = IPGroupResponse.model_validate(new_group)
        logger.info("group_created", name=request.name)
        return APIResponse.ok(group_data.model_dump())
    except Exception as e:
        logger.error("create_group_failed", error=str(e))
        return APIResponse.fail(f"Failed to create group: {str(e)}")


@router.get("/groups")
async def list_groups(
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """List all IP groups with their members."""
    try:
        result = await db.execute(
            select(IPGroup)
            .options(selectinload(IPGroup.members))
            .order_by(IPGroup.created_at.desc())
        )
        groups = result.scalars().all()
        data = [IPGroupResponse.model_validate(g).model_dump() for g in groups]
        return APIResponse.ok(data)
    except Exception as e:
        logger.error("list_groups_failed", error=str(e))
        return APIResponse.fail(f"Failed to list groups: {str(e)}")


@router.post("/groups/{group_id}/members")
async def add_group_member(
    group_id: int,
    request: IPGroupMemberAdd,
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """Add an IP address to a group."""
    try:
        # Verify group exists
        result = await db.execute(select(IPGroup).where(IPGroup.id == group_id))
        group = result.scalar_one_or_none()
        if not group:
            return APIResponse.fail(f"Group {group_id} not found")

        member = IPGroupMember(
            group_id=group_id,
            ip_address=request.ip_address,
            added_reason=request.reason,
        )
        db.add(member)
        await db.flush()

        logger.info(
            "group_member_added",
            group=group.name,
            ip=request.ip_address,
        )
        return APIResponse.ok({
            "group_id": group_id,
            "ip_address": request.ip_address,
            "reason": request.reason,
        })
    except Exception as e:
        logger.error("add_group_member_failed", error=str(e))
        return APIResponse.fail(f"Failed to add member: {str(e)}")


@router.delete("/groups/{group_id}/members/{ip_address}")
async def remove_group_member(
    group_id: int,
    ip_address: str,
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """Remove an IP from a group."""
    try:
        result = await db.execute(
            select(IPGroupMember).where(
                IPGroupMember.group_id == group_id,
                IPGroupMember.ip_address == ip_address,
            )
        )
        member = result.scalar_one_or_none()
        if not member:
            return APIResponse.fail("Member not found in group")
        await db.delete(member)
        await db.flush()
        return APIResponse.ok({"removed": ip_address, "group_id": group_id})
    except Exception as e:
        logger.error("remove_group_member_failed", error=str(e))
        return APIResponse.fail(f"Failed to remove member: {str(e)}")


@router.delete("/groups/{group_id}")
async def delete_group(
    group_id: int,
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """Delete an IP group and all its members."""
    try:
        result = await db.execute(select(IPGroup).where(IPGroup.id == group_id))
        group = result.scalar_one_or_none()
        if not group:
            return APIResponse.fail(f"Group {group_id} not found")
        await db.delete(group)
        await db.flush()
        return APIResponse.ok({"deleted": group_id})
    except Exception as e:
        logger.error("delete_group_failed", error=str(e))
        return APIResponse.fail(f"Failed to delete group: {str(e)}")


# ── Unified Search ────────────────────────────────────────────────


@router.get("/search")
async def network_search(
    query: str = Query(..., min_length=1, description="IP or MAC address to search"),
) -> APIResponse:
    """
    [Ambas + GLPI] Unified search across MikroTik ARP, Wazuh agents/alerts, and GLPI inventory.
    Searches by IP or MAC address and returns combined results.
    Extended to include GLPI asset match (glpi_match field).
    """
    from services.mikrotik_service import get_mikrotik_service
    from services.wazuh_service import get_wazuh_service
    from services.glpi_service import get_glpi_service
    from config import get_settings

    mt_service = get_mikrotik_service()
    wz_service = get_wazuh_service()
    glpi_service = get_glpi_service()

    result = {
        "query": query,
        "arp_match": None,
        "agent_match": None,
        "recent_alerts": [],
        "glpi_match": None,  # New: GLPI asset if found
    }

    # Search MikroTik ARP
    try:
        is_mac = ":" in query and len(query) > 6
        arp_results = await mt_service.search_arp(
            ip=None if is_mac else query,
            mac=query if is_mac else None,
        )
        if arp_results:
            result["arp_match"] = arp_results[0]
    except Exception as e:
        logger.warning("network_search_arp_failed", error=str(e))

    # Search Wazuh agents
    try:
        agents = await wz_service.get_agents()
        for agent in agents:
            if query.lower() in (agent.get("ip", "").lower(), agent.get("name", "").lower()):
                result["agent_match"] = agent
                break
    except Exception as e:
        logger.warning("network_search_agents_failed", error=str(e))

    # Get recent alerts for this IP
    try:
        alerts = await wz_service.get_alerts(limit=100)
        matching = [
            a for a in alerts
            if query.lower() in (
                a.get("src_ip", "").lower(),
                a.get("dst_ip", "").lower(),
                a.get("agent_ip", "").lower(),
            )
        ][:5]  # Last 5 alerts
        result["recent_alerts"] = matching
    except Exception as e:
        logger.warning("network_search_alerts_failed", error=str(e))

    # Search GLPI inventory (non-blocking — GLPI may be unavailable in lab)
    try:
        settings = get_settings()
        is_lab = settings.app_env in ("lab", "development")
        glpi_available = await glpi_service.is_available()

        if glpi_available:
            glpi_results = await glpi_service.search_computers(query)
            if glpi_results:
                result["glpi_match"] = glpi_results[0]
        elif is_lab:
            # Mock: try to match against mock computers
            mock_computers = glpi_service._generate_mock_computers(limit=20)
            ql = query.lower()
            for c in mock_computers:
                if ql in c["name"].lower() or ql in (c.get("ip") or "").lower():
                    result["glpi_match"] = {**c, "mock": True}
                    break
    except Exception as e:
        logger.warning("network_search_glpi_failed", error=str(e))

    return APIResponse.ok(result)

