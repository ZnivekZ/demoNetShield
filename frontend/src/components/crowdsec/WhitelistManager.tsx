/**
 * WhitelistManager — Local whitelist CRUD interface.
 * Add IP/CIDR with reason; remove with ConfirmModal.
 */
import { useState } from 'react';
import { Plus, Trash2, ShieldCheck } from 'lucide-react';
import { useWhitelist } from '../../hooks/useIpContext';
import { ConfirmModal } from '../common/ConfirmModal';
import { formatDistanceToNow } from '../utils/time';

export function WhitelistManager() {
  const { whitelist, isLoading, addWhitelist, deleteWhitelist } = useWhitelist();
  const [ip, setIp] = useState('');
  const [reason, setReason] = useState('');
  const [pendingDelete, setPendingDelete] = useState<{ id: number; ip: string } | null>(null);

  const handleAdd = async () => {
    if (!ip.trim() || !reason.trim()) return;
    await addWhitelist.mutateAsync({ ip: ip.trim(), reason: reason.trim() });
    setIp('');
    setReason('');
  };

  return (
    <>
      <div className="glass-card" style={{ padding: '1rem 1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
          <ShieldCheck size={15} style={{ color: 'var(--color-success)' }} />
          <h3 style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--color-surface-100)', margin: 0 }}>
            Whitelist local
          </h3>
          <span className="badge badge-success" style={{ fontSize: '0.6rem', marginLeft: 'auto' }}>
            {whitelist.length} entradas
          </span>
        </div>

        {/* Add form */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
          <input
            className="search-modal__input"
            style={{ flex: 1, minWidth: 120, fontSize: '0.75rem', padding: '0.35rem 0.6rem' }}
            placeholder="IP o CIDR (ej: 192.168.1.0/24)"
            value={ip}
            onChange={e => setIp(e.target.value)}
          />
          <input
            className="search-modal__input"
            style={{ flex: 2, minWidth: 160, fontSize: '0.75rem', padding: '0.35rem 0.6rem' }}
            placeholder="Motivo (ej: servidor de monitoreo)"
            value={reason}
            onChange={e => setReason(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
          />
          <button
            className="btn btn-primary"
            style={{ fontSize: '0.72rem', flexShrink: 0 }}
            disabled={!ip.trim() || !reason.trim() || addWhitelist.isPending}
            onClick={handleAdd}
          >
            {addWhitelist.isPending
              ? <span className="loading-spinner" style={{ width: 14, height: 14 }} />
              : <><Plus size={13} /> Agregar</>}
          </button>
        </div>

        {/* Table */}
        {isLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '1.5rem' }}>
            <span className="loading-spinner" />
          </div>
        ) : whitelist.length === 0 ? (
          <p style={{ fontSize: '0.75rem', color: 'var(--color-surface-500)', textAlign: 'center', padding: '1rem' }}>
            No hay entradas en la whitelist
          </p>
        ) : (
          <table className="data-table" style={{ fontSize: '0.72rem' }}>
            <thead>
              <tr>
                <th>IP / CIDR</th>
                <th>Motivo</th>
                <th>Agregado por</th>
                <th>Hace</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {whitelist.map(entry => (
                <tr key={entry.id}>
                  <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-success)' }}>{entry.ip}</td>
                  <td style={{ color: 'var(--color-surface-300)' }}>{entry.reason}</td>
                  <td style={{ color: 'var(--color-surface-500)' }}>{entry.added_by}</td>
                  <td style={{ color: 'var(--color-surface-500)' }}>{formatDistanceToNow(entry.created_at)}</td>
                  <td>
                    <button
                      className="btn btn-ghost"
                      style={{ color: 'var(--color-danger)', fontSize: '0.65rem', padding: '0.15rem 0.35rem' }}
                      onClick={() => setPendingDelete({ id: entry.id, ip: entry.ip })}
                    >
                      <Trash2 size={11} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {pendingDelete && (
        <ConfirmModal
          title="Eliminar de whitelist"
          description="Esta IP volverá a estar sujeta a las decisiones de CrowdSec."
          data={{ IP: pendingDelete.ip }}
          confirmLabel="Eliminar"
          variant="warning"
          onConfirm={() => {
            deleteWhitelist.mutate(pendingDelete.id);
            setPendingDelete(null);
          }}
          onCancel={() => setPendingDelete(null)}
          isLoading={deleteWhitelist.isPending}
        />
      )}
    </>
  );
}
