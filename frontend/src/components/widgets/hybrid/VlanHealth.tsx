import { useVlanHealth } from '../../../hooks/widgets/hybrid';
import { WidgetSkeleton, WidgetErrorState, WidgetHeader } from '../common';

interface VlanEntry { vlan_id?: number; name?: string; address?: string; alert_count: number; health: 'ok' | 'warning' | 'critical' }

const HEALTH_COLOR = {
  ok: 'var(--color-success, #10b981)',
  warning: 'var(--color-warning, #f59e0b)',
  critical: 'var(--color-danger, #ef4444)',
};

const HEALTH_LABEL = { ok: 'OK', warning: 'WARN', critical: 'CRÍTICO' };

/**
 * Barra horizontal por VLAN con segmento de color según salud.
 * Correlaciona VLANs de MikroTik con alertas de Wazuh.
 */
export function VlanHealth({ config: _config }: { config?: Record<string, unknown> }) {
  const { data, isLoading, error, refetch } = useVlanHealth();

  if (isLoading) return <WidgetSkeleton rows={4} />;
  if (error || !data) return <WidgetErrorState message={String(error)} onRetry={() => refetch()} />;

  const vlans = (data.vlans ?? []) as VlanEntry[];
  const maxAlerts = Math.max(...vlans.map(v => v.alert_count), 1);

  return (
    <div className="widget-vlan-health">
      <WidgetHeader title="Salud por VLAN" />
      {data.partial && (
        <span style={{ color: 'var(--color-warning)', fontSize: '0.6rem' }}>⚠ Datos parciales</span>
      )}
      {vlans.length === 0 ? (
        <p style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem', textAlign: 'center' }}>Sin VLANs configuradas</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', marginTop: '0.3rem' }}>
          {vlans.map(v => (
            <div key={v.vlan_id ?? v.name} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              {/* Badge estado */}
              <span style={{
                fontSize: '0.55rem', fontWeight: 700, padding: '1px 5px', borderRadius: '4px',
                background: HEALTH_COLOR[v.health] + '22',
                color: HEALTH_COLOR[v.health],
                border: `1px solid ${HEALTH_COLOR[v.health]}55`,
                flexShrink: 0, minWidth: '42px', textAlign: 'center',
              }}>
                {HEALTH_LABEL[v.health]}
              </span>

              {/* Nombre de VLAN */}
              <span style={{
                fontSize: '0.7rem', color: 'var(--color-text-secondary)',
                flexShrink: 0, minWidth: '80px', overflow: 'hidden',
                textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {v.name ?? `VLAN ${v.vlan_id}`}
              </span>

              {/* Barra */}
              <div style={{ flex: 1, background: 'var(--color-surface-alt,#1e293b)', borderRadius: '4px', height: '7px', overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  width: v.alert_count > 0 ? `${Math.max(4, (v.alert_count / maxAlerts) * 100)}%` : '0%',
                  background: HEALTH_COLOR[v.health],
                  borderRadius: '4px',
                  transition: 'width 0.5s ease',
                }} />
              </div>

              {/* Conteo */}
              <span style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', flexShrink: 0, minWidth: '28px', textAlign: 'right' }}>
                {v.alert_count}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
