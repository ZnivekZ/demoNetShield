/**
 * HealthView — Inventory status dashboard (GLPI only).
 *
 * No cross-tool correlation: an asset is "Activo" when its GLPI status is
 * `activo`. Wazuh/MikroTik are deliberately NOT used here.
 * Shows: stat cards, status pie, type breakdown and the per-asset table.
 */
import { CheckCircle, AlertTriangle, XCircle, Monitor } from 'lucide-react';
import { useGlpiHealth } from '../../hooks/useGlpiHealth';
import { useGlpiStatus } from '../../hooks/useGlpiAssets';
import { AssetHealthTable } from './AssetHealthTable';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';

const HEALTH_COLORS = { ok: '#22c55e', warning: '#f59e0b', critical: '#ef4444' };

const TYPE_COLORS: Record<string, string> = {
  Computer: '#3b82f6',
  Printer: '#a855f7',
  Peripheral: '#06b6d4',
  Phone: '#f97316',
  NetworkEquipment: '#14b8a6',
  Monitor: '#8b5cf6',
};

const TYPE_LABELS: Record<string, string> = {
  Computer: 'Computadora',
  Printer: 'Impresora',
  Peripheral: 'Periférico',
  Phone: 'Teléfono',
  NetworkEquipment: 'Equipo de Red',
  Monitor: 'Monitor',
};

const TOOLTIP_STYLE = {
  background: 'rgba(15,23,42,0.95)',
  border: '1px solid rgba(148,163,184,0.1)',
  borderRadius: 8,
  fontSize: 12,
  color: '#e2e8f0',
};

export function HealthView() {
  const { data: health, isLoading: healthLoading } = useGlpiHealth();
  const { data: glpiStatus } = useGlpiStatus();

  const summary = health?.summary;
  const glpiOffline = glpiStatus?.available === false;

  const statusChartData = [
    { name: 'Activo', value: summary?.ok ?? 0, color: HEALTH_COLORS.ok },
    { name: 'En reparación', value: summary?.warning ?? 0, color: HEALTH_COLORS.warning },
    { name: 'No activo', value: summary?.critical ?? 0, color: HEALTH_COLORS.critical },
  ].filter((d) => d.value > 0);

  const typeChartData = glpiOffline
    ? [{ name: 'Sin conexión', value: 1, color: HEALTH_COLORS.critical }]
    : Object.entries(health?.byType ?? {})
        .map(([type, value]) => ({
          name: TYPE_LABELS[type] ?? type,
          value,
          color: TYPE_COLORS[type] ?? '#64748b',
        }))
        .filter((d) => d.value > 0);

  return (
    <div className="health-view">
      {/* Stat Cards Row */}
      <div className="health-stat-row">
        <div className="stat-card animate-fade-in-up stagger-1">
          <div className="health-stat-card__icon" style={{ color: '#22c55e' }}>
            <CheckCircle size={20} />
          </div>
          <div className="health-stat-card__value" style={{ color: '#22c55e' }}>
            {healthLoading ? '…' : (summary?.active ?? summary?.ok ?? 0)}
          </div>
          <div className="health-stat-card__label">Activos</div>
        </div>

        <div className="stat-card animate-fade-in-up stagger-2">
          <div className="health-stat-card__icon" style={{ color: '#f59e0b' }}>
            <AlertTriangle size={20} />
          </div>
          <div className="health-stat-card__value" style={{ color: '#f59e0b' }}>
            {healthLoading ? '…' : (summary?.warning ?? 0)}
          </div>
          <div className="health-stat-card__label">En Reparación / Pendientes</div>
        </div>

        <div className="stat-card animate-fade-in-up stagger-3">
          <div className="health-stat-card__icon" style={{ color: '#ef4444' }}>
            <XCircle size={20} />
          </div>
          <div className="health-stat-card__value" style={{ color: '#ef4444' }}>
            {healthLoading ? '…' : (summary?.critical ?? 0)}
          </div>
          <div className="health-stat-card__label">No Activos</div>
        </div>

        <div className="stat-card animate-fade-in-up stagger-4">
          <div className="health-stat-card__icon" style={{ color: 'var(--color-brand-400)' }}>
            <Monitor size={20} />
          </div>
          <div className="health-stat-card__value" style={{ color: 'var(--color-brand-400)' }}>
            {healthLoading ? '…' : (summary?.total ?? 0)}
          </div>
          <div className="health-stat-card__label">Total Activos</div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="health-charts-row">
        {/* Status pie chart */}
        <div className="glass-card health-chart-card">
          <div className="health-chart-card__title">Estado de Activos (GLPI)</div>
          {healthLoading ? (
            <div className="health-chart-card__loading">
              <span className="loading-spinner" />
            </div>
          ) : statusChartData.length === 0 ? (
            <div className="health-chart-card__loading" style={{ fontSize: '0.8rem', color: 'var(--color-surface-500)' }}>
              Sin activos en el inventario
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={statusChartData} cx="50%" cy="50%" innerRadius={55} outerRadius={80} dataKey="value" paddingAngle={2}>
                  {statusChartData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Type pie chart */}
        <div className="glass-card health-chart-card">
          <div className="health-chart-card__title">
            Por Tipo de Activo
            {glpiOffline && (
              <span className="badge badge-danger" style={{ marginLeft: 8, fontSize: '0.6rem' }}>
                Sin conexión
              </span>
            )}
          </div>
          {!glpiOffline && healthLoading ? (
            <div className="health-chart-card__loading">
              <span className="loading-spinner" />
            </div>
          ) : typeChartData.length === 0 ? (
            <div className="health-chart-card__loading" style={{ fontSize: '0.8rem', color: 'var(--color-surface-500)' }}>
              Sin datos
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={typeChartData} cx="50%" cy="50%" innerRadius={55} outerRadius={80} dataKey="value" paddingAngle={2}>
                  {typeChartData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Per-asset table */}
      <div className="glass-card animate-fade-in-up">
        <div style={{ padding: '1rem 1.25rem 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-surface-200)' }}>
            Detalle por Equipo
          </span>
        </div>
        <AssetHealthTable assets={health?.assets ?? []} isLoading={healthLoading} />
      </div>
    </div>
  );
}
