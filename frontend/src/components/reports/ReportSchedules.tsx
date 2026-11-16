import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Clock, Plus, Trash2, Play, ToggleLeft, ToggleRight, Loader2, AlertCircle, X } from 'lucide-react';
import { reportsApi } from '../../services/api';
import type { ReportSchedule } from '../../types';

const CRON_PRESETS = [
  { label: 'Diario (08:00)', value: '0 8 * * *' },
  { label: 'Semanal (Lunes 08:00)', value: '0 8 * * 1' },
  { label: 'Quincenal (1° y 15°)', value: '0 8 1,15 * *' },
  { label: 'Mensual (día 1)', value: '0 8 1 * *' },
];

const AUDIENCE_OPTIONS = [
  { value: 'executive', label: 'Ejecutivo' },
  { value: 'technical', label: 'Técnico' },
  { value: 'operational', label: 'Operacional' },
];

const EMPTY_FORM = {
  name: '',
  cron_expression: '0 8 * * 1',
  prompt: '',
  audience: 'technical',
  data_sources: [] as string[],
  enabled: true,
};

type FormState = typeof EMPTY_FORM;

export function ReportSchedules({ onReview }: { onReview: (preparationId: string) => void }) {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [triggeringId, setTriggeringId] = useState<number | null>(null);
  const sourcesQuery = useQuery({ queryKey: ['report-sources'], queryFn: reportsApi.getSources });
  const DATA_SOURCE_OPTIONS = (sourcesQuery.data?.data ?? []).map(source => ({ id: source.id, label: source.label, tooltip: source.group }));

  const { data, isLoading, isError } = useQuery({
    queryKey: ['report-schedules'],
    queryFn: () => reportsApi.listSchedules(),
    staleTime: 30_000,
  });
  const pendingQuery = useQuery({ queryKey: ['scheduled-preparations'], queryFn: reportsApi.listScheduledPreparations,
    staleTime: 30_000 });
  const pending = pendingQuery.data?.data ?? [];

  const schedules: ReportSchedule[] = data?.data ?? [];

  const createMutation = useMutation({
    mutationFn: (d: Partial<ReportSchedule>) => reportsApi.createSchedule(d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['report-schedules'] });
      setShowForm(false);
      setForm(EMPTY_FORM);
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: number; enabled: boolean }) =>
      reportsApi.updateSchedule(id, { enabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['report-schedules'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => reportsApi.deleteSchedule(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['report-schedules'] }),
  });

  const triggerMutation = useMutation({
    mutationFn: (id: number) => reportsApi.triggerSchedule(id),
    onSuccess: () => {
      setTriggeringId(null);
      qc.invalidateQueries({ queryKey: ['report-schedules'] });
      qc.invalidateQueries({ queryKey: ['scheduled-preparations'] });
    },
  });

  const handleSubmit = () => {
    if (!form.name || !form.prompt || form.data_sources.length === 0) return;
    createMutation.mutate({ ...form } as Partial<ReportSchedule>);
  };

  const toggleSource = (id: string) => {
    setForm(prev => ({
      ...prev,
      data_sources: prev.data_sources.includes(id)
        ? prev.data_sources.filter(s => s !== id)
        : [...prev.data_sources, id],
    }));
  };

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
        <Loader2 size={24} style={{ color: 'var(--color-surface-400)', animation: 'spin 1s linear infinite' }} />
      </div>
    );
  }

  if (isError) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '2rem', color: 'var(--color-danger-400)' }}>
        <AlertCircle size={16} /><span style={{ fontSize: '0.85rem' }}>Error cargando programaciones</span>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--color-surface-100)', margin: 0 }}>
            Preparación programada
          </h2>
          <p style={{ fontSize: '0.72rem', color: 'var(--color-surface-400)', marginTop: 2 }}>
            Recoge datos según un horario. Revisá el prompt antes de enviar a Groq.
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          style={{
            display: 'flex', alignItems: 'center', gap: '0.35rem',
            padding: '0.45rem 0.85rem', borderRadius: 7,
            background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.35)',
            color: 'var(--color-brand-300)', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600,
          }}
        >
          {showForm ? <X size={13} /> : <Plus size={13} />}
          {showForm ? 'Cancelar' : 'Nuevo'}
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <div style={{
          padding: '1rem', borderRadius: 10,
          background: 'var(--color-surface-800)', border: '1px solid rgba(99,102,241,0.25)',
          display: 'flex', flexDirection: 'column', gap: '0.75rem',
        }}>
          <p style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--color-brand-300)', margin: 0 }}>
            Nueva Programación
          </p>

          {/* Name */}
          <div>
            <label style={{ fontSize: '0.68rem', color: 'var(--color-surface-400)', display: 'block', marginBottom: 4 }}>Nombre *</label>
            <input
              className="input"
              style={{ fontSize: '0.82rem' }}
              placeholder="Ej: Reporte semanal de seguridad"
              value={form.name}
              onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
            />
          </div>

          {/* Cron */}
          <div>
            <label style={{ fontSize: '0.68rem', color: 'var(--color-surface-400)', display: 'block', marginBottom: 4 }}>Frecuencia</label>
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.4rem' }}>
              {CRON_PRESETS.map(preset => (
                <button
                  key={preset.value}
                  onClick={() => setForm(p => ({ ...p, cron_expression: preset.value }))}
                  style={{
                    padding: '0.25rem 0.6rem', borderRadius: 5, fontSize: '0.68rem',
                    border: `1px solid ${form.cron_expression === preset.value ? 'rgba(99,102,241,0.5)' : 'rgba(255,255,255,0.08)'}`,
                    background: form.cron_expression === preset.value ? 'rgba(99,102,241,0.15)' : 'transparent',
                    color: form.cron_expression === preset.value ? 'var(--color-brand-300)' : 'var(--color-surface-400)',
                    cursor: 'pointer',
                  }}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <input
              className="input"
              style={{ fontSize: '0.78rem', fontFamily: 'monospace' }}
              value={form.cron_expression}
              onChange={e => setForm(p => ({ ...p, cron_expression: e.target.value }))}
              placeholder="Cron expression (min hora día mes día-semana)"
            />
          </div>

          {/* Prompt */}
          <div>
            <label style={{ fontSize: '0.68rem', color: 'var(--color-surface-400)', display: 'block', marginBottom: 4 }}>Instrucción para la IA *</label>
            <textarea
              className="input"
              style={{ fontSize: '0.78rem', minHeight: 70, resize: 'vertical' }}
              placeholder="Describí el informe que se preparará para revisión..."
              value={form.prompt}
              onChange={e => setForm(p => ({ ...p, prompt: e.target.value }))}
            />
          </div>

          {/* Audience */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
            <div>
              <label style={{ fontSize: '0.68rem', color: 'var(--color-surface-400)', display: 'block', marginBottom: 4 }}>Audiencia</label>
              <select className="input" style={{ fontSize: '0.78rem' }} value={form.audience} onChange={e => setForm(p => ({ ...p, audience: e.target.value }))}>
                {AUDIENCE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <p className="text-xs text-surface-400">Salida: guardar en historial</p>
          </div>

          {/* Data sources */}
          <div>
            <label style={{ fontSize: '0.68rem', color: 'var(--color-surface-400)', display: 'block', marginBottom: 4 }}>Fuentes de datos</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
              {DATA_SOURCE_OPTIONS.map(src => (
                <button
                  key={src.id}
                  onClick={() => toggleSource(src.id)}
                  title={src.tooltip}
                  style={{
                    padding: '0.25rem 0.6rem', borderRadius: 5, fontSize: '0.7rem',
                    border: `1px solid ${form.data_sources.includes(src.id) ? 'rgba(99,102,241,0.5)' : 'rgba(255,255,255,0.08)'}`,
                    background: form.data_sources.includes(src.id) ? 'rgba(99,102,241,0.15)' : 'transparent',
                    color: form.data_sources.includes(src.id) ? 'var(--color-brand-300)' : 'var(--color-surface-400)',
                    cursor: 'pointer',
                  }}
                >
                  {src.label}
                </button>
              ))}
            </div>
          </div>

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={createMutation.isPending || !form.name || !form.prompt || form.data_sources.length === 0}
            style={{
              padding: '0.5rem 1rem', borderRadius: 7,
              background: 'rgba(99,102,241,0.25)', border: '1px solid rgba(99,102,241,0.4)',
              color: 'var(--color-brand-200)', cursor: 'pointer', fontWeight: 700, fontSize: '0.82rem',
              opacity: (!form.name || !form.prompt || form.data_sources.length === 0) ? 0.4 : 1,
            }}
          >
            {createMutation.isPending ? 'Creando...' : 'Crear Programación'}
          </button>
          {createMutation.isError && (
            <p style={{ fontSize: '0.72rem', color: 'var(--color-danger-400)', margin: 0 }}>
              Error: {(createMutation.error as Error).message}
            </p>
          )}
        </div>
      )}

      {/* Schedules list */}
      {schedules.length === 0 && !showForm ? (
        <div style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--color-surface-400)' }}>
          <Clock size={28} style={{ marginBottom: '0.5rem', opacity: 0.4 }} />
          <p style={{ fontSize: '0.82rem' }}>No hay programaciones configuradas.</p>
          <p style={{ fontSize: '0.72rem', marginTop: '0.2rem' }}>Creá una para preparar datos automáticamente.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {schedules.map(schedule => (
            <div
              key={schedule.id}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.75rem',
                padding: '0.75rem 1rem', borderRadius: 10,
                background: 'var(--color-surface-800)',
                border: `1px solid ${schedule.enabled ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.05)'}`,
                opacity: schedule.enabled ? 1 : 0.6,
              }}
            >
              <Clock size={14} style={{ color: schedule.enabled ? 'var(--color-brand-400)' : 'var(--color-surface-500)', flexShrink: 0 }} />

              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--color-surface-100)', margin: 0 }}>
                  {schedule.name}
                </p>
                <div style={{ display: 'flex', gap: '0.6rem', marginTop: '0.2rem', flexWrap: 'wrap' }}>
                  <code style={{ fontSize: '0.65rem', color: 'var(--color-surface-400)', background: 'rgba(255,255,255,0.05)', padding: '1px 5px', borderRadius: 3 }}>
                    {schedule.cron_expression}
                  </code>
                  <span style={{ fontSize: '0.65rem', color: 'var(--color-surface-500)' }}>
                    {AUDIENCE_OPTIONS.find(a => a.value === schedule.audience)?.label}
                  </span>
                  {schedule.last_run_at && (
                    <span style={{ fontSize: '0.65rem', color: 'var(--color-surface-500)' }}>
                      Último: {new Date(schedule.last_run_at).toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' })}
                    </span>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.35rem', flexShrink: 0 }}>
                {/* Toggle */}
                <button
                  onClick={() => toggleMutation.mutate({ id: schedule.id, enabled: !schedule.enabled })}
                  title={schedule.enabled ? 'Deshabilitar' : 'Habilitar'}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.2rem', color: schedule.enabled ? 'var(--color-brand-400)' : 'var(--color-surface-500)' }}
                >
                  {schedule.enabled ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                </button>

                {/* Trigger now */}
                <button
                  onClick={() => { setTriggeringId(schedule.id); triggerMutation.mutate(schedule.id); }}
                  disabled={!schedule.enabled || (triggerMutation.isPending && triggeringId === schedule.id)}
                  style={{
                    padding: '0.3rem 0.55rem', borderRadius: 6,
                    background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.25)',
                    color: '#4ade80', cursor: 'pointer', display: 'flex', alignItems: 'center',
                  }}
                  title="Preparar datos ahora"
                >
                  {triggerMutation.isPending && triggeringId === schedule.id
                    ? <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} />
                    : <Play size={11} />
                  }
                </button>

                {/* Delete */}
                <button
                  onClick={() => deleteMutation.mutate(schedule.id)}
                  disabled={deleteMutation.isPending}
                  style={{
                    padding: '0.3rem 0.45rem', borderRadius: 6,
                    background: 'transparent', border: '1px solid rgba(255,255,255,0.08)',
                    color: 'var(--color-surface-500)', cursor: 'pointer',
                  }}
                  title="Eliminar"
                >
                  <Trash2 size={11} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {triggerMutation.isError && <p role="alert" className="text-xs text-red-300">No se pudo preparar: {(triggerMutation.error as Error).message}</p>}
      <div className="border-t border-surface-700 pt-3 space-y-2">
        <h3 className="text-sm font-semibold text-surface-200">Preparaciones pendientes de revisión</h3>
        {pendingQuery.isError && <p className="text-xs text-red-300">No se pudieron cargar las preparaciones.</p>}
        {!pendingQuery.isLoading && pending.length === 0 && <p className="text-xs text-surface-400">No hay solicitudes pendientes.</p>}
        {pending.map(item => <div key={item.preparation_id} className="flex items-center justify-between gap-2 rounded-lg bg-surface-900/40 p-2">
          <span className="text-xs text-surface-300">{item.schedule_name || 'Programación'} · {new Date(item.created_at).toLocaleString('es-AR')}</span>
          <button type="button" className="btn btn-primary" onClick={() => onReview(item.preparation_id)}>Revisar envío</button>
        </div>)}
      </div>
    </div>
  );
}
