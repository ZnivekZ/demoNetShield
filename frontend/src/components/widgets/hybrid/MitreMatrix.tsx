import { useMitreMatrix } from '../../../hooks/widgets/hybrid';
import { WidgetSkeleton, WidgetErrorState, WidgetHeader } from '../common';

interface TacticData { tactic: string; techniques: { technique: string; count: number }[]; total: number }

/**
 * Grid compacto MITRE ATT&CK: tácticas como columnas, técnicas como celdas.
 * Color según frecuencia: verde < 3, amarillo < 10, rojo >= 10.
 */
export function MitreMatrix({ config: _config }: { config?: Record<string, unknown> }) {
  const { data, isLoading, error, refetch } = useMitreMatrix();

  if (isLoading) return <WidgetSkeleton rows={4} />;
  if (error || !data) return <WidgetErrorState message={String(error)} onRetry={() => refetch()} />;

  const tactics = data.tactics as TacticData[];

  function cellColor(count: number): string {
    if (count >= 10) return 'var(--color-danger, #ef4444)';
    if (count >= 3)  return 'var(--color-warning, #f59e0b)';
    return 'var(--color-success, #10b981)';
  }

  return (
    <div className="widget-mitre-matrix">
      <WidgetHeader title="MITRE ATT&CK" />
      <p style={{ color: 'var(--color-text-muted)', fontSize: '0.65rem', marginBottom: '0.5rem' }}>
        {data.total_detections} detecciones en {tactics.length} táctica{tactics.length !== 1 ? 's' : ''}
      </p>
      {tactics.length === 0 ? (
        <p style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem', textAlign: 'center' }}>Sin detecciones MITRE</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'separate', borderSpacing: '3px', fontSize: '0.6rem', width: '100%' }}>
            <thead>
              <tr>
                {tactics.map(t => (
                  <th key={t.tactic} style={{
                    color: 'var(--color-text-muted)', textAlign: 'center',
                    padding: '0 4px 4px', fontSize: '0.58rem',
                    maxWidth: '70px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }} title={t.tactic}>
                    {t.tactic.replace(/-/g, ' ')}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                {tactics.map(t => (
                  <td key={t.tactic} style={{ verticalAlign: 'top', padding: '0' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                      {t.techniques.slice(0, 5).map(tech => (
                        <div key={tech.technique}
                          title={`${tech.technique}: ${tech.count} detecciones`}
                          style={{
                            background: cellColor(tech.count) + '22',
                            border: `1px solid ${cellColor(tech.count)}55`,
                            borderRadius: '3px', padding: '2px 4px',
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            gap: '4px', minWidth: '60px',
                          }}>
                          <span style={{ color: 'var(--color-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                            {tech.technique}
                          </span>
                          <span style={{ color: cellColor(tech.count), fontWeight: 700, flexShrink: 0 }}>
                            {tech.count}
                          </span>
                        </div>
                      ))}
                      {t.techniques.length > 5 && (
                        <span style={{ color: 'var(--color-text-muted)', fontSize: '0.55rem', textAlign: 'center' }}>
                          +{t.techniques.length - 5}
                        </span>
                      )}
                    </div>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
