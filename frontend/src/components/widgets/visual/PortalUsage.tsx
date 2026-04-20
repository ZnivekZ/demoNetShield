import { usePortalUsage } from '../../../hooks/widgets/visual';
import { WidgetSkeleton, WidgetErrorState, WidgetHeader } from '../common';

/**
 * Donut + stat cards del portal cautivo.
 * Muestra sesiones activas vs capacidad y bandwidth total.
 */
export function PortalUsage({ config: _config }: { config?: Record<string, unknown> }) {
  const { data, isLoading, error, refetch } = usePortalUsage();

  if (isLoading) return <WidgetSkeleton rows={3} />;
  if (error || !data) return <WidgetErrorState message={String(error)} onRetry={() => refetch()} />;

  const pct = Math.min(100, Math.round((data.active / data.max_sessions) * 100));
  const color = pct >= 80 ? 'var(--color-danger, #ef4444)'
    : pct >= 50 ? 'var(--color-warning, #f59e0b)'
    : 'var(--color-success, #10b981)';

  const R = 40, cx = 50, cy = 50;
  const circ = 2 * Math.PI * R;
  const filled = (pct / 100) * circ;

  function fmtBytes(b: number): string {
    if (b >= 1e9) return `${(b / 1e9).toFixed(1)} GB`;
    if (b >= 1e6) return `${(b / 1e6).toFixed(1)} MB`;
    if (b >= 1e3) return `${(b / 1e3).toFixed(1)} KB`;
    return `${b} B`;
  }

  return (
    <div className="widget-portal-usage">
      <WidgetHeader title="Portal Cautivo" />
      <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', padding: '0.5rem' }}>
        {/* Donut SVG */}
        <svg viewBox="0 0 100 100" width={90} height={90} aria-label={`${pct}% de capacidad`}>
          <circle cx={cx} cy={cy} r={R} fill="none" stroke="var(--color-border, #334155)" strokeWidth={12} />
          <circle
            cx={cx} cy={cy} r={R} fill="none" stroke={color} strokeWidth={12}
            strokeDasharray={`${filled} ${circ}`}
            strokeLinecap="round"
            transform={`rotate(-90 ${cx} ${cy})`}
            style={{ transition: 'stroke-dasharray 0.8s ease, stroke 0.4s' }}
          />
          <text x={cx} y={cy - 4} textAnchor="middle" fill="var(--color-text-primary, #f1f5f9)" fontSize="18" fontWeight="700">{data.active}</text>
          <text x={cx} y={cy + 12} textAnchor="middle" fill="var(--color-text-muted, #64748b)" fontSize="9">sesiones</text>
        </svg>
        {/* Stats */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
            <span style={{ color: 'var(--color-text-muted)' }}>Capacidad</span>
            <span style={{ color, fontWeight: 600 }}>{pct}%</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
            <span style={{ color: 'var(--color-text-muted)' }}>↑ Upload</span>
            <span style={{ color: 'var(--color-text-primary)' }}>{fmtBytes(data.bytes_up)}/s</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
            <span style={{ color: 'var(--color-text-muted)' }}>↓ Download</span>
            <span style={{ color: 'var(--color-text-primary)' }}>{fmtBytes(data.bytes_down)}/s</span>
          </div>
          {data.partial && (
            <span style={{ color: 'var(--color-warning)', fontSize: '0.65rem' }}>⚠ Datos parciales</span>
          )}
        </div>
      </div>
    </div>
  );
}
