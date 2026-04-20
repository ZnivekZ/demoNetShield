import { useSinkholeEffectiveness } from '../../../hooks/widgets/hybrid';
import { WidgetSkeleton, WidgetErrorState, WidgetHeader } from '../common';

interface SinkholeEntry { domain?: string; reason?: string; created_at?: string; hits?: number }

/**
 * Lista de dominios en sinkhole con conteo de hits bloqueados y barra de efectividad.
 */
export function SinkholeEffectiveness({ config: _config }: { config?: Record<string, unknown> }) {
  const { data, isLoading, error, refetch } = useSinkholeEffectiveness();

  if (isLoading) return <WidgetSkeleton rows={4} />;
  if (error || !data) return <WidgetErrorState message={String(error)} onRetry={() => refetch()} />;

  const sinkholes = (data.sinkholes ?? []) as SinkholeEntry[];
  const effectPct = data.effectiveness_pct as number ?? 0;
  const totalBlocked = data.total_blocked as number ?? 0;

  const effectColor = effectPct >= 80
    ? 'var(--color-success, #10b981)'
    : effectPct >= 40
    ? 'var(--color-warning, #f59e0b)'
    : 'var(--color-danger, #ef4444)';

  return (
    <div className="widget-sinkhole-effectiveness">
      <WidgetHeader title="Efectividad Sinkhole" />

      {/* Gauge circular de efectividad */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.6rem' }}>
        <div style={{ textAlign: 'center', flexShrink: 0 }}>
          <div style={{ color: effectColor, fontSize: '1.6rem', fontWeight: 700 }}>{effectPct}%</div>
          <div style={{ color: 'var(--color-text-muted)', fontSize: '0.6rem' }}>efectividad</div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ background: 'var(--color-surface-alt,#1e293b)', borderRadius: '6px', height: '10px', overflow: 'hidden' }}>
            <div style={{
              height: '100%', width: `${effectPct}%`,
              background: effectColor, borderRadius: '6px',
              transition: 'width 0.7s ease',
            }} />
          </div>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.62rem', marginTop: '0.2rem' }}>
            {totalBlocked} hits bloqueados · {sinkholes.length} dominios en sinkhole
          </p>
        </div>
      </div>

      {/* Lista de dominios */}
      {sinkholes.length === 0 ? (
        <p style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem', textAlign: 'center' }}>Sin dominios en sinkhole</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', maxHeight: '160px', overflowY: 'auto' }}>
          {sinkholes.map((s, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: '0.4rem',
              background: 'var(--color-surface-alt,#1e293b)',
              borderRadius: '5px', padding: '0.25rem 0.5rem',
            }}>
              <span style={{ fontSize: '0.65rem' }}>🕳</span>
              <span style={{
                fontFamily: 'monospace', fontSize: '0.68rem',
                color: 'var(--color-text-secondary)', flex: 1,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {s.domain ?? '-'}
              </span>
              {s.hits != null && (
                <span style={{
                  color: 'var(--accent-primary,#6366f1)', fontSize: '0.62rem',
                  fontWeight: 600, flexShrink: 0,
                }}>
                  {s.hits} hits
                </span>
              )}
              <span style={{ color: 'var(--color-text-muted)', fontSize: '0.55rem', flexShrink: 0 }}>
                {s.reason ?? ''}
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
