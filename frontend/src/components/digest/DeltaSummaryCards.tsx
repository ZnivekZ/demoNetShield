/** Six Digest metrics with a short in-place explanation for each card. */
import React, { useState } from 'react';
import { ChevronDown, ChevronUp, X } from 'lucide-react';
import type { AgentCategory, DigestAgent, DigestDelta } from '../../types';

type CardKey = 'alerts' | 'critical' | 'cves' | 'agents' | 'mitre' | 'scans';

interface Props {
  delta: DigestDelta;
  agentsByCategory: Record<AgentCategory, DigestAgent[]>;
  generatedAt?: string;
}

interface CardProps {
  title: string;
  today: number | string;
  yesterday?: number | string;
  delta?: number;
  deltaPercent?: number;
  icon: string;
  accentColor: string;
  note?: string;
  selected: boolean;
  onClick: () => void;
}

interface DetailItem {
  title: string;
  meta?: string;
  badge?: string;
}

interface CardDetail {
  title: string;
  intro: string;
  facts: string[];
  items: DetailItem[];
  empty: string;
  note?: string;
  isSnapshot?: boolean;
}

function formatTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function textValue(value: unknown, fallback = 'No informado'): string {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function cveSeverity(item: Record<string, unknown>): string {
  const raw = textValue(item.severity, '').toLowerCase();
  const labels: Record<string, string> = { critical: 'Crítica', high: 'Alta', medium: 'Media', low: 'Baja' };
  const label = labels[raw] ?? (raw || 'Sin severidad');
  const score = typeof item.cvss_score === 'number' && item.cvss_score > 0
    ? ` · CVSS ${item.cvss_score.toFixed(1)}` : '';
  return `${label}${score}`;
}

function buildDetail(key: CardKey, delta: DigestDelta, agents: DigestAgent[]): CardDetail {
  if (key === 'alerts') {
    const topAgents = [...agents].filter(agent => agent.alerts_today > 0)
      .sort((a, b) => b.alerts_today - a.alerts_today).slice(0, 3);
    return {
      title: 'Alertas totales',
      intro: 'Cantidad de eventos de Wazuh en dos períodos consecutivos de 24 horas.',
      facts: [`${delta.alerts_today} en el último período`, `${delta.alerts_yesterday} en el anterior`, `Cambio: ${delta.alerts_delta >= 0 ? '+' : ''}${delta.alerts_delta}`],
      items: topAgents.map(agent => ({
        title: agent.agent_name,
        meta: `${agent.alerts_today} hoy · ${agent.alerts_yesterday} ayer`,
        badge: `${agent.alerts_delta >= 0 ? '+' : ''}${agent.alerts_delta}`,
      })),
      empty: 'No hay alertas atribuidas a agentes en el período.',
      note: 'Se muestran los tres agentes con más alertas. El detalle de reglas está en el delta de cada agente.',
    };
  }

  if (key === 'critical') {
    const rules = agents.flatMap(agent => (agent.alert_details ?? [])
      .filter(rule => rule.level >= 12 && rule.today_count > 0)
      .map(rule => ({ agent, rule })))
      .sort((a, b) => b.rule.level - a.rule.level || b.rule.today_count - a.rule.today_count)
      .slice(0, 3);
    return {
      title: 'Alertas críticas',
      intro: 'Alertas cuya regla tiene nivel 12 o superior en Wazuh.',
      facts: [`${delta.critical_today} en el último período`, `${delta.critical_yesterday} en el anterior`],
      items: rules.map(({ agent, rule }) => ({
        title: rule.description,
        meta: `${agent.agent_name}${rule.rule_id ? ` · Regla ${rule.rule_id}` : ''}`,
        badge: `${rule.today_count} · nivel ${rule.level}`,
      })),
      empty: delta.critical_today > 0
        ? 'Este Digest no guardó el desglose por regla. Regeneralo para ver ejemplos.'
        : 'No se registraron alertas de nivel 12 o superior en el último período.',
      note: 'Se muestran hasta 3 reglas. El nivel de Wazuh no confirma por sí solo un incidente.',
    };
  }

  if (key === 'cves') {
    const examples = (delta.new_cves_today ?? []).slice(0, 3);
    return {
      title: 'Detecciones CVE',
      intro: 'Hallazgos cuya fecha de detección cae en cada período de 24 horas.',
      facts: [`${delta.total_cves_today} hallazgos en el último período`, `${delta.total_cves_yesterday} en el anterior`],
      items: examples.map(item => ({
        title: textValue(item.cve_id, 'CVE sin ID'),
        meta: [textValue(item.agent_name, ''), textValue(item.package_name, '')].filter(Boolean).join(' · ') || undefined,
        badge: cveSeverity(item),
      })),
      empty: 'No hay ejemplos de CVEs que aparezcan solo en el último período.',
      note: '“Nuevo” significa ausente en el período anterior. Este contador no representa el inventario activo ni una remediación.',
    };
  }

  if (key === 'agents') {
    const disconnected = agents.filter(agent => String(agent.status).toLowerCase() === 'disconnected');
    return {
      title: 'Estado de agentes',
      intro: 'Estado consultado al generar el Digest; no es una comparación de 24 horas.',
      facts: [`${delta.agents_active} activos`, `${delta.agents_disconnected} desconectados`],
      items: disconnected.slice(0, 4).map(agent => ({ title: agent.agent_name, meta: `Agente ${agent.agent_id}`, badge: 'Desconectado' })),
      empty: delta.agents_disconnected > 0
        ? 'Hay agentes desconectados, pero este Digest no guardó sus nombres.'
        : 'No se registraron agentes desconectados en la consulta.',
      note: disconnected.length > 4 ? `Se muestran 4 de ${disconnected.length} desconectados.` : undefined,
      isSnapshot: true,
    };
  }

  if (key === 'mitre') {
    const newTechniques = delta.new_techniques_today ?? [];
    return {
      title: 'Táctica MITRE más frecuente',
      intro: 'Táctica más repetida en las alertas del último período.',
      facts: [delta.top_tactic ? `Táctica: ${delta.top_tactic}` : 'Sin táctica registrada', `${newTechniques.length} técnicas no vistas ayer`],
      items: newTechniques.slice(0, 5).map(id => ({ title: id, meta: 'Técnica observada en alertas del último período' })),
      empty: 'No se registraron técnicas nuevas respecto del período anterior.',
      note: newTechniques.length > 5
        ? `Se muestran 5 de ${newTechniques.length} técnicas nuevas. La táctica indica el objetivo; la técnica, el método.`
        : 'La táctica indica el objetivo; la técnica, el método.',
    };
  }

  const scans = delta.agents_scan_status ?? [];
  const stale = scans.filter(scan => scan.is_stale);
  const missingDates = scans.filter(scan => scan.syscheck_hours_ago == null || scan.rootcheck_hours_ago == null).length
    + Math.max(0, agents.length - scans.length);
  return {
    title: 'Vigencia de escaneos',
    intro: 'Compara la última fecha informada de syscheck o rootcheck con el momento de generación.',
    facts: [`${stale.length} con más de 48 h`, `${missingDates} sin fechas completas`],
    items: stale.slice(0, 4).map(scan => ({
      title: scan.agent_name,
      meta: [
        scan.syscheck_hours_ago != null ? `syscheck ${Math.round(scan.syscheck_hours_ago)} h` : null,
        scan.rootcheck_hours_ago != null ? `rootcheck ${Math.round(scan.rootcheck_hours_ago)} h` : null,
      ].filter(Boolean).join(' · '),
      badge: 'Desactualizado',
    })),
    empty: missingDates > 0
      ? 'No hay escaneos atrasados entre los agentes con fecha disponible.'
      : 'No se encontraron escaneos de más de 48 horas.',
    note: stale.length > 4 ? `Se muestran 4 de ${stale.length} agentes atrasados.` : 'Una fecha ausente no se considera un escaneo reciente.',
    isSnapshot: true,
  };
}

const MetricCard: React.FC<CardProps> = ({
  title, today, yesterday, delta, deltaPercent, icon, accentColor, note, selected, onClick,
}) => {
  const isPositive = (delta ?? 0) > 0;
  const isNeutral = delta === 0 || delta === undefined;
  const arrowColor = isNeutral ? 'var(--text-tertiary, #525252)' : isPositive ? '#ef4444' : '#22c55e';
  const arrow = isNeutral ? '→' : isPositive ? '↑' : '↓';

  return (
    <button
      type="button"
      aria-expanded={selected}
      aria-controls={selected ? 'digest-delta-detail' : undefined}
      onClick={onClick}
      className="stat-card w-full h-full text-left cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400"
      style={{ borderTop: `3px solid ${accentColor}`, borderColor: selected ? accentColor : undefined, boxShadow: selected ? `0 0 0 1px ${accentColor}66` : undefined }}
    >
      <span className="flex items-start justify-between gap-2">
        <span>
          <span className="block text-xs font-semibold text-surface-400 uppercase tracking-wider">{title}</span>
          <span className={`block mt-1.5 font-extrabold text-surface-100 leading-none ${typeof today === 'string' && today.length > 14 ? 'text-xl' : 'text-3xl'}`}>{today}</span>
          {yesterday !== undefined && <span className="block mt-1 text-xs text-surface-500">Ayer: {yesterday}</span>}
          {note && <span className="block mt-1.5 text-xs text-surface-400 italic">{note}</span>}
        </span>
        <span className="text-2xl leading-none" aria-hidden="true">{icon}</span>
      </span>
      <span className="flex items-center gap-1.5 mt-3">
        {delta !== undefined && (
          <>
            <span className="text-base font-bold" style={{ color: arrowColor }}>{arrow}</span>
            <span className="text-xs font-semibold" style={{ color: arrowColor }}>
              {Math.abs(delta)}{deltaPercent !== undefined ? ` (${Math.abs(deltaPercent).toFixed(1)}%)` : ''}
            </span>
            <span className="text-xs text-surface-500">vs ayer</span>
          </>
        )}
        <span className="ml-auto text-[11px] font-semibold text-indigo-300 flex items-center gap-0.5">
          {selected ? 'Cerrar' : 'Contexto'}
          {selected ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </span>
      </span>
    </button>
  );
};

export const DeltaSummaryCards: React.FC<Props> = ({ delta, agentsByCategory, generatedAt }) => {
  const [active, setActive] = useState<CardKey | null>(null);
  const agents = Object.values(agentsByCategory).flat();
  const staleCount = (delta.agents_scan_status ?? []).filter(scan => scan.is_stale).length;
  const missingScanDates = (delta.agents_scan_status ?? []).filter(scan => scan.syscheck_hours_ago == null || scan.rootcheck_hours_ago == null).length
    + Math.max(0, agents.length - (delta.agents_scan_status ?? []).length);
  const detail = active ? buildDetail(active, delta, agents) : null;
  const open = (key: CardKey) => setActive(current => current === key ? null : key);

  return (
    <div>
      <div className="grid gap-3.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
        <MetricCard title="Alertas totales" today={delta.alerts_today} yesterday={delta.alerts_yesterday}
          delta={delta.alerts_delta} deltaPercent={delta.alerts_delta_percent} icon="🔔" accentColor="#6366f1"
          selected={active === 'alerts'} onClick={() => open('alerts')} />
        <MetricCard title="Alertas críticas" today={delta.critical_today} yesterday={delta.critical_yesterday}
          delta={delta.critical_delta} icon="🚨" accentColor="#ef4444"
          selected={active === 'critical'} onClick={() => open('critical')} />
        <MetricCard title="Detecciones CVE" today={delta.total_cves_today} yesterday={delta.total_cves_yesterday}
          delta={delta.total_cves_today - delta.total_cves_yesterday} icon="🐛" accentColor="#f59e0b"
          note="Por fecha de detección" selected={active === 'cves'} onClick={() => open('cves')} />
        <MetricCard title="Agentes activos" today={delta.agents_active}
          icon="🖥️" accentColor="#22c55e" note={`${delta.agents_disconnected} desconectados · foto al generar`}
          selected={active === 'agents'} onClick={() => open('agents')} />
        <MetricCard title="Top táctica MITRE" today={delta.top_tactic ?? '—'}
          icon="🎯" accentColor="#8b5cf6" note={`${delta.new_techniques_today?.length ?? 0} técnicas nuevas vs ayer`}
          selected={active === 'mitre'} onClick={() => open('mitre')} />
        <MetricCard title="Vigencia de escaneos" today={staleCount > 0 ? `${staleCount} atrasados` : 'Sin atrasos'}
          icon={staleCount > 0 || missingScanDates > 0 ? '⚠️' : '✅'} accentColor={staleCount > 0 || missingScanDates > 0 ? '#f97316' : '#22c55e'}
          note={missingScanDates > 0 ? `${missingScanDates} sin fechas completas` : 'Umbral: 48 horas'}
          selected={active === 'scans'} onClick={() => open('scans')} />
      </div>

      {detail && (
        <section id="digest-delta-detail" aria-label={`Contexto de ${detail.title}`} className="glass-card mt-3.5 p-4 sm:p-5 border border-indigo-400/20">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-surface-100">{detail.title}</h3>
              <p className="text-xs text-surface-400 mt-1">{detail.intro}</p>
            </div>
            <button type="button" onClick={() => setActive(null)} aria-label="Cerrar contexto" className="text-surface-400 hover:text-surface-100 p-1">
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-[11px] text-surface-500 mt-2">
            {detail.isSnapshot
              ? `Foto al generar el Digest${generatedAt ? `: ${formatTime(generatedAt)} (Argentina)` : ''}`
              : `Hoy: ${formatTime(delta.period_start)} → ${formatTime(delta.period_end)} · Ayer: ${formatTime(delta.yesterday_start)} → ${formatTime(delta.yesterday_end)} (Argentina)`}
          </p>
          <div className="flex flex-wrap gap-2 mt-3">
            {detail.facts.map(fact => <span key={fact} className="rounded-md bg-surface-800/60 px-2.5 py-1 text-xs text-surface-200">{fact}</span>)}
          </div>
          <div className="mt-3 space-y-1.5">
            {detail.items.length > 0 ? detail.items.map((item, index) => (
              <div key={`${item.title}-${index}`} className="flex items-start justify-between gap-3 rounded-md bg-surface-900/50 border border-surface-800/70 px-3 py-2 text-xs">
                <div className="min-w-0">
                  <p className="font-semibold text-surface-200">{item.title}</p>
                  {item.meta && <p className="text-surface-500 mt-0.5">{item.meta}</p>}
                </div>
                {item.badge && <span className="shrink-0 text-indigo-300 font-semibold">{item.badge}</span>}
              </div>
            )) : <p className="text-xs text-surface-500">{detail.empty}</p>}
          </div>
          {detail.note && <p className="text-[11px] text-surface-500 mt-3">{detail.note}</p>}
        </section>
      )}
    </div>
  );
};
