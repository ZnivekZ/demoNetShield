/**
 * DecisionsTimeline — Area/Line chart with CrowdSec decisions per hour.
 * Uses Recharts. Shows spikes in attack activity over the last 24h.
 */
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import type { CrowdSecMetrics } from '../../types';

interface Props {
  metrics: CrowdSecMetrics | null;
}

export function DecisionsTimeline({ metrics }: Props) {
  const data = (metrics?.decisions_per_hour ?? []).map(p => ({
    hour: p.hour.slice(11, 16), // "HH:MM"
    decisiones: p.count,
  }));

  return (
    <div className="glass-card" style={{ padding: '1rem 1.25rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h3 style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--color-surface-100)', margin: 0 }}>
          Decisiones — últimas 24h
        </h3>
        <span style={{ fontSize: '0.68rem', color: 'var(--color-surface-400)' }}>
          Total: {data.reduce((s, d) => s + d.decisiones, 0)}
        </span>
      </div>
      {data.length === 0 ? (
        <div style={{ height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-surface-500)', fontSize: '0.75rem' }}>
          Sin datos
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={120}>
          <AreaChart data={data} margin={{ top: 4, right: 0, left: -28, bottom: 0 }}>
            <defs>
              <linearGradient id="csDecGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-brand-500)" stopOpacity={0.4} />
                <stop offset="95%" stopColor="var(--color-brand-500)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
            <XAxis
              dataKey="hour"
              tick={{ fontSize: 10, fill: 'var(--color-surface-500)' }}
              tickLine={false}
              axisLine={false}
              interval={3}
            />
            <YAxis
              tick={{ fontSize: 10, fill: 'var(--color-surface-500)' }}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
            />
            <Tooltip
              contentStyle={{
                background: 'var(--color-surface-800)',
                border: '1px solid var(--color-surface-600)',
                borderRadius: 8,
                fontSize: '0.72rem',
                color: 'var(--color-surface-100)',
              }}
              itemStyle={{ color: 'var(--color-brand-400)' }}
              formatter={(v) => [Number(v), 'Decisiones']}
            />
            <Area
              type="monotone"
              dataKey="decisiones"
              stroke="var(--color-brand-500)"
              strokeWidth={2}
              fill="url(#csDecGrad)"
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
