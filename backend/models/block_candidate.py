"""Isolated, read-only-to-the-lab candidate blocking experiment."""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint

from database import Base


def utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class CandidateConfig(Base):
    __tablename__ = "candidate_config"

    id = Column(Integer, primary_key=True, default=1)
    enabled = Column(Boolean, nullable=False, default=False)
    include_archives = Column(Boolean, nullable=False, default=True)
    poll_seconds = Column(Integer, nullable=False, default=60)
    prompt_text = Column(Text, nullable=False)
    prompt_version = Column(Integer, nullable=False, default=1)
    included_agent_ids_json = Column(Text, nullable=False, default="[]")
    excluded_agent_ids_json = Column(Text, nullable=False, default="[]")
    last_run_at = Column(DateTime, nullable=True)
    last_error = Column(Text, nullable=True)
    last_run_json = Column(Text, nullable=False, default="{}")


class CandidateRule(Base):
    __tablename__ = "candidate_rules"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(120), nullable=False)
    category = Column(String(24), nullable=False)  # critical | ssh | windows | web | custom
    sources = Column(String(16), nullable=False, default="both")  # alerts | archives | both
    decision_mode = Column(String(16), nullable=False, default="ai")  # automatic | ai
    enabled = Column(Boolean, nullable=False, default=True)
    min_level = Column(Integer, nullable=False, default=0)
    min_count = Column(Integer, nullable=False, default=1)
    window_minutes = Column(Integer, nullable=False, default=10)
    pattern = Column(Text, nullable=False, default="")
    rule_ids_json = Column(Text, nullable=False, default="[]")
    version = Column(Integer, nullable=False, default=1)
    created_at = Column(DateTime, nullable=False, default=utc_now)
    updated_at = Column(DateTime, nullable=False, default=utc_now, onupdate=utc_now)


class CandidateEvaluation(Base):
    __tablename__ = "candidate_evaluations"

    id = Column(Integer, primary_key=True, autoincrement=True)
    evaluation_key = Column(String(64), nullable=False, unique=True)
    day = Column(String(10), nullable=False, index=True)  # America/Argentina/Buenos_Aires
    ip = Column(String(45), nullable=False, index=True)
    rule_id = Column(Integer, ForeignKey("candidate_rules.id"), nullable=False)
    rule_name = Column(String(120), nullable=False)
    rule_version = Column(Integer, nullable=False)
    category = Column(String(24), nullable=False)
    decision = Column(Boolean, nullable=False)  # always yes or no; never pending
    decision_source = Column(String(16), nullable=False)  # automatic | ai | fallback
    reason = Column(Text, nullable=False)
    technical_reason = Column(Text, nullable=True)
    first_seen = Column(DateTime, nullable=False)
    last_seen = Column(DateTime, nullable=False)
    decided_at = Column(DateTime, nullable=False, default=utc_now)
    event_count = Column(Integer, nullable=False)
    agent_ids_json = Column(Text, nullable=False, default="[]")
    agent_names_json = Column(Text, nullable=False, default="[]")
    source_types_json = Column(Text, nullable=False, default="[]")
    event_refs_json = Column(Text, nullable=False, default="[]")
    rule_snapshot_json = Column(Text, nullable=False, default="{}")
    prompt_snapshot = Column(Text, nullable=True)
    prompt_version = Column(Integer, nullable=True)
    payload_json = Column(Text, nullable=True)
    ai_response_json = Column(Text, nullable=True)
    ai_model = Column(String(80), nullable=True)

    __table_args__ = (Index("ix_candidate_evaluations_ip_day", "ip", "day"),)


class BlockCandidate(Base):
    """One positive row per IP and calendar day; no connection to the live blocklist."""

    __tablename__ = "block_candidates"

    id = Column(Integer, primary_key=True, autoincrement=True)
    day = Column(String(10), nullable=False, index=True)
    ip = Column(String(45), nullable=False, index=True)
    first_seen = Column(DateTime, nullable=False)
    last_seen = Column(DateTime, nullable=False)
    decided_at = Column(DateTime, nullable=False)
    reasons_json = Column(Text, nullable=False, default="[]")
    categories_json = Column(Text, nullable=False, default="[]")
    agent_ids_json = Column(Text, nullable=False, default="[]")
    agent_names_json = Column(Text, nullable=False, default="[]")
    source_types_json = Column(Text, nullable=False, default="[]")
    evaluation_ids_json = Column(Text, nullable=False, default="[]")
    event_count = Column(Integer, nullable=False, default=0)
    decision_source = Column(String(16), nullable=False)

    __table_args__ = (
        UniqueConstraint("day", "ip", name="uq_block_candidate_day_ip"),
        Index("ix_block_candidates_ip_day", "ip", "day"),
    )
