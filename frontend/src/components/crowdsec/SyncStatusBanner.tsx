/**
 * SyncStatusBanner — amber alert banner shown when CrowdSec and MikroTik are out of sync.
 * Shows count of desynchronized IPs and the "Sincronizar" action button.
 */
import { AlertTriangle, RefreshCw, X } from 'lucide-react';
import type { CrowdSecSyncStatus, SyncApplyRequest } from '../../types';

interface Props {
  syncStatus: CrowdSecSyncStatus;
  onApplySync: (data: SyncApplyRequest) => void;
  isSyncing: boolean;
  onDismiss?: () => void;
}

export function SyncStatusBanner({ syncStatus, onApplySync, isSyncing, onDismiss }: Props) {
  if (syncStatus.in_sync) return null;

  const desyncCount = syncStatus.only_in_crowdsec.length + syncStatus.only_in_mikrotik.length;

  return (
    <div
      style={{
        background: 'linear-gradient(135deg, rgba(245,158,11,0.15), rgba(245,158,11,0.08))',
        border: '1px solid rgba(245,158,11,0.35)',
        borderRadius: 10,
        padding: '0.75rem 1rem',
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        marginBottom: '1rem',
      }}
    >
      <AlertTriangle size={16} style={{ color: 'var(--color-warning)', flexShrink: 0 }} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-warning)', margin: 0 }}>
          Desincronización detectada — {desyncCount} IP{desyncCount !== 1 ? 's' : ''} fuera de sync
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginTop: '0.3rem' }}>
          {syncStatus.only_in_crowdsec.slice(0, 5).map(ip => (
            <span
              key={ip}
              style={{
                fontSize: '0.65rem',
                fontFamily: 'var(--font-mono)',
                background: 'rgba(245,158,11,0.2)',
                color: 'var(--color-warning)',
                padding: '0.1rem 0.4rem',
                borderRadius: 4,
              }}
            >
              {ip} (solo CrowdSec)
            </span>
          ))}
          {syncStatus.only_in_crowdsec.length > 5 && (
            <span style={{ fontSize: '0.65rem', color: 'var(--color-surface-400)' }}>
              +{syncStatus.only_in_crowdsec.length - 5} más
            </span>
          )}
        </div>
      </div>

      <button
        className="btn"
        disabled={isSyncing}
        onClick={() =>
          onApplySync({
            add_to_mikrotik: syncStatus.only_in_crowdsec,
            remove_from_mikrotik: [],
          })
        }
        style={{
          fontSize: '0.75rem',
          background: 'linear-gradient(135deg, #b45309, #d97706)',
          color: '#fff',
          flexShrink: 0,
        }}
      >
        {isSyncing ? (
          <span className="loading-spinner" style={{ width: 14, height: 14 }} />
        ) : (
          <>
            <RefreshCw size={13} />
            Sincronizar ahora
          </>
        )}
      </button>

      {onDismiss && (
        <button
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-surface-400)', flexShrink: 0 }}
          onClick={onDismiss}
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}
