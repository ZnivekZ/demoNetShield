"""Regression checks for exact KEV matching and historical fuzzy digests."""

import asyncio
import json
import os
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

os.environ.setdefault("JWT_SECRET_KEY", "0123456789abcdef0123456789abcdef")

from services.cisa_kev_service import CisaKevService
from services.active_cve_inventory import build_active_cve_inventory
from services.digest_service import DigestService
from services.wazuh_indexer import WazuhIndexerClient
from routers.wazuh import get_active_cve_inventory


class CisaKevMatchingTests(unittest.TestCase):
    def setUp(self):
        self.kev = CisaKevService()
        self.old_catalog = self.kev._catalog
        self.old_loaded = self.kev._loaded
        self.kev._catalog = [
            {
                "cveID": "CVE-2024-1111",
                "vendorProject": "Example Vendor",
                "product": "Example App",
                "vulnerabilityName": "Example flaw",
                "dateAdded": "2024-01-01",
                "dueDate": "2024-02-01",
            },
            {
                "cveID": "CVE-2024-2222",
                "vendorProject": "Example Vendor",
                "product": "Other App",
                "vulnerabilityName": "Other flaw",
                "dateAdded": "2024-01-02",
                "dueDate": "2024-02-02",
            },
        ]
        self.kev._loaded = True

    def tearDown(self):
        self.kev._catalog = self.old_catalog
        self.kev._loaded = self.old_loaded

    def test_only_exact_cve_findings_are_confirmed_and_evidence_is_deduplicated(self):
        finding = {
            "cve_id": "cve-2024-1111",
            "agent_id": "001",
            "agent_name": "web-01",
            "package_name": "example-app",
            "package_version": "1.2.3",
            "detected_at": "2026-11-03T10:00:00Z",
            "severity": "high",
            "cvss_score": 8.1,
            "status": "active",
        }
        matches = self.kev.match_confirmed_vulnerabilities([
            finding, finding, {**finding, "cve_id": "CVE-2024-9999"},
            {**finding, "cve_id": "CVE-2024-2222", "status": "Solved"},
        ])
        self.assertEqual([m["cve_id"] for m in matches], ["CVE-2024-1111"])
        self.assertEqual(matches[0]["matched_agents"], ["web-01"])
        self.assertEqual(len(matches[0]["evidence"]), 1)
        self.assertEqual(matches[0]["evidence"][0]["package_version"], "1.2.3")
        self.assertEqual(matches[0]["evidence"][0]["severity"], "high")
        self.assertEqual(matches[0]["evidence"][0]["cvss_score"], 8.1)
        self.assertEqual(matches[0]["evidence"][0]["status"], "active")

    def test_vendor_only_match_remains_unverified(self):
        candidates = self.kev.match_against_inventory({
            "web-01": [{"vendor": "Example Vendor", "name": "unrelated", "version": "1"}]
        })
        # This broad match can produce both CVEs, but neither is confirmed.
        candidates = asyncio.run(candidates)
        self.assertEqual(len(candidates), 2)
        self.assertEqual(self.kev.match_confirmed_vulnerabilities([]), [])

    def test_legacy_fuzzy_digest_is_not_returned_as_confirmed(self):
        row = SimpleNamespace(
            id=1, date="2026-11-02", risk_level="red", risk_score=90,
            risk_reasoning="old result", delta_json="{}", agents_json="{}",
            cisa_json=json.dumps([{"cve_id": "CVE-2024-1111", "matched_agents": ["web-01"]}]),
            ai_summary=None, ai_model_used=None, ai_is_mock=True,
            ai_payload_sent=None, ai_generated_at=None, detector_healthy=True,
            detector_last_scan=None, generated_at=None, generation_method="manual",
        )
        digest = DigestService._row_to_dict(row)
        self.assertEqual(digest["cisa_kev_matches"], [])
        self.assertEqual(digest["cisa_kev_possible_matches"], [])
        self.assertEqual(digest["cisa_kev_status"], "needs_regeneration")
        self.assertEqual(digest["risk_score"], 0)

        row.cisa_json = json.dumps({
            "method": "wazuh_cve_id_v1", "status": "verified",
            "matches": [{"cve_id": "CVE-2024-1111", "evidence": []}],
            "possible_matches": [], "total_checked": 2,
            "last_updated": "2026-11-03T00:00:00Z",
        })
        old_exact = DigestService._row_to_dict(row)
        self.assertEqual(old_exact["cisa_kev_matches"], [])
        self.assertEqual(old_exact["cisa_kev_status"], "needs_regeneration")

        row.cisa_json = json.dumps({
            "method": "wazuh_active_cve_id_v2", "status": "verified",
            "matches": [{"cve_id": "CVE-2024-1111", "evidence": []}],
            "possible_matches": [], "total_checked": 2,
            "last_updated": "2026-11-03T00:00:00Z",
        })
        former = DigestService._row_to_dict(row)
        self.assertEqual(former["cisa_kev_status"], "needs_regeneration")
        row.cisa_json = json.dumps({
            "method": "wazuh_current_inventory_v3", "status": "verified",
            "matches": [{"cve_id": "CVE-2024-1111", "evidence": []}],
            "possible_matches": [], "total_checked": 2,
            "last_updated": "2026-11-03T00:00:00Z",
        })
        current = DigestService._row_to_dict(row)
        self.assertEqual(len(current["cisa_kev_matches"]), 1)
        self.assertEqual(current["cisa_kev_status"], "verified")
        self.assertEqual(current["cisa_kev_total_checked"], 2)


class WazuhFindingFetchTests(unittest.IsolatedAsyncioTestCase):
    async def test_scroll_reads_all_pages_and_skips_solved_findings(self):
        class FakeResponse:
            def __init__(self, data):
                self.data = data

            def raise_for_status(self):
                pass

            def json(self):
                return self.data

        class FakeClient:
            def __init__(self):
                self.pages = iter([
                    {"_scroll_id": "cursor", "hits": {"hits": [
                        {"_source": {"vulnerability": {"id": "CVE-2024-1111", "status": "Active", "severity": "High", "score": {"base": 8.1}}, "agent": {"id": "001"}}},
                        {"_source": {"vulnerability": {"id": "CVE-2024-2222", "status": "Solved"}, "agent": {"id": "001"}}},
                    ]}},
                    {"_scroll_id": "cursor", "hits": {"hits": [
                        {"_source": {"vulnerability": {"id": "CVE-2024-3333"}, "agent": {"id": "002"}}},
                    ]}},
                    {"_scroll_id": "cursor", "hits": {"hits": []}},
                ])
                self.cleared = False

            async def post(self, *_args, **_kwargs):
                return FakeResponse(next(self.pages))

            async def request(self, method, path, **_kwargs):
                self.cleared = method == "DELETE" and path == "/_search/scroll"
                return FakeResponse({})

        class FakeBreaker:
            def is_open(self):
                return False

            def record_success(self):
                pass

            def record_failure(self):
                raise AssertionError("Indexer request unexpectedly failed")

        indexer = WazuhIndexerClient()
        fake_client = FakeClient()
        with patch.object(indexer, "is_configured", return_value=True), \
             patch.object(indexer, "_get_client", return_value=fake_client), \
             patch.object(indexer, "_breaker", FakeBreaker()), \
             patch.object(indexer, "_request_lock", None):
            findings = await indexer.get_current_vulnerability_findings()

        self.assertEqual([f["cve_id"] for f in findings], ["CVE-2024-1111", "CVE-2024-3333"])
        self.assertEqual((findings[0]["status"], findings[0]["severity"], findings[0]["cvss_score"]), ("active", "high", 8.1))
        self.assertEqual(findings[1]["status"], "")
        self.assertTrue(fake_client.cleared)


class ActiveInventoryTests(unittest.TestCase):
    def test_groups_only_active_findings_and_preserves_kev_unknown(self):
        first = {
            "cve_id": "CVE-2024-1111", "status": "active", "agent_id": "001",
            "agent_name": "web-01", "package_name": "libfoo", "package_version": "1.0",
            "severity_reported": "high", "cvss_score": 8.1,
        }
        second = {**first, "agent_id": "002", "agent_name": "web-02", "severity_reported": "critical"}
        findings = [first, first, second, {**first, "cve_id": "CVE-2024-2222", "status": "Solved"},
                    {**first, "cve_id": "CVE-2024-3333", "status": ""}]
        rows = build_active_cve_inventory(findings, {"CVE-2024-1111": {"product": "Example App"}})
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0]["severity"], "critical")
        self.assertEqual(rows[0]["agent_count"], 2)
        self.assertEqual(len(rows[0]["agents"]), 2)
        self.assertEqual({item["severity"] for item in rows[0]["agents"]}, {"high", "critical"})
        self.assertTrue(rows[0]["is_kev"])
        self.assertEqual(rows[0]["kev_product"], "Example App")
        self.assertIsNone(next(row for row in rows if row["cve_id"] == "CVE-2024-3333")["agents"][0]["status"])
        self.assertIsNone(build_active_cve_inventory([first], None)[0]["is_kev"])


class ActiveInventoryRouteTests(unittest.IsolatedAsyncioTestCase):
    async def test_filters_kev_and_agent_after_grouping_active_findings(self):
        finding = {
            "cve_id": "CVE-2024-1111", "status": "active", "agent_id": "001",
            "agent_name": "web-01", "package_name": "libfoo", "package_version": "1.0",
            "severity_reported": "high", "cvss_score": 8.1,
        }
        fake_indexer = SimpleNamespace(get_current_vulnerability_findings=AsyncMock(return_value=[
            finding, {**finding, "agent_id": "002", "agent_name": "web-02"},
            {**finding, "cve_id": "CVE-2024-2222", "status": "Solved"},
        ]))
        fake_kev = SimpleNamespace(
            is_loaded=lambda: True,
            refresh=AsyncMock(),
            entries_by_cve=lambda: {"CVE-2024-1111": {"product": "Example App"}},
        )
        with patch("routers.wazuh.get_indexer_client", return_value=fake_indexer), \
             patch("routers.wazuh.get_cisa_kev_service", return_value=fake_kev):
            response = await get_active_cve_inventory(
                page=1, page_size=20, severity=None, search=None, agent_id="002", kev_only=True,
            )
        self.assertTrue(response.success)
        self.assertEqual(response.data["pagination"]["total"], 1)
        self.assertEqual(response.data["items"][0]["agent_count"], 1)
        self.assertEqual(response.data["items"][0]["agents"][0]["agent_id"], "002")
        self.assertEqual(response.data["summary"]["high"], 1)


if __name__ == "__main__":
    unittest.main()
