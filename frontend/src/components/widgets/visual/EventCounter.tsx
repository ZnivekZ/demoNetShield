import { useEventCounter } from '../../../hooks/widgets/visual';
import { WidgetSkeleton, WidgetErrorState } from '../common';

interface EventCounterProps {
  config?: { source?: string };
}

/**
 * Contador flip animado de alertas con delta (+/-) respecto a hora anterior.
 */
export function EventCounter({ config }: EventCounterProps) {
  const source = (config?.source as string) ?? 'wazuh';
  const { data, isLoading, error, refetch } = useEventCounter(source);

  if (isLoading) return <WidgetSkeleton rows={2} />;
  if (error || !data) return <WidgetErrorState onRetry={() => refetch()} />;

  const digits = String(data.count).padStart(4, '0').split('');

  return (
    <div className="widget-event-counter">
      <div className="widget-event-counter__label">{data.label}</div>
      <div className="widget-event-counter__flip-row" aria-label={`${data.count} eventos`}>
        {digits.map((d, i) => (
          <div key={i} className="widget-event-counter__digit">
            <span className="widget-event-counter__digit-top">{d}</span>
            <span className="widget-event-counter__digit-bottom">{d}</span>
          </div>
        ))}
      </div>
      <div className="widget-event-counter__source">
        <span className={`badge badge--${source}`}>{source}</span>
      </div>
    </div>
  );
}
