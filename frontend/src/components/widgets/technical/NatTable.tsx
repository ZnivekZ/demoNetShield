/**
 * NatTable — Widget técnico: tabla de reglas NAT de MikroTik.
 */
import { WidgetSkeleton, WidgetErrorState, WidgetHeader } from '../common';
import { useNatTable } from '../../../hooks/widgets/technical';
import type { NatRule } from '../../../types';

export function NatTable() {
  const { data, isLoading, error, refetch } = useNatTable();

  if (isLoading) return <WidgetSkeleton rows={5} />;
  if (error) return <WidgetErrorState message={(error as Error).message} onRetry={() => refetch()} />;

  const rules = (data ?? []) as NatRule[];
  const active = rules.filter(r => !r.disabled).length;

  const actionColor = (action: string) => {
    if (action === 'masquerade') return 'badge-info';
    if (action === 'dst-nat')    return 'badge-medium';
    if (action === 'src-nat')    return 'badge-high';
    return 'badge-success';
  };

  return (
    <div className="flex flex-col h-full">
      <WidgetHeader
        title="Reglas NAT"
        subtitle={`${active}/${rules.length} activas`}
      />
      <div className="flex-1 overflow-auto rounded-lg mt-3">
        <table className="data-table text-xs">
          <thead>
            <tr>
              <th>Chain</th>
              <th>Acción</th>
              <th>Puerto dst</th>
              <th>Redirige a</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {rules.slice(0, 10).map(r => (
              <tr key={r.id} className={r.disabled ? 'opacity-40' : ''}>
                <td className="font-mono">{r.chain}</td>
                <td>
                  <span className={`badge ${actionColor(r.action)}`}>{r.action}</span>
                </td>
                <td className="font-mono text-brand-300">
                  {r.dst_port ? `:${r.dst_port}` : r.out_interface || '—'}
                </td>
                <td className="font-mono">
                  {r.to_addresses
                    ? `${r.to_addresses}${r.to_ports ? ':' + r.to_ports : ''}`
                    : '—'}
                </td>
                <td>
                  {r.disabled
                    ? <span className="badge badge-danger">off</span>
                    : <span className="badge badge-success">on</span>
                  }
                </td>
              </tr>
            ))}
            {rules.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center text-surface-500 py-4">
                  Sin reglas NAT
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
