import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';

import { useProtocolDonut } from '../../../hooks/widgets/visual';
import { WidgetSkeleton, WidgetErrorState, WidgetHeader } from '../common';

const PROTOCOL_COLORS: Record<string, string> = {
  tcp: '#3b82f6',
  udp: '#8b5cf6',
  http: '#10b981',
  tls: '#f59e0b',
  dns: '#ef4444',
  icmp: '#ec4899',
  default: '#6b7280',
};

export function ProtocolDonut({ config: _config }: { config?: Record<string, unknown> }) {
  const { data, isLoading, error, refetch } = useProtocolDonut();

  if (isLoading) return <WidgetSkeleton rows={3} />;
  if (error || !data) return <WidgetErrorState onRetry={() => refetch()} />;

  const protocols = data.top_protocols ?? [];
  const total = protocols.reduce((s: number, p: { count: number }) => s + p.count, 0);

  const chartData = protocols.slice(0, 6).map((p: { proto: string; count: number }) => ({
    name: p.proto.toUpperCase(),
    value: p.count,
    pct: total > 0 ? Math.round((p.count / total) * 100) : 0,
    color: PROTOCOL_COLORS[p.proto.toLowerCase()] ?? PROTOCOL_COLORS.default,
  }));

  return (
    <div className="widget-protocol-donut">
      <WidgetHeader title="Protocolos de Red" />
      <ResponsiveContainer width="100%" height={180}>
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            innerRadius={48}
            outerRadius={72}
            paddingAngle={3}
            dataKey="value"
          >
            {chartData.map((entry: { name: string; color: string }, idx: number) => (
              <Cell key={idx} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              background: 'var(--color-surface, #1e293b)',
              border: '1px solid var(--color-border, #334155)',
              borderRadius: '8px',
              color: 'var(--color-text-primary, #f1f5f9)',
            }}
          />
          <Legend iconType="circle" />

        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
