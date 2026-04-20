import { useThreatGauge } from '../../../hooks/widgets/visual';
import { WidgetSkeleton, WidgetErrorState, WidgetHeader } from '../common';

/**
 * Gauge semicircular SVG del nivel de amenaza global (0-100).
 * Verde 0-40 | Naranja 41-70 | Rojo 71-100.
 * Pulso rojo animado cuando score ≥ 81.
 */
export function ThreatGauge({ config: _config }: { config?: Record<string, unknown> }) {
  const { data, isLoading, error, refetch } = useThreatGauge();

  if (isLoading) return <WidgetSkeleton rows={3} />;
  if (error || !data) return <WidgetErrorState message={String(error)} onRetry={() => refetch()} />;

  const score = data.score;
  const pct = score / 100;

  // Color dinámico
  const color = score >= 81 ? 'var(--color-red-500, #ef4444)'
    : score >= 41 ? 'var(--color-amber-500, #f59e0b)'
    : 'var(--color-emerald-500, #10b981)';

  // SVG semicircular: arco de 180° (de 180° a 0° = media luna)
  const R = 70;
  const cx = 90, cy = 90;
  const arcLen = Math.PI * R;          // semicírculo = πR
  const filledLen = pct * arcLen;
  const strokeWidth = 14;

  // Posición de la aguja
  const angle = Math.PI - pct * Math.PI;    // 180° → 0°
  const nx = cx + R * Math.cos(angle);
  const ny = cy - R * Math.sin(angle);

  const label = score >= 81 ? 'CRÍTICO' : score >= 61 ? 'ALTO' : score >= 41 ? 'MEDIO' : 'BAJO';

  return (
    <div className="widget-threat-gauge">
      <WidgetHeader title="Nivel de Amenaza" generatedAt={data.generated_at} />

      <div className="widget-threat-gauge__body">
        <svg
          viewBox="0 0 180 110"
          className={`widget-threat-gauge__svg${score >= 81 ? ' widget-threat-gauge__svg--pulse' : ''}`}
          aria-label={`Nivel de amenaza: ${score}%`}
        >
          {/* Track arc */}
          <path
            d={`M ${cx - R},${cy} A ${R},${R} 0 0,1 ${cx + R},${cy}`}
            fill="none"
            stroke="var(--color-border, #334155)"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />
          {/* Filled arc usando stroke-dasharray */}
          <path
            d={`M ${cx - R},${cy} A ${R},${R} 0 0,1 ${cx + R},${cy}`}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={`${filledLen} ${arcLen}`}
            style={{ transition: 'stroke-dasharray 1s ease, stroke 0.5s' }}
          />
          {/* Aguja */}
          <line
            x1={cx} y1={cy}
            x2={nx} y2={ny}
            stroke={color}
            strokeWidth={2.5}
            strokeLinecap="round"
            style={{ transition: 'x2 1s ease, y2 1s ease' }}
          />
          <circle cx={cx} cy={cy} r={4} fill={color} />
          {/* Score */}
          <text x={cx} y={cy + 22} textAnchor="middle"
            fill="var(--color-text-primary, #f1f5f9)"
            fontSize="24" fontWeight="700">
            {score}
          </text>
          <text x={cx} y={cy + 38} textAnchor="middle"
            fill={color} fontSize="10" fontWeight="600" letterSpacing="1">
            {label}
          </text>
        </svg>

        <div className="widget-threat-gauge__breakdown">
          {Object.entries(data.breakdown).map(([key, val]) => (
            <div key={key} className="widget-threat-gauge__source">
              <span className="widget-threat-gauge__source-name">{key}</span>
              <div className="widget-threat-gauge__bar-track">
                <div
                  className="widget-threat-gauge__bar-fill"
                  style={{ width: `${val.score}%`, background: color }}
                />
              </div>
              <span className="widget-threat-gauge__source-val">{val.count}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
