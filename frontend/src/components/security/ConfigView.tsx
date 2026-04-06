/**
 * ConfigView — Security configuration page (route: /security/config).
 * Manages: manual blacklist, geo-block ranges, DNS sinkhole entries.
 */
import { useState } from 'react';
import { Shield, Globe, Fish, Plus, Trash2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { mikrotikApi } from '../../services/api';
import { useSinkholes, useSinkholeDomain, useRemoveSinkhole } from '../../hooks/usePhishing';
import { useBlockIP, useGeoBlock } from '../../hooks/useSecurityActions';
import { ConfirmModal } from '../common/ConfirmModal';
import type { SecurityBlockIPRequest, GeoBlockRequest } from '../../types';

export function ConfigView() {
  // ── State ──────────────────────────────────────────────────────
  const [blockIP, setBlockIP] = useState('');
  const [blockReason, setBlockReason] = useState('');
  const [blockDuration, setBlockDuration] = useState(24);

  const [geoCountry, setGeoCountry] = useState('');
  const [geoRanges, setGeoRanges] = useState('');
  const [geoDuration, setGeoDuration] = useState(24);

  const [sinkholeInput, setSinkholeInput] = useState('');
  const [sinkholeReason, setSinkholeReason] = useState('');

  const [confirm, setConfirm] = useState<{
    open: boolean;
    type: 'block' | 'geo' | 'sinkhole' | 'removeSinkhole';
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

  const { data: sinkholes = [] } = useSinkholes();

  // ── Mutations ──────────────────────────────────────────────────
  const blockIPMutation = useBlockIP();
  const geoBlockMutation = useGeoBlock();
  const sinkholeMutation = useSinkholeDomain();
  const removeSinkholeMutation = useRemoveSinkhole();

  // ── Confirm Dispatch ──────────────────────────────────────────
  const handleConfirmAction = async () => {
    if (!confirm) return;
    try {
      if (confirm.type === 'block') {
        await blockIPMutation.mutateAsync(confirm.payload as SecurityBlockIPRequest);
        setBlockIP(''); setBlockReason('');
        refetchBlacklist();
      } else if (confirm.type === 'geo') {
        await geoBlockMutation.mutateAsync(confirm.payload as GeoBlockRequest);
        setGeoCountry(''); setGeoRanges('');
      } else if (confirm.type === 'sinkhole') {
        const { domain, reason } = confirm.payload as { domain: string; reason: string };
        await sinkholeMutation.mutateAsync({ domain, reason });
        setSinkholeInput(''); setSinkholeReason('');
      } else if (confirm.type === 'removeSinkhole') {
        await removeSinkholeMutation.mutateAsync(confirm.payload as string);
      }
    } catch {
      // Error handled by mutation
    } finally {
      setConfirm(null);
    }
  };

  const isLoading = blockIPMutation.isPending || geoBlockMutation.isPending ||
    sinkholeMutation.isPending || removeSinkholeMutation.isPending;

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

      {/* ── Geo Block ── */}
      <section className="glass-card" style={{ padding: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
          <Globe size={16} style={{ color: 'var(--color-brand-400)' }} />
          <h3 style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--color-surface-100)' }}>Geo-Blocking</h3>
        </div>
        {/* Production TODO note */}
        <p style={{ fontSize: '0.75rem', color: 'var(--color-surface-500)', marginBottom: '1rem', padding: '0.5rem 0.75rem', background: 'rgba(99,102,241,0.08)', borderRadius: 8, borderLeft: '3px solid var(--color-brand-600)' }}>
          <strong>Lab mode:</strong> Ingresá los rangos IP manualmente en CIDR (ej: 203.0.113.0/24).
          En producción, integrá GeoIP (ip2location-lite o MaxMind GeoLite2) para resolver rangos por país automáticamente.
        </p>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
          <input className="input" placeholder="Código país (ej: CN, RU)" value={geoCountry}
            onChange={e => setGeoCountry(e.target.value.toUpperCase().slice(0, 2))}
            style={{ flex: '0 0 120px', textTransform: 'uppercase' }} maxLength={2} />
          <textarea
            className="input"
            placeholder="Rangos IP en CIDR, uno por línea"
            value={geoRanges}
            onChange={e => setGeoRanges(e.target.value)}
            style={{ flex: '1 1 300px', minHeight: 80 }}
          />
          <select className="input" value={geoDuration} onChange={e => setGeoDuration(Number(e.target.value))}
            style={{ width: 'auto', flex: '0 0 auto' }}>
            {[6, 12, 24, 48, 168].map(h => <option key={h} value={h}>{h}h</option>)}
          </select>
        </div>
        <button
          id="geo-block-btn"
          className="btn btn-primary"
          disabled={!geoCountry.trim() || !geoRanges.trim()}
          onClick={() => {
            const ranges = geoRanges.split('\n').map(r => r.trim()).filter(Boolean);
            setConfirm({
              open: true, type: 'geo',
              data: { País: geoCountry, Rangos: ranges.length, Duración: `${geoDuration}h` },
              payload: { country_code: geoCountry, ip_ranges: ranges, duration_hours: geoDuration },
            });
          }}
        >
          <Globe size={14} /> Aplicar Geo-Block
        </button>
      </section>

      {/* ── DNS Sinkhole ── */}
      <section className="glass-card" style={{ padding: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
          <Fish size={16} style={{ color: 'var(--color-severity-high)' }} />
          <h3 style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--color-surface-100)' }}>DNS Sinkhole</h3>
          <span className="badge badge-high">{sinkholes.length}</span>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
          <input className="input" placeholder="Dominio (ej: evil.com)" value={sinkholeInput}
            onChange={e => setSinkholeInput(e.target.value)} style={{ flex: '1 1 200px' }} />
          <input className="input" placeholder="Razón" value={sinkholeReason}
            onChange={e => setSinkholeReason(e.target.value)} style={{ flex: '2 1 200px' }} />
          <button
            id="sinkhole-add-btn"
            className="btn btn-danger"
            disabled={!sinkholeInput.trim()}
            onClick={() => setConfirm({
              open: true, type: 'sinkhole',
              data: { Dominio: sinkholeInput, Razón: sinkholeReason || 'Manual' },
              payload: { domain: sinkholeInput, reason: sinkholeReason || 'Manual' },
            })}
          >
            <Fish size={14} /> Sinkhole
          </button>
        </div>

        {sinkholes.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead><tr><th>Dominio</th><th>Resuelve a</th><th>Razón</th><th>Fecha</th><th></th></tr></thead>
              <tbody>
                {sinkholes.map(s => (
                  <tr key={s.domain}>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>{s.domain}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--color-surface-500)' }}>{s.address}</td>
                    <td style={{ color: 'var(--color-surface-400)', fontSize: '0.75rem' }}>{s.reason}</td>
                    <td style={{ color: 'var(--color-surface-500)', fontSize: '0.72rem' }}>{s.created_at.slice(0, 10)}</td>
                    <td>
                      <button
                        className="btn btn-ghost"
                        style={{ padding: '0.2rem 0.4rem', fontSize: '0.7rem' }}
                        onClick={() => setConfirm({
                          open: true, type: 'removeSinkhole',
                          data: { Dominio: s.domain },
                          payload: s.domain,
                        })}
                      >
                        <Trash2 size={11} />
                      </button>
                    </td>
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
          title={
            confirm.type === 'block' ? 'Bloquear IP' :
            confirm.type === 'geo' ? 'Aplicar Geo-Block' :
            confirm.type === 'sinkhole' ? 'Agregar DNS Sinkhole' :
            'Eliminar Sinkhole'
          }
          description={
            confirm.type === 'block' ? 'Esta IP será bloqueada en MikroTik vía address-list.' :
            confirm.type === 'geo' ? 'Los rangos IP serán añadidos a la lista Geo_Block en MikroTik.' :
            confirm.type === 'sinkhole' ? 'Este dominio será redirigido a 127.0.0.1 en el DNS de MikroTik.' :
            'Este dominio será eliminado del DNS sinkhole. El tráfico hacia él se restaurará.'
          }
          data={confirm.data}
          confirmLabel={confirm.type === 'removeSinkhole' ? 'Eliminar' : 'Confirmar'}
          variant={confirm.type === 'removeSinkhole' ? 'warning' : 'danger'}
          onConfirm={handleConfirmAction}
          onCancel={() => setConfirm(null)}
          isLoading={isLoading}
        />
      )}
    </div>
  );
}
