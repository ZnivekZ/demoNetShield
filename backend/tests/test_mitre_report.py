"""Offline checks for complete MITRE pagination and report aggregation."""

import asyncio
import os
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

os.environ.setdefault("JWT_SECRET_KEY", "0123456789abcdef0123456789abcdef")

from services.mitre_report_service import _safe_mitre_ai, build_report
from services.mitre_report_service import MitreReportService
from models.ai_diagnosis import MitreReportRun
from services.wazuh_indexer import WazuhIndexerClient


def bucket(agent: str, technique: str) -> dict:
    return {"key": {"agent_id": agent, "technique_id": technique}, "doc_count": 2,
            "first": {"value_as_string": "2026-11-04T10:00:00Z"},
            "last": {"value_as_string": "2026-11-04T11:00:00Z"},
            "max_level": {"value": 10},
            "sample": {"hits": {"hits": [{"_id": "evt-1", "_source": {
                "agent": {"name": agent}, "rule": {"id": "100", "level": 10,
                "description": "Example", "mitre": {"id": [technique],
                "technique": ["Example technique"], "tactic": ["Credential Access"]}},
                "@timestamp": "2026-11-04T11:00:00Z"}}]}}}


def page(buckets: list[dict], after: dict | None = None) -> dict:
    pairs = {"buckets": buckets}
    if after:
        pairs["after_key"] = after
    return {"_shards": {"failed": 0}, "hits": {"total": {"value": 12}},
            "aggregations": {"mapped": {"doc_count": 5},
                             "attributed": {"doc_count": 4, "pairs": pairs}}}


class MitreAggregationTests(unittest.IsolatedAsyncioTestCase):
    async def test_pages_all_agent_technique_pairs_and_counts_coverage(self):
        indexer = WazuhIndexerClient.__new__(WazuhIndexerClient)
        indexer.is_configured = lambda: True
        indexer._breaker = SimpleNamespace(is_open=lambda: False,
                                           record_success=lambda: None, record_failure=lambda: None)
        indexer._get_request_lock = lambda: asyncio.Lock()
        responses = [SimpleNamespace(raise_for_status=lambda: None,
                                     json=lambda: page([bucket("001", "T1110")],
                                                       {"agent_id": "001", "technique_id": "T1110"})),
                     SimpleNamespace(raise_for_status=lambda: None,
                                     json=lambda: page([bucket("002", "T1059")]))]
        client = SimpleNamespace(post=AsyncMock(side_effect=responses))
        indexer._get_client = lambda: client
        result = await indexer.get_mitre_report_data("2026-11-04T00:00:00Z", "2026-11-05T00:00:00Z")
        self.assertEqual((result["total_alerts"], result["mapped_alerts"], result["attributed_alerts"]), (12, 5, 4))
        self.assertEqual({p["agent_id"] for p in result["pairs"]}, {"001", "002"})
        second_query = client.post.call_args_list[1].kwargs["json"]
        after = second_query["aggs"]["attributed"]["aggs"]["pairs"]["composite"]["after"]
        self.assertEqual(after["technique_id"], "T1110")

    async def test_on_demand_run_is_saved_with_one_ai_result(self):
        engine = create_async_engine("sqlite+aiosqlite:///:memory:")
        factory = async_sessionmaker(engine, expire_on_commit=False)
        async with engine.begin() as conn:
            await conn.run_sync(MitreReportRun.__table__.create)
        raw = {"period_start": "a", "period_end": "b", "total_alerts": 1,
               "mapped_alerts": 0, "attributed_alerts": 0, "pairs": []}
        fake_indexer = SimpleNamespace(get_mitre_report_data=AsyncMock(return_value=raw))
        service = MitreReportService()
        try:
            with patch("services.mitre_report_service.async_session_factory", factory), \
                 patch("services.mitre_report_service.get_indexer_client", return_value=fake_indexer), \
                 patch("services.mitre_report_service._analyze_report", new_callable=AsyncMock,
                       return_value=({"summary": "Sin mapeos", "findings": [], "limitations": []},
                                     "openai/gpt-oss-120b", 100, None)) as ai:
                run_id = await asyncio.wait_for(service.start(24), timeout=3)
                await asyncio.wait_for(service._task, timeout=3)
                async with factory() as db:
                    row = await db.get(MitreReportRun, run_id)
                    self.assertEqual(row.status, "completed")
                    self.assertEqual(row.period_hours, 24)
                    self.assertIn('"unmapped_alerts": 1', row.report_json)
                    self.assertIn("Sin mapeos", row.ai_json)
                ai.assert_awaited_once()
        finally:
            await engine.dispose()


class MitreReportTests(unittest.TestCase):
    def test_report_preserves_alert_total_and_affected_agents(self):
        sample = {"event_id": "e1", "rule_id": "100", "description": "Example",
                  "timestamp": "2026-11-04T11:00:00Z", "source_ip": None}
        pair = {"agent_id": "001", "agent_name": "host-1", "technique_id": "T1110",
                "technique_name": "Brute Force", "tactics": ["Credential Access"],
                "count": 2, "max_level": 10, "first": "2026-11-04T10:00:00Z",
                "last": "2026-11-04T11:00:00Z", "sample": sample}
        report = build_report({"period_start": "a", "period_end": "b", "total_alerts": 10,
                               "mapped_alerts": 3, "attributed_alerts": 3,
                               "pairs": [pair, {**pair, "technique_id": "T1059", "count": 1}]})
        self.assertEqual(report["mapped_alerts"], 3)
        self.assertEqual(sum(t["count"] for t in report["techniques"]), 3)
        self.assertEqual(report["unmapped_alerts"], 7)
        self.assertEqual([a["agent_id"] for a in report["agents"]], ["001"])

    def test_ai_cannot_add_unobserved_technique(self):
        ai = _safe_mitre_ai('{"summary":"Revisar", "findings":[{"technique_id":"T9999"}, '
                            '{"technique_id":"T1110","interpretation":"Hay alertas"}]}', {"T1110"})
        self.assertEqual([f["technique_id"] for f in ai["findings"]], ["T1110"])


if __name__ == "__main__":
    unittest.main()
