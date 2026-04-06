/**
 * QuickView — Main security dashboard page (route: /).
 * Shows: 4 stat cards, LastIncidentCard, AlertTimeline, MitreDonut, AgentTopTable.
 */
import { useState } from 'react';
import { ShieldAlert, Users, Activity, Wifi } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { useAgentsSummary, useAlertsTimeline, useCriticalAlerts, useLastCritical, useMitreSummary, useTopAgents } from '../../hooks/useWazuhSummary';
import { useInterfaces } from '../../hooks/useMikrotikHealth';
import { LastIncidentCard } from './LastIncidentCard';
import { ConfirmModal } from '../common/ConfirmModal';
import { useBlockIP } from '../../hooks/useSecurityActions';
import { formatDistanceToNow, formatDateTime, severityClass } from '../utils/time';

const PIE_COLORS = ['#6366f1', '#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899'];

export function QuickView() {
  const { data: agentsSummary } = useAgentsSummary();
  const { data: criticalAlerts = [] } = useCriticalAlerts(10);
  const { data: timeline = [] } = useAlertsTimeline(5);
  const { data: mitre = [] } = useMitreSummary();
  const { data: topAgents = [] } = useTopAgents(10);
  const { data: lastCritical } = useLastCritical();
  const { data: interfaces = [] } = useInterfaces();
  const blockIPMutation = useBlockIP();

  const [topN, setTopN] = useState(5);
  const [blockTarget, setBlockTarget] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const downInterfaces = interfaces.filter(i => !i.running && !i.disabled).length;
  const mitreTop = mitre.slice(0, 8);

  // Timeline chart data — last 30 minutes only, keyed by HH:MM
  const timelineData = timeline.slice(-30).map(p => ({
    time: p.minute.slice(11, 16),
    alertas: p.count,
  }));

  const handleBlockIP = (ip: string) => {
    setBlockTarget(ip);
    setConfirmOpen(true);
  };

  const confirmBlock = async () => {
    if (!blockTarget) return;
    await blockIPMutation.mutateAsync({
      ip: blockTarget,
      reason: `Manual block from QuickView — ${lastCritical?.rule_description ?? ''}`,
      duration_hours: 24,
      source: 'manual',
    });
    setConfirmOpen(false);
    setBlockTarget(null);
  };

  return (
    <div className="animate-fade-in-up" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* ── Stat Cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
        <StatCard
          icon={<Users size={18} />}
          label="Agentes Activos"
          value={agentsSummary?.active ?? '—'}
          sub={`${agentsSummary?.disconnected ?? 0} desconectados`}
          color="var(--color-success)"
          stagger="stagger-1"
        />
        <StatCard
          icon={<ShieldAlert size={18} />}
          label="Alertas Críticas"
          value={criticalAlerts.length}
          sub="Nivel > 10"
          color="var(--color-danger)"
          stagger="stagger-2"
        />
        <StatCard
          icon={<Activity size={18} />}
          label="Técnicas MITRE"
          value={mitre.length}
          sub="detectadas"
          color="var(--color-brand-400)"
          stagger="stagger-3"
        />
        <StatCard
          icon={<Wifi size={18} />}
          label="Interfaces Caídas"
          value={downInterfaces}
          sub="en MikroTik"
          color={downInterfaces > 0 ? 'var(--color-warning)' : 'var(--color-success)'}
          stagger="stagger-4"
        />
      </div>

      {/* ── Last Incident ── */}
      {lastCritical && (
        <LastIncidentCard alert={lastCritical} onBlockIP={handleBlockIP} />
      )}

      {/* ── Charts Row ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '1rem' }}>
        {/* Alert Timeline */}
        <div className="glass-card" style={{ padding: '1.25rem' }}>
          <h3 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '1rem', color: 'var(--color-surface-200)' }}>
            Timeline de Alertas (últimos 30 min)
          </h3>
          {timelineData.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={timelineData}>
                <defs>
                  <linearGradient id="alertGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="time" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ background: 'var(--color-surface-800)', border: '1px solid rgba(148,163,184,0.1)', borderRadius: 8 }}
                  labelStyle={{ color: 'var(--color-surface-300)' }}
                />
                <Area type="monotone" dataKey="alertas" stroke="#6366f1" fill="url(#alertGrad)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="empty-state">Sin datos de timeline</div>
          )}
        </div>

        {/* MITRE Donut */}
        <div className="glass-card" style={{ padding: '1.25rem' }}>
          <h3 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '1rem', color: 'var(--color-surface-200)' }}>
            Técnicas MITRE
          </h3>
          {mitreTop.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie
                  data={mitreTop}
                  dataKey="count"
                  nameKey="technique_name"
                  innerRadius={45}
                  outerRadius={75}
                  paddingAngle={2}
                >
                  {mitreTop.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: 'var(--color-surface-800)', border: '1px solid rgba(148,163,184,0.1)', borderRadius: 8 }}
                />
                <Legend
                  formatter={v => <span style={{ fontSize: '0.65rem', color: 'var(--color-surface-400)' }}>{String(v).slice(0, 20)}</span>}
                  iconSize={8}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="empty-state">Sin datos MITRE</div>
          )}
        </div>
      </div>

      {/* ── Top Agents Table ── */}
      <div className="glass-card" style={{ padding: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-surface-200)' }}>
            Top Agentes por Alertas
          </h3>
          <select
            className="input"
            style={{ width: 'auto', padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
            value={topN}
            onChange={e => setTopN(Number(e.target.value))}
          >
            {[5, 10, 20].map(n => <option key={n} value={n}>Top {n}</option>)}
          </select>
        </div>
        {topAgents.length > 0 ? (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Agente</th>
                  <th>Alertas</th>
                  <th>Top Técnica</th>
                  <th>Última Alerta</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {topAgents.slice(0, topN).map((agent, i) => (
                  <tr key={agent.agent_id}>
                    <td style={{ color: 'var(--color-surface-500)', fontSize: '0.75rem' }}>{i + 1}</td>
                    <td>
                      <span style={{ fontWeight: 500 }}>{agent.agent_name}</span>
                      <span style={{ color: 'var(--color-surface-500)', fontSize: '0.7rem', display: 'block' }}>{agent.agent_id}</span>
                    </td>
                    <td>
                      <span className={`badge badge-${agent.alert_count > 20 ? 'critical' : agent.alert_count > 10 ? 'high' : 'medium'}`}>
                        {agent.alert_count}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.75rem', color: 'var(--color-surface-400)', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {agent.top_mitre_technique || '—'}
                    </td>
                    <td style={{ fontSize: '0.75rem', color: 'var(--color-surface-500)' }}>
                      {formatDistanceToNow(agent.last_alert_timestamp)}
                    </td>
                    <td>
                      <button
                        className="btn btn-ghost"
                        style={{ padding: '0.2rem 0.5rem', fontSize: '0.7rem' }}
                        onClick={() => handleBlockIP(agent.agent_id)}
                      >
                        Bloquear
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">Sin datos de agentes</div>
        )}
      </div>

      {/* Alerts Table */}
      {criticalAlerts.length > 0 && (
        <div className="glass-card" style={{ padding: '1.25rem' }}>
          <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-surface-200)', marginBottom: '1rem' }}>
            Alertas Críticas Recientes
          </h3>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Nivel</th>
                  <th>Agente</th>
                  <th>Descripción</th>
                  <th>MITRE</th>
                  <th>IP Origen</th>
                  <th>Timestamp</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {criticalAlerts.map(alert => (
                  <tr key={alert.id}>
                    <td><span className={`badge badge-${severityClass(alert.rule_level)}`}>{alert.rule_level}</span></td>
                    <td style={{ fontWeight: 500 }}>{alert.agent_name}</td>
                    <td style={{ color: 'var(--color-surface-300)', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {alert.rule_description}
                    </td>
                    <td style={{ fontSize: '0.72rem', color: 'var(--color-brand-300)' }}>{alert.mitre_technique || '—'}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>{alert.src_ip || '—'}</td>
                    <td style={{ fontSize: '0.72rem', color: 'var(--color-surface-500)' }}>{formatDateTime(alert.timestamp)}</td>
                    <td>
                      {alert.src_ip && (
                        <button
                          className="btn btn-danger"
                          style={{ padding: '0.2rem 0.5rem', fontSize: '0.7rem' }}
                          onClick={() => handleBlockIP(alert.src_ip)}
                        >
                          Bloquear
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Confirm Modal */}
      {confirmOpen && blockTarget && (
        <ConfirmModal
          title="Bloquear IP"
          description="Esta IP será agregada a la lista negra en MikroTik por 24 horas."
          data={{ IP: blockTarget, Duración: '24 horas', Lista: 'Blacklist_Automatica' }}
          confirmLabel="Bloquear"
          onConfirm={confirmBlock}
          onCancel={() => { setConfirmOpen(false); setBlockTarget(null); }}
          isLoading={blockIPMutation.isPending}
        />
      )}
    </div>
  );
}

// ── Internal: StatCard ─────────────────────────────────────────

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  sub: string;
  color: string;
  stagger: string;
}

function StatCard({ icon, label, value, sub, color, stagger }: StatCardProps) {
  return (
    <div className={`stat-card animate-fade-in-up ${stagger}`}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
        <span style={{ color }}>{icon}</span>
        <span style={{ fontSize: '0.75rem', color: 'var(--color-surface-400)', fontWeight: 500 }}>{label}</span>
      </div>
      <div style={{ fontSize: '2rem', fontWeight: 700, lineHeight: 1, color }}>{value}</div>
      <div style={{ fontSize: '0.7rem', color: 'var(--color-surface-500)', marginTop: '0.25rem' }}>{sub}</div>
    </div>
  );
}
