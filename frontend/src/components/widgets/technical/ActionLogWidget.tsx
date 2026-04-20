import { useActionLogWidget } from '../../../hooks/widgets/technical';
import { WidgetSkeleton, WidgetErrorState, WidgetHeader } from '../common';
import type { ActionLogEntry } from '../../../types';

export function ActionLogWidget({ config }: { config?: { limit?: number } }) {
  const limit = config?.limit ?? 50;
  const { data, isLoading, error, refetch } = useActionLogWidget(limit);

  if (isLoading) return <WidgetSkeleton rows={6} />;
  if (error || !data) return <WidgetErrorState onRetry={() => refetch()} />;

  return (
    <div className="widget-technical">
      <WidgetHeader title="Log de Acciones" />
      <div className="widget-technical__scroll-body">
        <table className="data-table data-table--compact">
          <thead>
            <tr>
              <th>Acción</th>
              <th>Usuario</th>
              <th>IP</th>
              <th>Fecha</th>
            </tr>
          </thead>
          <tbody>
            {(data as ActionLogEntry[]).map(row => (
              <tr key={row.id}>
                <td>{row.action_type}</td>
                <td>{row.performed_by ?? '—'}</td>
                <td><code>{row.target_ip ?? '—'}</code></td>
                <td className="text-muted">{new Date(row.created_at).toLocaleTimeString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
