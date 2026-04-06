"""
Sinkhole Entry Model - Tracks domains added to MikroTik DNS sinkhole.
When a domain is sinkholed, MikroTik DNS resolves it to 127.0.0.1.
This table is the local record of what was sinkholed and why.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from database import Base


class SinkholeEntry(Base):
    """
    Record of a domain added to DNS sinkhole in MikroTik.
    The actual sinkhole lives in MikroTik /ip/dns/static;
    this table provides audit trail and reason tracking.
    """

    __tablename__ = "sinkhole_entries"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    domain: Mapped[str] = mapped_column(
        String(255), unique=True, index=True, nullable=False
    )
    added_by: Mapped[str] = mapped_column(String(100), default="dashboard_user")
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False, index=True
    )

    def __repr__(self) -> str:
        return f"<SinkholeEntry domain={self.domain} by={self.added_by} at={self.created_at}>"
