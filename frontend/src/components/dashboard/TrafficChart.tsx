import { useMemo } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { useTrafficStream } from '../../hooks/useWebSocket';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
  const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(1024));
  const idx = Math.min(i, units.length - 1);
  return `${(bytes / Math.pow(1024, idx)).toFixed(1)} ${units[idx]}`;
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass-card p-3 !rounded-lg text-xs">
      <p className="text-surface-400 mb-1.5">{label}</p>
      {payload.map((entry: any, i: number) => (
        <div key={i} className="flex items-center gap-2 mb-0.5">
          <span
            className="w-2 h-2 rounded-full"
            style={{ background: entry.color }}
          />
          <span className="text-surface-300">{entry.name}:</span>
          <span className="font-semibold text-surface-100">
            {formatBytes(entry.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function TrafficChart() {
  const { isConnected, trafficHistory } = useTrafficStream(60);

  const chartData = useMemo(() => {
    return trafficHistory.map((entry, idx) => {
      const point: Record<string, any> = {
        time: entry.timestamp?.split('T')[1] || `${idx}`,
      };
      for (const t of entry.traffic) {
        point[`${t.interface}_rx`] = t.rx_bytes_per_sec;
        point[`${t.interface}_tx`] = t.tx_bytes_per_sec;
      }
      return point;
    });
  }, [trafficHistory]);

  // Get unique interface names from traffic data
  const interfaces = useMemo(() => {
    const set = new Set<string>();
    trafficHistory.forEach((entry) =>
      entry.traffic.forEach((t) => set.add(t.interface))
    );
    return Array.from(set).slice(0, 4); // max 4 interfaces
  }, [trafficHistory]);

  const colors = [
    { rx: '#6366f1', tx: '#818cf8' },
    { rx: '#22c55e', tx: '#4ade80' },
    { rx: '#f59e0b', tx: '#fbbf24' },
    { rx: '#ef4444', tx: '#f87171' },
  ];

  if (!isConnected && chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-surface-500 text-sm">
        <div className="text-center">
          <div className="loading-spinner mx-auto mb-3" />
          <p>Conectando al stream de tráfico...</p>
          <p className="text-xs text-surface-600 mt-1">WebSocket /ws/traffic</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-xs text-surface-500">
          <span
            className={`status-dot ${isConnected ? 'active' : 'disconnected'}`}
          />
          {isConnected ? 'Streaming en vivo' : 'Reconectando...'}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={280}>
        <AreaChart data={chartData}>
          <defs>
            {interfaces.map((iface, i) => (
              <linearGradient
                key={`grad-${iface}`}
                id={`gradient-${iface}`}
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop
                  offset="0%"
                  stopColor={colors[i % colors.length].rx}
                  stopOpacity={0.3}
                />
                <stop
                  offset="100%"
                  stopColor={colors[i % colors.length].rx}
                  stopOpacity={0}
                />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="rgba(148,163,184,0.06)"
          />
          <XAxis
            dataKey="time"
            stroke="transparent"
            tick={{ fontSize: 10, fill: '#64748b' }}
            interval="preserveStartEnd"
          />
          <YAxis
            stroke="transparent"
            tick={{ fontSize: 10, fill: '#64748b' }}
            tickFormatter={formatBytes}
            width={70}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            wrapperStyle={{ fontSize: '0.7rem', color: '#94a3b8' }}
          />
          {interfaces.map((iface, i) => (
            <Area
              key={`${iface}_rx`}
              type="monotone"
              dataKey={`${iface}_rx`}
              name={`${iface} RX`}
              stroke={colors[i % colors.length].rx}
              fill={`url(#gradient-${iface})`}
              strokeWidth={2}
              dot={false}
              animationDuration={300}
            />
          ))}
          {interfaces.map((iface, i) => (
            <Area
              key={`${iface}_tx`}
              type="monotone"
              dataKey={`${iface}_tx`}
              name={`${iface} TX`}
              stroke={colors[i % colors.length].tx}
              fill="transparent"
              strokeWidth={1.5}
              strokeDasharray="4 2"
              dot={false}
              animationDuration={300}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
