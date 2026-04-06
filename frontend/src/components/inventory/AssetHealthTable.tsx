/**
 * AssetHealthTable — Per-asset health status table.
 * Shows: name, IP, location, GLPI status, Wazuh agent, network visibility, health.
 */
import type { GlpiAssetHealth } from '../../types';

interface Props {
  assets: GlpiAssetHealth[];
  isLoading: boolean;
}

function HealthDot({ health }: { health: 'ok' | 'warning' | 'critical' }) {
  const colors = {
    ok: '#22c55e',
    warning: '#f59e0b',
    critical: '#ef4444',
  };
  const glow = {
    ok: 'rgba(34,197,94,0.4)',
    warning: 'rgba(245,158,11,0.4)',
    critical: 'rgba(239,68,68,0.4)',
  };
  return (
    <span
      style={{
        display: 'inline-block',
        width: 10,
        height: 10,
        borderRadius: '50%',
        background: colors[health],
        boxShadow: `0 0 6px ${glow[health]}`,
        flexShrink: 0,
      }}
    />
  );
}

function WazuhBadge({ status }: { status: string }) {
  if (status === 'active') return <span className="badge badge-success" style={{ fontSize: '0.62rem' }}>Activo</span>;
  if (status === 'disconnected') return <span className="badge badge-danger" style={{ fontSize: '0.62rem' }}>Desconectado</span>;
  return <span className="badge badge-low" style={{ fontSize: '0.62rem' }}>No instalado</span>;
}

function GlpiStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    activo: 'badge-success',
    reparacion: 'badge-warning',
    retirado: 'badge-low',
    pendiente: 'badge-info',
    bajo_investigacion: 'badge-danger',
  };
  const labels: Record<string, string> = {
    activo: 'Activo',
    reparacion: 'Reparación',
    retirado: 'Retirado',
    pendiente: 'Pendiente',
    bajo_investigacion: 'Cuarentena',
  };
  return (
    <span className={`badge ${map[status] ?? 'badge-low'}`} style={{ fontSize: '0.62rem' }}>
      {labels[status] ?? status}
    </span>
  );
}

export function AssetHealthTable({ assets, isLoading }: Props) {
  if (isLoading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <span className="loading-spinner" />
      </div>
    );
  }

  if (assets.length === 0) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-surface-500)', fontSize: '0.85rem' }}>
        No hay activos en el inventario.
      </div>
    );
  }

  return (
    <div style={{ overflowX: 'auto', maxHeight: 420, overflowY: 'auto' }}>
      <table className="data-table">
        <thead>
          <tr>
            <th>Salud</th>
            <th>Equipo</th>
            <th>IP</th>
            <th>Ubicación</th>
            <th>Estado GLPI</th>
            <th>Wazuh</th>
            <th>Red</th>
            <th>Motivo</th>
          </tr>
        </thead>
        <tbody>
          {assets.map((asset) => (
            <tr key={asset.asset_id}>
              <td>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <HealthDot health={asset.health} />
                </div>
              </td>
              <td style={{ fontWeight: 500, color: 'var(--color-surface-100)' }}>
                {asset.name}
              </td>
              <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>
                {asset.ip || '—'}
              </td>
              <td>{asset.location || '—'}</td>
              <td>
                <GlpiStatusBadge status={asset.glpi_status} />
              </td>
              <td>
                <WazuhBadge status={asset.wazuh_agent} />
              </td>
              <td>
                {asset.network_visible ? (
                  <span className="badge badge-success" style={{ fontSize: '0.62rem' }}>Visible</span>
                ) : (
                  <span className="badge badge-low" style={{ fontSize: '0.62rem' }}>No visible</span>
                )}
              </td>
              <td style={{ fontSize: '0.72rem', color: 'var(--color-surface-500)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {asset.health_reason || '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
