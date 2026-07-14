"""
Auth Service — JWT authentication and user management for NetShield Dashboard.

Singleton pattern: module-level variable + get_auth_service().
No mock guard: authentication is local (SQLite), not dependent on external services.

Responsibilities:
- Password hashing with bcrypt via passlib
- JWT token creation/verification via python-jose
- User CRUD against SQLite
- Initial admin user creation at startup
"""

from __future__ import annotations

import structlog
from datetime import datetime, timedelta, timezone
from typing import Optional

from jose import JWTError, jwt
import bcrypt
from sqlalchemy import select

from config import get_settings
from database import async_session_factory
from models.user import User
from schemas.auth import UserCreate, UserUpdate

logger = structlog.get_logger(__name__)
settings = get_settings()


# ── Helpers de contraseña ─────────────────────────────────────────────────────

def hash_password(password: str) -> str:
    """Hash a plaintext password using bcrypt."""
    pwd_bytes = password.encode('utf-8')
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(pwd_bytes, salt)
    return hashed.decode('utf-8')


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plaintext password against a bcrypt hash."""
    try:
        return bcrypt.checkpw(
            plain_password.encode('utf-8'),
            hashed_password.encode('utf-8')
        )
    except Exception:
        return False


# ── Helpers JWT ───────────────────────────────────────────────────────────────

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Create a signed JWT token."""
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=settings.jwt_expire_minutes)
    )
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def decode_token(token: str) -> Optional[dict]:
    """
    Decode and verify a JWT token.
    Returns payload dict on success, None on any failure (expired, invalid, etc.).
    """
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret_key,
            algorithms=[settings.jwt_algorithm],
        )
        return payload
    except JWTError:
        return None


# ── Auth Service ──────────────────────────────────────────────────────────────

class AuthService:
    """
    Authentication service for the NetShield Dashboard.
    Handles login, token management, and user CRUD against SQLite.
    """

    async def authenticate_user(self, username: str, password: str) -> Optional[User]:
        """
        Validate credentials and return the User if correct.
        Returns None if username not found, password wrong, or user inactive.
        """
        async with async_session_factory() as session:
            result = await session.execute(
                select(User).where(User.username == username, User.is_active == True)
            )
            user = result.scalar_one_or_none()
            if not user:
                logger.warning("auth_login_failed", username=username, reason="user_not_found")
                return None
            if not verify_password(password, user.hashed_password):
                logger.warning("auth_login_failed", username=username, reason="wrong_password")
                return None
            logger.info("auth_login_success", username=username, user_id=user.id)
            return user

    async def get_user_by_id(self, user_id: int) -> Optional[User]:
        """Fetch a user by primary key."""
        async with async_session_factory() as session:
            result = await session.execute(select(User).where(User.id == user_id))
            return result.scalar_one_or_none()

    async def get_user_by_username(self, username: str) -> Optional[User]:
        """Fetch a user by username."""
        async with async_session_factory() as session:
            result = await session.execute(
                select(User).where(User.username == username)
            )
            return result.scalar_one_or_none()

    async def get_all_users(self) -> list[User]:
        """Return all users ordered by creation date."""
        async with async_session_factory() as session:
            result = await session.execute(
                select(User).order_by(User.created_at.asc())
            )
            return list(result.scalars().all())

    async def create_user(self, data: UserCreate) -> User:
        """
        Create a new dashboard user.
        Raises ValueError if username already exists.
        """
        # Check uniqueness
        existing = await self.get_user_by_username(data.username)
        if existing:
            raise ValueError(f"El usuario '{data.username}' ya existe")

        async with async_session_factory() as session:
            user = User(
                username=data.username,
                email=data.email,
                full_name=data.full_name,
                hashed_password=hash_password(data.password),
                is_active=True,
            )
            session.add(user)
            await session.commit()
            await session.refresh(user)
            logger.info("auth_user_created", username=data.username, user_id=user.id)
            return user

    async def update_user(self, user_id: int, data: UserUpdate) -> Optional[User]:
        """
        Update user fields. Only updates fields explicitly provided (non-None).
        Returns None if user not found.
        """
        async with async_session_factory() as session:
            result = await session.execute(select(User).where(User.id == user_id))
            user = result.scalar_one_or_none()
            if not user:
                return None

            if data.email is not None:
                user.email = data.email
            if data.full_name is not None:
                user.full_name = data.full_name
            if data.password is not None:
                user.hashed_password = hash_password(data.password)
            if data.is_active is not None:
                user.is_active = data.is_active

            await session.commit()
            await session.refresh(user)
            logger.info("auth_user_updated", user_id=user_id, username=user.username)
            return user

    async def delete_user(self, user_id: int) -> bool:
        """
        Delete a user by ID.
        Returns True if deleted, False if not found.
        """
        async with async_session_factory() as session:
            result = await session.execute(select(User).where(User.id == user_id))
            user = result.scalar_one_or_none()
            if not user:
                return False
            await session.delete(user)
            await session.commit()
            logger.info("auth_user_deleted", user_id=user_id, username=user.username)
            return True

    async def ensure_default_admin(self) -> None:
        """
        Create the default admin user if no users exist in the database.
        Called during application startup after init_db().
        """
        async with async_session_factory() as session:
            result = await session.execute(select(User))
            existing = result.scalars().first()
            if existing:
                logger.info("auth_admin_check", status="users_exist", count=">=1")
                return

        # Table is empty — create default admin
        try:
            admin = await self.create_user(
                UserCreate(
                    username=settings.default_admin_user,
                    password=settings.default_admin_password,
                    full_name="Administrador NetShield",
                )
            )
            logger.info(
                "auth_default_admin_created",
                username=admin.username,
                msg="Cambiar contraseña en producción",
            )
        except ValueError:
            # Already exists (race condition safety)
            pass


# ── Singleton ─────────────────────────────────────────────────────────────────

_auth_service: Optional[AuthService] = None


def get_auth_service() -> AuthService:
    """Return the singleton AuthService instance."""
    global _auth_service
    if _auth_service is None:
        _auth_service = AuthService()
    return _auth_service
