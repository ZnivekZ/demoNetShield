"""
Telegram Scheduler — APScheduler-based automation for Telegram report configs.

Responsibilities:
 - Load enabled scheduled configs from DB on start
 - Execute reports at their configured cron times
 - Re-check config every minute for on_alert triggers
 - Provide start() / stop() for main.py lifespan

Design:
 - Uses APScheduler AsyncIOScheduler (native asyncio, no threads)
 - Each config maps to a job with a unique ID: telegram_cfg_{config_id}
 - schedule field is a cron expression: "0 8 * * *"
 - Scheduler detects new / removed configs by comparing jobs vs DB on each sync
"""

from __future__ import annotations

import asyncio

import structlog

from config import get_settings

logger = structlog.get_logger(__name__)


class TelegramScheduler:
    """
    Manages scheduled Telegram report jobs.

    Usage in main.py lifespan:
        scheduler = TelegramScheduler()
        await scheduler.start()
        ...
        await scheduler.stop()
    """

    _instance: "TelegramScheduler | None" = None

    def __new__(cls) -> "TelegramScheduler":
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def __init__(self) -> None:
        if self._initialized:
            return
        self._settings = get_settings()
        self._scheduler = None
        self._initialized = True
        logger.info("telegram_scheduler_created")

    async def start(self) -> None:
        """Start the APScheduler and load all enabled scheduled configs."""
        if self._settings.should_mock_telegram:
            logger.info("telegram_scheduler_mock_mode_active")
            return

        try:
            from apscheduler.schedulers.asyncio import AsyncIOScheduler
            from apscheduler.triggers.cron import CronTrigger

            self._scheduler = AsyncIOScheduler()

            # Add a sync job that runs every minute to pick up config changes
            self._scheduler.add_job(
                self._sync_scheduled_jobs,
                trigger="interval",
                minutes=1,
                id="telegram_config_sync",
                replace_existing=True,
            )

            self._scheduler.start()
            logger.info("telegram_scheduler_started")

            # Initial load of all enabled scheduled configs
            await self._sync_scheduled_jobs()

        except ImportError:
            logger.warning(
                "apscheduler_not_installed",
                msg="Install apscheduler to enable scheduled Telegram reports",
            )
        except Exception as e:
            logger.error("telegram_scheduler_start_failed", error=str(e))

    async def stop(self) -> None:
        """Stop the scheduler gracefully."""
        if self._scheduler and self._scheduler.running:
            self._scheduler.shutdown(wait=False)
            logger.info("telegram_scheduler_stopped")

    async def _sync_scheduled_jobs(self) -> None:
        """
        Compare DB configs with active scheduler jobs.
        Adds new jobs, removes deleted/disabled ones.
        """
        if not self._scheduler:
            return

        try:
            from sqlalchemy import select
            from database import async_session_factory
            from models.telegram import TelegramReportConfig

            async with async_session_factory() as session:
                result = await session.execute(
                    select(TelegramReportConfig).filter(
                        TelegramReportConfig.enabled == True,
                        TelegramReportConfig.trigger == "scheduled",
                        TelegramReportConfig.schedule != None,
                    )
                )
                configs = result.scalars().all()

            # Get current job IDs managed by us
            current_job_ids = {
                j.id for j in self._scheduler.get_jobs()
                if j.id and j.id.startswith("telegram_cfg_")
            }

            # Add or replace jobs for active configs
            active_job_ids = set()
            for cfg in configs:
                job_id = f"telegram_cfg_{cfg.id}"
                active_job_ids.add(job_id)

                try:
                    from apscheduler.triggers.cron import CronTrigger
                    parts = cfg.schedule.split()
                    if len(parts) == 5:
                        trigger = CronTrigger(
                            minute=parts[0],
                            hour=parts[1],
                            day=parts[2],
                            month=parts[3],
                            day_of_week=parts[4],
                        )
                        self._scheduler.add_job(
                            self._execute_config_report,
                            trigger=trigger,
                            id=job_id,
                            args=[cfg.id],
                            replace_existing=True,
                            name=f"Telegram: {cfg.name}",
                        )
                        logger.debug(
                            "telegram_scheduler_job_added",
                            job_id=job_id,
                            schedule=cfg.schedule,
                        )
                except Exception as e:
                    logger.warning(
                        "telegram_scheduler_job_failed",
                        config_id=cfg.id,
                        error=str(e),
                    )

            # Remove jobs for deleted/disabled configs
            stale_ids = current_job_ids - active_job_ids
            for job_id in stale_ids:
                try:
                    self._scheduler.remove_job(job_id)
                    logger.debug("telegram_scheduler_job_removed", job_id=job_id)
                except Exception:
                    pass

        except Exception as e:
            logger.error("telegram_scheduler_sync_failed", error=str(e))

    async def _execute_config_report(self, config_id: int) -> None:
        """Execute a scheduled report for a given config ID."""
        logger.info("telegram_scheduled_report_starting", config_id=config_id)
        try:
            from sqlalchemy import select
            from database import async_session_factory
            from models.telegram import TelegramReportConfig
            from services.telegram_service import get_telegram_service

            tg = get_telegram_service()

            async with async_session_factory() as session:
                result = await session.execute(
                    select(TelegramReportConfig).filter(
                        TelegramReportConfig.id == config_id
                    )
                )
                cfg = result.scalar_one_or_none()
                if not cfg or not cfg.enabled:
                    logger.warning(
                        "telegram_scheduled_report_config_gone",
                        config_id=config_id,
                    )
                    return

            sources = cfg.sources.split(",") if cfg.sources else []
            chat_id = cfg.chat_id

            # Send status summary based on sources
            await tg.send_status_summary(sources=sources, chat_id=chat_id)

            # Update last_triggered
            from datetime import datetime, timezone
            async with async_session_factory() as session:
                result = await session.execute(
                    select(TelegramReportConfig).filter(
                        TelegramReportConfig.id == config_id
                    )
                )
                cfg_to_update = result.scalar_one_or_none()
                if cfg_to_update:
                    cfg_to_update.last_triggered = datetime.now(timezone.utc)
                    await session.commit()

            logger.info("telegram_scheduled_report_done", config_id=config_id)

        except Exception as e:
            logger.error(
                "telegram_scheduled_report_failed",
                config_id=config_id,
                error=str(e),
            )

    async def trigger_config_now(self, config_id: int) -> dict:
        """Manually trigger a config's report (called from API endpoint)."""
        logger.info("telegram_manual_trigger", config_id=config_id)
        # Run in background task so the HTTP response is immediate
        asyncio.create_task(self._execute_config_report(config_id))
        return {"triggered": True, "config_id": config_id}


def get_telegram_scheduler() -> TelegramScheduler:
    """Return the singleton TelegramScheduler."""
    return TelegramScheduler()
