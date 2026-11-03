"""Group Wazuh's explicitly active CVE findings for the vulnerability view."""

from __future__ import annotations

import re
from typing import Any


_CVE_ID = re.compile(r"^CVE-\d{4}-\d{4,}$")
_SEVERITY_RANK = {"unknown": 0, "low": 1, "medium": 2, "high": 3, "critical": 4}


def build_active_cve_inventory(
    findings: list[dict[str, Any]],
    kev_entries: dict[str, dict[str, Any]] | None,
) -> list[dict[str, Any]]:
    """Return one row per CVE, with only Active Wazuh evidence per agent/package.

    ``kev_entries=None`` means the catalog is unavailable, so KEV membership
    remains unknown instead of being incorrectly reported as false.
    """
    grouped: dict[str, dict[str, Any]] = {}
    evidence_keys: dict[str, set[tuple[str, str, str]]] = {}

    for finding in findings:
        if str(finding.get("status") or "").strip().lower() != "active":
            continue
        cve_id = str(finding.get("cve_id") or "").strip().upper()
        if not _CVE_ID.fullmatch(cve_id):
            continue
        agent_id = str(finding.get("agent_id") or "").strip()
        agent_name = str(finding.get("agent_name") or "").strip()
        if not (agent_id or agent_name):
            continue

        raw_severity = finding.get("severity_reported", finding.get("severity"))
        severity = str(raw_severity or "").strip().lower()
        if severity not in _SEVERITY_RANK:
            severity = "unknown"
        try:
            score = float(finding.get("cvss_score") or 0)
        except (TypeError, ValueError):
            score = 0.0
        package_name = str(finding.get("package_name") or "").strip()
        package_version = str(finding.get("package_version") or "").strip()
        key = (agent_id or agent_name, package_name, package_version)
        seen = evidence_keys.setdefault(cve_id, set())
        if key in seen:
            continue
        seen.add(key)

        kev_entry = kev_entries.get(cve_id) if kev_entries is not None else None
        row = grouped.setdefault(cve_id, {
            "cve_id": cve_id,
            "description": str(finding.get("description") or finding.get("title") or "").strip(),
            "severity": severity,
            "cvss_score": score if score > 0 else None,
            "is_kev": (kev_entry is not None) if kev_entries is not None else None,
            "kev_product": str(kev_entry.get("product") or "") if kev_entry else None,
            "agent_count": 0,
            "agents": [],
        })
        if not row["description"]:
            row["description"] = str(finding.get("description") or finding.get("title") or "").strip()
        if _SEVERITY_RANK[severity] > _SEVERITY_RANK[row["severity"]]:
            row["severity"] = severity
        if score > (row["cvss_score"] or 0):
            row["cvss_score"] = score
        row["agents"].append({
            "agent_id": agent_id,
            "agent_name": agent_name or agent_id,
            "package_name": package_name,
            "package_version": package_version,
            "detected_at": finding.get("detected_at") or None,
            "severity": severity,
            "cvss_score": score if score > 0 else None,
            "status": "active",
        })

    for row in grouped.values():
        row["agent_count"] = len({item["agent_id"] or item["agent_name"] for item in row["agents"]})
        row["agents"].sort(key=lambda item: (item["agent_name"].lower(), item["package_name"].lower()))

    return sorted(
        grouped.values(),
        key=lambda row: (
            -int(row["is_kev"] is True),
            -_SEVERITY_RANK[row["severity"]],
            -(row["cvss_score"] or 0),
            row["cve_id"],
        ),
    )
