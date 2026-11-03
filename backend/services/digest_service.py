"""
DigestService — orchestrates the Daily Security Digest generation.

Pipeline (called by router on POST /api/digest/generate):
  1. Calculate period boundaries (08:00 AM UTC-3 today vs yesterday)
  2. Fetch metrics for both periods in parallel (asyncio.gather)
  3. Compute deltas and classify agents by category
  4. Score risk with deterministic heuristics (no AI required)
  5. Cross CISA KEV catalog with local software inventory
  6. Optionally enrich with Groq AI analysis (mock if no API key)
  7. Persist to SQLite and return DigestResponse

Design decisions:
  - Not a singleton: each generation is a fresh call.
  - Mock guard: when MOCK_ALL or MOCK_WAZUH active, returns rich static data.
  - Fully async: all I/O via asyncio.gather where independent.
  - Graceful degradation: every section is try/except — partial data > no data.
"""

from __future__ import annotations

import asyncio
import json
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any

import structlog

from config import get_settings

logger = structlog.get_logger(__name__)

# ── UTC-3 timezone (Argentina / ART) ──────────────────────────────────────────
ART = timezone(timedelta(hours=-3))

# ── Agent category pattern matching ───────────────────────────────────────────
# Patterns are checked in order; first match wins.
# Keys = AgentCategory value strings, values = list of name prefixes (lowercase).
CATEGORY_PATTERNS: dict[str, list[str]] = {
    "proxy":    ["proxy-", "nginx-", "haproxy-", "caddy-", "lb-", "reverse-"],
    "mail":     ["mail-", "postfix-", "smtp-", "mx-", "dovecot-", "exim-"],
    "notebook": ["nb-", "notebook-", "laptop-", "lt-", "ws-", "workstation-"],
    # "server" is the default catch-all — no prefixes needed
}

# ── Mock data ─────────────────────────────────────────────────────────────────
_MOCK_DIGEST: dict[str, Any] = {
    "date": "2026-11-02",
    "risk_level": "orange",
    "risk_score": 62,
    "risk_reasoning": (
        "Incremento del 95% en alertas respecto a ayer (45 vs 23). "
        "3 alertas críticas nuevas. 1 CVE high sin patch. "
        "Agente backup-01 sin syscheck hace 74h."
    ),
    "delta": {
        "period_start": "2026-11-01T11:00:00+00:00",
        "period_end":   "2026-11-02T11:00:00+00:00",
        "yesterday_start": "2026-10-31T11:00:00+00:00",
        "yesterday_end":   "2026-11-01T11:00:00+00:00",
        "alerts_today":    45,
        "alerts_yesterday": 23,
        "alerts_delta":    22,
        "alerts_delta_percent": 95.65,
        "critical_today":    3,
        "critical_yesterday": 1,
        "critical_delta":    2,
        "new_cves_today": [
            {
                "cve_id": "CVE-2026-29421", "severity": "high",
                "package_name": "libssl3", "agent_name": "web-01",
                "cvss_score": 7.8,
            }
        ],
        "resolved_cves": [],
        "total_cves_today":    127,
        "total_cves_yesterday": 126,
        "agents_active":    5,
        "agents_disconnected": 0,
        "transient_incidents": [
            {
                "agent_id":        "003",
                "agent_name":      "proxy-01",
                "event_type":      "disconnect_reconnect",
                "disconnected_at": "2026-11-02T05:15:00+00:00",
                "reconnected_at":  "2026-11-02T05:18:33+00:00",
                "duration_seconds": 213,
            }
        ],
        "new_techniques_today": ["T1110"],
        "top_tactic": "Credential Access",
        "agents_scan_status": [
            {
                "agent_id": "004", "agent_name": "backup-01",
                "last_syscheck": "2026-10-30T06:00:00+00:00",
                "last_rootcheck": "2026-10-30T06:05:00+00:00",
                "syscheck_hours_ago": 74.0,
                "rootcheck_hours_ago": 74.1,
                "is_stale": True,
            },
        ],
    },
    "agents_by_category": {
        "proxy": [
            {
                "agent_id": "003", "agent_name": "proxy-01", "status": "active",
                "category": "proxy", "category_source": "pattern",
                "alerts_today": 18, "alerts_yesterday": 8, "alerts_delta": 10,
                "new_cves": 0, "new_packages": 2,
                "port_changes": [], "last_syscheck": "2026-11-02T03:00:00+00:00",
                "last_rootcheck": "2026-11-02T03:05:00+00:00",
            }
        ],
        "server": [
            {
                "agent_id": "004", "agent_name": "backup-01", "status": "active",
                "category": "server", "category_source": "pattern",
                "alerts_today": 5, "alerts_yesterday": 4, "alerts_delta": 1,
                "new_cves": 1, "new_packages": 0,
                "port_changes": [], "last_syscheck": "2026-10-30T06:00:00+00:00",
                "last_rootcheck": "2026-10-30T06:05:00+00:00",
            }
        ],
    },
    "cisa_kev_matches": [],
    "cisa_kev_total_checked": 1198,
    "cisa_kev_last_updated": "2026-11-02T00:00:00+00:00",
    "ai_summary": (
        "## 🟠 Resumen de Seguridad — 2 de noviembre de 2026\n\n"
        "**Nivel de riesgo: NARANJA** — Se detectó un incremento significativo "
        "del 95% en alertas respecto al período anterior, con 3 alertas críticas "
        "nuevas que requieren atención.\n\n"
        "### Hallazgos principales\n\n"
        "1. **Pico de fuerza bruta SSH** — 12 detecciones T1110 entre 01:00 y 04:00 AM "
        "apuntando a `web-01`. Reglas 5710 y 5503 activas.\n"
        "2. **Nueva CVE high en libssl3** — CVE-2026-29421 afecta `web-01` y `db-01`. "
        "No está en CISA KEV pero se recomienda parchear.\n"
        "3. **FIM desactualizado** — `backup-01` lleva 74h sin syscheck. "
        "Verificar el módulo FIM.\n\n"
        "### Acciones recomendadas\n\n"
        "1. 🔴 Revisar logs SSH de `web-01` y habilitar fail2ban\n"
        "2. 🟠 Actualizar `libssl3` en `web-01` y `db-01`\n"
        "3. 🟡 Investigar por qué `backup-01` no ejecuta syscheck\n"
        "4. 🟡 Revisar la desconexión transitoria de `proxy-01` (3min a las 02:15)\n"
        "5. 🟢 Sin impacto CISA KEV — inventario limpio\n\n"
        "*⚠️ Modo simulación — activar GROQ_API_KEY para análisis real.*"
    ),
    "ai_model_used": "mock",
    "ai_is_mock": True,
    "ai_payload_sent": {
        "period": "2026-11-01 08:00 → 2026-11-02 08:00 (UTC-3)",
        "risk_score": 62, "risk_level": "orange",
        "alerts": {"today": 45, "yesterday": 23, "delta": "+22", "delta_percent": "+95.6%"},
        "critical_alerts": {"today": 3, "yesterday": 1},
        "new_cves": [{"cve": "CVE-2026-29421", "severity": "high",
                      "package": "libssl3", "agents": ["web-01"]}],
        "transient_incidents": [{"agent": "proxy-01",
                                  "event": "disconnected 02:15, reconnected 02:18"}],
        "cisa_kev": {"matches": 0, "total_checked": 1198, "status": "clean"},
        "scan_freshness": {"stale_agents": [{"agent": "backup-01", "hours_ago": 74}]},
        "top_mitre": "T1110 - Brute Force (12 hits)",
    },
    "ai_generated_at": "2026-11-02T08:00:05+00:00",
    "detector_healthy": True,
    "detector_last_scan": "2026-11-02T07:58:00+00:00",
    "generated_at": "2026-11-02T11:00:05+00:00",
    "generation_method": "manual",
}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_period_boundaries() -> tuple[datetime, datetime, datetime, datetime]:
    """
    Return the four boundary datetimes for the two 24h comparison windows.
    All datetimes are UTC-aware.

    Windows:
      TODAY:     [today_start, today_end)    = 08:00 AM yesterday → 08:00 AM today (ART)
      YESTERDAY: [yest_start,  yest_end)     = 08:00 AM 2 days ago → 08:00 AM yesterday (ART)
    """
    now_art    = datetime.now(ART)
    cutoff_art = now_art.replace(hour=8, minute=0, second=0, microsecond=0)
    if now_art < cutoff_art:
        # Before today's 08:00 → today's window hasn't started yet → shift back 1 day
        cutoff_art -= timedelta(days=1)

    today_end   = cutoff_art.astimezone(timezone.utc)
    today_start = today_end - timedelta(hours=24)
    yest_end    = today_start
    yest_start  = yest_end - timedelta(hours=24)

    return today_start, today_end, yest_start, yest_end


def _classify_agent(agent_name: str, overrides: dict[str, str]) -> tuple[str, str]:
    """
    Classify an agent into a category.
    Returns (category_str, source) where source is "manual_override" or "pattern".
    Overrides dict: {agent_id: category_str}
    """
    name_lower = agent_name.lower()
    for cat, prefixes in CATEGORY_PATTERNS.items():
        if any(name_lower.startswith(p) for p in prefixes):
            return cat, "pattern"
    return "server", "pattern"


def _pct_change(today: int | float, yesterday: int | float) -> float:
    """Safe percentage change. Returns 0.0 if yesterday == 0."""
    if yesterday == 0:
        return 0.0
    return round(((today - yesterday) / yesterday) * 100, 2)


def _calculate_risk_score(
    delta: dict[str, Any],
    cisa_matches: list[dict],
    agents_scan_status: list[dict],
) -> tuple[int, str, str]:
    """
    Compute risk score 0–100, map to semaphore level, and generate reasoning.

    Returns (score, level, reasoning).
    """
    score = 0
    reasons: list[str] = []

    # CISA KEV — highest weight
    kev_count = len(cisa_matches)
    if kev_count:
        score += min(kev_count * 30, 60)
        reasons.append(f"⚠️ {kev_count} CVE(s) del catálogo CISA KEV activas en el inventario")

    # Critical alerts
    crit = delta.get("critical_today", 0)
    crit_delta = delta.get("critical_delta", 0)
    if crit_delta > 0:
        score += min(crit_delta * 8, 32)
        reasons.append(f"{crit_delta} alerta(s) crítica(s) nueva(s) hoy (total: {crit})")

    # Alert volume delta
    pct = delta.get("alerts_delta_percent", 0.0)
    if pct > 100:
        score += 15
        reasons.append(f"Volumen de alertas +{pct:.0f}% vs ayer")
    elif pct > 50:
        score += 8
        reasons.append(f"Volumen de alertas +{pct:.0f}% vs ayer")
    elif pct > 30:
        score += 4
        reasons.append(f"Volumen de alertas +{pct:.0f}% vs ayer")

    # New CVEs
    new_cves: list[dict] = delta.get("new_cves_today", [])
    for cve in new_cves:
        sev = (cve.get("severity") or "low").lower()
        if sev == "critical":
            score += 6
        elif sev == "high":
            score += 3
    if new_cves:
        reasons.append(f"{len(new_cves)} CVE(s) nueva(s) detectada(s)")

    # Transient incidents
    incidents: list[dict] = delta.get("transient_incidents", [])
    for inc in incidents:
        if inc.get("event_type") == "disconnect_no_recovery":
            score += 20
            reasons.append(f"Agente {inc.get('agent_name', '?')} desconectado sin recuperación")
        else:
            score += 5
            dur = inc.get("duration_seconds")
            dur_str = f" ({dur}s)" if dur else ""
            reasons.append(f"Incidente transitorio en {inc.get('agent_name', '?')}{dur_str} — resuelto")

    # Scan freshness
    stale = [s for s in agents_scan_status if s.get("is_stale")]
    if stale:
        score += len(stale) * 4
        names = ", ".join(s.get("agent_name", "?") for s in stale)
        reasons.append(f"Escaneo FIM desactualizado en: {names}")

    score = min(score, 100)

    if score >= 75:
        level = "red"
    elif score >= 50:
        level = "orange"
    elif score >= 25:
        level = "yellow"
    else:
        level = "green"

    if not reasons:
        reasons = ["Sin anomalías detectadas en el período analizado"]

    reasoning = " | ".join(reasons)
    return score, level, reasoning


# ── DigestService ─────────────────────────────────────────────────────────────

class DigestService:
    """
    Orchestrates the Daily Security Digest generation.
    Not a singleton — one instance per generation call.
    """

    def __init__(self) -> None:
        self._settings = get_settings()

    # ── Mock guard ────────────────────────────────────────────────────────────

    def _is_mock(self) -> bool:
        """True when Wazuh is mocked (full MOCK_ALL or MOCK_WAZUH)."""
        # Check the environment variables directly since Settings doesn't expose
        # should_mock_wazuh as a property in the current codebase version.
        import os
        mock_all   = os.getenv("MOCK_ALL", "").lower() in ("1", "true", "yes")
        mock_wazuh = os.getenv("MOCK_WAZUH", "").lower() in ("1", "true", "yes")
        return mock_all or mock_wazuh

    # ── Public API ────────────────────────────────────────────────────────────

    async def get_latest_from_db(self, db) -> dict | None:
        """Read the most recent digest from SQLite. Returns None if no digest yet."""
        from sqlalchemy import select
        from models.daily_digest import DailyDigest
        result = await db.execute(
            select(DailyDigest).order_by(DailyDigest.generated_at.desc()).limit(1)
        )
        row = result.scalar_one_or_none()
        if row is None:
            return None
        return self._row_to_dict(row)

    async def get_by_date_from_db(self, date_str: str, db) -> dict | None:
        """Read a specific day's digest from SQLite."""
        from sqlalchemy import select
        from models.daily_digest import DailyDigest
        result = await db.execute(
            select(DailyDigest).where(DailyDigest.date == date_str)
        )
        row = result.scalar_one_or_none()
        if row is None:
            return None
        return self._row_to_dict(row)

    async def get_history_from_db(self, limit: int = 30, db = None) -> list[dict]:
        """Read the N most recent digest summaries from SQLite."""
        from sqlalchemy import select
        from models.daily_digest import DailyDigest
        result = await db.execute(
            select(DailyDigest).order_by(DailyDigest.generated_at.desc()).limit(limit)
        )
        rows = result.scalars().all()
        history = []
        for row in rows:
            delta = json.loads(row.delta_json or "{}")
            cisa  = json.loads(row.cisa_json or "[]")
            history.append({
                "id":               row.id,
                "date":             row.date,
                "risk_level":       row.risk_level,
                "risk_score":       row.risk_score,
                "alerts_today":     delta.get("alerts_today", 0),
                "critical_today":   delta.get("critical_today", 0),
                "new_cves":         len(delta.get("new_cves_today", [])),
                "cisa_matches":     len(cisa) if isinstance(cisa, list) else 0,
                "ai_is_mock":       row.ai_is_mock,
                "generated_at":     row.generated_at.isoformat() if row.generated_at else "",
                "generation_method": row.generation_method,
            })
        return history

    async def get_agent_overrides(self, db) -> dict[str, str]:
        """Return dict {agent_id: category} of all manual overrides."""
        from sqlalchemy import select
        from models.agent_category_override import AgentCategoryOverride
        result = await db.execute(select(AgentCategoryOverride))
        rows = result.scalars().all()
        return {r.agent_id: r.category for r in rows}

    async def set_agent_override(self, agent_id: str, agent_name: str, category: str, db) -> None:
        """Upsert a manual category override for an agent."""
        from sqlalchemy import select
        from models.agent_category_override import AgentCategoryOverride
        result = await db.execute(
            select(AgentCategoryOverride).where(AgentCategoryOverride.agent_id == agent_id)
        )
        row = result.scalar_one_or_none()
        if row:
            row.category   = category
            row.agent_name = agent_name
        else:
            db.add(AgentCategoryOverride(
                agent_id=agent_id, agent_name=agent_name, category=category
            ))
        await db.commit()

    async def generate(self, method: str = "manual", db = None, force: bool = False) -> dict:
        """
        Full digest generation pipeline.
        Returns a dict matching DigestResponse shape.
        """
        if self._is_mock():
            logger.info("digest_service_mock_mode")
            mock = dict(_MOCK_DIGEST)
            mock["generation_method"] = method
            return mock

        today_start, today_end, yest_start, yest_end = _get_period_boundaries()
        date_str = today_end.astimezone(ART).strftime("%Y-%m-%d")

        # Check if today's digest already exists (and force=False)
        if db and not force:
            existing = await self.get_by_date_from_db(date_str, db)
            if existing:
                logger.info("digest_already_exists", date=date_str)
                return existing

        logger.info(
            "digest_generation_started",
            date=date_str, method=method,
            today_start=today_start.isoformat(),
            today_end=today_end.isoformat(),
        )

        # ── 1. Fetch metrics in parallel ──────────────────────────────────────
        overrides = await self.get_agent_overrides(db) if db else {}

        results = await asyncio.gather(
            self._fetch_alerts_both_periods(today_start, today_end, yest_start, yest_end),
            self._fetch_cves_both_periods(today_start, today_end, yest_start, yest_end),
            self._fetch_agents_and_scans(),
            self._fetch_transient_incidents(today_start, today_end),
            self._fetch_mitre_delta(today_start, today_end, yest_start, yest_end),
            self._check_detector_health(),
            return_exceptions=True,
        )

        alerts_data, cves_data, agents_data, incidents, mitre_data, detector = results

        # Unpack with graceful fallback on exceptions
        if isinstance(alerts_data, Exception):
            logger.warning("digest_alerts_failed", error=str(alerts_data))
            alerts_data = {"today": [], "yesterday": []}
        if isinstance(cves_data, Exception):
            logger.warning("digest_cves_failed", error=str(cves_data))
            cves_data = {"today": [], "yesterday": []}
        if isinstance(agents_data, Exception):
            logger.warning("digest_agents_failed", error=str(agents_data))
            agents_data = {"agents": [], "scan_status": []}
        if isinstance(incidents, Exception):
            logger.warning("digest_incidents_failed", error=str(incidents))
            incidents = []
        if isinstance(mitre_data, Exception):
            mitre_data = {"today": set(), "top_tactic": None}
        if isinstance(detector, Exception):
            detector = {"healthy": True, "last_scan": None}

        # ── 2. Calculate delta ────────────────────────────────────────────────
        alerts_today     = alerts_data.get("today", [])
        alerts_yesterday = alerts_data.get("yesterday", [])
        cves_today       = cves_data.get("today", [])
        cves_yesterday   = cves_data.get("yesterday", [])

        a_count    = len(alerts_today)
        a_yest     = len(alerts_yesterday)
        crit_today = sum(1 for a in alerts_today if a.get("rule", {}).get("level", 0) >= 12
                         or a.get("rule_level", 0) >= 12)
        crit_yest  = sum(1 for a in alerts_yesterday if a.get("rule", {}).get("level", 0) >= 12
                         or a.get("rule_level", 0) >= 12)

        # CVE delta: new = today CVEs whose cve_id wasn't in yesterday
        yest_cve_ids = {c.get("cve_id", "") for c in cves_yesterday}
        new_cves     = [c for c in cves_today if c.get("cve_id", "") not in yest_cve_ids]
        today_cve_ids = {c.get("cve_id", "") for c in cves_today}
        resolved_cves = [c for c in cves_yesterday if c.get("cve_id", "") not in today_cve_ids]

        agents          = agents_data.get("agents", [])
        scan_status     = agents_data.get("scan_status", [])
        agents_active   = sum(1 for a in agents if (a.get("status") or "").lower() == "active")
        agents_disc     = sum(1 for a in agents if (a.get("status") or "").lower() == "disconnected")

        techniques_today = mitre_data.get("today", set())
        techniques_yest  = mitre_data.get("yesterday", set())
        new_techniques   = list(techniques_today - techniques_yest)

        delta: dict[str, Any] = {
            "period_start":         today_start.isoformat(),
            "period_end":           today_end.isoformat(),
            "yesterday_start":      yest_start.isoformat(),
            "yesterday_end":        yest_end.isoformat(),
            "alerts_today":         a_count,
            "alerts_yesterday":     a_yest,
            "alerts_delta":         a_count - a_yest,
            "alerts_delta_percent": _pct_change(a_count, a_yest),
            "critical_today":       crit_today,
            "critical_yesterday":   crit_yest,
            "critical_delta":       crit_today - crit_yest,
            "new_cves_today":       new_cves[:20],   # cap to avoid huge payloads
            "resolved_cves":        resolved_cves[:10],
            "total_cves_today":     len(cves_today),
            "total_cves_yesterday": len(cves_yesterday),
            "agents_active":        agents_active,
            "agents_disconnected":  agents_disc,
            "transient_incidents":  incidents if not isinstance(incidents, Exception) else [],
            "new_techniques_today": new_techniques,
            "top_tactic":          mitre_data.get("top_tactic"),
            "agents_scan_status":   scan_status,
        }

        # ── 3. CISA KEV cross-reference ───────────────────────────────────────
        cisa_matches: list[dict] = []
        cisa_total   = 0
        cisa_updated: str | None = None
        try:
            from services.cisa_kev_service import get_cisa_kev_service
            kev = get_cisa_kev_service()
            if kev.is_loaded():
                # Build packages per agent: {agent_name: [package dicts]}
                agent_packages = await self._build_agent_packages(agents)
                cisa_matches = await kev.match_against_inventory(agent_packages)
                cisa_total   = kev.catalog_size()
                cisa_updated = kev.last_updated()
        except Exception as e:
            logger.warning("digest_cisa_kev_failed", error=str(e))

        # ── 4. Risk score ─────────────────────────────────────────────────────
        risk_score, risk_level, risk_reasoning = _calculate_risk_score(
            delta, cisa_matches, scan_status
        )

        # ── 5. Classify agents by category ────────────────────────────────────
        agents_by_category = await self._classify_agents(
            agents, alerts_today, alerts_yesterday, cves_today, overrides, scan_status
        )

        # ── 6. Build condensed AI payload ─────────────────────────────────────
        ai_payload = self._build_ai_payload(
            date_str, risk_score, risk_level, delta, cisa_matches, scan_status
        )

        # ── 7. Groq analysis (or mock) ────────────────────────────────────────
        ai_summary: str | None    = None
        ai_model:   str | None    = None
        ai_is_mock: bool          = True
        ai_generated_at: str | None = None
        try:
            from services.groq_service import GroqService
            groq = GroqService()
            ai_summary, ai_model, ai_is_mock = await groq.analyze_digest(ai_payload)
            ai_generated_at = datetime.now(timezone.utc).isoformat()
        except Exception as e:
            logger.warning("digest_groq_failed", error=str(e))

        # ── 8. Persist to SQLite ──────────────────────────────────────────────
        digest_id = 0
        if db:
            digest_id = await self._persist(
                db=db,
                date_str=date_str,
                risk_level=risk_level,
                risk_score=risk_score,
                risk_reasoning=risk_reasoning,
                delta=delta,
                agents_by_category=agents_by_category,
                cisa_matches=cisa_matches,
                ai_summary=ai_summary,
                ai_model=ai_model,
                ai_is_mock=ai_is_mock,
                ai_payload=ai_payload,
                ai_generated_at=ai_generated_at,
                detector=detector,
                method=method,
            )

        return {
            "id":                    digest_id,
            "date":                  date_str,
            "risk_level":            risk_level,
            "risk_score":            risk_score,
            "risk_reasoning":        risk_reasoning,
            "delta":                 delta,
            "agents_by_category":    agents_by_category,
            "cisa_kev_matches":      cisa_matches,
            "cisa_kev_total_checked": cisa_total,
            "cisa_kev_last_updated": cisa_updated,
            "ai_summary":            ai_summary,
            "ai_model_used":         ai_model,
            "ai_is_mock":            ai_is_mock,
            "ai_payload_sent":       ai_payload,
            "ai_generated_at":       ai_generated_at,
            "detector_healthy":      detector.get("healthy", True),
            "detector_last_scan":    detector.get("last_scan"),
            "generated_at":          datetime.now(timezone.utc).isoformat(),
            "generation_method":     method,
        }

    # ── Private helpers ───────────────────────────────────────────────────────

    async def _fetch_alerts_both_periods(
        self,
        today_start: datetime, today_end: datetime,
        yest_start: datetime,  yest_end: datetime,
    ) -> dict[str, list]:
        from services.wazuh_indexer import get_indexer_client
        indexer = get_indexer_client()
        if not indexer.is_configured():
            return {"today": [], "yesterday": []}
        today_alerts, yest_alerts = await asyncio.gather(
            indexer.get_alerts_for_period(
                today_start.isoformat(), today_end.isoformat()
            ),
            indexer.get_alerts_for_period(
                yest_start.isoformat(), yest_end.isoformat()
            ),
        )
        return {"today": today_alerts, "yesterday": yest_alerts}

    async def _fetch_cves_both_periods(
        self,
        today_start: datetime, today_end: datetime,
        yest_start: datetime,  yest_end: datetime,
    ) -> dict[str, list]:
        from services.wazuh_indexer import get_indexer_client
        indexer = get_indexer_client()
        if not indexer.is_configured():
            return {"today": [], "yesterday": []}
        today_cves, yest_cves = await asyncio.gather(
            indexer.get_vulnerabilities_for_period(
                today_start.isoformat(), today_end.isoformat()
            ),
            indexer.get_vulnerabilities_for_period(
                yest_start.isoformat(), yest_end.isoformat()
            ),
        )
        return {"today": today_cves, "yesterday": yest_cves}

    async def _fetch_agents_and_scans(self) -> dict[str, Any]:
        from services.wazuh_service import get_wazuh_service
        wazuh = get_wazuh_service()
        agents = await wazuh.get_agents()
        now_utc = datetime.now(timezone.utc)

        scan_status: list[dict] = []
        scan_tasks = [
            self._get_agent_scan_status(wazuh, a, now_utc) for a in agents
        ]
        scan_results = await asyncio.gather(*scan_tasks, return_exceptions=True)
        for r in scan_results:
            if isinstance(r, dict):
                scan_status.append(r)

        return {"agents": agents, "scan_status": scan_status}

    async def _get_agent_scan_status(
        self, wazuh, agent: dict, now_utc: datetime
    ) -> dict:
        agent_id   = agent.get("id", "")
        agent_name = agent.get("name", "")
        syscheck_scan  = await wazuh.get_syscheck_last_scan(agent_id)
        rootcheck_scan = await wazuh.get_rootcheck_last_scan(agent_id)

        def hours_ago(ts_str: str | None) -> float | None:
            if not ts_str:
                return None
            try:
                ts = datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
                return round((now_utc - ts).total_seconds() / 3600, 1)
            except (ValueError, TypeError):
                return None

        sys_ts  = (syscheck_scan  or {}).get("end") or (syscheck_scan  or {}).get("start")
        root_ts = (rootcheck_scan or {}).get("end") or (rootcheck_scan or {}).get("start")
        sys_h   = hours_ago(sys_ts)
        root_h  = hours_ago(root_ts)
        is_stale = (sys_h is not None and sys_h > 48) or (root_h is not None and root_h > 48)

        return {
            "agent_id":           agent_id,
            "agent_name":         agent_name,
            "last_syscheck":      sys_ts,
            "last_rootcheck":     root_ts,
            "syscheck_hours_ago": sys_h,
            "rootcheck_hours_ago": root_h,
            "is_stale":           is_stale,
        }

    async def _fetch_transient_incidents(
        self, today_start: datetime, today_end: datetime
    ) -> list[dict]:
        from services.wazuh_indexer import get_indexer_client
        indexer = get_indexer_client()
        if not indexer.is_configured():
            return []
        return await indexer.get_transient_incidents(
            today_start.isoformat(), today_end.isoformat()
        )

    async def _fetch_mitre_delta(
        self,
        today_start: datetime, today_end: datetime,
        yest_start: datetime,  yest_end: datetime,
    ) -> dict[str, Any]:
        from services.wazuh_indexer import get_indexer_client
        indexer = get_indexer_client()
        if not indexer.is_configured():
            return {"today": set(), "yesterday": set(), "top_tactic": None}

        today_alerts, yest_alerts = await asyncio.gather(
            indexer.get_alerts_for_period(today_start.isoformat(), today_end.isoformat()),
            indexer.get_alerts_for_period(yest_start.isoformat(), yest_end.isoformat()),
        )

        def extract_techniques(alerts: list[dict]) -> set[str]:
            techs: set[str] = set()
            for a in alerts:
                rule  = a.get("rule", {}) or {}
                mitre = rule.get("mitre", {}) or {}
                for t in (mitre.get("id") or []):
                    if t:
                        techs.add(t)
            return techs

        today_techs = extract_techniques(today_alerts)
        yest_techs  = extract_techniques(yest_alerts)

        # Top tactic from today
        from collections import Counter
        tactic_counter: Counter[str] = Counter()
        for a in today_alerts:
            rule  = a.get("rule", {}) or {}
            mitre = rule.get("mitre", {}) or {}
            for tac in (mitre.get("tactic") or []):
                if tac:
                    tactic_counter[tac] += 1
        top_tactic = tactic_counter.most_common(1)[0][0] if tactic_counter else None

        return {"today": today_techs, "yesterday": yest_techs, "top_tactic": top_tactic}

    async def _check_detector_health(self) -> dict[str, Any]:
        from services.wazuh_service import get_wazuh_service
        wazuh = get_wazuh_service()
        try:
            health = await wazuh.get_health()
            services_list = health.get("services", [])
            modulesd_ok = any(
                s.get("service_name") == "wazuh-modulesd" and s.get("status") == "running"
                for s in services_list
            )
        except Exception:
            modulesd_ok = True  # Assume healthy if we can't check

        # Infer last scan from Indexer (most recent vulnerability doc)
        last_scan: str | None = None
        try:
            from services.wazuh_indexer import get_indexer_client
            indexer = get_indexer_client()
            if indexer.is_configured():
                hits = await indexer._search(
                    "wazuh-states-vulnerabilities-*",
                    query={"match_all": {}},
                    size=1,
                    sort=[{"vulnerability.detected_at": {"order": "desc"}}],
                )
                if hits:
                    last_scan = hits[0].get("vulnerability", {}).get("detected_at")
        except Exception:
            pass

        return {"healthy": modulesd_ok, "last_scan": last_scan}

    async def _build_agent_packages(self, agents: list[dict]) -> dict[str, list[dict]]:
        from services.wazuh_service import get_wazuh_service
        wazuh = get_wazuh_service()
        result: dict[str, list[dict]] = {}
        tasks = [
            self._get_agent_packages(wazuh, a) for a in agents
            if (a.get("status") or "").lower() == "active"
        ]
        gathered = await asyncio.gather(*tasks, return_exceptions=True)
        for item in gathered:
            if isinstance(item, tuple) and len(item) == 2:
                agent_name, pkgs = item
                result[agent_name] = pkgs
        return result

    async def _get_agent_packages(self, wazuh, agent: dict) -> tuple[str, list[dict]]:
        agent_id   = agent.get("id", "")
        agent_name = agent.get("name", "")
        try:
            sc = await wazuh.get_agent_syscollector(agent_id)
            return agent_name, sc.get("packages", [])
        except Exception:
            return agent_name, []

    async def _classify_agents(
        self,
        agents: list[dict],
        alerts_today: list[dict],
        alerts_yesterday: list[dict],
        cves_today: list[dict],
        overrides: dict[str, str],
        scan_status: list[dict] | None = None,
    ) -> dict[str, list[dict]]:
        from services.wazuh_service import get_wazuh_service
        wazuh = get_wazuh_service()

        # Pre-index alerts and CVEs per agent
        alerts_by_agent_today: dict[str, int] = defaultdict(int)
        alerts_by_agent_yest:  dict[str, int] = defaultdict(int)
        cves_by_agent:         dict[str, int] = defaultdict(int)
        scans_by_agent:        dict[str, dict] = {}

        if scan_status:
            for s in scan_status:
                aid = s.get("agent_id")
                if aid:
                    scans_by_agent[aid] = s

        for a in alerts_today:
            agent = a.get("agent", {}) or {}
            aid   = agent.get("id") or a.get("agent_id", "")
            if aid:
                alerts_by_agent_today[aid] += 1
        for a in alerts_yesterday:
            agent = a.get("agent", {}) or {}
            aid   = agent.get("id") or a.get("agent_id", "")
            if aid:
                alerts_by_agent_yest[aid] += 1
        for c in cves_today:
            aid = c.get("agent_id", "")
            if aid:
                cves_by_agent[aid] += 1

        result: dict[str, list] = defaultdict(list)
        for agent in agents:
            agent_id   = agent.get("id", "")
            agent_name = agent.get("name", "")

            # Category: override > pattern
            if agent_id in overrides:
                cat    = overrides[agent_id]
                source = "manual_override"
            else:
                cat, source = _classify_agent(agent_name, overrides)

            a_today = alerts_by_agent_today.get(agent_id, 0)
            a_yest  = alerts_by_agent_yest.get(agent_id, 0)

            scan_info = scans_by_agent.get(agent_id, {})
            last_sys  = scan_info.get("last_syscheck")
            last_root = scan_info.get("last_rootcheck")
            last_keep = agent.get("last_keep_alive") or agent.get("lastKeepAlive")

            # Ports (best-effort, skip if slow)
            ports: list[dict] = []
            try:
                ports = await asyncio.wait_for(
                    wazuh.get_agent_ports(agent_id), timeout=5.0
                )
            except Exception:
                pass

            result[cat].append({
                "agent_id":        agent_id,
                "agent_name":      agent_name,
                "status":          agent.get("status", ""),
                "category":        cat,
                "category_source": source,
                "alerts_today":    a_today,
                "alerts_yesterday": a_yest,
                "alerts_delta":    a_today - a_yest,
                "new_cves":        cves_by_agent.get(agent_id, 0),
                "new_packages":    0,   # populated by syscollector if needed
                "port_changes":    ports,
                "last_syscheck":   last_sys,
                "last_rootcheck":  last_root,
                "last_keep_alive": last_keep,
            })

        return dict(result)

    def _build_ai_payload(
        self,
        date_str: str,
        risk_score: int,
        risk_level: str,
        delta: dict[str, Any],
        cisa_matches: list[dict],
        scan_status: list[dict],
    ) -> dict[str, Any]:
        """Build the condensed payload (~1200 tokens) to send to Groq."""
        stale_agents = [
            {"agent": s["agent_name"], "hours_ago": s.get("syscheck_hours_ago")}
            for s in scan_status if s.get("is_stale")
        ]
        new_cves_summary = [
            {
                "cve": c.get("cve_id", ""),
                "severity": c.get("severity", ""),
                "package": c.get("package_name", ""),
                "agents": [c.get("agent_name", "")],
            }
            for c in delta.get("new_cves_today", [])[:5]
        ]
        incidents_summary = [
            {
                "agent": i.get("agent_name", ""),
                "event": (
                    f"disconnected {i.get('disconnected_at', '')[:16]}, "
                    f"reconnected {i.get('reconnected_at', '')[:16]}"
                    if i.get("reconnected_at")
                    else f"disconnected {i.get('disconnected_at', '')[:16]} — NOT RECOVERED"
                ),
            }
            for i in delta.get("transient_incidents", [])
        ]
        return {
            "date":    date_str,
            "period":  (
                f"{delta.get('period_start', '')[:16]} → "
                f"{delta.get('period_end', '')[:16]} (UTC)"
            ),
            "risk_score":  risk_score,
            "risk_level":  risk_level,
            "alerts": {
                "today":         delta.get("alerts_today", 0),
                "yesterday":     delta.get("alerts_yesterday", 0),
                "delta":         f"{delta.get('alerts_delta', 0):+d}",
                "delta_percent": f"{delta.get('alerts_delta_percent', 0):+.1f}%",
            },
            "critical_alerts": {
                "today":     delta.get("critical_today", 0),
                "yesterday": delta.get("critical_yesterday", 0),
                "delta":     delta.get("critical_delta", 0),
            },
            "new_cves":            new_cves_summary,
            "transient_incidents": incidents_summary,
            "cisa_kev": {
                "matches":       len(cisa_matches),
                "total_checked": 0,
                "status":        "IMPACTO DETECTADO" if cisa_matches else "clean",
                "details": [
                    {"cve": m.get("cve_id"), "product": m.get("product"),
                     "agents": m.get("matched_agents")}
                    for m in cisa_matches[:3]
                ],
            },
            "scan_freshness": {
                "all_fresh":   not stale_agents,
                "stale_agents": stale_agents,
            },
            "agents": {
                "active":       delta.get("agents_active", 0),
                "disconnected": delta.get("agents_disconnected", 0),
            },
            "top_mitre": delta.get("top_tactic"),
        }

    async def _persist(
        self,
        db,
        date_str: str,
        risk_level: str,
        risk_score: int,
        risk_reasoning: str,
        delta: dict,
        agents_by_category: dict,
        cisa_matches: list,
        ai_summary: str | None,
        ai_model: str | None,
        ai_is_mock: bool,
        ai_payload: dict,
        ai_generated_at: str | None,
        detector: dict,
        method: str,
    ) -> int:
        from sqlalchemy import select
        from models.daily_digest import DailyDigest

        # Upsert: replace if same date exists
        result = await db.execute(
            select(DailyDigest).where(DailyDigest.date == date_str)
        )
        row = result.scalar_one_or_none()

        now_utc = datetime.now(timezone.utc)
        data = dict(
            date              = date_str,
            risk_level        = risk_level,
            risk_score        = risk_score,
            risk_reasoning    = risk_reasoning,
            delta_json        = json.dumps(delta, default=str),
            agents_json       = json.dumps(agents_by_category, default=str),
            cisa_json         = json.dumps(cisa_matches, default=str),
            ai_summary        = ai_summary,
            ai_model_used     = ai_model,
            ai_is_mock        = ai_is_mock,
            ai_payload_sent   = json.dumps(ai_payload, default=str),
            ai_generated_at   = ai_generated_at,
            detector_healthy  = detector.get("healthy", True),
            detector_last_scan = detector.get("last_scan"),
            generated_at      = now_utc,
            generation_method = method,
        )
        if row:
            for k, v in data.items():
                setattr(row, k, v)
        else:
            row = DailyDigest(**data)
            db.add(row)

        await db.commit()
        await db.refresh(row)
        return row.id

    @staticmethod
    def _row_to_dict(row) -> dict:
        """Convert a DailyDigest SQLAlchemy row to a plain dict."""
        delta  = json.loads(row.delta_json  or "{}")
        agents = json.loads(row.agents_json or "{}")
        cisa   = json.loads(row.cisa_json   or "[]")
        payload = json.loads(row.ai_payload_sent or "null")
        return {
            "id":                    row.id,
            "date":                  row.date,
            "risk_level":            row.risk_level,
            "risk_score":            row.risk_score,
            "risk_reasoning":        row.risk_reasoning,
            "delta":                 delta,
            "agents_by_category":    agents,
            "cisa_kev_matches":      cisa,
            "cisa_kev_total_checked": 0,
            "cisa_kev_last_updated": None,
            "ai_summary":            row.ai_summary,
            "ai_model_used":         row.ai_model_used,
            "ai_is_mock":            row.ai_is_mock,
            "ai_payload_sent":       payload,
            "ai_generated_at":       row.ai_generated_at,
            "detector_healthy":      row.detector_healthy,
            "detector_last_scan":    row.detector_last_scan,
            "generated_at":          row.generated_at.isoformat() if row.generated_at else "",
            "generation_method":     row.generation_method,
        }


# ── Singleton accessor ─────────────────────────────────────────────────────────

_digest_service_instance: DigestService | None = None


def get_digest_service() -> DigestService:
    """Get (or create) the DigestService instance."""
    global _digest_service_instance
    if _digest_service_instance is None:
        _digest_service_instance = DigestService()
    return _digest_service_instance
