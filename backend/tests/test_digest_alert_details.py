"""Check the compact rule comparison saved with each agent's Digest."""

import os
import unittest
from datetime import datetime, timezone
from unittest.mock import patch

os.environ.setdefault("JWT_SECRET_KEY", "0123456789abcdef0123456789abcdef")

from services.digest_service import DigestService, _stored_utc_iso, _summarize_alert_types


class DigestAlertDetailTests(unittest.TestCase):
    def test_sqlite_naive_digest_time_is_utc(self):
        self.assertEqual(
            _stored_utc_iso(datetime(2026, 11, 4, 23, 0)),
            "2026-11-04T23:00:00+00:00",
        )

    def test_groups_new_recurring_and_previous_only_rule_types(self):
        def alert(rule_id, description, level):
            return {"rule": {"id": rule_id, "description": description, "level": level}}

        today = [
            alert("100", "Inicio de sesión fallido", 10),
            alert("100", "Inicio de sesión fallido", 10),
            alert("200", "Archivo modificado", 12),
        ]
        yesterday = [
            alert("100", "Inicio de sesión fallido", 10),
            alert("300", "Servicio detenido", 7),
        ]

        details = _summarize_alert_types(today, yesterday)
        by_id = {item["rule_id"]: item for item in details}

        self.assertEqual((by_id["100"]["today_count"], by_id["100"]["yesterday_count"]), (2, 1))
        self.assertEqual((by_id["200"]["today_count"], by_id["200"]["yesterday_count"]), (1, 0))
        self.assertEqual((by_id["300"]["today_count"], by_id["300"]["yesterday_count"]), (0, 1))
        self.assertEqual(by_id["200"]["level"], 12)
        self.assertEqual(details[0]["rule_id"], "200")

    def test_missing_source_ip_does_not_become_agent_ip(self):
        from services.wazuh_indexer import WazuhIndexerClient
        alert = WazuhIndexerClient._normalize_alert({
            "agent": {"id": "001", "ip": "10.0.0.5"},
            "data": {}, "rule": {"id": "100", "description": "Evento"},
        })
        self.assertEqual(alert["src_ip"], "")
        self.assertEqual(_summarize_alert_types([alert], [])[0]["source_ips"], [])


class DigestCurrentInventoryTests(unittest.IsolatedAsyncioTestCase):
    async def test_window_detections_are_separate_from_current_inventory(self):
        class Indexer:
            async def get_current_vulnerability_findings(self):
                return [
                    {"agent_id": "001", "cve_id": "CVE-2023-5217", "status": "",
                     "detected_at": "2026-11-03T13:00:00+00:00"},
                    {"agent_id": "001", "cve_id": "CVE-2022-0001", "status": "",
                     "detected_at": "2024-01-01T00:00:00+00:00"},
                ]

        with patch("services.wazuh_indexer.get_indexer_client", return_value=Indexer()):
            result = await DigestService()._fetch_cves_both_periods(
                datetime(2026, 11, 3, 11, tzinfo=timezone.utc),
                datetime(2026, 11, 4, 11, tzinfo=timezone.utc),
                datetime(2026, 11, 2, 11, tzinfo=timezone.utc),
                datetime(2026, 11, 3, 11, tzinfo=timezone.utc),
            )
        self.assertEqual(len(result["current"]), 2)
        self.assertEqual([item["cve_id"] for item in result["today"]], ["CVE-2023-5217"])
        self.assertEqual(result["yesterday"], [])

    async def test_per_agent_snapshot_keeps_missing_status_and_comparison(self):
        class Wazuh:
            async def get_agent_ports_snapshot(self, agent_id):
                return {"ports": [{"local_port": 22, "protocol": "tcp"}],
                        "scanned_at": "2026-11-04T11:00:00+00:00", "truncated": False}

        finding = {"agent_id": "001", "cve_id": "CVE-2023-5217", "status": "",
                   "severity": "high", "package_name": "libvpx7", "package_version": "1.2",
                   "description": "Buffer overflow"}
        prior = {"agent_id": "001", "current_cves_available": True,
                 "current_cve_details": [{"cve_id": "CVE-2022-0001"}]}
        with patch("services.wazuh_service.get_wazuh_service", return_value=Wazuh()):
            rows = await DigestService()._classify_agents(
                [{"id": "001", "name": "web-01", "status": "active"}],
                [], [], [], {}, [], [finding], "2026-11-04T11:00:00+00:00", [prior],
            )
        agent = rows["server"][0]
        self.assertEqual(agent["current_cves"], 1)
        self.assertIsNone(agent["current_cve_details"][0]["status"])
        self.assertEqual(agent["new_since_previous"], ["CVE-2023-5217"])
        self.assertEqual(agent["no_longer_reported"], ["CVE-2022-0001"])
        self.assertEqual(agent["port_changes"][0]["local_port"], 22)


if __name__ == "__main__":
    unittest.main()
