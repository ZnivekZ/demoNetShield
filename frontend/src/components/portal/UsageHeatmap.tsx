/**
 * UsageHeatmap — SVG heatmap of portal usage by day-of-week and hour.
 * Axes: X = hours (0–23), Y = days (Mon–Sun). Color intensity = session count.
 * Data comes from PortalSummaryStats.peak_by_day.
 */
import type { PeakByDayPoint } from '../../types';

interface UsageHeatmapProps {
  data: PeakByDayPoint[];
}

const DAYS_DISPLAY = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const DAYS_KEYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

const CELL_W = 28;
const CELL_H = 24;
const LABEL_W = 32;
const LABEL_H = 20;
const PAD = 4;

function getColor(intensity: number): string {
  if (intensity === 0) return 'rgba(255,255,255,0.04)';
  // Green → Yellow → Red gradient
  const t = Math.min(intensity, 1);
  if (t < 0.5) {
    const r = Math.round(t * 2 * 255);
    return `rgba(${r}, 210, 90, 0.7)`;
  } else {
    const r = 255;
    const g = Math.round((1 - (t - 0.5) * 2) * 210);
    return `rgba(${r}, ${g}, 60, 0.8)`;
  }
}

export function UsageHeatmap({ data }: UsageHeatmapProps) {
  // Build lookup: (day, hour) -> count
  const maxCount = data.reduce((m, p) => Math.max(m, p.count), 1);
  const lookup = new Map(data.map(p => [`${p.day}-${p.hour}`, p.count]));

  const svgW = LABEL_W + HOURS.length * CELL_W + PAD;
  const svgH = LABEL_H + DAYS_KEYS.length * CELL_H + PAD;

  if (data.length === 0) {
    return (
      <div className="portal-chart-empty">
        <span>Sin datos de uso suficientes para generar el mapa</span>
      </div>
    );
  }

  return (
    <div className="portal-heatmap-scroll">
      <svg width={svgW} height={svgH} role="img" aria-label="Mapa de calor de uso por día y hora">
        {/* Hour labels */}
        {HOURS.map(h => (
          (h % 3 === 0) && (
            <text
              key={`h${h}`}
              x={LABEL_W + h * CELL_W + CELL_W / 2}
              y={LABEL_H - 4}
              textAnchor="middle"
              fontSize={9}
              fill="var(--color-text-muted)"
            >
              {h.toString().padStart(2, '0')}
            </text>
          )
        ))}

        {/* Day labels + cells */}
        {DAYS_KEYS.map((day, di) => (
          <g key={day}>
            <text
              x={LABEL_W - 4}
              y={LABEL_H + di * CELL_H + CELL_H / 2 + 3}
              textAnchor="end"
              fontSize={10}
              fill="var(--color-text-muted)"
            >
              {DAYS_DISPLAY[di]}
            </text>
            {HOURS.map(hour => {
              const count = lookup.get(`${day}-${hour}`) ?? 0;
              const intensity = count / maxCount;
              return (
                <rect
                  key={`${day}-${hour}`}
                  x={LABEL_W + hour * CELL_W + 1}
                  y={LABEL_H + di * CELL_H + 1}
                  width={CELL_W - 2}
                  height={CELL_H - 2}
                  rx={3}
                  fill={getColor(intensity)}
                  className="heatmap-cell"
                >
                  <title>{`${DAYS_DISPLAY[di]} ${hour}:00 — ${count} sesión${count !== 1 ? 'es' : ''}`}</title>
                </rect>
              );
            })}
          </g>
        ))}
      </svg>

      {/* Legend */}
      <div className="portal-heatmap-legend">
        <span className="portal-heatmap-legend-label">Bajo</span>
        <div className="portal-heatmap-gradient" />
        <span className="portal-heatmap-legend-label">Alto</span>
      </div>
    </div>
  );
}
