/**
 * AssetFormModal — Modal for creating or editing a GLPI asset.
 * Modes: 'create' | 'edit'
 */
import { useState } from 'react';
import { X, Server } from 'lucide-react';
import { useCreateGlpiAsset, useUpdateGlpiAsset, useGlpiLocations } from '../../hooks/useGlpiAssets';
import type { GlpiAsset, GlpiAssetCreate, GlpiAssetUpdate, GlpiAssetStatus } from '../../types';

interface Props {
  mode: 'create' | 'edit';
  asset?: GlpiAsset;
  onClose: () => void;
  onSaved: () => void;
}

const STATUS_OPTS: { value: GlpiAssetStatus; label: string }[] = [
  { value: 'activo', label: 'Activo' },
  { value: 'reparacion', label: 'En Reparación' },
  { value: 'retirado', label: 'Retirado' },
  { value: 'pendiente', label: 'Pendiente' },
];

export function AssetFormModal({ mode, asset, onClose, onSaved }: Props) {
  const createMutation = useCreateGlpiAsset();
  const updateMutation = useUpdateGlpiAsset();
  const { data: locations = [] } = useGlpiLocations();

  const [form, setForm] = useState<GlpiAssetCreate>({
    name: asset?.name ?? '',
    serial: asset?.serial ?? '',
    ip: asset?.ip ?? '',
    mac: asset?.mac ?? '',
    os: asset?.os ?? '',
    cpu: asset?.cpu ?? '',
    ram_gb: asset?.ram ?? '',
    location_id: asset?.location_id ?? undefined,
    status: (asset?.status as GlpiAssetStatus) ?? 'activo',
    comment: asset?.comment ?? '',
  });

  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!form.name.trim()) { setError('El nombre es requerido'); return; }

    try {
      if (mode === 'create') {
        const res = await createMutation.mutateAsync(form);
        if (!res.success) throw new Error(res.error ?? 'Error al crear');
      } else if (asset) {
        const update: GlpiAssetUpdate = {
          name: form.name,
          status: form.status,
          location_id: form.location_id,
          comment: form.comment,
        };
        const res = await updateMutation.mutateAsync({ id: asset.id, data: update });
        if (!res.success) throw new Error(res.error ?? 'Error al actualizar');
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido');
    }
  };

  const isLoading = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="confirm-modal-overlay">
      <div className="confirm-modal animate-fade-in-up" style={{ maxWidth: 520 }}>
        {/* Header */}
        <div className="confirm-modal__header">
          <div className="confirm-modal__icon" style={{ color: 'var(--color-brand-400)' }}>
            <Server size={18} />
          </div>
          <h3 className="confirm-modal__title">
            {mode === 'create' ? 'Registrar Nuevo Equipo' : `Editar: ${asset?.name}`}
          </h3>
          <button className="confirm-modal__close" onClick={onClose}>
            <X size={15} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <div className="confirm-modal__body" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <FormField label="Nombre *">
              <input className="input" value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} placeholder="ej: PC-Lab-001" />
            </FormField>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <FormField label="Serial">
                <input className="input" value={form.serial ?? ''} onChange={(e) => setForm(f => ({ ...f, serial: e.target.value }))} placeholder="NúmeroSerial" />
              </FormField>
              <FormField label="Estado">
                <select className="input" value={form.status} onChange={(e) => setForm(f => ({ ...f, status: e.target.value as GlpiAssetStatus }))}>
                  {STATUS_OPTS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                </select>
              </FormField>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <FormField label="IP">
                <input className="input" value={form.ip ?? ''} onChange={(e) => setForm(f => ({ ...f, ip: e.target.value }))} placeholder="192.168.1.10" />
              </FormField>
              <FormField label="MAC">
                <input className="input" value={form.mac ?? ''} onChange={(e) => setForm(f => ({ ...f, mac: e.target.value }))} placeholder="AA:BB:CC:DD:EE:FF" />
              </FormField>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <FormField label="Sistema Operativo">
                <input className="input" value={form.os ?? ''} onChange={(e) => setForm(f => ({ ...f, os: e.target.value }))} placeholder="Ubuntu 22.04" />
              </FormField>
              <FormField label="RAM (GB)">
                <input className="input" value={form.ram_gb ?? ''} onChange={(e) => setForm(f => ({ ...f, ram_gb: e.target.value }))} placeholder="16" />
              </FormField>
            </div>

            <FormField label="Ubicación">
              <select
                className="input"
                value={form.location_id ?? ''}
                onChange={(e) => setForm(f => ({ ...f, location_id: e.target.value ? Number(e.target.value) : undefined }))}
              >
                <option value="">Sin ubicación</option>
                {locations.map(loc => (
                  <option key={loc.id} value={loc.id}>{loc.completename || loc.name}</option>
                ))}
              </select>
            </FormField>

            <FormField label="Comentario">
              <textarea
                className="input"
                value={form.comment ?? ''}
                onChange={(e) => setForm(f => ({ ...f, comment: e.target.value }))}
                placeholder="Notas adicionales…"
                rows={2}
                style={{ minHeight: 60 }}
              />
            </FormField>

            {error && (
              <div style={{ color: '#fca5a5', fontSize: '0.8rem', padding: '0.5rem 0.75rem', background: 'rgba(239,68,68,0.07)', borderRadius: 8 }}>
                {error}
              </div>
            )}
          </div>

          <div className="confirm-modal__actions">
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={isLoading}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" disabled={isLoading}>
              {isLoading ? <span className="loading-spinner" style={{ width: 14, height: 14 }} /> : (mode === 'create' ? 'Registrar' : 'Guardar')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
      <label style={{ fontSize: '0.72rem', color: 'var(--color-surface-400)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {label}
      </label>
      {children}
    </div>
  );
}
