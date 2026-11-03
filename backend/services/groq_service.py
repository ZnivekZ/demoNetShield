"""
GroqService — AI analysis for the Daily Security Digest.

Behavior:
  - GROQ_API_KEY empty  → mock mode: returns realistic simulated analysis,
                          ai_is_mock=True, ai_model_used="mock".
  - GROQ_API_KEY set    → calls Groq API (OpenAI-compatible) with model fallback chain:
                          1. llama-3.3-70b-versatile  (best quality)
                          2. llama-3.1-8b-instant      (fallback on 429)
                          3. mixtral-8x7b-32768        (tertiary fallback)
                          If all models hit rate limits → degrades to mock transparently.

Design:
  - NOT a singleton: instantiated per digest generation (like AIService).
  - Reuses the `openai` package already in requirements.txt with base_url override.
  - Input payload is always ≤ 1500 tokens (pre-condensed by DigestService).
  - Returns (summary, model_used, is_mock).
"""

from __future__ import annotations

import structlog

from config import get_settings

logger = structlog.get_logger(__name__)

# ── Groq configuration ────────────────────────────────────────────────────────
GROQ_BASE_URL = "https://api.groq.com/openai/v1"

FALLBACK_MODELS = [
    "llama-3.3-70b-versatile",
    "llama-3.1-8b-instant",
    "mixtral-8x7b-32768",
]

SYSTEM_PROMPT = """Eres un analista SOC senior. Tu tarea es analizar el delta de seguridad \
de las últimas 24 horas de una infraestructura de red.

Genera un resumen ejecutivo EN ESPAÑOL con exactamente estas secciones:
1. **Evaluación de riesgo** — justifica brevemente el nivel del semáforo.
2. **Hallazgos principales** — los 3 eventos más relevantes del período.
3. **Acciones recomendadas** — máximo 5 acciones priorizadas (🔴🟠🟡🟢).

Reglas:
- Máximo 300 palabras en total.
- No inventes datos que no estén en el payload.
- Si hay CISA KEV matches, marcarlo como URGENTE al inicio.
- Usa markdown básico (negrita, listas) para legibilidad.
- Termina con una línea: "*Análisis generado automáticamente — verificar contra datos fuente.*"
"""

# ── Mock response ─────────────────────────────────────────────────────────────
_MOCK_SUMMARY_TEMPLATE = """## 🟠 Resumen de Seguridad — {date}

**Nivel de riesgo: {level_upper}** — {risk_reasoning}

### Hallazgos principales

1. **Variación de alertas** — {alerts_today} alertas hoy vs {alerts_yesterday} ayer \
({alerts_delta:+d}, {alerts_delta_pct:+.0f}%). {critical_line}
2. **Vulnerabilidades** — {new_cves_count} CVE(s) nueva(s) detectada(s). \
{cisa_line}
3. **Agentes** — {agents_active} activos, {agents_disc} desconectados. \
{incidents_line}

### Acciones recomendadas

{actions}

*⚠️ Modo simulación — configurar GROQ_API_KEY en .env para análisis real con IA.*

*Análisis generado automáticamente — verificar contra datos fuente.*"""

_RISK_LABELS = {
    "green":  "VERDE",
    "yellow": "AMARILLO",
    "orange": "NARANJA",
    "red":    "ROJO",
}

_DEFAULT_ACTIONS = (
    "1. 🟡 Revisar alertas con mayor frecuencia hoy vs ayer\n"
    "2. 🟡 Actualizar paquetes con CVEs detectadas\n"
    "3. 🟢 Verificar que todos los agentes ejecuten syscheck regularmente\n"
    "4. 🟢 Confirmar que vulnerability-detector esté activo\n"
    "5. 🟢 Revisar logs de incidentes transitorios si los hay"
)


def _build_mock_summary(payload: dict) -> str:
    """Generate a realistic mock summary from the condensed payload."""
    alerts     = payload.get("alerts", {})
    risk_level = payload.get("risk_level", "yellow")
    reasoning  = payload.get("risk_reasoning", "")
    cisa       = payload.get("cisa_kev", {})
    new_cves   = payload.get("new_cves", [])
    incidents  = payload.get("transient_incidents", [])
    agents_info = payload.get("agents", {})

    critical_line = ""
    crit = payload.get("critical_alerts", {})
    if crit.get("delta", 0) > 0:
        critical_line = f"{crit.get('today', 0)} alertas críticas ({crit.get('delta', 0):+d} vs ayer)."

    cisa_line = "✅ Sin coincidencias CISA KEV."
    if cisa.get("matches", 0) > 0:
        cisa_line = f"🔴 **URGENTE**: {cisa['matches']} CVE(s) del catálogo CISA KEV activas en el inventario."

    incidents_line = "Sin incidentes de conectividad."
    if incidents:
        incidents_line = f"{len(incidents)} incidente(s) de conectividad detectado(s)."

    if cisa.get("matches", 0) > 0:
        actions = (
            f"1. 🔴 **URGENTE** — Parchear CVEs del catálogo CISA KEV inmediatamente\n"
            f"2. 🔴 Verificar que los sistemas afectados no estén comprometidos\n"
            f"3. 🟠 Revisar los {len(new_cves)} CVE(s) nueva(s) detectada(s)\n"
            f"4. 🟡 Investigar el aumento de alertas\n"
            f"5. 🟢 Ejecutar syscheck manual en agentes desactualizados"
        )
    else:
        actions = _DEFAULT_ACTIONS

    return _MOCK_SUMMARY_TEMPLATE.format(
        date            = payload.get("date", ""),
        level_upper     = _RISK_LABELS.get(risk_level, risk_level.upper()),
        risk_reasoning  = reasoning or "Ver métricas detalladas abajo.",
        alerts_today    = alerts.get("today", 0),
        alerts_yesterday = alerts.get("yesterday", 0),
        alerts_delta    = (alerts.get("today", 0) - alerts.get("yesterday", 0)),
        alerts_delta_pct = float(
            (alerts.get("delta", "+0")).replace("+", "").replace("%", "") or 0
        ),
        critical_line   = critical_line,
        new_cves_count  = len(new_cves),
        cisa_line       = cisa_line,
        agents_active   = agents_info.get("active", 0),
        agents_disc     = agents_info.get("disconnected", 0),
        incidents_line  = incidents_line,
        actions         = actions,
    )


# ── GroqService ───────────────────────────────────────────────────────────────

class GroqService:
    """
    Calls Groq API for digest analysis with transparent mock fallback.

    Returns: tuple[summary: str | None, model: str | None, is_mock: bool]
    """

    def __init__(self) -> None:
        self._settings = get_settings()
        self._api_key  = self._settings.groq_api_key
        self._is_mock  = not bool(self._api_key)

    async def analyze_digest(
        self, payload: dict
    ) -> tuple[str | None, str | None, bool]:
        """
        Analyze the digest payload.

        Returns:
            (summary, model_used, is_mock)
            - summary: markdown text or None if all failed
            - model_used: model name, "mock", or None
            - is_mock: True when mock or all models exhausted
        """
        if self._is_mock:
            logger.info("groq_service_mock_mode")
            return _build_mock_summary(payload), "mock", True

        return await self._call_with_fallback(payload)

    async def _call_with_fallback(
        self, payload: dict
    ) -> tuple[str | None, str | None, bool]:
        """Try each model in FALLBACK_MODELS; degrade to mock if all fail."""
        try:
            from openai import AsyncOpenAI, RateLimitError
        except ImportError:
            logger.error("groq_openai_package_missing")
            return _build_mock_summary(payload), "mock", True

        client = AsyncOpenAI(
            api_key=self._api_key,
            base_url=GROQ_BASE_URL,
        )

        user_content = (
            "Analiza el siguiente delta de seguridad y genera el resumen:\n\n"
            "```json\n"
            + _safe_json(payload)
            + "\n```"
        )

        for model in FALLBACK_MODELS:
            try:
                logger.info("groq_calling_model", model=model)
                response = await client.chat.completions.create(
                    model=model,
                    messages=[
                        {"role": "system", "content": SYSTEM_PROMPT},
                        {"role": "user",   "content": user_content},
                    ],
                    max_tokens=600,
                    temperature=0.3,
                )
                summary = response.choices[0].message.content or ""
                logger.info("groq_success", model=model, tokens=response.usage.total_tokens)
                return summary, model, False

            except RateLimitError:
                logger.warning("groq_rate_limited", model=model)
                continue
            except Exception as e:
                logger.error("groq_model_failed", model=model, error=str(e))
                continue

        # All models failed → graceful degradation
        logger.warning("groq_all_models_exhausted")
        return _build_mock_summary(payload), None, True


def _safe_json(obj: dict) -> str:
    """JSON-serialize with fallback for non-serializable types."""
    import json
    try:
        return json.dumps(obj, ensure_ascii=False, indent=2, default=str)
    except Exception:
        return str(obj)
