/**
 * AssignmentsView — Vista de asignaciones equipo↔usuario.
 * Permite ver todos los activos con su usuario asignado y reasignar.
 */
import { useState } from 'react';
import { Link2, User, Monitor, RefreshCw, Search, X, UserPlus } from 'lucide-react';
import { useGlpiAssets, useAssignGlpiAsset } from '../../hooks/useGlpiAssets';
import { useGlpiUsers } from '../../hooks/useGlpiUsers';
import { useQueryClient } from '@tanstack/react-query';
import type { GlpiAsset } from '../../types';

function AssignmentStatusBadge({ user }: { user: string }) {
  if (!user) {
    return (
      <span className="badge badge-low" style={{ fontSize: '0.62rem' }}>
        Sin asignar
      </span>
    );
  }
  return (
    <span className="badge badge-info" style={{ fontSize: '0.62rem' }}>
      {user}
    </span>
  );
}

interface AssignModalProps {
  asset: GlpiAsset;
  onClose: () => void;
}

function AssignModal({ asset, onClose }: AssignModalProps) {
  const { data: usersData } = useGlpiUsers();
  const assignAsset = useAssignGlpiAsset();
  const [selectedUserId, setSelectedUserId] = useState<number | ''>(
    asset.assigned_user ? '' : ''
  );
  const [isPending, setIsPending] = useState(false);

  const users = usersData?.users ?? [];

  async function handleAssign() {
    setIsPending(true);
    try {
      await assignAsset.mutateAsync({
        assetId: asset.id,
        data: { user_id: selectedUserId === '' ? null : selectedUserId as number },
      });
      onClose();
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="modal-box glass-card" style={{ maxWidth: 420, width: '95vw' }}>
        <div style={{ marginBottom: '1.2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.3rem' }}>
            <UserPlus size={18} style={{ color: 'var(--color-accent)' }} />
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>Asignar equipo</h3>
          </div>
          <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--color-surface-400)' }}>
            <Monitor size={11} style={{ marginRight: 4 }} />
            {asset.name}
          </p>
        </div>

        <div className="form-group" style={{ marginBottom: '1.2rem' }}>
          <label className="form-label" htmlFor="assign-user-select">
            <User size={12} style={{ marginRight: 4 }} />
            Seleccionar usuario
          </label>
          <select
            id="assign-user-select"
            className="input"
            value={selectedUserId}
            onChange={(e) => setSelectedUserId(e.target.value === '' ? '' : Number(e.target.value))}
          >
            <option value="">— Sin asignar —</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.display_name || u.name} ({u.department})
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'flex-end' }}>
          <button
            id="assign-modal-cancel"
            type="button"
            className="btn btn-ghost"
            onClick={onClose}
            disabled={isPending}
          >
            Cancelar
          </button>
          <button
            id="assign-modal-save"
            type="button"
            className="btn btn-primary"
            onClick={handleAssign}
            disabled={isPending}
          >
            {isPending ? 'Guardando...' : 'Guardar asignación'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function AssignmentsView() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [filterAssigned, setFilterAssigned] = useState<'' | 'assigned' | 'unassigned'>('');
  const [assigningAsset, setAssigningAsset] = useState<GlpiAsset | null>(null);

  const { data, isLoading } = useGlpiAssets({ search: search || undefined, limit: 200 });

  const allAssets = data?.assets ?? [];
  const assets = filterAssigned === 'assigned'
    ? allAssets.filter((a) => !!a.assigned_user)
    : filterAssigned === 'unassigned'
    ? allAssets.filter((a) => !a.assigned_user)
    : allAssets;

  const assignedCount = allAssets.filter((a) => !!a.assigned_user).length;
  const unassignedCount = allAssets.length - assignedCount;

  return (
    <div className="assignments-view">
      {/* Header */}
      <div className="glass-card" style={{ padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.6rem', marginBottom: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Link2 size={16} style={{ color: 'var(--color-brand-400)' }} />
          <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>Asignaciones Equipo → Usuario</span>
          {data?.mock && <span className="badge badge-warning" style={{ fontSize: '0.62rem' }}>Demo</span>}
        </div>

        {/* Stats */}
        <div style={{ display: 'flex', gap: '0.6rem', fontSize: '0.75rem', color: 'var(--color-surface-400)' }}>
          <span style={{ color: 'var(--color-success)' }}>✓ {assignedCount} asignados</span>
          <span>·</span>
          <span style={{ color: 'var(--color-warning)' }}>! {unassignedCount} sin asignar</span>
        </div>

        {/* Controls */}
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <div style={{ position: 'relative' }}>
            <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-surface-400)' }} />
            <input
              id="assignments-search"
              className="input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar equipo…"
              style={{ paddingLeft: 30, width: 180, fontSize: '0.8rem' }}
            />
            {search && (
              <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-surface-400)', display: 'flex' }}>
                <X size={12} />
              </button>
            )}
          </div>
          <select
            id="assignments-filter"
            className="input"
            value={filterAssigned}
            onChange={(e) => setFilterAssigned(e.target.value as '' | 'assigned' | 'unassigned')}
            style={{ fontSize: '0.8rem', width: 160 }}
          >
            <option value="">Todos</option>
            <option value="assigned">Asignados</option>
            <option value="unassigned">Sin asignar</option>
          </select>
          <button
            id="assignments-refresh"
            className="btn btn-ghost"
            onClick={() => qc.invalidateQueries({ queryKey: ['glpi', 'assets'] })}
            style={{ fontSize: '0.75rem' }}
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="glass-card" style={{ overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Equipo</th>
                <th>Serial</th>
                <th>IP</th>
                <th>Ubicación</th>
                <th>Estado</th>
                <th>Usuario asignado</th>
                <th style={{ width: 100, textAlign: 'center' }}>Asignar</th>
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
                    {search ? `Sin resultados para "${search}"` : 'No hay activos.'}
                  </td>
                </tr>
              ) : (
                assets.map((asset) => (
                  <tr key={asset.id}>
                    <td style={{ fontWeight: 500, color: 'var(--color-surface-100)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <Monitor size={12} style={{ color: 'var(--color-surface-500)', flexShrink: 0 }} />
                        {asset.name}
                      </div>
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem' }}>{asset.serial || '—'}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem' }}>{asset.ip || '—'}</td>
                    <td style={{ fontSize: '0.72rem' }}>{asset.location || '—'}</td>
                    <td>
                      <span className={`badge ${asset.status === 'activo' ? 'badge-success' : asset.status === 'reparacion' ? 'badge-warning' : 'badge-low'}`} style={{ fontSize: '0.62rem' }}>
                        {asset.status}
                      </span>
                    </td>
                    <td>
                      <AssignmentStatusBadge user={asset.assigned_user} />
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <button
                        id={`assign-btn-${asset.id}`}
                        className="btn btn-ghost"
                        style={{ fontSize: '0.72rem', padding: '0.2rem 0.6rem' }}
                        onClick={() => setAssigningAsset(asset)}
                      >
                        <UserPlus size={12} />
                        {asset.assigned_user ? ' Cambiar' : ' Asignar'}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {assets.length > 0 && (
          <div style={{ padding: '0.5rem 1rem', fontSize: '0.72rem', color: 'var(--color-surface-500)', borderTop: '1px solid rgba(148,163,184,0.06)' }}>
            {assets.length} equipo{assets.length !== 1 ? 's' : ''}
          </div>
        )}
      </div>

      {/* Assign modal */}
      {assigningAsset && (
        <AssignModal
          asset={assigningAsset}
          onClose={() => setAssigningAsset(null)}
        />
      )}
    </div>
  );
}
