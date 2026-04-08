/**
 * MonitorView — Real-time portal session monitor tab.
 * Shows 4 stat cards + live sessions table + sessions-over-time chart.
 * Uses WebSocket via usePortalSessions for live updates.
 */
import { Wifi, Users, TrendingDown, TrendingUp, Clock } from 'lucide-react';
import { usePortalSessions } from '../../hooks/usePortalSessions';
import { usePortalRealtimeStats } from '../../hooks/usePortalStats';
import { SessionsTable } from './SessionsTable';
import { SessionsChart } from './SessionsChart';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B/s';
  const k = 1024;
  const sizes = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

export function MonitorView() {
  const { sessions, chartHistory, isConnected, error } = usePortalSessions();
  const { data: stats } = usePortalRealtimeStats(isConnected);

  // Use WebSocket session count as primary source, fall back to stats API
  const safeSessions = sessions || [];
  const totalActive = safeSessions.length || stats?.total_sessions_active || 0;
  const registeredOnline = stats?.registered_users_online ?? safeSessions.filter(s => s.status === 'registered').length;
  const unregisteredOnline = stats?.unregistered_users_online ?? safeSessions.filter(s => s.status === 'unregistered').length;
  const bwIn = stats?.total_bandwidth_in ?? 0;
  const bwOut = stats?.total_bandwidth_out ?? 0;
  const peakHour = stats?.peak_hour_today || '—';

  return (
    <div className="portal-monitor">
      {/* Error banner when hotspot not initialized */}
      {error && (
        <div className="portal-error-banner">
          <Wifi size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* Stat Cards */}
      <div className="portal-stat-grid">
        <div className="glass-card portal-stat-card">
          <div className="portal-stat-icon" style={{ color: 'var(--color-primary)' }}>
            <Wifi size={20} />
          </div>
          <div className="portal-stat-body">
            <span className="portal-stat-value">{totalActive}</span>
            <span className="portal-stat-label">Sesiones activas</span>
          </div>
        </div>

        <div className="glass-card portal-stat-card">
          <div className="portal-stat-icon" style={{ color: 'var(--color-success)' }}>
            <Users size={20} />
          </div>
          <div className="portal-stat-body">
            <span className="portal-stat-value">{registeredOnline}</span>
            <span className="portal-stat-label">Registrados online</span>
          </div>
        </div>

        <div className="glass-card portal-stat-card">
          <div className="portal-stat-icon" style={{ color: 'var(--color-warning)' }}>
            <Users size={20} />
          </div>
          <div className="portal-stat-body">
            <span className="portal-stat-value">{unregisteredOnline}</span>
            <span className="portal-stat-label">No registrados</span>
          </div>
        </div>

        <div className="glass-card portal-stat-card">
          <div className="portal-stat-icon" style={{ color: 'var(--color-accent)' }}>
            <Clock size={20} />
          </div>
          <div className="portal-stat-body">
            <span className="portal-stat-value">{peakHour}</span>
            <span className="portal-stat-label">Hora pico hoy</span>
          </div>
        </div>
      </div>

      {/* Bandwidth row */}
      <div className="portal-bw-row">
        <div className="glass-card portal-bw-card">
          <TrendingDown size={14} style={{ color: 'var(--color-primary)' }} />
          <span className="portal-bw-label">Ingreso total</span>
          <span className="portal-bw-value">{formatBytes(bwIn)}</span>
        </div>
        <div className="glass-card portal-bw-card">
          <TrendingUp size={14} style={{ color: 'var(--color-warning)' }} />
          <span className="portal-bw-label">Egreso total</span>
          <span className="portal-bw-value">{formatBytes(bwOut)}</span>
        </div>
      </div>

      {/* Sessions Chart */}
      <div className="glass-card portal-chart-card">
        <h3 className="portal-section-title">Sesiones en tiempo real</h3>
        <SessionsChart data={chartHistory} />
      </div>

      {/* Sessions Table */}
      <div className="glass-card portal-table-card">
        <h3 className="portal-section-title">Sesiones activas</h3>
        <SessionsTable sessions={sessions} isConnected={isConnected} />
      </div>
    </div>
  );
}
