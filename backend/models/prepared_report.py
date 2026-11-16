"""Frozen, inspectable request sent to Groq when a report is generated."""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import DateTime, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from database import Base


def utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class PreparedReport(Base):
    __tablename__ = "prepared_reports"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=utc_now)
    model: Mapped[str] = mapped_column(String(80), nullable=False)
    request_json: Mapped[str] = mapped_column(Text, nullable=False)
    sources_json: Mapped[str] = mapped_column(Text, nullable=False)
    selected_json: Mapped[str] = mapped_column(Text, nullable=False)
    messages_json: Mapped[str] = mapped_column(Text, nullable=False)
