/**
 * UsersManagementPage — Panel de administración de usuarios del dashboard.
 *
 * Ruta: /admin/users
 * Acceso: desde SettingsDrawer (engranaje del topbar)
 *
 * Funcionalidades:
 * - Tabla de usuarios con estado activo/inactivo
 * - Toggle inline para activar/desactivar
 * - Crear usuario (modal)
 * - Editar usuario (modal)
 * - Eliminar usuario (confirmación) — no puede eliminarse a sí mismo
 */

import { useState } from 'react';
import {
  Users,
  UserPlus,
  Pencil,
  Trash2,
  ToggleLeft,
  ToggleRight,
  ShieldCheck,
} from 'lucide-react';
import { useUsers } from '../../hooks/useUsers';
import { useAuthContext } from '../auth/AuthContext';
import { UserFormModal } from './UserFormModal';
import { ConfirmModal } from '../common/ConfirmModal';
import type { AuthUser, UserCreate, UserUpdate } from '../../types';

export default function UsersManagementPage() {
  const { user: currentUser } = useAuthContext();
  const { users, isLoading, createUser, updateUser, deleteUser } = useUsers();

  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<AuthUser | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AuthUser | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleCreate = async (data: UserCreate | UserUpdate) => {
    setFormError(null);
    try {
      const res = await createUser.mutateAsync(data as UserCreate);
      if (!res.success) {
        setFormError(res.error ?? 'Error al crear usuario');
        return;
      }
      setShowCreate(false);
    } catch {
      setFormError('Error inesperado al crear usuario');
    }
  };

  const handleEdit = async (data: UserCreate | UserUpdate) => {
    if (!editTarget) return;
    setFormError(null);
    try {
      const res = await updateUser.mutateAsync({ id: editTarget.id, data: data as UserUpdate });
      if (!res.success) {
        setFormError(res.error ?? 'Error al guardar cambios');
        return;
      }
      setEditTarget(null);
    } catch {
      setFormError('Error inesperado al editar usuario');
    }
  };

  const handleToggleActive = async (user: AuthUser) => {
    await updateUser.mutateAsync({
      id: user.id,
      data: { is_active: !user.is_active },
    });
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await deleteUser.mutateAsync(deleteTarget.id);
    setDeleteTarget(null);
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-6 animate-fade-in-up">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{
              background:
                'linear-gradient(135deg, var(--color-brand-500), var(--color-brand-700))',
            }}
          >
            <Users className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1
              className="text-xl font-bold"
              style={{ color: 'var(--color-surface-50)' }}
            >
              Gestión de usuarios
            </h1>
            <p className="text-sm" style={{ color: 'var(--color-surface-400)' }}>
              Operadores del dashboard NetShield
            </p>
          </div>
        </div>

        <button
          id="create-user-btn"
          onClick={() => { setFormError(null); setShowCreate(true); }}
          className="btn btn-primary flex items-center gap-2"
        >
          <UserPlus className="w-4 h-4" />
          Nuevo usuario
        </button>
      </div>

      {/* Table */}
      <div className="glass-card p-0 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="loading-spinner w-8 h-8" />
          </div>
        ) : users.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Users className="w-10 h-10" style={{ color: 'var(--color-surface-600)' }} />
            <p style={{ color: 'var(--color-surface-400)' }}>No hay usuarios registrados</p>
          </div>
        ) : (
          <table className="data-table w-full">
            <thead>
              <tr>
                <th>Usuario</th>
                <th>Nombre / Email</th>
                <th>Creado</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  {/* Username */}
                  <td>
                    <div className="flex items-center gap-2">
                      <ShieldCheck
                        className="w-4 h-4 flex-shrink-0"
                        style={{ color: 'var(--color-brand-400)' }}
                      />
                      <span
                        className="font-mono font-medium"
                        style={{ color: 'var(--color-surface-100)' }}
                      >
                        {u.username}
                      </span>
                      {u.id === currentUser?.id && (
                        <span className="badge badge-info text-[0.6rem]">Tú</span>
                      )}
                    </div>
                  </td>

                  {/* Name / Email */}
                  <td>
                    <div className="flex flex-col">
                      <span style={{ color: 'var(--color-surface-200)' }}>
                        {u.full_name || '—'}
                      </span>
                      {u.email && (
                        <span
                          className="text-xs"
                          style={{ color: 'var(--color-surface-500)' }}
                        >
                          {u.email}
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Created at */}
                  <td>
                    <span className="text-sm" style={{ color: 'var(--color-surface-400)' }}>
                      {new Date(u.created_at).toLocaleDateString('es-AR', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                      })}
                    </span>
                  </td>

                  {/* Active toggle */}
                  <td>
                    <button
                      onClick={() => handleToggleActive(u)}
                      disabled={u.id === currentUser?.id || updateUser.isPending}
                      className="flex items-center gap-1.5 text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      title={u.id === currentUser?.id ? 'No podés desactivarte a vos mismo' : ''}
                    >
                      {u.is_active ? (
                        <>
                          <ToggleRight
                            className="w-5 h-5"
                            style={{ color: 'var(--color-success)' }}
                          />
                          <span style={{ color: 'var(--color-success)' }}>Activo</span>
                        </>
                      ) : (
                        <>
                          <ToggleLeft
                            className="w-5 h-5"
                            style={{ color: 'var(--color-surface-500)' }}
                          />
                          <span style={{ color: 'var(--color-surface-500)' }}>Inactivo</span>
                        </>
                      )}
                    </button>
                  </td>

                  {/* Actions */}
                  <td>
                    <div className="flex items-center gap-2">
                      <button
                        id={`edit-user-${u.id}`}
                        onClick={() => { setFormError(null); setEditTarget(u); }}
                        className="btn-ghost p-1.5 rounded-lg"
                        title="Editar"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        id={`delete-user-${u.id}`}
                        onClick={() => setDeleteTarget(u)}
                        className="btn-ghost p-1.5 rounded-lg"
                        style={{
                          color:
                            u.id === currentUser?.id
                              ? 'var(--color-surface-600)'
                              : 'var(--color-danger)',
                        }}
                        disabled={u.id === currentUser?.id}
                        title={
                          u.id === currentUser?.id
                            ? 'No podés eliminar tu propio usuario'
                            : 'Eliminar'
                        }
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Create Modal */}
      {showCreate && (
        <UserFormModal
          mode="create"
          onConfirm={handleCreate}
          onClose={() => { setShowCreate(false); setFormError(null); }}
          isLoading={createUser.isPending}
          error={formError}
        />
      )}

      {/* Edit Modal */}
      {editTarget && (
        <UserFormModal
          mode="edit"
          user={editTarget}
          onConfirm={handleEdit}
          onClose={() => { setEditTarget(null); setFormError(null); }}
          isLoading={updateUser.isPending}
          error={formError}
        />
      )}

      {/* Delete Confirm */}
      {deleteTarget && (
        <ConfirmModal
          title="Eliminar usuario"
          description="Esta acción es irreversible. El usuario perderá acceso al dashboard de inmediato."
          data={{
            Usuario: deleteTarget.username,
            'Nombre': deleteTarget.full_name ?? '—',
          }}
          confirmLabel="Eliminar"
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
          isLoading={deleteUser.isPending}
        />
      )}
    </div>
  );
}
