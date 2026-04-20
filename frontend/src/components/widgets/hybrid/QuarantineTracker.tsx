import { useQuarantineTracker } from '../../../hooks/widgets/hybrid';
import { WidgetSkeleton, WidgetErrorState, WidgetHeader } from '../common';

interface ActionEntry { action_type?: string; target_ip?: string | null; comment?: string | null; created_at?: string }

function timeSince(ts?: string): string {
  if (!ts) return '-';
  const diff = Date.now() - new Date(ts).getTime();
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  if (h > 0) return `hace ${h}h ${m}m`;
  return `hace ${m}m`;
}

/**
 * Lista de activos actualmente en cuarentena (derivado del ActionLog).
 * Muestra IP, motivo, tiempo en cuarentena y quién la inició.
 */
export function QuarantineTracker({ config: _config }: { config?: Record<string, unknown> }) {
  const { data, isLoading, error, refetch } = useQuarantineTracker();

  if (isLoading) return <WidgetSkeleton rows={3} />;
  if (error || !data) return <WidgetErrorState message={String(error)} onRetry={() => refetch()} />;

  const active = (data.active ?? []) as ActionEntry[];

  return (
    <div className="widget-quarantine-tracker">
      <WidgetHeader title="Cuarentena Activa" />

      {/* Header stats */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
        <div style={{ flex: 1, background: 'var(--color-surface-alt,#1e293b)', borderRadius: '6px', padding: '0.35rem', textAlign: 'center' }}>
          <div style={{ color: 'var(--color-danger,#ef4444)', fontWeight: 700, fontSize: '1.2rem' }}>{active.length}</div>
          <div style={{ color: 'var(--color-text-muted)', fontSize: '0.6rem' }}>En cuarentena</div>
        </div>
        <div style={{ flex: 1, background: 'var(--color-surface-alt,#1e293b)', borderRadius: '6px', padding: '0.35rem', textAlign: 'center' }}>
          <div style={{ color: 'var(--color-text-secondary)', fontWeight: 700, fontSize: '1.2rem' }}>{data.total_quarantined}</div>
          <div style={{ color: 'var(--color-text-muted)', fontSize: '0.6rem' }}>Total histórico</div>
        </div>
      </div>

      {active.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '0.8rem', color: 'var(--color-success,#10b981)', fontSize: '0.75rem' }}>
          ✓ Sin activos en cuarentena
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', maxHeight: '160px', overflowY: 'auto' }}>
          {active.map((a, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              background: 'rgba(239,68,68,0.07)', borderRadius: '6px',
              padding: '0.3rem 0.5rem', borderLeft: '3px solid var(--color-danger,#ef4444)',
            }}>
              <span style={{ color: 'var(--color-danger,#ef4444)', fontSize: '0.65rem' }}>🔒</span>
              <span style={{ fontFamily: 'monospace', fontSize: '0.72rem', color: 'var(--color-text-secondary)', flex: 1 }}>
                {a.target_ip ?? 'IP desconocida'}
              </span>
              <span style={{ color: 'var(--color-text-muted)', fontSize: '0.6rem', flexShrink: 0 }}>
                {timeSince(a.created_at)}
              </span>
            </div>
          ))}
        </div>
      )}
      {data.partial && (
        <p style={{ color: 'var(--color-warning)', fontSize: '0.6rem', marginTop: '0.3rem' }}>⚠ Datos parciales</p>
      )}
    </div>
  );
}
