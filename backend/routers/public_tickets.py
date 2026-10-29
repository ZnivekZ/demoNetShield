"""
Portal público de tickets — `/api/public` (sin autenticación).

Un usuario cualquiera carga un ticket con su email; **no se valida identidad**.
El ticket se crea en GLPI con la cuenta de servicio y el vínculo
email ↔ ticket se guarda en `public_tickets`, que es lo que permite consultar
el estado (hay que acertar **ID + email**: el ID solo no alcanza).

Protecciones: rate limit por IP, honeypot, dedupe (10 min), límites de tamaño
y sanitización de texto. No se exponen datos internos del ticket.
"""

from __future__ import annotations

import hashlib
import time
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone
from typing import Deque

import structlog
from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import get_settings
from database import get_db
from models.public_ticket import PublicTicket
from schemas.common import APIResponse
from schemas.public import PublicTicketCreate, PublicTicketCreated, PublicTicketStatus
from services.glpi_legacy import GlpiLegacyError, link_document_to_ticket, upload_document
from services.glpi_service import GLPIService, get_glpi_service

logger = structlog.get_logger(__name__)
settings = get_settings()

router = APIRouter(prefix="/api/public", tags=["Portal Público"])

STATUS_LABELS: dict[int, str] = {
    1: "Nuevo",
    2: "En proceso (asignado)",
    3: "En proceso (planificado)",
    4: "Pendiente",
    5: "Resuelto",
    6: "Cerrado",
}
ALLOWED_MIME = {"image/jpeg", "image/png", "image/webp", "application/pdf", "text/plain"}
DEDUPE_WINDOW = timedelta(minutes=10)

# Rate limit en memoria (por proceso). Suficiente para 1 worker; con varios
# habría que moverlo a Redis/tabla.
_hits: dict[str, Deque[float]] = defaultdict(deque)


def get_glpi() -> GLPIService:
    return get_glpi_service()


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for", "")
    return (forwarded.split(",")[0].strip() if forwarded else (request.client.host if request.client else "0.0.0.0"))


def _ip_hash(ip: str) -> str:
    """Hash con sal (no guardamos la IP cruda)."""
    salt = getattr(settings, "jwt_secret_key", "") or "netshield"
    return hashlib.sha256(f"{salt}:{ip}".encode()).hexdigest()[:32]


def _rate_ok(bucket: str, limit: int, window_s: int = 3600) -> bool:
    now = time.time()
    hits = _hits[bucket]
    while hits and now - hits[0] > window_s:
        hits.popleft()
    if len(hits) >= limit:
        return False
    hits.append(now)
    return True


def _require_enabled() -> None:
    if not settings.public_tickets_enabled:
        raise HTTPException(status_code=404, detail="El portal público está deshabilitado")


@router.post("/tickets")
async def create_public_ticket(
    payload: PublicTicketCreate,
    request: Request,
    glpi: GLPIService = Depends(get_glpi),
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """Crea un ticket desde el portal público. Devuelve el ID a guardar."""
    _require_enabled()

    ip = _client_ip(request)
    if payload.website:  # honeypot
        logger.warning("public_ticket_honeypot", ip_hash=_ip_hash(ip))
        raise HTTPException(status_code=400, detail="Solicitud inválida")

    if not _rate_ok(f"create:{ip}", settings.public_tickets_rate_limit):
        logger.warning("public_ticket_rate_limited", ip_hash=_ip_hash(ip))
        raise HTTPException(status_code=429, detail="Demasiadas solicitudes, intentá más tarde")

    # Dedupe: mismo email + título en los últimos 10 minutos
    since = datetime.now(timezone.utc).replace(tzinfo=None) - DEDUPE_WINDOW
    existing = (
        await db.execute(
            select(PublicTicket)
            .where(
                PublicTicket.email == payload.email,
                PublicTicket.title == payload.title,
                PublicTicket.created_at >= since,
            )
            .order_by(PublicTicket.id.desc())
        )
    ).scalars().first()
    if existing:
        logger.info("public_ticket_deduped", ticket=existing.glpi_ticket_id)
        return APIResponse.ok(
            PublicTicketCreated(ticket_id=existing.glpi_ticket_id, message="Ya teníamos este ticket")
        )

    content = "\n".join(
        [
            payload.description,
            "",
            "---",
            f"Solicitante: {payload.email}",
            f"Equipo: {payload.equipment or 'no indicado'}",
            f"Categoría: {payload.category or 'sin categoría'}",
            "Origen: portal público",
        ]
    )

    try:
        created = await glpi.create_ticket(
            {"title": payload.title, "description": content, "priority": payload.priority}
        )
    except Exception as e:  # noqa: BLE001
        logger.error("public_ticket_create_failed", error=str(e))
        raise HTTPException(status_code=502, detail="No pudimos crear el ticket. Intentá de nuevo.") from e

    ticket_id = int(created["id"])
    db.add(
        PublicTicket(
            glpi_ticket_id=ticket_id,
            email=payload.email,
            title=payload.title,
            ip_hash=_ip_hash(ip),
        )
    )
    await db.commit()

    logger.info("public_ticket_created", ticket=ticket_id, email=payload.email)
    return APIResponse.ok(PublicTicketCreated(ticket_id=ticket_id))


@router.get("/tickets/{ticket_id}")
async def get_public_ticket_status(
    ticket_id: int,
    email: str,
    request: Request,
    glpi: GLPIService = Depends(get_glpi),
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """Estado de un ticket. Exige ID + email (el ID solo no sirve)."""
    _require_enabled()

    ip = _client_ip(request)
    if not _rate_ok(f"status:{ip}", 60):
        raise HTTPException(status_code=429, detail="Demasiadas consultas, intentá más tarde")

    row = (
        await db.execute(
            select(PublicTicket).where(
                PublicTicket.glpi_ticket_id == ticket_id,
                PublicTicket.email == email.strip().lower(),
            )
        )
    ).scalars().first()
    if not row:
        # Genérico a propósito: no revelamos si el ID existe.
        raise HTTPException(status_code=404, detail="No encontramos un ticket con esos datos")

    try:
        status = await glpi.get_ticket_status(ticket_id)
    except Exception as e:  # noqa: BLE001
        logger.error("public_ticket_status_failed", ticket=ticket_id, error=str(e))
        raise HTTPException(status_code=502, detail="No pudimos consultar el estado. Intentá de nuevo.") from e

    return APIResponse.ok(
        PublicTicketStatus(
            ticket_id=status["ticket_id"],
            title=status["title"],
            status=status["status"],
            status_label=STATUS_LABELS.get(status["status"], "Desconocido"),
            created_at=status.get("created_at"),
            updated_at=status.get("updated_at"),
            attachment=row.attachment_name,
        )
    )


@router.post("/tickets/{ticket_id}/attachment")
async def upload_public_attachment(
    ticket_id: int,
    request: Request,
    email: str = Form(...),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """Adjunta un archivo a un ticket del portal (multipart)."""
    _require_enabled()

    row = (
        await db.execute(
            select(PublicTicket).where(
                PublicTicket.glpi_ticket_id == ticket_id,
                PublicTicket.email == email.strip().lower(),
            )
        )
    ).scalars().first()
    if not row:
        raise HTTPException(status_code=404, detail="No encontramos un ticket con esos datos")

    if not _rate_ok(f"attach:{_client_ip(request)}", 10):
        raise HTTPException(status_code=429, detail="Demasiadas subidas, intentá más tarde")

    mime = (file.content_type or "").lower()
    if mime not in ALLOWED_MIME:
        raise HTTPException(status_code=415, detail="Formato no permitido (jpg, png, webp, pdf o txt)")

    content = await file.read()
    max_bytes = settings.public_tickets_max_mb * 1024 * 1024
    if len(content) > max_bytes:
        raise HTTPException(status_code=413, detail=f"El archivo supera {settings.public_tickets_max_mb} MB")
    if not content:
        raise HTTPException(status_code=400, detail="El archivo está vacío")

    filename = (file.filename or "adjunto").rsplit("/", 1)[-1].rsplit("\\", 1)[-1][:120]
    try:
        doc_id = await upload_document(filename, content, mime)
        await link_document_to_ticket(doc_id, ticket_id)
    except GlpiLegacyError as e:
        logger.error("public_ticket_attachment_failed", ticket=ticket_id, error=str(e))
        raise HTTPException(status_code=502, detail="No pudimos adjuntar el archivo") from e

    row.attachment_name = filename
    await db.commit()

    logger.info("public_ticket_attachment_added", ticket=ticket_id, document=doc_id, size=len(content))
    return APIResponse.ok({"ticket_id": ticket_id, "attachment": filename})
