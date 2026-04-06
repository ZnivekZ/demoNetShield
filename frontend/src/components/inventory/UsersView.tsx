/**
 * UsersView — User-to-asset mapping view.
 * Shows: user list with search + per-user asset table on click.
 */
import { useState } from 'react';
import { Users, Monitor, Mail, Building2, Search, X } from 'lucide-react';
import { useGlpiUsers, useGlpiUserAssets } from '../../hooks/useGlpiUsers';
import type { GlpiUser } from '../../types';

function UserRow({
  user,
  isSelected,
  onSelect,
}: {
  user: GlpiUser;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <div
      id={`user-row-${user.id}`}
      className={`user-row ${isSelected ? 'user-row--selected' : ''}`}
      onClick={onSelect}
    >
      <div className="user-row__avatar">
        {(user.display_name || user.name).slice(0, 2).toUpperCase()}
      </div>
      <div className="user-row__info">
        <div className="user-row__name">{user.display_name || user.name}</div>
        {user.email && (
          <div className="user-row__meta">
            <Mail size={10} /> {user.email}
          </div>
        )}
        {user.department && (
          <div className="user-row__meta">
            <Building2 size={10} /> {user.department}
          </div>
        )}
      </div>
    </div>
  );
}

function UserAssetTable({ userId, userName }: { userId: number; userName: string }) {
  const { data: assets = [], isLoading } = useGlpiUserAssets(userId);

  return (
    <div className="user-asset-panel glass-card">
      <div className="user-asset-panel__header">
        <Monitor size={14} style={{ color: 'var(--color-brand-400)' }} />
        <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>
          Equipos de {userName}
        </span>
        <span className="user-asset-panel__count">{assets.length}</span>
      </div>

      {isLoading ? (
        <div style={{ padding: '2rem', textAlign: 'center' }}>
          <span className="loading-spinner" />
        </div>
      ) : assets.length === 0 ? (
        <div style={{ padding: '1.5rem', color: 'var(--color-surface-500)', fontSize: '0.82rem', textAlign: 'center' }}>
          Este usuario no tiene equipos asignados.
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Equipo</th>
                <th>Serial</th>
                <th>IP</th>
                <th>OS</th>
                <th>Ubicación</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {assets.map((asset) => (
                <tr key={asset.id}>
                  <td style={{ fontWeight: 500, color: 'var(--color-surface-100)' }}>{asset.name}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem' }}>{asset.serial || '—'}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem' }}>{asset.ip || '—'}</td>
                  <td style={{ fontSize: '0.72rem' }}>{asset.os || '—'}</td>
                  <td style={{ fontSize: '0.72rem' }}>{asset.location || '—'}</td>
                  <td>
                    <span className={`badge ${asset.status === 'activo' ? 'badge-success' : asset.status === 'reparacion' ? 'badge-warning' : 'badge-low'}`} style={{ fontSize: '0.62rem' }}>
                      {asset.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function UsersView() {
  const [selectedUser, setSelectedUser] = useState<GlpiUser | null>(null);
  const [search, setSearch] = useState('');
  const { data, isLoading } = useGlpiUsers({ search: search || undefined });

  const users = data?.users ?? [];
  const isMock = data?.mock;

  return (
    <div className="users-view">
      {/* Header */}
      <div className="glass-card users-toolbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Users size={16} style={{ color: 'var(--color-brand-400)' }} />
          <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>
            Usuarios y Equipos Asignados
          </span>
          {isMock && <span className="badge badge-warning" style={{ fontSize: '0.62rem' }}>Demo</span>}
        </div>

        {/* Search */}
        <div style={{ position: 'relative' }}>
          <Search size={13} style={{
            position: 'absolute', left: 9, top: '50%',
            transform: 'translateY(-50%)', color: 'var(--color-surface-400)',
          }} />
          <input
            id="users-search-input"
            className="input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar usuario…"
            style={{ paddingLeft: 30, width: 220, fontSize: '0.8rem' }}
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-surface-400)', display: 'flex' }}
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      <div className="users-layout">
        {/* Users list */}
        <div className="glass-card users-list">
          {isLoading ? (
            <div style={{ padding: '2rem', textAlign: 'center' }}>
              <span className="loading-spinner" />
            </div>
          ) : users.length === 0 ? (
            <div style={{ padding: '2rem', color: 'var(--color-surface-500)', fontSize: '0.85rem', textAlign: 'center' }}>
              {search ? 'Sin resultados' : 'No hay usuarios en GLPI.'}
            </div>
          ) : (
            users.map((user) => (
              <UserRow
                key={user.id}
                user={user}
                isSelected={selectedUser?.id === user.id}
                onSelect={() => setSelectedUser(selectedUser?.id === user.id ? null : user)}
              />
            ))
          )}
        </div>

        {/* Asset panel */}
        {selectedUser ? (
          <UserAssetTable userId={selectedUser.id} userName={selectedUser.display_name || selectedUser.name} />
        ) : (
          <div className="glass-card users-empty-panel">
            <Users size={32} style={{ color: 'var(--color-surface-600)' }} />
            <span style={{ fontSize: '0.85rem', color: 'var(--color-surface-500)' }}>
              Seleccioná un usuario para ver sus equipos
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
