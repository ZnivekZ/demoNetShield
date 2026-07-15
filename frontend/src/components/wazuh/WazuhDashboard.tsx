/**
 * WazuhDashboard.tsx — Dedicated SIEM overview for the Wazuh module.
 *
 * Route: /wazuh
 *
 * Layout:
 *   ┌─ Header + health pill ─────────────────────────────────────────────────┐
 *   ├─ 6 KPI cards (24h / 7d totals, critical, agents, vulns, top tactic) ──┤
 *   ├─ Timeline (last 24h alerts) + Donut MITRE ────────────────────────────┤
 *   ├─ Last critical incident (deep-link to /wazuh/alerts) ─────────────────┤
 *   └─ Top agents + Recent alerts (deep-link to subpages) ──────────────────┘
 */
import { Link } from 'react-router-dom';
import {
  Activity, ShieldAlert, Server, Bug, Target,
  AlertCircle, ArrowRight, ChevronRight,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import {
  useAgentsSummary,
  useAlertsTimeline,
  useCriticalAlerts,
  useLastCritical,
  useMitreSummary,
  useTopAgents,
  useWazuhHealth,
} from '../../hooks/useWazuhSummary';
import { useWazuhStatsSummary } from '../../hooks/useWazuh';
import { formatDateTime, severityClass } from '../utils/time';

const PIE_COLORS = ['#6366f1', '#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

export function WazuhDashboard() {
  const { data: stats } = useWazuhStatsSummary();
  const { data: agentsSummary } = useAgentsSummary();
  const { data: criticalAlerts = [] } = useCriticalAlerts(50);
  const { data: timeline = [] } = useAlertsTimeline(5);
  const { data: mitre = [] } = useMitreSummary();
  const { data: topAgents = [] } = useTopAgents(10);
  const { data: lastCritical } = useLastCritical();
  const { data: health } = useWazuhHealth();

  const servicesDown = health?.services?.filter(s => s.status !== 'running').length ?? 0;
  const healthClass = servicesDown > 0 ? 'wazuh-health-pill wazuh-health-degraded' : 'wazuh-health-pill wazuh-health-ok';

  // Timeline data — last 60 minutes, keyed by HH:MM
  const timelineData = timeline.slice(-60).map(p => ({
    time: p.minute.slice(11, 16),
    alertas: p.count,
  }));

  const topTactics = mitre.slice(0, 8);

  return (
    <div className="space-y-6">
      {/* ── Header ────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <ShieldAlert className="w-5 h-5 text-cyan-400" />
            <h1 className="text-2xl font-bold text-surface-100">Wazuh SIEM</h1>
            <span className={healthClass} title="Estado del clúster Wazuh">
              <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
              {health?.status ?? 'unknown'}
            </span>
          </div>
          <p className="text-sm text-surface-400">
            Visibilidad unificada · {agentsSummary?.total ?? 0} agentes · {stats?.total_alerts_24h ?? 0} alertas (24h)
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link to="/wazuh/alerts" className="btn-secondary text-sm flex items-center gap-1.5">
            Ver todas las alertas <ArrowRight className="w-3.5 h-3.5" />
          </Link>
          <Link to="/wazuh/agents" className="btn-primary text-sm flex items-center gap-1.5">
            Explorar agentes <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      {/* ── KPI row ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiMini
          icon={<Activity className="w-4 h-4" />}
          label="Alertas 24h"
          value={stats?.total_alerts_24h ?? '—'}
          color="text-cyan-400"
          to="/wazuh/alerts"
        />
        <KpiMini
          icon={<AlertCircle className="w-4 h-4" />}
          label="Críticas"
          value={stats?.critical_alerts_24h ?? '—'}
          color="text-red-400"
          to="/wazuh/alerts?level_min=12"
        />
        <KpiMini
          icon={<Server className="w-4 h-4" />}
          label="Agentes activos"
          value={`${stats?.active_agents ?? 0}/${stats?.total_agents ?? 0}`}
          color="text-emerald-400"
          to="/wazuh/agents"
        />
        <KpiMini
          icon={<Bug className="w-4 h-4" />}
          label="Vulnerabilidades"
          value={stats?.vulnerabilities_total ?? 0}
          color="text-amber-400"
          to="/wazuh/vulnerabilities"
          hint={stats?.vulnerabilities_total === 0 ? 'Pendiente backend' : undefined}
        />
        <KpiMini
          icon={<Target className="w-4 h-4" />}
          label="Tácticas MITRE"
          value={stats?.top_mitre_tactics?.length ?? 0}
          color="text-violet-400"
          to="/wazuh/mitre"
        />
        <KpiMini
          icon={<ShieldAlert className="w-4 h-4" />}
          label="Alertas Altas"
          value={stats?.high_alerts_24h ?? '—'}
          color="text-orange-400"
          to="/wazuh/alerts?level_min=8"
        />
      </div>

      {/* ── Charts row ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Timeline — 2 cols */}
        <div className="glass-card p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="font-semibold text-surface-100 text-sm">Timeline de alertas</h3>
              <p className="text-xs text-surface-500">Últimos 60 minutos · nivel ≥ 5</p>
            </div>
            <Link to="/wazuh/alerts" className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1">
              Detalle <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
          {timelineData.length === 0 ? (
            <EmptyState msg="Sin alertas registradas" />
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={timelineData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="wazuh-tl-grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="time" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: '#94a3b8' }}
                />
                <Area type="monotone" dataKey="alertas" name="Alertas" stroke="#06b6d4" strokeWidth={2} fill="url(#wazuh-tl-grad)" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* MITRE donut — 1 col */}
        <div className="glass-card p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="font-semibold text-surface-100 text-sm">Top tácticas MITRE</h3>
              <p className="text-xs text-surface-500">{topTactics.length} técnicas</p>
            </div>
            <Link to="/wazuh/mitre" className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1">
              Matriz <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
          {topTactics.length === 0 ? (
            <EmptyState msg="Sin técnicas mapeadas" />
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie
                  data={topTactics}
                  dataKey="count"
                  nameKey="technique_name"
                  cx="50%" cy="50%"
                  innerRadius={40} outerRadius={70}
                  paddingAngle={2}
                  strokeWidth={0}
                >
                  {topTactics.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
                />
                <Legend
                  wrapperStyle={{ fontSize: 10, color: '#94a3b8' }}
                  iconSize={8}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ── Last critical + Top agents row ────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Last critical incident — 2 cols */}
        <div className="glass-card p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-surface-100 text-sm">Última alerta crítica</h3>
            <Link to="/wazuh/alerts?level_min=12" className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1">
              Ver todas <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
          {!lastCritical ? (
            <EmptyState msg="Sin alertas críticas en las últimas 24h" />
          ) : (
            <div className={`wazuh-incident wazuh-sev-${severityClass(lastCritical.rule_level)}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-surface-500 font-mono">
                  {formatDateTime(lastCritical.timestamp)}
                </span>
                <span className={`wazuh-sev-badge wazuh-sev-${severityClass(lastCritical.rule_level)}`}>
                  Nivel {lastCritical.rule_level}
                </span>
              </div>
              <p className="text-sm text-surface-100 font-medium leading-snug">
                {lastCritical.rule_description}
              </p>
              <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                <Field label="Agente" value={lastCritical.agent_name || '—'} mono />
                <Field label="Agent ID" value={lastCritical.agent_id} mono />
                <Field label="Regla" value={lastCritical.rule_id} mono />
                <Field label="Origen" value={lastCritical.src_ip || '—'} mono />
              </div>
              {lastCritical.full_log && (
                <details className="mt-3">
                  <summary className="text-xs text-surface-400 cursor-pointer hover:text-surface-300">
                    Ver log completo
                  </summary>
                  <pre className="mt-2 p-3 bg-surface-950/60 border border-surface-800/60 rounded text-[11px] text-surface-300 overflow-x-auto whitespace-pre-wrap break-all">
                    {lastCritical.full_log}
                  </pre>
                </details>
              )}
            </div>
          )}
        </div>

        {/* Top agents — 1 col */}
        <div className="glass-card p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-surface-100 text-sm">Top agentes</h3>
            <Link to="/wazuh/agents" className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1">
              Ver todos <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
          {topAgents.length === 0 ? (
            <EmptyState msg="Sin actividad registrada" />
          ) : (
            <div className="space-y-2">
              {topAgents.slice(0, 6).map((a, i) => (
                <Link
                  key={`${a.id}-${i}`}
                  to={`/wazuh/agents/${encodeURIComponent(a.id)}`}
                  className="flex items-center gap-2 p-2 -mx-2 rounded hover:bg-surface-800/40 transition-colors"
                >
                  <span className="text-xs text-surface-600 w-4 shrink-0">{i + 1}.</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-surface-200 truncate">{a.name || a.id}</p>
                    <p className="text-[10px] text-surface-500 font-mono truncate">{a.ip || '—'}</p>
                  </div>
                  <span className="text-xs font-semibold text-cyan-400">{a.alert_count ?? 0}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Recent alerts feed (compact) ─────────────────────────────── */}
      <div className="glass-card overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-surface-800/40">
          <h3 className="font-semibold text-surface-100 text-sm">Alertas recientes (nivel ≥ 5)</h3>
          <Link to="/wazuh/alerts" className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1">
            Ver todas <ChevronRight className="w-3 h-3" />
          </Link>
        </div>
        {criticalAlerts.length === 0 ? (
          <div className="p-6 text-center text-surface-500 text-sm">Sin alertas</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-surface-800/50 bg-surface-900/40">
                  {['Hora', 'Nivel', 'Descripción', 'Agente', 'Regla'].map(h => (
                    <th key={h} className="px-3 py-2 text-[11px] text-surface-500 font-medium uppercase tracking-wider">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {criticalAlerts.slice(0, 10).map(a => (
                  <tr key={a.id} className="border-b border-surface-800/20 hover:bg-surface-800/20 transition-colors">
                    <td className="px-3 py-2 text-xs text-surface-400 font-mono whitespace-nowrap">
                      {formatDateTime(a.timestamp)}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`wazuh-sev-badge wazuh-sev-${severityClass(a.rule_level)}`}>
                        {a.rule_level}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-surface-200 max-w-md truncate">
                      {a.rule_description}
                    </td>
                    <td className="px-3 py-2 text-xs text-surface-400 truncate max-w-[180px]">
                      {a.agent_name}
                    </td>
                    <td className="px-3 py-2 text-xs text-surface-500 font-mono">{a.rule_id}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────

interface KpiMiniProps {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  color: string;
  to: string;
  hint?: string | undefined;
}

function KpiMini({ icon, label, value, color, to, hint }: KpiMiniProps) {
  return (
    <Link
      to={to}
      className="wazuh-kpi group"
      title={hint}
    >
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className={color}>{icon}</span>
        <span className="text-[11px] text-surface-400 font-medium uppercase tracking-wide">{label}</span>
      </div>
      <div className={`text-xl font-bold ${color}`}>{value}</div>
      {hint && <p className="text-[10px] text-surface-500 mt-1">{hint}</p>}
      <ChevronRight className="w-3.5 h-3.5 text-surface-600 group-hover:text-cyan-400 absolute right-2 top-1/2 -translate-y-1/2 transition-colors" />
    </Link>
  );
}

function Field({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-[10px] text-surface-500 uppercase tracking-wider">{label}</p>
      <p className={`text-surface-200 truncate ${mono ? 'font-mono' : ''}`}>{value || '—'}</p>
    </div>
  );
}

function EmptyState({ msg }: { msg: string }) {
  return (
    <div className="h-[140px] flex items-center justify-center text-sm text-surface-500">
      {msg}
    </div>
  );
}