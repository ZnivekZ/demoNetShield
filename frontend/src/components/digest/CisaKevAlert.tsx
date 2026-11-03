/**
 * CisaKevAlert.tsx
 * Banner showing CISA KEV cross-reference results:
 *   - Green "clean" banner if no matches
 *   - Red urgent alert if there are matches, with expandable CVE list
 */
import React, { useState } from 'react';
import type { CisaKevMatch } from '../../types';

interface Props {
  matches: CisaKevMatch[];
  totalChecked: number;
  lastUpdated?: string;
}

export const CisaKevAlert: React.FC<Props> = ({ matches, totalChecked, lastUpdated }) => {
  const [expanded, setExpanded] = useState(false);
  const hasMatches = matches && matches.length > 0;

  const updatedDate = lastUpdated
    ? new Date(lastUpdated).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : null;

  if (!hasMatches) {
    return (
      <div style={{
        background: 'linear-gradient(135deg, #052e16 0%, #14532d22 100%)',
        border: '1px solid #22c55e44',
        borderRadius: 12,
        padding: '16px 22px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 26 }}>✅</span>
          <div>
            <p style={{ color: '#22c55e', fontWeight: 700, fontSize: 15 }}>
              Inventario limpio — sin coincidencias CISA KEV
            </p>
            <p style={{ color: '#4ade80', fontSize: 12, marginTop: 2 }}>
              {totalChecked.toLocaleString()} vulnerabilidades verificadas contra el catálogo CISA KEV
            </p>
          </div>
        </div>
        {updatedDate && (
          <span style={{ color: '#16a34a', fontSize: 12 }}>
            Catálogo actualizado: {updatedDate}
          </span>
        )}
      </div>
    );
  }

  return (
    <div style={{
      background: 'linear-gradient(135deg, #450a0a 0%, #7f1d1d22 100%)',
      border: '2px solid #ef444488',
      borderRadius: 12,
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div
        style={{
          padding: '16px 22px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
          flexWrap: 'wrap',
          gap: 12,
        }}
        onClick={() => setExpanded(e => !e)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{
            fontSize: 26,
            animation: 'kev-pulse 1.5s ease-in-out infinite',
          }}>🚨</span>
          <div>
            <p style={{ color: '#ef4444', fontWeight: 800, fontSize: 16 }}>
              ¡ALERTA CRÍTICA! {matches.length} CVE{matches.length > 1 ? 's' : ''} del catálogo CISA KEV
              {matches.length > 1 ? ' afectan' : ' afecta'} tu inventario
            </p>
            <p style={{ color: '#fca5a5', fontSize: 12, marginTop: 2 }}>
              Estas vulnerabilidades son activamente explotadas en entornos reales. Acción urgente requerida.
            </p>
          </div>
        </div>
        <button style={{
          background: '#ef444422', color: '#ef4444',
          border: '1px solid #ef444444',
          borderRadius: 8, padding: '6px 14px',
          cursor: 'pointer', fontSize: 13, fontWeight: 600,
        }}>
          {expanded ? 'Ocultar ▲' : 'Ver detalles ▼'}
        </button>
      </div>

      {/* Expandable CVE list */}
      {expanded && (
        <div style={{ borderTop: '1px solid #ef444433', padding: '16px 22px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {matches.map((m, i) => (
              <div key={i} style={{
                background: '#ef444410',
                border: '1px solid #ef444433',
                borderRadius: 8,
                padding: '12px 16px',
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                  <div>
                    <span style={{ color: '#ef4444', fontWeight: 800, fontSize: 14 }}>{m.cve_id}</span>
                    <span style={{ color: '#94a3b8', fontSize: 13, marginLeft: 10 }}>
                      {m.vendor} / {m.product}
                    </span>
                  </div>
                  {m.due_date && (
                    <span style={{
                      background: '#ef444422', color: '#fca5a5',
                      borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 600,
                    }}>
                      Vence: {m.due_date}
                    </span>
                  )}
                </div>
                <p style={{ color: '#fca5a5', fontSize: 13, marginTop: 6 }}>{m.vulnerability_name}</p>
                {m.matched_agents?.length > 0 && (
                  <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ color: '#64748b', fontSize: 12 }}>Agentes afectados:</span>
                    {m.matched_agents.map((ag, j) => (
                      <span key={j} style={{
                        background: '#ef444418', color: '#fca5a5',
                        border: '1px solid #ef444433',
                        borderRadius: 4, padding: '1px 6px', fontSize: 12,
                      }}>
                        {ag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <style>{`
        @keyframes kev-pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.1); }
        }
      `}</style>
    </div>
  );
};
