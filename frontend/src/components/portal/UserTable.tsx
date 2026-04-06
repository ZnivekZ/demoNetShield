/**
 * UserTable — Table of registered hotspot users.
 * Edit/Delete actions behind UserFormModal and ConfirmModal respectively.
 * Disable toggle inline. Expandable row for per-user stats.
 */
import { useState } from 'react';
import { Pencil, Trash2, WifiOff, ChevronDown, ChevronRight, UserCheck, UserX } from 'lucide-react';
import { ConfirmModal } from '../common/ConfirmModal';
import { UserFormModal } from './UserFormModal';
import {
  useUpdatePortalUser,
  useDeletePortalUser,
  useDisconnectPortalUser,
} from '../../hooks/usePortalUsers';
import type { PortalUser, PortalProfile, PortalUserCreate } from '../../types';

interface UserTableProps {
  users: PortalUser[];
  profiles: PortalProfile[];
}

function RelativeTime({ dateStr }: { dateStr: string }) {
  if (!dateStr) return <span className="text-muted">—</span>;
  return <span title={dateStr}>{dateStr.slice(0, 10)}</span>;
}

export function UserTable({ users, profiles }: UserTableProps) {
  const [editUser, setEditUser] = useState<PortalUser | null>(null);
  const [deleteUser, setDeleteUser] = useState<PortalUser | null>(null);
  const [disconnectUser, setDisconnectUser] = useState<PortalUser | null>(null);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const updateMutation = useUpdatePortalUser();
  const deleteMutation = useDeletePortalUser();
  const disconnectMutation = useDisconnectPortalUser();

  const handleEdit = (data: PortalUserCreate) => {
    if (!editUser) return;
    const payload = { ...data };
    if (!payload.password) delete (payload as Partial<typeof payload>).password;
    updateMutation.mutate(
      { username: editUser.name, data: payload },
      { onSuccess: () => setEditUser(null) }
    );
  };

  const handleDelete = () => {
    if (!deleteUser) return;
    deleteMutation.mutate(deleteUser.name, { onSuccess: () => setDeleteUser(null) });
  };

  const handleDisconnect = () => {
    if (!disconnectUser) return;
    disconnectMutation.mutate(disconnectUser.name, { onSuccess: () => setDisconnectUser(null) });
  };

  const toggleRow = (name: string) =>
    setExpandedRow(prev => (prev === name ? null : name));

  return (
    <>
      <table className="data-table">
        <thead>
          <tr>
            <th style={{ width: 24 }} />
            <th>Usuario</th>
            <th>Perfil</th>
            <th>MAC</th>
            <th>Límites</th>
            <th>Estado</th>
            <th>Registrado</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {users.length === 0 ? (
            <tr>
              <td colSpan={8} className="portal-table-empty">
                Sin usuarios registrados
              </td>
            </tr>
          ) : (
            users.map(user => (
              <>
                <tr
                  key={user.name}
                  className={`portal-user-row ${user.disabled ? 'portal-user-disabled' : ''}`}
                >
                  <td>
                    <button
                      className="portal-expand-btn"
                      onClick={() => toggleRow(user.name)}
                      aria-label="Expandir"
                    >
                      {expandedRow === user.name
                        ? <ChevronDown size={13} />
                        : <ChevronRight size={13} />}
                    </button>
                  </td>
                  <td>
                    <div className="portal-user-cell">
                      {user.disabled
                        ? <UserX size={13} style={{ color: 'var(--color-danger)' }} />
                        : <UserCheck size={13} style={{ color: 'var(--color-success)' }} />}
                      <span>{user.name}</span>
                      {user.comment && (
                        <span className="portal-mac">{user.comment}</span>
                      )}
                    </div>
                  </td>
                  <td>
                    <span className="badge badge-registered">{user.profile}</span>
                  </td>
                  <td className="font-mono text-xs">{user.mac_address || '—'}</td>
                  <td className="text-xs">
                    {user.limit_uptime && <div>⏱ {user.limit_uptime}</div>}
                    {user.limit_bytes_total && <div>📦 {user.limit_bytes_total}</div>}
                    {!user.limit_uptime && !user.limit_bytes_total && '—'}
                  </td>
                  <td>
                    <span
                      className={`badge ${user.disabled ? 'badge-unregistered' : 'badge-registered'}`}
                    >
                      {user.disabled ? 'Deshabilitado' : 'Activo'}
                    </span>
                  </td>
                  <td>
                    <RelativeTime dateStr={user.created_at || ''} />
                  </td>
                  <td>
                    <div className="portal-action-group">
                      <button
                        className="btn btn-ghost btn-xs"
                        onClick={() => setEditUser(user)}
                        title="Editar"
                      >
                        <Pencil size={12} />
                      </button>
                      <button
                        className="btn btn-ghost btn-xs"
                        onClick={() => setDisconnectUser(user)}
                        title="Desconectar sesión activa"
                      >
                        <WifiOff size={12} />
                      </button>
                      <button
                        className="btn btn-danger btn-xs"
                        onClick={() => setDeleteUser(user)}
                        title="Eliminar usuario"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </td>
                </tr>

                {/* Expanded row — mini stats */}
                {expandedRow === user.name && (
                  <tr key={`${user.name}-expanded`} className="portal-expanded-row">
                    <td colSpan={8}>
                      <div className="portal-user-stats">
                        <div className="portal-user-stat">
                          <span className="portal-stat-label">Total sesiones</span>
                          <span className="portal-stat-value-sm">{user.total_sessions}</span>
                        </div>
                        <div className="portal-user-stat">
                          <span className="portal-stat-label">Última conexión</span>
                          <span className="portal-stat-value-sm">{user.last_seen || '—'}</span>
                        </div>
                        <div className="portal-user-stat">
                          <span className="portal-stat-label">Creado por</span>
                          <span className="portal-stat-value-sm">{user.created_by || '—'}</span>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))
          )}
        </tbody>
      </table>

      {/* Edit Modal */}
      {editUser && (
        <UserFormModal
          mode="edit"
          user={editUser}
          profiles={profiles}
          isLoading={updateMutation.isPending}
          onSubmit={handleEdit}
          onClose={() => setEditUser(null)}
        />
      )}

      {/* Delete Confirm */}
      {deleteUser && (
        <ConfirmModal
          title="Eliminar usuario"
          description="Se eliminará el usuario permanentemente del Hotspot. Esta acción no se puede deshacer."
          data={{ Usuario: deleteUser.name, Perfil: deleteUser.profile }}
          confirmLabel="Eliminar"
          variant="danger"
          onConfirm={handleDelete}
          onCancel={() => setDeleteUser(null)}
          isLoading={deleteMutation.isPending}
        />
      )}

      {/* Disconnect Confirm */}
      {disconnectUser && (
        <ConfirmModal
          title="Desconectar usuario"
          description="Se cerrará la sesión activa. El usuario podrá reconectarse inmediatamente."
          data={{ Usuario: disconnectUser.name }}
          confirmLabel="Desconectar"
          variant="warning"
          onConfirm={handleDisconnect}
          onCancel={() => setDisconnectUser(null)}
          isLoading={disconnectMutation.isPending}
        />
      )}
    </>
  );
}
