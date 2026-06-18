/**
 * UserFormModal — Modal para crear o editar usuarios del dashboard.
 *
 * Modo "crear": muestra campo username + password obligatoria
 * Modo "editar": oculta username (inmutable), password opcional
 */

import { useState, useEffect } from 'react';
import { X, Eye, EyeOff } from 'lucide-react';
import type { AuthUser, UserCreate, UserUpdate } from '../../types';

interface UserFormModalProps {
  mode: 'create' | 'edit';
  user?: AuthUser | null;
  onConfirm: (data: UserCreate | UserUpdate) => Promise<void>;
  onClose: () => void;
  isLoading?: boolean;
  error?: string | null;
}

export function UserFormModal({
  mode,
  user,
  onConfirm,
  onClose,
  isLoading = false,
  error = null,
}: UserFormModalProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');

  useEffect(() => {
    if (mode === 'edit' && user) {
      setEmail(user.email ?? '');
      setFullName(user.full_name ?? '');
    }
  }, [mode, user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'create') {
      await onConfirm({
        username: username.trim(),
        password,
        email: email.trim() || undefined,
        full_name: fullName.trim() || undefined,
      } as UserCreate);
    } else {
      const data: UserUpdate = {};
      if (email.trim()) data.email = email.trim();
      if (fullName.trim()) data.full_name = fullName.trim();
      if (password.trim()) data.password = password.trim();
      await onConfirm(data);
    }
  };

  const isCreate = mode === 'create';
  const canSubmit =
    !isLoading &&
    (isCreate ? username.trim().length >= 3 && password.length >= 4 : true);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="glass-card relative z-10 w-full max-w-md mx-4 p-6 animate-fade-in-up">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2
            className="text-lg font-semibold"
            style={{ color: 'var(--color-surface-50, #f8fafc)' }}
          >
            {isCreate ? 'Nuevo usuario' : `Editar: ${user?.username}`}
          </h2>
          <button
            onClick={onClose}
            className="btn-ghost p-1.5 rounded-lg"
            aria-label="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Username — solo en modo crear */}
          {isCreate && (
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="user-form-username"
                className="text-xs font-semibold uppercase tracking-wider"
                style={{ color: 'var(--color-surface-400)' }}
              >
                Username *
              </label>
              <input
                id="user-form-username"
                type="text"
                className="input"
                placeholder="ej: operador1"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={isLoading}
                autoFocus
              />
              {isCreate && username.length > 0 && username.length < 3 && (
                <p className="text-xs" style={{ color: 'var(--color-danger)' }}>
                  Mínimo 3 caracteres
                </p>
              )}
            </div>
          )}

          {/* Password */}
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="user-form-password"
              className="text-xs font-semibold uppercase tracking-wider"
              style={{ color: 'var(--color-surface-400)' }}
            >
              {isCreate ? 'Contraseña *' : 'Nueva contraseña (opcional)'}
            </label>
            <div className="relative">
              <input
                id="user-form-password"
                type={showPassword ? 'text' : 'password'}
                className="input w-full pr-10"
                placeholder={isCreate ? '••••••••' : 'Dejar vacío para no cambiar'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-200 transition-colors"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Full name */}
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="user-form-fullname"
              className="text-xs font-semibold uppercase tracking-wider"
              style={{ color: 'var(--color-surface-400)' }}
            >
              Nombre completo
            </label>
            <input
              id="user-form-fullname"
              type="text"
              className="input"
              placeholder="ej: Juan Pérez"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              disabled={isLoading}
            />
          </div>

          {/* Email */}
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="user-form-email"
              className="text-xs font-semibold uppercase tracking-wider"
              style={{ color: 'var(--color-surface-400)' }}
            >
              Email
            </label>
            <input
              id="user-form-email"
              type="email"
              className="input"
              placeholder="ej: juan@empresa.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isLoading}
            />
          </div>

          {/* Error */}
          {error && (
            <p
              className="text-sm px-3 py-2 rounded-lg"
              style={{
                background: 'color-mix(in srgb, var(--color-danger) 12%, transparent)',
                color: 'var(--color-danger)',
                border: '1px solid color-mix(in srgb, var(--color-danger) 30%, transparent)',
              }}
            >
              {error}
            </p>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              className="btn btn-ghost flex-1"
              onClick={onClose}
              disabled={isLoading}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="btn btn-primary flex-1"
              disabled={!canSubmit}
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <span className="loading-spinner w-4 h-4" />
                  Guardando...
                </span>
              ) : isCreate ? (
                'Crear usuario'
              ) : (
                'Guardar cambios'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
