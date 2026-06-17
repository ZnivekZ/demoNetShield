/**
 * RouteTable — Widget técnico: tabla de ruteo de MikroTik.
 */
import { WidgetSkeleton, WidgetErrorState, WidgetHeader } from '../common';
import { useRouteTable } from '../../../hooks/widgets/technical';
import type { RouteEntry } from '../../../types';

export function RouteTable() {
  const { data, isLoading, error, refetch } = useRouteTable();

  if (isLoading) return <WidgetSkeleton rows={5} />;
  if (error) return <WidgetErrorState message={(error as Error).message} onRetry={() => refetch()} />;

  const routes = (data ?? []) as RouteEntry[];
  const active = routes.filter(r => r.active).length;

  const typeLabel = (r: RouteEntry) => {
    if (r.connect) return <span className="badge badge-success">conectada</span>;
    if (r.static)  return <span className="badge badge-info">estática</span>;
    if (r.ospf)    return <span className="badge badge-high">OSPF</span>;
    return <span className="badge badge-medium">dinámica</span>;
  };

  return (
    <div className="flex flex-col h-full">
      <WidgetHeader
        title="Tabla de Ruteo"
        subtitle={`${active}/${routes.length} activas`}
      />
      <div className="flex-1 overflow-auto rounded-lg mt-3">
        <table className="data-table text-xs">
          <thead>
            <tr>
              <th>Destino</th>
              <th>Gateway</th>
              <th>Dist.</th>
              <th>Tipo</th>
            </tr>
          </thead>
          <tbody>
            {routes.slice(0, 10).map(r => (
              <tr key={r.id} className={(!r.active || r.disabled) ? 'opacity-40' : ''}>
                <td className="font-mono font-semibold">{r.dst_address}</td>
                <td className="font-mono text-brand-300">{r.gateway}</td>
                <td className="text-center text-surface-400">{r.distance}</td>
                <td>{typeLabel(r)}</td>
              </tr>
            ))}
            {routes.length === 0 && (
              <tr>
                <td colSpan={4} className="text-center text-surface-500 py-4">
                  Sin rutas disponibles
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
