"""
Quarantine Log Model - Audit trail for GLPI asset quarantine/unquarantine actions.
Records when a GLPI asset was quarantined via NetShield, the reason,
associate Wazuh alert and MikroTik block IDs, and when it was resolved.
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from database import Base


class QuarantineLog(Base):
    """
    Audit log for GLPI asset quarantine operations.
    Created when POST /api/glpi/assets/{id}/quarantine is executed.
    Resolved when POST /api/glpi/assets/{id}/unquarantine is executed.
    """

    __tablename__ = "quarantine_logs"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    asset_id_glpi: Mapped[int] = mapped_column(Integer, index=True, nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    quarantined_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False, index=True
    )
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    wazuh_alert_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    mikrotik_block_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    created_by: Mapped[str] = mapped_column(String(100), default="dashboard_user")

    def __repr__(self) -> str:
        return (
            f"<QuarantineLog asset_id={self.asset_id_glpi} "
            f"quarantined_at={self.quarantined_at} "
            f"resolved_at={self.resolved_at}>"
        )
