import { useState, useEffect } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { VlanTrafficData } from '../../types';

interface VlanTrafficCardProps {
  vlanId: number;
  name: string;
  history: VlanTrafficData[];
  latestStatus: 'ok' | 'alert';
}

function formatMbps(bps: number): string {
  if (bps >= 1_000_000) return `${(bps / 1_000_000).toFixed(2)} Mbps`;
  if (bps >= 1_000) return `${(bps / 1_000).toFixed(1)} Kbps`;
  return `${bps.toFixed(0)} bps`;
}

const STORAGE_KEY_PREFIX = 'netshield_vlan_collapsed_';

export default function VlanTrafficCard({
  vlanId,
  name,
  history,
  latestStatus,
}: VlanTrafficCardProps) {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(`${STORAGE_KEY_PREFIX}${vlanId}`) === 'true';
    } catch {
      return false;
    }
  });

  // Persist collapsed state
  useEffect(() => {
    try {
      localStorage.setItem(`${STORAGE_KEY_PREFIX}${vlanId}`, String(collapsed));
    } catch {
      // localStorage not available
    }
  }, [collapsed, vlanId]);

  const isAlert = latestStatus === 'alert';

  // Build chart data with timestamps
  const chartData = history.map((h, i) => ({
    time: i * 2, // seconds ago (approximate)
    rx: h.rx_bps / 1_000_000, // Convert to Mbps
    tx: h.tx_bps / 1_000_000,
  }));

  return (
    <div
      className={`glass-card overflow-hidden transition-all duration-500 ease-in-out ${
        isAlert
          ? 'border-danger/40 bg-danger/[0.06]'
          : ''
      }`}
      style={
        isAlert
          ? { boxShadow: '0 0 20px rgba(239, 68, 68, 0.08)' }
          : undefined
      }
    >
      {/* Header — always visible */}
      <div className="flex items-center justify-between px-5 py-3">
        <div className="flex items-center gap-3">
          <div
            className={`w-2 h-2 rounded-full ${
              isAlert ? 'bg-danger animate-pulse' : 'bg-success'
            }`}
          />
          <h3 className="text-sm font-semibold text-surface-100">
            {name}
            <span className="ml-2 text-xs font-normal text-surface-500">
              VLAN {vlanId}
            </span>
          </h3>
          {isAlert && (
            <span className="badge badge-danger text-[0.6rem]">ALERT</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {/* Show latest rates in header */}
          {history.length > 0 && (
            <div className="flex items-center gap-3 text-xs font-mono">
              <span className="text-success">
                ↓ {formatMbps(history[history.length - 1].rx_bps)}
              </span>
              <span className="text-brand-400">
                ↑ {formatMbps(history[history.length - 1].tx_bps)}
              </span>
            </div>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="btn btn-ghost text-xs py-1 px-2"
          >
            {collapsed ? (
              <>
                <ChevronDown className="w-3.5 h-3.5" />
                Mostrar
              </>
            ) : (
              <>
                <ChevronUp className="w-3.5 h-3.5" />
                Ocultar
              </>
            )}
          </button>
        </div>
      </div>

      {/* Chart — collapsible */}
      {!collapsed && (
        <div className="px-5 pb-4">
          {chartData.length > 1 ? (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id={`rx-grad-${vlanId}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#22c55e" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#22c55e" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id={`tx-grad-${vlanId}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#818cf8" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#818cf8" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(148, 163, 184, 0.08)"
                  vertical={false}
                />
                <XAxis
                  dataKey="time"
                  tickFormatter={(v) => `${v}s`}
                  stroke="rgba(148, 163, 184, 0.2)"
                  tick={{ fontSize: 10 }}
                />
                <YAxis
                  tickFormatter={(v) => `${v.toFixed(1)}`}
                  stroke="rgba(148, 163, 184, 0.2)"
                  tick={{ fontSize: 10 }}
                  width={45}
                  label={{
                    value: 'Mbps',
                    angle: -90,
                    position: 'insideLeft',
                    style: { fill: 'rgba(148, 163, 184, 0.4)', fontSize: 10 },
                  }}
                />
                <Tooltip
                  contentStyle={{
                    background: 'rgba(15, 23, 42, 0.95)',
                    border: '1px solid rgba(148, 163, 184, 0.15)',
                    borderRadius: '10px',
                    fontSize: '0.75rem',
                    color: '#f1f5f9',
                  }}
                  formatter={(value, name) => [
                    `${Number(value).toFixed(3)} Mbps`,
                    name === 'rx' ? 'Download (RX)' : 'Upload (TX)',
                  ]}
                  labelFormatter={(v) => `${v}s ago`}
                />
                <Area
                  type="monotone"
                  dataKey="rx"
                  stroke="#22c55e"
                  fill={`url(#rx-grad-${vlanId})`}
                  strokeWidth={2}
                  dot={false}
                  animationDuration={300}
                />
                <Area
                  type="monotone"
                  dataKey="tx"
                  stroke="#818cf8"
                  fill={`url(#tx-grad-${vlanId})`}
                  strokeWidth={2}
                  strokeDasharray="5 3"
                  dot={false}
                  animationDuration={300}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[200px] text-surface-500 text-sm">
              Esperando datos de tráfico...
            </div>
          )}
        </div>
      )}
    </div>
  );
}
