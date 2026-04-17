/**
 * TelegramConfigModal — Create/edit dialog for Telegram report configs.
 * Includes CronBuilder for scheduled trigger and MessagePreview at the bottom.
 */
import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { CronBuilder } from './CronBuilder';
import { MessagePreview } from './MessagePreview';
import type { TelegramReportConfig, TelegramReportConfigCreate } from '../../types';

interface Props {
  initial?: TelegramReportConfig | null;
  onSave: (data: TelegramReportConfigCreate) => void;
  onClose: () => void;
  isLoading?: boolean;
}

const SOURCES = ['wazuh', 'mikrotik', 'crowdsec', 'suricata'];
const SOURCE_LABELS: Record<string, string> = {
  wazuh: '🛡️ Wazuh SIEM',
  mikrotik: '🖥️ MikroTik Router',
  crowdsec: '🔒 CrowdSec IPS',
  suricata: '📡 Suricata IDS',
};

export function TelegramConfigModal({ initial, onSave, onClose, isLoading }: Props) {
  const [form, setForm] = useState<TelegramReportConfigCreate>({
    name: initial?.name ?? '',
    enabled: initial?.enabled ?? true,
    trigger: initial?.trigger ?? 'scheduled',
    schedule: initial?.schedule ?? '0 8 * * *',
    sources: initial?.sources ?? ['wazuh', 'mikrotik'],
    min_severity: initial?.min_severity ?? 5,
    audience: initial?.audience ?? 'technical',
    include_summary: initial?.include_summary ?? true,
    include_charts: initial?.include_charts ?? false,
    chat_id: initial?.chat_id ?? null,
  });

  // Close on Escape
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const toggleSource = (s: string) => {
    setForm(f => ({
      ...f,
      sources: f.sources.includes(s) ? f.sources.filter(x => x !== s) : [...f.sources, s],
    }));
  };

  const lbl = (text: string) => (
    <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--color-surface-300)', marginBottom: 4 }}>
      {text}
    </label>
  );

  const inp = (style?: React.CSSProperties): React.CSSProperties => ({
    background: 'var(--color-surface-800)',
    border: '1px solid var(--color-surface-600)',
    borderRadius: 6,
    color: 'var(--color-text-primary)',
    fontSize: '0.85rem',
    padding: '0.4rem 0.6rem',
    width: '100%',
    ...style,
  });

  return (
    <div
      className="confirm-modal-overlay"
      style={{ zIndex: 9000 }}
      onClick={e => { if (e.currentTarget === e.target) onClose(); }}
    >
      <div style={{
        background: 'var(--color-surface-900)',
        border: '1px solid var(--color-surface-700)',
        borderRadius: 16,
        padding: '1.5rem',
        width: '100%',
        maxWidth: 580,
        maxHeight: '92vh',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.25rem',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>
            {initial ? 'Editar configuración' : 'Nueva configuración'}
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-surface-400)' }}>
            <X size={16} />
          </button>
        </div>

        {/* Name */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {lbl('Nombre *')}
          <input
            style={inp()}
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="Ej: Alertas Críticas Inmediatas"
          />
        </div>

        {/* Trigger */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {lbl('Disparador')}
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
            {[
              { val: 'scheduled', label: '🕐 Programado' },
              { val: 'on_alert', label: '🚨 Por alerta' },
              { val: 'on_threshold', label: '📊 Por umbral' },
            ].map(({ val, label }) => (
              <button
                key={val}
                type="button"
                onClick={() => setForm(f => ({ ...f, trigger: val as TelegramReportConfigCreate['trigger'] }))}
                style={{
                  padding: '0.3rem 0.7rem', borderRadius: 6, border: 'none', cursor: 'pointer',
                  fontSize: '0.78rem', fontWeight: 600, transition: 'all 0.15s',
                  background: form.trigger === val ? 'var(--color-brand-500)' : 'var(--color-surface-700)',
                  color: form.trigger === val ? '#fff' : 'var(--color-surface-300)',
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Schedule (only if trigger=scheduled) */}
        {form.trigger === 'scheduled' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {lbl('Horario')}
            <CronBuilder
              value={form.schedule ?? '0 8 * * *'}
              onChange={cron => setForm(f => ({ ...f, schedule: cron }))}
            />
          </div>
        )}

        {/* Sources */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {lbl('Fuentes de datos')}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem' }}>
            {SOURCES.map(s => (
              <label
                key={s}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.5rem',
                  padding: '0.4rem 0.6rem', borderRadius: 6, cursor: 'pointer',
                  background: form.sources.includes(s) ? 'rgba(99,102,241,0.12)' : 'var(--color-surface-800)',
                  border: `1px solid ${form.sources.includes(s) ? 'var(--color-brand-400)' : 'var(--color-surface-600)'}`,
                  fontSize: '0.8rem', transition: 'all 0.15s',
                }}
              >
                <input
                  type="checkbox"
                  checked={form.sources.includes(s)}
                  onChange={() => toggleSource(s)}
                  style={{ accentColor: 'var(--color-brand-500)' }}
                />
                {SOURCE_LABELS[s]}
              </label>
            ))}
          </div>
        </div>

        {/* Audience */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {lbl('Audiencia')}
          <select
            value={form.audience}
            onChange={e => setForm(f => ({ ...f, audience: e.target.value as TelegramReportConfigCreate['audience'] }))}
            style={inp()}
          >
            <option value="technical">Técnico (SOC / Infra)</option>
            <option value="executive">Ejecutivo (C-Level)</option>
            <option value="compliance">Cumplimiento (Auditoría)</option>
          </select>
        </div>

        {/* Severity */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {lbl(`Severidad mínima: ${form.min_severity}`)}
          <input
            type="range" min={1} max={15} value={form.min_severity}
            onChange={e => setForm(f => ({ ...f, min_severity: Number(e.target.value) }))}
            style={{ width: '100%', accentColor: 'var(--color-brand-500)' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--color-surface-500)' }}>
            <span>1 — Informativo</span><span>15 — Crítico</span>
          </div>
        </div>

        {/* Options */}
        <div style={{ display: 'flex', gap: '1rem' }}>
          {[
            { key: 'include_summary', label: 'Incluir resumen' },
            { key: 'include_charts', label: 'Incluir gráficos' },
          ].map(({ key, label }) => (
            <label key={key} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={Boolean(form[key as keyof TelegramReportConfigCreate])}
                onChange={e => setForm(f => ({ ...f, [key]: e.target.checked }))}
                style={{ accentColor: 'var(--color-brand-500)' }}
              />
              {label}
            </label>
          ))}
        </div>

        {/* Chat ID override */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {lbl('Chat ID destino (opcional — anula el global)')}
          <input
            style={inp()}
            value={form.chat_id ?? ''}
            onChange={e => setForm(f => ({ ...f, chat_id: e.target.value || null }))}
            placeholder="Ej: -1001234567890 (dejar vacío para usar el global)"
          />
        </div>

        {/* Preview */}
        <MessagePreview config={form as Partial<TelegramReportConfig>} />

        {/* Actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', borderTop: '1px solid var(--color-surface-700)', paddingTop: '1rem' }}>
          <button className="btn btn-ghost" onClick={onClose} disabled={isLoading}>Cancelar</button>
          <button
            className="btn btn-primary"
            onClick={() => onSave(form)}
            disabled={isLoading || !form.name.trim()}
          >
            {isLoading ? <span className="loading-spinner" /> : initial ? 'Guardar cambios' : 'Crear configuración'}
          </button>
        </div>
      </div>
    </div>
  );
}
