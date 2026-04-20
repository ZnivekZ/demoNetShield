import { useEffect, useRef, useState } from 'react';
import { useLiveLogs } from '../../../hooks/widgets/technical';
import { WidgetSkeleton, WidgetErrorState } from '../common';
import type { LogEntry } from '../../../types';

interface LiveLogsProps {
  config?: { limit?: number; filter?: string };
}

/**
 * Terminal de logs MikroTik en tiempo real.
 * Fondo oscuro forzado, fuente monospace, scroll automático al fondo.
 */
export function LiveLogs({ config }: LiveLogsProps) {
  const limit = config?.limit ?? 100;
  const { data, isLoading, error } = useLiveLogs(limit);
  const [filterText, setFilterText] = useState(config?.filter ?? '');
  const [paused, setPaused] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!paused && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [data, paused]);

  if (isLoading) return <WidgetSkeleton rows={6} />;
  if (error || !data) return <WidgetErrorState message="Sin acceso a logs" />;

  const logs = data as LogEntry[];
  const filtered = filterText
    ? logs.filter(entry => entry.message?.toLowerCase().includes(filterText.toLowerCase())
        || entry.topics?.toLowerCase().includes(filterText.toLowerCase()))
    : logs;

  return (
    <div className="widget-live-logs">
      <div className="widget-live-logs__toolbar">
        <input
          type="text"
          className="input-sm widget-live-logs__filter"
          placeholder="Filtrar logs..."
          value={filterText}
          onChange={e => setFilterText(e.target.value)}
        />
        <button
          className={`btn-icon ${paused ? 'btn-icon--warn' : ''}`}
          onClick={() => setPaused(p => !p)}
          title={paused ? 'Reanudar auto-scroll' : 'Pausar auto-scroll'}
        >
          {paused ? '▶' : '⏸'}
        </button>
        <span className="text-muted text-xs">{filtered.length} líneas</span>
      </div>
      <div ref={scrollRef} className="widget-live-logs__terminal">
        {filtered.map((entry, i) => (
          <div key={entry.id ?? i} className="widget-live-logs__line">
            <span className="widget-live-logs__idx">{i + 1}</span>
            <span className="widget-live-logs__text">{entry.time} [{entry.topics}] {entry.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
