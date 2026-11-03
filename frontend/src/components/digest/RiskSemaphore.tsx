/**
 * RiskSemaphore.tsx
 * Traffic-light risk indicator showing the digest's overall risk level,
 * a 0-100 score, and a plain-language reasoning string.
 * Styled with NetShield glass-card system: discreet status dot without excessive luminosity.
 */
import React from 'react';
import type { DigestRiskLevel } from '../../types';

interface Props {
  level: DigestRiskLevel;
  score: number;
  reasoning: string;
  generatedAt?: string;
  isMock?: boolean;
}

const CONFIG: Record<DigestRiskLevel, { color: string; label: string }> = {
  green:  { color: '#22c55e', label: 'POSTURA SALUDABLE' },
  yellow: { color: '#eab308', label: 'ATENCIÓN RECOMENDADA' },
  orange: { color: '#f97316', label: 'RIESGO ELEVADO' },
  red:    { color: '#ef4444', label: 'ACCIÓN INMEDIATA REQUERIDA' },
};

export const RiskSemaphore: React.FC<Props> = ({ level, score, reasoning, generatedAt, isMock }) => {
  const cfg = CONFIG[level] ?? CONFIG.green;

  const formattedDate = generatedAt
    ? new Date(generatedAt).toLocaleString('es-AR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })
    : null;

  return (
    <div
      className="glass-card flex items-center gap-6 relative overflow-hidden"
      style={{
        padding: '24px 28px',
        border: '1px solid var(--border-default, #1f1f1f)',
      }}
    >
      {/* Gauge / Semaphore indicator */}
      <div style={{ position: 'relative', width: 72, height: 72, flexShrink: 0 }}>
        {/* Score ring */}
        <svg width={72} height={72} style={{ position: 'absolute', top: 0, left: 0 }}>
          <circle
            cx={36} cy={36} r={31}
            fill="none"
            stroke="rgba(255, 255, 255, 0.06)"
            strokeWidth={3}
          />
          <circle
            cx={36} cy={36} r={31}
            fill="none"
            stroke={cfg.color}
            strokeWidth={3}
            strokeDasharray={`${2 * Math.PI * 31}`}
            strokeDashoffset={`${2 * Math.PI * 31 * (1 - score / 100)}`}
            strokeLinecap="round"
            style={{
              transform: 'rotate(-90deg)',
              transformOrigin: '36px 36px',
              transition: 'stroke-dashoffset 0.8s ease',
            }}
          />
        </svg>

        {/* Inner dial with discreet status dot */}
        <div
          style={{
            position: 'absolute',
            top: 7, left: 7,
            width: 58, height: 58,
            borderRadius: '50%',
            background: 'var(--bg-secondary, #0a0a0a)',
            border: '1px solid var(--border-default, #1f1f1f)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {/* Discreet status dot without excessive luminosity */}
          <div
            style={{
              width: 14,
              height: 14,
              borderRadius: '50%',
              background: cfg.color,
              boxShadow: `0 0 8px ${cfg.color}50`,
            }}
          />
        </div>
      </div>

      {/* Text block */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="flex items-baseline gap-3 flex-wrap">
          <span className="text-3xl font-extrabold" style={{ color: cfg.color, letterSpacing: -0.5 }}>
            {score}
            <span className="text-sm font-medium text-surface-400 ml-1">/100</span>
          </span>
          <span
            className="text-xs font-bold tracking-widest rounded px-2.5 py-0.5"
            style={{
              background: `${cfg.color}15`,
              color: cfg.color,
              border: `1px solid ${cfg.color}30`,
            }}
          >
            {cfg.label}
          </span>
          {isMock && (
            <span
              className="text-xs font-semibold rounded px-2 py-0.5"
              style={{
                background: '#f9731622', color: '#fb923c',
                border: '1px solid #f9731644',
              }}
            >
              📋 SIMULACIÓN
            </span>
          )}
        </div>

        <p className="mt-2.5 text-sm text-surface-200 leading-relaxed" style={{ maxWidth: 620 }}>
          {reasoning}
        </p>

        {formattedDate && (
          <p className="mt-2 text-xs text-surface-500">
            Generado: {formattedDate}
          </p>
        )}
      </div>
    </div>
  );
};
