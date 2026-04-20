import { usePhishingStats } from '../../../hooks/widgets/visual';
import { WidgetSkeleton, WidgetErrorState, WidgetHeader } from '../common';

/**
 * 3 stat cards: alertas totales, dominios en sinkhole, víctimas detectadas.
 * Tendencia semanal por color.
 */
export function PhishingStats({ config: _config }: { config?: Record<string, unknown> }) {
  const { data, isLoading, error, refetch } = usePhishingStats();

  if (isLoading) return <WidgetSkeleton rows={2} />;
  if (error || !data) return <WidgetErrorState message={String(error)} onRetry={() => refetch()} />;

  const d = data as {
    total_alerts?: number;
    sinkholed_domains?: number;
    victims_detected?: number;
    alerts_today?: number;
    risk_level?: string;
  };

  const riskColor = d.risk_level === 'high' ? 'var(--color-danger, #ef4444)'
    : d.risk_level === 'medium' ? 'var(--color-warning, #f59e0b)'
    : 'var(--color-success, #10b981)';

  const cards = [
    { label: 'Alertas totales', value: d.total_alerts ?? 0, color: 'var(--color-warning, #f59e0b)', icon: '⚠' },
    { label: 'Sinkholed', value: d.sinkholed_domains ?? 0, color: 'var(--accent-primary, #6366f1)', icon: '🕳' },
    { label: 'Víctimas', value: d.victims_detected ?? 0, color: 'var(--color-danger, #ef4444)', icon: '👤' },
  ];

  return (
    <div className="widget-phishing-stats">
      <WidgetHeader title="Estadísticas Phishing" />
      {d.risk_level && (
        <div style={{ textAlign: 'center', marginBottom: '0.5rem' }}>
          <span style={{
            color: riskColor, fontWeight: 700, fontSize: '0.7rem',
            textTransform: 'uppercase', letterSpacing: '0.05em',
          }}>
            Riesgo: {d.risk_level?.toUpperCase()}
          </span>
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
        {cards.map(c => (
          <div key={c.label} style={{
            background: 'var(--color-surface-alt, #1e293b)',
            borderRadius: '8px', padding: '0.65rem',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.2rem',
          }}>
            <span style={{ fontSize: '1.1rem' }}>{c.icon}</span>
            <span style={{ color: c.color, fontSize: '1.3rem', fontWeight: 700 }}>{c.value}</span>
            <span style={{ color: 'var(--color-text-muted)', fontSize: '0.6rem', textAlign: 'center' }}>{c.label}</span>
          </div>
        ))}
      </div>
      {d.alerts_today !== undefined && (
        <p style={{ color: 'var(--color-text-muted)', fontSize: '0.65rem', textAlign: 'center', marginTop: '0.4rem' }}>
          {d.alerts_today} alertas hoy
        </p>
      )}
    </div>
  );
}
