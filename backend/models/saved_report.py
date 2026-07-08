"""
Models for saved reports and report schedules.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import Boolean, DateTime, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from database import Base


class SavedReport(Base):
    """Persisted AI-generated report. Stored in full so user can re-open and edit."""

    __tablename__ = "saved_reports"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    html_content: Mapped[str] = mapped_column(Text, nullable=False)
    prompt: Mapped[str] = mapped_column(Text, nullable=False, default="")
    audience: Mapped[str] = mapped_column(String(50), nullable=False, default="technical")
    model_used: Mapped[str] = mapped_column(String(120), nullable=False, default="")
    data_sources: Mapped[str] = mapped_column(String(500), nullable=False, default="[]")
    tokens_used: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_by: Mapped[str] = mapped_column(String(100), nullable=False, default="system")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    def to_dict(self, include_html: bool = True) -> dict:
        import json
        d = {
            "id": self.id,
            "title": self.title,
            "prompt": self.prompt,
            "audience": self.audience,
            "model_used": self.model_used,
            "data_sources": json.loads(self.data_sources) if self.data_sources else [],
            "tokens_used": self.tokens_used,
            "created_by": self.created_by,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
        if include_html:
            d["html_content"] = self.html_content
        return d


class ReportSchedule(Base):
    """Automated report schedule using APScheduler cron expressions."""

    __tablename__ = "report_schedules"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    cron_expression: Mapped[str] = mapped_column(String(100), nullable=False, default="0 8 * * 1")
    template_id: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    prompt: Mapped[str] = mapped_column(Text, nullable=False, default="")
    audience: Mapped[str] = mapped_column(String(50), nullable=False, default="technical")
    data_sources: Mapped[str] = mapped_column(String(500), nullable=False, default="[]")
    model: Mapped[str] = mapped_column(String(120), nullable=False, default="openrouter/auto")
    output: Mapped[str] = mapped_column(String(50), nullable=False, default="save")
    last_run_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    def to_dict(self) -> dict:
        import json
        return {
            "id": self.id,
            "name": self.name,
            "enabled": self.enabled,
            "cron_expression": self.cron_expression,
            "template_id": self.template_id,
            "prompt": self.prompt,
            "audience": self.audience,
            "data_sources": json.loads(self.data_sources) if self.data_sources else [],
            "model": self.model,
            "output": self.output,
            "last_run_at": self.last_run_at.isoformat() if self.last_run_at else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
