"""
IP Group Model - Groups IPs by criteria (traffic, alerts, ranges, manual).
Supports dynamic membership based on automated criteria evaluation.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


class IPGroup(Base):
    """
    Groups of IP addresses organized by criteria.
    Examples: "High Traffic", "Suspicious", "Trusted Internal"
    """

    __tablename__ = "ip_groups"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    color: Mapped[str] = mapped_column(String(7), default="#8b5cf6")  # hex color
    # JSON-encoded criteria for automatic membership evaluation
    # Example: {"min_connections_per_min": 50, "min_alert_level": 10, "ip_range": "192.168.88.0/24"}
    criteria: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[str] = mapped_column(String(100), default="system")
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now(), nullable=False
    )

    # Relationship to members
    members: Mapped[list[IPGroupMember]] = relationship(
        "IPGroupMember", back_populates="group", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<IPGroup {self.name}>"


class IPGroupMember(Base):
    """
    Association between an IP address and a group.
    Tracks when and why an IP was added.
    """

    __tablename__ = "ip_group_members"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    group_id: Mapped[int] = mapped_column(
        ForeignKey("ip_groups.id", ondelete="CASCADE"), nullable=False
    )
    ip_address: Mapped[str] = mapped_column(String(45), index=True, nullable=False)
    added_reason: Mapped[str] = mapped_column(String(255), default="manual")
    added_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )

    group: Mapped[IPGroup] = relationship("IPGroup", back_populates="members")

    def __repr__(self) -> str:
        return f"<IPGroupMember {self.ip_address} in group_id={self.group_id}>"
