"""
Reports Router - AI report generation, PDF export, saved reports, and schedules.
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
from services.audit_service import log_action
from schemas.common import APIResponse
from schemas.reports import ReportExportRequest, ReportGenerateRequest
from schemas.saved_report import (
    SavedReportCreate, SavedReportUpdate,
    ReportScheduleCreate, ReportScheduleUpdate,
)
from services.ai_service import AIService, get_ai_service, REPORT_TEMPLATES
from services.pdf_service import PDFService, get_pdf_service

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/api/reports", tags=["Reports"])


# ── Static metadata ───────────────────────────────────────────────

@router.get("/templates")
async def get_report_templates() -> APIResponse:
    """Return list of predefined report templates."""
    return APIResponse.ok(REPORT_TEMPLATES)



# ── Report Generation ─────────────────────────────────────────────

@router.post("/generate")
async def generate_report(
    request: ReportGenerateRequest,
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """
    Generate an AI-powered security report draft.
    Uses function calling to fetch live data from security systems.
    Auto-saves result to saved_reports table.
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
            comparison_range=request.comparison_range.model_dump() if request.comparison_range else None,
        )

        # Auto-save to saved_reports
        saved_id = None
        try:
            from models.saved_report import SavedReport
            saved = SavedReport(
                title=result.get("title", "Sin título"),
                html_content=result.get("html_content", ""),
                prompt=request.prompt,
                audience=request.audience,
                model_used=result.get("model_used", ""),
                data_sources=json.dumps(result.get("data_sources_used", [])),
                tokens_used=result.get("tokens_used", 0),
                created_by="dashboard",
            )
            db.add(saved)
            await db.flush()
            await db.refresh(saved)
            saved_id = saved.id
        except Exception as e:
            logger.warning("report_auto_save_failed", error=str(e))

        await log_action(
            db,
            action_type="report_generated",
            severity="medium",
            details={
                "title": result.get("title", ""),
                "audience": request.audience,
                "data_sources": request.data_sources,
                "tokens_used": result.get("tokens_used", 0),
                "model": result.get("model_used", ""),
                "saved_report_id": saved_id,
            },
            comment=f"AI report: {request.prompt[:100]}",
        )

        logger.info(
            "api_report_generated",
            audience=request.audience,
            tokens=result.get("tokens_used", 0),
            saved_id=saved_id,
        )
        result["saved_report_id"] = saved_id
        return APIResponse.ok(result)
    except ValueError as e:
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
        loop = asyncio.get_event_loop()
        pdf_bytes = await loop.run_in_executor(
            None,
            pdf_service.generate_pdf,
            request.html_content,
            request.title,
            request.metadata,
        )

        safe_title = "".join(
            c if c.isalnum() or c in " -_" else "_" for c in request.title
        )
        filename = f"{safe_title}.pdf"

        logger.info("api_pdf_exported", title=request.title, size=len(pdf_bytes))

        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    except Exception as e:
        logger.error("api_export_pdf_failed", error=str(e))
        return Response(
            content=json.dumps({"success": False, "error": str(e)}),
            media_type="application/json",
            status_code=500,
        )


# ── Saved Reports CRUD ────────────────────────────────────────────

@router.get("/saved")
async def list_saved_reports(
    page: int = 1,
    page_size: int = 20,
    audience: str | None = None,
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """List saved reports with pagination and optional audience filter."""
    try:
        from sqlalchemy import select, func
        from models.saved_report import SavedReport

        query = select(SavedReport)
        count_query = select(func.count()).select_from(SavedReport)

        if audience:
            query = query.where(SavedReport.audience == audience)
            count_query = count_query.where(SavedReport.audience == audience)

        total_result = await db.execute(count_query)
        total = total_result.scalar() or 0

        query = query.order_by(SavedReport.created_at.desc())
        query = query.offset((page - 1) * page_size).limit(page_size)

        result = await db.execute(query)
        reports = result.scalars().all()

        return APIResponse.ok({
            "items": [r.to_dict(include_html=False) for r in reports],
            "pagination": {
                "page": page,
                "page_size": page_size,
                "total": total,
                "total_pages": max(1, (total + page_size - 1) // page_size),
                "has_next": page * page_size < total,
                "has_prev": page > 1,
            },
        })
    except Exception as e:
        logger.error("api_list_saved_reports_failed", error=str(e))
        return APIResponse.fail(f"Failed to list reports: {str(e)}")


@router.get("/saved/{report_id}")
async def get_saved_report(report_id: int, db: AsyncSession = Depends(get_db)) -> APIResponse:
    """Get a single saved report with full HTML content."""
    try:
        from sqlalchemy import select
        from models.saved_report import SavedReport

        result = await db.execute(select(SavedReport).where(SavedReport.id == report_id))
        report = result.scalar_one_or_none()
        if not report:
            return APIResponse.fail(f"Report {report_id} not found")
        return APIResponse.ok(report.to_dict(include_html=True))
    except Exception as e:
        logger.error("api_get_saved_report_failed", error=str(e))
        return APIResponse.fail(f"Failed to get report: {str(e)}")


@router.post("/saved")
async def create_saved_report(
    request: SavedReportCreate,
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """Manually save a report (e.g., after manual editing in the editor)."""
    try:
        from models.saved_report import SavedReport

        report = SavedReport(
            title=request.title,
            html_content=request.html_content,
            prompt=request.prompt,
            audience=request.audience,
            model_used=request.model_used,
            data_sources=json.dumps(request.data_sources),
            tokens_used=request.tokens_used,
            created_by="dashboard",
        )
        db.add(report)
        await db.flush()
        await db.refresh(report)
        return APIResponse.ok(report.to_dict(include_html=False))
    except Exception as e:
        logger.error("api_create_saved_report_failed", error=str(e))
        return APIResponse.fail(f"Failed to save report: {str(e)}")


@router.put("/saved/{report_id}")
async def update_saved_report(
    report_id: int,
    request: SavedReportUpdate,
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """Update title or HTML content of a saved report."""
    try:
        from sqlalchemy import select
        from models.saved_report import SavedReport

        result = await db.execute(select(SavedReport).where(SavedReport.id == report_id))
        report = result.scalar_one_or_none()
        if not report:
            return APIResponse.fail(f"Report {report_id} not found")

        if request.title is not None:
            report.title = request.title
        if request.html_content is not None:
            report.html_content = request.html_content

        await db.flush()
        await db.refresh(report)
        return APIResponse.ok(report.to_dict(include_html=False))
    except Exception as e:
        logger.error("api_update_saved_report_failed", error=str(e))
        return APIResponse.fail(f"Failed to update report: {str(e)}")


@router.delete("/saved/{report_id}")
async def delete_saved_report(
    report_id: int,
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """Delete a saved report."""
    try:
        from sqlalchemy import select, delete
        from models.saved_report import SavedReport

        result = await db.execute(select(SavedReport).where(SavedReport.id == report_id))
        report = result.scalar_one_or_none()
        if not report:
            return APIResponse.fail(f"Report {report_id} not found")

        await db.execute(delete(SavedReport).where(SavedReport.id == report_id))
        await db.flush()
        return APIResponse.ok({"deleted": True, "id": report_id})
    except Exception as e:
        logger.error("api_delete_saved_report_failed", error=str(e))
        return APIResponse.fail(f"Failed to delete report: {str(e)}")


# ── Report Schedules CRUD ─────────────────────────────────────────

@router.get("/schedules")
async def list_report_schedules(db: AsyncSession = Depends(get_db)) -> APIResponse:
    """List all report schedules."""
    try:
        from sqlalchemy import select
        from models.saved_report import ReportSchedule

        result = await db.execute(select(ReportSchedule).order_by(ReportSchedule.id.asc()))
        schedules = result.scalars().all()
        return APIResponse.ok([s.to_dict() for s in schedules])
    except Exception as e:
        logger.error("api_list_schedules_failed", error=str(e))
        return APIResponse.fail(f"Failed to list schedules: {str(e)}")


@router.post("/schedules")
async def create_report_schedule(
    request: ReportScheduleCreate,
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """Create a new automated report schedule."""
    try:
        from models.saved_report import ReportSchedule
        from services.report_scheduler import get_report_scheduler

        schedule = ReportSchedule(
            name=request.name,
            enabled=request.enabled,
            cron_expression=request.cron_expression,
            template_id=request.template_id,
            prompt=request.prompt,
            audience=request.audience,
            data_sources=json.dumps(request.data_sources),
            model=request.model,
            output=request.output,
        )
        db.add(schedule)
        await db.flush()
        await db.refresh(schedule)

        # Register in APScheduler
        scheduler = get_report_scheduler()
        await scheduler.reload_schedule(schedule.id, schedule.enabled, schedule.cron_expression)

        return APIResponse.ok(schedule.to_dict())
    except Exception as e:
        logger.error("api_create_schedule_failed", error=str(e))
        return APIResponse.fail(f"Failed to create schedule: {str(e)}")


@router.put("/schedules/{schedule_id}")
async def update_report_schedule(
    schedule_id: int,
    request: ReportScheduleUpdate,
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """Update an existing report schedule."""
    try:
        from sqlalchemy import select
        from models.saved_report import ReportSchedule
        from services.report_scheduler import get_report_scheduler

        result = await db.execute(select(ReportSchedule).where(ReportSchedule.id == schedule_id))
        schedule = result.scalar_one_or_none()
        if not schedule:
            return APIResponse.fail(f"Schedule {schedule_id} not found")

        if request.name is not None:
            schedule.name = request.name
        if request.enabled is not None:
            schedule.enabled = request.enabled
        if request.cron_expression is not None:
            schedule.cron_expression = request.cron_expression
        if request.template_id is not None:
            schedule.template_id = request.template_id
        if request.prompt is not None:
            schedule.prompt = request.prompt
        if request.audience is not None:
            schedule.audience = request.audience
        if request.data_sources is not None:
            schedule.data_sources = json.dumps(request.data_sources)
        if request.model is not None:
            schedule.model = request.model
        if request.output is not None:
            schedule.output = request.output

        await db.flush()
        await db.refresh(schedule)

        scheduler = get_report_scheduler()
        await scheduler.reload_schedule(schedule.id, schedule.enabled, schedule.cron_expression)

        return APIResponse.ok(schedule.to_dict())
    except Exception as e:
        logger.error("api_update_schedule_failed", error=str(e))
        return APIResponse.fail(f"Failed to update schedule: {str(e)}")


@router.delete("/schedules/{schedule_id}")
async def delete_report_schedule(
    schedule_id: int,
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """Delete a report schedule."""
    try:
        from sqlalchemy import select, delete
        from models.saved_report import ReportSchedule
        from services.report_scheduler import get_report_scheduler

        result = await db.execute(select(ReportSchedule).where(ReportSchedule.id == schedule_id))
        if not result.scalar_one_or_none():
            return APIResponse.fail(f"Schedule {schedule_id} not found")

        await db.execute(delete(ReportSchedule).where(ReportSchedule.id == schedule_id))
        await db.flush()

        scheduler = get_report_scheduler()
        scheduler._remove_job(schedule_id)

        return APIResponse.ok({"deleted": True, "id": schedule_id})
    except Exception as e:
        logger.error("api_delete_schedule_failed", error=str(e))
        return APIResponse.fail(f"Failed to delete schedule: {str(e)}")


@router.post("/schedules/{schedule_id}/trigger")
async def trigger_report_schedule_now(
    schedule_id: int,
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """Manually trigger a scheduled report immediately."""
    try:
        from services.report_scheduler import get_report_scheduler
        scheduler = get_report_scheduler()
        result = await scheduler.execute_schedule(schedule_id)

        await log_action(
            db,
            action_type="report_schedule_triggered",
            severity="medium",
            details={"schedule_id": schedule_id, "result": result},
            comment=f"Manual trigger for report schedule #{schedule_id}",
        )
        return APIResponse.ok(result)
    except Exception as e:
        logger.error("api_trigger_schedule_failed", schedule_id=schedule_id, error=str(e))
        return APIResponse.fail(f"Failed to trigger schedule: {str(e)}")


# ── Legacy: audit log history ─────────────────────────────────────

@router.get("/history")
async def get_report_history(
    limit: int = 20,
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """Get history of generated reports from the audit log (legacy endpoint)."""
    try:
        from sqlalchemy import select
        from models.action_log import ActionLog

        result = await db.execute(
            select(ActionLog)
            .where(ActionLog.action_type == "report_generated")
            .order_by(ActionLog.created_at.desc())
            .limit(limit)
        )
        logs = result.scalars().all()
        data = [
            {
                "id": log.id,
                "details": json.loads(log.details) if log.details else {},
                "comment": log.comment,
                "created_at": log.created_at.isoformat(),
            }
            for log in logs
        ]
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

        await log_action(
            db,
            action_type="telegram_test_sent",
            severity="medium",
            details={"result": result},
            comment="Test message sent from dashboard",
        )
        return APIResponse.ok(result)
    except Exception as e:
        logger.error("api_telegram_test_failed", error=str(e))
        return APIResponse.fail(f"Failed to send test message: {str(e)}")


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

        if update_data.name is not None: cfg.name = update_data.name
        if update_data.enabled is not None: cfg.enabled = update_data.enabled
        if update_data.trigger is not None: cfg.trigger = update_data.trigger
        if update_data.schedule is not None: cfg.schedule = update_data.schedule
        if update_data.sources is not None: cfg.sources = ",".join(update_data.sources)
        if update_data.min_severity is not None: cfg.min_severity = update_data.min_severity
        if update_data.audience is not None: cfg.audience = update_data.audience
        if update_data.include_summary is not None: cfg.include_summary = update_data.include_summary
        if update_data.include_charts is not None: cfg.include_charts = update_data.include_charts
        if update_data.chat_id is not None: cfg.chat_id = update_data.chat_id

        await db.flush()
        await db.refresh(cfg)
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
        if not result.scalar_one_or_none():
            return APIResponse.fail(f"Config {config_id} not found")

        await db.execute(delete(TelegramReportConfig).where(TelegramReportConfig.id == config_id))
        await db.flush()
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

        await log_action(
            db,
            action_type="telegram_report_triggered",
            severity="medium",
            details={"config_id": config_id},
            comment=f"Manual trigger for Telegram config #{config_id}",
        )
        return APIResponse.ok(result)
    except Exception as e:
        logger.error("api_telegram_trigger_failed", config_id=config_id, error=str(e))
        return APIResponse.fail(f"Failed to trigger config: {str(e)}")


@router.post("/telegram/send-alert")
async def send_telegram_alert(request: dict, db: AsyncSession = Depends(get_db)) -> APIResponse:
    """Send a manual security alert to the Telegram channel."""
    try:
        from schemas.telegram import TelegramAlert
        from services.telegram_service import get_telegram_service

        alert_data = TelegramAlert(**request)
        tg = get_telegram_service()
        result = await tg.send_alert(alert_data.model_dump())

        await log_action(
            db,
            action_type="telegram_alert_sent",
            severity="medium",
            details={"title": alert_data.title, "severity": alert_data.severity, "source": alert_data.source},
            comment=f"Manual Telegram alert: {alert_data.title[:80]}",
        )
        return APIResponse.ok(result)
    except Exception as e:
        logger.error("api_telegram_send_alert_failed", error=str(e))
        return APIResponse.fail(f"Failed to send alert: {str(e)}")


@router.post("/telegram/send-summary")
async def send_telegram_summary(request: dict, db: AsyncSession = Depends(get_db)) -> APIResponse:
    """Send a current system status summary to the Telegram channel."""
    try:
        from schemas.telegram import TelegramSendSummaryRequest
        from services.telegram_service import get_telegram_service

        summary_req = TelegramSendSummaryRequest(**request)
        tg = get_telegram_service()
        result = await tg.send_status_summary(sources=summary_req.sources, chat_id=summary_req.chat_id)

        await log_action(
            db,
            action_type="telegram_summary_sent",
            severity="medium",
            details={"sources": summary_req.sources},
            comment="Manual system summary sent to Telegram",
        )
        return APIResponse.ok(result)
    except Exception as e:
        logger.error("api_telegram_send_summary_failed", error=str(e))
        return APIResponse.fail(f"Failed to send summary: {str(e)}")


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


@router.post("/telegram/webhook")
async def telegram_webhook(request: dict) -> dict:
    """Telegram webhook endpoint for inbound messages."""
    try:
        from services.telegram_service import get_telegram_service
        tg = get_telegram_service()
        await tg.process_incoming_message(request)
    except Exception as e:
        logger.error("api_telegram_webhook_error", error=str(e))
    return {"ok": True}
