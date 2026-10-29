/**
 * ConfigView — Security configuration page (route: /security/config).
 * Manages: manual blacklist (se encola en la Lista de bloqueo).
 */
import { useState } from 'react';
import { Shield, Plus } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { mikrotikApi } from '../../services/api';
import { useBlockIP } from '../../hooks/useSecurityActions';
import { ConfirmModal } from '../common/ConfirmModal';
import type { SecurityBlockIPRequest } from '../../types';

export function ConfigView() {
  // ── State ──────────────────────────────────────────────────────
  const [blockIP, setBlockIP] = useState('');
  const [blockReason, setBlockReason] = useState('');
  const [blockDuration, setBlockDuration] = useState(24);

  const [confirm, setConfirm] = useState<{
    open: boolean;
    type: 'block';
    data: Record<string, string | number>;
    payload: unknown;
  } | null>(null);

  // ── Queries ────────────────────────────────────────────────────
  const { data: blacklist = [], refetch: refetchBlacklist } = useQuery({
    queryKey: ['mikrotik', 'address-list', 'Blacklist_Automatica'],
    queryFn: () => mikrotikApi.getAddressList('Blacklist_Automatica'),
    select: r => r.data ?? [],
    refetchInterval: 30_000,
  });

  // ── Mutations ──────────────────────────────────────────────────
  const blockIPMutation = useBlockIP();

  // ── Confirm Dispatch ──────────────────────────────────────────
  const handleConfirmAction = async () => {
    if (!confirm) return;
    try {
      if (confirm.type === 'block') {
        await blockIPMutation.mutateAsync(confirm.payload as SecurityBlockIPRequest);
        setBlockIP(''); setBlockReason('');
        refetchBlacklist();
      }
    } catch {
      // Error handled by mutation
    } finally {
      setConfirm(null);
    }
  };

  const isLoading = blockIPMutation.isPending;

  return (
    <div className="animate-fade-in-up" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-surface-100)' }}>
        Configuración de Seguridad
      </h2>

      {/* ── Manual Blacklist ── */}
      <section className="glass-card" style={{ padding: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
          <Shield size={16} style={{ color: 'var(--color-danger)' }} />
          <h3 style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--color-surface-100)' }}>Bloqueo Manual de IP</h3>
          <span className="badge badge-danger">{blacklist.length}</span>
        </div>

        <p style={{ fontSize: '0.75rem', color: 'var(--color-surface-500)', marginBottom: '1rem' }}>
          La IP se agrega a la <b>Lista de bloqueo</b>; recién se aplica al router con el push manual
          (o desde el archivo <code>/blocklist.txt</code>).
        </p>

        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
          <input className="input" placeholder="IP address (e.g. 203.0.113.1)" value={blockIP}
            onChange={e => setBlockIP(e.target.value)} style={{ flex: '1 1 180px' }} />
          <input className="input" placeholder="Razón" value={blockReason}
            onChange={e => setBlockReason(e.target.value)} style={{ flex: '2 1 200px' }} />
          <select className="input" value={blockDuration} onChange={e => setBlockDuration(Number(e.target.value))}
            style={{ flex: '0 0 auto', width: 'auto' }}>
            {[1, 6, 12, 24, 48, 168].map(h => <option key={h} value={h}>{h}h</option>)}
          </select>
          <button
            id="manual-block-btn"
            className="btn btn-danger"
            disabled={!blockIP.trim()}
            onClick={() => setConfirm({
              open: true, type: 'block',
              data: { IP: blockIP, Razón: blockReason || 'Manual', Duración: `${blockDuration}h` },
              payload: { ip: blockIP, reason: blockReason || 'Manual', duration_hours: blockDuration, source: 'manual' },
            })}
          >
            <Plus size={14} /> Bloquear
          </button>
        </div>

        {blacklist.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead><tr><th>IP</th><th>Lista</th><th>Timeout</th><th>Comentario</th></tr></thead>
              <tbody>
                {blacklist.map(e => (
                  <tr key={e.id}>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>{e.address}</td>
                    <td><span className="badge badge-danger">{e.list}</span></td>
                    <td style={{ color: 'var(--color-surface-500)', fontSize: '0.75rem' }}>{e.timeout || 'Permanente'}</td>
                    <td style={{ color: 'var(--color-surface-400)', fontSize: '0.75rem' }}>{e.comment}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Confirm Modal */}
      {confirm?.open && (
        <ConfirmModal
          title="Bloquear IP"
          description="La IP se agrega a la Lista de bloqueo. Se aplica al MikroTik con el push manual."
          data={confirm.data}
          confirmLabel="Confirmar"
          variant="danger"
          onConfirm={handleConfirmAction}
          onCancel={() => setConfirm(null)}
          isLoading={isLoading}
        />
      )}
    </div>
  );
}
