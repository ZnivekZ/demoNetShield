/**
 * AgentDeltaTable.tsx
 * Shows "yesterday vs today" metrics for a single agent.
 * Styled with NetShield glass-card / design-system tokens.
 */
import React from 'react';
import type { DigestAgent } from '../../types';

interface Props {
  agent: DigestAgent;
}

const CATEGORY_LABELS: Record<string, string> = {
  proxy:    '🌐 Proxy',
  mail:     '✉️ Correo',
  notebook: '💻 Notebook',
  server:   '🖥️ Servidor',
};

function DeltaBadge({ val }: { val: number }) {
  if (val === 0) return <span className="text-xs text-surface-500">—</span>;
  const isPos = val > 0;
  return (
    <span
      className="text-xs font-semibold"
      style={{ color: isPos ? '#ef4444' : '#22c55e' }}
    >
      {isPos ? '↑' : '↓'} {Math.abs(val)}
    </span>
  );
}

export const AgentDeltaTable: React.FC<Props> = ({ agent }) => {
  const alertDelta = agent.alerts_today - agent.alerts_yesterday;

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
            { label: '🔔 Alertas',        yesterday: agent.alerts_yesterday, today: agent.alerts_today, delta: alertDelta },
            { label: '🐛 CVEs nuevas',    yesterday: null,                   today: agent.new_cves,     delta: null },
            { label: '📦 Paquetes nuevos',yesterday: null,                   today: agent.new_packages, delta: null },
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
                {row.delta !== null ? <DeltaBadge val={row.delta} /> : <span className="text-surface-500">—</span>}
              </td>
            </tr>
          ))}

          {/* Port changes */}
          {agent.port_changes && agent.port_changes.length > 0 && (
            <tr className="border-b border-surface-800/40">
              <td className="px-3.5 py-2.5 text-surface-200">🔌 Cambios de puertos</td>
              <td colSpan={3} className="px-3.5 py-2.5">
                <div className="flex gap-1.5 flex-wrap">
                  {agent.port_changes.map((p, j) => (
                    <span
                      key={j}
                      className="text-xs rounded px-1.5 py-px"
                      style={{
                        background: 'rgba(249,115,22,0.1)',
                        color: '#fb923c',
                        border: '1px solid rgba(249,115,22,0.2)',
                      }}
                    >
                      {p.port}/{p.protocol}
                    </span>
                  ))}
                </div>
              </td>
            </tr>
          )}

          {/* KeepAlive / Sincronización del agente */}
          <tr className="border-b border-surface-800/40">
            <td className="px-3.5 py-2.5 text-surface-200">📡 Última sincronización</td>
            <td colSpan={3} className="px-3.5 py-2.5 text-surface-400 text-xs">
              {agent.last_keep_alive
                ? new Date(agent.last_keep_alive).toLocaleString('es-AR', {
                    day: '2-digit', month: '2-digit', year: 'numeric',
                    hour: '2-digit', minute: '2-digit',
                  })
                : <span className="text-surface-500">—</span>}
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
    </div>
  );
};
