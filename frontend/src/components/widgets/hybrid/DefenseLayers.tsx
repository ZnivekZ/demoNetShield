import { useDefenseLayers } from '../../../hooks/widgets/hybrid';
import { WidgetSkeleton, WidgetErrorState, WidgetHeader } from '../common';

const LAYERS = [
  { key: 'wazuh', label: 'Wazuh SIEM', r: 70, color: '#f59e0b' },
  { key: 'suricata', label: 'Suricata IDS', r: 52, color: '#8b5cf6' },
  { key: 'crowdsec', label: 'CrowdSec IPS', r: 35, color: '#10b981' },
  { key: 'mikrotik', label: 'MikroTik FW', r: 18, color: '#3b82f6' },
];

export function DefenseLayers({ config: _config }: { config?: Record<string, unknown> }) {
  const { data, isLoading, error, refetch } = useDefenseLayers();

  if (isLoading) return <WidgetSkeleton rows={3} />;
  if (error || !data) return <WidgetErrorState onRetry={() => refetch()} />;

  const cx = 90, cy = 90;

  return (
    <div className="widget-defense-layers">
      <WidgetHeader
        title="Capas de Defensa"
        badge={data.partial ? <span className="widget-partial-badge">⚠ parcial</span> : undefined}
      />

      <div className="widget-defense-layers__body">
        <svg viewBox="0 0 180 180" className="widget-defense-layers__svg">
          {LAYERS.map(({ key, r, color }) => {
            const layer = data[key as keyof typeof data] as { ok: boolean } | undefined;
            const ok = layer?.ok ?? false;
            return (
              <circle
                key={key}
                cx={cx} cy={cy} r={r}
                fill="none"
                stroke={ok ? color : '#334155'}
                strokeWidth={ok ? 6 : 3}
                strokeDasharray={ok ? 'none' : '4 4'}
                className={ok ? 'widget-defense-layers__ring--active' : 'widget-defense-layers__ring--inactive'}
                style={{ transition: 'stroke 0.5s, stroke-width 0.3s' }}
              />
            );
          })}
          {/* Centro */}
          <circle cx={cx} cy={cy} r={7} fill={
            Object.values(LAYERS).every(l => (data[l.key as keyof typeof data] as { ok?: boolean })?.ok)
              ? '#10b981' : '#ef4444'
          } />
        </svg>

        <div className="widget-defense-layers__legend">
          {LAYERS.map(({ key, label, color }) => {
            const layer = data[key as keyof typeof data] as { ok: boolean; label?: string } | undefined;
            const ok = layer?.ok ?? false;
            return (
              <div key={key} className="widget-defense-layers__legend-item">
                <span className="widget-defense-layers__legend-dot" style={{ background: ok ? color : '#334155' }} />
                <span className="text-xs">{label}</span>
                <span className={`badge badge--${ok ? 'ok' : 'danger'} badge--xs`}>
                  {ok ? 'OK' : 'OFFLINE'}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
