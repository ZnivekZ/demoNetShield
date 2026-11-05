"""Runtime context must not erase Wazuh vulnerability findings."""

import os
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

os.environ.setdefault("JWT_SECRET_KEY", "0123456789abcdef0123456789abcdef")

from routers.wazuh import get_active_cve_inventory
from services.cve_usage import classify_cve_usage
from services.wazuh_service import WazuhService


class CveUsageClassificationTests(unittest.TestCase):
    def setUp(self):
        self.context = {
            "kernel_release": "6.8.0-45-generic",
            "os_scanned_at": "2026-11-05T10:00:00Z",
            "processes": [{"name": "nginx", "scanned_at": "2026-11-05T10:02:00Z"}],
        }

    def test_running_and_retained_kernel_versions(self):
        running = classify_cve_usage(
            {"package_name": "linux-image-6.8.0-45-generic", "package_version": "6.8.0-45.45"},
            self.context,
        )
        retained = classify_cve_usage(
            {"package_name": "linux-image-6.8.0-40-generic", "package_version": "6.8.0-40.40"},
            self.context,
        )
        self.assertEqual(running["usage_status"], "kernel_running")
        self.assertEqual(retained["usage_status"], "kernel_other_version")
        self.assertIn("6.8.0-45-generic", retained["usage_evidence"])
        self.assertEqual(retained["usage_checked_at"], self.context["os_scanned_at"])

    def test_process_match_is_only_a_clue_and_absence_is_unknown(self):
        self.assertEqual(classify_cve_usage({"package_name": "nginx"}, self.context)["usage_status"], "process_match")
        self.assertIn("versión en ejecución no comprobada",
                      classify_cve_usage({"package_name": "nginx"}, self.context)["usage_evidence"])
        self.assertEqual(classify_cve_usage({"package_name": "libssl3"}, self.context)["usage_status"], "unknown")
        self.assertEqual(classify_cve_usage({"package_name": "linux-image-6.8.0-40-generic"}, None)["usage_status"], "unknown")


class CveUsageWazuhTests(unittest.IsolatedAsyncioTestCase):
    async def test_syscollector_context_uses_running_release_and_process_scan(self):
        async def api(_method, path, **_kwargs):
            if path.endswith("/os"):
                return {"data": {"affected_items": [{"release": "6.8.0-45-generic", "scan": {"time": "2026-11-05T10:00:00Z"}}]}}
            return {"data": {"affected_items": [{"name": "nginx", "scan": {"time": "2026-11-05T10:02:00Z"}}]}}

        wazuh = WazuhService()
        with patch.object(wazuh, "_api_request", new=AsyncMock(side_effect=api)) as request:
            context = await wazuh.get_agent_cve_usage_context("001")
        self.assertEqual(context["kernel_release"], "6.8.0-45-generic")
        self.assertEqual(context["processes"][0]["name"], "nginx")
        self.assertEqual(request.await_count, 2)

    async def test_inventory_count_unchanged_when_kernel_not_running(self):
        finding = {
            "cve_id": "CVE-2026-12345", "agent_id": "001", "agent_name": "host",
            "package_name": "linux-image-6.8.0-40-generic", "package_version": "6.8.0-40.40",
            "severity": "high", "status": "", "cvss_score": 8.0,
        }
        indexer = SimpleNamespace(get_current_vulnerability_findings=AsyncMock(return_value=[finding]))
        kev = SimpleNamespace(is_loaded=lambda: True, refresh=AsyncMock(), entries_by_cve=lambda: {})
        wazuh = SimpleNamespace(get_agent_cve_usage_context=AsyncMock(return_value={
            "kernel_release": "6.8.0-45-generic", "os_scanned_at": "2026-11-05T10:00:00Z",
            "processes": [],
        }))
        with patch("routers.wazuh.get_indexer_client", return_value=indexer), \
             patch("routers.wazuh.get_cisa_kev_service", return_value=kev):
            result = await get_active_cve_inventory(
                page=1, page_size=20, severity=None, search=None, agent_id=None,
                kev_only=False, include_usage=True, service=wazuh,
            )
        self.assertTrue(result.success)
        self.assertEqual(result.data["pagination"]["total"], 1)
        self.assertEqual(result.data["items"][0]["agents"][0]["usage_status"], "kernel_other_version")
