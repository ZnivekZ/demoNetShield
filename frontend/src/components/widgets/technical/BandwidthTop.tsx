import { useBandwidthTop } from '../../../hooks/widgets/technical';
import { WidgetSkeleton, WidgetErrorState, WidgetHeader } from '../common';

interface BandwidthEntry { ip: string; bytes: number; pct: number }

function fmtBytes(b: number): string {
  if (b >= 1e9) return `${(b / 1e9).toFixed(2)} GB`;
  if (b >= 1e6) return `${(b / 1e6).toFixed(1)} MB`;
  if (b >= 1e3) return `${(b / 1e3).toFixed(0)} KB`;
  return `${b} B`;
}

/**
 * Top N IPs locales por bytes totales.
 * Barra proporcional al mayor consumidor.
 */
export function BandwidthTop({ config }: { config?: { limit?: number } }) {
  const limit = config?.limit ?? 10;
  const { data, isLoading, error, refetch } = useBandwidthTop(limit);

  if (isLoading) return <WidgetSkeleton rows={5} />;
  if (error || !data) return <WidgetErrorState message={String(error)} onRetry={() => refetch()} />;

  const entries = data as BandwidthEntry[];

  return (
    <div className="widget-bandwidth-top">
      <WidgetHeader title="Top Consumidores" />
      {entries.length === 0 ? (
        <p style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem', textAlign: 'center' }}>Sin conexiones activas</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          {entries.map((e, i) => (
            <div key={e.ip} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{
                color: 'var(--color-text-muted)', fontSize: '0.62rem',
                width: '14px', textAlign: 'right', flexShrink: 0,
              }}>#{i + 1}</span>
              <span style={{
                fontFamily: 'monospace', fontSize: '0.7rem',
                color: 'var(--color-text-secondary)', width: '110px', flexShrink: 0,
              }}>{e.ip}</span>
              <div style={{ flex: 1, background: 'var(--color-surface-alt, #1e293b)', borderRadius: '4px', height: '8px', overflow: 'hidden' }}>
                <div style={{
                  height: '100%', width: `${e.pct}%`,
                  background: e.pct > 80
                    ? 'var(--color-danger, #ef4444)'
                    : e.pct > 50
                    ? 'var(--color-warning, #f59e0b)'
                    : 'var(--accent-primary, #6366f1)',
                  borderRadius: '4px',
                  transition: 'width 0.6s ease',
                }} />
              </div>
              <span style={{ color: 'var(--color-text-muted)', fontSize: '0.65rem', width: '60px', textAlign: 'right', flexShrink: 0 }}>
                {fmtBytes(e.bytes)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
