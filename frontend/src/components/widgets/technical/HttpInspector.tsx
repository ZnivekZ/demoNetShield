import { useHttpInspector } from '../../../hooks/widgets/technical';
import { WidgetSkeleton, WidgetErrorState, WidgetHeader } from '../common';

interface HttpTransaction {
  http_method?: string;
  url?: string;
  http_user_agent?: string;
  status?: number;
  length?: number;
  src_ip?: string;
  timestamp?: string;
}

const METHOD_COLORS: Record<string, string> = {
  GET: 'var(--color-success, #10b981)',
  POST: 'var(--accent-primary, #6366f1)',
  PUT: 'var(--color-warning, #f59e0b)',
  DELETE: 'var(--color-danger, #ef4444)',
  PATCH: 'var(--color-warning, #f59e0b)',
};

function statusColor(s?: number): string {
  if (!s) return 'var(--color-text-muted)';
  if (s < 300) return 'var(--color-success, #10b981)';
  if (s < 400) return 'var(--color-warning, #f59e0b)';
  return 'var(--color-danger, #ef4444)';
}

/**
 * Tabla de transacciones HTTP capturadas por Suricata NSM.
 * Columnas: método (badge), URL, user-agent, status, tamaño.
 */
export function HttpInspector({ config }: { config?: { limit?: number } }) {
  const limit = config?.limit ?? 25;
  const { data, isLoading, error, refetch } = useHttpInspector(limit);

  if (isLoading) return <WidgetSkeleton rows={5} />;
  if (error || !data) return <WidgetErrorState message={String(error)} onRetry={() => refetch()} />;

  const txns = data as HttpTransaction[];

  return (
    <div className="widget-http-inspector">
      <WidgetHeader title="Inspector HTTP" />
      {txns.length === 0 ? (
        <p style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem', textAlign: 'center' }}>Sin transacciones HTTP</p>
      ) : (
        <div style={{ overflowY: 'auto', maxHeight: '240px' }}>
          <table className="data-table" style={{ fontSize: '0.68rem' }}>
            <thead>
              <tr>
                <th>Método</th>
                <th>URL</th>
                <th>User-Agent</th>
                <th>Status</th>
                <th>Tamaño</th>
              </tr>
            </thead>
            <tbody>
              {txns.map((t, i) => (
                <tr key={i}>
                  <td>
                    <span style={{
                      color: METHOD_COLORS[t.http_method ?? ''] ?? 'var(--color-text-muted)',
                      fontWeight: 700, fontSize: '0.65rem',
                    }}>
                      {t.http_method ?? '-'}
                    </span>
                  </td>
                  <td style={{ maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <span title={t.url}>{t.url ?? '-'}</span>
                  </td>
                  <td style={{ maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--color-text-muted)' }}>
                    <span title={t.http_user_agent}>{t.http_user_agent ?? '-'}</span>
                  </td>
                  <td style={{ color: statusColor(t.status), fontWeight: 600 }}>
                    {t.status ?? '-'}
                  </td>
                  <td style={{ color: 'var(--color-text-muted)' }}>
                    {t.length != null ? `${t.length}B` : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
