/**
 * TransientIncidents.tsx
 * Timeline of short-lived agent disconnect/reconnect events within the 24h period.
 * Styled with NetShield glass-card system.
 */
import React from 'react';
import { CheckCircle2, Zap } from 'lucide-react';

interface Incident {
  agent: string;
  type: string;
  disconnected_at?: string;
  reconnected_at?: string;
  duration_seconds?: number;
}

interface Props {
  incidents: Incident[];
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return `${m}m ${s > 0 ? s + 's' : ''}`.trim();
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return `${h}h ${rm > 0 ? rm + 'm' : ''}`.trim();
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}

export const TransientIncidents: React.FC<Props> = ({ incidents }) => {
  if (!incidents || incidents.length === 0) {
    return (
      <div
        className="glass-card flex items-center gap-3 px-5 py-4"
        style={{ border: '1px solid rgba(34,197,94,0.2)' }}
      >
        <CheckCircle2 className="w-5 h-5 text-success flex-shrink-0" />
        <div>
          <p className="text-sm font-semibold text-success">Sin incidentes transitorios</p>
          <p className="text-xs text-surface-500 mt-0.5">
            Ningún agente tuvo desconexiones en las últimas 24h
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="glass-card overflow-hidden"
      style={{ border: '1px solid rgba(249,115,22,0.2)' }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-5 py-3.5 border-b border-surface-800/60 bg-surface-900/40">
        <Zap className="w-4 h-4 text-orange-400" />
        <p className="text-sm font-semibold text-surface-100">Incidentes transitorios</p>
        <span
          className="ml-auto text-xs font-semibold rounded-full px-2 py-0.5"
          style={{
            background: 'rgba(249,115,22,0.12)',
            color: '#fb923c',
            border: '1px solid rgba(249,115,22,0.25)',
          }}
        >
          {incidents.length}
        </span>
      </div>

      {/* Timeline */}
      <div className="px-5 py-4 flex flex-col gap-0">
        {incidents.map((inc, i) => (
          <div key={i} className="flex gap-4 relative">
            {/* Timeline spine */}
            <div className="flex flex-col items-center w-5 flex-shrink-0">
              <div
                className="w-3 h-3 rounded-full mt-1 flex-shrink-0"
                style={{
                  background: '#f97316',
                  border: '2px solid #fb923c',
                  boxShadow: '0 0 8px rgba(249,115,22,0.5)',
                }}
              />
              {i < incidents.length - 1 && (
                <div
                  className="flex-1 w-px my-1"
                  style={{ background: 'rgba(249,115,22,0.2)' }}
                />
              )}
            </div>

            {/* Card */}
            <div
              className="flex-1 rounded-lg px-3.5 py-2.5 mb-2.5"
              style={{
                background: 'rgba(249,115,22,0.05)',
                border: '1px solid rgba(249,115,22,0.15)',
              }}
            >
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="text-sm font-semibold text-orange-300">{inc.agent}</span>
                {inc.duration_seconds !== undefined && (
                  <span
                    className="text-xs font-semibold rounded px-2 py-0.5"
                    style={{
                      background: 'rgba(249,115,22,0.12)',
                      color: '#fdba74',
                    }}
                  >
                    Duración: {formatDuration(inc.duration_seconds)}
                  </span>
                )}
              </div>
              <div className="mt-1.5 flex gap-4 flex-wrap">
                {inc.disconnected_at && (
                  <span className="text-xs text-surface-400">
                    🔴 Desconectado: <strong className="text-surface-200">{formatTime(inc.disconnected_at)}</strong>
                  </span>
                )}
                {inc.reconnected_at && (
                  <span className="text-xs text-surface-400">
                    🟢 Reconectado: <strong className="text-surface-200">{formatTime(inc.reconnected_at)}</strong>
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
