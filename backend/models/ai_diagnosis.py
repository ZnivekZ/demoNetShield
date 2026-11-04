"""Persistent, on-demand agent diagnosis and Groq usage accounting."""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, Integer, String, Text

from database import Base


def utc_now() -> datetime:
    # SQLite stores naive datetimes; all diagnosis timestamps use UTC.
    return datetime.now(timezone.utc).replace(tzinfo=None)


class AiDiagnosisRun(Base):
    __tablename__ = "ai_diagnosis_runs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    status = Column(String(20), nullable=False, default="running", index=True)
    started_at = Column(DateTime, nullable=False, default=utc_now)
    finished_at = Column(DateTime, nullable=True)
    total_agents = Column(Integer, nullable=False, default=0)
    processed_agents = Column(Integer, nullable=False, default=0)
    snapshot_json = Column(Text, nullable=False, default="{}")
    reports_json = Column(Text, nullable=False, default="[]")
    error = Column(Text, nullable=True)


class GroqUsage(Base):
    __tablename__ = "groq_usage"

    id = Column(Integer, primary_key=True, autoincrement=True)
    created_at = Column(DateTime, nullable=False, default=utc_now, index=True)
    model = Column(String(80), nullable=False, index=True)
    feature = Column(String(30), nullable=False)
    input_tokens = Column(Integer, nullable=False, default=0)
    output_tokens = Column(Integer, nullable=False, default=0)
    total_tokens = Column(Integer, nullable=False, default=0)
