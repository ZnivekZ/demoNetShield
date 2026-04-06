"""
IP Label Model - Associates human-readable labels with IP addresses.
Supports custom criteria and manual annotations for network analysis.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from database import Base


class IPLabel(Base):
    """
    Stores labels assigned to IP addresses.
    Labels help operators quickly identify and categorize network entities.
    """

    __tablename__ = "ip_labels"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    ip_address: Mapped[str] = mapped_column(String(45), index=True, nullable=False)
    label: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    color: Mapped[str] = mapped_column(String(7), default="#6366f1")  # hex color
    criteria: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON criteria
    created_by: Mapped[str] = mapped_column(String(100), default="system")
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now(), nullable=False
    )

    def __repr__(self) -> str:
        return f"<IPLabel {self.ip_address}={self.label}>"
