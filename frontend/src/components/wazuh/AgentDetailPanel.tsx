/**
 * AgentDetailPanel.tsx — Drawer/slide-over that shows a single Wazuh agent in depth.
 *
 * Route: /wazuh/agents/:agentId
 *
 * Layout:
 *   ┌─ Header (id, name, ip, status pill, OS) ─────────────────────────────┐
 *   ├─ Tabs: Info | Syscheck | Syscollector ───────────────────────────────┤
 *   └─ Tab content (cards / tables) ────────────────────────────────────────┘
 */
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  X, Server, Cpu, Activity, ShieldCheck, FileWarning,
  Package, ChevronLeft, AlertCircle,
} from 'lucide-react';
import {
  useWazuhAgentDetail,
  useWazuhAgentSyscheck,
  useWazuhAgentSyscollector,
} from '../../hooks/useWazuh';
import { formatDateTime } from '../utils/time';

type TabKey = 'info' | 'syscheck' | 'syscollector';

const statusBadge = (status: string) => {
  const s = (status ?? '').toLowerCase();
  if (s === 'active') return 'badge-success';
  if (s === 'disconnected') return 'badge-danger';
  if (s === 'never_connected') return 'badge-warning';
  return 'badge-info';
};

export function AgentDetailPage() {
  const { agentId: agentIdParam } = useParams<{ agentId: string }>();
  const agentId = agentIdParam ?? null;
  const [tab, setTab] = useState<TabKey>('info');

  const { data: detail, isLoading: detailLoading, isError: detailError } =
    useWazuhAgentDetail(agentId);
  const { data: syscheck, isLoading: syscheckLoading } = useWazuhAgentSyscheck(agentId);
  const { data: syscollector, isLoading: syscollectorLoading } = useWazuhAgentSyscollector(agentId);

  if (!agentId) {
    return <Empty message="ID de agente no proporcionado" />;
  }

  return (
    <div className="wazuh-page">
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <Link to="/wazuh/agents" className="btn btn-ghost" style={{ padding: '0.35rem 0.6rem' }}>
          <ChevronLeft size={14} /> Agentes
        </Link>
        <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--color-surface-100)' }}>
          {detail?.name ?? `Agente ${agentId}`}
        </h2>
        {detail?.status && (
          <span className={`badge ${statusBadge(detail.status)}`} style={{ fontSize: '0.65rem' }}>
            {detail.status.toUpperCase()}
          </span>
        )}
      </div>

      <div className="glass-card" style={{ padding: '1.25rem 1.5rem' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.25rem', fontSize: '0.85rem' }}>
          <InfoItem label="ID" value={detail?.id ?? agentId} />
          <InfoItem label="IP" value={detail?.ip ?? '—'} />
          <InfoItem label="OS" value={detail?.os_name ? `${detail.os_name} ${detail.os_version ?? ''}`.trim() : '—'} />
          <InfoItem label="Último keep-alive" value={detail?.last_keep_alive ? formatDateTime(detail.last_keep_alive) : '—'} />
        </div>
        {detailLoading && <div className="wazuh-empty">Cargando información del agente…</div>}
        {detailError && <div className="wazuh-empty">No se pudo obtener el detalle del agente.</div>}
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid rgba(148,163,184,0.1)', marginTop: '0.5rem' }}>
        <TabBtn active={tab === 'info'} onClick={() => setTab('info')} icon={<Activity size={13} />}>
          Info
        </TabBtn>
        <TabBtn active={tab === 'syscheck'} onClick={() => setTab('syscheck')} icon={<FileWarning size={13} />}>
          Syscheck (FIM)
        </TabBtn>
        <TabBtn active={tab === 'syscollector'} onClick={() => setTab('syscollector')} icon={<Package size={13} />}>
          Syscollector (HW/SW)
        </TabBtn>
      </div>

      {tab === 'info' && (
        <div className="glass-card" style={{ padding: '1.25rem 1.5rem' }}>
          <h3 style={{ margin: 0, fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-surface-200)' }}>
            Resumen del agente
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem', marginTop: '1rem', fontSize: '0.85rem' }}>
            <InfoItem label="Manager" value={detail?.manager ?? '—'} />
            <InfoItem label="Nodo" value={detail?.node_name ?? '—'} />
            <InfoItem label="Grupos" value={(detail?.group ?? []).join(', ') || '—'} />
            <InfoItem label="Registrado" value={detail?.date_add ? formatDateTime(detail.date_add) : '—'} />
          </div>
          <div className="wazuh-empty" style={{ marginTop: '1rem' }}>
            Para ver las alertas recientes de este agente, abrí la sección Alertas filtrando por su ID.
          </div>
          <Link
            to={`/wazuh/alerts?agent_id=${encodeURIComponent(agentId)}`}
            className="btn btn-secondary"
            style={{ marginTop: '0.5rem', display: 'inline-flex', gap: '0.4rem' }}
          >
            Ver alertas del agente
          </Link>
        </div>
      )}

      {tab === 'syscheck' && (
        <div className="glass-card" style={{ padding: '1rem 1.25rem' }}>
          <h3 style={{ margin: 0, marginBottom: '0.75rem', fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-surface-200)' }}>
            Cambios recientes en archivos críticos (FIM)
          </h3>
          {syscheckLoading ? (
            <div className="wazuh-empty">Cargando syscheck…</div>
          ) : !syscheck || syscheck.length === 0 ? (
            <div className="wazuh-empty">Sin eventos de syscheck para este agente.</div>
          ) : (
            <div className="wazuh-table">
              <div className="wazuh-table-row" style={{ color: 'var(--color-surface-400)', fontWeight: 600, textTransform: 'uppercase', fontSize: '0.7rem' }}>
                <span>Fecha</span>
                <span>Archivo</span>
                <span>Evento</span>
                <span>SHA-256</span>
                <span>Size</span>
              </div>
              {syscheck.map((ev, i) => (
                <div key={i} className="wazuh-table-row" style={{ gridTemplateColumns: '160px 2fr 90px 1fr 90px' }}>
                  <span style={{ fontSize: '0.78rem' }}>{formatDateTime(ev.timestamp)}</span>
                  <span className="mono" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', wordBreak: 'break-all' }}>{ev.file}</span>
                  <span><span className="badge badge-info" style={{ fontSize: '0.6rem' }}>{ev.event}</span></span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--color-surface-500)' }}>
                    {(ev.sha256 ?? '').slice(0, 16)}…
                  </span>
                  <span style={{ fontSize: '0.78rem' }}>{ev.size} B</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'syscollector' && (
        <div className="glass-card" style={{ padding: '1rem 1.25rem' }}>
          <h3 style={{ margin: 0, marginBottom: '0.75rem', fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-surface-200)' }}>
            Inventario de hardware, OS y paquetes
          </h3>
          {syscollectorLoading ? (
            <div className="wazuh-empty">Cargando inventario…</div>
          ) : !syscollector ? (
            <div className="wazuh-empty">No hay datos de syscollector para este agente.</div>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem', fontSize: '0.85rem' }}>
                <Card icon={<Cpu size={14} />} label="CPU" value={syscollector.hardware?.cpu_name ?? '—'} sub={syscollector.hardware ? `${syscollector.hardware.cpu_cores} cores @ ${syscollector.hardware.cpu_mhz} MHz` : ''} />
                <Card icon={<Server size={14} />} label="RAM" value={`${syscollector.hardware?.ram_total_mb ?? 0} MB`} sub={syscollector.hardware ? `${syscollector.hardware.ram_free_mb} MB libres` : ''} />
                <Card icon={<ShieldCheck size={14} />} label="OS" value={syscollector.os?.sysname ?? '—'} sub={`${syscollector.os?.version ?? ''} ${syscollector.os?.architecture ?? ''}`} />
                <Card icon={<Package size={14} />} label="Paquetes" value={`${syscollector.packages_count ?? 0}`} sub="instalados" />
              </div>

              {Array.isArray(syscollector.packages) && syscollector.packages.length > 0 && (
                <>
                  <h4 style={{ margin: '1rem 0 0.5rem', fontSize: '0.8rem', color: 'var(--color-surface-300)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Paquetes instalados (top {syscollector.packages.length})
                  </h4>
                  <div className="wazuh-table">
                    {syscollector.packages.map((pkg, i) => (
                      <div key={i} className="wazuh-table-row" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
                        <span className="mono" style={{ fontFamily: 'var(--font-mono)' }}>{pkg.name}</span>
                        <span style={{ fontSize: '0.78rem', color: 'var(--color-surface-400)' }}>{pkg.version}</span>
                        <span style={{ fontSize: '0.78rem', color: 'var(--color-surface-400)' }}>{pkg.vendor}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: '0.65rem', color: 'var(--color-surface-500)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {label}
      </div>
      <div style={{ color: 'var(--color-surface-200)' }}>{value}</div>
    </div>
  );
}

function Card({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div style={{ padding: '0.5rem 0.75rem', background: 'rgba(15,23,42,0.4)', borderRadius: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.65rem', color: 'var(--color-surface-500)', textTransform: 'uppercase' }}>
        {icon} {label}
      </div>
      <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--color-surface-100)', marginTop: '0.25rem' }}>{value}</div>
      {sub && <div style={{ fontSize: '0.72rem', color: 'var(--color-surface-500)' }}>{sub}</div>}
    </div>
  );
}

function TabBtn({ active, onClick, children, icon }: { active: boolean; onClick: () => void; children: React.ReactNode; icon: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="btn btn-ghost"
      style={{
        padding: '0.45rem 0.85rem',
        fontSize: '0.8rem',
        borderBottom: active ? '2px solid var(--color-brand-400)' : '2px solid transparent',
        color: active ? 'var(--color-brand-400)' : 'var(--color-surface-300)',
        borderRadius: 0,
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
        {icon}
        {children}
      </span>
    </button>
  );
}

function Empty({ message }: { message: string }) {
  return (
    <div className="wazuh-page">
      <div className="wazuh-empty">
        <AlertCircle size={20} style={{ display: 'block', margin: '0 auto 0.5rem' }} />
        {message}
      </div>
      <Link to="/wazuh/agents" className="btn btn-secondary">
        <X size={13} /> Volver a Agentes
      </Link>
    </div>
  );
}

export default AgentDetailPage;
