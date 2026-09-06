/**
 * UsersView — User-to-asset mapping view with CRUD.
 * Shows: user list with search + per-user asset table on click.
 * Actions: create / edit / delete user.
 */
import { useState } from 'react';
import { Users, Monitor, Mail, Building2, Search, X, Plus, Pencil, Trash2, Phone, MapPin } from 'lucide-react';
import { useGlpiUsers, useGlpiUserAssets, useDeleteGlpiUser } from '../../hooks/useGlpiUsers';
import { GlpiUserFormModal } from './GlpiUserFormModal';
import { useQueryClient } from '@tanstack/react-query';
import type { GlpiUser } from '../../types';

function UserRow({
  user,
  isSelected,
  onSelect,
  onEdit,
  onDelete,
}: {
  user: GlpiUser;
  isSelected: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
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
      <div className="user-row__info" style={{ flex: 1 }}>
        <div className="user-row__name">{user.display_name || user.name}</div>
        {user.email && (
          <div className="user-row__meta">
            <Mail size={10} /> {user.email}
          </div>
        )}
        {user.department && (
          <div className="user-row__meta">
            <Building2 size={10} /> {user.department}
            {user.title && ` · ${user.title}`}
          </div>
        )}
        {user.phone && (
          <div className="user-row__meta">
            <Phone size={10} /> {user.phone}
          </div>
        )}
        {user.location && (
          <div className="user-row__meta">
            <MapPin size={10} /> {user.location}
          </div>
        )}
      </div>

      {/* Inline actions */}
      <div
        style={{ display: 'flex', gap: '0.2rem', flexShrink: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          id={`user-edit-${user.id}`}
          className="btn btn-ghost"
          title="Editar usuario"
          style={{ padding: '0.2rem 0.35rem' }}
          onClick={onEdit}
        >
          <Pencil size={12} />
        </button>
        <button
          id={`user-delete-${user.id}`}
          className="btn btn-ghost"
          title="Eliminar usuario"
          style={{ padding: '0.2rem 0.35rem', color: 'var(--color-danger)' }}
          onClick={onDelete}
        >
          <Trash2 size={12} />
        </button>
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
  const qc = useQueryClient();
  const [selectedUser, setSelectedUser] = useState<GlpiUser | null>(null);
  const [editUser, setEditUser] = useState<GlpiUser | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [search, setSearch] = useState('');

  const { data, isLoading } = useGlpiUsers({ search: search || undefined });
  const deleteUser = useDeleteGlpiUser();

  const users = data?.users ?? [];

  function handleDelete(user: GlpiUser) {
    if (deletingId === user.id) {
      deleteUser.mutate(user.id, {
        onSuccess: () => {
          setDeletingId(null);
          if (selectedUser?.id === user.id) setSelectedUser(null);
        },
      });
    } else {
      setDeletingId(user.id);
    }
  }

  return (
    <div className="users-view">
      {/* Header toolbar */}
      <div className="glass-card users-toolbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Users size={16} style={{ color: 'var(--color-brand-400)' }} />
          <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>
            Usuarios y Equipos Asignados
          </span>
        </div>

        <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
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
              style={{ paddingLeft: 30, width: 200, fontSize: '0.8rem' }}
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

          {/* Create button */}
          <button
            id="users-create-btn"
            className="btn btn-primary"
            onClick={() => setShowCreateModal(true)}
            style={{ fontSize: '0.8rem' }}
          >
            <Plus size={14} /> Nuevo usuario
          </button>
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
              <div key={user.id}>
                <UserRow
                  user={user}
                  isSelected={selectedUser?.id === user.id}
                  onSelect={() => setSelectedUser(selectedUser?.id === user.id ? null : user)}
                  onEdit={() => setEditUser(user)}
                  onDelete={() => handleDelete(user)}
                />
                {/* Delete confirmation inline */}
                {deletingId === user.id && (
                  <div style={{
                    padding: '0.5rem 1rem',
                    background: 'rgba(239,68,68,0.08)',
                    borderTop: '1px solid rgba(239,68,68,0.2)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.6rem',
                    fontSize: '0.75rem',
                  }}>
                    <span style={{ color: '#fca5a5', flex: 1 }}>
                      ¿Eliminar a <strong>{user.display_name}</strong>?
                    </span>
                    <button
                      className="btn"
                      style={{ padding: '0.2rem 0.7rem', fontSize: '0.72rem', background: 'var(--color-danger)', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}
                      onClick={() => handleDelete(user)}
                    >
                      Confirmar
                    </button>
                    <button
                      className="btn btn-ghost"
                      style={{ padding: '0.2rem 0.5rem', fontSize: '0.72rem' }}
                      onClick={() => setDeletingId(null)}
                    >
                      Cancelar
                    </button>
                  </div>
                )}
              </div>
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

      {/* Modals */}
      {(showCreateModal || editUser) && (
        <GlpiUserFormModal
          mode={editUser ? 'edit' : 'create'}
          user={editUser ?? undefined}
          onClose={() => { setShowCreateModal(false); setEditUser(null); }}
          onSaved={() => {
            setShowCreateModal(false);
            setEditUser(null);
            qc.invalidateQueries({ queryKey: ['glpi', 'users'] });
          }}
        />
      )}
    </div>
  );
}
