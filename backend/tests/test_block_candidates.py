"""Focused tests for the isolated candidate decision pipeline."""

import os
import unittest
from datetime import date, datetime
from unittest.mock import AsyncMock, patch

os.environ.setdefault("JWT_SECRET_KEY", "test-secret-for-candidates-32-chars-long")

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from database import Base
from models.block_candidate import BlockCandidate, CandidateConfig, CandidateEvaluation, CandidateRule
from services import block_candidate_service as service


class CandidatePipelineTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.engine = create_async_engine("sqlite+aiosqlite:///:memory:")
        async with self.engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
        self.sessions = async_sessionmaker(self.engine, expire_on_commit=False)
        self.original_factory = service.async_session_factory
        service.async_session_factory = self.sessions

    async def asyncTearDown(self):
        service.async_session_factory = self.original_factory
        await self.engine.dispose()

    def test_normalizes_windows_ip_and_deduplicates_alert_archive(self):
        raw = {"id": "same-event", "@timestamp": "2026-11-11T03:05:00Z",
               "agent": {"id": "004", "name": "server"},
               "data": {"win": {"eventdata": {"ipAddress": "198.51.100.7"}}},
               "rule": {"id": "60122", "level": 12, "description": "Windows logon failure"}}
        archive = service.normalize_event(raw, "archives")
        alert = service.normalize_event(raw, "alerts")
        self.assertEqual(alert.ip, "198.51.100.7")
        self.assertEqual(len(service.deduplicate([archive, alert])), 1)
        self.assertEqual(service.deduplicate([archive, alert])[0].source, "alerts")
        self.assertEqual(service.deduplicate([archive, alert])[0].sources, ("alerts", "archives"))
        archive_rule = CandidateRule(category="critical", sources="archives", min_level=12,
                                     pattern="", rule_ids_json="[]")
        self.assertTrue(service.matches(archive_rule, service.deduplicate([archive, alert])[0]))

    def test_window_counts_across_midnight_art(self):
        rule = CandidateRule(id=1, name="SSH", category="ssh", sources="both", decision_mode="automatic",
                             enabled=True, min_level=0, min_count=5, window_minutes=10, pattern="", rule_ids_json="[]")
        times = ["02:59", "03:01", "03:02", "03:03", "03:04"]
        events = [service.Event(str(i), "198.51.100.7", datetime(2026, 11, 11, int(t[:2]), int(t[3:])),
                                "001", "agent", "archives", "", 0, "sshd Failed password", [], "sshd Failed password")
                  for i, t in enumerate(times)]
        start, end = service.day_bounds(date(2026, 11, 11))
        windows = service.windows_for_rule(rule, events, start, end)
        self.assertEqual(len(windows), 1)
        self.assertEqual(len(windows[0]), 5)

    async def test_persists_yes_and_technical_no_without_duplicate_scan(self):
        events = [service.Event(str(i), "198.51.100.7", datetime(2026, 11, 11, 3, i + 1),
                                "001", "agent", "alerts", "5710", 12,
                                "sshd Failed password", [], "sshd Failed password") for i in range(5)]
        with patch.object(service, "fetch_events", new=AsyncMock(return_value=(events, []))), \
             patch.object(service, "ask_ai", new=AsyncMock(return_value=(None, None, "Groq sin cuota"))):
            first = await service.scan(date(2026, 11, 11))
            second = await service.scan(date(2026, 11, 11))
        self.assertEqual(first["positive_evaluations"], 1)
        self.assertEqual(first["negative_evaluations"], 1)
        self.assertEqual(second["evaluations"], 0)
        async with self.sessions() as db:
            config = await db.get(CandidateConfig, 1)
            config.prompt_version += 1
            await db.commit()
        answer = {"decision": "SI", "motivo": "Abuso confirmado", "evidencia_favor": ["fallos"], "evidencia_contra": []}
        with patch.object(service, "fetch_events", new=AsyncMock(return_value=(events, []))), \
             patch.object(service, "ask_ai", new=AsyncMock(return_value=(answer, "openai/gpt-oss-120b", None))):
            third = await service.scan(date(2026, 11, 11))
        self.assertEqual(third["positive_evaluations"], 1)
        async with self.sessions() as db:
            self.assertEqual(await db.scalar(select(func.count()).select_from(BlockCandidate)), 1)
            candidate = await db.scalar(select(BlockCandidate))
            self.assertEqual(candidate.decision_source, "automatic+ai")
            rows = (await db.scalars(select(CandidateEvaluation).order_by(CandidateEvaluation.id))).all()
            self.assertEqual([row.decision for row in rows], [True, False, True])
            self.assertEqual(rows[1].decision_source, "fallback")
            self.assertEqual(rows[1].technical_reason, "Groq sin cuota")
            self.assertTrue(rows[1].prompt_snapshot)
            self.assertIn("198.51.100.7", rows[1].payload_json)
