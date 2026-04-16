/**
 * ScenariosTable — Active detection scenarios with trend indicators.
 */
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import type { CrowdSecScenario } from '../../types';
import { formatDistanceToNow } from '../utils/time';

interface Props {
  scenarios: CrowdSecScenario[];
}

const TrendIcon = ({ trend }: { trend: string }) => {
  if (trend === 'up') return <TrendingUp size={13} style={{ color: 'var(--color-danger)' }} />;
  if (trend === 'down') return <TrendingDown size={13} style={{ color: 'var(--color-success)' }} />;
  return <Minus size={13} style={{ color: 'var(--color-surface-400)' }} />;
};

export function ScenariosTable({ scenarios }: Props) {
  return (
    <div className="glass-card" style={{ padding: '1rem 1.25rem' }}>
      <h3 style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--color-surface-100)', marginBottom: '0.75rem' }}>
        Scenarios activos
      </h3>
      <table className="data-table" style={{ fontSize: '0.75rem' }}>
        <thead>
          <tr>
            <th>Scenario</th>
            <th>Descripción</th>
            <th style={{ textAlign: 'right' }}>Alertas</th>
            <th>Última vez</th>
            <th>Tendencia</th>
          </tr>
        </thead>
        <tbody>
          {scenarios.map(s => (
            <tr key={s.name}>
              <td>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--color-brand-300)' }}>
                  {s.name.split('/')[1] ?? s.name}
                </span>
              </td>
              <td style={{ color: 'var(--color-surface-400)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                <span title={s.description}>{s.description}</span>
              </td>
              <td style={{ textAlign: 'right', fontWeight: 600, color: s.alerts_count > 10 ? 'var(--color-danger)' : 'var(--color-surface-200)' }}>
                {s.alerts_count}
              </td>
              <td style={{ color: 'var(--color-surface-400)', fontSize: '0.68rem' }}>
                {formatDistanceToNow(s.last_triggered)}
              </td>
              <td><TrendIcon trend={s.trend} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
