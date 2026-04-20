import { useDnsMonitor } from '../../../hooks/widgets/technical';
import { WidgetSkeleton, WidgetErrorState, WidgetHeader } from '../common';

interface DnsQuery {
  rrname?: string;
  rrtype?: string;
  rdata?: string;
  timestamp?: string;
  src_ip?: string;
}

/**
 * Tabla de queries DNS capturados por Suricata NSM.
 * Columnas: dominio, tipo, respuesta, IP origen, hora.
 */
export function DnsMonitor({ config }: { config?: { limit?: number } }) {
  const limit = config?.limit ?? 30;
  const { data, isLoading, error, refetch } = useDnsMonitor(limit);

  if (isLoading) return <WidgetSkeleton rows={5} />;
  if (error || !data) return <WidgetErrorState message={String(error)} onRetry={() => refetch()} />;

  const queries = data as DnsQuery[];

  const typeColor = (t?: string) => {
    if (!t) return 'var(--color-text-muted)';
    if (t === 'A' || t === 'AAAA') return 'var(--color-success, #10b981)';
    if (t === 'MX' || t === 'NS') return 'var(--accent-primary, #6366f1)';
    if (t === 'TXT') return 'var(--color-warning, #f59e0b)';
    return 'var(--color-text-secondary)';
  };

  return (
    <div className="widget-dns-monitor">
      <WidgetHeader title="Monitor DNS" />
      {queries.length === 0 ? (
        <p style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem', textAlign: 'center' }}>Sin queries DNS</p>
      ) : (
        <div style={{ overflowY: 'auto', maxHeight: '240px' }}>
          <table className="data-table" style={{ fontSize: '0.7rem' }}>
            <thead>
              <tr>
                <th>Dominio</th>
                <th>Tipo</th>
                <th>Respuesta</th>
                <th>Origen</th>
                <th>Hora</th>
              </tr>
            </thead>
            <tbody>
              {queries.map((q, i) => (
                <tr key={i}>
                  <td style={{ maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {q.rrname ?? '-'}
                  </td>
                  <td>
                    <span style={{ color: typeColor(q.rrtype), fontWeight: 600 }}>{q.rrtype ?? '-'}</span>
                  </td>
                  <td style={{ maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {q.rdata ?? '-'}
                  </td>
                  <td>{q.src_ip ?? '-'}</td>
                  <td>{q.timestamp ? new Date(q.timestamp).toLocaleTimeString() : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
