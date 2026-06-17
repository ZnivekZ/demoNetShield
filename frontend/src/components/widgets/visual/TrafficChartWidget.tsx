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
import { Wifi, WifiOff, ArrowDown, ArrowUp } from 'lucide-react';
import { useTrafficStream } from '../../../hooks/useWebSocket';
import { WidgetSkeleton } from '../common';

interface TrafficChartWidgetProps {
  config?: {
    interface?: string; // Filtra a una interfaz específica. Vacío = todas.
  };
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B/s';
  const units = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
  const i = Math.min(Math.floor(Math.log(Math.abs(bytes)) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: 'var(--bg-glass)',
        border: '1px solid var(--border-primary)',
        borderRadius: 8,
        padding: '8px 12px',
        fontSize: '0.72rem',
        backdropFilter: 'blur(8px)',
      }}
    >
      <p style={{ color: 'var(--text-muted)', marginBottom: 4 }}>{label}</p>
      {payload.map((entry: any, i: number) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: entry.color,
              display: 'inline-block',
            }}
          />
          <span style={{ color: 'var(--text-secondary)' }}>{entry.name}:</span>
          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
            {formatBytes(entry.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

const IFACE_COLORS = [
  { rx: '#6366f1', tx: '#818cf8' },
  { rx: '#22c55e', tx: '#4ade80' },
  { rx: '#f59e0b', tx: '#fbbf24' },
  { rx: '#ef4444', tx: '#f87171' },
];

/**
 * Widget de tráfico en tiempo real vía WebSocket /ws/traffic.
 * Muestra un AreaChart Recharts con rx/tx por interfaz.
 * Soporta filtro por interfaz desde widget.config.
 */
export function TrafficChartWidget({ config }: TrafficChartWidgetProps) {
  const { isConnected, trafficHistory, activeConnections } = useTrafficStream(60);

  const filterIface = config?.interface?.trim() || '';

  // Calcula los datos del gráfico — filtra por interfaz si se configuró
  const { chartData, interfaces } = useMemo(() => {
    const ifaceSet = new Set<string>();

    const data = trafficHistory.map((entry, idx) => {
      const point: Record<string, any> = {
        time: entry.timestamp?.split('T')[1]?.substring(0, 5) ?? `${idx}`,
      };
      for (const t of entry.traffic) {
        if (filterIface && t.interface !== filterIface) continue;
        ifaceSet.add(t.interface);
        point[`${t.interface}_rx`] = t.rx_bytes_per_sec;
        point[`${t.interface}_tx`] = t.tx_bytes_per_sec;
      }
      return point;
    });

    return {
      chartData: data,
      interfaces: Array.from(ifaceSet).slice(0, 4),
    };
  }, [trafficHistory, filterIface]);

  // Totales actuales (último snapshot)
  const latestSnapshot = trafficHistory[trafficHistory.length - 1]?.traffic ?? [];
  const totals = latestSnapshot
    .filter((t) => !filterIface || t.interface === filterIface)
    .reduce(
      (acc, t) => ({
        rx: acc.rx + t.rx_bytes_per_sec,
        tx: acc.tx + t.tx_bytes_per_sec,
      }),
      { rx: 0, tx: 0 }
    );

  // Estado inicial: esperando primer dato
  if (!isConnected && chartData.length === 0) {
    return <WidgetSkeleton rows={4} />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, height: '100%' }}>
      {/* Header: estado WS + totales actuales */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        {/* Estado conexión */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.72rem' }}>
          {isConnected ? (
            <>
              <Wifi size={13} style={{ color: 'var(--color-success)' }} />
              <span style={{ color: 'var(--color-success)' }}>Live</span>
            </>
          ) : (
            <>
              <WifiOff size={13} style={{ color: 'var(--text-muted)' }} />
              <span style={{ color: 'var(--text-muted)' }}>Reconectando…</span>
            </>
          )}
          {activeConnections > 0 && (
            <span style={{ color: 'var(--text-muted)', marginLeft: 4 }}>
              · {activeConnections} conexiones activas
            </span>
          )}
        </div>

        {/* Totales RX / TX */}
        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.75rem' }}>
            <ArrowDown size={12} style={{ color: '#6366f1' }} />
            <span style={{ color: '#6366f1', fontWeight: 600 }}>{formatBytes(totals.rx)}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.75rem' }}>
            <ArrowUp size={12} style={{ color: '#22c55e' }} />
            <span style={{ color: '#22c55e', fontWeight: 600 }}>{formatBytes(totals.tx)}</span>
          </div>
        </div>
      </div>

      {/* Gráfico */}
      <div style={{ flex: 1, minHeight: 180 }}>
        {chartData.length === 0 ? (
          <div
            style={{
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-muted)',
              fontSize: '0.8rem',
            }}
          >
            Esperando datos del router…
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <defs>
                {interfaces.map((iface, i) => (
                  <linearGradient
                    key={`grad-${iface}`}
                    id={`tcw-grad-${iface}`}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="0%"
                      stopColor={IFACE_COLORS[i % IFACE_COLORS.length].rx}
                      stopOpacity={0.25}
                    />
                    <stop
                      offset="100%"
                      stopColor={IFACE_COLORS[i % IFACE_COLORS.length].rx}
                      stopOpacity={0}
                    />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="rgba(148,163,184,0.06)"
                vertical={false}
              />
              <XAxis
                dataKey="time"
                stroke="transparent"
                tick={{ fontSize: 9, fill: 'var(--text-muted)' }}
                interval="preserveStartEnd"
              />
              <YAxis
                stroke="transparent"
                tick={{ fontSize: 9, fill: 'var(--text-muted)' }}
                tickFormatter={formatBytes}
                width={62}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend
                wrapperStyle={{ fontSize: '0.65rem', color: 'var(--text-muted)', paddingTop: 4 }}
              />
              {/* RX — área rellena */}
              {interfaces.map((iface, i) => (
                <Area
                  key={`${iface}_rx`}
                  type="monotone"
                  dataKey={`${iface}_rx`}
                  name={`${iface} ↓`}
                  stroke={IFACE_COLORS[i % IFACE_COLORS.length].rx}
                  fill={`url(#tcw-grad-${iface})`}
                  strokeWidth={2}
                  dot={false}
                  animationDuration={300}
                />
              ))}
              {/* TX — línea discontinua sin relleno */}
              {interfaces.map((iface, i) => (
                <Area
                  key={`${iface}_tx`}
                  type="monotone"
                  dataKey={`${iface}_tx`}
                  name={`${iface} ↑`}
                  stroke={IFACE_COLORS[i % IFACE_COLORS.length].tx}
                  fill="transparent"
                  strokeWidth={1.5}
                  strokeDasharray="4 2"
                  dot={false}
                  animationDuration={300}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
