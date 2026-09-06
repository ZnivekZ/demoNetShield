/**
 * AssetsView — Asset inventory with search, filters, detail panel, and QR scanner.
 * Provides: search bar + status filter + asset table/grid + detail side panel + create modal.
 */
import { useState } from 'react';
import { Plus, QrCode, RefreshCw, MapPin, Pencil, Trash2 } from 'lucide-react';
import { useGlpiAssets, useDeleteGlpiAsset } from '../../hooks/useGlpiAssets';
import { useQueryClient } from '@tanstack/react-query';
import { AssetDetail } from './AssetDetail';
import { AssetFormModal } from './AssetFormModal';
import { AssetSearch } from './AssetSearch';
import { LocationMap } from './LocationMap';
import { QrScanner } from './QrScanner';
import type { GlpiAsset } from '../../types';

type ViewMode = 'list' | 'map';

const STATUS_OPTS = [
  { value: '', label: 'Todos los estados' },
  { value: 'activo', label: 'Activo' },
  { value: 'reparacion', label: 'Reparación' },
  { value: 'retirado', label: 'Retirado' },
  { value: 'pendiente', label: 'Pendiente' },
  { value: 'bajo_investigacion', label: 'Cuarentena' },
];

const TYPE_OPTS = [
  { value: '', label: 'Todos los tipos' },
  { value: 'Computer', label: '🖥 Computadora' },
  { value: 'NetworkEquipment', label: '🔌 Equipo de Red' },
  { value: 'Printer', label: '🖨 Impresora' },
  { value: 'Phone', label: '📱 Teléfono' },
  { value: 'Peripheral', label: '🖱 Periférico' },
  { value: 'Monitor', label: '🖥 Monitor' },
];

function StatusBadge({ status }: { status: string }) {
  const classes: Record<string, string> = {
    activo: 'badge-success',
    reparacion: 'badge-warning',
    retirado: 'badge-low',
    pendiente: 'badge-info',
    bajo_investigacion: 'badge-danger',
  };
  const labels: Record<string, string> = {
    activo: 'Activo',
    reparacion: 'Reparación',
    retirado: 'Retirado',
    pendiente: 'Pendiente',
    bajo_investigacion: 'Cuarentena',
  };
  return (
    <span className={`badge ${classes[status] ?? 'badge-low'}`} style={{ fontSize: '0.62rem' }}>
      {labels[status] ?? status}
    </span>
  );
}

export function AssetsView() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [selectedAsset, setSelectedAsset] = useState<GlpiAsset | null>(null);
  const [editAsset, setEditAsset] = useState<GlpiAsset | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showQrScanner, setShowQrScanner] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const deleteAsset = useDeleteGlpiAsset();

  const { data, isLoading, isError } = useGlpiAssets({
    search: search || undefined,
    status: statusFilter || undefined,
    limit: 100,
  });

  const allAssets = data?.assets ?? [];
  // Filtro por tipo client-side (el campo `type` viene del backend como string)
  const assets = typeFilter
    ? allAssets.filter(a => (a as GlpiAsset & { type?: string }).type === typeFilter)
    : allAssets;

  return (
    <div className="assets-view">
      {/* Toolbar */}
      <div className="assets-toolbar glass-card">
        <div className="assets-toolbar__left">
          <AssetSearch value={search} onChange={setSearch} />
          <select
            id="assets-status-filter"
            className="input"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ width: 180, fontSize: '0.8rem' }}
          >
            {STATUS_OPTS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <select
            id="assets-type-filter"
            className="input"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            style={{ width: 180, fontSize: '0.8rem' }}
          >
            {TYPE_OPTS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        <div className="assets-toolbar__right">
          {/* View toggle */}
          <div className="assets-view-toggle">
            <button
              id="assets-view-list"
              className={`btn btn-ghost ${viewMode === 'list' ? 'active' : ''}`}
              onClick={() => setViewMode('list')}
              style={{ padding: '0.4rem 0.6rem', fontSize: '0.75rem' }}
            >
              Lista
            </button>
            <button
              id="assets-view-map"
              className={`btn btn-ghost ${viewMode === 'map' ? 'active' : ''}`}
              onClick={() => setViewMode('map')}
              style={{ padding: '0.4rem 0.6rem', fontSize: '0.75rem' }}
            >
              <MapPin size={13} /> Mapa
            </button>
          </div>

          <button
            id="assets-qr-scan"
            className="btn btn-ghost"
            onClick={() => setShowQrScanner(true)}
            title="Escanear QR"
            style={{ fontSize: '0.75rem' }}
          >
            <QrCode size={14} /> QR
          </button>

          <button
            id="assets-refresh"
            className="btn btn-ghost"
            onClick={() => qc.invalidateQueries({ queryKey: ['glpi', 'assets'] })}
            style={{ fontSize: '0.75rem' }}
          >
            <RefreshCw size={14} />
          </button>

          <button
            id="assets-create-btn"
            className="btn btn-primary"
            onClick={() => setShowCreateModal(true)}
            style={{ fontSize: '0.8rem' }}
          >
            <Plus size={14} /> Registrar equipo
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="assets-content-wrapper">
        {/* Main area */}
        <div className={`assets-main ${selectedAsset ? 'assets-main--panel-open' : ''}`}>
          {viewMode === 'map' ? (
            <LocationMap onSelectAsset={(asset) => {
              setSelectedAsset(asset);
              setViewMode('list');
            }} />
          ) : (
            <div className="glass-card" style={{ overflow: 'hidden' }}>
              {isError && (
                <div style={{ padding: '1rem', color: '#fca5a5', fontSize: '0.85rem' }}>
                  Error al conectar con GLPI. Verifique la configuración.
                </div>
              )}
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Equipo</th>
                      <th>Serial</th>
                      <th>IP</th>
                      <th>OS</th>
                      <th>Ubicación</th>
                      <th>Usuario</th>
                      <th>Estado</th>
                      <th style={{ width: 80, textAlign: 'center' }}>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isLoading ? (
                      <tr>
                        <td colSpan={7} style={{ textAlign: 'center', padding: '2rem' }}>
                          <span className="loading-spinner" />
                        </td>
                      </tr>
                    ) : assets.length === 0 ? (
                      <tr>
                        <td colSpan={7} style={{ textAlign: 'center', color: 'var(--color-surface-500)', padding: '2rem', fontSize: '0.85rem' }}>
                          {search ? `Sin resultados para "${search}"` : typeFilter ? `Sin activos del tipo seleccionado` : 'No hay activos en el inventario.'}
                        </td>
                      </tr>
                    ) : (
                      assets.map((asset) => (
                        <tr
                          key={asset.id}
                          style={{ cursor: 'pointer' }}
                          onClick={() => setSelectedAsset(asset)}
                          className={selectedAsset?.id === asset.id ? 'assets-row--selected' : ''}
                        >
                          <td style={{ fontWeight: 500, color: 'var(--color-surface-100)' }}>
                            {asset.name}
                          </td>
                          <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem' }}>{asset.serial || '—'}</td>
                          <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem' }}>{asset.ip || '—'}</td>
                          <td style={{ fontSize: '0.72rem' }}>{asset.os || '—'}</td>
                          <td style={{ fontSize: '0.72rem' }}>{asset.location || '—'}</td>
                          <td style={{ fontSize: '0.72rem' }}>{asset.assigned_user || '—'}</td>
                          <td><StatusBadge status={asset.status} /></td>
                          <td style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                            <div style={{ display: 'flex', gap: '0.3rem', justifyContent: 'center' }}>
                              <button
                                id={`asset-edit-${asset.id}`}
                                className="btn btn-ghost"
                                title="Editar"
                                style={{ padding: '0.2rem 0.4rem' }}
                                onClick={() => setEditAsset(asset)}
                              >
                                <Pencil size={12} />
                              </button>
                              {deletingId === asset.id ? (
                                <>
                                  <button
                                    className="btn"
                                    style={{ padding: '0.2rem 0.4rem', fontSize: '0.65rem', background: 'var(--color-danger)', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}
                                    onClick={() => {
                                      deleteAsset.mutate(asset.id, {
                                        onSuccess: () => {
                                          setDeletingId(null);
                                          if (selectedAsset?.id === asset.id) setSelectedAsset(null);
                                        },
                                      });
                                    }}
                                  >
                                    ✓
                                  </button>
                                  <button
                                    className="btn btn-ghost"
                                    style={{ padding: '0.2rem 0.4rem', fontSize: '0.65rem' }}
                                    onClick={() => setDeletingId(null)}
                                  >
                                    ✗
                                  </button>
                                </>
                              ) : (
                                <button
                                  id={`asset-delete-${asset.id}`}
                                  className="btn btn-ghost"
                                  title="Eliminar"
                                  style={{ padding: '0.2rem 0.4rem', color: 'var(--color-danger)' }}
                                  onClick={() => setDeletingId(asset.id)}
                                >
                                  <Trash2 size={12} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              {assets.length > 0 && (
                <div style={{ padding: '0.5rem 1rem', fontSize: '0.72rem', color: 'var(--color-surface-500)', borderTop: '1px solid rgba(148,163,184,0.06)' }}>
                  {assets.length} equipo{assets.length !== 1 ? 's' : ''} encontrado{assets.length !== 1 ? 's' : ''}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Detail Panel */}
        {selectedAsset && (
          <AssetDetail
            asset={selectedAsset}
            onClose={() => setSelectedAsset(null)}
          />
        )}
      </div>

      {/* Modals */}
      {(showCreateModal || editAsset) && (
        <AssetFormModal
          mode={editAsset ? 'edit' : 'create'}
          asset={editAsset ?? undefined}
          onClose={() => { setShowCreateModal(false); setEditAsset(null); }}
          onSaved={() => {
            setShowCreateModal(false);
            setEditAsset(null);
            qc.invalidateQueries({ queryKey: ['glpi', 'assets'] });
          }}
        />
      )}

      {showQrScanner && (
        <QrScanner
          onResult={(result) => {
            setShowQrScanner(false);
            // If QR contains a GLPI ID, select that asset
            if (result.assetId) {
              const found = assets.find((a) => a.id === result.assetId);
              if (found) setSelectedAsset(found);
            } else if (result.serial) {
              setSearch(result.serial);
            }
          }}
          onClose={() => setShowQrScanner(false)}
        />
      )}
    </div>
  );
}
