/**
 * DhcpLeasesWidget — Widget técnico de tabla de leases DHCP activos.
 * Tabla compacta con IP, MAC, hostname y estado.
 * Categoría: technical | Type: technical_dhcp_leases
 */
import { useDhcpLeasesWidget } from '../../../hooks/widgets/technical';
import { WidgetHeader, WidgetSkeleton, WidgetErrorState } from '../common';
import { Layers } from 'lucide-react';

interface Props {
  config: { limit?: number };
}

const STATUS_COLORS: Record<string, string> = {
  bound:   'var(--color-success)',
  offered: 'var(--color-warning)',
  waiting: 'var(--text-muted)',
};

export function DhcpLeasesWidget({ config }: Props) {
  const limit = config.limit ?? 10;
  const { data, isLoading, isError, refetch } = useDhcpLeasesWidget(limit);

  if (isLoading) return <WidgetSkeleton />;
  if (isError || !data) return <WidgetErrorState onRetry={refetch} />;

  const leases = Array.isArray(data) ? data.slice(0, limit) : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', height: '100%' }}>
      <WidgetHeader icon={Layers} title="Leases DHCP" subtitle={`${leases.length} activos`} />

      {leases.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textAlign: 'center', marginTop: '1rem' }}>
          Sin leases activos
        </p>
      ) : (
        <div style={{ overflowY: 'auto', flex: 1 }}>
          <table className="data-table" style={{ fontSize: '0.7rem' }}>
            <thead>
              <tr>
                <th>IP</th>
                <th>Hostname</th>
                <th>MAC</th>
                <th>Estado</th>
                <th>Tipo</th>
              </tr>
            </thead>
            <tbody>
              {leases.map((lease: {
                id: string;
                address: string;
                host_name?: string;
                mac_address: string;
                status: string;
                dynamic: boolean;
              }) => (
                <tr key={lease.id}>
                  <td style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--accent-primary)' }}>
                    {lease.address}
                  </td>
                  <td style={{ maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {lease.host_name ?? '—'}
                  </td>
                  <td style={{ fontFamily: 'monospace', fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                    {lease.mac_address}
                  </td>
                  <td>
                    <span style={{
                      color: STATUS_COLORS[lease.status] ?? 'var(--text-muted)',
                      fontWeight: 600,
                      fontSize: '0.65rem',
                    }}>
                      {lease.status}
                    </span>
                  </td>
                  <td style={{ color: lease.dynamic ? 'var(--text-muted)' : 'var(--accent-secondary)', fontSize: '0.65rem' }}>
                    {lease.dynamic ? 'Dinámica' : '📌 Estática'}
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
