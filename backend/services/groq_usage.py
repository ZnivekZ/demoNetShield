"""Local Groq token ledger; this cannot see use from other clients or keys."""

from __future__ import annotations

import asyncio
from datetime import timedelta

import structlog
from sqlalchemy import func, select

from config import get_settings
from database import async_session_factory
from models.ai_diagnosis import GroqUsage, utc_now

logger = structlog.get_logger(__name__)

MODEL_LIMIT_SETTING = {
    "openai/gpt-oss-120b": "groq_tpd_120b",
    "openai/gpt-oss-20b": "groq_tpd_20b",
}
MODEL_TPM_SETTING = {
    "openai/gpt-oss-120b": "groq_tpm_120b",
    "openai/gpt-oss-20b": "groq_tpm_20b",
}
_MODEL_REQUEST_LOCKS = {model: asyncio.Lock() for model in MODEL_LIMIT_SETTING}


def model_request_lock(model: str) -> asyncio.Lock:
    """Serialize token-consuming calls from Digest and Diagnosis for one model."""
    return _MODEL_REQUEST_LOCKS.setdefault(model, asyncio.Lock())


async def model_rate_wait(model: str, projected_tokens: int) -> float:
    """Seconds until local rolling-minute use has room for another request."""
    setting = MODEL_TPM_SETTING.get(model)
    if not setting:
        return 0.0
    limit = max(0, int(getattr(get_settings(), setting, 0)))
    if not limit:
        return 0.0
    now = utc_now()
    async with async_session_factory() as db:
        rows = (await db.execute(
            select(GroqUsage.created_at, GroqUsage.total_tokens)
            .where(GroqUsage.model == model, GroqUsage.created_at >= now - timedelta(minutes=1))
            .order_by(GroqUsage.created_at)
        )).all()
    remaining = sum(int(tokens or 0) for _, tokens in rows)
    reservation = min(max(projected_tokens, 1), limit)
    if remaining + reservation <= limit:
        return 0.0
    for created_at, tokens in rows:
        remaining -= int(tokens or 0)
        if remaining + reservation <= limit:
            return max(0.0, (created_at + timedelta(minutes=1) - now).total_seconds() + 0.5)
    return 60.0


async def record_usage(model: str, feature: str, usage: object | None) -> None:
    if usage is None:
        return
    prompt = int(getattr(usage, "prompt_tokens", 0) or 0)
    completion = int(getattr(usage, "completion_tokens", 0) or 0)
    total = int(getattr(usage, "total_tokens", 0) or prompt + completion)
    try:
        async with async_session_factory() as db:
            db.add(GroqUsage(model=model, feature=feature, input_tokens=prompt,
                             output_tokens=completion, total_tokens=total))
            await db.commit()
    except Exception as exc:  # Usage failure must not discard a successful analysis.
        logger.warning("groq_usage_record_failed", error=str(exc))


async def get_usage_status() -> dict:
    now = utc_now()
    cutoff = now - timedelta(hours=24)
    settings = get_settings()
    async with async_session_factory() as db:
        rows = (await db.execute(
            select(GroqUsage.model, func.sum(GroqUsage.total_tokens),
                   func.sum(GroqUsage.total_tokens).filter(GroqUsage.created_at >= now - timedelta(minutes=1)))
            .where(GroqUsage.created_at >= cutoff)
            .group_by(GroqUsage.model)
        )).all()
    used = {model: (int(total or 0), int(minute or 0)) for model, total, minute in rows}
    models = []
    for model, setting in MODEL_LIMIT_SETTING.items():
        limit = max(0, int(getattr(settings, setting)))
        count, minute = used.get(model, (0, 0))
        tpm = max(0, int(getattr(settings, MODEL_TPM_SETTING[model])))
        models.append({"model": model, "limit_24h_configured": limit,
                       "used_24h_local": count,
                       "remaining_24h_estimated": max(0, limit - count) if limit else None,
                       "limit_tpm_configured": tpm, "used_1m_local": minute,
                       "remaining_1m_estimated": max(0, tpm - minute) if tpm else None})
    return {"models": models, "window": "rolling_24h_utc", "estimated": True,
            "configured": bool(settings.groq_api_key.strip()),
            "note": "No incluye uso de otras aplicaciones o claves de la organización."}
