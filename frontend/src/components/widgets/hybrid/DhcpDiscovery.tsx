/**
 * DhcpDiscovery — Widget híbrido de dispositivos nuevos detectados por DHCP.
 * Cruza leases DHCP con inventario GLPI para detectar dispositivos no registrados.
 * Categoría: hybrid | Type: hybrid_dhcp_discovery
 */
import { useDhcpDiscoveryWidget } from '../../../hooks/widgets/hybrid';
import { WidgetHeader, WidgetSkeleton, WidgetErrorState } from '../common';
import { Search, AlertTriangle } from 'lucide-react';

interface Props {
  config: { limit?: number };
}

export function DhcpDiscovery({ config }: Props) {
  const limit = config.limit ?? 8;
  const { data, isLoading, isError, refetch } = useDhcpDiscoveryWidget(limit);

  if (isLoading) return <WidgetSkeleton />;
  if (isError || !data) return <WidgetErrorState onRetry={refetch} />;

  const devices: {
    address: string;
    mac_address: string;
    host_name?: string;
    in_glpi: boolean;
    in_arp: boolean;
    status: string;
    server: string;
  }[] = Array.isArray(data) ? data.slice(0, limit) : [];

  const unknown = devices.filter(d => !d.in_glpi);
  const known   = devices.filter(d => d.in_glpi);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', height: '100%' }}>
      <WidgetHeader
        icon={Search}
        title="Descubrimiento DHCP"
        subtitle={`${unknown.length} no inventariados · ${known.length} en GLPI`}
      />

      {devices.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textAlign: 'center', marginTop: '1rem' }}>
          Sin dispositivos detectados
        </p>
      ) : (
        <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          {unknown.length > 0 && (
            <div style={{
              background: 'rgba(239,68,68,0.08)',
              border: '1px solid rgba(239,68,68,0.2)',
              borderRadius: '6px',
              padding: '0.5rem 0.6rem',
              marginBottom: '0.25rem',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.35rem' }}>
                <AlertTriangle size={12} style={{ color: 'var(--color-danger)' }} />
                <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--color-danger)' }}>
                  No inventariados ({unknown.length})
                </span>
              </div>
              {unknown.map(d => (
                <div key={d.address} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '0.2rem 0',
                  borderBottom: '1px solid rgba(255,255,255,0.04)',
                }}>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontFamily: 'monospace', fontSize: '0.72rem', fontWeight: 600, color: 'var(--color-danger)' }}>
                      {d.address}
                    </span>
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                      {d.host_name ?? d.mac_address}
                    </span>
                  </div>
                  <span style={{
                    fontSize: '0.6rem',
                    padding: '0.1rem 0.4rem',
                    borderRadius: '10px',
                    background: 'rgba(239,68,68,0.15)',
                    color: 'var(--color-danger)',
                  }}>
                    Desconocido
                  </span>
                </div>
              ))}
            </div>
          )}

          {known.length > 0 && (
            <div>
              <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                En GLPI ({known.length})
              </span>
              {known.map(d => (
                <div key={d.address} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '0.25rem 0',
                  borderBottom: '1px solid rgba(255,255,255,0.04)',
                }}>
                  <span style={{ fontFamily: 'monospace', fontSize: '0.7rem', color: 'var(--accent-primary)' }}>
                    {d.address}
                  </span>
                  <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                    {d.host_name ?? '—'}
                  </span>
                  <span style={{
                    fontSize: '0.6rem',
                    padding: '0.1rem 0.4rem',
                    borderRadius: '10px',
                    background: 'rgba(16,185,129,0.12)',
                    color: 'var(--color-success)',
                  }}>
                    ✓ GLPI
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
