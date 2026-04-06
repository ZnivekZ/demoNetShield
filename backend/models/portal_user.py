"""
PortalUserRegistry — Local metadata for MikroTik Hotspot users.

MikroTik /ip/hotspot/user is the source of truth for usernames, passwords,
profiles, and MAC bindings. This table only stores metadata that MikroTik
does NOT store: who created the user via the dashboard and when.

This allows audit trails for bulk imports and individual registrations.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import String, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column

from database import Base


class PortalUserRegistry(Base):
    """Local registry of users created via the NetShield Portal dashboard."""

    __tablename__ = "portal_user_registry"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(String(128), nullable=False, index=True, unique=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )
    created_by: Mapped[str] = mapped_column(String(64), nullable=False, default="admin")
    notes: Mapped[str | None] = mapped_column(String(512), nullable=True)
