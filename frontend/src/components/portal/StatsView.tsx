/**
 * StatsView — Historical statistics tab.
 * Shows: unique user counts, avg session duration, top 10 lists, and usage heatmap.
 */
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Users, Clock, Database } from 'lucide-react';
import { usePortalSummaryStats } from '../../hooks/usePortalStats';
import { UsageHeatmap } from './UsageHeatmap';

function formatDuration(seconds: number): string {
  if (seconds === 0) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

export function StatsView() {
  const { data: stats, isLoading } = usePortalSummaryStats();

  if (isLoading) {
    return (
      <div className="portal-loading" style={{ paddingTop: '48px' }}>
        <span className="loading-spinner" />
        <span>Cargando estadísticas…</span>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="portal-loading" style={{ paddingTop: '48px' }}>
        <span style={{ color: 'var(--color-text-muted)' }}>Sin datos disponibles</span>
      </div>
    );
  }

  return (
    <div className="portal-view">
      {/* Summary cards */}
      <div className="portal-stat-grid">
        <div className="glass-card portal-stat-card">
          <div className="portal-stat-icon" style={{ color: 'var(--color-primary)' }}>
            <Users size={20} />
          </div>
          <div className="portal-stat-body">
            <span className="portal-stat-value">{stats.unique_users_today}</span>
            <span className="portal-stat-label">Usuarios únicos hoy</span>
          </div>
        </div>
        <div className="glass-card portal-stat-card">
          <div className="portal-stat-icon" style={{ color: 'var(--color-success)' }}>
            <Users size={20} />
          </div>
          <div className="portal-stat-body">
            <span className="portal-stat-value">{stats.unique_users_week}</span>
            <span className="portal-stat-label">Esta semana</span>
          </div>
        </div>
        <div className="glass-card portal-stat-card">
          <div className="portal-stat-icon" style={{ color: 'var(--color-accent)' }}>
            <Users size={20} />
          </div>
          <div className="portal-stat-body">
            <span className="portal-stat-value">{stats.unique_users_month}</span>
            <span className="portal-stat-label">Este mes</span>
          </div>
        </div>
        <div className="glass-card portal-stat-card">
          <div className="portal-stat-icon" style={{ color: 'var(--color-warning)' }}>
            <Clock size={20} />
          </div>
          <div className="portal-stat-body">
            <span className="portal-stat-value">{formatDuration(stats.avg_session_duration_seconds)}</span>
            <span className="portal-stat-label">Duración promedio</span>
          </div>
        </div>
      </div>

      {/* New registrations chart */}
      {stats.new_registrations_30d.length > 0 && (
        <div className="glass-card portal-chart-card">
          <h3 className="portal-section-title">Nuevos registros (30 días)</h3>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={stats.new_registrations_30d} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis
                dataKey="date"
                stroke="var(--color-text-muted)"
                tick={{ fontSize: 10 }}
                tickLine={false}
                tickFormatter={d => d.slice(5)}
                interval="preserveStartEnd"
              />
              <YAxis stroke="var(--color-text-muted)" tick={{ fontSize: 10 }} tickLine={false} allowDecimals={false} width={24} />
              <Tooltip
                contentStyle={{
                  background: 'var(--color-surface)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '8px',
                  color: 'var(--color-text)',
                  fontSize: '12px',
                }}
              />
              <Bar dataKey="count" name="Registros" fill="var(--color-primary)" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Top lists */}
      <div className="portal-top-lists">
        {/* Top by data */}
        <div className="glass-card portal-top-card">
          <h3 className="portal-section-title">
            <Database size={14} /> Top 10 por consumo
          </h3>
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Usuario</th>
                <th>Datos</th>
                <th>Sesiones</th>
              </tr>
            </thead>
            <tbody>
              {stats.top_by_data.map((u, i) => (
                <tr key={u.user}>
                  <td className="text-muted">{i + 1}</td>
                  <td>{u.user}</td>
                  <td>{formatBytes(u.bytes_total)}</td>
                  <td>{u.sessions}</td>
                </tr>
              ))}
              {stats.top_by_data.length === 0 && (
                <tr><td colSpan={4} className="portal-table-empty">Sin datos</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Top by time */}
        <div className="glass-card portal-top-card">
          <h3 className="portal-section-title">
            <Clock size={14} /> Top 10 por tiempo conectado
          </h3>
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Usuario</th>
                <th>Tiempo</th>
                <th>Sesiones</th>
              </tr>
            </thead>
            <tbody>
              {stats.top_by_time.map((u, i) => (
                <tr key={u.user}>
                  <td className="text-muted">{i + 1}</td>
                  <td>{u.user}</td>
                  <td>{formatDuration(u.total_uptime_seconds)}</td>
                  <td>{u.sessions}</td>
                </tr>
              ))}
              {stats.top_by_time.length === 0 && (
                <tr><td colSpan={4} className="portal-table-empty">Sin datos</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Heatmap */}
      <div className="glass-card portal-chart-card">
        <h3 className="portal-section-title">Mapa de uso semanal</h3>
        <p className="portal-config-subtitle">Intensidad de sesiones por hora y día de la semana</p>
        <UsageHeatmap data={stats.peak_by_day} />
      </div>
    </div>
  );
}
