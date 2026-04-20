import { useCriticalAssets } from '../../../hooks/widgets/technical';
import { WidgetSkeleton, WidgetErrorState, WidgetHeader } from '../common';
import type { GlpiAssetHealth } from '../../../types';

export function CriticalAssets({ config }: { config?: { limit?: number } }) {
  const limit = config?.limit ?? 10;
  const { data, isLoading, error, refetch } = useCriticalAssets(limit);

  if (isLoading) return <WidgetSkeleton rows={5} />;
  if (error || !data) return <WidgetErrorState onRetry={() => refetch()} />;

  const { assets, partial } = data;

  return (
    <div className="widget-technical">
      <WidgetHeader
        title="Activos Críticos"
        badge={partial ? <span className="widget-partial-badge">⚠ datos parciales</span> : undefined}
      />
      <div className="widget-technical__scroll-body">
        {assets.length === 0 && (
          <p className="text-muted text-center py-4">Sin activos críticos detectados</p>
        )}
        {(assets as GlpiAssetHealth[]).map((a, idx) => (
          <div key={a.asset_id ?? idx} className="widget-critical-assets__item">
            <div className="widget-critical-assets__icon">⚠</div>
            <div className="widget-critical-assets__info">
              <span className="widget-critical-assets__name">{a.name}</span>
              {a.location && (
                <span className="text-muted text-xs">{a.location}</span>
              )}
            </div>
            <div className="widget-critical-assets__stats">
              <span className={`badge badge--${a.health === 'critical' ? 'danger' : a.health === 'warning' ? 'warn' : 'ok'}`}>
                {a.health}
              </span>
              <span className={`badge badge--${a.wazuh_agent === 'active' ? 'ok' : 'warn'}`}>
                {a.wazuh_agent}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
