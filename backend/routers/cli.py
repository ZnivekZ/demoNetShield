"""
CLI Router - Remote command execution for MikroTik and Wazuh agents.
Prefix: /api/cli

Security: MikroTik commands are limited to a whitelist of read-only paths.
Destructive commands (remove, set on critical resources) are BLOCKED.
"""

from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends

from schemas.common import APIResponse
from schemas.security import CLIMikrotikRequest, CLIWazuhAgentRequest
from services.mikrotik_service import MikroTikService, get_mikrotik_service
from services.wazuh_service import WazuhService, get_wazuh_service

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/api/cli", tags=["CLI"])


def get_mt_service() -> MikroTikService:
    return get_mikrotik_service()


def get_wz_service() -> WazuhService:
    return get_wazuh_service()


@router.post("/mikrotik")
async def execute_mikrotik_command(
    request: CLIMikrotikRequest,
    mikrotik: MikroTikService = Depends(get_mt_service),
) -> APIResponse:
    """
    [MikroTik API] Execute a read-only command on the MikroTik router.
    BLOCKED: Any command not in the whitelist of read-only paths.
    Only 'print' operations are allowed.
    """
    try:
        result = await mikrotik.execute_readonly_command(request.command)
        logger.info("api_cli_mikrotik_executed", command=request.command)
        return APIResponse.ok({
            "command": request.command,
            "output": result,
            "count": len(result),
        })
    except ValueError as e:
        # Path not in whitelist
        logger.warning("api_cli_mikrotik_blocked", command=request.command, error=str(e))
        return APIResponse.fail(str(e))
    except Exception as e:
        logger.error("api_cli_mikrotik_failed", command=request.command, error=str(e))
        return APIResponse.fail(f"Failed to execute command: {str(e)}")


@router.post("/wazuh-agent")
async def execute_wazuh_agent_action(
    request: CLIWazuhAgentRequest,
    wazuh: WazuhService = Depends(get_wz_service),
) -> APIResponse:
    """
    [Wazuh API] Execute an action on a Wazuh agent.
    Allowed actions: 'restart', 'status'
    """
    allowed_actions = {"restart", "status"}
    if request.action not in allowed_actions:
        return APIResponse.fail(
            f"Invalid action '{request.action}'. Allowed: {', '.join(allowed_actions)}"
        )

    try:
        if request.action == "restart":
            result = await wazuh.send_active_response(
                agent_id=request.agent_id,
                command="restart-wazuh0",
            )
            logger.info("api_cli_wazuh_restart", agent_id=request.agent_id)
            return APIResponse.ok({
                "action": "restart",
                "agent_id": request.agent_id,
                "result": result,
            })
        elif request.action == "status":
            # Get agent details as "status"
            agents = await wazuh.get_agents()
            target = None
            for agent in agents:
                if agent.get("id") == request.agent_id:
                    target = agent
                    break

            if not target:
                return APIResponse.fail(f"Agent {request.agent_id} not found")

            logger.info("api_cli_wazuh_status", agent_id=request.agent_id)
            return APIResponse.ok({
                "action": "status",
                "agent_id": request.agent_id,
                "agent": target,
            })

        return APIResponse.fail("Unknown action")
    except Exception as e:
        logger.error(
            "api_cli_wazuh_failed",
            agent_id=request.agent_id,
            action=request.action,
            error=str(e),
        )
        return APIResponse.fail(f"Failed to execute agent action: {str(e)}")
