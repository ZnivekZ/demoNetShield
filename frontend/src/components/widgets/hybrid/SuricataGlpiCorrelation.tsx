import { useSuricataGlpi } from '../../../hooks/widgets/hybrid';
import { WidgetSkeleton, WidgetErrorState, WidgetHeader } from '../common';
import type { AssetCorrelation } from '../../../types';

export function SuricataGlpiCorrelation({ config }: { config?: { limit?: number } }) {
  const limit = config?.limit ?? 10;
  const { data, isLoading, error, refetch } = useSuricataGlpi(limit);

  if (isLoading) return <WidgetSkeleton rows={5} />;
  if (error || !data) return <WidgetErrorState onRetry={() => refetch()} />;

  const { correlations } = data;

  const SEVERITY_COLORS: Record<number, string> = {
    1: '#ef4444',
    2: '#f59e0b',
    3: '#6b7280',
  };

  const SEVERITY_LABELS: Record<number, string> = {
    1: 'CRÍTICO',
    2: 'ALTO',
    3: 'MEDIO',
  };

  return (
    <div className="widget-technical">
      <WidgetHeader
        title="Suricata × GLPI"
        badge={
          correlations.length > 0
            ? <span className="badge badge--danger">{correlations.length} activos atacados</span>
            : undefined
        }
      />
      <div className="widget-technical__scroll-body">
        {correlations.length === 0 && (
          <p className="text-muted text-center py-4">Sin activos bajo ataque detectado</p>
        )}
        {correlations.map((c: AssetCorrelation) => (
          <div key={`${c.dst_ip}-${c.timestamp}`} className="widget-suricata-glpi__item">
            <div className="widget-suricata-glpi__header">
              <span
                className="badge"
                style={{ background: SEVERITY_COLORS[c.suricata_severity], color: '#fff' }}
              >
                {SEVERITY_LABELS[c.suricata_severity]}
              </span>
              <strong className="widget-suricata-glpi__asset">{c.asset_name}</strong>
              {!c.wazuh_agent && (
                <span className="badge badge--warn" title="Sin agente Wazuh">⚠ sin Wazuh</span>
              )}
            </div>
            <div className="widget-suricata-glpi__sig text-xs text-muted">
              {c.suricata_signature}
            </div>
            <div className="widget-suricata-glpi__meta text-xs text-muted">
              <span>{c.dst_ip}</span>
              {c.asset_location && <span>{c.asset_location}</span>}
              {c.asset_owner && <span>👤 {c.asset_owner}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
