/**
 * DeltaSummaryCards.tsx
 * Six metric cards showing "yesterday vs today" for:
 *   Alerts · Critical alerts · CVEs · Active agents · Top MITRE tactic · Scan freshness
 * Styled with NetShield stat-card system.
 */
import React from 'react';
import type { DigestDelta } from '../../types';

interface Props {
  delta: DigestDelta;
}

interface CardProps {
  title: string;
  today: number | string;
  yesterday?: number | string;
  delta?: number;
  deltaPercent?: number;
  icon: string;
  accentColor: string;
  unit?: string;
  note?: string;
}

const MetricCard: React.FC<CardProps> = ({
  title, today, yesterday, delta, deltaPercent, icon, accentColor, unit = '', note,
}) => {
  const isPositive = (delta ?? 0) > 0;
  const isNeutral  = delta === 0 || delta === undefined;
  const arrowColor = isNeutral ? 'var(--text-tertiary, #525252)' : isPositive ? '#ef4444' : '#22c55e';
  const arrow      = isNeutral ? '→' : isPositive ? '↑' : '↓';

  return (
    <div
      className="stat-card"
      style={{ borderTop: `3px solid ${accentColor}` }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-3px)';
        (e.currentTarget as HTMLDivElement).style.boxShadow = `0 8px 30px ${accentColor}22`;
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLDivElement).style.transform = 'none';
        (e.currentTarget as HTMLDivElement).style.boxShadow = 'none';
      }}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold text-surface-400 uppercase tracking-wider">
            {title}
          </p>
          <p className="mt-1.5 text-3xl font-extrabold text-surface-100 leading-none">
            {today}
            {unit && <span className="text-sm font-medium text-surface-400 ml-1">{unit}</span>}
          </p>
          {yesterday !== undefined && (
            <p className="mt-1 text-xs text-surface-500">Ayer: {yesterday}{unit}</p>
          )}
          {note && (
            <p className="mt-1.5 text-xs text-surface-400 italic">{note}</p>
          )}
        </div>
        <span className="text-2xl leading-none">{icon}</span>
      </div>

      {delta !== undefined && (
        <div className="mt-3 flex items-center gap-1.5">
          <span className="text-base font-bold" style={{ color: arrowColor }}>{arrow}</span>
          <span className="text-xs font-semibold" style={{ color: arrowColor }}>
            {Math.abs(delta)}{unit}
            {deltaPercent !== undefined && ` (${Math.abs(deltaPercent).toFixed(1)}%)`}
          </span>
          <span className="text-xs text-surface-500">vs ayer</span>
        </div>
      )}
    </div>
  );
};

export const DeltaSummaryCards: React.FC<Props> = ({ delta }) => {
  const staleCount = delta.agents_scan_status?.filter(a => a.is_stale).length ?? 0;

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
        gap: 14,
      }}
    >
      <MetricCard
        title="Alertas totales"
        today={delta.alerts_today}
        yesterday={delta.alerts_yesterday}
        delta={delta.alerts_delta}
        deltaPercent={delta.alerts_delta_percent}
        icon="🔔"
        accentColor="#6366f1"
      />
      <MetricCard
        title="Alertas críticas"
        today={delta.critical_today}
        yesterday={delta.critical_yesterday}
        delta={delta.critical_delta}
        icon="🚨"
        accentColor="#ef4444"
      />
      <MetricCard
        title="CVEs activos"
        today={delta.total_cves_today}
        yesterday={delta.total_cves_yesterday}
        delta={delta.total_cves_today - delta.total_cves_yesterday}
        icon="🐛"
        accentColor="#f59e0b"
        note={delta.new_cves_today?.length
          ? `+${delta.new_cves_today.length} nuevas hoy`
          : 'Sin CVEs nuevas'}
      />
      <MetricCard
        title="Agentes activos"
        today={delta.agents_active}
        icon="🖥️"
        accentColor="#22c55e"
        note={delta.agents_disconnected
          ? `${delta.agents_disconnected} desconectado${delta.agents_disconnected > 1 ? 's' : ''}`
          : 'Todos conectados'}
      />
      <MetricCard
        title="Top táctica MITRE"
        today={delta.top_tactic ?? '—'}
        icon="🎯"
        accentColor="#8b5cf6"
        note={delta.new_techniques_today?.length
          ? `+${delta.new_techniques_today.length} técnica${delta.new_techniques_today.length > 1 ? 's' : ''} nueva${delta.new_techniques_today.length > 1 ? 's' : ''}`
          : undefined}
      />
      <MetricCard
        title="Freshness de escaneo"
        today={staleCount === 0 ? 'OK' : `${staleCount} stale`}
        icon={staleCount === 0 ? '✅' : '⚠️'}
        accentColor={staleCount === 0 ? '#22c55e' : '#f97316'}
        note={staleCount > 0 ? 'Agentes sin escaneo reciente (>48h)' : 'Todos los escaneos al día'}
      />
    </div>
  );
};
