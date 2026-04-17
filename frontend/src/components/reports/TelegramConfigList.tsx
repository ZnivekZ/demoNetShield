/**
 * TelegramConfigList — Cards of report configs with enable toggle, quick-trigger, edit, delete.
 */
import { useState } from 'react';
import { Plus, Play, Pencil, Trash2, Clock, Bell, BarChart2, ToggleLeft, ToggleRight } from 'lucide-react';
import { useTelegramConfigs } from '../../hooks/useTelegramConfigs';
import { TelegramConfigModal } from './TelegramConfigModal';
import { ConfirmModal } from '../common/ConfirmModal';
import type { TelegramReportConfig, TelegramReportConfigCreate } from '../../types';
import { formatDistanceToNow } from '../utils/time';

const TRIGGER_ICONS: Record<string, React.ReactNode> = {
  scheduled: <Clock size={13} />,
  on_alert: <Bell size={13} />,
  on_threshold: <BarChart2 size={13} />,
};
const TRIGGER_LABELS: Record<string, string> = {
  scheduled: 'Programado',
  on_alert: 'Por alerta',
  on_threshold: 'Por umbral',
};
const SOURCE_LABELS: Record<string, string> = {
  wazuh: 'Wazuh', mikrotik: 'MikroTik', crowdsec: 'CrowdSec', suricata: 'Suricata',
};

export function TelegramConfigList() {
  const { configs, create, update, remove, trigger } = useTelegramConfigs();
  const [modal, setModal] = useState<{ mode: 'create' | 'edit'; config?: TelegramReportConfig } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<TelegramReportConfig | null>(null);
  const [confirmTrigger, setConfirmTrigger] = useState<TelegramReportConfig | null>(null);

  const list = configs.data ?? [];

  const handleSave = (data: TelegramReportConfigCreate) => {
    if (modal?.mode === 'edit' && modal.config) {
      update.mutate({ id: modal.config.id, data }, { onSuccess: () => setModal(null) });
    } else {
      create.mutate(data, { onSuccess: () => setModal(null) });
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>
          Reportes automáticos ({list.length})
        </span>
        <button
          id="telegram-new-config-btn"
          className="btn btn-primary"
          style={{ gap: '0.4rem', padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
          onClick={() => setModal({ mode: 'create' })}
        >
          <Plus size={14} /> Nueva configuración
        </button>
      </div>

      {/* Loading */}
      {configs.isLoading && (
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', padding: '1rem' }}>
          <div className="loading-spinner" />
          <span style={{ color: 'var(--color-surface-400)', fontSize: '0.875rem' }}>Cargando configuraciones…</span>
        </div>
      )}

      {/* Empty state */}
      {!configs.isLoading && list.length === 0 && (
        <div style={{
          padding: '2.5rem', textAlign: 'center',
          color: 'var(--color-surface-500)', fontSize: '0.875rem',
          border: '1px dashed var(--color-surface-600)', borderRadius: 10,
        }}>
          <Clock size={32} style={{ opacity: 0.3, marginBottom: '0.75rem' }} />
          <div>Sin configuraciones de reportes automáticos.</div>
          <div style={{ marginTop: '0.5rem', fontSize: '0.8rem' }}>
            Crea una para enviar alertas y resúmenes automáticamente.
          </div>
        </div>
      )}

      {/* Config cards */}
      {list.map(cfg => (
        <div
          key={cfg.id}
          className="glass-card"
          style={{
            padding: '1rem 1.25rem',
            display: 'flex', flexDirection: 'column', gap: '0.75rem',
            opacity: cfg.enabled ? 1 : 0.55,
            transition: 'opacity 0.2s',
          }}
        >
          {/* Top row */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
              <span style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--color-text-primary)' }}>
                {cfg.name}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--color-surface-400)', fontSize: '0.75rem' }}>
                {TRIGGER_ICONS[cfg.trigger]}
                <span>{TRIGGER_LABELS[cfg.trigger]}</span>
                {cfg.schedule && <span style={{ fontFamily: 'var(--font-mono)', background: 'var(--color-surface-700)', padding: '0 0.3rem', borderRadius: 4 }}>{cfg.schedule}</span>}
              </div>
            </div>
            {/* Enable toggle */}
            <button
              onClick={() => update.mutate({ id: cfg.id, data: { enabled: !cfg.enabled } })}
              title={cfg.enabled ? 'Deshabilitar' : 'Habilitar'}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: cfg.enabled ? 'var(--color-success)' : 'var(--color-surface-500)' }}
            >
              {cfg.enabled ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}
            </button>
          </div>

          {/* Source badges */}
          <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
            {cfg.sources.map(s => (
              <span key={s} style={{
                fontSize: '0.68rem', fontWeight: 600, padding: '0.15rem 0.45rem', borderRadius: 20,
                background: 'rgba(99,102,241,0.12)', color: 'var(--color-brand-300)',
                border: '1px solid rgba(99,102,241,0.25)',
              }}>
                {SOURCE_LABELS[s] ?? s}
              </span>
            ))}
            <span style={{
              fontSize: '0.68rem', padding: '0.15rem 0.45rem', borderRadius: 20,
              background: 'var(--color-surface-700)', color: 'var(--color-surface-400)',
            }}>
              {cfg.audience === 'executive' ? 'Ejecutivo' : cfg.audience === 'compliance' ? 'Compliance' : 'Técnico'}
            </span>
          </div>

          {/* Footer row */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--color-surface-500)' }}>
              {cfg.last_triggered
                ? `Última vez: ${formatDistanceToNow(cfg.last_triggered)}`
                : 'Nunca ejecutado'}
            </span>
            <div style={{ display: 'flex', gap: '0.35rem' }}>
              <button
                className="btn btn-ghost"
                style={{ padding: '0.25rem 0.55rem', fontSize: '0.75rem', gap: '0.3rem' }}
                onClick={() => setConfirmTrigger(cfg)}
                title="Ejecutar ahora"
              >
                <Play size={12} /> Ejecutar
              </button>
              <button
                className="btn btn-ghost"
                style={{ padding: '0.25rem 0.5rem' }}
                onClick={() => setModal({ mode: 'edit', config: cfg })}
                title="Editar"
              >
                <Pencil size={12} />
              </button>
              <button
                className="btn btn-ghost"
                style={{ padding: '0.25rem 0.5rem', color: 'var(--color-danger)' }}
                onClick={() => setConfirmDelete(cfg)}
                title="Eliminar"
              >
                <Trash2 size={12} />
              </button>
            </div>
          </div>
        </div>
      ))}

      {/* Create/Edit modal */}
      {modal && (
        <TelegramConfigModal
          initial={modal.mode === 'edit' ? modal.config : null}
          onSave={handleSave}
          onClose={() => setModal(null)}
          isLoading={create.isPending || update.isPending}
        />
      )}

      {/* Delete confirm */}
      {confirmDelete && (
        <ConfirmModal
          title="Eliminar configuración"
          description={`¿Eliminar la configuración "${confirmDelete.name}"? Esta acción no se puede deshacer.`}
          data={{ Nombre: confirmDelete.name, Disparador: TRIGGER_LABELS[confirmDelete.trigger] }}
          confirmLabel="Eliminar"
          variant="danger"
          isLoading={remove.isPending}
          onConfirm={() => remove.mutate(confirmDelete.id, { onSuccess: () => setConfirmDelete(null) })}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      {/* Trigger confirm */}
      {confirmTrigger && (
        <ConfirmModal
          title="Ejecutar reporte ahora"
          description={`¿Enviar el reporte "${confirmTrigger.name}" a Telegram inmediatamente?`}
          data={{ Nombre: confirmTrigger.name, Audiencia: confirmTrigger.audience }}
          confirmLabel="Ejecutar"
          variant="warning"
          isLoading={trigger.isPending}
          onConfirm={() => trigger.mutate(confirmTrigger.id, { onSuccess: () => setConfirmTrigger(null) })}
          onCancel={() => setConfirmTrigger(null)}
        />
      )}
    </div>
  );
}
