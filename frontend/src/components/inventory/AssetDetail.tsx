/**
 * AssetDetail — Sliding panel with full technical detail of a GLPI asset.
 * Shows: general info, network context, linked tickets, and quick actions.
 * Hardware/Software/Audit/Relationships tabs consume real data from the collector.
 */
import { X, Server, Network, Ticket, Shield, Cpu, HardDrive, LayoutList, Link, FileText, Search, Loader2 } from 'lucide-react';
import { useGlpiAsset, useGlpiAssetNetworkContext, useUnquarantineGlpiAsset, useGlpiAssetFullDetail } from '../../hooks/useGlpiAssets';
import { useQueryClient } from '@tanstack/react-query';
import { ConfirmModal } from '../common/ConfirmModal';
import { useState, useMemo } from 'react';
import type { GlpiAsset, GlpiAssetFullDetail as FullDetail } from '../../types';

interface Props {
  asset: GlpiAsset;
  onClose: () => void;
}

type DetailTab = 'general' | 'hardware' | 'software' | 'audit' | 'relationships';

export function AssetDetail({ asset, onClose }: Props) {
  const qc = useQueryClient();
  const { data: detail, isLoading } = useGlpiAsset(asset.id);
  const { data: netCtx } = useGlpiAssetNetworkContext(asset.id);
  const { data: fullDetail, isLoading: fullLoading } = useGlpiAssetFullDetail(asset.id);
  const unquarantine = useUnquarantineGlpiAsset();
  const [showUnquarantineConfirm, setShowUnquarantineConfirm] = useState(false);
  const [activeTab, setActiveTab] = useState<DetailTab>('general');
  const [swSearch, setSwSearch] = useState('');

  const displayAsset = detail ?? asset;
  const tickets = (detail as any)?.tickets ?? [];

  return (
    <>
      <div className="asset-detail-panel animate-fade-in-up">
        {/* Header */}
        <div className="asset-detail-panel__header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Server size={16} style={{ color: 'var(--color-brand-400)' }} />
            <span className="asset-detail-panel__title">{displayAsset.name}</span>
          </div>
          <button className="btn btn-ghost" onClick={onClose} style={{ padding: '0.3rem' }}>
            <X size={14} />
          </button>
        </div>

        {isLoading && (
          <div style={{ padding: '2rem', textAlign: 'center' }}>
            <span className="loading-spinner" />
          </div>
        )}

        {!isLoading && (
          <>
            {/* Tabs */}
            <div style={{ display: 'flex', borderBottom: '1px solid rgba(148, 163, 184, 0.1)', overflowX: 'auto', padding: '0 1rem', flexShrink: 0 }}>
              {(['general', 'hardware', 'software', 'audit', 'relationships'] as DetailTab[]).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  style={{
                    padding: '0.8rem 1rem', fontSize: '0.75rem', fontWeight: 500,
                    borderBottom: activeTab === tab ? '2px solid var(--color-brand-400)' : '2px solid transparent',
                    color: activeTab === tab ? 'var(--color-surface-50)' : 'var(--color-surface-400)',
                    background: 'transparent', borderTop: 'none', borderLeft: 'none', borderRight: 'none',
                    cursor: 'pointer', outline: 'none', textTransform: 'capitalize',
                  }}
                >
                  {tab === 'audit' ? 'Auditoría' : tab === 'relationships' ? 'Relaciones' : tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>

            <div className="asset-detail-panel__body">
              {activeTab === 'general' && (
                <GeneralTab displayAsset={displayAsset} netCtx={netCtx} tickets={tickets}
                  onUnquarantine={() => setShowUnquarantineConfirm(true)} />
              )}
              {activeTab === 'hardware' && (
                <HardwareTab fullDetail={fullDetail ?? null} loading={fullLoading} />
              )}
              {activeTab === 'software' && (
                <SoftwareTab fullDetail={fullDetail ?? null} loading={fullLoading}
                  search={swSearch} onSearchChange={setSwSearch} />
              )}
              {activeTab === 'audit' && (
                <AuditTab fullDetail={fullDetail ?? null} loading={fullLoading} />
              )}
              {activeTab === 'relationships' && (
                <RelationshipsTab fullDetail={fullDetail ?? null} loading={fullLoading} />
              )}
            </div>
          </>
        )}
      </div>

      {showUnquarantineConfirm && (
        <ConfirmModal
          title="Levantar Cuarentena"
          description="¿Estás seguro de que querés restaurar este equipo al estado activo en GLPI?"
          data={{ Equipo: displayAsset.name, Estado: 'bajo_investigacion → activo' }}
          variant="warning"
          confirmLabel="Levantar"
          isLoading={unquarantine.isPending}
          onConfirm={() => {
            unquarantine.mutate(asset.id, {
              onSuccess: () => {
                setShowUnquarantineConfirm(false);
                qc.invalidateQueries({ queryKey: ['glpi', 'assets'] });
              },
            });
          }}
          onCancel={() => setShowUnquarantineConfirm(false)}
        />
      )}
    </>
  );
}

/* ── Sub-components ─────────────────────────────────────────────── */

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="asset-detail-row">
      <span className="asset-detail-row__label">{label}</span>
      <span className={`asset-detail-row__value ${mono ? 'asset-detail-row__value--mono' : ''}`}>{value}</span>
    </div>
  );
}

function LoadingIndicator() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '1.5rem', justifyContent: 'center', color: 'var(--color-surface-400)', fontSize: '0.75rem' }}>
      <Loader2 size={14} className="animate-spin" /> Cargando datos del collector…
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--color-surface-500)', fontSize: '0.75rem' }}>
      {message}
    </div>
  );
}

/* ── General Tab ────────────────────────────────────────────────── */

function GeneralTab({ displayAsset, netCtx, tickets, onUnquarantine }: {
  displayAsset: GlpiAsset; netCtx: any; tickets: any[]; onUnquarantine: () => void;
}) {
  return (
    <>
      <section className="asset-detail-section">
        <div className="asset-detail-section__title"><Server size={12} /> Información General</div>
        <div className="asset-detail-grid">
          <DetailRow label="Serial" value={displayAsset.serial || '—'} mono />
          <DetailRow label="IP" value={displayAsset.ip || '—'} mono />
          <DetailRow label="MAC" value={displayAsset.mac || '—'} mono />
          <DetailRow label="OS" value={displayAsset.os || '—'} />
          <DetailRow label="CPU" value={displayAsset.cpu || '—'} />
          <DetailRow label="RAM (GB)" value={displayAsset.ram ? `${displayAsset.ram} GB` : '—'} />
          <DetailRow label="Ubicación" value={displayAsset.location || '—'} />
          <DetailRow label="Usuario" value={displayAsset.assigned_user || '—'} />
          <DetailRow label="Estado GLPI" value={displayAsset.status} />
        </div>
      </section>

      {netCtx && (
        <section className="asset-detail-section">
          <div className="asset-detail-section__title"><Network size={12} /> Contexto de Red</div>
          <div className="asset-detail-grid">
            <DetailRow label="Interfaz" value={netCtx.interface || '—'} mono />
            <DetailRow label="VLAN" value={netCtx.vlan || '—'} />
            <DetailRow label="IP Asignada" value={netCtx.ip_assigned || '—'} mono />
            <DetailRow label="Último visto" value={netCtx.last_seen || '—'} />
          </div>
        </section>
      )}

      {tickets.length > 0 && (
        <section className="asset-detail-section">
          <div className="asset-detail-section__title"><Ticket size={12} /> Tickets Vinculados ({tickets.length})</div>
          {tickets.slice(0, 5).map((t: any) => (
            <div key={t.id} className="asset-detail-ticket">
              <span className={`badge ${t.status === 'resuelto' ? 'badge-success' : t.status === 'en_progreso' ? 'badge-warning' : 'badge-low'}`} style={{ fontSize: '0.6rem' }}>
                {t.status}
              </span>
              <span style={{ fontSize: '0.75rem', color: 'var(--color-surface-300)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {t.title}
              </span>
            </div>
          ))}
        </section>
      )}

      <section className="asset-detail-section">
        {displayAsset.status === 'bajo_investigacion' ? (
          <button id="asset-detail-unquarantine" className="btn btn-success" style={{ width: '100%', fontSize: '0.8rem' }} onClick={onUnquarantine}>
            <Shield size={14} /> Levantar Cuarentena
          </button>
        ) : (
          <div style={{ fontSize: '0.72rem', color: 'var(--color-surface-500)', textAlign: 'center' }}>
            Para cuarentenar este equipo, usá la acción en la vista de Seguridad o la tabla de Activos.
          </div>
        )}
      </section>
    </>
  );
}

/* ── Hardware Tab ───────────────────────────────────────────────── */

function HardwareTab({ fullDetail, loading }: { fullDetail: FullDetail | null; loading: boolean }) {
  if (loading) return <LoadingIndicator />;
  if (!fullDetail) return <EmptyState message="Sin datos de hardware. El collector aún no ha sincronizado este activo." />;

  const hw = fullDetail.hardware;
  const disks = fullDetail.disks;

  return (
    <section className="asset-detail-section animate-fade-in-up">
      <div className="asset-detail-section__title"><Cpu size={12} /> Procesadores</div>
      {hw.processors.length > 0 ? (
        <div className="asset-detail-grid">
          {hw.processors.map((p, i) => (
            <DetailRow key={i} label={`CPU ${i + 1}`} value={`${p.name} — ${p.cores}C/${p.threads}T @ ${p.frequency} MHz`} />
          ))}
        </div>
      ) : <EmptyState message="Sin procesadores registrados" />}

      <div className="asset-detail-section__title" style={{ marginTop: '1.2rem' }}><HardDrive size={12} /> Memoria RAM</div>
      {hw.memory.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.4rem' }}>
          {hw.memory.map((m, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem', backgroundColor: 'var(--color-surface-800)', borderRadius: '6px', fontSize: '0.75rem' }}>
              <span>{m.name || `Módulo ${i + 1}`}</span>
              <span style={{ fontFamily: 'var(--font-mono)' }}>{m.size_mb} MB</span>
            </div>
          ))}
        </div>
      ) : <EmptyState message="Sin módulos de memoria registrados" />}

      <div className="asset-detail-section__title" style={{ marginTop: '1.2rem' }}><HardDrive size={12} /> Almacenamiento</div>
      {(hw.hard_drives.length > 0 || disks.length > 0) ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.4rem' }}>
          {hw.hard_drives.map((d, i) => (
            <div key={`hd-${i}`} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem', backgroundColor: 'var(--color-surface-800)', borderRadius: '6px', fontSize: '0.75rem' }}>
              <span>{d.name || `Disco ${i + 1}`}</span>
              <span style={{ fontFamily: 'var(--font-mono)' }}>{d.capacity_mb >= 1024 ? `${(d.capacity_mb / 1024).toFixed(0)} GB` : `${d.capacity_mb} MB`}</span>
            </div>
          ))}
          {disks.map((d, i) => (
            <div key={`part-${i}`} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem', backgroundColor: 'var(--color-surface-800)', borderRadius: '6px', fontSize: '0.72rem' }}>
              <span>{d.mountpoint || d.name} <span style={{ color: 'var(--color-surface-500)' }}>({d.filesystem})</span></span>
              <span style={{ fontFamily: 'var(--font-mono)' }}>{d.free_mb >= 1024 ? `${(d.free_mb / 1024).toFixed(1)} GB` : `${d.free_mb} MB`} libre</span>
            </div>
          ))}
        </div>
      ) : <EmptyState message="Sin discos registrados" />}

      {hw.graphic_cards.length > 0 && (
        <>
          <div className="asset-detail-section__title" style={{ marginTop: '1.2rem' }}>🎮 Tarjetas Gráficas</div>
          <div className="asset-detail-grid">
            {hw.graphic_cards.map((g, i) => (
              <DetailRow key={i} label={`GPU ${i + 1}`} value={`${g.name} — ${g.memory_mb} MB`} />
            ))}
          </div>
        </>
      )}

      {hw.network_cards.length > 0 && (
        <>
          <div className="asset-detail-section__title" style={{ marginTop: '1.2rem' }}><Network size={12} /> Tarjetas de Red</div>
          <div className="asset-detail-grid">
            {hw.network_cards.map((n, i) => (
              <DetailRow key={i} label={n.name || `NIC ${i + 1}`} value={n.mac || '—'} mono />
            ))}
          </div>
        </>
      )}

      {hw.firmware.length > 0 && (
        <>
          <div className="asset-detail-section__title" style={{ marginTop: '1.2rem' }}>🔧 Firmware / BIOS</div>
          <div className="asset-detail-grid">
            {hw.firmware.map((f, i) => (
              <DetailRow key={i} label={`Firmware ${i + 1}`} value={f.name} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

/* ── Software Tab ──────────────────────────────────────────────── */

function SoftwareTab({ fullDetail, loading, search, onSearchChange }: {
  fullDetail: FullDetail | null; loading: boolean; search: string; onSearchChange: (v: string) => void;
}) {
  const filtered = useMemo(() => {
    if (!fullDetail) return [];
    const q = search.toLowerCase();
    return fullDetail.software.filter(sw =>
      !q || sw.name.toLowerCase().includes(q) || sw.version.toLowerCase().includes(q)
    );
  }, [fullDetail, search]);

  if (loading) return <LoadingIndicator />;
  if (!fullDetail) return <EmptyState message="Sin datos de software. El collector aún no ha sincronizado este activo." />;

  return (
    <section className="asset-detail-section animate-fade-in-up">
      <div className="asset-detail-section__title"><LayoutList size={12} /> Software Instalado ({fullDetail.software.length})</div>

      <div style={{ position: 'relative', marginTop: '0.5rem', marginBottom: '0.5rem' }}>
        <Search size={13} style={{ position: 'absolute', left: '0.6rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-surface-500)' }} />
        <input
          type="text" placeholder="Buscar software…" value={search} onChange={(e) => onSearchChange(e.target.value)}
          style={{ width: '100%', padding: '0.5rem 0.5rem 0.5rem 2rem', fontSize: '0.72rem', backgroundColor: 'var(--color-surface-800)', border: '1px solid rgba(148,163,184,0.15)', borderRadius: '6px', color: 'var(--color-surface-100)', outline: 'none' }}
        />
      </div>

      <div style={{ overflowX: 'auto', maxHeight: '400px', overflowY: 'auto' }}>
        <table className="data-table">
          <thead><tr><th>Nombre</th><th>Versión</th><th>Categoría</th></tr></thead>
          <tbody>
            {filtered.slice(0, 100).map((sw, i) => (
              <tr key={i}>
                <td style={{ fontWeight: 500, fontSize: '0.72rem', color: 'var(--color-surface-100)' }}>{sw.name || '—'}</td>
                <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem' }}>{sw.version || '—'}</td>
                <td style={{ fontSize: '0.7rem' }}>{sw.category || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length > 100 && (
          <div style={{ textAlign: 'center', fontSize: '0.7rem', color: 'var(--color-surface-500)', padding: '0.5rem' }}>
            Mostrando 100 de {filtered.length} — usá el buscador para filtrar
          </div>
        )}
      </div>
    </section>
  );
}

/* ── Audit Tab ─────────────────────────────────────────────────── */

function AuditTab({ fullDetail, loading }: { fullDetail: FullDetail | null; loading: boolean }) {
  if (loading) return <LoadingIndicator />;
  if (!fullDetail || fullDetail.audit.length === 0)
    return <EmptyState message="Sin registros de auditoría disponibles." />;

  return (
    <section className="asset-detail-section animate-fade-in-up">
      <div className="asset-detail-section__title"><FileText size={12} /> Registro de Auditoría ({fullDetail.audit.length})</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.5rem', maxHeight: '450px', overflowY: 'auto' }}>
        {fullDetail.audit.map((entry) => (
          <div key={entry.id} style={{ display: 'flex', flexDirection: 'column', padding: '0.6rem', backgroundColor: 'var(--color-surface-800)', borderRadius: '6px', fontSize: '0.72rem', gap: '0.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--color-surface-400)', fontSize: '0.65rem' }}>
              <span>{entry.date}</span>
              <span>Usuario: {entry.user || 'Sistema'}</span>
            </div>
            <div style={{ fontWeight: 500, color: 'var(--color-surface-100)' }}>{entry.field || 'Acción'}</div>
            {(entry.old_value || entry.new_value) && (
              <div style={{ color: 'var(--color-surface-300)', fontSize: '0.68rem' }}>
                {entry.old_value && <span style={{ textDecoration: 'line-through', color: 'var(--color-danger-400)' }}>{entry.old_value}</span>}
                {entry.old_value && entry.new_value && ' → '}
                {entry.new_value && <span style={{ color: 'var(--color-success-400)' }}>{entry.new_value}</span>}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

/* ── Relationships Tab ─────────────────────────────────────────── */

function RelationshipsTab({ fullDetail, loading }: { fullDetail: FullDetail | null; loading: boolean }) {
  if (loading) return <LoadingIndicator />;
  if (!fullDetail || fullDetail.relationships.length === 0)
    return <EmptyState message="Sin relaciones registradas para este activo." />;

  return (
    <section className="asset-detail-section animate-fade-in-up">
      <div className="asset-detail-section__title"><Link size={12} /> Relaciones del Equipo ({fullDetail.relationships.length})</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.5rem' }}>
        {fullDetail.relationships.map((rel, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.6rem', backgroundColor: 'var(--color-surface-800)', borderRadius: '6px', fontSize: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span className="badge badge-info" style={{ fontSize: '0.6rem' }}>{rel.type}</span>
              <span style={{ fontWeight: 500, color: 'var(--color-surface-100)' }}>{rel.target_name}</span>
            </div>
            {rel.target_type && (
              <span style={{ fontSize: '0.65rem', color: 'var(--color-surface-500)' }}>{rel.target_type}</span>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
