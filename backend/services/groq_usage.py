"""Local Groq token ledger; this cannot see use from other clients or keys."""

from __future__ import annotations

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
    cutoff = utc_now() - timedelta(hours=24)
    settings = get_settings()
    async with async_session_factory() as db:
        rows = (await db.execute(
            select(GroqUsage.model, func.sum(GroqUsage.total_tokens))
            .where(GroqUsage.created_at >= cutoff)
            .group_by(GroqUsage.model)
        )).all()
    used = {model: int(total or 0) for model, total in rows}
    models = []
    for model, setting in MODEL_LIMIT_SETTING.items():
        limit = max(0, int(getattr(settings, setting)))
        count = used.get(model, 0)
        models.append({"model": model, "limit_24h_configured": limit,
                       "used_24h_local": count,
                       "remaining_24h_estimated": max(0, limit - count) if limit else None})
    return {"models": models, "window": "rolling_24h_utc", "estimated": True,
            "configured": bool(settings.groq_api_key.strip()),
            "note": "No incluye uso de otras aplicaciones o claves de la organización."}
