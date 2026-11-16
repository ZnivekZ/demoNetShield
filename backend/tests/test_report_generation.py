"""The report preview is the frozen request used for Groq generation."""

import json
import os
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

os.environ.setdefault("JWT_SECRET_KEY", "0123456789abcdef0123456789abcdef")

from schemas.reports import ReportPrepareRequest
from services.report_generation import _render_result, prepare_report, select_rows
from models.prepared_report import utc_now


class FakeSession:
    def add(self, row):
        self.row = row
        row.created_at = utc_now()

    async def flush(self):
        pass


class ReportPreparationTests(unittest.IsolatedAsyncioTestCase):
    async def test_selection_updates_exact_request_without_refetching(self):
        session = FakeSession()
        fake_source = {
            "id": "wazuh_alerts", "label": "Alertas Wazuh", "group": "Wazuh",
            "historical": True, "status": "ok", "observed_at": "2026-11-15T00:00:00+00:00",
            "truncated": False, "rows": [
                {"id": "wazuh_alerts:0", "data": {"rule_level": 12}},
                {"id": "wazuh_alerts:1", "data": {"rule_level": 3}},
            ],
        }
        with patch("services.report_generation.get_settings", return_value=SimpleNamespace(groq_api_key="")), \
             patch("services.report_generation._fetch_source", new=AsyncMock(return_value=fake_source)) as fetch:
            preview = await prepare_report(ReportPrepareRequest(
                prompt="Analizá alertas", data_sources=["wazuh_alerts"]), session)
            row = session.row
            selected = await select_rows(row, {"wazuh_alerts": [0]}, session)
            fetch.assert_awaited_once()

        sent = json.loads(row.messages_json)
        self.assertEqual(selected["request"]["messages"], sent)
        self.assertEqual(preview["preparation_id"], row.id)
        evidence = json.loads(sent[1]["content"])["evidence"][0]["rows"]
        self.assertEqual([item["id"] for item in evidence], ["wazuh_alerts:0"])

    def test_unreferenced_model_claim_is_dropped_and_html_escaped(self):
        _, _, html = _render_result({"title": "<script>", "summary": "ok",
                                     "findings": [{"evidence_id": "fake", "text": "inventado"},
                                                  {"evidence_id": "wazuh_alerts:0", "text": "<b>real</b>"}]},
                                    {"wazuh_alerts:0"})
        self.assertNotIn("inventado", html)
        self.assertNotIn("<script>", html)
        self.assertIn("&lt;b&gt;real&lt;/b&gt;", html)
