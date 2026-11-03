/**
 * DigestDatePicker.tsx
 * Compact date picker + history list to browse past digests.
 * Styled with NetShield glass-card system.
 */
import React from 'react';
import { CalendarDays, Zap } from 'lucide-react';
import type { DigestHistoryItem } from '../../types';

interface Props {
  history: DigestHistoryItem[];
  selectedDate: string | null;
  onSelectDate: (date: string | null) => void;   // null = show latest
  isLoading?: boolean;
}

const RISK_COLORS: Record<string, string> = {
  green:  '#22c55e',
  yellow: '#eab308',
  orange: '#f97316',
  red:    '#ef4444',
};
const RISK_EMOJI: Record<string, string> = {
  green: '🟢', yellow: '🟡', orange: '🟠', red: '🔴',
};

function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('es-AR', {
    weekday: 'short', day: '2-digit', month: 'short',
  });
}

export const DigestDatePicker: React.FC<Props> = ({
  history = [], selectedDate, onSelectDate, isLoading,
}) => {
  const safeHistory = Array.isArray(history)
    ? history
    : (Array.isArray((history as any)?.data) ? (history as any).data : []);

  return (
    <div className="glass-card overflow-hidden" style={{ minWidth: 210 }}>
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-surface-800/60 bg-surface-900/50">
        <CalendarDays className="w-3.5 h-3.5 text-surface-500" />
        <p className="text-xs font-semibold text-surface-400 uppercase tracking-wider">
          Historial
        </p>
      </div>

      {/* Latest option */}
      <button
        onClick={() => onSelectDate(null)}
        className="w-full flex items-center gap-2.5 px-4 py-3 text-left text-sm transition-colors border-b border-surface-800/40"
        style={{
          background: selectedDate === null ? 'rgba(99,102,241,0.08)' : 'transparent',
          borderLeft: selectedDate === null ? '3px solid #6366f1' : '3px solid transparent',
          color: selectedDate === null ? '#818cf8' : 'var(--text-secondary, #a3a3a3)',
          fontWeight: selectedDate === null ? 700 : 400,
        }}
      >
        <Zap className="w-3.5 h-3.5 flex-shrink-0" />
        <span>Último disponible</span>
      </button>

      {/* History list */}
      <div style={{ maxHeight: 380, overflowY: 'auto' }}>
        {isLoading && (
          <div className="px-4 py-5 text-center text-xs text-surface-500">
            Cargando historial…
          </div>
        )}
        {!isLoading && safeHistory.length === 0 && (
          <div className="px-4 py-5 text-center text-xs text-surface-500">
            Sin historial generado
          </div>
        )}
        {safeHistory.map(item => {
          const isSelected = selectedDate === item.date;
          const color = RISK_COLORS[item.risk_level] ?? '#64748b';
          return (
            <button
              key={item.date}
              onClick={() => onSelectDate(item.date)}
              className="w-full px-4 py-2.5 text-left text-sm transition-colors border-b border-surface-800/30"
              style={{
                background: isSelected ? `${color}12` : 'transparent',
                borderLeft: isSelected ? `3px solid ${color}` : '3px solid transparent',
              }}
              onMouseEnter={e => {
                if (!isSelected)
                  (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.03)';
              }}
              onMouseLeave={e => {
                if (!isSelected)
                  (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
              }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p
                    className="text-xs"
                    style={{
                      color: isSelected ? '#f1f5f9' : '#cbd5e1',
                      fontWeight: isSelected ? 700 : 400,
                    }}
                  >
                    {RISK_EMOJI[item.risk_level]} {formatDate(item.date)}
                  </p>
                  {item.alerts_today !== undefined && (
                    <p className="text-[10px] text-surface-500 mt-0.5">
                      {item.alerts_today} alertas · score {item.risk_score}
                    </p>
                  )}
                </div>
                <span
                  style={{
                    width: 7, height: 7, borderRadius: '50%',
                    background: color, flexShrink: 0,
                    boxShadow: isSelected ? `0 0 6px ${color}` : 'none',
                  }}
                />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
