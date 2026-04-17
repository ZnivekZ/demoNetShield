"""
Telegram Service — Singleton client for Telegram Bot API.

Follows the same pattern as crowdsec_service.py:
 - Singleton via __new__
 - Mock guards at the start of every public method
 - Retry with tenacity on transient network errors
 - structlog for all logging — never print()
 - Rate limiting via asyncio.Semaphore (30 msgs/sec)
 - Persistent message queue in SQLite for crash recovery

Design:
 - Outbound: send_message, send_alert, send_summary, send_report
 - Inbound: process_incoming_message → answer_query (delegates to ai_service)
 - Queue: retry_pending_messages runs every 5min via scheduler
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone

import structlog
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from config import get_settings

logger = structlog.get_logger(__name__)


def _log_retry(retry_state):
    logger.warning(
        "telegram_request_retry",
        attempt=retry_state.attempt_number,
        error=str(retry_state.outcome.exception()),
    )


class TelegramService:
    """
    Singleton service for Telegram Bot API communication.

    Usage:
        tg = get_telegram_service()
        await tg.send_message(chat_id, "Hello!")
    """

    _instance: "TelegramService | None" = None

    def __new__(cls) -> "TelegramService":
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def __init__(self) -> None:
        if self._initialized:
            return
        self._settings = get_settings()
        self._bot = None  # telegram.Bot instance (real mode only)
        self._semaphore = asyncio.Semaphore(30)  # Rate limit: 30 msg/sec
        self._initialized = True
        logger.info("telegram_service_created", mock=self._settings.should_mock_telegram)

    # ── Connection lifecycle ──────────────────────────────────────────────

    async def connect(self) -> None:
        """Initialize the Telegram Bot client. Called from main.py lifespan."""
        if self._settings.should_mock_telegram:
            logger.info("telegram_mock_mode_active")
            return
        if not self._settings.telegram_bot_token:
            logger.warning("telegram_no_token", msg="Bot token not configured, staying in mock mode")
            return
        try:
            from telegram import Bot
            self._bot = Bot(token=self._settings.telegram_bot_token)
            me = await self._bot.get_me()
            logger.info("telegram_connected", username=me.username, bot_id=me.id)
        except Exception as e:
            logger.error("telegram_connect_failed", error=str(e))
            self._bot = None

    async def close(self) -> None:
        """Close the bot client. Called from main.py lifespan."""
        if self._bot:
            try:
                await self._bot.shutdown()
            except Exception:
                pass
            self._bot = None
            logger.info("telegram_client_closed")

    # ── Status ────────────────────────────────────────────────────────────

    async def get_status(self) -> dict:
        """Return bot connection status."""
        if self._settings.should_mock_telegram:
            from services.mock_data import MockData
            return MockData.telegram.bot_status()

        pending = await self._count_pending_messages()
        last_msg = await self._get_last_message_time()
        connected = self._bot is not None
        bot_username = None
        if connected:
            try:
                me = await self._bot.get_me()
                bot_username = f"@{me.username}"
            except Exception:
                connected = False

        return {
            "connected": connected,
            "bot_username": bot_username,
            "chat_id": self._settings.telegram_chat_id or None,
            "pending_messages": pending,
            "last_message_at": last_msg,
            "mock": False,
        }

    # ── Send Message (core) ───────────────────────────────────────────────

    @retry(
        retry=retry_if_exception_type((ConnectionError, TimeoutError, OSError)),
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=10),
        after=_log_retry,
    )
    async def send_message(
        self,
        chat_id: str | None = None,
        text: str = "",
        parse_mode: str = "HTML",
        message_type: str = "test",
    ) -> dict:
        """Send a text message to a Telegram chat. Core sending method."""
        target_chat = chat_id or self._settings.telegram_chat_id

        if self._settings.should_mock_telegram:
            from services.mock_data import MockData
            result = MockData.telegram.send_message(text)
            await self._log_message("outbound", target_chat, message_type, text[:200], "sent")
            return result

        if not self._bot:
            error_msg = "Bot not connected"
            await self._log_message("outbound", target_chat, message_type, text[:200], "failed", error_msg)
            return {"ok": False, "error": error_msg}

        async with self._semaphore:
            try:
                # Telegram limit: 4096 chars
                if len(text) > 4096:
                    text = text[:4090] + "\n\n…"
                msg = await self._bot.send_message(
                    chat_id=target_chat,
                    text=text,
                    parse_mode=parse_mode,
                )
                await self._log_message("outbound", target_chat, message_type, text[:200], "sent")
                logger.info("telegram_message_sent", chat_id=target_chat, type=message_type)
                return {"ok": True, "message_id": msg.message_id, "chat_id": target_chat}
            except Exception as e:
                error_str = str(e)
                logger.error("telegram_send_failed", error=error_str, chat_id=target_chat)
                await self._log_message("outbound", target_chat, message_type, text[:200], "failed", error_str)
                # Queue for retry
                await self._queue_pending(target_chat, text, parse_mode, message_type)
                return {"ok": False, "error": error_str}

    # ── Send Alert ────────────────────────────────────────────────────────

    async def send_alert(self, alert_data: dict) -> dict:
        """Format and send a security alert."""
        severity_emoji = {
            "critical": "🚨", "high": "⚠️", "medium": "🔔", "low": "ℹ️",
        }
        severity = alert_data.get("severity", "medium")
        emoji = severity_emoji.get(severity, "🔔")

        text = (
            f"{emoji} <b>{alert_data.get('title', 'Alerta de Seguridad')}</b>\n\n"
            f"<b>Severidad:</b> {severity.upper()}\n"
            f"<b>Fuente:</b> {alert_data.get('source', 'desconocida')}\n"
        )
        if alert_data.get("description"):
            text += f"\n{alert_data['description']}\n"
        if alert_data.get("ip"):
            text += f"\n<b>IP:</b> <code>{alert_data['ip']}</code>"
        if alert_data.get("agent"):
            text += f"\n<b>Agente:</b> {alert_data['agent']}"
        if alert_data.get("action_taken"):
            text += f"\n<b>Acción:</b> {alert_data['action_taken']}"

        text += f"\n\n⏰ {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}"

        return await self.send_message(
            chat_id=alert_data.get("chat_id"),
            text=text,
            message_type="alert",
        )

    # ── Send Summary ──────────────────────────────────────────────────────

    async def send_status_summary(self, sources: list[str] | None = None, chat_id: str | None = None) -> dict:
        """Collect data from configured sources and send a summary."""
        if self._settings.should_mock_telegram:
            text = (
                "📊 <b>Resumen del Sistema NetShield</b>\n\n"
                "🖥️ <b>MikroTik:</b> CPU 23% | RAM 50% | Uptime 45d\n"
                "🛡️ <b>Wazuh:</b> 12 agentes activos | 45 alertas (3 críticas)\n"
                "🔒 <b>CrowdSec:</b> 5 decisiones activas | 23 alertas 24h\n"
                "📡 <b>Suricata:</b> IDS mode | 1.2K pps | 8 alertas\n\n"
                f"⏰ {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}"
            )
            from services.mock_data import MockData
            result = MockData.telegram.send_message(text)
            await self._log_message("outbound", chat_id or self._settings.telegram_chat_id, "summary", text[:200], "sent")
            return result

        # Real mode: collect data from services
        sections = []
        selected = sources or ["wazuh", "mikrotik", "crowdsec", "suricata"]

        if "mikrotik" in selected:
            try:
                from services.mikrotik_service import get_mikrotik_service
                mt = get_mikrotik_service()
                health = await mt.get_health()
                conns = await mt.get_connections()
                sections.append(
                    f"🖥️ <b>MikroTik:</b> CPU {health.get('cpu_percent', '?')}% | "
                    f"RAM {health.get('ram_percent', '?')}% | "
                    f"Conexiones: {len(conns)}"
                )
            except Exception as e:
                sections.append(f"🖥️ <b>MikroTik:</b> ❌ Error ({str(e)[:50]})")

        if "wazuh" in selected:
            try:
                from services.wazuh_service import get_wazuh_service
                wz = get_wazuh_service()
                agents = await wz.get_agents()
                alerts = await wz.get_alerts(limit=100)
                active = sum(1 for a in agents if a.get("status") == "active")
                critical = sum(1 for a in alerts if int(a.get("rule_level", 0)) >= 12)
                sections.append(
                    f"🛡️ <b>Wazuh:</b> {active} agentes activos | "
                    f"{len(alerts)} alertas ({critical} críticas)"
                )
            except Exception as e:
                sections.append(f"🛡️ <b>Wazuh:</b> ❌ Error ({str(e)[:50]})")

        if "crowdsec" in selected:
            try:
                from services.crowdsec_service import get_crowdsec_service
                cs = get_crowdsec_service()
                decisions = await cs.get_decisions()
                sections.append(f"🔒 <b>CrowdSec:</b> {len(decisions)} decisiones activas")
            except Exception as e:
                sections.append(f"🔒 <b>CrowdSec:</b> ❌ Error ({str(e)[:50]})")

        if "suricata" in selected:
            try:
                from services.suricata_service import get_suricata_service
                sur = get_suricata_service()
                status = await sur.get_engine_status()
                sections.append(
                    f"📡 <b>Suricata:</b> {status.get('mode', '?')} mode | "
                    f"{status.get('packets_per_sec', '?')} pps"
                )
            except Exception as e:
                sections.append(f"📡 <b>Suricata:</b> ❌ Error ({str(e)[:50]})")

        text = (
            "📊 <b>Resumen del Sistema NetShield</b>\n\n"
            + "\n".join(sections)
            + f"\n\n⏰ {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}"
        )

        return await self.send_message(chat_id=chat_id, text=text, message_type="summary")

    # ── Inbound: Process Message ──────────────────────────────────────────

    async def process_incoming_message(self, update_data: dict) -> dict:
        """
        Process an incoming Telegram webhook update.
        Only responds to messages from admin chat IDs.
        """
        message = update_data.get("message", {})
        chat_id = str(message.get("chat", {}).get("id", ""))
        text = message.get("text", "")
        user_id = str(message.get("from", {}).get("id", ""))
        username = message.get("from", {}).get("username", "unknown")

        if not text:
            return {"processed": False, "reason": "no_text"}

        # Auth check: only admin chat IDs
        admin_ids = self._settings.telegram_admin_ids_list
        if admin_ids and chat_id not in admin_ids and user_id not in admin_ids:
            logger.warning("telegram_unauthorized_query", chat_id=chat_id, user_id=user_id)
            return {"processed": False, "reason": "unauthorized"}

        # Log inbound
        await self._log_message("inbound", chat_id, "bot_query", text[:200], "sent")

        # Answer using AI
        response = await self.answer_query(text, chat_id)

        return {"processed": True, "response_sent": True, "query": text[:100]}

    async def answer_query(self, query: str, chat_id: str) -> str:
        """Answer a query using the AI service and send the response."""
        if self._settings.should_mock_telegram or self._settings.should_mock_anthropic:
            from services.mock_data import MockData
            response = MockData.telegram.bot_query_response(query)
            await self.send_message(chat_id=chat_id, text=response, message_type="bot_response")
            return response

        try:
            from services.ai_service import AIService
            ai = AIService()
            response = await ai.answer_telegram_query(query, chat_id)
            await self.send_message(chat_id=chat_id, text=response, message_type="bot_response")
            return response
        except Exception as e:
            error_text = f"❌ Error procesando consulta: {str(e)[:200]}"
            logger.error("telegram_ai_query_failed", error=str(e), query=query[:100])
            await self.send_message(chat_id=chat_id, text=error_text, message_type="bot_response")
            return error_text

    # ── Queue management ──────────────────────────────────────────────────

    async def _queue_pending(
        self, chat_id: str, text: str, parse_mode: str, message_type: str,
    ) -> None:
        """Save a failed message to the persistent queue."""
        try:
            from database import async_session_factory
            from models.telegram import TelegramPendingMessage

            async with async_session_factory() as session:
                pending = TelegramPendingMessage(
                    chat_id=chat_id,
                    text=text,
                    parse_mode=parse_mode,
                    message_type=message_type,
                )
                session.add(pending)
                await session.commit()
                logger.info("telegram_message_queued", chat_id=chat_id, type=message_type)
        except Exception as e:
            logger.error("telegram_queue_failed", error=str(e))

    async def retry_pending_messages(self) -> int:
        """Retry all pending messages. Returns count of messages retried."""
        if self._settings.should_mock_telegram:
            return 0

        from sqlalchemy import select, delete
        from database import async_session_factory
        from models.telegram import TelegramPendingMessage

        retried = 0
        try:
            async with async_session_factory() as session:
                result = await session.execute(
                    select(TelegramPendingMessage)
                    .filter(TelegramPendingMessage.retry_count < TelegramPendingMessage.max_retries)
                    .order_by(TelegramPendingMessage.created_at.asc())
                    .limit(10)
                )
                pending = result.scalars().all()

                for msg in pending:
                    try:
                        if self._bot:
                            async with self._semaphore:
                                await self._bot.send_message(
                                    chat_id=msg.chat_id,
                                    text=msg.text,
                                    parse_mode=msg.parse_mode,
                                )
                            # Success — delete from queue
                            await session.execute(
                                delete(TelegramPendingMessage)
                                .where(TelegramPendingMessage.id == msg.id)
                            )
                            await self._log_message(
                                "outbound", msg.chat_id, msg.message_type,
                                msg.text[:200], "sent",
                            )
                            retried += 1
                        else:
                            msg.retry_count += 1
                    except Exception as e:
                        msg.retry_count += 1
                        logger.warning(
                            "telegram_retry_failed",
                            msg_id=msg.id, attempt=msg.retry_count, error=str(e),
                        )

                await session.commit()
        except Exception as e:
            logger.error("telegram_retry_pending_error", error=str(e))

        if retried > 0:
            logger.info("telegram_pending_retried", count=retried)
        return retried

    # ── Internal helpers ──────────────────────────────────────────────────

    async def _log_message(
        self,
        direction: str,
        chat_id: str,
        message_type: str,
        content_summary: str,
        status: str,
        error: str | None = None,
    ) -> None:
        """Log a message to the database."""
        try:
            from database import async_session_factory
            from models.telegram import TelegramMessageLog

            async with async_session_factory() as session:
                log = TelegramMessageLog(
                    direction=direction,
                    chat_id=chat_id or "",
                    message_type=message_type,
                    content_summary=content_summary,
                    status=status,
                    error=error,
                )
                session.add(log)
                await session.commit()
        except Exception as e:
            logger.error("telegram_log_failed", error=str(e))

    async def _count_pending_messages(self) -> int:
        """Count messages in the pending queue."""
        try:
            from sqlalchemy import func, select
            from database import async_session_factory
            from models.telegram import TelegramPendingMessage

            async with async_session_factory() as session:
                result = await session.execute(
                    select(func.count(TelegramPendingMessage.id))
                )
                return result.scalar() or 0
        except Exception:
            return 0

    async def _get_last_message_time(self) -> str | None:
        """Get the timestamp of the last outbound message."""
        try:
            from sqlalchemy import select
            from database import async_session_factory
            from models.telegram import TelegramMessageLog

            async with async_session_factory() as session:
                result = await session.execute(
                    select(TelegramMessageLog.created_at)
                    .filter(TelegramMessageLog.direction == "outbound")
                    .order_by(TelegramMessageLog.created_at.desc())
                    .limit(1)
                )
                row = result.scalar()
                return row.isoformat() if row else None
        except Exception:
            return None


def get_telegram_service() -> TelegramService:
    """Return the singleton TelegramService instance."""
    return TelegramService()
