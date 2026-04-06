import { useQuery } from '@tanstack/react-query';
import {
  Shield,
  Wifi,
  AlertTriangle,
  Link2,
} from 'lucide-react';
import { wazuhApi, mikrotikApi } from '../../services/api';
import TrafficChart from './TrafficChart';
import ConnectionsTable from './ConnectionsTable';
import AlertsFeed from './AlertsFeed';

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  color,
  delay,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  color: string;
  delay: string;
}) {
  return (
    <div className={`stat-card animate-fade-in-up ${delay}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[0.7rem] font-semibold text-surface-400 uppercase tracking-wider mb-1">
            {label}
          </p>
          <p className="text-2xl font-bold text-surface-100">{value}</p>
          {sub && (
            <p className="text-[0.7rem] text-surface-500 mt-0.5">{sub}</p>
          )}
        </div>
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background: `${color}15` }}
        >
          <Icon className="w-5 h-5" style={{ color }} />
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { data: agentsResp } = useQuery({
    queryKey: ['wazuh-agents'],
    queryFn: wazuhApi.getAgents,
    refetchInterval: 10000,
  });

  const { data: alertsResp } = useQuery({
    queryKey: ['wazuh-alerts'],
    queryFn: () => wazuhApi.getAlerts(50),
    refetchInterval: 5000,
  });

  const { data: rulesResp } = useQuery({
    queryKey: ['firewall-rules'],
    queryFn: mikrotikApi.getFirewallRules,
    refetchInterval: 15000,
  });

  const { data: connectionsResp } = useQuery({
    queryKey: ['connections'],
    queryFn: mikrotikApi.getConnections,
    refetchInterval: 5000,
  });

  const agents = agentsResp?.data ?? [];
  const alerts = alertsResp?.data ?? [];
  const rules = rulesResp?.data ?? [];
  const connections = connectionsResp?.data ?? [];

  const activeAgents = agents.filter((a) => a.status === 'active').length;
  const criticalAlerts = alerts.filter((a) => a.rule_level >= 12).length;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-xl font-bold text-surface-100">Dashboard</h1>
        <p className="text-sm text-surface-500 mt-0.5">
          Monitoreo en tiempo real de la infraestructura de seguridad
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={Wifi}
          label="Agentes Wazuh"
          value={`${activeAgents}/${agents.length}`}
          sub="Conectados"
          color="#22c55e"
          delay="stagger-1"
        />
        <StatCard
          icon={Shield}
          label="Reglas Firewall"
          value={rules.length}
          sub="Reglas activas"
          color="#6366f1"
          delay="stagger-2"
        />
        <StatCard
          icon={AlertTriangle}
          label="Alertas 24h"
          value={alerts.length}
          sub={`${criticalAlerts} críticas`}
          color={criticalAlerts > 0 ? '#ef4444' : '#f59e0b'}
          delay="stagger-3"
        />
        <StatCard
          icon={Link2}
          label="Conexiones"
          value={connections.length}
          sub="Activas ahora"
          color="#3b82f6"
          delay="stagger-4"
        />
      </div>

      {/* Traffic chart */}
      <div className="glass-card p-5 animate-fade-in-up" style={{ animationDelay: '0.25s' }}>
        <h2 className="text-sm font-semibold text-surface-200 mb-4">
          Tráfico de Red en Tiempo Real
        </h2>
        <TrafficChart />
      </div>

      {/* Bottom row: Connections + Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass-card p-5 animate-fade-in-up" style={{ animationDelay: '0.3s' }}>
          <h2 className="text-sm font-semibold text-surface-200 mb-4">
            Conexiones Activas
          </h2>
          <ConnectionsTable connections={connections} />
        </div>
        <div className="glass-card p-5 animate-fade-in-up" style={{ animationDelay: '0.35s' }}>
          <h2 className="text-sm font-semibold text-surface-200 mb-4">
            Feed de Alertas
          </h2>
          <AlertsFeed alerts={alerts} />
        </div>
      </div>
    </div>
  );
}
