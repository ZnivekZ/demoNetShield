/**
 * TopAttackers — Top attacking IPs with cross-system correlation badges.
 * Shows whether each IP is also known in Wazuh or MikroTik.
 */
import { ShieldOff } from 'lucide-react';
import type { CrowdSecDecision } from '../../types';
import { CommunityScoreBadge } from './CommunityScoreBadge';

interface Props {
  decisions: CrowdSecDecision[];
  onBlock: (ip: string) => void;
  onRowClick: (ip: string) => void;
}

// IPs shared with existing MikroTik/Wazuh mock data
const WAZUH_IPS = new Set(['203.0.113.45', '198.51.100.22', '203.0.113.99']);
const MIKROTIK_IPS = new Set(['203.0.113.45', '198.51.100.22']);

export function TopAttackers({ decisions, onBlock, onRowClick }: Props) {
  // Deduplicate by IP and take top 10 by score
  const seen = new Set<string>();
  const top = decisions
    .filter(d => { if (seen.has(d.ip)) return false; seen.add(d.ip); return true; })
    .sort((a, b) => b.community_score - a.community_score)
    .slice(0, 10);

  return (
    <div className="glass-card" style={{ padding: '1rem 1.25rem' }}>
      <h3 style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--color-surface-100)', marginBottom: '0.75rem' }}>
        Top atacantes
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
        {top.map((d, i) => (
          <div
            key={d.ip}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.6rem',
              padding: '0.5rem 0.6rem',
              borderRadius: 8,
              background: 'rgba(255,255,255,0.03)',
              cursor: 'pointer',
              transition: 'background 0.15s',
            }}
            onClick={() => onRowClick(d.ip)}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
          >
            <span style={{ fontSize: '0.65rem', color: 'var(--color-surface-500)', width: 16, flexShrink: 0 }}>
              #{i + 1}
            </span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--color-brand-300)', flex: 1 }}>
              {d.ip}
            </span>
            <div style={{ display: 'flex', gap: '0.25rem', flexShrink: 0 }}>
              {WAZUH_IPS.has(d.ip) && (
                <span className="badge badge-danger" style={{ fontSize: '0.55rem' }}>Wazuh</span>
              )}
              {MIKROTIK_IPS.has(d.ip) && (
                <span className="badge badge-success" style={{ fontSize: '0.55rem' }}>MikroTik</span>
              )}
              <span className="badge badge-warning" style={{ fontSize: '0.55rem' }}>CrowdSec</span>
            </div>
            <div style={{ width: 60, flexShrink: 0 }}>
              <CommunityScoreBadge score={d.community_score} compact />
            </div>
            <button
              className="btn btn-ghost"
              style={{ fontSize: '0.65rem', padding: '0.15rem 0.35rem', color: 'var(--color-danger)', flexShrink: 0 }}
              onClick={e => { e.stopPropagation(); onBlock(d.ip); }}
              title="Bloquear en todas las capas"
            >
              <ShieldOff size={11} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
