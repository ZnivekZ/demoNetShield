/**
 * TicketFormModal — Modal for creating a new GLPI ticket.
 * Optionally linked to a specific asset (asset_id).
 */
import { useState } from 'react';
import { X, Ticket } from 'lucide-react';
import { useCreateGlpiTicket } from '../../hooks/useGlpiTickets';
import type { GlpiTicketCreate } from '../../types';

interface Props {
  assetId?: number;
  assetName?: string;
  onClose: () => void;
  onCreated: () => void;
}

const PRIORITY_OPTS = [
  { value: 3, label: 'Media' },
  { value: 2, label: 'Baja' },
  { value: 4, label: 'Alta' },
  { value: 1, label: 'Muy baja' },
  { value: 5, label: 'Muy alta' },
];

const CATEGORY_OPTS = [
  { value: '', label: 'Sin categoría' },
  { value: 'red', label: 'Red' },
  { value: 'hardware', label: 'Hardware' },
  { value: 'so', label: 'Sistema Operativo' },
  { value: 'seguridad', label: 'Seguridad' },
];

export function TicketFormModal({ assetId, assetName, onClose, onCreated }: Props) {
  const createTicket = useCreateGlpiTicket();
  const [form, setForm] = useState<GlpiTicketCreate>({
    title: '',
    description: '',
    priority: 3,
    asset_id: assetId,
    category: '',
  });
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!form.title.trim()) { setError('El título es requerido'); return; }

    try {
      const res = await createTicket.mutateAsync({
        ...form,
        category: form.category || undefined,
        asset_id: form.asset_id || undefined,
      });
      if (!res.success) throw new Error(res.error ?? 'Error al crear ticket');
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido');
    }
  };

  return (
    <div className="confirm-modal-overlay">
      <div className="confirm-modal animate-fade-in-up" style={{ maxWidth: 480 }}>
        <div className="confirm-modal__header">
          <div className="confirm-modal__icon" style={{ color: 'var(--color-brand-400)' }}>
            <Ticket size={18} />
          </div>
          <h3 className="confirm-modal__title">
            Nuevo Ticket GLPI
            {assetName && <span style={{ fontSize: '0.72rem', fontWeight: 400, marginLeft: 8, color: 'var(--color-surface-400)' }}>— {assetName}</span>}
          </h3>
          <button className="confirm-modal__close" onClick={onClose}><X size={15} /></button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="confirm-modal__body" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
              <label style={{ fontSize: '0.72rem', color: 'var(--color-surface-400)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Título *
              </label>
              <input
                className="input"
                value={form.title}
                onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="Descripción breve del problema"
                autoFocus
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                <label style={{ fontSize: '0.72rem', color: 'var(--color-surface-400)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Prioridad
                </label>
                <select
                  className="input"
                  value={form.priority}
                  onChange={(e) => setForm(f => ({ ...f, priority: Number(e.target.value) }))}
                >
                  {PRIORITY_OPTS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                <label style={{ fontSize: '0.72rem', color: 'var(--color-surface-400)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Categoría
                </label>
                <select
                  className="input"
                  value={form.category ?? ''}
                  onChange={(e) => setForm(f => ({ ...f, category: e.target.value }))}
                >
                  {CATEGORY_OPTS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
              <label style={{ fontSize: '0.72rem', color: 'var(--color-surface-400)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Descripción
              </label>
              <textarea
                className="input"
                value={form.description ?? ''}
                onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Detallá el problema o requerimiento…"
                rows={4}
                style={{ minHeight: 90 }}
              />
            </div>

            {error && (
              <div style={{ color: '#fca5a5', fontSize: '0.8rem', padding: '0.5rem 0.75rem', background: 'rgba(239,68,68,0.07)', borderRadius: 8 }}>
                {error}
              </div>
            )}
          </div>

          <div className="confirm-modal__actions">
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={createTicket.isPending}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" disabled={createTicket.isPending}>
              {createTicket.isPending
                ? <span className="loading-spinner" style={{ width: 14, height: 14 }} />
                : 'Crear Ticket'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
