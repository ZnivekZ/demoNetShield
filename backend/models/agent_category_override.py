"""
AgentCategoryOverride model — stores manual category overrides per agent.

When a user reclassifies an agent in the UI, that override is persisted here
and takes precedence over the automatic pattern-based classification.
"""

from __future__ import annotations

from sqlalchemy import Column, DateTime, Integer, String, func

from database import Base


class AgentCategoryOverride(Base):
    """Manual category override for a Wazuh agent."""

    __tablename__ = "agent_category_overrides"

    id         = Column(Integer, primary_key=True, autoincrement=True)
    # agent_id as returned by Wazuh API (e.g. "001")
    agent_id   = Column(String(10), unique=True, nullable=False, index=True)
    agent_name = Column(String(100), nullable=False)
    # One of: proxy | mail | notebook | server
    category   = Column(String(20), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    def __repr__(self) -> str:
        return f"<AgentCategoryOverride agent={self.agent_name} category={self.category}>"
