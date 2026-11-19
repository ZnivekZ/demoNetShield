"""Investigaciones privadas y turnos reproducibles de Fibot."""
from datetime import datetime, timezone

from sqlalchemy import JSON, ForeignKey, Index, String, Text, text
from sqlalchemy.orm import Mapped, mapped_column

from database import Base


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class FibotChat(Base):
    __tablename__ = "fibot_chats"
    id: Mapped[int] = mapped_column(primary_key=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    title: Mapped[str] = mapped_column(String(100))
    created: Mapped[str] = mapped_column(default=now_iso)


class FibotTurn(Base):
    __tablename__ = "fibot_turns"
    __table_args__ = (
        Index("fibot_one_running", "chat_id", unique=True, sqlite_where=text("status = 'running'"),
              postgresql_where=text("status = 'running'")),
        Index("fibot_request", "chat_id", "request_id", unique=True),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    chat_id: Mapped[int] = mapped_column(ForeignKey("fibot_chats.id"), index=True)
    request_id: Mapped[str] = mapped_column(String(64))
    created: Mapped[str] = mapped_column(default=now_iso)
    agents: Mapped[list] = mapped_column(JSON)
    prompt: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(default="running")
    answer: Mapped[str] = mapped_column(Text, default="")
    steps: Mapped[list] = mapped_column(JSON, default=list)
    results: Mapped[list] = mapped_column(JSON, default=list)


class FibotView(Base):
    __tablename__ = "fibot_views"
    __table_args__ = (Index("fibot_view_result", "turn_id", "result_index", unique=True),)
    id: Mapped[int] = mapped_column(primary_key=True)
    turn_id: Mapped[int] = mapped_column(ForeignKey("fibot_turns.id"))
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    result_index: Mapped[int]
    title: Mapped[str] = mapped_column(String(140))
