/**
 * GlpiUserFormModal — Modal para crear/editar usuarios GLPI.
 * Soporta modo 'create' y 'edit'.
 */
import { useState, useEffect } from 'react';
import { X, User, Mail, Phone, Building2, MapPin, Briefcase } from 'lucide-react';
import { useCreateGlpiUser, useUpdateGlpiUser } from '../../hooks/useGlpiUsers';
import type { GlpiUser, GlpiUserCreate, GlpiUserUpdate } from '../../types';

interface GlpiUserFormModalProps {
  mode: 'create' | 'edit';
  user?: GlpiUser;
  onClose: () => void;
  onSaved: () => void;
}

const DEPARTMENTS = [
  'Docentes',
  'Administrativos',
  'IT',
  'Directivos',
  'Mantenimiento',
  'Biblioteca',
  'Otro',
];

export function GlpiUserFormModal({ mode, user, onClose, onSaved }: GlpiUserFormModalProps) {
  const createUser = useCreateGlpiUser();
  const updateUser = useUpdateGlpiUser();

  const [form, setForm] = useState({
    name: '',
    firstname: '',
    realname: '',
    email: '',
    phone: '',
    department: 'IT',
    location: '',
    title: '',
    comment: '',
  });
  const [error, setError] = useState('');

  useEffect(() => {
    if (mode === 'edit' && user) {
      setForm({
        name: user.name,
        firstname: user.firstname,
        realname: user.realname,
        email: user.email ?? '',
        phone: user.phone ?? '',
        department: user.department ?? 'IT',
        location: user.location ?? '',
        title: user.title ?? '',
        comment: '',
      });
    }
  }, [mode, user]);

  const set = (field: keyof typeof form) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => setForm((prev) => ({ ...prev, [field]: e.target.value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      if (mode === 'create') {
        const payload: GlpiUserCreate = {
          name: form.name.trim(),
          firstname: form.firstname.trim(),
          realname: form.realname.trim(),
          email: form.email || undefined,
          phone: form.phone || undefined,
          department: form.department,
          location: form.location || undefined,
          title: form.title || undefined,
          comment: form.comment || undefined,
        };
        await createUser.mutateAsync(payload);
      } else if (user) {
        const payload: GlpiUserUpdate = {
          firstname: form.firstname || undefined,
          realname: form.realname || undefined,
          email: form.email || undefined,
          phone: form.phone || undefined,
          department: form.department || undefined,
          location: form.location || undefined,
          title: form.title || undefined,
        };
        await updateUser.mutateAsync({ id: user.id, data: payload });
      }
      onSaved();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al guardar el usuario';
      setError(msg);
    }
  }

  const isPending = createUser.isPending || updateUser.isPending;

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="modal-box glass-card" style={{ maxWidth: 500, width: '95vw' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <User size={18} style={{ color: 'var(--color-accent)' }} />
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>
              {mode === 'create' ? 'Nuevo usuario GLPI' : `Editar: ${user?.display_name}`}
            </h3>
          </div>
          <button id="glpi-user-modal-close" className="btn btn-ghost" onClick={onClose} style={{ padding: '0.3rem' }}>
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
          {/* Username — solo en create */}
          {mode === 'create' && (
            <div className="form-group">
              <label className="form-label" htmlFor="glpi-user-name">
                <User size={12} style={{ marginRight: 4 }} />
                Usuario (login) *
              </label>
              <input
                id="glpi-user-name"
                className="input"
                required
                minLength={2}
                value={form.name}
                onChange={set('name')}
                placeholder="ej. juan.perez"
              />
            </div>
          )}

          {/* Nombre + Apellido */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.7rem' }}>
            <div className="form-group">
              <label className="form-label" htmlFor="glpi-user-firstname">Nombre *</label>
              <input
                id="glpi-user-firstname"
                className="input"
                required
                value={form.firstname}
                onChange={set('firstname')}
                placeholder="Juan"
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="glpi-user-realname">Apellido *</label>
              <input
                id="glpi-user-realname"
                className="input"
                required
                value={form.realname}
                onChange={set('realname')}
                placeholder="Pérez"
              />
            </div>
          </div>

          {/* Email */}
          <div className="form-group">
            <label className="form-label" htmlFor="glpi-user-email">
              <Mail size={12} style={{ marginRight: 4 }} />
              Email
            </label>
            <input
              id="glpi-user-email"
              type="email"
              className="input"
              value={form.email}
              onChange={set('email')}
              placeholder="juan.perez@facultad.edu"
            />
          </div>

          {/* Teléfono + Cargo */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.7rem' }}>
            <div className="form-group">
              <label className="form-label" htmlFor="glpi-user-phone">
                <Phone size={12} style={{ marginRight: 4 }} />
                Teléfono
              </label>
              <input
                id="glpi-user-phone"
                className="input"
                value={form.phone}
                onChange={set('phone')}
                placeholder="123-4567"
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="glpi-user-title">
                <Briefcase size={12} style={{ marginRight: 4 }} />
                Cargo
              </label>
              <input
                id="glpi-user-title"
                className="input"
                value={form.title}
                onChange={set('title')}
                placeholder="Docente, Técnico..."
              />
            </div>
          </div>

          {/* Departamento */}
          <div className="form-group">
            <label className="form-label" htmlFor="glpi-user-department">
              <Building2 size={12} style={{ marginRight: 4 }} />
              Departamento *
            </label>
            <select
              id="glpi-user-department"
              className="input"
              required
              value={form.department}
              onChange={set('department')}
            >
              {DEPARTMENTS.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>

          {/* Ubicación */}
          <div className="form-group">
            <label className="form-label" htmlFor="glpi-user-location">
              <MapPin size={12} style={{ marginRight: 4 }} />
              Ubicación
            </label>
            <input
              id="glpi-user-location"
              className="input"
              value={form.location}
              onChange={set('location')}
              placeholder="Edificio B, Sala 204..."
            />
          </div>

          {error && (
            <div style={{ padding: '0.6rem 0.8rem', background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, fontSize: '0.8rem', color: '#fca5a5' }}>
              {error}
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'flex-end', marginTop: '0.4rem' }}>
            <button
              id="glpi-user-modal-cancel"
              type="button"
              className="btn btn-ghost"
              onClick={onClose}
              disabled={isPending}
            >
              Cancelar
            </button>
            <button
              id="glpi-user-modal-save"
              type="submit"
              className="btn btn-primary"
              disabled={isPending}
            >
              {isPending ? 'Guardando...' : mode === 'create' ? 'Crear usuario' : 'Guardar cambios'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
