import { useGeoblockPredictor, useApplyGeoblockSuggestion } from '../../../hooks/widgets/hybrid';
import { WidgetSkeleton, WidgetErrorState, WidgetHeader } from '../common';
import type { GeoBlockSuggestion } from '../../../types';

export function GeoblockPredictor({ config: _config }: { config?: Record<string, unknown> }) {
  const { data, isLoading, error, refetch } = useGeoblockPredictor();
  const applyMut = useApplyGeoblockSuggestion();

  if (isLoading) return <WidgetSkeleton rows={4} />;
  if (error || !data) return <WidgetErrorState onRetry={() => refetch()} />;

  const suggestions = data as GeoBlockSuggestion[];

  return (
    <div className="widget-technical">
      <WidgetHeader title="Predictor Geo-Block" />
      <div className="widget-technical__scroll-body">
        {suggestions.length === 0 && (
          <p className="text-muted text-center py-4">Sin sugerencias de geo-bloqueo</p>
        )}
        {suggestions.map(s => (
          <div key={s.id} className="widget-geoblock-predictor__item">
            <div className="widget-geoblock-predictor__country">
              <span className="font-semibold">{s.target_name}</span>
              <code className="text-xs text-muted">{s.target}</code>
            </div>
            <div className="widget-geoblock-predictor__evidence">
              {(s.reason ? [s.reason] : []).slice(0, 2).map((ev, i) => (
                <span key={i} className="text-xs text-muted">• {ev}</span>
              ))}
            </div>
            <div className="widget-geoblock-predictor__actions">
              <span className={`badge badge--${s.risk_level === 'high' ? 'danger' : 'warn'}`}>
                {s.risk_level}
              </span>
              <button
                className="btn-danger btn-sm"
                disabled={applyMut.isPending}
                onClick={() => applyMut.mutate({ id: s.id, duration: '7d' })}
              >
                Geo-bloquear
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
