/**
 * AgentDeltaTable.tsx
 * Shows "yesterday vs today" metrics for a single agent.
 * Styled with NetShield glass-card / design-system tokens.
 */
import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { DigestAgent, DigestDelta } from '../../types';
import { CveUsageContext } from '../wazuh/CveUsageStatus';

interface Props {
  agent: DigestAgent;
  period: DigestDelta;
}

type AlertDetail = NonNullable<DigestAgent['alert_details']>[number];

const CATEGORY_LABELS: Record<string, string> = {
  proxy:    '🌐 Proxy',
  mail:     '✉️ Correo',
  notebook: '💻 Notebook',
  server:   '🖥️ Servidor',
};

function DeltaBadge({ val, expanded, onClick, controls }: {
  val: number;
  expanded: boolean;
  onClick: () => void;
  controls: string;
}) {
  const isPos = val > 0;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={expanded}
      aria-controls={controls}
      className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold border border-surface-700 hover:border-indigo-400/50"
      style={{ color: val === 0 ? '#94a3b8' : isPos ? '#f87171' : '#4ade80' }}
    >
      {val === 0 ? '→ 0' : `${isPos ? '↑' : '↓'} ${Math.abs(val)}`}
      <span className="text-surface-400">Detalle</span>
      {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
    </button>
  );
}

function alertSeverity(level: number): { label: string; color: string } {
  if (level >= 12) return { label: 'Crítica', color: '#ef4444' };
  if (level >= 8) return { label: 'Alta', color: '#f97316' };
  if (level >= 5) return { label: 'Media', color: '#eab308' };
  return { label: 'Baja', color: '#94a3b8' };
}

function cveSeverity(value?: string | null): string {
  return ({ critical: 'Crítica', high: 'Alta', medium: 'Media', low: 'Baja' } as Record<string, string>)[String(value || '').toLowerCase()] || 'Sin clasificar';
}

function formatPeriod(start: string, end: string): string {
  const format = (value: string) => new Date(value).toLocaleString('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
  return `${format(start)} → ${format(end)}`;
}

function calendarDate(value?: string | null): string {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : 'sin fecha';
}

function AlertGroup({ title, items }: { title: string; items: AlertDetail[] }) {
  const [showAll, setShowAll] = useState(false);
  return (
    <div className="rounded-lg border border-surface-800 bg-surface-900/40 p-3">
      <p className="text-xs font-semibold text-surface-200 mb-2">{title} <span className="text-surface-500">({items.length} tipo{items.length === 1 ? '' : 's'})</span></p>
      {items.length === 0 ? (
        <p className="text-xs text-surface-500">Ninguno</p>
      ) : (
        <div className="space-y-2">
          {(showAll ? items : items.slice(0, 3)).map((item, index) => {
            const severity = alertSeverity(item.level);
            return (
              <div key={`${item.rule_id}-${index}`} className="border-b border-surface-800/60 pb-2 last:border-0 last:pb-0">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs text-surface-200 leading-snug">{item.description}</p>
                  <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ color: severity.color, background: `${severity.color}20` }}>
                    {severity.label} · {item.level}
                  </span>
                </div>
                <p className="text-[11px] text-surface-500 mt-1">
                  {item.rule_id ? `Regla ${item.rule_id} · ` : ''}{item.today_count} hoy · {item.yesterday_count} ayer
                  {item.source_ips?.length ? ` · origen: ${item.source_ips.join(', ')}` : ''}
                  {(item.last_seen_today || item.last_seen_yesterday) ? ` · última: ${new Date(item.last_seen_today || item.last_seen_yesterday || '').toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })}` : ''}
                </p>
              </div>
            );
          })}
          {items.length > 3 && (
            <button type="button" onClick={() => setShowAll(open => !open)} className="text-[11px] font-semibold text-indigo-300 hover:text-indigo-200">
              {showAll ? 'Ver menos' : `Ver ${items.length - 3} tipos más`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function keepAliveLabel(agent: DigestAgent): string {
  if (agent.agent_id === '000') return 'Manager local · no aplica';
  if (agent.last_keep_alive?.startsWith('9999-12-31')) return 'Fecha especial de Wazuh · no aplica';
  if (!agent.last_keep_alive) return 'No informado';
  const date = new Date(agent.last_keep_alive);
  return Number.isNaN(date.getTime()) ? 'Fecha no válida' : date.toLocaleString('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export const AgentDeltaTable: React.FC<Props> = ({ agent, period }) => {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [cvesOpen, setCvesOpen] = useState(false);
  const alertDelta = agent.alerts_today - agent.alerts_yesterday;
  const alertDetails = agent.alert_details ?? [];
  const newTypes = alertDetails.filter(item => item.today_count > 0 && item.yesterday_count === 0);
  const recurringTypes = alertDetails.filter(item => item.today_count > 0 && item.yesterday_count > 0);
  const onlyYesterday = alertDetails.filter(item => item.today_count === 0 && item.yesterday_count > 0);
  const detailsId = `agent-alert-details-${agent.agent_id}`;

  return (
    <div
      className="glass-card overflow-hidden"
      style={{ border: '1px solid var(--border-default, #1f1f1f)' }}
    >
      {/* Agent header */}
      <div className="flex items-center justify-between flex-wrap gap-2 px-4 py-3 border-b border-surface-800/60 bg-surface-900/50">
        <div>
          <span className="text-sm font-bold text-surface-100">{agent.agent_name}</span>
          <span className="text-xs text-surface-500 ml-2">#{agent.agent_id}</span>
        </div>
        <span
          className="text-xs rounded px-2 py-0.5"
          style={{
            background: 'rgba(30,64,175,0.15)',
            color: '#93c5fd',
            border: '1px solid rgba(30,64,175,0.25)',
          }}
        >
          {CATEGORY_LABELS[agent.category] ?? agent.category}
          {agent.category_source === 'manual_override' && (
            <span className="text-amber-400 ml-1" title="Categoría asignada manualmente">✏️</span>
          )}
        </span>
      </div>

      {/* Metrics table */}
      <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: 'var(--bg-primary, #000)' }}>
            {['Métrica', 'Ayer', 'Hoy', 'Delta'].map(h => (
              <th
                key={h}
                className="px-3.5 py-2 text-left font-semibold text-surface-500 uppercase tracking-wider border-b border-surface-800/60"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[
            { kind: 'alerts', label: '🔔 Alertas', yesterday: agent.alerts_yesterday, today: agent.alerts_today },
            { kind: 'cves', label: '🐛 CVE en inventario', yesterday: null,
              today: agent.current_cves_available ? agent.current_cves ?? 0 : 'Sin datos' },
            { kind: 'detected', label: '🔎 Detectados en esta ventana', yesterday: null,
              today: period.cves_period_available ? agent.new_cves : 'Sin datos' },
          ].map((row, i) => (
            <tr
              key={i}
              className="border-b border-surface-800/40"
              style={{ background: i % 2 === 1 ? 'rgba(255,255,255,0.02)' : 'transparent' }}
            >
              <td className="px-3.5 py-2.5 text-surface-200">{row.label}</td>
              <td className="px-3.5 py-2.5 text-surface-500">
                {row.yesterday !== null ? row.yesterday : '—'}
              </td>
              <td className="px-3.5 py-2.5 font-semibold text-surface-100">{row.today}</td>
              <td className="px-3.5 py-2.5">
                {row.kind === 'alerts'
                  ? <DeltaBadge val={alertDelta} expanded={detailsOpen} onClick={() => setDetailsOpen(open => !open)} controls={detailsId} />
                  : row.kind === 'cves' && agent.current_cves_available && (agent.current_cve_details?.length ?? 0) > 0
                    ? <button type="button" onClick={() => setCvesOpen(open => !open)} className="text-cyan-400 hover:underline" aria-expanded={cvesOpen}>Ver CVE</button>
                    : <span className="text-surface-500">—</span>}
              </td>
            </tr>
          ))}

          {/* Port inventory snapshot */}
          {(agent.ports_available || (agent.port_changes?.length ?? 0) > 0) && (
            <tr className="border-b border-surface-800/40">
              <td className="px-3.5 py-2.5 text-surface-200">🔌 Puertos en escucha</td>
              <td colSpan={3} className="px-3.5 py-2.5">
                <div className="flex gap-1.5 flex-wrap">
                  {(agent.port_changes ?? []).slice(0, 8).map((p, j) => (
                    <span
                      key={j}
                      className="text-xs rounded px-1.5 py-px"
                      style={{
                        background: 'rgba(249,115,22,0.1)',
                        color: '#fb923c',
                        border: '1px solid rgba(249,115,22,0.2)',
                      }}
                    >
                      {String(p.local_port ?? p.port ?? '?')}/{String(p.protocol ?? '?')}
                    </span>
                  ))}
                  {agent.port_changes.length > 8 && <span className="text-surface-500">y {agent.port_changes.length - 8} más</span>}
                  {agent.port_changes.length === 0 && <span className="text-surface-500">Ninguno informado en el escaneo</span>}
                </div>
                <p className="text-[11px] text-surface-500 mt-1">Instantánea Wazuh{agent.ports_scanned_at ? `: ${new Date(agent.ports_scanned_at).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })}` : ' · fecha no informada'}. No confirma exposición externa.</p>
              </td>
            </tr>
          )}

          {/* KeepAlive / Sincronización del agente */}
          <tr className="border-b border-surface-800/40">
            <td className="px-3.5 py-2.5 text-surface-200">📡 Último contacto Wazuh</td>
            <td colSpan={3} className="px-3.5 py-2.5 text-surface-400 text-xs">
              {keepAliveLabel(agent)}
            </td>
          </tr>

          {/* Scan freshness */}
          <tr>
            <td className="px-3.5 py-2.5 text-surface-200">🔍 Último escaneo (syscheck)</td>
            <td colSpan={3} className="px-3.5 py-2.5 text-surface-400 text-xs">
              {agent.last_syscheck
                ? new Date(agent.last_syscheck).toLocaleString('es-AR', {
                    day: '2-digit', month: '2-digit', year: 'numeric',
                    hour: '2-digit', minute: '2-digit',
                  })
                : <span className="text-surface-500">Pendiente de escaneo</span>}
            </td>
          </tr>
        </tbody>
      </table>
      {cvesOpen && <div className="border-t border-amber-400/20 bg-amber-500/5 px-4 py-4">
        <p className="text-sm font-semibold text-surface-100">CVE en inventario Wazuh</p>
        <p className="text-xs text-surface-500 mt-1">{agent.current_cves} CVE único{agent.current_cves === 1 ? '' : 's'} · {agent.current_cve_details?.length ?? 0} hallazgo{(agent.current_cve_details?.length ?? 0) === 1 ? '' : 's'} por paquete · consultado {agent.current_cves_checked_at ? new Date(agent.current_cves_checked_at).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' }) : 'sin fecha'}</p>
        <div className="grid gap-2 mt-3 md:grid-cols-2">{(agent.current_cve_details ?? []).slice(0, 8).map((item, index) => <div key={`${item.cve_id}-${item.package}-${index}`} className="rounded-lg border border-surface-800 bg-surface-900/40 p-3 text-xs">
          <p className="font-semibold text-surface-200">{item.cve_id} · {cveSeverity(item.severity)}</p>
          <p className="text-surface-400 mt-1">{item.package || 'Paquete no informado'} {item.version || ''}</p>
          {item.description && <p className="text-surface-300 mt-1">{item.description}</p>}
          <p className="text-surface-500 mt-1">status: {item.status || 'no informado'} · publicado: {calendarDate(item.published_at)} · detectado: {item.detected_at ? new Date(item.detected_at).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' }) : 'sin fecha'}</p>
          <p className="mt-1"><CveUsageContext status={item.usage_status} evidence={item.usage_evidence} checkedAt={item.usage_checked_at} /></p>
          {item.scanner_condition && <p className="text-surface-500 mt-1">Condición: {item.scanner_condition}</p>}
        </div>)}</div>
        {(agent.current_cve_details?.length ?? 0) > 8 && <p className="text-xs text-surface-500 mt-2">Se muestran 8 hallazgos. El inventario completo está en Wazuh → Vulnerabilidades.</p>}
        {agent.new_since_previous && <p className="text-xs text-surface-400 mt-3">Desde el Digest anterior: {agent.new_since_previous.length} CVE ahora informados · {agent.no_longer_reported?.length ?? 0} ya no informados. Esto último no confirma una corrección.</p>}
      </div>}
      {detailsOpen && (
        <div id={detailsId} className="border-t border-indigo-400/20 bg-indigo-500/5 px-4 py-4">
          <p className="text-sm font-semibold text-surface-100">Qué cambió en las alertas</p>
          <p className="text-xs text-surface-400 mt-1">
            Hoy: {formatPeriod(period.period_start, period.period_end)} · Ayer: {formatPeriod(period.yesterday_start, period.yesterday_end)} (Argentina).
          </p>
          <p className="text-xs text-surface-500 mt-1 mb-3">
            “Nuevo” y “ya visto” comparan tipos de regla entre períodos; no indican que sea el mismo evento activo.
          </p>
          {agent.alert_details === undefined ? (
            <p className="text-xs text-surface-400 rounded-lg border border-surface-800 p-3">
              Este Digest anterior no guardó el detalle de las reglas. Regeneralo para ver el desglose.
            </p>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-2">
              <AlertGroup title="Nuevos hoy" items={newTypes} />
              <AlertGroup title="Ya vistos ayer" items={recurringTypes} />
              <AlertGroup title="No observados en el último período" items={onlyYesterday} />
            </div>
          )}
          <p className="text-[11px] text-surface-500 mt-3">Que una regla deje de observarse no prueba que la causa esté solucionada. Criticidad estimada por nivel Wazuh (0–16).</p>
        </div>
      )}
    </div>
  );
};
