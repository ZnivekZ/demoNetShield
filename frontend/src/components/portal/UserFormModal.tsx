/**
 * UserFormModal — Create/edit hotspot user dialog.
 * Used for both creating new users and editing existing ones.
 */
import { useState, useEffect } from 'react';
import { X, Eye, EyeOff } from 'lucide-react';
import type { PortalUser, PortalUserCreate, PortalProfile } from '../../types';

interface UserFormModalProps {
  mode: 'create' | 'edit';
  user?: PortalUser | null;
  profiles: PortalProfile[];
  isLoading?: boolean;
  onSubmit: (data: PortalUserCreate) => void;
  onClose: () => void;
}

const DEFAULT_FORM: PortalUserCreate = {
  name: '',
  password: '',
  profile: 'registered',
  mac_address: '',
  limit_uptime: '',
  limit_bytes_total: '',
  comment: '',
};

export function UserFormModal({ mode, user, profiles, isLoading, onSubmit, onClose }: UserFormModalProps) {
  const [form, setForm] = useState<PortalUserCreate>(DEFAULT_FORM);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (mode === 'edit' && user) {
      setForm({
        name: user.name,
        password: '',
        profile: user.profile,
        mac_address: user.mac_address || '',
        limit_uptime: user.limit_uptime || '',
        limit_bytes_total: user.limit_bytes_total || '',
        comment: user.comment || '',
      });
    } else {
      setForm(DEFAULT_FORM);
    }
  }, [mode, user]);

  const set = (field: keyof PortalUserCreate) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => setForm(prev => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(form);
  };

  return (
    <div className="confirm-modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="confirm-modal portal-form-modal animate-fade-in-up">
        {/* Header */}
        <div className="confirm-modal__header">
          <h3 className="confirm-modal__title">
            {mode === 'create' ? 'Nuevo usuario' : `Editar: ${user?.name}`}
          </h3>
          <button className="confirm-modal__close" onClick={onClose} aria-label="Cerrar">
            <X size={16} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="confirm-modal__body">
          <div className="portal-form-grid">
            {/* Name */}
            <div className="portal-form-field">
              <label className="portal-form-label">Nombre de usuario *</label>
              <input
                className="portal-form-input"
                type="text"
                value={form.name}
                onChange={set('name')}
                required
                disabled={mode === 'edit'}
                placeholder="juan.perez"
                autoComplete="off"
              />
              {mode === 'edit' && (
                <span className="portal-form-hint">El nombre no se puede cambiar</span>
              )}
            </div>

            {/* Password */}
            <div className="portal-form-field">
              <label className="portal-form-label">
                {mode === 'create' ? 'Contraseña *' : 'Nueva contraseña (dejar vacío para no cambiar)'}
              </label>
              <div className="portal-password-field">
                <input
                  className="portal-form-input"
                  type={showPassword ? 'text' : 'password'}
                  value={form.password}
                  onChange={set('password')}
                  required={mode === 'create'}
                  placeholder={mode === 'edit' ? 'Sin cambios' : 'Contraseña'}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  className="portal-password-toggle"
                  onClick={() => setShowPassword(v => !v)}
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                >
                  {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            {/* Profile */}
            <div className="portal-form-field">
              <label className="portal-form-label">Perfil de velocidad</label>
              <select
                className="portal-form-input portal-form-select"
                value={form.profile}
                onChange={set('profile')}
              >
                {profiles
                  .filter(p => !p.is_unregistered)
                  .map(p => (
                    <option key={p.name} value={p.name}>
                      {p.name} ({p.rate_limit || `${p.rate_limit_up}↑ / ${p.rate_limit_down}↓`})
                    </option>
                  ))}
                {profiles.length === 0 && (
                  <option value="registered">registered (predeterminado)</option>
                )}
              </select>
            </div>

            {/* MAC Address */}
            <div className="portal-form-field">
              <label className="portal-form-label">MAC address (opcional)</label>
              <input
                className="portal-form-input"
                type="text"
                value={form.mac_address}
                onChange={set('mac_address')}
                placeholder="AA:BB:CC:DD:EE:FF"
                pattern="^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$"
              />
              <span className="portal-form-hint">Si se define, solo puede conectar desde este dispositivo</span>
            </div>

            {/* Limits */}
            <div className="portal-form-field">
              <label className="portal-form-label">Límite de tiempo (opcional)</label>
              <input
                className="portal-form-input"
                type="text"
                value={form.limit_uptime}
                onChange={set('limit_uptime')}
                placeholder="8h (por sesión)"
              />
            </div>

            <div className="portal-form-field">
              <label className="portal-form-label">Límite de datos (opcional)</label>
              <input
                className="portal-form-input"
                type="text"
                value={form.limit_bytes_total}
                onChange={set('limit_bytes_total')}
                placeholder="5G (total)"
              />
            </div>

            {/* Comment */}
            <div className="portal-form-field portal-form-field--full">
              <label className="portal-form-label">Comentario</label>
              <input
                className="portal-form-input"
                type="text"
                value={form.comment}
                onChange={set('comment')}
                placeholder="Nombre real del usuario o nota"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="confirm-modal__actions">
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={isLoading}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" disabled={isLoading}>
              {isLoading
                ? <span className="loading-spinner" />
                : mode === 'create' ? 'Crear usuario' : 'Guardar cambios'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
