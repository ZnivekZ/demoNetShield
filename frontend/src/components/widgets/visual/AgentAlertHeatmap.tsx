import { useAgentAlertHeatmap } from '../../../hooks/widgets/visual';
import { WidgetSkeleton, WidgetErrorState, WidgetHeader } from '../common';

/**
 * Grid NxM: agentes (filas) × últimas N horas (columnas).
 * Intensidad por celda = número de alertas.
 */
export function AgentAlertHeatmap({ config }: { config?: { hours?: number } }) {
  const hours = config?.hours ?? 12;
  const { data, isLoading, error, refetch } = useAgentAlertHeatmap(hours);

  if (isLoading) return <WidgetSkeleton rows={4} />;
  if (error || !data) return <WidgetErrorState message={String(error)} onRetry={() => refetch()} />;

  if (data.agents.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--color-text-muted)' }}>
        <WidgetHeader title="Alertas por Agente" />
        <p style={{ fontSize: '0.75rem', marginTop: '0.5rem' }}>Sin alertas en las últimas {hours}h</p>
      </div>
    );
  }

  const maxVal = Math.max(...data.agents.flatMap(a => a.slots), 1);

  function cellColor(val: number): string {
    if (val === 0) return 'var(--color-surface-alt, #1e293b)';
    const intensity = val / maxVal;
    if (intensity > 0.66) return 'var(--color-danger, #ef4444)';
    if (intensity > 0.33) return 'var(--color-warning, #f59e0b)';
    return 'var(--color-success, #10b981)';
  }

  const hourLabels = Array.from({ length: hours }, (_, i) => {
    const d = new Date(Date.now() - (hours - 1 - i) * 3_600_000);
    return `${d.getHours()}h`;
  });

  return (
    <div className="widget-agent-heatmap">
      <WidgetHeader title="Alertas por Agente" />
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.6rem' }}>
          <thead>
            <tr>
              <th style={{ color: 'var(--color-text-muted)', textAlign: 'left', padding: '0 4px', minWidth: '80px' }}>Agente</th>
              {hourLabels.map(h => (
                <th key={h} style={{ color: 'var(--color-text-muted)', textAlign: 'center', padding: '0 2px', minWidth: '22px' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.agents.slice(0, 8).map(agent => (
              <tr key={agent.name}>
                <td style={{ color: 'var(--color-text-secondary)', padding: '2px 4px', maxWidth: '80px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {agent.name}
                </td>
                {agent.slots.map((val, i) => (
                  <td key={i} style={{ padding: '2px' }}>
                    <div
                      title={`${val} alertas`}
                      style={{
                        width: '18px', height: '18px',
                        background: cellColor(val),
                        borderRadius: '3px',
                        opacity: val === 0 ? 0.3 : 0.85,
                        transition: 'background 0.3s',
                      }}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
