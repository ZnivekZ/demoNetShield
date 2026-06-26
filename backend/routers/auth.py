"""
Auth Router — NetShield Dashboard authentication endpoints.

Prefix: /api/auth
Tag: Auth

Endpoints:
    POST   /api/auth/login          — Login con usuario/contraseña → JWT
    GET    /api/auth/me             — Validar sesión activa (requiere token)
    POST   /api/auth/logout         — Stateless: solo para que el cliente limpie el token
    GET    /api/auth/users          — Listar todos los usuarios (requiere token)
    POST   /api/auth/users          — Crear usuario (requiere token)
    PUT    /api/auth/users/{id}     — Editar usuario (requiere token)
    DELETE /api/auth/users/{id}     — Eliminar usuario (requiere token)

Dependency `get_current_user`:
    Extrae el token del header Authorization: Bearer <token>,
    decodifica JWT y retorna el User de la DB.
    Lanza HTTPException 401 si el token es inválido/expirado o el usuario está inactivo.

Audit:
    Todas las acciones de auth (login, logout, CRUD usuarios) se registran en ActionLog.
"""

from __future__ import annotations

import json

import structlog
from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional

from database import get_db
from schemas.auth import LoginRequest, TokenResponse, UserCreate, UserResponse, UserUpdate
from schemas.common import APIResponse
from services.auth_service import create_access_token, decode_token, get_auth_service
from models.action_log import ActionLog
from models.user import User

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/api/auth", tags=["Auth"])


# ── Dependency: token validation ──────────────────────────────────────────────

async def get_current_user(
    authorization: Optional[str] = Header(None, alias="Authorization"),
) -> User:
    """
    FastAPI dependency that validates the JWT token from the Authorization header.
    Usage: current_user: User = Depends(get_current_user)
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=401,
            detail="Token de autenticación requerido",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = authorization.split(" ", 1)[1]
    payload = decode_token(token)

    if payload is None:
        raise HTTPException(
            status_code=401,
            detail="Token inválido o expirado",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id = payload.get("sub")
    if user_id is None:
        raise HTTPException(status_code=401, detail="Token malformado")

    auth_service = get_auth_service()
    user = await auth_service.get_user_by_id(int(user_id))

    if user is None or not user.is_active:
        raise HTTPException(
            status_code=401,
            detail="Usuario no encontrado o inactivo",
        )

    return user


def _user_to_response(user: User) -> UserResponse:
    """Convert a User ORM object to a UserResponse schema."""
    return UserResponse(
        id=user.id,
        username=user.username,
        email=user.email,
        full_name=user.full_name,
        is_active=user.is_active,
        created_at=user.created_at,
    )


# ── Auth Endpoints ────────────────────────────────────────────────────────────

@router.post("/login", response_model=TokenResponse, summary="Login")
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    """
    Authenticate with username and password.
    Returns a JWT access token on success.
    """
    try:
        auth_service = get_auth_service()
        user = await auth_service.authenticate_user(body.username, body.password)

        if not user:
            # Log failed login attempt
            log_entry = ActionLog(
                action_type="auth_login_failed",
                details=json.dumps({"reason": "invalid_credentials"}),
                performed_by=body.username,
                comment=f"Intento de login fallido: {body.username}",
            )
            db.add(log_entry)
            await db.flush()

            raise HTTPException(
                status_code=401,
                detail="Credenciales incorrectas",
                headers={"WWW-Authenticate": "Bearer"},
            )

        token = create_access_token(data={"sub": str(user.id)})

        # Log successful login
        log_entry = ActionLog(
            action_type="auth_login",
            details=json.dumps({"method": "jwt", "user_id": user.id}),
            performed_by=user.username,
            comment=f"Login exitoso: {user.username}",
        )
        db.add(log_entry)
        await db.flush()

        return TokenResponse(access_token=token)

    except HTTPException:
        raise
    except Exception as e:
        logger.error("auth_login_error", error=str(e))
        raise HTTPException(status_code=500, detail="Error interno de autenticación")


@router.get("/me", response_model=APIResponse[UserResponse], summary="Validar sesión")
async def get_me(current_user: User = Depends(get_current_user)):
    """Return the currently authenticated user's profile."""
    try:
        return APIResponse.ok(_user_to_response(current_user))
    except Exception as e:
        return APIResponse.fail(str(e))


@router.post("/logout", response_model=APIResponse, summary="Logout")
async def logout(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Stateless logout — the client should delete the token from localStorage.
    This endpoint exists so the frontend can call it on logout for consistency.
    Logs the logout action for audit trail.
    """
    # Log logout
    log_entry = ActionLog(
        action_type="auth_logout",
        details=json.dumps({"user_id": current_user.id}),
        performed_by=current_user.username,
        comment=f"Logout: {current_user.username}",
    )
    db.add(log_entry)
    await db.flush()

    return APIResponse.ok({"message": "Sesión cerrada correctamente"})


# ── Users CRUD ────────────────────────────────────────────────────────────────

@router.get("/users", response_model=APIResponse[list[UserResponse]], summary="Listar usuarios")
async def list_users(current_user: User = Depends(get_current_user)):
    """Return all dashboard users."""
    try:
        auth_service = get_auth_service()
        users = await auth_service.get_all_users()
        return APIResponse.ok([_user_to_response(u) for u in users])
    except Exception as e:
        logger.error("auth_list_users_error", error=str(e))
        return APIResponse.fail(str(e))


@router.post("/users", response_model=APIResponse[UserResponse], summary="Crear usuario")
async def create_user(
    body: UserCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new dashboard user."""
    try:
        auth_service = get_auth_service()
        user = await auth_service.create_user(body)

        # Log user creation
        log_entry = ActionLog(
            action_type="auth_user_created",
            details=json.dumps({
                "new_user": user.username,
                "new_user_id": user.id,
                "email": user.email,
                "full_name": user.full_name,
            }),
            performed_by=current_user.username,
            comment=f"Usuario creado: {user.username}",
        )
        db.add(log_entry)
        await db.flush()

        return APIResponse.ok(_user_to_response(user))
    except ValueError as e:
        return APIResponse.fail(str(e))
    except Exception as e:
        logger.error("auth_create_user_error", error=str(e))
        return APIResponse.fail(str(e))


@router.put("/users/{user_id}", response_model=APIResponse[UserResponse], summary="Editar usuario")
async def update_user(
    user_id: int,
    body: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update a dashboard user's profile or password."""
    try:
        auth_service = get_auth_service()

        # Determine which fields changed for the audit log
        changes = []
        if body.email is not None:
            changes.append("email")
        if body.full_name is not None:
            changes.append("full_name")
        if body.password is not None:
            changes.append("password")
        if body.is_active is not None:
            changes.append("is_active")

        user = await auth_service.update_user(user_id, body)
        if not user:
            return APIResponse.fail(f"Usuario con id={user_id} no encontrado")

        # Log user update
        log_entry = ActionLog(
            action_type="auth_user_updated",
            details=json.dumps({
                "target_user": user.username,
                "target_user_id": user_id,
                "changes": changes,
            }),
            performed_by=current_user.username,
            comment=f"Usuario editado: {user.username} ({', '.join(changes)})",
        )
        db.add(log_entry)
        await db.flush()

        return APIResponse.ok(_user_to_response(user))
    except Exception as e:
        logger.error("auth_update_user_error", user_id=user_id, error=str(e))
        return APIResponse.fail(str(e))


@router.delete("/users/{user_id}", response_model=APIResponse, summary="Eliminar usuario")
async def delete_user(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a dashboard user. Cannot delete yourself."""
    try:
        if user_id == current_user.id:
            return APIResponse.fail("No podés eliminar tu propio usuario")

        auth_service = get_auth_service()

        # Get user info before deletion for the audit log
        target_user = await auth_service.get_user_by_id(user_id)
        target_username = target_user.username if target_user else f"id={user_id}"

        deleted = await auth_service.delete_user(user_id)
        if not deleted:
            return APIResponse.fail(f"Usuario con id={user_id} no encontrado")

        # Log user deletion
        log_entry = ActionLog(
            action_type="auth_user_deleted",
            details=json.dumps({
                "deleted_user": target_username,
                "deleted_user_id": user_id,
            }),
            performed_by=current_user.username,
            comment=f"Usuario eliminado: {target_username}",
        )
        db.add(log_entry)
        await db.flush()

        return APIResponse.ok({"deleted": True, "user_id": user_id})
    except Exception as e:
        logger.error("auth_delete_user_error", user_id=user_id, error=str(e))
        return APIResponse.fail(str(e))
