import { useConfirmedThreats } from '../../../hooks/widgets/hybrid';
import { WidgetSkeleton, WidgetErrorState, WidgetHeader } from '../common';
import type { ConfirmedThreat } from '../../../types';

const SOURCE_BADGES: Record<string, { label: string; color: string }> = {
  suricata: { label: 'S', color: '#8b5cf6' },
  crowdsec: { label: 'C', color: '#10b981' },
  wazuh: { label: 'W', color: '#f59e0b' },
};

export function ConfirmedThreats({ config: _config }: { config?: Record<string, unknown> }) {
  const { data, isLoading, error, refetch } = useConfirmedThreats();

  if (isLoading) return <WidgetSkeleton rows={5} />;
  if (error || !data) return <WidgetErrorState onRetry={() => refetch()} />;

  const threats = data.threats;

  return (
    <div className="widget-confirmed-threats">
      <WidgetHeader
        title="Amenazas Confirmadas"
        badge={
          <span className="badge badge--danger">{data.total} detectadas</span>
        }
      />

      <div className="widget-confirmed-threats__list">
        {threats.length === 0 && (
          <p className="text-muted text-center py-4">Sin amenazas multi-fuente activas ✓</p>
        )}
        {threats.map((t: ConfirmedThreat) => (
          <div key={t.ip} className="widget-confirmed-threats__item">
            <div className="widget-confirmed-threats__ip-row">
              <code className="widget-confirmed-threats__ip">{t.ip}</code>
              {t.geo && (
                <span className="text-muted text-xs">
                  {t.geo.country_code ?? t.geo.country_name}
                </span>
              )}
            </div>

            <div className="widget-confirmed-threats__badges">
              {t.sources.map(src => (
                <span
                  key={src}
                  className="badge widget-confirmed-threats__source-badge"
                  style={{ background: SOURCE_BADGES[src]?.color, color: '#fff' }}
                  title={src}
                >
                  {SOURCE_BADGES[src]?.label ?? src[0].toUpperCase()}
                </span>
              ))}
              <div
                className="widget-confirmed-threats__score-bar"
                title={`Score: ${t.score}/100`}
              >
                <div
                  className="widget-confirmed-threats__score-fill"
                  style={{
                    width: `${t.score}%`,
                    background: t.score >= 90 ? '#ef4444' : t.score >= 70 ? '#f59e0b' : '#10b981',
                  }}
                />
              </div>
              <span className="text-xs text-muted">{t.score}/100</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
