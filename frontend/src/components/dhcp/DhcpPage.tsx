import { useState } from 'react';
import {
  useDhcpServers, useDhcpLeases, useDhcpNetworks,
  useDhcpPools, useDhcpSubnetUsage, useDhcpRogueAlerts, useDhcpOptions,
  useDeleteDhcpLease, useMakeDhcpLeaseStatic, useSetDhcpLeaseBlock,
  useToggleDhcpServer,
  // Fase 2
  useDhcpDiscovery, useDhcpGlpiCorrelation, useDhcpWazuhEnriched,
  useBlockRogueDhcp, useCreateDiscoveryTicket,
} from '../../hooks/useDhcp';
import type {
  DhcpLease, DhcpServer, DhcpSubnetUsage,
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


function formatBytes(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)} K`;
  return String(n);
}

function UsageBar({ pct }: { pct: number }) {
  const color = pct >= 90 ? 'var(--color-danger)' : pct >= 70 ? 'var(--color-warning, #f59e0b)' : 'var(--color-success)';
  return (
    <div style={{ background: 'var(--color-surface-2)', borderRadius: 4, height: 8, width: '100%', overflow: 'hidden' }}>
      <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', background: color, borderRadius: 4, transition: 'width .4s' }} />
    </div>
  );
}

// ── Leases Tab ────────────────────────────────────────────────────────────────
function LeasesTab() {
  const [search, setSearch] = useState('');
  const [serverFilter, setServerFilter] = useState('');
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
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <input
          className="input" placeholder="Buscar IP / MAC / hostname..."
          value={search} onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: 220 }}
        />
        <select className="input" value={serverFilter} onChange={e => setServerFilter(e.target.value)} style={{ minWidth: 160 }}>
          <option value="">Todos los servidores</option>
          {servers.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
        </select>
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
                    <div style={{ display: 'flex', gap: 6 }}>
                      {l.dynamic && (
                        <button className="btn-ghost" style={{ padding: '3px 8px', fontSize: 11 }}
                          onClick={() => makeStatic.mutate(l.id)} title="Convertir en estática">📌</button>
                      )}
                      <button className="btn-ghost" style={{ padding: '3px 8px', fontSize: 11 }}
                        onClick={() => blockLease.mutate({ id: l.id, block: !l.blocked })}
                        title={l.blocked ? 'Desbloquear' : 'Bloquear acceso'}>
                        {l.blocked ? '🔓' : '🚫'}
                      </button>
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
    </div>
  );
}

// ── Servers Tab ───────────────────────────────────────────────────────────────
function ServersTab() {
  const { data: servers = [], isLoading } = useDhcpServers();
  const toggle = useToggleDhcpServer();

  return (
    <div className="animate-fade-in-up">
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
    </div>
  );
}

// ── Pools Tab ─────────────────────────────────────────────────────────────────
function PoolsTab() {
  const { data: usage = [], isLoading } = useDhcpSubnetUsage();
  const { data: pools = [] } = useDhcpPools();

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
        <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 700 }}>Pools Configurados</h3>
        <div className="data-table" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                {['Nombre', 'Rango', 'Pool siguiente'].map(h => (
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Networks Tab ──────────────────────────────────────────────────────────────
function NetworksTab() {
  const { data: networks = [], isLoading } = useDhcpNetworks();
  return (
    <div className="animate-fade-in-up">
      {isLoading ? <div className="loading-spinner" /> : (
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))' }}>
          {networks.map(n => (
            <div key={n.id} className="glass-card" style={{ padding: 20 }}>
              <h3 style={{ margin: '0 0 12px', fontFamily: 'monospace', fontSize: 16, color: 'var(--color-primary)' }}>{n.address}</h3>
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
    </div>
  );
}

// ── Alerts Tab ────────────────────────────────────────────────────────────────
function AlertsTab() {
  const { data: alerts = [], isLoading } = useDhcpRogueAlerts();
  const blockRogue = useBlockRogueDhcp();
  return (
    <div className="animate-fade-in-up">
      {alerts.some(a => a.unknown_server_detected) && (
        <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid var(--color-danger)', borderRadius: 8, padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 20 }}>🚨</span>
          <span style={{ fontWeight: 600, color: 'var(--color-danger)' }}>Servidor DHCP rogue detectado en una o más interfaces</span>
        </div>
      )}
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
    </div>
  );
}

// ── Options Tab ───────────────────────────────────────────────────────────────
function OptionsTab() {
  const { data: options = [], isLoading } = useDhcpOptions();
  return (
    <div className="animate-fade-in-up">
      {isLoading ? <div className="loading-spinner" /> : (
        <div className="data-table">
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                {['Código', 'Nombre', 'Valor', 'Raw'].map(h => (
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
                  <td style={{ padding: '10px 12px' }}><span className={o.raw ? 'badge-info' : 'badge-low'} style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11 }}>{o.raw ? 'hex' : 'text'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
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

  const allDevices: DhcpDiscoveryDevice[] = [
    ...data.leases,
    ...data.stale,
  ];
  const unregistered = allDevices.filter(d => d.discovery_status === 'unregistered');
  const registered   = allDevices.filter(d => d.discovery_status === 'registered');
  const stale        = allDevices.filter(d => d.discovery_status === 'stale');

  const handleTicket = (ip: string) => {
    if (ticketSent.has(ip)) return;
    createTicket.mutate(ip, {
      onSuccess: () => setTicketSent(prev => new Set(prev).add(ip)),
    });
  };

  if (isLoading) return <div className="loading-spinner" />;

  return (
    <div className="animate-fade-in-up" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Summary */}
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

      {/* Device table */}
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
                      title="S5: Crear ticket GLPI para inventariar este equipo"
                    >
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

  const LEVEL_COLOR = (lvl: number) =>
    lvl >= 12 ? 'var(--color-danger)' : lvl >= 9 ? 'var(--color-warning,#f59e0b)' : lvl >= 6 ? 'var(--accent-primary)' : 'var(--color-text-muted)';

  return (
    <div className="animate-fade-in-up">
      {/* Sub-tab switcher */}
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

      {/* S1: GLPI correlation */}
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

      {/* S3: Wazuh enriched alerts */}
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
            {t.id === 'discovery'   && <span style={{ fontSize: 10, background: 'var(--accent-primary)', color: '#fff', borderRadius: 8, padding: '1px 5px' }}>NEW</span>}
            {t.id === 'correlation' && <span style={{ fontSize: 10, background: 'var(--accent-primary)', color: '#fff', borderRadius: 8, padding: '1px 5px' }}>NEW</span>}
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
