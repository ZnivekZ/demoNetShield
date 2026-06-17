/**
 * QueueBars — Widget visual: barras de uso de ancho de banda por queue.
 */
import { WidgetSkeleton, WidgetErrorState, WidgetHeader } from '../common';
import { useQueueBars } from '../../../hooks/widgets/visual';

interface QueueBarRow {
  id: string;
  name: string;
  target: string;
  max_limit: string;
  rate: string;
  pct_up: number;
  pct_down: number;
  dropped: number;
  disabled: boolean;
}

export function QueueBars() {
  const { data, isLoading, error, refetch } = useQueueBars();

  if (isLoading) return <WidgetSkeleton rows={4} />;
  if (error) return <WidgetErrorState message={(error as Error).message} onRetry={() => refetch()} />;

  const queues = (data ?? []) as QueueBarRow[];
  const active = queues.filter(q => !q.disabled).length;

  function barColor(pct: number) {
    if (pct >= 90) return 'bg-danger';
    if (pct >= 70) return 'bg-warning';
    return 'bg-brand-500';
  }

  return (
    <div className="flex flex-col h-full">
      <WidgetHeader
        title="QoS — Ancho de Banda"
        subtitle={`${active} colas activas`}
      />
      <div className="flex-1 overflow-auto space-y-4 mt-3 pr-1">
        {queues.length === 0 && (
          <p className="text-center text-surface-500 py-6 text-sm">
            Sin queues configuradas
          </p>
        )}
        {queues.map(q => (
          <div key={q.id} className={q.disabled ? 'opacity-40' : ''}>
            <div className="flex items-center justify-between mb-1.5">
              <div className="min-w-0">
                <span className="text-xs font-semibold text-surface-200 truncate block">
                  {q.name}
                </span>
                <span className="text-[0.6rem] text-surface-500 font-mono">
                  {q.target} · {q.max_limit}
                </span>
              </div>
              <span className="text-[0.6rem] text-surface-500 font-mono shrink-0 ml-2">
                {q.rate !== '0/0' ? `~${q.rate}` : 'idle'}
              </span>
            </div>
            {/* Upload bar */}
            <div className="mb-1">
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="text-[0.6rem] text-surface-500 w-4">↑</span>
                <div className="flex-1 h-1.5 bg-surface-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${barColor(q.pct_up)}`}
                    style={{ width: `${q.pct_up}%` }}
                  />
                </div>
                <span className="text-[0.6rem] text-surface-500 w-8 text-right">{q.pct_up}%</span>
              </div>
            </div>
            {/* Download bar */}
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-[0.6rem] text-surface-500 w-4">↓</span>
                <div className="flex-1 h-1.5 bg-surface-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${barColor(q.pct_down)}`}
                    style={{ width: `${q.pct_down}%` }}
                  />
                </div>
                <span className="text-[0.6rem] text-surface-500 w-8 text-right">{q.pct_down}%</span>
              </div>
            </div>
            {q.dropped > 0 && (
              <p className="text-[0.6rem] text-warning mt-0.5 ml-5">
                {q.dropped.toLocaleString()} paquetes descartados
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
