/**
 * DhcpSubnetUsage — Widget visual de utilización de subredes DHCP.
 * Muestra barras de progreso con % de uso por pool.
 * Categoría: visual | Type: visual_subnet_usage
 */
import { useSubnetUsageWidget } from '../../../hooks/widgets/visual';
import { WidgetHeader, WidgetSkeleton, WidgetErrorState } from '../common';
import { Network } from 'lucide-react';

interface Props {
  config: Record<string, unknown>;
}

function getUsageColor(pct: number): string {
  if (pct >= 90) return 'var(--color-danger)';
  if (pct >= 75) return 'var(--color-warning)';
  if (pct >= 50) return 'var(--accent-primary)';
  return 'var(--color-success)';
}

export function DhcpSubnetUsage({ config: _config }: Props) {
  const { data, isLoading, isError, refetch } = useSubnetUsageWidget();

  if (isLoading) return <WidgetSkeleton />;
  if (isError || !data) return <WidgetErrorState onRetry={refetch} />;

  const pools = Array.isArray(data) ? data : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', height: '100%' }}>
      <WidgetHeader icon={Network} title="Utilización de Subredes" subtitle="DHCP Pools" />

      {pools.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textAlign: 'center', marginTop: '1rem' }}>
          Sin pools configurados
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', overflowY: 'auto', flex: 1 }}>
          {pools.map((pool: {
            pool_name: string;
            used: number;
            total: number;
            usage_pct: number;
            range_start?: string;
            range_end?: string;
          }) => {
            const pct = Math.min(100, Math.round(pool.usage_pct ?? 0));
            const color = getUsageColor(pct);
            return (
              <div key={pool.pool_name} style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {pool.pool_name}
                  </span>
                  <span style={{ fontSize: '0.78rem', fontWeight: 700, color }}>
                    {pct}%
                  </span>
                </div>
                {/* Barra de progreso */}
                <div style={{
                  height: '6px',
                  background: 'rgba(255,255,255,0.08)',
                  borderRadius: '3px',
                  overflow: 'hidden',
                }}>
                  <div style={{
                    height: '100%',
                    width: `${pct}%`,
                    background: color,
                    borderRadius: '3px',
                    transition: 'width 0.4s ease',
                  }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                    {pool.used} usadas · {pool.total - pool.used} libres
                  </span>
                  {pool.range_start && (
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                      {pool.range_start}…{pool.range_end}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
