import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
} from 'recharts';
import { useCorrelationTimeline } from '../../../hooks/widgets/technical';
import { WidgetSkeleton, WidgetErrorState, WidgetHeader } from '../common';

interface CorrelationTimelineProps {
  config?: { minutes?: number };
}

export function CorrelationTimeline({ config }: CorrelationTimelineProps) {
  const minutes = config?.minutes ?? 120;
  const { data, isLoading, error, refetch } = useCorrelationTimeline(minutes);

  if (isLoading) return <WidgetSkeleton rows={5} />;
  if (error || !data) return <WidgetErrorState onRetry={() => refetch()} />;

  // Sampleamos para que el gráfico sea legible: cada 5 min
  const sampled = data.series.filter((_: unknown, i: number) => i % 5 === 0);

  const formatTick = (ts: unknown) => {
    const str = typeof ts === 'string' ? ts : '';
    return str ? new Date(str).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }) : '';
  };

  return (
    <div className="widget-technical">
      <WidgetHeader title="Timeline de Correlación" />
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={sampled} margin={{ top: 4, right: 12, left: -16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border, #334155)" />
          <XAxis
            dataKey="timestamp"
            tickFormatter={formatTick}
            tick={{ fontSize: 10, fill: 'var(--color-text-muted, #64748b)' }}
            interval="preserveStartEnd"
          />
          <YAxis tick={{ fontSize: 10, fill: 'var(--color-text-muted, #64748b)' }} />
          <Tooltip
            labelFormatter={formatTick}
            contentStyle={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: '8px',
              fontSize: '12px',
            }}
          />
          <Legend wrapperStyle={{ fontSize: '11px' }} />
          <Line type="monotone" dataKey="wazuh_alerts" stroke="#f59e0b" name="Wazuh" dot={false} strokeWidth={2} />
          <Line type="monotone" dataKey="suricata_alerts" stroke="#8b5cf6" name="Suricata" dot={false} strokeWidth={2} />
          <Line type="monotone" dataKey="crowdsec_decisions" stroke="#10b981" name="CrowdSec" dot={false} strokeWidth={1.5} strokeDasharray="4 2" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
