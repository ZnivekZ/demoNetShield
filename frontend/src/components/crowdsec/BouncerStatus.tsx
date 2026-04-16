/**
 * BouncerStatus — Cards showing registered CrowdSec bouncers and their status.
 */
import { CheckCircle, XCircle, Globe, Flame } from 'lucide-react';
import type { CrowdSecBouncer } from '../../types';
import { formatDistanceToNow } from '../utils/time';

interface Props {
  bouncers: CrowdSecBouncer[];
}

const TYPE_ICON = {
  firewall: Flame,
  web: Globe,
};

export function BouncerStatus({ bouncers }: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {bouncers.length === 0 && (
        <p style={{ fontSize: '0.75rem', color: 'var(--color-surface-500)', textAlign: 'center', padding: '1rem' }}>
          No hay bouncers registrados
        </p>
      )}
      {bouncers.map(b => {
        const Icon = TYPE_ICON[b.type as keyof typeof TYPE_ICON] ?? Globe;
        const connected = b.status === 'connected';
        return (
          <div
            key={b.name}
            className="glass-card"
            style={{
              padding: '0.75rem 1rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              borderLeft: `3px solid ${connected ? 'var(--color-success)' : 'var(--color-danger)'}`,
            }}
          >
            <Icon size={16} style={{ color: connected ? 'var(--color-success)' : 'var(--color-danger)', flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', fontWeight: 600, color: 'var(--color-surface-100)', margin: 0 }}>
                {b.name}
              </p>
              <p style={{ fontSize: '0.65rem', color: 'var(--color-surface-400)', margin: '0.1rem 0 0' }}>
                {b.type} · {b.version} · Último pull: {formatDistanceToNow(b.last_pull)}
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexShrink: 0 }}>
              {connected
                ? <CheckCircle size={14} style={{ color: 'var(--color-success)' }} />
                : <XCircle size={14} style={{ color: 'var(--color-danger)' }} />}
              <span
                style={{
                  fontSize: '0.65rem',
                  fontWeight: 600,
                  color: connected ? 'var(--color-success)' : 'var(--color-danger)',
                }}
              >
                {connected ? 'Conectado' : 'Desconectado'}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
