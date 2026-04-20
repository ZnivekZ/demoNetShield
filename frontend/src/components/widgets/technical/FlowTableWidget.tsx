import { useState } from 'react';
import { useFlowTable } from '../../../hooks/widgets/technical';
import { WidgetSkeleton, WidgetErrorState, WidgetHeader } from '../common';
import type { NetworkFlow } from '../../../types';

export function FlowTableWidget({ config }: { config?: { limit?: number } }) {
  const limit = config?.limit ?? 30;
  const { data, isLoading, error, refetch } = useFlowTable(limit);
  const [filterProto, setFilterProto] = useState('');

  if (isLoading) return <WidgetSkeleton rows={6} />;
  if (error || !data) return <WidgetErrorState onRetry={() => refetch()} />;

  const rawFlows: NetworkFlow[] = (data as { flows?: NetworkFlow[] }).flows ?? (data as unknown as NetworkFlow[]);

  const flows = rawFlows.filter(f =>
    filterProto ? f.protocol?.toLowerCase() === filterProto.toLowerCase() : true
  );

  const protos = Array.from(new Set(rawFlows.map(f => f.protocol))).filter(Boolean);

  return (
    <div className="widget-technical">
      <WidgetHeader title="Flujos de Red NSM" />
      <div className="widget-technical__toolbar">
        <select
          className="input-sm"
          value={filterProto}
          onChange={e => setFilterProto(e.target.value)}
        >
          <option value="">Todos los protocolos</option>
          {protos.map(p => <option key={p}>{p}</option>)}
        </select>
      </div>
      <div className="widget-technical__scroll-body">
        <table className="data-table data-table--compact">
          <thead>
            <tr>
              <th>Proto</th>
              <th>Src</th>
              <th>Dst</th>
              <th>Bytes</th>
              <th>Pkts</th>
            </tr>
          </thead>
          <tbody>
            {flows.slice(0, limit).map((f, i) => (
              <tr key={f.id ?? i}>
                <td><code>{f.protocol}</code></td>
                <td className="font-mono text-xs">{f.src_ip}{f.src_port ? `:${f.src_port}` : ''}</td>
                <td className="font-mono text-xs">{f.dst_ip}{f.dst_port ? `:${f.dst_port}` : ''}</td>
                <td className="text-muted">{((f.bytes_toserver ?? 0) / 1024).toFixed(1)} KB</td>
                <td className="text-muted">{f.pkts_toserver ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
