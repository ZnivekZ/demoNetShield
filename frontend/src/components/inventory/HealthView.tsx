/**
 * HealthView — Combined health dashboard for GLPI + Wazuh + MikroTik.
 * Shows: stat cards (ok/warning/critical/total) + status pie chart + health table.
 */
import { CheckCircle, AlertTriangle, XCircle, Monitor } from 'lucide-react';
import { useGlpiHealth } from '../../hooks/useGlpiHealth';
import { useGlpiAssetStats } from '../../hooks/useGlpiAssets';
import { AssetHealthTable } from './AssetHealthTable';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';

const HEALTH_COLORS = { ok: '#22c55e', warning: '#f59e0b', critical: '#ef4444' };
const STATUS_COLORS = { activo: '#22c55e', reparacion: '#f59e0b', retirado: '#94a3b8', pendiente: '#6366f1' };

export function HealthView() {
  const { data: health, isLoading: healthLoading } = useGlpiHealth();
  const { data: stats, isLoading: statsLoading } = useGlpiAssetStats();

  const healthChartData = health
    ? [
        { name: 'Operativo', value: health.summary.ok, color: HEALTH_COLORS.ok },
        { name: 'Atención', value: health.summary.warning, color: HEALTH_COLORS.warning },
        { name: 'Crítico', value: health.summary.critical, color: HEALTH_COLORS.critical },
      ].filter((d) => d.value > 0)
    : [];

  const statusChartData = stats
    ? [
        { name: 'Activo', value: stats.activo, color: STATUS_COLORS.activo },
        { name: 'Reparación', value: stats.reparacion, color: STATUS_COLORS.reparacion },
        { name: 'Retirado', value: stats.retirado, color: STATUS_COLORS.retirado },
        { name: 'Pendiente', value: stats.pendiente, color: STATUS_COLORS.pendiente },
      ].filter((d) => d.value > 0)
    : [];

  return (
    <div className="health-view">
      {/* Stat Cards Row */}
      <div className="health-stat-row">
        <div className="stat-card animate-fade-in-up stagger-1">
          <div className="health-stat-card__icon" style={{ color: '#22c55e' }}>
            <CheckCircle size={20} />
          </div>
          <div className="health-stat-card__value" style={{ color: '#22c55e' }}>
            {healthLoading ? '…' : (health?.summary.ok ?? 0)}
          </div>
          <div className="health-stat-card__label">Operativos</div>
        </div>

        <div className="stat-card animate-fade-in-up stagger-2">
          <div className="health-stat-card__icon" style={{ color: '#f59e0b' }}>
            <AlertTriangle size={20} />
          </div>
          <div className="health-stat-card__value" style={{ color: '#f59e0b' }}>
            {healthLoading ? '…' : (health?.summary.warning ?? 0)}
          </div>
          <div className="health-stat-card__label">Con Advertencias</div>
        </div>

        <div className="stat-card animate-fade-in-up stagger-3">
          <div className="health-stat-card__icon" style={{ color: '#ef4444' }}>
            <XCircle size={20} />
          </div>
          <div className="health-stat-card__value" style={{ color: '#ef4444' }}>
            {healthLoading ? '…' : (health?.summary.critical ?? 0)}
          </div>
          <div className="health-stat-card__label">Críticos</div>
        </div>

        <div className="stat-card animate-fade-in-up stagger-4">
          <div className="health-stat-card__icon" style={{ color: 'var(--color-brand-400)' }}>
            <Monitor size={20} />
          </div>
          <div className="health-stat-card__value" style={{ color: 'var(--color-brand-400)' }}>
            {healthLoading ? '…' : (health?.summary.total ?? 0)}
          </div>
          <div className="health-stat-card__label">Total Activos</div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="health-charts-row">
        {/* Health pie chart */}
        <div className="glass-card health-chart-card">
          <div className="health-chart-card__title">Estado de Salud</div>
          {healthLoading ? (
            <div className="health-chart-card__loading">
              <span className="loading-spinner" />
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={healthChartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={80}
                  dataKey="value"
                  paddingAngle={2}
                >
                  {healthChartData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: 'rgba(15,23,42,0.95)',
                    border: '1px solid rgba(148,163,184,0.1)',
                    borderRadius: 8,
                    fontSize: 12,
                    color: '#e2e8f0',
                  }}
                />
                <Legend
                  iconType="circle"
                  iconSize={8}
                  wrapperStyle={{ fontSize: 11, color: '#94a3b8' }}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Status pie chart */}
        <div className="glass-card health-chart-card">
          <div className="health-chart-card__title">Estado GLPI</div>
          {statsLoading ? (
            <div className="health-chart-card__loading">
              <span className="loading-spinner" />
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={statusChartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={80}
                  dataKey="value"
                  paddingAngle={2}
                >
                  {statusChartData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: 'rgba(15,23,42,0.95)',
                    border: '1px solid rgba(148,163,184,0.1)',
                    borderRadius: 8,
                    fontSize: 12,
                    color: '#e2e8f0',
                  }}
                />
                <Legend
                  iconType="circle"
                  iconSize={8}
                  wrapperStyle={{ fontSize: 11, color: '#94a3b8' }}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Health Table */}
      <div className="glass-card animate-fade-in-up">
        <div style={{ padding: '1rem 1.25rem 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-surface-200)' }}>
            Detalle por Equipo
          </span>
          {health?.mock && (
            <span className="badge badge-warning" style={{ fontSize: '0.65rem' }}>
              Datos de demo
            </span>
          )}
        </div>
        <AssetHealthTable
          assets={health?.assets ?? []}
          isLoading={healthLoading}
        />
      </div>
    </div>
  );
}
