/**
 * AssetDetail — Sliding panel with full technical detail of a GLPI asset.
 * Shows: general info, network context, linked tickets, and quick actions.
 */
import { X, Server, Network, Ticket, Shield } from 'lucide-react';
import { useGlpiAsset, useGlpiAssetNetworkContext, useUnquarantineGlpiAsset } from '../../hooks/useGlpiAssets';
import { useQueryClient } from '@tanstack/react-query';
import { ConfirmModal } from '../common/ConfirmModal';
import { useState } from 'react';
import type { GlpiAsset } from '../../types';

interface Props {
  asset: GlpiAsset;
  onClose: () => void;
}

export function AssetDetail({ asset, onClose }: Props) {
  const qc = useQueryClient();
  const { data: detail, isLoading } = useGlpiAsset(asset.id);
  const { data: netCtx } = useGlpiAssetNetworkContext(asset.id);
  const unquarantine = useUnquarantineGlpiAsset();
  const [showUnquarantineConfirm, setShowUnquarantineConfirm] = useState(false);

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
          <div className="asset-detail-panel__body">
            {/* General Info */}
            <section className="asset-detail-section">
              <div className="asset-detail-section__title">
                <Server size={12} /> Información General
              </div>
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

            {/* Network Context */}
            {netCtx && (
              <section className="asset-detail-section">
                <div className="asset-detail-section__title">
                  <Network size={12} /> Contexto de Red
                </div>
                <div className="asset-detail-grid">
                  <DetailRow label="Interfaz" value={netCtx.interface || '—'} mono />
                  <DetailRow label="VLAN" value={netCtx.vlan || '—'} />
                  <DetailRow label="IP Asignada" value={netCtx.ip_assigned || '—'} mono />
                  <DetailRow label="Último visto" value={netCtx.last_seen || '—'} />
                </div>
              </section>
            )}

            {/* Tickets */}
            {tickets.length > 0 && (
              <section className="asset-detail-section">
                <div className="asset-detail-section__title">
                  <Ticket size={12} /> Tickets Vinculados ({tickets.length})
                </div>
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

            {/* Actions */}
            <section className="asset-detail-section">
              {displayAsset.status === 'bajo_investigacion' ? (
                <button
                  id="asset-detail-unquarantine"
                  className="btn btn-success"
                  style={{ width: '100%', fontSize: '0.8rem' }}
                  onClick={() => setShowUnquarantineConfirm(true)}
                >
                  <Shield size={14} /> Levantar Cuarentena
                </button>
              ) : (
                <div style={{ fontSize: '0.72rem', color: 'var(--color-surface-500)', textAlign: 'center' }}>
                  Para cuarentenar este equipo, usá la acción en la vista de Seguridad o la tabla de Activos.
                </div>
              )}
            </section>
          </div>
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

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="asset-detail-row">
      <span className="asset-detail-row__label">{label}</span>
      <span className={`asset-detail-row__value ${mono ? 'asset-detail-row__value--mono' : ''}`}>{value}</span>
    </div>
  );
}
