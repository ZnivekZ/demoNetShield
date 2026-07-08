"""
Report Scheduler - Automated report generation using APScheduler.
Reuses the APScheduler infrastructure already installed for Telegram.
"""
from __future__ import annotations

import json
import structlog
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from functools import lru_cache

from config import get_settings

logger = structlog.get_logger(__name__)
settings = get_settings()


class ReportScheduler:
    """
    Manages automated report generation using APScheduler cron jobs.
    Each ReportSchedule DB record becomes an APScheduler job.
    """

    def __init__(self) -> None:
        self._scheduler = AsyncIOScheduler(timezone="UTC")
        self._started = False

    async def start(self) -> None:
        """Start the scheduler and load active schedules from DB."""
        if self._started:
            return
        try:
            await self._load_schedules()
            self._scheduler.start()
            self._started = True
            logger.info("report_scheduler_started")
        except Exception as e:
            logger.warning("report_scheduler_start_failed", error=str(e))

    async def stop(self) -> None:
        """Gracefully shutdown the scheduler."""
        if self._started and self._scheduler.running:
            self._scheduler.shutdown(wait=False)
            self._started = False
            logger.info("report_scheduler_stopped")

    async def _load_schedules(self) -> None:
        """Load all enabled schedules from DB and register APScheduler jobs."""
        try:
            from database import async_session_factory
            from models.saved_report import ReportSchedule
            from sqlalchemy import select

            async with async_session_factory() as session:
                result = await session.execute(
                    select(ReportSchedule).where(ReportSchedule.enabled == True)
                )
                schedules = result.scalars().all()
                for schedule in schedules:
                    self._add_job(schedule.id, schedule.cron_expression)
            logger.info("report_scheduler_jobs_loaded", count=len(schedules))
        except Exception as e:
            logger.warning("report_scheduler_load_failed", error=str(e))

    def _add_job(self, schedule_id: int, cron_expression: str) -> None:
        """Register an APScheduler job for the given schedule."""
        job_id = f"report_schedule_{schedule_id}"
        # Remove if exists (re-registration)
        if self._scheduler.get_job(job_id):
            self._scheduler.remove_job(job_id)

        try:
            parts = cron_expression.strip().split()
            if len(parts) != 5:
                logger.warning("report_scheduler_invalid_cron", schedule_id=schedule_id, cron=cron_expression)
                return

            minute, hour, day, month, day_of_week = parts
            trigger = CronTrigger(
                minute=minute, hour=hour, day=day,
                month=month, day_of_week=day_of_week,
                timezone="UTC",
            )
            self._scheduler.add_job(
                self.execute_schedule,
                trigger=trigger,
                args=[schedule_id],
                id=job_id,
                replace_existing=True,
            )
            logger.info("report_scheduler_job_added", schedule_id=schedule_id, cron=cron_expression)
        except Exception as e:
            logger.warning("report_scheduler_job_add_failed", schedule_id=schedule_id, error=str(e))

    def _remove_job(self, schedule_id: int) -> None:
        job_id = f"report_schedule_{schedule_id}"
        if self._scheduler.get_job(job_id):
            self._scheduler.remove_job(job_id)

    async def execute_schedule(self, schedule_id: int) -> dict:
        """Execute a scheduled report: generate + save/send according to output config."""
        from database import async_session_factory
        from models.saved_report import ReportSchedule, SavedReport
        from sqlalchemy import select
        from datetime import datetime, timezone
        import json as _json

        logger.info("report_schedule_executing", schedule_id=schedule_id)

        async with async_session_factory() as session:
            result = await session.execute(
                select(ReportSchedule).where(ReportSchedule.id == schedule_id)
            )
            schedule = result.scalar_one_or_none()
            if not schedule or not schedule.enabled:
                return {"skipped": True, "reason": "not found or disabled"}

            # Generate the report
            from services.ai_service import get_ai_service
            ai = get_ai_service()
            data_sources = _json.loads(schedule.data_sources) if schedule.data_sources else []

            try:
                report_data = await ai.generate_report(
                    prompt=schedule.prompt,
                    audience=schedule.audience,
                    data_sources=data_sources,
                    model_override=schedule.model,
                )
            except Exception as e:
                logger.error("report_schedule_generate_failed", schedule_id=schedule_id, error=str(e))
                return {"error": str(e)}

            output_modes = schedule.output.split("+")

            # Save to DB if requested
            saved_id = None
            if "save" in output_modes:
                saved = SavedReport(
                    title=report_data["title"],
                    html_content=report_data["html_content"],
                    prompt=schedule.prompt,
                    audience=schedule.audience,
                    model_used=report_data.get("model_used", schedule.model),
                    data_sources=_json.dumps(report_data.get("data_sources_used", [])),
                    tokens_used=report_data.get("tokens_used", 0),
                    created_by=f"schedule:{schedule.id}",
                )
                session.add(saved)
                await session.flush()
                await session.refresh(saved)
                saved_id = saved.id

            # Send via Telegram if requested
            if "telegram" in output_modes:
                try:
                    from services.telegram_service import get_telegram_service
                    tg = get_telegram_service()
                    summary = f"📊 <b>Reporte Automático: {report_data['title']}</b>\n\n{report_data['summary'][:400]}"
                    await tg.send_message(text=summary, message_type="scheduled_report")
                except Exception as e:
                    logger.warning("report_schedule_telegram_failed", error=str(e))

            # Update last_run_at
            schedule.last_run_at = datetime.now(timezone.utc)
            await session.commit()

        logger.info("report_schedule_executed", schedule_id=schedule_id, saved_id=saved_id)
        return {"success": True, "saved_report_id": saved_id, "title": report_data["title"]}

    async def reload_schedule(self, schedule_id: int, enabled: bool, cron_expression: str) -> None:
        """Called after create/update/delete to keep APScheduler in sync."""
        if not enabled:
            self._remove_job(schedule_id)
        else:
            self._add_job(schedule_id, cron_expression)


@lru_cache(maxsize=1)
def get_report_scheduler() -> ReportScheduler:
    return ReportScheduler()
