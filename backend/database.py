"""
NetShield Dashboard - Database Configuration
Async SQLAlchemy setup with SQLite for lab, ready for PostgreSQL migration.

Design decisions:
- Uses aiosqlite for async SQLite support
- Connection string is swappable via DATABASE_URL env var
- All models use declarative base with async session
- Session factory returns async context managers
"""

from __future__ import annotations

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from config import get_settings

settings = get_settings()

# ── Engine ────────────────────────────────────────────────────────
# For SQLite: connect_args={"check_same_thread": False} is required
# For PostgreSQL: remove connect_args entirely
_connect_args = {}
if settings.database_url.startswith("sqlite"):
    _connect_args = {"check_same_thread": False}

engine = create_async_engine(
    settings.database_url,
    echo=settings.is_development,
    connect_args=_connect_args,
    # Pool settings suitable for both SQLite and PostgreSQL
    pool_pre_ping=True,
)

# ── Session Factory ───────────────────────────────────────────────
async_session_factory = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


# ── Base Model ────────────────────────────────────────────────────
class Base(DeclarativeBase):
    """Base class for all SQLAlchemy models."""
    pass


# ── Dependency ────────────────────────────────────────────────────
async def get_db() -> AsyncSession:
    """
    FastAPI dependency that yields an async database session.
    Usage: db: AsyncSession = Depends(get_db)
    """
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


# ── Init ──────────────────────────────────────────────────────────
async def init_db() -> None:
    """Create all tables. Called on application startup."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def close_db() -> None:
    """Dispose engine connections. Called on application shutdown."""
    await engine.dispose()
