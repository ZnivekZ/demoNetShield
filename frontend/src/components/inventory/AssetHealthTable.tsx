/**
 * AssetHealthTable — Per-asset inventory status (GLPI only).
 * Columns: equipo, tipo, ubicación, asignado, estado, última actualización.
 * No Wazuh/MikroTik data is shown here.
 */
import type { GlpiAssetHealth } from '../../types';

interface Props {
  assets: GlpiAssetHealth[];
  isLoading: boolean;
}

const TYPE_LABELS: Record<string, string> = {
  Computer: 'Computadora',
  Printer: 'Impresora',
  Peripheral: 'Periférico',
  Phone: 'Teléfono',
  NetworkEquipment: 'Equipo de Red',
  Monitor: 'Monitor',
};

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

function formatDate(value: string): string {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
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
            <th>Equipo</th>
            <th>Tipo</th>
            <th title="IP cargada en GLPI (pestaña Red → NetworkPort)">IP</th>
            <th>Ubicación</th>
            <th>Asignado a</th>
            <th>Estado</th>
            <th>Última actualización</th>
          </tr>
        </thead>
        <tbody>
          {assets.map((asset) => (
            <tr key={`${asset.type}-${asset.asset_id}`}>
              <td style={{ fontWeight: 500, color: 'var(--color-surface-100)' }}>{asset.name}</td>
              <td style={{ fontSize: '0.78rem', color: 'var(--color-surface-400)' }}>
                {TYPE_LABELS[asset.type] ?? asset.type ?? '—'}
              </td>
              <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--color-surface-300)' }}
                  title={asset.ip ? `IP de ${asset.name} (GLPI)` : 'El activo no tiene IP en GLPI'}>
                {asset.ip || '—'}
              </td>
              <td>{asset.location || '—'}</td>
              <td>{asset.assigned_user || '—'}</td>
              <td>
                <GlpiStatusBadge status={asset.glpi_status} />
              </td>
              <td style={{ fontSize: '0.75rem', color: 'var(--color-surface-400)' }}>
                {formatDate(asset.last_update)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
