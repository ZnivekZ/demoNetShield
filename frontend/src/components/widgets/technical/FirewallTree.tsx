import { useFirewallTree } from '../../../hooks/widgets/technical';
import { WidgetSkeleton, WidgetErrorState, WidgetHeader } from '../common';

export function FirewallTree({ config: _config }: { config?: Record<string, unknown> }) {
  const { data, isLoading, error, refetch } = useFirewallTree();

  if (isLoading) return <WidgetSkeleton rows={5} />;
  if (error || !data) return <WidgetErrorState onRetry={() => refetch()} />;

  const { grouped } = data;

  const ACTION_COLORS: Record<string, string> = {
    drop: '#ef4444',
    reject: '#f97316',
    accept: '#10b981',
    passthrough: '#3b82f6',
  };

  return (
    <div className="widget-technical">
      <WidgetHeader title="Árbol de Firewall" />
      <div className="widget-technical__scroll-body">
        {Object.entries(grouped).map(([chain, rules]) => (
          <details key={chain} className="widget-firewall-tree__chain" open={chain === 'input'}>
            <summary className="widget-firewall-tree__chain-header">
              <code className="widget-firewall-tree__chain-name">{chain}</code>
              <span className="text-muted"> ({(rules as unknown[]).length} reglas)</span>
            </summary>
            <table className="data-table data-table--compact widget-firewall-tree__table">
              <thead>
                <tr><th>#</th><th>Acción</th><th>Src</th><th>Dst</th><th>Proto</th><th>Comentario</th></tr>
              </thead>
              <tbody>
                {(rules as { id?: string; action?: string; src_address?: string; dst_address?: string; protocol?: string; comment?: string }[]).map((r, i) => (
                  <tr key={r.id ?? i}>
                    <td className="text-muted">{i + 1}</td>
                    <td>
                      <span
                        className="badge"
                        style={{ background: ACTION_COLORS[r.action?.toLowerCase() ?? ''] ?? '#6b7280', color: '#fff' }}
                      >
                        {r.action ?? '?'}
                      </span>
                    </td>
                    <td className="font-mono text-xs">{r.src_address ?? '*'}</td>
                    <td className="font-mono text-xs">{r.dst_address ?? '*'}</td>
                    <td>{r.protocol ?? 'any'}</td>
                    <td className="text-muted text-truncate">{r.comment ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        ))}
      </div>
    </div>
  );
}
