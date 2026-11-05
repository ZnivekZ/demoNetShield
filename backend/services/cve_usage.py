"""Conservative runtime context for current Wazuh vulnerability findings."""

from __future__ import annotations

import asyncio
import re
from typing import Any


_LINUX_IMAGE = re.compile(r"^linux-image-(?:unsigned-)?(\d[\w.+~-]+)$", re.I)
_KERNEL_PACKAGE = re.compile(r"^(?:kernel|kernel-core|kernel-default|kernel-uek)$", re.I)
_ARCH_SUFFIX = re.compile(r"\.(?:x86_64|aarch64|amd64|arm64)$", re.I)


def is_versioned_kernel_package(name: str) -> bool:
    return bool(_LINUX_IMAGE.fullmatch(name.strip()) or _KERNEL_PACKAGE.fullmatch(name.strip()))


def _kernel_package_release(name: str, version: str) -> str:
    match = _LINUX_IMAGE.fullmatch(name.strip())
    if match:
        return match.group(1)
    if _KERNEL_PACKAGE.fullmatch(name.strip()):
        return version.strip().split(":", 1)[-1]
    return ""


def _process_match_candidate(name: str) -> bool:
    return bool(name and re.fullmatch(r"[\w.+-]+", name))


def classify_cve_usage(finding: dict[str, Any], context: dict[str, Any] | None) -> dict[str, Any]:
    """Add evidence without changing Wazuh's CVE or severity.

    A matching process name is only a clue: it does not bind that process to an
    installed package version. Lack of a match never establishes non-use.
    """
    name = str(finding.get("package_name") or finding.get("package") or "").strip()
    version = str(finding.get("package_version") or finding.get("version") or "").strip()
    unknown = {"usage_status": "unknown", "usage_evidence": "Uso no comprobado con los datos disponibles", "usage_checked_at": None}
    if not context:
        return unknown

    if is_versioned_kernel_package(name):
        observed = str(context.get("kernel_release") or "").strip()
        installed = _kernel_package_release(name, version)
        if not observed or not installed:
            return unknown
        installed = _ARCH_SUFFIX.sub("", installed)
        observed = _ARCH_SUFFIX.sub("", observed)
        if installed == observed:
            return {
                "usage_status": "kernel_running",
                "usage_evidence": f"Kernel informado en ejecución: {observed}",
                "usage_checked_at": context.get("os_scanned_at"),
            }
        return {
            "usage_status": "kernel_other_version",
            "usage_evidence": f"Paquete {installed}; kernel informado en ejecución: {observed}",
            "usage_checked_at": context.get("os_scanned_at"),
        }

    # Exact process/package name is a clue, never proof of the loaded version.
    if _process_match_candidate(name):
        for process in context.get("processes") or []:
            process_name = str(process.get("name") or process.get("cmd") or "").strip()
            if process_name.lower().removesuffix(".exe") == name.lower().removesuffix(".exe"):
                return {
                    "usage_status": "process_match",
                    "usage_evidence": f"Proceso con nombre coincidente: {process_name}; versión en ejecución no comprobada",
                    "usage_checked_at": process.get("scanned_at") or context.get("process_scanned_at"),
                }
    return unknown


async def get_usage_contexts(
    wazuh: Any, findings: list[dict[str, Any]], *, max_agents: int = 100,
) -> dict[str, dict[str, Any]]:
    """Best-effort context for visible agents, with bounded API work.

    Missing context is represented as unknown by classify_cve_usage.
    """
    agent_ids = list(dict.fromkeys(str(f.get("agent_id") or "") for f in findings if f.get("agent_id")))[:max_agents]
    semaphore = asyncio.Semaphore(6)

    async def fetch(agent_id: str) -> tuple[str, dict[str, Any] | None]:
        agent_findings = [f for f in findings if str(f.get("agent_id") or "") == agent_id]
        include_processes = any(_process_match_candidate(str(f.get("package_name") or f.get("package") or ""))
                                and not is_versioned_kernel_package(str(f.get("package_name") or f.get("package") or ""))
                                for f in agent_findings)
        try:
            async with semaphore:
                context = await asyncio.wait_for(
                    wazuh.get_agent_cve_usage_context(agent_id, include_processes=include_processes),
                    timeout=16.0,
                )
            return agent_id, context
        except Exception:
            return agent_id, None

    tasks = [asyncio.create_task(fetch(agent_id)) for agent_id in agent_ids]
    if not tasks:
        return {}
    done, pending = await asyncio.wait(tasks, timeout=16.0)
    for task in pending:
        task.cancel()
    if pending:
        await asyncio.gather(*pending, return_exceptions=True)
    return dict(task.result() for task in done if not task.cancelled() and task.exception() is None)
