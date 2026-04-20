import { useState } from 'react';
import { useActivityHeatmap } from '../../../hooks/widgets/visual';
import { WidgetSkeleton, WidgetErrorState, WidgetHeader } from '../common';

/**
 * Calendar heatmap 7×24h de actividad de alertas.
 * Cada celda tiene color proporcional a su valor (opacity).
 * Tooltip on hover con día + hora + count.
 */
export function ActivityHeatmap({ config: _config }: { config?: Record<string, unknown> }) {
  const { data, isLoading, error, refetch } = useActivityHeatmap();
  const [tooltip, setTooltip] = useState<{ day: string; hour: number; count: number } | null>(null);

  if (isLoading) return <WidgetSkeleton rows={8} />;
  if (error || !data) return <WidgetErrorState onRetry={() => refetch()} />;

  const { matrix, labels_day, max_value } = data;

  const intensityColor = (count: number) => {
    const opacity = count === 0 ? 0.06 : 0.15 + (count / max_value) * 0.85;
    return `rgba(245, 158, 11, ${opacity.toFixed(2)})`;
  };

  const hours = Array.from({ length: 24 }, (_, h) => h);

  return (
    <div className="widget-activity-heatmap">
      <WidgetHeader title="Actividad de Alertas" generatedAt={data.generated_at} />

      {/* Hour labels */}
      <div className="widget-activity-heatmap__hour-row">
        <div className="widget-activity-heatmap__day-label" />
        {hours.filter(h => h % 6 === 0).map(h => (
          <div key={h} className="widget-activity-heatmap__hour-label" style={{ gridColumn: `span 6` }}>
            {h.toString().padStart(2, '0')}h
          </div>
        ))}
      </div>

      {/* Grid */}
      <div className="widget-activity-heatmap__grid">
        {matrix.map((row, day) => (
          <div key={day} className="widget-activity-heatmap__row">
            <span className="widget-activity-heatmap__day-label">{labels_day[day]}</span>
            {row.map((count, hour) => (
              <div
                key={hour}
                className="widget-activity-heatmap__cell"
                style={{ background: intensityColor(count) }}
                onMouseEnter={() => setTooltip({ day: labels_day[day], hour, count })}
                onMouseLeave={() => setTooltip(null)}
                title={`${labels_day[day]} ${hour.toString().padStart(2,'0')}h — ${count} alertas`}
              />
            ))}
          </div>
        ))}
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div className="widget-activity-heatmap__tooltip">
          {tooltip.day} {tooltip.hour.toString().padStart(2, '0')}:00 — <strong>{tooltip.count}</strong> alertas
        </div>
      )}

      {/* Legend */}
      <div className="widget-activity-heatmap__legend">
        <span>Menos</span>
        {[0, 0.25, 0.5, 0.75, 1].map(f => (
          <div key={f} className="widget-activity-heatmap__legend-cell"
            style={{ background: `rgba(245,158,11,${0.06 + f * 0.94})` }} />
        ))}
        <span>Más</span>
      </div>
    </div>
  );
}
