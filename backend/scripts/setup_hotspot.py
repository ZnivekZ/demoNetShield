"""
Hotspot Setup Script — Configures MikroTik Hotspot from scratch via RouterOS API.

This script can be:
1. Run directly from CLI: python scripts/setup_hotspot.py
2. Called via the API endpoint: POST /api/portal/setup

MANUAL FALLBACK (WinBox/Terminal) if the API setup fails:
-----------------------------------------------------------
# Step 1: Create hotspot server
/ip hotspot setup
  (follow interactive wizard, choose ether2 as interface)

# Or via command line:
/ip hotspot server add name=hotspot1 interface=ether2 addresses-per-mac=2 idle-timeout=1h

# Step 2: Create hotspot profile
/ip hotspot profile add name=default login-by=http-chap,http-pap html-directory=hotspot

# Step 3: Create speed profiles
/ip hotspot user profile add name=unregistered rate-limit=512k/512k
/ip hotspot user profile add name=registered rate-limit=10M/10M

# Step 4: Verify setup
/ip hotspot print
/ip hotspot user profile print

-----------------------------------------------------------
"""

from __future__ import annotations

import asyncio
import sys
import os

# Allow running from CLI
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import structlog
from config import get_settings

logger = structlog.get_logger(__name__)


async def run_hotspot_setup() -> dict:
    """
    [MikroTik API] Initialize MikroTik Hotspot server from scratch.
    
    Resources configured:
      /ip/hotspot/server          — main Hotspot server
      /ip/hotspot/profile         — login/auth profile
      /ip/hotspot/user/profile    — speed profiles (unregistered + registered)

    Returns a detailed result dict with steps_completed, steps_failed, and message.
    Safe to run multiple times — checks if each component already exists before creating.
    """
    from services.mikrotik_service import get_mikrotik_service

    settings = get_settings()
    interface = settings.hotspot_interface
    server_name = settings.hotspot_server_name

    service = get_mikrotik_service()
    steps_completed: list[str] = []
    steps_failed: list[str] = []
    already_existed = False

    # ── Step 1: Check if Hotspot server already exists ────────────
    try:
        servers = await service._api_call("/ip/hotspot/server")
        existing_server = next((s for s in servers if s.get("name") == server_name), None)
        if existing_server:
            logger.info("hotspot_setup_server_exists", server=server_name)
            steps_completed.append(f"Servidor '{server_name}' ya existe — omitido")
            already_existed = True
        else:
            # Create hotspot server
            # Note: Full /ip/hotspot/setup via API requires interactive setup.
            # We use individual commands instead for programmatic control.
            await service._api_call(
                "/ip/hotspot/server",
                command="add",
                name=server_name,
                interface=interface,
                addresses_per_mac="2",
                idle_timeout="1h",
                # address-pool is created automatically by MikroTik in many versions
                # If it fails, run /ip hotspot setup manually in WinBox
            )
            logger.info("hotspot_setup_server_created", server=server_name, interface=interface)
            steps_completed.append(f"Servidor '{server_name}' creado en interfaz {interface}")
    except Exception as e:
        error_msg = str(e)
        logger.error("hotspot_setup_server_failed", error=error_msg)
        steps_failed.append(f"Servidor: {error_msg}")

    # ── Step 2: Create hotspot profile (login settings) ───────────
    try:
        profiles = await service._api_call("/ip/hotspot/profile")
        existing_profile = next((p for p in profiles if p.get("name") == "hsprof1" or p.get("name") == "default"), None)
        if existing_profile:
            steps_completed.append("Perfil de login ya existe — omitido")
        else:
            await service._api_call(
                "/ip/hotspot/profile",
                command="add",
                name="default",
                login_by="http-chap,http-pap",
                html_directory="hotspot",
            )
            logger.info("hotspot_setup_profile_created")
            steps_completed.append("Perfil de login 'default' creado")
    except Exception as e:
        error_msg = str(e)
        logger.error("hotspot_setup_profile_failed", error=error_msg)
        steps_failed.append(f"Perfil de login: {error_msg}")

    # ── Step 3: Create 'unregistered' speed profile ───────────────
    try:
        user_profiles = await service._api_call("/ip/hotspot/user/profile")
        existing_unreg = next((p for p in user_profiles if p.get("name") == "unregistered"), None)
        if existing_unreg:
            steps_completed.append("Perfil 'unregistered' ya existe — omitido")
        else:
            await service._api_call(
                "/ip/hotspot/user/profile",
                command="add",
                name="unregistered",
                rate_limit="512k/512k",
            )
            logger.info("hotspot_setup_unregistered_profile_created")
            steps_completed.append("Perfil 'unregistered' creado (512k/512k)")
    except Exception as e:
        error_msg = str(e)
        logger.error("hotspot_setup_unregistered_profile_failed", error=error_msg)
        steps_failed.append(f"Perfil 'unregistered': {error_msg}")

    # ── Step 4: Create 'registered' speed profile ─────────────────
    try:
        user_profiles = await service._api_call("/ip/hotspot/user/profile")
        existing_reg = next((p for p in user_profiles if p.get("name") == "registered"), None)
        if existing_reg:
            steps_completed.append("Perfil 'registered' ya existe — omitido")
        else:
            await service._api_call(
                "/ip/hotspot/user/profile",
                command="add",
                name="registered",
                rate_limit="10M/10M",
            )
            logger.info("hotspot_setup_registered_profile_created")
            steps_completed.append("Perfil 'registered' creado (10M/10M)")
    except Exception as e:
        error_msg = str(e)
        logger.error("hotspot_setup_registered_profile_failed", error=error_msg)
        steps_failed.append(f"Perfil 'registered': {error_msg}")

    # ── Result ────────────────────────────────────────────────────
    overall_success = len(steps_failed) == 0
    if already_existed and not steps_failed:
        message = f"Hotspot '{server_name}' ya estaba configurado. Todos los componentes verificados."
    elif overall_success:
        message = f"Hotspot '{server_name}' inicializado exitosamente en interfaz {interface}."
    else:
        message = f"Setup completado con {len(steps_failed)} error(es). Revisá los pasos fallidos."

    return {
        "success": overall_success,
        "steps_completed": steps_completed,
        "steps_failed": steps_failed,
        "message": message,
        "already_existed": already_existed,
    }


# ── CLI Entry Point ───────────────────────────────────────────────

if __name__ == "__main__":
    """
    Run setup from command line:
      cd backend
      source .venv/bin/activate
      python scripts/setup_hotspot.py
    """
    async def main():
        print("=== NetShield — MikroTik Hotspot Setup ===\n")
        result = await run_hotspot_setup()
        print(f"\nResultado: {'✓ OK' if result['success'] else '✗ ERRORES'}")
        print(f"Mensaje: {result['message']}\n")
        if result["steps_completed"]:
            print("Pasos completados:")
            for step in result["steps_completed"]:
                print(f"  ✓ {step}")
        if result["steps_failed"]:
            print("\nPasos fallidos:")
            for step in result["steps_failed"]:
                print(f"  ✗ {step}")
        print()

    asyncio.run(main())
