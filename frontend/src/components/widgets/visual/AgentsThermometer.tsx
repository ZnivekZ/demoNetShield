import { useAgentsThermometer } from '../../../hooks/widgets/visual';
import { WidgetSkeleton, WidgetErrorState } from '../common';

/**
 * Termómetro SVG vertical del % de agentes Wazuh activos.
 * La columna de mercurio crece desde abajo.
 */
export function AgentsThermometer({ config: _config }: { config?: Record<string, unknown> }) {
  const { data, isLoading, error, refetch } = useAgentsThermometer();

  if (isLoading) return <WidgetSkeleton rows={2} />;
  if (error || !data) return <WidgetErrorState onRetry={() => refetch()} />;

  const total = data.total ?? 1;
  const active = data.active ?? 0;
  const pct = Math.round((active / total) * 100);

  // SVG dimensions
  const thermHeight = 120;
  const fillHeight = (pct / 100) * thermHeight;
  const color = pct >= 80 ? '#10b981' : pct >= 50 ? '#f59e0b' : '#ef4444';

  return (
    <div className="widget-agents-thermometer">
      <div className="widget-agents-thermometer__label">Agentes Wazuh</div>

      <div className="widget-agents-thermometer__body">
        <svg viewBox="0 0 40 160" width="40" height="160" aria-label={`${pct}% agentes activos`}>
          {/* Tubo */}
          <rect x="14" y="10" width="12" height={thermHeight + 20} rx="6"
            fill="var(--color-border, #334155)" />
          {/* Relleno */}
          <rect
            x="14" y={10 + thermHeight + 20 - fillHeight} width="12" height={fillHeight} rx="6"
            fill={color}
            style={{ transition: 'height 0.8s ease, y 0.8s ease' }}
          />
          {/* Bulbo */}
          <circle cx="20" cy={thermHeight + 35} r="10" fill={color}
            style={{ transition: 'fill 0.5s' }} />
        </svg>

        <div className="widget-agents-thermometer__stats">
          <span className="widget-agents-thermometer__pct" style={{ color }}>
            {pct}%
          </span>
          <span className="widget-agents-thermometer__detail">
            {active}/{total} activos
          </span>
          {data.disconnected > 0 && (
            <span className="badge badge--warn">{data.disconnected} offline</span>
          )}
        </div>
      </div>
    </div>
  );
}
