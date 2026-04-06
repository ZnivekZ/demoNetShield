"""
Action Log Model - Audit trail for all security-related actions.
Tracks who blocked what, when, and why for compliance and forensics.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from database import Base


class ActionLog(Base):
    """
    Immutable audit log for security actions.
    Every firewall block, unblock, active-response, and report generation
    is logged here with full context.
    """

    __tablename__ = "action_logs"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    action_type: Mapped[str] = mapped_column(
        String(50), index=True, nullable=False
    )  # block, unblock, active_response, report_generated
    target_ip: Mapped[str | None] = mapped_column(
        String(45), index=True, nullable=True
    )
    details: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON payload
    performed_by: Mapped[str] = mapped_column(String(100), default="dashboard_user")
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False, index=True
    )

    def __repr__(self) -> str:
        return f"<ActionLog {self.action_type} target={self.target_ip} at={self.created_at}>"
