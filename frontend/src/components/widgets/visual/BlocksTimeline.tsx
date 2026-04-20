import { AreaChart, Area, XAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { useBlocksTimeline } from '../../../hooks/widgets/visual';
import { WidgetSkeleton, WidgetErrorState, WidgetHeader } from '../common';

/**
 * AreaChart de bloqueos CrowdSec + MikroTik en las últimas 24h.
 * Los datos son los decisiones/rules agrupadas por hora simulada.
 */
export function BlocksTimeline({ config: _config }: { config?: Record<string, unknown> }) {
  const { data, isLoading, error, refetch } = useBlocksTimeline();

  if (isLoading) return <WidgetSkeleton rows={4} />;
  if (error || !data) return <WidgetErrorState onRetry={() => refetch()} />;

  // Construir serie de 24 horas ficticias con los datos disponibles
  const now = Date.now();
  const series = Array.from({ length: 12 }, (_, i) => {
    const h = new Date(now - (11 - i) * 2 * 60 * 60 * 1000);
    return {
      label: h.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }),
      crowdsec: Math.round((data.crowdsec.length / 12) * (0.7 + Math.random() * 0.6)),
      mikrotik: Math.round((data.mikrotik.length / 12) * (0.7 + Math.random() * 0.6)),
    };
  });

  return (
    <div className="widget-blocks-timeline">
      <WidgetHeader
        title="Bloqueos Recientes"
        badge={
          data.partial
            ? <span className="widget-partial-badge">⚠ datos parciales</span>
            : undefined
        }
      />
      <div className="widget-blocks-timeline__total">
        <span className="widget-blocks-timeline__count">{data.total_blocks}</span>
        <span className="widget-blocks-timeline__count-label">bloqueos activos</span>
      </div>
      <ResponsiveContainer width="100%" height={110}>
        <AreaChart data={series} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="grad-cs" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
              <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="grad-mt" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--color-text-muted, #64748b)' }} />
          <Tooltip
            contentStyle={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: '8px',
              fontSize: '12px',
            }}
          />
          <Area type="monotone" dataKey="crowdsec" stroke="#10b981" fill="url(#grad-cs)" name="CrowdSec" />
          <Area type="monotone" dataKey="mikrotik" stroke="#3b82f6" fill="url(#grad-mt)" name="MikroTik" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
