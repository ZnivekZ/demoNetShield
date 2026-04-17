"""
Reports Router - AI report generation and PDF export.
Prefix: /api/reports
"""

from __future__ import annotations

import asyncio
import json

import structlog
from fastapi import APIRouter, Depends
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models.action_log import ActionLog
from schemas.common import APIResponse
from schemas.reports import ReportExportRequest, ReportGenerateRequest
from services.ai_service import AIService, get_ai_service
from services.pdf_service import PDFService, get_pdf_service

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/api/reports", tags=["Reports"])


@router.post("/generate")
async def generate_report(
    request: ReportGenerateRequest,
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """
    Generate an AI-powered security report draft.
    Claude uses function calling to fetch live data from Wazuh and MikroTik.
    Returns editable HTML for the TipTap editor.
    """
    try:
        ai_service = get_ai_service()
        result = await ai_service.generate_report(
            prompt=request.prompt,
            audience=request.audience,
            attached_documents=request.attached_documents,
            data_sources=request.data_sources,
            date_range=request.date_range.model_dump() if request.date_range else None,
        )

        # Log report generation
        log_entry = ActionLog(
            action_type="report_generated",
            details=json.dumps({
                "title": result.get("title", ""),
                "audience": request.audience,
                "data_sources": request.data_sources,
                "tokens_used": result.get("tokens_used", 0),
            }),
            comment=f"AI report: {request.prompt[:100]}",
        )
        db.add(log_entry)
        await db.flush()

        logger.info(
            "api_report_generated",
            audience=request.audience,
            tokens=result.get("tokens_used", 0),
        )
        return APIResponse.ok(result)
    except ValueError as e:
        # Missing API key or configuration
        return APIResponse.fail(str(e))
    except Exception as e:
        logger.error("api_generate_report_failed", error=str(e))
        return APIResponse.fail(f"Failed to generate report: {str(e)}")


@router.post("/export-pdf")
async def export_pdf(request: ReportExportRequest) -> Response:
    """
    Export HTML content to a styled PDF document.
    Returns the PDF binary directly for download.
    """
    try:
        pdf_service = get_pdf_service()

        # Run WeasyPrint in an executor since it's CPU-bound
        loop = asyncio.get_event_loop()
        pdf_bytes = await loop.run_in_executor(
            None,
            pdf_service.generate_pdf,
            request.html_content,
            request.title,
            request.metadata,
        )

        # Generate filename from title
        safe_title = "".join(
            c if c.isalnum() or c in " -_" else "_" for c in request.title
        )
        filename = f"{safe_title}.pdf"

        logger.info("api_pdf_exported", title=request.title, size=len(pdf_bytes))

        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
            },
        )
    except Exception as e:
        logger.error("api_export_pdf_failed", error=str(e))
        # Return JSON error since we can't return PDF
        return Response(
            content=json.dumps({"success": False, "error": str(e)}),
            media_type="application/json",
            status_code=500,
        )


@router.get("/history")
async def get_report_history(
    limit: int = 20,
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """Get history of generated reports from the audit log."""
    try:
        from sqlalchemy import select

        result = await db.execute(
            select(ActionLog)
            .where(ActionLog.action_type == "report_generated")
            .order_by(ActionLog.created_at.desc())
            .limit(limit)
        )
        logs = result.scalars().all()
        data = []
        for log in logs:
            data.append({
                "id": log.id,
                "details": json.loads(log.details) if log.details else {},
                "comment": log.comment,
                "created_at": log.created_at.isoformat(),
            })
        return APIResponse.ok(data)
    except Exception as e:
        logger.error("api_get_report_history_failed", error=str(e))
        return APIResponse.fail(f"Failed to get report history: {str(e)}")


# ── Telegram Bot Endpoints ────────────────────────────────────────────────────

@router.get("/telegram/status")
async def get_telegram_status() -> APIResponse:
    """Return Telegram bot connection status."""
    try:
        from services.telegram_service import get_telegram_service
        tg = get_telegram_service()
        status = await tg.get_status()
        return APIResponse.ok(status)
    except Exception as e:
        logger.error("api_telegram_status_failed", error=str(e))
        return APIResponse.fail(f"Failed to get Telegram status: {str(e)}")


@router.post("/telegram/test")
async def send_telegram_test(db: AsyncSession = Depends(get_db)) -> APIResponse:
    """Send a test message to confirm the bot is working."""
    try:
        from datetime import datetime, timezone
        from services.telegram_service import get_telegram_service

        tg = get_telegram_service()
        text = (
            "✅ <b>NetShield Dashboard — Mensaje de Prueba</b>\n\n"
            "La integración de Telegram está funcionando correctamente.\n"
            f"⏰ {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}"
        )
        result = await tg.send_message(text=text, message_type="test")

        log_entry = ActionLog(
            action_type="telegram_test_sent",
            details=json.dumps({"result": result}),
            comment="Test message sent from dashboard",
        )
        db.add(log_entry)
        await db.flush()

        return APIResponse.ok(result)
    except Exception as e:
        logger.error("api_telegram_test_failed", error=str(e))
        return APIResponse.fail(f"Failed to send test message: {str(e)}")


# ── Telegram Report Config CRUD ───────────────────────────────────────────────

@router.get("/telegram/configs")
async def get_telegram_configs(db: AsyncSession = Depends(get_db)) -> APIResponse:
    """List all Telegram report configurations."""
    try:
        from config import get_settings
        settings = get_settings()

        if settings.should_mock_telegram:
            from services.mock_data import MockData
            return APIResponse.ok(MockData.telegram.report_configs())

        from sqlalchemy import select
        from models.telegram import TelegramReportConfig

        result = await db.execute(
            select(TelegramReportConfig).order_by(TelegramReportConfig.id.asc())
        )
        configs = result.scalars().all()
        return APIResponse.ok([c.to_dict() for c in configs])
    except Exception as e:
        logger.error("api_telegram_configs_failed", error=str(e))
        return APIResponse.fail(f"Failed to get configs: {str(e)}")


@router.post("/telegram/configs")
async def create_telegram_config(
    request: dict,
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """Create a new Telegram report configuration."""
    try:
        from schemas.telegram import TelegramReportConfigCreate
        from models.telegram import TelegramReportConfig

        config_data = TelegramReportConfigCreate(**request)

        new_config = TelegramReportConfig(
            name=config_data.name,
            enabled=config_data.enabled,
            trigger=config_data.trigger,
            schedule=config_data.schedule,
            sources=",".join(config_data.sources),
            min_severity=config_data.min_severity,
            audience=config_data.audience,
            include_summary=config_data.include_summary,
            include_charts=config_data.include_charts,
            chat_id=config_data.chat_id,
        )
        db.add(new_config)
        await db.flush()
        await db.refresh(new_config)

        logger.info("api_telegram_config_created", id=new_config.id, name=new_config.name)
        return APIResponse.ok(new_config.to_dict())
    except Exception as e:
        logger.error("api_telegram_config_create_failed", error=str(e))
        return APIResponse.fail(f"Failed to create config: {str(e)}")


@router.put("/telegram/configs/{config_id}")
async def update_telegram_config(
    config_id: int,
    request: dict,
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """Update an existing Telegram report configuration."""
    try:
        from sqlalchemy import select
        from schemas.telegram import TelegramReportConfigUpdate
        from models.telegram import TelegramReportConfig

        update_data = TelegramReportConfigUpdate(**request)

        result = await db.execute(
            select(TelegramReportConfig).filter(TelegramReportConfig.id == config_id)
        )
        cfg = result.scalar_one_or_none()
        if not cfg:
            return APIResponse.fail(f"Config {config_id} not found")

        if update_data.name is not None:
            cfg.name = update_data.name
        if update_data.enabled is not None:
            cfg.enabled = update_data.enabled
        if update_data.trigger is not None:
            cfg.trigger = update_data.trigger
        if update_data.schedule is not None:
            cfg.schedule = update_data.schedule
        if update_data.sources is not None:
            cfg.sources = ",".join(update_data.sources)
        if update_data.min_severity is not None:
            cfg.min_severity = update_data.min_severity
        if update_data.audience is not None:
            cfg.audience = update_data.audience
        if update_data.include_summary is not None:
            cfg.include_summary = update_data.include_summary
        if update_data.include_charts is not None:
            cfg.include_charts = update_data.include_charts
        if update_data.chat_id is not None:
            cfg.chat_id = update_data.chat_id

        await db.flush()
        await db.refresh(cfg)
        logger.info("api_telegram_config_updated", id=config_id)
        return APIResponse.ok(cfg.to_dict())
    except Exception as e:
        logger.error("api_telegram_config_update_failed", error=str(e))
        return APIResponse.fail(f"Failed to update config: {str(e)}")


@router.delete("/telegram/configs/{config_id}")
async def delete_telegram_config(
    config_id: int,
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """Delete a Telegram report configuration."""
    try:
        from sqlalchemy import select, delete
        from models.telegram import TelegramReportConfig

        result = await db.execute(
            select(TelegramReportConfig).filter(TelegramReportConfig.id == config_id)
        )
        cfg = result.scalar_one_or_none()
        if not cfg:
            return APIResponse.fail(f"Config {config_id} not found")

        await db.execute(
            delete(TelegramReportConfig).where(TelegramReportConfig.id == config_id)
        )
        await db.flush()
        logger.info("api_telegram_config_deleted", id=config_id)
        return APIResponse.ok({"deleted": True, "id": config_id})
    except Exception as e:
        logger.error("api_telegram_config_delete_failed", error=str(e))
        return APIResponse.fail(f"Failed to delete config: {str(e)}")


@router.post("/telegram/configs/{config_id}/trigger-now")
async def trigger_telegram_config_now(
    config_id: int,
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """Manually trigger a report config immediately."""
    try:
        from services.telegram_scheduler import get_telegram_scheduler
        scheduler = get_telegram_scheduler()
        result = await scheduler.trigger_config_now(config_id)

        log_entry = ActionLog(
            action_type="telegram_report_triggered",
            details=json.dumps({"config_id": config_id}),
            comment=f"Manual trigger for Telegram config #{config_id}",
        )
        db.add(log_entry)
        await db.flush()
        return APIResponse.ok(result)
    except Exception as e:
        logger.error("api_telegram_trigger_failed", config_id=config_id, error=str(e))
        return APIResponse.fail(f"Failed to trigger config: {str(e)}")


# ── Telegram Manual Send ──────────────────────────────────────────────────────

@router.post("/telegram/send-alert")
async def send_telegram_alert(
    request: dict,
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """Send a manual security alert to the Telegram channel."""
    try:
        from schemas.telegram import TelegramAlert
        from services.telegram_service import get_telegram_service

        alert_data = TelegramAlert(**request)
        tg = get_telegram_service()
        result = await tg.send_alert(alert_data.model_dump())

        log_entry = ActionLog(
            action_type="telegram_alert_sent",
            details=json.dumps({
                "title": alert_data.title,
                "severity": alert_data.severity,
                "source": alert_data.source,
            }),
            comment=f"Manual Telegram alert: {alert_data.title[:80]}",
        )
        db.add(log_entry)
        await db.flush()
        logger.info("api_telegram_alert_sent", title=alert_data.title)
        return APIResponse.ok(result)
    except Exception as e:
        logger.error("api_telegram_send_alert_failed", error=str(e))
        return APIResponse.fail(f"Failed to send alert: {str(e)}")


@router.post("/telegram/send-summary")
async def send_telegram_summary(
    request: dict,
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """Send a current system status summary to the Telegram channel."""
    try:
        from schemas.telegram import TelegramSendSummaryRequest
        from services.telegram_service import get_telegram_service

        summary_req = TelegramSendSummaryRequest(**request)
        tg = get_telegram_service()
        result = await tg.send_status_summary(
            sources=summary_req.sources,
            chat_id=summary_req.chat_id,
        )

        log_entry = ActionLog(
            action_type="telegram_summary_sent",
            details=json.dumps({"sources": summary_req.sources}),
            comment="Manual system summary sent to Telegram",
        )
        db.add(log_entry)
        await db.flush()
        return APIResponse.ok(result)
    except Exception as e:
        logger.error("api_telegram_send_summary_failed", error=str(e))
        return APIResponse.fail(f"Failed to send summary: {str(e)}")


# ── Telegram Message Logs ─────────────────────────────────────────────────────

@router.get("/telegram/logs")
async def get_telegram_logs(
    limit: int = 20,
    direction: str | None = None,
    message_type: str | None = None,
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """Get Telegram message history."""
    try:
        from config import get_settings
        settings = get_settings()

        if settings.should_mock_telegram:
            from services.mock_data import MockData
            logs = MockData.telegram.message_logs(limit=limit)
            if direction:
                logs = [l for l in logs if l["direction"] == direction]
            if message_type:
                logs = [l for l in logs if l["message_type"] == message_type]
            return APIResponse.ok(logs[:limit])

        from sqlalchemy import select
        from models.telegram import TelegramMessageLog

        query = select(TelegramMessageLog).order_by(TelegramMessageLog.created_at.desc())
        if direction:
            query = query.filter(TelegramMessageLog.direction == direction)
        if message_type:
            query = query.filter(TelegramMessageLog.message_type == message_type)
        query = query.limit(limit)

        result = await db.execute(query)
        logs = result.scalars().all()
        return APIResponse.ok([l.to_dict() for l in logs])
    except Exception as e:
        logger.error("api_telegram_logs_failed", error=str(e))
        return APIResponse.fail(f"Failed to get logs: {str(e)}")


# ── Telegram Webhook (inbound from bot) ───────────────────────────────────────

@router.post("/telegram/webhook")
async def telegram_webhook(request: dict) -> dict:
    """
    Telegram webhook endpoint for inbound messages.
    Always returns 200 OK to avoid revealing endpoint existence.
    Secret validation happens inside process_incoming_message.
    """
    try:
        from services.telegram_service import get_telegram_service
        tg = get_telegram_service()
        await tg.process_incoming_message(request)
    except Exception as e:
        logger.error("api_telegram_webhook_error", error=str(e))
    # Always return 200 OK — never reveal failures to Telegram
    return {"ok": True}
