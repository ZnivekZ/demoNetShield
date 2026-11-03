"""
DailyDigest model — persists each generated security digest in SQLite.

One row per calendar date (UTC-3 cutoff at 08:00 AM).
All complex payloads are stored as JSON strings (delta, agents, cisa).
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Integer, String, Text, func

from database import Base


class DailyDigest(Base):
    """Stores one complete Daily Security Digest per day."""

    __tablename__ = "daily_digests"

    id                = Column(Integer, primary_key=True, autoincrement=True)
    # Date string "YYYY-MM-DD" — unique per day, used for history lookups
    date              = Column(String(10), unique=True, nullable=False, index=True)

    # Risk semaphore
    risk_level        = Column(String(10), nullable=False)   # green/yellow/orange/red
    risk_score        = Column(Integer, nullable=False)       # 0–100
    risk_reasoning    = Column(Text, nullable=False, default="")  # human-readable reason

    # JSON blobs (avoids schema migrations when adding sub-fields)
    delta_json        = Column(Text, nullable=False, default="{}")
    agents_json       = Column(Text, nullable=False, default="{}")
    cisa_json         = Column(Text, nullable=False, default="{}")  # versioned KEV matches/status JSON

    # AI diagnostic (Groq or mock)
    ai_summary        = Column(Text, nullable=True)
    ai_model_used     = Column(String(80), nullable=True)
    ai_is_mock        = Column(Boolean, nullable=False, default=True)
    ai_payload_sent   = Column(Text, nullable=True)   # JSON of the condensed payload
    ai_generated_at   = Column(String(32), nullable=True)  # ISO 8601

    # Vulnerability detector health
    detector_healthy  = Column(Boolean, nullable=False, default=True)
    detector_last_scan = Column(String(32), nullable=True)

    # Metadata
    generated_at      = Column(DateTime, nullable=False)
    generation_method = Column(String(20), nullable=False, default="manual")  # manual | scheduled

    created_at        = Column(DateTime, server_default=func.now())

    def __repr__(self) -> str:
        return f"<DailyDigest date={self.date} risk={self.risk_level} score={self.risk_score}>"
