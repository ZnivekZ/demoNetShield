"""Evidence-bound Markdown renderers for technical and executive MITRE reports."""

from __future__ import annotations

from datetime import datetime, timezone, timedelta
from typing import Any

ART = timezone(timedelta(hours=-3))


def clean(value: Any) -> str:
    return str(value or "—").replace("\r", " ").replace("\n", " ").replace("|", "\\|").replace("<", "&lt;").replace(">", "&gt;").strip()[:250]


def when(value: str | None) -> str:
    if not value:
        return "sin fecha"
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return parsed.astimezone(ART).strftime("%d/%m/%Y %H:%M") + " (Argentina)"
    except ValueError:
        return clean(value)


def posture(level: int) -> str:
    if level >= 12:
        return "CRÍTICA"
    if level >= 8:
        return "ALTA"
    if level >= 4:
        return "MEDIA"
    return "BAJA"


def variation(current: int | None, previous: int | None) -> str:
    if current is None or previous is None:
        return "N/D"
    if previous == 0:
        return "0 %" if current == 0 else "N/A (base anterior 0)"
    return f"{(current - previous) / previous * 100:+.0f} %"


def _phase(report: dict, names: tuple[str, ...]) -> str:
    matches = [t for t in report.get("tactics", []) if t["name"].casefold() in {n.casefold() for n in names}]
    return (f"{sum(t['count_associations'] for t in matches)} asociaciones en " +
            ", ".join(t["name"] for t in matches) + ". Requieren revisión de eventos; no prueban una fase de ataque completada."
            if matches else "Sin alertas mapeadas a esta fase en el período; no implica cobertura completa ni ausencia de actividad.")


def technical_markdown(report: dict, ai: dict | None) -> str:
    metrics = report["metrics"]
    fleet = report.get("fleet") or {}
    total_agents = fleet.get("total") if fleet.get("available") else None
    main = report["techniques"][0] if report["techniques"] else None
    intro = (
        f"Se procesaron {report['mapped_alerts']} alertas con mapeo MITRE de {report['total_alerts']} alertas totales. "
        f"Umbral de triage: nivel Wazuh ≥ 8 ({metrics['mapped_high_alerts']} alertas mapeadas). "
        + (f"Actividad mapeada predominante: {clean(main['technique_id'])} {clean(main['technique_name'])}. " if main else "Sin técnicas MITRE registradas. ")
        + "Persistencia: " + ("observada en reglas mapeadas" if any(t["name"].casefold() == "persistence" for t in report["tactics"]) else "sin mapeo observado")
        + "; movimiento lateral: " + ("observado en reglas mapeadas" if any(t["name"].casefold() == "lateral movement" for t in report["tactics"]) else "sin mapeo observado")
        + "; exfiltración: " + ("observada en reglas mapeadas" if any(t["name"].casefold() == "exfiltration" for t in report["tactics"]) else "sin mapeo observado")
        + ". Un mapeo no confirma ejecución exitosa ni compromiso."
    )
    lines = [
        "# INFORME TÉCNICO DE AMENAZAS Y CORRELACIÓN MITRE ATT&CK", "",
        f"**Período:** {when(report['period_start'])} → {when(report['period_end'])}  ",
        "**Ejecución:** A demanda  ",
        f"**Alcance:** {total_agents if total_agents is not None else 'N/D'} agentes Wazuh · {len(report['agents'])} hosts con alertas MITRE  ",
        f"**Postura de severidad observada:** {posture(metrics['max_level'])} (nivel máximo Wazuh {metrics['max_level']})", "",
        "## 1. Resumen técnico y señales observadas", "", intro, "",
    ]
    if ai and ai.get("summary"):
        lines += [f"**Lectura asistida (verificar):** {clean(ai['summary'])}", ""]
    lines += ["## 2. Matriz ATT&CK agregada", "",
              "| Táctica MITRE | ID | Técnica / subtécnica | Agentes afectados | Nivel máx. Wazuh | Conteo |",
              "| :--- | :--- | :--- | :--- | ---: | ---: |"]
    for tech in report["techniques"]:
        for tactic in tech["tactics"] or ["Sin táctica atribuible"]:
            names = ", ".join(clean(agent["agent_name"]) for agent in tech["agents"])
            lines.append(f"| {clean(tactic)} | `{clean(tech['technique_id'])}` | {clean(tech['technique_name'])} | {names or '—'} | {tech['max_level']} | {tech['count']} |")
    if not report["techniques"]:
        lines.append("| — | — | Sin alertas mapeadas en el período | — | — | 0 |")
    lines += ["", report["count_note"], "",
              "## 3. Triage y correlación por agente prioritario", "",
              "Se incluyen agentes con alerta MITRE de nivel ≥ 8 o mapeo a Persistencia/Impacto. La línea temporal muestra eventos seleccionados por prioridad, ordenados cronológicamente; no establece causalidad.", ""]
    critical = report.get("critical_agents") or []
    if not critical:
        lines += ["Sin agentes que cumplan el criterio de triage en esta ventana.", ""]
    for agent in critical:
        lines += [f"### Agente: `{clean(agent['agent_name'])}` (IP: {clean(agent.get('ip'))} · SO: {clean(agent.get('os'))})", "",
                  f"- **Severidad observada:** {posture(agent['max_level'])} (nivel {agent['max_level']}).",
                  f"- **TTPs mapeados por reglas:** {', '.join('`' + clean(t['technique_id']) + '`' for t in agent['techniques'])}.",
                  "- **Correlación:** Coincidencia de alertas en este host y período; secuencia causal no verificada.",
                  "- **Diagnóstico:** Indeterminado. Wazuh no confirma por sí solo compromiso, contención ni falso positivo validado.",
                  "- **Reglas Wazuh disparadas:** " + (
                      "; ".join(f"{clean(e['rule_id'])}: {clean(e['rule_description'])}" for e in
                                {e['rule_id']: e for e in (agent.get('evidence') or {}).get('events', [])}.values())
                      or "Sin detalle de reglas recuperado."),
                  "- **Línea temporal (evidencia seleccionada):**"]
        evidence = agent.get("evidence") or {}
        for event in evidence.get("events") or []:
            context = "; ".join(f"{label}: {clean(event.get(key))}" for key, label in
                                (("parent_process", "padre"), ("process", "proceso"),
                                 ("command", "comando"), ("user", "usuario"),
                                 ("source_ip", "origen"), ("destination_ip", "destino")) if event.get(key))
            lines.append(f"  - {when(event.get('timestamp'))} · regla {clean(event['rule_id'])} (nivel {event['level']}) · {clean(event['rule_description'])}" +
                         (f" · {context}" if context else ""))
        if not evidence.get("events"):
            lines.append("  - Evidencia de eventos no disponible para este agente.")
        if evidence.get("total_qualifying", 0) > len(evidence.get("events") or []):
            lines.append(f"  - Se muestran {len(evidence.get('events') or [])} de {evidence['total_qualifying']} eventos que cumplen el criterio; consultar Wazuh para el resto.")
        lines.append("")
    lines += ["## 4. Estado de la flota en línea base", ""]
    if fleet.get("available"):
        high_ids = set(metrics["high_agent_ids"])
        baseline = [a["name"] for a in fleet["agents"] if a["status"] == "active" and a["id"] not in high_ids]
        disconnected = [a["name"] for a in fleet["agents"] if a["status"] != "active"]
        lines += ["Agentes activos sin alertas Wazuh de nivel ≥ 8 en esta ventana (no equivale a ausencia de amenazas):",
                  ", ".join(f"`{clean(name)}`" for name in baseline) or "Ninguno.", ""]
        if disconnected:
            lines += ["**Cobertura limitada:** agentes no activos: " + ", ".join(f"`{clean(name)}`" for name in disconnected), ""]
    else:
        lines += ["No se pudo consultar el inventario de agentes; línea base no verificable.", ""]
    lines += ["## 5. Acciones inmediatas de contención y detección", "",
              "1. **Contención:** validar los eventos prioritarios y la situación del host antes de aislarlo, terminar procesos o revocar sesiones.",
              "2. **Hardening:** revisar accesos, políticas locales y reglas de red en los hosts con señales confirmadas por los registros.",
              "3. **Ingeniería de detección:** revisar las reglas Wazuh disparadas y la cobertura de alertas sin mapeo MITRE.", ""]
    if ai and ai.get("findings"):
        lines += ["**Prioridades propuestas por IA (verificar con eventos):**"]
        lines += [f"- `{clean(item['technique_id'])}`: {clean(item['action'])}" for item in ai["findings"] if item.get("action")]
        lines.append("")
    lines += [f"**Cobertura:** {report['unmapped_alerts']} alertas sin mapeo MITRE; {report['mapped_without_agent']} mapeadas sin agente atribuible."]
    return "\n".join(lines).strip() + "\n"


def executive_markdown(report: dict, ai: dict | None) -> str:
    metrics = report["metrics"]
    previous = report.get("previous_metrics")
    fleet = report.get("fleet") or {}
    start = datetime.fromisoformat(report["period_start"])
    end = datetime.fromisoformat(report["period_end"])
    week = end.astimezone(ART).isocalendar().week
    period_label = (f"**Semana:** {week}" if end - start >= timedelta(days=7) else "**Período:** A demanda")
    main = report["techniques"][0] if report["techniques"] else None
    main_signal = (f"La principal señal fue un conjunto de alertas asociado a {clean(main['technique_name'])}; "
                   "se requiere revisión para determinar si hubo un incidente."
                   if main else "No hubo alertas con mapeo MITRE en la ventana; eso no descarta incidentes.")
    current_active = f"{fleet['active']}/{fleet['total']}" if fleet.get("available") else "N/D"
    prev_high = previous.get("high_alerts") if previous else None
    prev_critical_hosts = len(previous["critical_agent_ids"]) if previous else None
    lines = [
        "# ESTADO DE CIBERSEGURIDAD Y RIESGO OPERATIVO", "",
        f"{period_label} ({when(report['period_start'])} → {when(report['period_end'])})  ",
        "**Ejecución:** A demanda  ",
        "**Audiencia:** Dirección de TI / Comité de Seguridad  ",
        f"**Índice de riesgo basado en alertas:** {posture(metrics['max_level']).title()} (no representa el riesgo integral del negocio)", "",
        "## 1. Conclusiones ejecutivas", "",
        f"- **Estado global:** Se registraron {metrics['high_alerts']} alertas de nivel alto (Wazuh ≥ 8) y {report['mapped_alerts']} alertas con mapeo MITRE. "
        "Estos registros indican asuntos para revisión; no demuestran por sí solos impacto en servicios o datos.",
        f"- **Principal señal del período:** {main_signal}",
        f"- **Evolución del riesgo observado:** alertas altas {metrics['high_alerts']} frente a " +
        (f"{prev_high} en el período equivalente anterior ({variation(metrics['high_alerts'], prev_high)})." if prev_high is not None else "un período anterior no disponible."),
    ]
    if ai and ai.get("summary"):
        lines.append(f"- **Lectura asistida (verificar):** {clean(ai['summary'])}")
    lines += ["", "## 2. Métricas clave de operación", "",
              "| Métrica | Período actual | Período anterior | Variación |",
              "| :--- | ---: | ---: | ---: |",
              f"| Activos monitorizados activos | {current_active} | N/D | N/D |",
              f"| Alertas de alta severidad (nivel ≥ 8) | {metrics['high_alerts']} | {prev_high if prev_high is not None else 'N/D'} | {variation(metrics['high_alerts'], prev_high)} |",
              "| Intentos de intrusión bloqueados | N/D | N/D | N/D |",
              f"| Endpoints con alertas críticas (nivel ≥ 12) | {len(metrics['critical_agent_ids'])} | {prev_critical_hosts if prev_critical_hosts is not None else 'N/D'} | {variation(len(metrics['critical_agent_ids']), prev_critical_hosts)} |",
              "", "N/D = no verificable con las fuentes de este informe. Una alerta no prueba que un intento fue bloqueado.", "",
              "## 3. Cobertura de amenazas por fase ATT&CK", "",
              f"- **Acceso inicial:** {_phase(report, ('Initial Access',))}",
              f"- **Ejecución y persistencia:** {_phase(report, ('Execution', 'Persistence'))}",
              f"- **Movimiento lateral y fuga de datos:** {_phase(report, ('Lateral Movement', 'Exfiltration'))}", "",
              "## 4. Impacto en la continuidad del negocio", "",
              "- **Disponibilidad de servicios:** No verificada por estas fuentes; requiere métricas de servicio o registro de incidentes.",
              "- **Integridad de datos:** No verificada por estas fuentes; las alertas Wazuh no bastan para certificar ausencia de cambios.", "",
              "## 5. Decisiones y asignación de recursos requerida", "",
              "1. **Prioridad 1:** asignar revisión técnica de las alertas de mayor nivel y validar impacto antes de autorizar contención o mantenimiento.",
              "2. **Prioridad 2:** mejorar la cobertura de detección y la trazabilidad de bloqueos, disponibilidad e integridad para cerrar los indicadores N/D.", "",
              f"**Cobertura:** {report['unmapped_alerts']} alertas sin mapeo MITRE; {report['mapped_without_agent']} mapeadas sin agente atribuible.",
              "**Método:** informe generado a demanda con datos Wazuh; sin confirmación automática de ataque, bloqueo o continuidad."]
    return "\n".join(lines).strip() + "\n"
