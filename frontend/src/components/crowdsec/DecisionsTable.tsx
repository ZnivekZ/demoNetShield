/**
 * DecisionsTable — Main table for CrowdSec active decisions.
 * Click a row → opens IpContextPanel slide-over.
 * "Desbloquear" → ConfirmModal.
 */
import { useState } from 'react';
import { ShieldOff, ChevronDown, ChevronUp } from 'lucide-react';
import type { CrowdSecDecision } from '../../types';
import { CommunityScoreBadge } from './CommunityScoreBadge';
import { formatDistanceToNow } from '../utils/time';

interface Props {
  decisions: CrowdSecDecision[];
  isLoading: boolean;
  onRowClick: (ip: string) => void;
  onUnblock: (id: string, ip: string) => void;
}

const ORIGIN_BADGE: Record<string, string> = {
  crowdsec: 'badge-primary',
  cscli: 'badge-warning',
  console: 'badge-info',
};

export function DecisionsTable({ decisions, isLoading, onRowClick, onUnblock }: Props) {
  const [sortField, setSortField] = useState<'community_score' | 'expires_at'>('community_score');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [filterScenario, setFilterScenario] = useState('');
  const [filterType, setFilterType] = useState('');

  const toggleSort = (field: typeof sortField) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('desc'); }
  };

  const scenarios = [...new Set(decisions.map(d => d.scenario))];

  const filtered = decisions
    .filter(d => !filterScenario || d.scenario === filterScenario)
    .filter(d => !filterType || d.type === filterType)
    .sort((a, b) => {
      const mult = sortDir === 'asc' ? 1 : -1;
      if (sortField === 'community_score') return mult * (a.community_score - b.community_score);
      return mult * (new Date(a.expires_at).getTime() - new Date(b.expires_at).getTime());
    });

  const SortIcon = ({ field }: { field: string }) =>
    sortField === field
      ? sortDir === 'desc' ? <ChevronDown size={12} /> : <ChevronUp size={12} />
      : null;

  return (
    <div className="glass-card" style={{ padding: '1rem 1.25rem' }}>
      {/* Filters */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <h3 style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--color-surface-100)', margin: 0, flex: 1 }}>
          Decisiones activas
          <span className="badge badge-primary" style={{ marginLeft: '0.5rem', fontSize: '0.6rem' }}>
            {filtered.length}
          </span>
        </h3>
        <select
          className="btn btn-ghost"
          style={{ fontSize: '0.72rem', padding: '0.25rem 0.5rem' }}
          value={filterScenario}
          onChange={e => setFilterScenario(e.target.value)}
        >
          <option value="">Todos los scenarios</option>
          {scenarios.map(s => <option key={s} value={s}>{s.split('/')[1] ?? s}</option>)}
        </select>
        <select
          className="btn btn-ghost"
          style={{ fontSize: '0.72rem', padding: '0.25rem 0.5rem' }}
          value={filterType}
          onChange={e => setFilterType(e.target.value)}
        >
          <option value="">Todos los tipos</option>
          <option value="ban">ban</option>
          <option value="captcha">captcha</option>
        </select>
      </div>

      {isLoading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
          <span className="loading-spinner" />
        </div>
      )}

      {!isLoading && (
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table" style={{ fontSize: '0.75rem' }}>
            <thead>
              <tr>
                <th>IP</th>
                <th>Scenario</th>
                <th>Tipo</th>
                <th>País</th>
                <th>Origen</th>
                <th
                  style={{ cursor: 'pointer', userSelect: 'none' }}
                  onClick={() => toggleSort('community_score')}
                >
                  Score <SortIcon field="community_score" />
                </th>
                <th
                  style={{ cursor: 'pointer', userSelect: 'none' }}
                  onClick={() => toggleSort('expires_at')}
                >
                  Expira <SortIcon field="expires_at" />
                </th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', color: 'var(--color-surface-500)', padding: '1.5rem' }}>
                    Sin decisiones activas
                  </td>
                </tr>
              )}
              {filtered.map(d => (
                <tr
                  key={d.id}
                  style={{ cursor: 'pointer' }}
                  onClick={() => onRowClick(d.ip)}
                >
                  <td>
                    <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-brand-300)' }}>
                      {d.ip}
                    </span>
                    {d.is_known_attacker && (
                      <span className="badge badge-danger" style={{ marginLeft: '0.3rem', fontSize: '0.55rem' }}>
                        conocido
                      </span>
                    )}
                  </td>
                  <td style={{ color: 'var(--color-surface-300)', maxWidth: 160 }}>
                    <span title={d.scenario} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
                      {d.scenario.split('/')[1] ?? d.scenario}
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${d.type === 'ban' ? 'badge-danger' : 'badge-warning'}`} style={{ fontSize: '0.6rem' }}>
                      {d.type}
                    </span>
                  </td>
                  <td style={{ color: 'var(--color-surface-400)', fontSize: '0.7rem' }}>
                    {d.country}
                  </td>
                  <td>
                    <span className={`badge ${ORIGIN_BADGE[d.origin] ?? 'badge-success'}`} style={{ fontSize: '0.6rem' }}>
                      {d.origin}
                    </span>
                  </td>
                  <td style={{ width: 90 }}>
                    <CommunityScoreBadge score={d.community_score} compact />
                  </td>
                  <td style={{ color: 'var(--color-surface-400)', fontSize: '0.68rem' }}>
                    {formatDistanceToNow(d.expires_at)}
                  </td>
                  <td>
                    <button
                      className="btn btn-ghost"
                      style={{ fontSize: '0.68rem', padding: '0.2rem 0.4rem', color: 'var(--color-danger)' }}
                      onClick={e => { e.stopPropagation(); onUnblock(d.id, d.ip); }}
                      title="Desbloquear"
                    >
                      <ShieldOff size={12} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
