"""
CisaKevService — downloads and caches the CISA Known Exploited Vulnerabilities catalog.

Public JSON feed:
  https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json

Lifecycle:
  1. Backend startup → download JSON → parse → store in memory + data/cisa_kev.json
  2. Every 24h → background re-fetch (triggered by DigestService or APScheduler)
  3. If download fails → load from local cache file (data/cisa_kev.json)
  4. If local cache missing → catalog_size() == 0, matches return []

Matching logic:
  Confirmed findings join Wazuh vulnerability documents to KEV by exact CVE ID.
  Package-name/vendor matches are retained separately as unverified candidates.

Design:
  - Singleton (one shared catalog in memory).
  - Async refresh with httpx.
  - Graceful degradation: if CISA is unreachable, works offline from local cache.
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx
import structlog

logger = structlog.get_logger(__name__)

# ── Constants ──────────────────────────────────────────────────────────────────
CISA_KEV_URL   = "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json"
LOCAL_CACHE    = Path("data/cisa_kev.json")
REFRESH_HOURS  = 24


class CisaKevService:
    """
    Downloads, caches, and cross-references the CISA KEV catalog.
    Singleton — use get_cisa_kev_service().
    """

    _instance: CisaKevService | None = None

    def __new__(cls) -> CisaKevService:
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def __init__(self) -> None:
        if self._initialized:
            return
        self._initialized    = True
        self._catalog:  list[dict[str, Any]] = []  # parsed KEV entries
        self._loaded:   bool = False
        self._last_fetch: datetime | None = None

    # ── Public API ─────────────────────────────────────────────────────────────

    def is_loaded(self) -> bool:
        return self._loaded and len(self._catalog) > 0

    def catalog_size(self) -> int:
        return len(self._catalog)

    def entries_by_cve(self) -> dict[str, dict[str, Any]]:
        """Return catalog entries keyed by exact, normalized CVE ID."""
        if not self.is_loaded():
            return {}
        return {
            str(entry["cveID"]).strip().upper(): entry
            for entry in self._catalog
            if entry.get("cveID")
        }

    def last_updated(self) -> str | None:
        return self._last_fetch.isoformat() if self._last_fetch else None

    async def initialize(self) -> None:
        """
        Called once at backend startup.
        Tries network download; falls back to local cache on failure.
        """
        if not await self._try_download():
            self._try_load_local_cache()

    async def refresh(self) -> None:
        """
        Re-download the catalog if REFRESH_HOURS have passed since last fetch.
        Safe to call periodically from a scheduler.
        """
        if self._last_fetch is not None:
            hours_since = (datetime.now(timezone.utc) - self._last_fetch).total_seconds() / 3600
            if hours_since < REFRESH_HOURS:
                logger.debug("cisa_kev_refresh_skipped", hours_since=round(hours_since, 1))
                return
        await self._try_download()

    async def match_against_inventory(
        self, agents_packages: dict[str, list[dict]]
    ) -> list[dict[str, Any]]:
        """
        Find unverified KEV candidates in the software inventory.

        A name/vendor match alone does not establish that the installed version
        is vulnerable. Never use these candidates for the critical alert or score.

        Args:
            agents_packages: {agent_name: [{"name": str, "vendor": str, ...}]}

        Returns:
            List of CisaKevMatch dicts.
        """
        if not self.is_loaded():
            return []

        matches: list[dict[str, Any]] = []
        for kev in self._catalog:
            vendor_kw  = (kev.get("vendorProject") or "").lower()
            product_kw = (kev.get("product") or "").lower()
            if not vendor_kw and not product_kw:
                continue

            matched_agents:   list[str] = []
            matched_packages: list[str] = []

            for agent_name, pkgs in agents_packages.items():
                for pkg in pkgs:
                    pkg_name   = (pkg.get("name")   or "").lower()
                    pkg_vendor = (pkg.get("vendor")  or "").lower()
                    # Fuzzy match: either keyword appears as substring
                    if (product_kw and product_kw in pkg_name) or \
                       (vendor_kw  and vendor_kw  in pkg_vendor):
                        if agent_name not in matched_agents:
                            matched_agents.append(agent_name)
                        full_pkg = f"{pkg.get('name', '')} {pkg.get('version', '')}".strip()
                        if full_pkg not in matched_packages:
                            matched_packages.append(full_pkg)

            if matched_agents:
                matches.append({
                    "cve_id":             kev.get("cveID", ""),
                    "vendor":             kev.get("vendorProject", ""),
                    "product":            kev.get("product", ""),
                    "vulnerability_name": kev.get("vulnerabilityName", ""),
                    "date_added":         kev.get("dateAdded", ""),
                    "due_date":           kev.get("dueDate"),
                    "matched_agents":     matched_agents,
                    "matched_packages":   matched_packages,
                })

        logger.info(
            "cisa_kev_match_complete",
            total_kev=len(self._catalog),
            total_agents=len(agents_packages),
            matches=len(matches),
        )
        return matches

    def match_confirmed_vulnerabilities(
        self, findings: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        """Join current Wazuh vulnerability findings to KEV by exact CVE ID."""
        if not self.is_loaded():
            return []

        kev_by_cve = {
            str(entry.get("cveID") or "").strip().upper(): entry
            for entry in self._catalog
            if entry.get("cveID")
        }
        grouped: dict[str, dict[str, Any]] = {}
        seen_evidence: set[tuple[str, str, str, str]] = set()

        for finding in findings:
            if str(finding.get("status") or "").strip().lower() not in ("", "active"):
                continue
            cve_id = str(finding.get("cve_id") or "").strip().upper()
            kev = kev_by_cve.get(cve_id)
            if not kev:
                continue
            agent_id = str(finding.get("agent_id") or "").strip()
            agent_name = str(finding.get("agent_name") or "").strip()
            package_name = str(finding.get("package_name") or "").strip()
            package_version = str(finding.get("package_version") or "").strip()
            # A finding without an identifiable agent cannot be tied to inventory.
            if not (agent_id or agent_name):
                continue

            evidence_key = (cve_id, agent_id or agent_name, package_name, package_version)
            if evidence_key in seen_evidence:
                continue
            seen_evidence.add(evidence_key)

            match = grouped.setdefault(cve_id, {
                "cve_id": cve_id,
                "vendor": kev.get("vendorProject", ""),
                "product": kev.get("product", ""),
                "vulnerability_name": kev.get("vulnerabilityName", ""),
                "date_added": kev.get("dateAdded", ""),
                "due_date": kev.get("dueDate"),
                "matched_agents": [],
                "matched_packages": [],
                "evidence": [],
            })
            display_agent = agent_name or agent_id
            if display_agent not in match["matched_agents"]:
                match["matched_agents"].append(display_agent)
            display_package = f"{package_name} {package_version}".strip()
            if display_package and display_package not in match["matched_packages"]:
                match["matched_packages"].append(display_package)
            match["evidence"].append({
                "agent_id": agent_id,
                "agent_name": display_agent,
                "package_name": package_name,
                "package_version": package_version,
                "detected_at": finding.get("detected_at") or None,
                "severity": finding.get("severity_reported", finding.get("severity")) or None,
                "cvss_score": finding.get("cvss_score") or None,
                "status": finding.get("status") or None,
            })

        return [grouped[cve_id] for cve_id in sorted(grouped)]

    # ── Private helpers ────────────────────────────────────────────────────────

    async def _try_download(self) -> bool:
        """Download fresh catalog from CISA. Returns True on success."""
        try:
            async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as client:
                resp = await client.get(CISA_KEV_URL)
                resp.raise_for_status()
                data = resp.json()
                catalog = data.get("vulnerabilities", [])
                if not catalog:
                    logger.warning("cisa_kev_empty_response")
                    return False

                self._catalog    = catalog
                self._loaded     = True
                self._last_fetch = datetime.now(timezone.utc)

                # Persist locally as fallback
                self._save_local_cache(data)

                logger.info(
                    "cisa_kev_downloaded",
                    count=len(catalog),
                    catalog_version=data.get("catalogVersion", "?"),
                )
                return True

        except Exception as e:
            logger.warning("cisa_kev_download_failed", error=str(e))
            return False

    def _try_load_local_cache(self) -> None:
        """Load catalog from local file if it exists."""
        cache_path = Path(LOCAL_CACHE)
        if not cache_path.exists():
            logger.warning("cisa_kev_no_local_cache")
            return
        try:
            with cache_path.open("r", encoding="utf-8") as f:
                data = json.load(f)
            catalog = data.get("vulnerabilities", [])
            if catalog:
                self._catalog = catalog
                self._loaded  = True
                # Use file mtime as approximate last_fetch
                mtime = cache_path.stat().st_mtime
                self._last_fetch = datetime.fromtimestamp(mtime, tz=timezone.utc)
                logger.info(
                    "cisa_kev_loaded_from_cache",
                    count=len(catalog),
                    cache_path=str(cache_path),
                )
        except Exception as e:
            logger.error("cisa_kev_local_cache_load_failed", error=str(e))

    def _save_local_cache(self, data: dict) -> None:
        """Persist the downloaded JSON to local file as offline fallback."""
        try:
            cache_path = Path(LOCAL_CACHE)
            cache_path.parent.mkdir(parents=True, exist_ok=True)
            with cache_path.open("w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
            logger.debug("cisa_kev_cache_saved", path=str(cache_path))
        except Exception as e:
            logger.warning("cisa_kev_cache_save_failed", error=str(e))


# ── Singleton accessor ─────────────────────────────────────────────────────────

_cisa_kev_instance: CisaKevService | None = None


def get_cisa_kev_service() -> CisaKevService:
    """Get the global CisaKevService singleton."""
    return CisaKevService()
