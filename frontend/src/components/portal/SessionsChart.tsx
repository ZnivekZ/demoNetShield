/**
 * SessionsChart — Real-time LineChart for active portal sessions.
 * Data comes from WebSocket via usePortalSessions hook.
 * 2 lines: registered users vs unregistered users, last 2 hours (per-minute snapshots).
 */
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import type { PortalChartPoint } from '../../types';

interface SessionsChartProps {
  data: PortalChartPoint[];
}

export function SessionsChart({ data }: SessionsChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="portal-chart-empty">
        <span>Esperando datos del WebSocket…</span>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
        <XAxis
          dataKey="timestamp"
          stroke="var(--color-text-muted)"
          tick={{ fontSize: 11 }}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          stroke="var(--color-text-muted)"
          tick={{ fontSize: 11 }}
          tickLine={false}
          allowDecimals={false}
          width={28}
        />
        <Tooltip
          contentStyle={{
            background: 'var(--color-surface)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '8px',
            color: 'var(--color-text)',
            fontSize: '12px',
          }}
          labelStyle={{ color: 'var(--color-text-muted)' }}
        />
        <Legend
          wrapperStyle={{ fontSize: '12px', color: 'var(--color-text-muted)' }}
        />
        <Line
          type="monotone"
          dataKey="registered"
          name="Registrados"
          stroke="var(--color-primary)"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
        />
        <Line
          type="monotone"
          dataKey="unregistered"
          name="No registrados"
          stroke="var(--color-warning)"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
