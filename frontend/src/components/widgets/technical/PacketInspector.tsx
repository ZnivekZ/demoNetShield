import { useState } from 'react';
import { usePacketInspector } from '../../../hooks/widgets/technical';
import { WidgetSkeleton, WidgetErrorState, WidgetHeader } from '../common';
import type { SuricataAlert } from '../../../types';

export function PacketInspector({ config }: { config?: { limit?: number } }) {
  const limit = config?.limit ?? 20;
  const { data, isLoading, error, refetch } = usePacketInspector(limit);
  const [expanded, setExpanded] = useState<string | null>(null);

  if (isLoading) return <WidgetSkeleton rows={5} />;
  if (error || !data) return <WidgetErrorState onRetry={() => refetch()} />;

  const rawAlerts = (data as { alerts?: SuricataAlert[] }).alerts ?? (data as unknown as SuricataAlert[]);

  const SEVERITY_LABELS: Record<number, string> = { 1: 'CRÍTICO', 2: 'ALTO', 3: 'MEDIO' };

  return (
    <div className="widget-technical">
      <WidgetHeader title="Inspector de Paquetes" />
      <div className="widget-technical__scroll-body">
        <table className="data-table data-table--compact">
          <thead>
            <tr>
              <th>Sev</th>
              <th>Firma</th>
              <th>Src → Dst</th>
              <th>Proto</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rawAlerts.map((a: SuricataAlert) => (
              <tr
                key={a.id}
                className={`data-table__row--clickable${expanded === a.id ? ' data-table__row--expanded' : ''}`}
                onClick={() => setExpanded(prev => prev === a.id ? null : a.id)}
              >
                <td>
                  <span className={`badge badge--sev-${a.severity}`}>
                    {SEVERITY_LABELS[a.severity] ?? a.severity}
                  </span>
                </td>
                <td className="text-truncate max-w-40">{a.signature}</td>
                <td className="font-mono text-xs">{a.src_ip} → {a.dst_ip}</td>
                <td><code>{a.protocol ?? '?'}</code></td>
                <td className="text-muted">{expanded === a.id ? '▲' : '▼'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
