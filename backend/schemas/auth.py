"""
Auth Schemas — Pydantic v2 models for authentication endpoints.

LoginRequest      → POST /api/auth/login body
TokenResponse     → POST /api/auth/login response
UserResponse      → GET /api/auth/me and users CRUD responses
UserCreate        → POST /api/auth/users body
UserUpdate        → PUT /api/auth/users/{id} body
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, field_validator


class LoginRequest(BaseModel):
    """Credentials for dashboard login."""
    username: str
    password: str


class TokenResponse(BaseModel):
    """JWT token returned on successful login."""
    access_token: str
    token_type: str = "bearer"


class UserResponse(BaseModel):
    """Dashboard user as returned by the API."""
    id: int
    username: str
    email: Optional[str] = None
    full_name: Optional[str] = None
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class UserCreate(BaseModel):
    """Payload for creating a new dashboard user."""
    username: str
    password: str
    email: Optional[str] = None
    full_name: Optional[str] = None

    @field_validator("username")
    @classmethod
    def username_alphanumeric(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 3:
            raise ValueError("El username debe tener al menos 3 caracteres")
        if len(v) > 50:
            raise ValueError("El username no puede superar 50 caracteres")
        return v

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if len(v) < 4:
            raise ValueError("La contraseña debe tener al menos 4 caracteres")
        return v


class UserUpdate(BaseModel):
    """Payload for updating an existing dashboard user."""
    email: Optional[str] = None
    full_name: Optional[str] = None
    password: Optional[str] = None
    is_active: Optional[bool] = None
