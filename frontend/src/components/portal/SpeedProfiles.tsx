/**
 * SpeedProfiles — Speed profile management for hotspot.
 * Shows all profiles with their rate limits. Special badge for "unregistered".
 * Quick speed toggle for unregistered users. Create/edit inline.
 */
import { useState } from 'react';
import { Plus, Zap } from 'lucide-react';
import {
  usePortalProfiles,
  useCreatePortalProfile,
  useUpdatePortalProfile,
  useUpdateUnregisteredSpeed,
} from '../../hooks/usePortalConfig';
import { ConfirmModal } from '../common/ConfirmModal';
import type { PortalProfile, PortalProfileCreate } from '../../types';

const SPEED_PRESETS = [
  { label: '512k / 512k', up: '512k', down: '512k' },
  { label: '1M / 1M', up: '1M', down: '1M' },
  { label: '5M / 5M', up: '5M', down: '5M' },
  { label: '10M / 10M', up: '10M', down: '10M' },
  { label: '25M / 25M', up: '25M', down: '25M' },
];

interface ProfileFormState {
  name: string;
  rate_limit_up: string;
  rate_limit_down: string;
  session_timeout: string;
  idle_timeout: string;
}

const EMPTY_FORM: ProfileFormState = {
  name: '',
  rate_limit_up: '10M',
  rate_limit_down: '10M',
  session_timeout: '',
  idle_timeout: '30m',
};

export function SpeedProfiles() {
  const { data: profiles = [], isLoading } = usePortalProfiles();
  const createProfile = useCreatePortalProfile();
  const updateProfile = useUpdatePortalProfile();
  const updateUnregSpeed = useUpdateUnregisteredSpeed();

  const [showForm, setShowForm] = useState(false);
  const [editProfile, setEditProfile] = useState<PortalProfile | null>(null);
  const [form, setForm] = useState<ProfileFormState>(EMPTY_FORM);
  const [confirmSpeed, setConfirmSpeed] = useState<{ up: string; down: string } | null>(null);

  const set = (field: keyof ProfileFormState) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm(prev => ({ ...prev, [field]: e.target.value }));

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setEditProfile(null);
    setShowForm(true);
  };

  const openEdit = (profile: PortalProfile) => {
    setForm({
      name: profile.name,
      rate_limit_up: profile.rate_limit_up || '',
      rate_limit_down: profile.rate_limit_down || '',
      session_timeout: profile.session_timeout || '',
      idle_timeout: profile.idle_timeout || '',
    });
    setEditProfile(profile);
    setShowForm(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editProfile) {
      updateProfile.mutate(
        { name: editProfile.name, data: form },
        { onSuccess: () => setShowForm(false) }
      );
    } else {
      const payload: PortalProfileCreate = {
        name: form.name,
        rate_limit_up: form.rate_limit_up,
        rate_limit_down: form.rate_limit_down,
        session_timeout: form.session_timeout || undefined,
        idle_timeout: form.idle_timeout || undefined,
      };
      createProfile.mutate(payload, { onSuccess: () => setShowForm(false) });
    }
  };

  const handleSpeedPreset = (preset: { up: string; down: string }) => {
    setConfirmSpeed(preset);
  };

  const applySpeedPreset = () => {
    if (!confirmSpeed) return;
    updateUnregSpeed.mutate(
      { up: confirmSpeed.up, down: confirmSpeed.down },
      { onSuccess: () => setConfirmSpeed(null) }
    );
  };

  const unregisteredProfile = profiles.find(p => p.is_unregistered);

  return (
    <div className="portal-config-section">
      <div className="portal-config-section-header">
        <div>
          <h3 className="portal-config-title">Perfiles de velocidad</h3>
          <p className="portal-config-subtitle">Define los límites de ancho de banda por perfil</p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={openCreate}>
          <Plus size={14} /> Nuevo perfil
        </button>
      </div>

      {/* Quick speed toggle for unregistered */}
      {unregisteredProfile && (
        <div className="portal-speed-toggle-section">
          <div className="portal-speed-toggle-header">
            <Zap size={14} style={{ color: 'var(--color-warning)' }} />
            <span>Velocidad para <strong>no registrados</strong> (actual: {unregisteredProfile.rate_limit || `${unregisteredProfile.rate_limit_up}↑ ${unregisteredProfile.rate_limit_down}↓`})</span>
          </div>
          <div className="portal-speed-presets">
            {SPEED_PRESETS.map(preset => (
              <button
                key={preset.label}
                className={`portal-speed-preset ${
                  unregisteredProfile.rate_limit_up === preset.up ? 'active' : ''
                }`}
                onClick={() => handleSpeedPreset(preset)}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Profiles table */}
      {isLoading ? (
        <div className="portal-loading">
          <span className="loading-spinner" /> Cargando perfiles…
        </div>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Velocidad</th>
              <th>Tiempo de sesión</th>
              <th>Inactividad</th>
              <th>Acción</th>
            </tr>
          </thead>
          <tbody>
            {profiles.map(p => (
              <tr key={p.name}>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {p.is_unregistered && (
                      <span className="badge badge-unregistered">No registrado</span>
                    )}
                    <span>{p.name}</span>
                  </div>
                </td>
                <td className="font-mono text-sm">
                  {p.rate_limit || `${p.rate_limit_up} / ${p.rate_limit_down}`}
                </td>
                <td>{p.session_timeout || '—'}</td>
                <td>{p.idle_timeout || '—'}</td>
                <td>
                  <button
                    className="btn btn-ghost btn-xs"
                    onClick={() => openEdit(p)}
                  >
                    Editar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Profile Form Modal */}
      {showForm && (
        <div className="confirm-modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowForm(false); }}>
          <div className="confirm-modal portal-form-modal animate-fade-in-up">
            <div className="confirm-modal__header">
              <h3 className="confirm-modal__title">
                {editProfile ? `Editar: ${editProfile.name}` : 'Nuevo perfil'}
              </h3>
              <button className="confirm-modal__close" onClick={() => setShowForm(false)}>×</button>
            </div>
            <form onSubmit={handleSubmit} className="confirm-modal__body">
              <div className="portal-form-grid">
                <div className="portal-form-field">
                  <label className="portal-form-label">Nombre *</label>
                  <input
                    className="portal-form-input"
                    value={form.name}
                    onChange={set('name')}
                    required
                    disabled={!!editProfile}
                    placeholder="premium"
                  />
                </div>
                <div className="portal-form-field">
                  <label className="portal-form-label">Velocidad subida</label>
                  <input className="portal-form-input" value={form.rate_limit_up} onChange={set('rate_limit_up')} placeholder="10M" />
                </div>
                <div className="portal-form-field">
                  <label className="portal-form-label">Velocidad bajada</label>
                  <input className="portal-form-input" value={form.rate_limit_down} onChange={set('rate_limit_down')} placeholder="10M" />
                </div>
                <div className="portal-form-field">
                  <label className="portal-form-label">Tiempo máx. sesión</label>
                  <input className="portal-form-input" value={form.session_timeout} onChange={set('session_timeout')} placeholder="8h" />
                </div>
                <div className="portal-form-field">
                  <label className="portal-form-label">Timeout inactividad</label>
                  <input className="portal-form-input" value={form.idle_timeout} onChange={set('idle_timeout')} placeholder="30m" />
                </div>
              </div>
              <div className="confirm-modal__actions">
                <button type="button" className="btn btn-ghost" onClick={() => setShowForm(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={createProfile.isPending || updateProfile.isPending}>
                  {(createProfile.isPending || updateProfile.isPending)
                    ? <span className="loading-spinner" />
                    : editProfile ? 'Guardar' : 'Crear'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirm speed change */}
      {confirmSpeed && (
        <ConfirmModal
          title="Cambiar velocidad de no registrados"
          description="Se actualizará el límite de velocidad para todos los usuarios no registrados en tiempo real."
          data={{ 'Nueva velocidad': `${confirmSpeed.up} ↑ / ${confirmSpeed.down} ↓` }}
          confirmLabel="Aplicar"
          variant="warning"
          onConfirm={applySpeedPreset}
          onCancel={() => setConfirmSpeed(null)}
          isLoading={updateUnregSpeed.isPending}
        />
      )}
    </div>
  );
}
