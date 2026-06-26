import { useState, useEffect } from 'react';
import {
  useDhcpServers, useDhcpLeases, useDhcpNetworks,
  useDhcpPools, useDhcpSubnetUsage, useDhcpRogueAlerts, useDhcpOptions,
  useDeleteDhcpLease, useMakeDhcpLeaseStatic, useSetDhcpLeaseBlock,
  useToggleDhcpServer, useCreateDhcpServer,
  useCreateDhcpLease, useUpdateDhcpLease,
  useCreateDhcpNetwork, useUpdateDhcpNetwork,
  useCreateDhcpPool, useUpdateDhcpPool,
  useCreateDhcpRogueAlert,
  useCreateDhcpOption,
  // Fase 2
  useDhcpDiscovery, useDhcpGlpiCorrelation, useDhcpWazuhEnriched,
  useBlockRogueDhcp, useCreateDiscoveryTicket,
} from '../../hooks/useDhcp';
import { useInterfaces } from '../../hooks/useMikrotikHealth';
import { mikrotikApi } from '../../services/api';
import { useMutation } from '@tanstack/react-query';
import type {
  DhcpLease, DhcpServer, DhcpSubnetUsage, DhcpNetwork, DhcpPool,
  DhcpDiscoveryDevice, DhcpLeaseGlpiCorrelation, DhcpEnrichedAlert,
} from '../../types';

type Tab = 'leases' | 'servers' | 'pools' | 'networks' | 'alerts' | 'options'
         | 'discovery' | 'correlation';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'leases',      label: 'Leases',        icon: '📋' },
  { id: 'servers',     label: 'Servidores',     icon: '🖥️' },
  { id: 'pools',       label: 'Pools / Uso',    icon: '📊' },
  { id: 'networks',    label: 'Redes',          icon: '🌐' },
  { id: 'alerts',      label: 'Rogues',         icon: '⚠️' },
  { id: 'options',     label: 'Opciones DHCP',  icon: '⚙️' },
  { id: 'discovery',   label: 'Descubrimiento', icon: '🔍' },
  { id: 'correlation', label: 'GLPI',           icon: '🔗' },
];

// ── Shared helpers ─────────────────────────────────────────────────────────────

function UsageBar({ pct }: { pct: number }) {
  const color = pct >= 90 ? 'var(--color-danger)' : pct >= 70 ? 'var(--color-warning, #f59e0b)' : 'var(--color-success)';
  return (
    <div style={{ background: 'var(--color-surface-2)', borderRadius: 4, height: 8, width: '100%', overflow: 'hidden' }}>
      <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', background: color, borderRadius: 4, transition: 'width .4s' }} />
    </div>
  );
}

/** Reutilizable: campo de formulario con label */
function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
        {label}{required && ' *'}
      </label>
      {children}
    </div>
  );
}

/** Reutilizable: muestra errores de formulario */
function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div style={{ padding: '8px 12px', background: 'rgba(239,68,68,0.1)', border: '1px solid var(--color-danger)', borderRadius: 4, color: 'var(--color-danger)', fontSize: 13 }}>
      {message}
    </div>
  );
}

// ── SpeedLimitModal (S2) ─────────────────────────────────────────────────────

function SpeedLimitModal({ ip, onClose }: { ip: string; onClose: () => void }) {
  const [maxLimit, setMaxLimit] = useState('10M/10M');
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);

  const createQueue = useMutation({
    mutationFn: () => mikrotikApi.createQueue({
      name: `dhcp-limit-${ip.replace(/\./g, '-')}`,
      target: ip,
      max_limit: maxLimit,
      comment: comment || `DHCP lease: ${ip}`,
    }),
    onSuccess: (res) => {
      if (res.success) onClose();
      else setError(res.error ?? 'Error al crear la queue');
    },
    onError: (err: any) => setError(err.message ?? 'Error'),
  });

  return (
    <div className="confirm-modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="confirm-modal animate-fade-in-up" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
        <div className="confirm-modal__header">
          <h3 className="confirm-modal__title">🚦 Limitar velocidad — {ip}</h3>
          <button type="button" className="confirm-modal__close" onClick={onClose}>✕</button>
        </div>
        <form
          onSubmit={e => { e.preventDefault(); createQueue.mutate(); }}
          className="confirm-modal__body"
          style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
        >
          {error && (
            <div style={{ padding: '8px 12px', background: 'rgba(239,68,68,0.1)', border: '1px solid var(--color-danger)', borderRadius: 4, color: 'var(--color-danger)', fontSize: 13 }}>
              {error}
            </div>
          )}
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
              Límite (upload/download) *
            </label>
            <input
              className="input"
              value={maxLimit}
              onChange={e => setMaxLimit(e.target.value)}
              placeholder="10M/10M"
              required
              style={{ width: '100%' }}
            />
            <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 4 }}>
              Formato: upload/download — Ej: 5M/10M · 0/0 = sin límite
            </p>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Comentario</label>
            <input
              className="input"
              value={comment}
              onChange={e => setComment(e.target.value)}
              placeholder="Descripción del límite"
              style={{ width: '100%' }}
            />
          </div>
          <div className="confirm-modal__actions" style={{ marginTop: 4 }}>
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={createQueue.isPending}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={createQueue.isPending}>
              {createQueue.isPending ? 'Creando...' : 'Crear Queue'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Leases Tab ────────────────────────────────────────────────────────────────

interface LeaseFormModalProps {
  lease?: DhcpLease | null;
  onClose: () => void;
}

function LeaseFormModal({ lease, onClose }: LeaseFormModalProps) {
  const { data: servers = [] } = useDhcpServers();
  const createLease = useCreateDhcpLease();
  const updateLease = useUpdateDhcpLease();
  const isEdit = !!lease;

  const [address, setAddress] = useState(lease?.address ?? '');
  const [macAddress, setMacAddress] = useState(lease?.mac_address ?? '');
  const [server, setServer] = useState(lease?.server ?? '');
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (servers.length > 0 && !server) setServer(servers[0].name);
  }, [servers, server]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (isEdit && lease) {
      updateLease.mutate(
        { id: lease.id, data: { comment } },
        {
          onSuccess: (res) => { if (res.success) onClose(); else setError(res.error ?? 'Error'); },
          onError: (err: any) => setError(err.message ?? 'Error'),
        }
      );
    } else {
      if (!address || !macAddress || !server) { setError('Completa los campos obligatorios'); return; }
      createLease.mutate(
        { address, mac_address: macAddress, server, comment },
        {
          onSuccess: (res) => { if (res.success) onClose(); else setError(res.error ?? 'Error'); },
          onError: (err: any) => setError(err.message ?? 'Error'),
        }
      );
    }
  };

  const isPending = createLease.isPending || updateLease.isPending;

  return (
    <div className="confirm-modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="confirm-modal portal-form-modal animate-fade-in-up" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
        <div className="confirm-modal__header">
          <h3 className="confirm-modal__title">{isEdit ? 'Editar Lease' : 'Nueva Reserva DHCP'}</h3>
          <button type="button" className="confirm-modal__close" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="confirm-modal__body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <FormError message={error} />

          {isEdit ? (
            <>
              <div style={{ padding: '10px 14px', background: 'var(--color-surface-2)', borderRadius: 6, fontSize: 13 }}>
                <p style={{ margin: 0, color: 'var(--color-text-muted)', fontSize: 11, fontWeight: 600 }}>EDITANDO LEASE</p>
                <p style={{ margin: '4px 0 0', fontFamily: 'monospace', fontWeight: 700 }}>{lease?.address} — {lease?.mac_address}</p>
              </div>
              <Field label="Comentario">
                <input className="input" value={comment} onChange={e => setComment(e.target.value)} placeholder="Descripción del host" style={{ width: '100%' }} />
              </Field>
            </>
          ) : (
            <>
              <Field label="Dirección IP" required>
                <input className="input" value={address} onChange={e => setAddress(e.target.value)} placeholder="192.168.1.50" required style={{ width: '100%' }} />
              </Field>
              <Field label="MAC Address" required>
                <input className="input" value={macAddress} onChange={e => setMacAddress(e.target.value)} placeholder="AA:BB:CC:DD:EE:FF" required style={{ width: '100%' }} />
              </Field>
              <Field label="Servidor DHCP" required>
                <select className="input" value={server} onChange={e => setServer(e.target.value)} required style={{ width: '100%', height: 38 }}>
                  <option value="">Seleccione un servidor</option>
                  {servers.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                </select>
              </Field>
              <Field label="Comentario">
                <input className="input" value={comment} onChange={e => setComment(e.target.value)} placeholder="Descripción del host" style={{ width: '100%' }} />
              </Field>
            </>
          )}

          <div className="confirm-modal__actions" style={{ marginTop: 4 }}>
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={isPending}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={isPending}>
              {isPending ? (isEdit ? 'Guardando...' : 'Creando...') : (isEdit ? 'Guardar cambios' : 'Crear Reserva')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function LeasesTab() {
  const [search, setSearch] = useState('');
  const [serverFilter, setServerFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editLease, setEditLease] = useState<DhcpLease | null>(null);
  const [limitIp, setLimitIp] = useState<string | null>(null);

  const { data: servers = [] } = useDhcpServers();
  const { data: leases = [], isLoading } = useDhcpLeases(
    search || serverFilter ? { search: search || undefined, server: serverFilter || undefined } : undefined
  );
  const deleteLease   = useDeleteDhcpLease();
  const makeStatic    = useMakeDhcpLeaseStatic();
  const blockLease    = useSetDhcpLeaseBlock();

  const statusBadge = (l: DhcpLease) => {
    const cls = l.status === 'bound' ? 'badge-success' : l.status === 'offered' ? 'badge-medium' : 'badge-info';
    return <span className={cls} style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600 }}>{l.status}</span>;
  };

  return (
    <div className="animate-fade-in-up">
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          className="input" placeholder="Buscar IP / MAC / hostname..."
          value={search} onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: 220 }}
        />
        <select className="input" value={serverFilter} onChange={e => setServerFilter(e.target.value)} style={{ minWidth: 160 }}>
          <option value="">Todos los servidores</option>
          {servers.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
        </select>
        <button className="btn btn-primary" style={{ whiteSpace: 'nowrap' }} onClick={() => setShowModal(true)}>
          ➕ Nueva Reserva
        </button>
      </div>

      {isLoading ? (
        <div className="loading-spinner" />
      ) : (
        <div className="data-table" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                {['IP', 'MAC', 'Hostname', 'Servidor', 'Estado', 'Expira en', 'Tipo', 'Acciones'].map(h => (
                  <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 12, color: 'var(--color-text-muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {leases.map(l => (
                <tr key={l.id} style={{ borderBottom: '1px solid var(--color-border)', opacity: l.blocked ? 0.55 : 1 }}>
                  <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontSize: 13, fontWeight: 600, color: 'var(--color-primary)' }}>{l.address}</td>
                  <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontSize: 12 }}>{l.mac_address}</td>
                  <td style={{ padding: '10px 12px', fontSize: 13 }}>{l.host_name || <span style={{ color: 'var(--color-text-muted)' }}>—</span>}</td>
                  <td style={{ padding: '10px 12px', fontSize: 12 }}>{l.server}</td>
                  <td style={{ padding: '10px 12px' }}>{statusBadge(l)}</td>
                  <td style={{ padding: '10px 12px', fontSize: 12, color: 'var(--color-text-muted)' }}>{l.expires_after || '—'}</td>
                  <td style={{ padding: '10px 12px' }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: l.dynamic ? 'var(--color-text-muted)' : 'var(--color-success)' }}>
                      {l.dynamic ? 'Dinámica' : '📌 Estática'}
                    </span>
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="btn-ghost" style={{ padding: '3px 8px', fontSize: 11 }}
                        onClick={() => setEditLease(l)} title="Editar lease">✏️</button>
                      {l.dynamic && (
                        <button className="btn-ghost" style={{ padding: '3px 8px', fontSize: 11 }}
                          onClick={() => makeStatic.mutate(l.id)} title="Convertir en estática">📌</button>
                      )}
                      <button className="btn-ghost" style={{ padding: '3px 8px', fontSize: 11 }}
                        onClick={() => blockLease.mutate({ id: l.id, block: !l.blocked })}
                        title={l.blocked ? 'Desbloquear' : 'Bloquear acceso'}>
                        {l.blocked ? '🔓' : '🚫'}
                      </button>
                      <button className="btn-ghost" style={{ padding: '3px 8px', fontSize: 11 }}
                        onClick={() => setLimitIp(l.address)}
                        title="Limitar velocidad con Simple Queue">🚦</button>
                      <button className="btn-danger" style={{ padding: '3px 8px', fontSize: 11 }}
                        onClick={() => { if (confirm(`¿Eliminar lease ${l.address}?`)) deleteLease.mutate(l.id); }}
                        title="Eliminar lease">🗑</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {leases.length === 0 && (
            <p style={{ textAlign: 'center', padding: 32, color: 'var(--color-text-muted)' }}>No hay leases para mostrar</p>
          )}
        </div>
      )}
      <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 8 }}>
        {leases.length} lease{leases.length !== 1 ? 's' : ''} · Actualiza cada 30s
      </p>

      {showModal && <LeaseFormModal onClose={() => setShowModal(false)} />}
      {editLease && <LeaseFormModal lease={editLease} onClose={() => setEditLease(null)} />}
      {limitIp && <SpeedLimitModal ip={limitIp} onClose={() => setLimitIp(null)} />}
    </div>
  );
}

// ── Servers Tab ───────────────────────────────────────────────────────────────

interface ServerFormModalProps {
  onClose: () => void;
}

function ServerFormModal({ onClose }: ServerFormModalProps) {
  const { data: interfaces = [] } = useInterfaces();
  const { data: pools = [] } = useDhcpPools();
  const createServer = useCreateDhcpServer();
  const [name, setName] = useState('');
  const [iface, setIface] = useState('');
  const [pool, setPool] = useState('');
  const [leaseTime, setLeaseTime] = useState('1d');
  const [authoritative, setAuthoritative] = useState('after-2sec');
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (interfaces.length > 0 && !iface) setIface(interfaces[0].name);
  }, [interfaces, iface]);

  useEffect(() => {
    if (pools.length > 0 && !pool) setPool(pools[0].name);
  }, [pools, pool]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !iface || !pool) { setError('Por favor completa los campos obligatorios'); return; }
    createServer.mutate(
      { name, interface: iface, address_pool: pool, lease_time: leaseTime, authoritative, comment },
      {
        onSuccess: (res) => { if (res.success) onClose(); else setError(res.error || 'Error al crear el servidor'); },
        onError: (err: any) => setError(err.message || 'Error al conectar con el servidor'),
      }
    );
  };

  return (
    <div className="confirm-modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="confirm-modal portal-form-modal animate-fade-in-up" style={{ maxWidth: 500 }} onClick={e => e.stopPropagation()}>
        <div className="confirm-modal__header">
          <h3 className="confirm-modal__title">Crear Servidor DHCP</h3>
          <button type="button" className="confirm-modal__close" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="confirm-modal__body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <FormError message={error} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Field label="Nombre del Servidor" required>
              <input className="input" value={name} onChange={e => setName(e.target.value)} required placeholder="ej: dhcp-vlan10" style={{ width: '100%' }} />
            </Field>
            <Field label="Interfaz" required>
              <select className="input" value={iface} onChange={e => setIface(e.target.value)} required style={{ width: '100%', height: 38 }}>
                <option value="">Seleccione una interfaz</option>
                {interfaces.map(i => <option key={i.name} value={i.name}>{i.name} ({i.type})</option>)}
              </select>
            </Field>
            <Field label="Pool de Direcciones" required>
              <select className="input" value={pool} onChange={e => setPool(e.target.value)} required style={{ width: '100%', height: 38 }}>
                <option value="">Seleccione un pool</option>
                {pools.map(p => <option key={p.id} value={p.name}>{p.name} ({p.ranges})</option>)}
              </select>
            </Field>
            <Field label="Tiempo de Arrendamiento (Lease Time)">
              <input className="input" value={leaseTime} onChange={e => setLeaseTime(e.target.value)} placeholder="ej: 10m, 30m, 1d" style={{ width: '100%' }} />
            </Field>
            <Field label="Autoritativo">
              <select className="input" value={authoritative} onChange={e => setAuthoritative(e.target.value)} style={{ width: '100%', height: 38 }}>
                <option value="yes">yes</option>
                <option value="no">no</option>
                <option value="after-2sec">after-2sec</option>
              </select>
            </Field>
            <Field label="Comentario">
              <input className="input" value={comment} onChange={e => setComment(e.target.value)} placeholder="Nota o descripción del servidor" style={{ width: '100%' }} />
            </Field>
          </div>
          <div className="confirm-modal__actions" style={{ marginTop: 8 }}>
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={createServer.isPending}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={createServer.isPending}>
              {createServer.isPending ? 'Creando...' : 'Crear Servidor'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ServersTab() {
  const { data: servers = [], isLoading } = useDhcpServers();
  const toggle = useToggleDhcpServer();
  const [showModal, setShowModal] = useState(false);

  return (
    <div className="animate-fade-in-up">
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
          ➕ Nuevo Servidor
        </button>
      </div>

      {isLoading ? <div className="loading-spinner" /> : (
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
          {servers.map((s: DhcpServer) => (
            <div key={s.id} className="glass-card" style={{ padding: 20, borderLeft: `3px solid ${s.disabled ? 'var(--color-danger)' : 'var(--color-success)'}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{s.name}</h3>
                <span className={s.disabled ? 'badge-critical' : 'badge-success'} style={{ padding: '2px 10px', borderRadius: 4, fontSize: 11, fontWeight: 600 }}>
                  {s.disabled ? 'Deshabilitado' : 'Activo'}
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 13 }}>
                <div><span style={{ color: 'var(--color-text-muted)', fontSize: 11 }}>INTERFAZ</span><br /><strong>{s.interface}</strong></div>
                <div><span style={{ color: 'var(--color-text-muted)', fontSize: 11 }}>POOL</span><br /><strong>{s.address_pool}</strong></div>
                <div><span style={{ color: 'var(--color-text-muted)', fontSize: 11 }}>TIEMPO DE LEASE</span><br /><strong>{s.lease_time}</strong></div>
                <div><span style={{ color: 'var(--color-text-muted)', fontSize: 11 }}>AUTORITATIVO</span><br /><strong>{s.authoritative}</strong></div>
              </div>
              {s.comment && <p style={{ margin: '12px 0 0', fontSize: 12, color: 'var(--color-text-muted)', fontStyle: 'italic' }}>{s.comment}</p>}
              <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
                <button className={s.disabled ? 'btn-success' : 'btn-danger'} style={{ flex: 1, padding: '6px 12px', fontSize: 12 }}
                  onClick={() => toggle.mutate({ id: s.id, disabled: !s.disabled })}>
                  {s.disabled ? '▶ Habilitar' : '⏸ Deshabilitar'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && <ServerFormModal onClose={() => setShowModal(false)} />}
    </div>
  );
}

// ── Pools Tab ─────────────────────────────────────────────────────────────────

interface PoolFormModalProps {
  pool?: DhcpPool | null;
  onClose: () => void;
}

function PoolFormModal({ pool, onClose }: PoolFormModalProps) {
  const createPool = useCreateDhcpPool();
  const updatePool = useUpdateDhcpPool();
  const isEdit = !!pool;

  const [name, setName] = useState(pool?.name ?? '');
  const [ranges, setRanges] = useState(pool?.ranges ?? '');
  const [nextPool, setNextPool] = useState(pool?.next_pool ?? '');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (isEdit && pool) {
      updatePool.mutate(
        { id: pool.id, data: { ranges, next_pool: nextPool || undefined } },
        {
          onSuccess: (res) => { if (res.success) onClose(); else setError(res.error ?? 'Error'); },
          onError: (err: any) => setError(err.message ?? 'Error'),
        }
      );
    } else {
      if (!name || !ranges) { setError('Nombre y rango son obligatorios'); return; }
      createPool.mutate(
        { name, ranges, next_pool: nextPool || undefined },
        {
          onSuccess: (res) => { if (res.success) onClose(); else setError(res.error ?? 'Error'); },
          onError: (err: any) => setError(err.message ?? 'Error'),
        }
      );
    }
  };

  const isPending = createPool.isPending || updatePool.isPending;

  return (
    <div className="confirm-modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="confirm-modal portal-form-modal animate-fade-in-up" style={{ maxWidth: 460 }} onClick={e => e.stopPropagation()}>
        <div className="confirm-modal__header">
          <h3 className="confirm-modal__title">{isEdit ? 'Editar Pool' : 'Nuevo Pool de Direcciones'}</h3>
          <button type="button" className="confirm-modal__close" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="confirm-modal__body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <FormError message={error} />
          <Field label="Nombre del Pool" required>
            <input className="input" value={name} onChange={e => setName(e.target.value)}
              disabled={isEdit} required={!isEdit} placeholder="ej: pool-vlan10" style={{ width: '100%' }} />
          </Field>
          <Field label="Rango de IPs" required>
            <input className="input" value={ranges} onChange={e => setRanges(e.target.value)}
              required placeholder="ej: 192.168.1.100-192.168.1.200" style={{ width: '100%' }} />
          </Field>
          <Field label="Pool siguiente (opcional)">
            <input className="input" value={nextPool} onChange={e => setNextPool(e.target.value)}
              placeholder="Nombre del pool encadenado" style={{ width: '100%' }} />
          </Field>
          <div className="confirm-modal__actions" style={{ marginTop: 4 }}>
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={isPending}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={isPending}>
              {isPending ? (isEdit ? 'Guardando...' : 'Creando...') : (isEdit ? 'Guardar cambios' : 'Crear Pool')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function PoolsTab() {
  const { data: usage = [], isLoading } = useDhcpSubnetUsage();
  const { data: pools = [] } = useDhcpPools();
  const [showCreate, setShowCreate] = useState(false);
  const [editPool, setEditPool] = useState<DhcpPool | null>(null);

  return (
    <div className="animate-fade-in-up" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 700 }}>Utilización de Subredes</h3>
        {isLoading ? <div className="loading-spinner" /> : (
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
            {(usage as DhcpSubnetUsage[]).map(u => (
              <div key={u.pool_name} className="stat-card" style={{ padding: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontWeight: 700, fontSize: 14 }}>{u.pool_name}</span>
                  <span style={{ fontWeight: 700, fontSize: 18, color: u.usage_percent >= 90 ? 'var(--color-danger)' : 'var(--color-primary)' }}>
                    {u.usage_percent}%
                  </span>
                </div>
                <UsageBar pct={u.usage_percent} />
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 12, color: 'var(--color-text-muted)' }}>
                  <span>🟢 {u.used_ips} usadas</span>
                  <span>⚪ {u.free_ips} libres</span>
                  <span>Σ {u.total_ips}</span>
                </div>
                <p style={{ margin: '8px 0 0', fontSize: 11, color: 'var(--color-text-muted)', fontFamily: 'monospace' }}>{u.ranges}</p>
                {u.server_name && <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--color-text-muted)' }}>→ {u.server_name}</p>}
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Pools Configurados</h3>
          <button className="btn btn-primary" style={{ fontSize: 12, padding: '6px 14px' }} onClick={() => setShowCreate(true)}>
            ➕ Nuevo Pool
          </button>
        </div>
        <div className="data-table" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                {['Nombre', 'Rango', 'Pool siguiente', 'Acciones'].map(h => (
                  <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 12, color: 'var(--color-text-muted)', fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pools.map(p => (
                <tr key={p.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <td style={{ padding: '10px 12px', fontWeight: 600 }}>{p.name}</td>
                  <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontSize: 12 }}>{p.ranges}</td>
                  <td style={{ padding: '10px 12px', color: 'var(--color-text-muted)', fontSize: 12 }}>{p.next_pool || '—'}</td>
                  <td style={{ padding: '10px 12px' }}>
                    <button className="btn-ghost" style={{ padding: '3px 8px', fontSize: 11 }}
                      onClick={() => setEditPool(p)} title="Editar pool">✏️</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showCreate && <PoolFormModal onClose={() => setShowCreate(false)} />}
      {editPool && <PoolFormModal pool={editPool} onClose={() => setEditPool(null)} />}
    </div>
  );
}

// ── Networks Tab ──────────────────────────────────────────────────────────────

interface NetworkFormModalProps {
  network?: DhcpNetwork | null;
  onClose: () => void;
}

function NetworkFormModal({ network, onClose }: NetworkFormModalProps) {
  const createNetwork = useCreateDhcpNetwork();
  const updateNetwork = useUpdateDhcpNetwork();
  const isEdit = !!network;

  const [address, setAddress] = useState(network?.address ?? '');
  const [gateway, setGateway] = useState(network?.gateway ?? '');
  const [dnsServer, setDnsServer] = useState(network?.dns_server ?? '');
  const [domain, setDomain] = useState(network?.domain ?? '');
  const [ntpServer, setNtpServer] = useState(network?.ntp_server ?? '');
  const [comment, setComment] = useState(network?.comment ?? '');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const payload = {
      address,
      gateway: gateway || undefined,
      dns_server: dnsServer || undefined,
      domain: domain || undefined,
      ntp_server: ntpServer || undefined,
      comment: comment || undefined,
    };

    if (isEdit && network) {
      updateNetwork.mutate(
        { id: network.id, data: payload },
        {
          onSuccess: (res) => { if (res.success) onClose(); else setError(res.error ?? 'Error'); },
          onError: (err: any) => setError(err.message ?? 'Error'),
        }
      );
    } else {
      if (!address) { setError('La dirección de red es obligatoria'); return; }
      createNetwork.mutate(payload as any,
        {
          onSuccess: (res) => { if (res.success) onClose(); else setError(res.error ?? 'Error'); },
          onError: (err: any) => setError(err.message ?? 'Error'),
        }
      );
    }
  };

  const isPending = createNetwork.isPending || updateNetwork.isPending;

  return (
    <div className="confirm-modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="confirm-modal portal-form-modal animate-fade-in-up" style={{ maxWidth: 500 }} onClick={e => e.stopPropagation()}>
        <div className="confirm-modal__header">
          <h3 className="confirm-modal__title">{isEdit ? 'Editar Red DHCP' : 'Nueva Red DHCP'}</h3>
          <button type="button" className="confirm-modal__close" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="confirm-modal__body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <FormError message={error} />
          <Field label="Dirección de Red (CIDR)" required>
            <input className="input" value={address} onChange={e => setAddress(e.target.value)}
              disabled={isEdit} required={!isEdit} placeholder="ej: 192.168.1.0/24" style={{ width: '100%' }} />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Gateway">
              <input className="input" value={gateway} onChange={e => setGateway(e.target.value)} placeholder="192.168.1.1" style={{ width: '100%' }} />
            </Field>
            <Field label="DNS Server">
              <input className="input" value={dnsServer} onChange={e => setDnsServer(e.target.value)} placeholder="8.8.8.8" style={{ width: '100%' }} />
            </Field>
            <Field label="Dominio">
              <input className="input" value={domain} onChange={e => setDomain(e.target.value)} placeholder="local.lan" style={{ width: '100%' }} />
            </Field>
            <Field label="NTP Server">
              <input className="input" value={ntpServer} onChange={e => setNtpServer(e.target.value)} placeholder="pool.ntp.org" style={{ width: '100%' }} />
            </Field>
          </div>
          <Field label="Comentario">
            <input className="input" value={comment} onChange={e => setComment(e.target.value)} placeholder="Descripción de la red" style={{ width: '100%' }} />
          </Field>
          <div className="confirm-modal__actions" style={{ marginTop: 4 }}>
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={isPending}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={isPending}>
              {isPending ? (isEdit ? 'Guardando...' : 'Creando...') : (isEdit ? 'Guardar cambios' : 'Crear Red')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function NetworksTab() {
  const { data: networks = [], isLoading } = useDhcpNetworks();
  const [showCreate, setShowCreate] = useState(false);
  const [editNetwork, setEditNetwork] = useState<DhcpNetwork | null>(null);

  return (
    <div className="animate-fade-in-up">
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>➕ Nueva Red</button>
      </div>

      {isLoading ? <div className="loading-spinner" /> : (
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))' }}>
          {networks.map(n => (
            <div key={n.id} className="glass-card" style={{ padding: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <h3 style={{ margin: 0, fontFamily: 'monospace', fontSize: 16, color: 'var(--color-primary)' }}>{n.address}</h3>
                <button className="btn-ghost" style={{ padding: '3px 8px', fontSize: 11 }}
                  onClick={() => setEditNetwork(n)} title="Editar red">✏️</button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 13 }}>
                <div><span style={{ color: 'var(--color-text-muted)', fontSize: 11 }}>GATEWAY</span><br /><strong style={{ fontFamily: 'monospace' }}>{n.gateway || '—'}</strong></div>
                <div><span style={{ color: 'var(--color-text-muted)', fontSize: 11 }}>DNS</span><br /><strong style={{ fontFamily: 'monospace', fontSize: 12 }}>{n.dns_server || '—'}</strong></div>
                <div><span style={{ color: 'var(--color-text-muted)', fontSize: 11 }}>DOMINIO</span><br /><strong>{n.domain || '—'}</strong></div>
                <div><span style={{ color: 'var(--color-text-muted)', fontSize: 11 }}>NTP</span><br /><strong style={{ fontFamily: 'monospace', fontSize: 12 }}>{n.ntp_server || '—'}</strong></div>
              </div>
              {n.comment && <p style={{ margin: '12px 0 0', fontSize: 12, color: 'var(--color-text-muted)', fontStyle: 'italic' }}>{n.comment}</p>}
            </div>
          ))}
        </div>
      )}

      {showCreate && <NetworkFormModal onClose={() => setShowCreate(false)} />}
      {editNetwork && <NetworkFormModal network={editNetwork} onClose={() => setEditNetwork(null)} />}
    </div>
  );
}

// ── Alerts Tab ────────────────────────────────────────────────────────────────

interface RogueAlertFormModalProps {
  onClose: () => void;
}

function RogueAlertFormModal({ onClose }: RogueAlertFormModalProps) {
  const { data: interfaces = [] } = useInterfaces();
  const createAlert = useCreateDhcpRogueAlert();

  const [iface, setIface] = useState('');
  const [validServer, setValidServer] = useState('');
  const [alertTimeout, setAlertTimeout] = useState('30s');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (interfaces.length > 0 && !iface) setIface(interfaces[0].name);
  }, [interfaces, iface]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!iface) { setError('La interfaz es obligatoria'); return; }
    createAlert.mutate(
      { interface: iface, valid_server: validServer || undefined, alert_timeout: alertTimeout },
      {
        onSuccess: (res) => { if (res.success) onClose(); else setError(res.error ?? 'Error'); },
        onError: (err: any) => setError(err.message ?? 'Error'),
      }
    );
  };

  return (
    <div className="confirm-modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="confirm-modal portal-form-modal animate-fade-in-up" style={{ maxWidth: 460 }} onClick={e => e.stopPropagation()}>
        <div className="confirm-modal__header">
          <h3 className="confirm-modal__title">Nueva Alerta Rogue DHCP</h3>
          <button type="button" className="confirm-modal__close" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="confirm-modal__body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <FormError message={error} />
          <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-muted)' }}>
            Configura la detección de servidores DHCP no autorizados en una interfaz.
          </p>
          <Field label="Interfaz a monitorear" required>
            <select className="input" value={iface} onChange={e => setIface(e.target.value)} required style={{ width: '100%', height: 38 }}>
              <option value="">Seleccione una interfaz</option>
              {interfaces.map(i => <option key={i.name} value={i.name}>{i.name} ({i.type})</option>)}
            </select>
          </Field>
          <Field label="IP del servidor válido (opcional)">
            <input className="input" value={validServer} onChange={e => setValidServer(e.target.value)}
              placeholder="192.168.1.1 — vacío = cualquiera" style={{ width: '100%' }} />
          </Field>
          <Field label="Timeout de alerta">
            <input className="input" value={alertTimeout} onChange={e => setAlertTimeout(e.target.value)}
              placeholder="ej: 30s, 1m" style={{ width: '100%' }} />
          </Field>
          <div className="confirm-modal__actions" style={{ marginTop: 4 }}>
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={createAlert.isPending}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={createAlert.isPending}>
              {createAlert.isPending ? 'Creando...' : 'Crear Alerta'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AlertsTab() {
  const { data: alerts = [], isLoading } = useDhcpRogueAlerts();
  const blockRogue = useBlockRogueDhcp();
  const [showCreate, setShowCreate] = useState(false);

  return (
    <div className="animate-fade-in-up">
      {alerts.some(a => a.unknown_server_detected) && (
        <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid var(--color-danger)', borderRadius: 8, padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 20 }}>🚨</span>
          <span style={{ fontWeight: 600, color: 'var(--color-danger)' }}>Servidor DHCP rogue detectado en una o más interfaces</span>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>➕ Nueva Alerta</button>
      </div>

      {isLoading ? <div className="loading-spinner" /> : (
        <div style={{ display: 'grid', gap: 12 }}>
          {alerts.map(a => (
            <div key={a.id} className="glass-card" style={{ padding: 16, borderLeft: `3px solid ${a.unknown_server_detected ? 'var(--color-danger)' : 'var(--color-success)'}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <strong style={{ fontSize: 15 }}>Interfaz: {a.interface}</strong>
                  <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--color-text-muted)' }}>
                    Servidor válido: <code>{a.valid_server || 'cualquiera'}</code> · Timeout: {a.alert_timeout}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span className={a.unknown_server_detected ? 'badge-critical' : 'badge-success'} style={{ padding: '4px 10px', borderRadius: 4, fontWeight: 700, fontSize: 12 }}>
                    {a.unknown_server_detected ? '🚨 ROGUE' : '✓ OK'}
                  </span>
                  {a.unknown_server_detected && (
                    <button className="btn-danger" style={{ padding: '4px 12px', fontSize: 12 }}
                      onClick={() => { if (confirm(`¿Bloquear DHCP rogue en ${a.interface} via firewall?`)) blockRogue.mutate(a.id); }}
                      title="S4: Bloquear vía MikroTik firewall">
                      🛡 Bloquear
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
          {alerts.length === 0 && <p style={{ color: 'var(--color-text-muted)', padding: 32, textAlign: 'center' }}>No hay alertas configuradas</p>}
        </div>
      )}

      {showCreate && <RogueAlertFormModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}

// ── Options Tab ───────────────────────────────────────────────────────────────

interface OptionFormModalProps {
  onClose: () => void;
}

function OptionFormModal({ onClose }: OptionFormModalProps) {
  const createOption = useCreateDhcpOption();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [value, setValue] = useState('');
  const [raw, setRaw] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const codeNum = parseInt(code, 10);
    if (!code || isNaN(codeNum) || codeNum < 1 || codeNum > 254) {
      setError('El código debe ser un número entre 1 y 254');
      return;
    }
    if (!name || !value) { setError('Nombre y valor son obligatorios'); return; }
    createOption.mutate(
      { code: codeNum, name, value, raw },
      {
        onSuccess: (res) => { if (res.success) onClose(); else setError(res.error ?? 'Error'); },
        onError: (err: any) => setError(err.message ?? 'Error'),
      }
    );
  };

  return (
    <div className="confirm-modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="confirm-modal portal-form-modal animate-fade-in-up" style={{ maxWidth: 460 }} onClick={e => e.stopPropagation()}>
        <div className="confirm-modal__header">
          <h3 className="confirm-modal__title">Nueva Opción DHCP</h3>
          <button type="button" className="confirm-modal__close" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="confirm-modal__body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <FormError message={error} />
          <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: 12 }}>
            <Field label="Código (1-254)" required>
              <input className="input" type="number" min="1" max="254" value={code}
                onChange={e => setCode(e.target.value)} required placeholder="43" style={{ width: '100%' }} />
            </Field>
            <Field label="Nombre" required>
              <input className="input" value={name} onChange={e => setName(e.target.value)}
                required placeholder="ej: vendor-specific" style={{ width: '100%' }} />
            </Field>
          </div>
          <Field label="Valor" required>
            <input className="input" value={value} onChange={e => setValue(e.target.value)}
              required placeholder={raw ? 'Hex: 0x0a0b0c' : 'Texto o IP'} style={{ width: '100%' }} />
          </Field>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, cursor: 'pointer', userSelect: 'none' }}>
            <input type="checkbox" checked={raw} onChange={e => setRaw(e.target.checked)}
              style={{ width: 16, height: 16, cursor: 'pointer' }} />
            <span>Valor en hexadecimal raw</span>
          </label>
          <div className="confirm-modal__actions" style={{ marginTop: 4 }}>
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={createOption.isPending}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={createOption.isPending}>
              {createOption.isPending ? 'Creando...' : 'Crear Opción'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function OptionsTab() {
  const { data: options = [], isLoading } = useDhcpOptions();
  const [showCreate, setShowCreate] = useState(false);

  return (
    <div className="animate-fade-in-up">
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>➕ Nueva Opción</button>
      </div>

      {isLoading ? <div className="loading-spinner" /> : (
        <div className="data-table">
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                {['Código', 'Nombre', 'Valor', 'Tipo'].map(h => (
                  <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 12, color: 'var(--color-text-muted)', fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {options.map(o => (
                <tr key={o.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <td style={{ padding: '10px 12px', fontWeight: 700, color: 'var(--color-primary)' }}>{o.code}</td>
                  <td style={{ padding: '10px 12px', fontWeight: 600 }}>{o.name}</td>
                  <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontSize: 12 }}>{o.value}</td>
                  <td style={{ padding: '10px 12px' }}>
                    <span className={o.raw ? 'badge-info' : 'badge-low'} style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11 }}>
                      {o.raw ? 'hex' : 'text'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && <OptionFormModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}

// ── Discovery Tab (Fase 2 — S2 + S5) ─────────────────────────────────────────

const STATUS_COLOR: Record<string, string> = {
  registered:   'var(--color-success)',
  unregistered: 'var(--color-danger)',
  stale:        'var(--color-warning, #f59e0b)',
};
const STATUS_LABEL: Record<string, string> = {
  registered:   '✓ GLPI',
  unregistered: '⚠ Sin inventario',
  stale:        '⏸ Sin lease',
};

function DiscoveryTab() {
  const { data = { leases: [], stale: [] }, isLoading } = useDhcpDiscovery();
  const createTicket = useCreateDiscoveryTicket();
  const [ticketSent, setTicketSent] = useState<Set<string>>(new Set());

  const allDevices: DhcpDiscoveryDevice[] = [...data.leases, ...data.stale];
  const unregistered = allDevices.filter(d => d.discovery_status === 'unregistered');
  const registered   = allDevices.filter(d => d.discovery_status === 'registered');
  const stale        = allDevices.filter(d => d.discovery_status === 'stale');

  const handleTicket = (ip: string) => {
    if (ticketSent.has(ip)) return;
    createTicket.mutate(ip, { onSuccess: () => setTicketSent(prev => new Set(prev).add(ip)) });
  };

  if (isLoading) return <div className="loading-spinner" />;

  return (
    <div className="animate-fade-in-up" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
        {[
          { label: 'No inventariados', value: unregistered.length, color: 'var(--color-danger)' },
          { label: 'Registrados',       value: registered.length,   color: 'var(--color-success)' },
          { label: 'Sin lease (GLPI)',   value: stale.length,        color: 'var(--color-warning, #f59e0b)' },
        ].map(s => (
          <div key={s.label} className="stat-card" style={{ padding: 14, textAlign: 'center' }}>
            <p style={{ margin: 0, fontSize: 11, color: 'var(--color-text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>{s.label}</p>
            <p style={{ margin: '6px 0 0', fontSize: 26, fontWeight: 800, color: s.color }}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="data-table" style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
              {['IP', 'MAC', 'Hostname', 'Servidor', 'ARP', 'Estado', 'GLPI', 'Acciones'].map(h => (
                <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 12, color: 'var(--color-text-muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {allDevices.map(d => (
              <tr key={`${d.address}-${d.discovery_status}`} style={{ borderBottom: '1px solid var(--color-border)' }}>
                <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontSize: 13, fontWeight: 600, color: 'var(--color-primary)' }}>{d.address || '—'}</td>
                <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontSize: 12, color: 'var(--color-text-muted)' }}>{d.mac_address || '—'}</td>
                <td style={{ padding: '10px 12px', fontSize: 13 }}>{d.host_name || d.glpi_asset_name || <span style={{ color: 'var(--color-text-muted)' }}>—</span>}</td>
                <td style={{ padding: '10px 12px', fontSize: 12 }}>{d.server || '—'}</td>
                <td style={{ padding: '10px 12px' }}>
                  <span style={{ fontSize: 11, color: d.in_arp ? 'var(--color-success)' : 'var(--color-text-muted)' }}>
                    {d.in_arp ? '✓' : '—'}
                  </span>
                </td>
                <td style={{ padding: '10px 12px', fontSize: 12 }}>{d.status || '—'}</td>
                <td style={{ padding: '10px 12px' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: STATUS_COLOR[d.discovery_status] }}>
                    {STATUS_LABEL[d.discovery_status]}
                  </span>
                  {d.glpi_location && (
                    <span style={{ display: 'block', fontSize: 10, color: 'var(--color-text-muted)' }}>{d.glpi_location}</span>
                  )}
                </td>
                <td style={{ padding: '10px 12px' }}>
                  {d.discovery_status === 'unregistered' && d.address && (
                    <button
                      className={ticketSent.has(d.address) ? 'btn-ghost' : 'btn-primary'}
                      style={{ padding: '3px 10px', fontSize: 11 }}
                      disabled={ticketSent.has(d.address) || createTicket.isPending}
                      onClick={() => handleTicket(d.address)}
                      title="S5: Crear ticket GLPI para inventariar este equipo">
                      {ticketSent.has(d.address) ? '✓ Enviado' : '🎫 Ticket GLPI'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {allDevices.length === 0 && <p style={{ textAlign: 'center', padding: 32, color: 'var(--color-text-muted)' }}>Sin datos de descubrimiento</p>}
      </div>
      <p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Cruza leases DHCP con inventario GLPI y tabla ARP · Actualiza cada 60s</p>
    </div>
  );
}

// ── Correlation Tab (Fase 2 — S1 + S3) ────────────────────────────────────────

function CorrelationTab() {
  const [subTab, setSubTab] = useState<'glpi' | 'wazuh'>('glpi');
  const { data: corr = [], isLoading: loadingCorr } = useDhcpGlpiCorrelation();
  const { data: enriched = [], isLoading: loadingWazuh } = useDhcpWazuhEnriched(30, 5);

  return (
    <div className="animate-fade-in-up">
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid var(--color-border)' }}>
        {[
          { id: 'glpi' as const, label: '🔗 DHCP × GLPI' },
          { id: 'wazuh' as const, label: '🛡 Alertas × DHCP' },
        ].map(t => (
          <button key={t.id} onClick={() => setSubTab(t.id)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: '8px 14px',
              fontSize: 13, fontWeight: 600,
              color: subTab === t.id ? 'var(--color-primary)' : 'var(--color-text-muted)',
              borderBottom: subTab === t.id ? '2px solid var(--color-primary)' : '2px solid transparent',
              transition: 'all .15s',
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {subTab === 'glpi' && (
        loadingCorr ? <div className="loading-spinner" /> : (
          <div className="data-table" style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                  {['IP', 'Hostname (DHCP)', 'Servidor', 'GLPI Activo', 'Asset', 'Ubicación', 'OS', 'Responsable'].map(h => (
                    <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, color: 'var(--color-text-muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(corr as DhcpLeaseGlpiCorrelation[]).map(r => (
                  <tr key={r.id} style={{ borderBottom: '1px solid var(--color-border)', opacity: r.glpi_match ? 1 : 0.7 }}>
                    <td style={{ padding: '9px 12px', fontFamily: 'monospace', fontSize: 13, fontWeight: 600, color: 'var(--color-primary)' }}>{r.address}</td>
                    <td style={{ padding: '9px 12px', fontSize: 13 }}>{r.host_name || '—'}</td>
                    <td style={{ padding: '9px 12px', fontSize: 12 }}>{r.server}</td>
                    <td style={{ padding: '9px 12px' }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: r.glpi_match ? 'var(--color-success)' : 'var(--color-danger)' }}>
                        {r.glpi_match ? '✓ Sí' : '✗ No'}
                      </span>
                    </td>
                    <td style={{ padding: '9px 12px', fontSize: 12 }}>{r.glpi_asset_name || '—'}</td>
                    <td style={{ padding: '9px 12px', fontSize: 12, color: 'var(--color-text-muted)' }}>{r.glpi_location || '—'}</td>
                    <td style={{ padding: '9px 12px', fontSize: 11, color: 'var(--color-text-muted)' }}>{r.glpi_os || '—'}</td>
                    <td style={{ padding: '9px 12px', fontSize: 12 }}>{r.glpi_assigned_user || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {corr.length === 0 && <p style={{ textAlign: 'center', padding: 24, color: 'var(--color-text-muted)' }}>Sin datos</p>}
          </div>
        )
      )}

      {subTab === 'wazuh' && (
        loadingWazuh ? <div className="loading-spinner" /> : (
          <div className="data-table" style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                  {['Lvl', 'Descripción', 'Agente IP', 'DHCP Hostname', 'MAC', 'Servidor', 'Expira', 'Estática'].map(h => (
                    <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, color: 'var(--color-text-muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(enriched as DhcpEnrichedAlert[]).map(a => (
                  <tr key={a.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <td style={{ padding: '9px 12px', fontWeight: 800, fontSize: 14, color: a.rule_level >= 12 ? 'var(--color-danger)' : a.rule_level >= 9 ? '#f59e0b' : a.rule_level >= 6 ? 'var(--accent-primary)' : 'var(--color-text-muted)' }}>{a.rule_level}</td>
                    <td style={{ padding: '9px 12px', fontSize: 12, maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.rule_description}</td>
                    <td style={{ padding: '9px 12px', fontFamily: 'monospace', fontSize: 12 }}>{a.agent_ip}</td>
                    <td style={{ padding: '9px 12px', fontSize: 13, fontWeight: a.dhcp_hostname ? 600 : 400, color: a.dhcp_hostname ? 'var(--color-primary)' : 'var(--color-text-muted)' }}>{a.dhcp_hostname || '—'}</td>
                    <td style={{ padding: '9px 12px', fontFamily: 'monospace', fontSize: 11, color: 'var(--color-text-muted)' }}>{a.dhcp_mac || '—'}</td>
                    <td style={{ padding: '9px 12px', fontSize: 12 }}>{a.dhcp_server || '—'}</td>
                    <td style={{ padding: '9px 12px', fontSize: 12, color: 'var(--color-text-muted)' }}>{a.dhcp_expires || '—'}</td>
                    <td style={{ padding: '9px 12px', fontSize: 12 }}>
                      {a.dhcp_is_static === null ? '—' : a.dhcp_is_static ? '📌 Sí' : 'No'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {enriched.length === 0 && <p style={{ textAlign: 'center', padding: 24, color: 'var(--color-text-muted)' }}>Sin alertas</p>}
          </div>
        )
      )}
      <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 8 }}>
        DHCP × GLPI: correlación por IP/MAC · DHCP × Wazuh: contexto de red por lease activo
      </p>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function DhcpPage() {
  const [activeTab, setActiveTab] = useState<Tab>('leases');
  const { data: leases = [] } = useDhcpLeases();
  const { data: usage = [] } = useDhcpSubnetUsage();
  const { data: rogueAlerts = [] } = useDhcpRogueAlerts();

  const boundLeases  = leases.filter(l => l.status === 'bound').length;
  const staticLeases = leases.filter(l => !l.dynamic).length;
  const rogueDetected = rogueAlerts.some(a => a.unknown_server_detected);
  const avgUsage = usage.length > 0
    ? (usage as DhcpSubnetUsage[]).reduce((a, u) => a + u.usage_percent, 0) / usage.length
    : 0;

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1400, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span>🔄</span> Administración DHCP
          </h1>
          <p style={{ margin: '4px 0 0', color: 'var(--color-text-muted)', fontSize: 14 }}>
            MikroTik RouterOS · Gestión de leases, pools y configuración de subredes
          </p>
        </div>
        {rogueDetected && (
          <div style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid var(--color-danger)', borderRadius: 8, padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>🚨</span>
            <span style={{ color: 'var(--color-danger)', fontWeight: 700, fontSize: 13 }}>Rogue DHCP detectado</span>
          </div>
        )}
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Leases Activas',     value: boundLeases,              unit: 'bound',    color: 'var(--color-success)' },
          { label: 'Reservas Estáticas', value: staticLeases,             unit: 'hosts',    color: 'var(--color-primary)' },
          { label: 'Pools Totales',       value: usage.length,             unit: 'pools',    color: 'var(--color-info, #38bdf8)' },
          { label: 'Uso Promedio',        value: `${avgUsage.toFixed(1)}%`,unit: 'subredes', color: avgUsage > 80 ? 'var(--color-danger)' : 'var(--color-text)' },
        ].map(s => (
          <div key={s.label} className="stat-card" style={{ padding: 16 }}>
            <p style={{ margin: 0, fontSize: 11, color: 'var(--color-text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{s.label}</p>
            <p style={{ margin: '6px 0 0', fontSize: 28, fontWeight: 800, color: s.color }}>{s.value}</p>
            <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--color-text-muted)' }}>{s.unit}</p>
          </div>
        ))}
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid var(--color-border)', overflowX: 'auto' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              padding: '10px 16px', fontSize: 13, fontWeight: 600,
              color: activeTab === t.id ? 'var(--color-primary)' : 'var(--color-text-muted)',
              borderBottom: activeTab === t.id ? '2px solid var(--color-primary)' : '2px solid transparent',
              transition: 'all .15s', display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
            }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="glass-card" style={{ padding: 24 }}>
        {activeTab === 'leases'      && <LeasesTab />}
        {activeTab === 'servers'     && <ServersTab />}
        {activeTab === 'pools'       && <PoolsTab />}
        {activeTab === 'networks'    && <NetworksTab />}
        {activeTab === 'alerts'      && <AlertsTab />}
        {activeTab === 'options'     && <OptionsTab />}
        {activeTab === 'discovery'   && <DiscoveryTab />}
        {activeTab === 'correlation' && <CorrelationTab />}
      </div>
    </div>
  );
}
