"""Offline checks for evidence classification and router attribution."""

import os
import unittest
import asyncio
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock
from unittest.mock import patch

os.environ.setdefault("JWT_SECRET_KEY", "0123456789abcdef0123456789abcdef")

from services.ai_diagnosis_service import MODELS, _analyze, _router_context, _safe_ai_json, _status
from services.wazuh_service import WazuhService
from services.wazuh_indexer import WazuhIndexerClient


class DiagnosisEvidenceTests(unittest.TestCase):
    def setUp(self):
        now = datetime.now(timezone.utc).isoformat()
        self.agent = {"status": "active", "last_keep_alive": now}
        self.ports = {"ports": [], "scanned_at": now, "truncated": False}
        self.alerts = {"max_level": 0, "truncated": False}

    def test_clean_requires_complete_current_evidence(self):
        self.assertEqual(_status(self.agent, self.ports, [], self.alerts)[0], "no_indications")
        self.assertEqual(_status(self.agent, self.ports, None, self.alerts)[0], "unassessed")
        self.assertEqual(_status(self.agent, None, [], self.alerts)[0], "unassessed")

    def test_active_kev_is_high_priority(self):
        status, gaps = _status(self.agent, self.ports,
                               [{"cve_id": "CVE-2023-5217", "severity": "medium", "is_kev": True}],
                               self.alerts)
        self.assertEqual((status, gaps), ("attention_high", []))

    def test_known_critical_evidence_is_not_hidden_by_missing_ports(self):
        cve = [{"cve_id": "CVE-2023-5217", "severity": "critical", "is_kev": True}]
        status, gaps = _status(self.agent, None, cve, self.alerts)
        self.assertEqual(status, "attention_high")
        self.assertTrue(gaps)
        status_offline, _ = _status({**self.agent, "status": "disconnected"}, None, cve, self.alerts)
        self.assertEqual(status_offline, "unassessed")

    def test_configured_dstnat_requires_review_without_claiming_exposure(self):
        status, gaps = _status(self.agent, self.ports, [], self.alerts,
                               {"configured_dstnat": [{"dst_port": "443"}]})
        self.assertEqual((status, gaps), ("review", []))

    def test_high_alert_volume_requires_review(self):
        status, _ = _status(self.agent, self.ports, [],
                            {"max_level": 5, "observed_count": 250, "truncated": False})
        self.assertEqual(status, "review")

    def test_even_low_active_cve_is_not_marked_clean(self):
        status, _ = _status(self.agent, self.ports,
                            [{"cve_id": "CVE-2026-12345", "severity": "low", "is_kev": None}],
                            self.alerts)
        self.assertEqual(status, "review")

    def test_router_requires_unique_ip_and_does_not_infer_exposure(self):
        connections = [{"src_address": "10.0.0.10", "dst_address": "8.8.8.8",
                        "dst_port": "443", "protocol": "tcp"}]
        nat = [{"chain": "dstnat", "to_addresses": "10.0.0.10", "disabled": False,
                "dst_port": "443", "protocol": "tcp"}]
        self.assertIsNone(_router_context("10.0.0.10", False, connections, nat, "now"))
        context = _router_context("10.0.0.10", True, connections, nat, "now")
        self.assertEqual(context["connection_count_snapshot"], 1)
        self.assertEqual(len(context["configured_dstnat"]), 1)
        self.assertIn("no confirma", context["note"])

    def test_ai_link_must_come_from_supplied_sources(self):
        result = _safe_ai_json('{"assessment":"Revisar", "actions": [{"title":"Actualizar", '
                               '"detail":"Verificar versión", "source_url":"https://example.com"}]}', set())
        self.assertIsNone(result["actions"][0]["source_url"])


class WazuhPortsTests(unittest.IsolatedAsyncioTestCase):
    async def test_listening_state_is_read_with_scan_timestamp(self):
        wazuh = WazuhService.__new__(WazuhService)
        wazuh._api_request = AsyncMock(return_value={"data": {"total_affected_items": 2,
            "affected_items": [
                {"state": "listening", "protocol": "tcp", "local": {"port": 22, "ip": "0.0.0.0"},
                 "scan": {"time": "2026-11-03T12:00:00Z"}, "process": "sshd"},
                {"state": "established", "protocol": "tcp", "local": {"port": 4242}},
            ]}})
        snapshot = await wazuh.get_agent_ports_snapshot("001")
        self.assertEqual([p["local_port"] for p in snapshot["ports"]], [22])
        self.assertEqual(snapshot["scanned_at"], "2026-11-03T12:00:00Z")


class WazuhAlertAggregationTests(unittest.IsolatedAsyncioTestCase):
    async def test_all_alerts_counted_in_fixed_window(self):
        indexer = WazuhIndexerClient.__new__(WazuhIndexerClient)
        indexer.is_configured = lambda: True
        indexer._breaker = SimpleNamespace(is_open=lambda: False,
                                           record_success=lambda: None,
                                           record_failure=lambda: None)
        indexer._get_request_lock = lambda: asyncio.Lock()
        response = SimpleNamespace(
            raise_for_status=lambda: None,
            json=lambda: {"timed_out": False, "_shards": {"failed": 0},
                          "hits": {"total": {"value": 1200}},
                          "aggregations": {"max_level": {"value": 10},
                                           "top_rules": {"buckets": [{
                                               "key": "5710", "doc_count": 1200,
                                               "level": {"value": 10},
                                               "latest": {"value_as_string": "2026-11-03T12:00:00Z"},
                                               "sample": {"hits": {"hits": [{"_source": {
                                                   "rule": {"description": "Authentication failed"}}}]}}
                                           }]}}})
        client = SimpleNamespace(post=AsyncMock(return_value=response))
        indexer._get_client = lambda: client
        result = await indexer.get_agent_alert_summary("001", "2026-11-02T12:00:00Z",
                                                       "2026-11-03T12:00:00Z")
        self.assertEqual(result["observed_count"], 1200)
        self.assertFalse(result["truncated"])
        self.assertEqual(result["top_rules"][0]["rule_id"], "5710")
        query = client.post.call_args.kwargs["json"]
        self.assertEqual(query["query"]["bool"]["filter"][1]["range"]["@timestamp"]["lte"],
                         "2026-11-03T12:00:00Z")


class GroqDiagnosisTests(unittest.IsolatedAsyncioTestCase):
    async def test_fallback_reports_actual_model_and_usage(self):
        attempted = []
        async def create(**kwargs):
            attempted.append(kwargs["model"])
            if len(attempted) == 1:
                raise RuntimeError("first model unavailable")
            return SimpleNamespace(
                usage=SimpleNamespace(total_tokens=4321, prompt_tokens=3000, completion_tokens=1321),
                choices=[SimpleNamespace(message=SimpleNamespace(content='{"assessment":"Revisar CVE", '
                    '"actions":[{"title":"Verificar parche", "detail":"Seguir aviso", '
                    '"source_url":"https://nvd.nist.gov/vuln/detail/CVE-2023-5217"}]}'))])
        class FakeClient:
            chat = SimpleNamespace(completions=SimpleNamespace(create=create))
            async def close(self):
                pass
        payload = {"remediation_sources": [{"sources": [{
            "url": "https://nvd.nist.gov/vuln/detail/CVE-2023-5217"}]}]}
        with patch("services.ai_diagnosis_service.get_settings",
                   return_value=SimpleNamespace(groq_api_key="test-key")), \
             patch("openai.AsyncOpenAI", return_value=FakeClient()), \
             patch("services.ai_diagnosis_service.record_usage", new_callable=AsyncMock) as record:
            ai, model, error, tokens = await _analyze(payload, MODELS)
        self.assertEqual(attempted, list(MODELS))
        self.assertEqual((model, error, tokens), (MODELS[1], None, 4321))
        self.assertEqual(ai["actions"][0]["source_url"], payload["remediation_sources"][0]["sources"][0]["url"])
        record.assert_awaited_once()


if __name__ == "__main__":
    unittest.main()
