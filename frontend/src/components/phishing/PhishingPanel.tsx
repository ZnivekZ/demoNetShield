/**
 * PhishingPanel — Main phishing detection and management page (route: /phishing).
 */
import { useState } from 'react';
import { Fish, AlertTriangle, Globe, Users, Clock, ShieldOff, Trash2, Play } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import {
  usePhishingStats, usePhishingAlerts, useSuspiciousDomains,
  usePhishingVictims, usePhishingTimeline, useSinkholes,
  useSinkholeDomain, useRemoveSinkhole, usePhishingBlockIP,
  useSimulatePhishing,
} from '../../hooks/usePhishing';
import { ConfirmModal } from '../common/ConfirmModal';
import { formatDateTime, formatDistanceToNow } from '../utils/time';

export function PhishingPanel() {
  const { data: stats } = usePhishingStats();
  const { data: alerts = [] } = usePhishingAlerts(50);
  const { data: domains = [] } = useSuspiciousDomains();
  const { data: victims = [] } = usePhishingVictims();
  const { data: timeline = [] } = usePhishingTimeline();
  const { data: sinkholes = [] } = useSinkholes();

  const sinkholeMutation = useSinkholeDomain();
  const removeSinkholeMutation = useRemoveSinkhole();
  const blockIPMutation = usePhishingBlockIP();
  const simulateMutation = useSimulatePhishing();

  const [confirm, setConfirm] = useState<{
    type: 'sinkhole' | 'removeSinkhole' | 'blockIP';
    data: Record<string, string | number>;
    payload: unknown;
  } | null>(null);

  const [simulateUrl, setSimulateUrl] = useState('http://evil-phishing-lab.example.com/login');

  const timelineData = timeline.slice(-30).map(p => ({
    time: p.minute.slice(11, 16),
    intentos: p.count,
  }));

  const handleConfirm = async () => {
    if (!confirm) return;
    try {
      if (confirm.type === 'sinkhole') {
        const { domain, reason } = confirm.payload as { domain: string; reason: string };
        await sinkholeMutation.mutateAsync({ domain, reason });
      } else if (confirm.type === 'removeSinkhole') {
        await removeSinkholeMutation.mutateAsync(confirm.payload as string);
      } else if (confirm.type === 'blockIP') {
        const { ip } = confirm.payload as { ip: string };
        await blockIPMutation.mutateAsync({ ip, duration_hours: 24 });
      }
    } finally {
      setConfirm(null);
    }
  };

  const isLoading = sinkholeMutation.isPending || removeSinkholeMutation.isPending || blockIPMutation.isPending;

  return (
    <div className="animate-fade-in-up" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-surface-100)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Fish size={20} style={{ color: 'var(--color-severity-high)' }} />
          Panel Anti-Phishing
        </h2>
      </div>

      {/* ── Stat Cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
        {[
          { icon: <AlertTriangle size={16} />, label: 'Alertas Hoy', value: stats?.total_alerts_today ?? 0, color: 'var(--color-danger)' },
          { icon: <Globe size={16} />, label: 'Dominios Sospechosos', value: stats?.unique_suspicious_domains ?? 0, color: 'var(--color-severity-high)' },
          { icon: <Users size={16} />, label: 'Agentes Afectados', value: stats?.affected_agents ?? 0, color: 'var(--color-warning)' },
          { icon: <Clock size={16} />, label: 'Hora Pico', value: stats?.peak_hour || '—', color: 'var(--color-brand-400)' },
        ].map((s, i) => (
          <div key={i} className="stat-card animate-fade-in-up" style={{ animationDelay: `${i * 0.05}s` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <span style={{ color: s.color }}>{s.icon}</span>
              <span style={{ fontSize: '0.72rem', color: 'var(--color-surface-400)', fontWeight: 500 }}>{s.label}</span>
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: 700, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* ── Main Grid ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: '1.25rem' }}>
        {/* Left column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Timeline */}
          <div className="glass-card" style={{ padding: '1.25rem' }}>
            <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-surface-200)', marginBottom: '1rem' }}>
              Intentos de Phishing (últimos 30 min)
            </h3>
            {timelineData.length > 0 ? (
              <ResponsiveContainer width="100%" height={160}>
                <AreaChart data={timelineData}>
                  <defs>
                    <linearGradient id="phishGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f97316" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="time" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                  <Tooltip contentStyle={{ background: 'var(--color-surface-800)', border: '1px solid rgba(148,163,184,0.1)', borderRadius: 8 }} />
                  <Area type="monotone" dataKey="intentos" stroke="#f97316" fill="url(#phishGrad)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <p className="empty-state">Sin actividad de phishing detectada</p>
            )}
          </div>

          {/* Victims Table */}
          <div className="glass-card" style={{ padding: '1.25rem' }}>
            <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-surface-200)', marginBottom: '1rem' }}>
              Víctimas Potenciales
            </h3>
            {victims.length > 0 ? (
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table">
                  <thead><tr><th>Agente</th><th>IP</th><th>URL</th><th>Veces</th><th>Última vez</th><th></th></tr></thead>
                  <tbody>
                    {victims.map((v, i) => (
                      <tr key={i}>
                        <td style={{ fontWeight: 500 }}>{v.agent_name}</td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>{v.ip}</td>
                        <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.75rem', color: 'var(--color-surface-400)' }}>{v.url}</td>
                        <td><span className={`badge badge-${v.times > 5 ? 'critical' : 'high'}`}>{v.times}</span></td>
                        <td style={{ fontSize: '0.72rem', color: 'var(--color-surface-500)' }}>{formatDistanceToNow(v.timestamp)}</td>
                        <td>
                          {v.ip && (
                            <button className="btn btn-danger" style={{ padding: '0.2rem 0.5rem', fontSize: '0.7rem' }}
                              onClick={() => setConfirm({ type: 'blockIP', data: { IP: v.ip, Duración: '24h' }, payload: { ip: v.ip } })}>
                              <ShieldOff size={11} />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="empty-state">Sin víctimas detectadas</p>
            )}
          </div>

          {/* Alerts Table */}
          {alerts.length > 0 && (
            <div className="glass-card" style={{ padding: '1.25rem' }}>
              <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-surface-200)', marginBottom: '1rem' }}>
                Alertas Recientes
              </h3>
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table">
                  <thead><tr><th>Nivel</th><th>Agente</th><th>URL detectada</th><th>Timestamp</th></tr></thead>
                  <tbody>
                    {alerts.slice(0, 10).map(a => (
                      <tr key={a.id}>
                        <td><span className={`badge badge-${a.rule_level >= 12 ? 'critical' : 'high'}`}>{a.rule_level}</span></td>
                        <td>{a.agent_name}</td>
                        <td style={{ fontSize: '0.75rem', color: 'var(--color-surface-400)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.dst_url || '—'}</td>
                        <td style={{ fontSize: '0.72rem', color: 'var(--color-surface-500)' }}>{formatDateTime(a.timestamp)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Suspicious Domains */}
          <div className="glass-card" style={{ padding: '1.25rem' }}>
            <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-surface-200)', marginBottom: '1rem' }}>
              Dominios Sospechosos
            </h3>
            {domains.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: 300, overflowY: 'auto' }}>
                {domains.map(d => (
                  <div key={d.domain} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.75rem', background: 'rgba(15,23,42,0.4)', borderRadius: 8, border: '1px solid rgba(148,163,184,0.06)' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', fontWeight: 500 }}>{d.domain}</span>
                        {d.in_sinkhole && <span className="badge badge-success" style={{ fontSize: '0.6rem' }}>sinkholed</span>}
                      </div>
                      <span style={{ fontSize: '0.7rem', color: 'var(--color-surface-500)' }}>{d.hit_count} hits · {d.agents_affected} agentes</span>
                    </div>
                    {!d.in_sinkhole && (
                      <button
                        className="btn btn-danger"
                        style={{ padding: '0.2rem 0.5rem', fontSize: '0.7rem', flexShrink: 0 }}
                        onClick={() => setConfirm({
                          type: 'sinkhole',
                          data: { Dominio: d.domain, Hits: d.hit_count },
                          payload: { domain: d.domain, reason: 'Phishing detected' },
                        })}
                      >
                        <Fish size={11} /> Sinkhole
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="empty-state">Sin dominios sospechosos</p>
            )}
          </div>

          {/* Active Sinkholes */}
          <div className="glass-card" style={{ padding: '1.25rem' }}>
            <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-surface-200)', marginBottom: '1rem' }}>
              DNS Sinkhole Activo
              <span className="badge badge-success" style={{ marginLeft: '0.5rem' }}>{sinkholes.length}</span>
            </h3>
            {sinkholes.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: 200, overflowY: 'auto' }}>
                {sinkholes.map(s => (
                  <div key={s.domain} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.4rem 0.75rem', background: 'rgba(15,23,42,0.4)', borderRadius: 8 }}>
                    <div>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>{s.domain}</span>
                      <span style={{ color: 'var(--color-surface-500)', fontSize: '0.68rem', display: 'block' }}>→ {s.address}</span>
                    </div>
                    <button
                      className="btn btn-ghost"
                      style={{ padding: '0.2rem 0.4rem' }}
                      onClick={() => setConfirm({ type: 'removeSinkhole', data: { Dominio: s.domain }, payload: s.domain })}
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="empty-state">Sin sinkholes activos</p>
            )}
          </div>

          {/* Lab Simulation */}
          <div className="glass-card" style={{ padding: '1.25rem', border: '1px solid rgba(245,158,11,0.2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <Play size={14} style={{ color: 'var(--color-warning)' }} />
              <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-surface-200)' }}>Simulación (Lab)</h3>
              <span className="badge badge-medium">APP_ENV=lab</span>
            </div>
            <p style={{ fontSize: '0.72rem', color: 'var(--color-surface-500)', marginBottom: '0.75rem' }}>
              Genera un evento sintético de phishing para probar el sistema sin reglas Wazuh reales.
            </p>
            <input
              className="input"
              placeholder="URL maliciosa de prueba"
              value={simulateUrl}
              onChange={e => setSimulateUrl(e.target.value)}
              style={{ marginBottom: '0.75rem', fontSize: '0.8rem' }}
            />
            <button
              id="simulate-phishing-btn"
              className="btn"
              style={{ background: 'linear-gradient(135deg,#b45309,#d97706)', color: '#fff', width: '100%' }}
              onClick={() => simulateMutation.mutate({ malicious_url: simulateUrl })}
              disabled={simulateMutation.isPending}
            >
              {simulateMutation.isPending ? <span className="loading-spinner" /> : <><Play size={13} /> Simular Phishing</>}
            </button>
            {simulateMutation.isSuccess && (
              <p style={{ marginTop: '0.5rem', fontSize: '0.72rem', color: 'var(--color-success)' }}>
                ✓ Evento simulado generado
              </p>
            )}
          </div>
        </div>
      </div>

      {confirm && (
        <ConfirmModal
          title={confirm.type === 'sinkhole' ? 'Agregar Sinkhole' : confirm.type === 'removeSinkhole' ? 'Eliminar Sinkhole' : 'Bloquear IP'}
          description={
            confirm.type === 'sinkhole' ? 'Este dominio será redirigido a 127.0.0.1 en el DNS de MikroTik.' :
            confirm.type === 'removeSinkhole' ? 'El tráfico DNS hacia este dominio se restaurará.' :
            'Esta IP de phishing será bloqueada en MikroTik por 24 horas.'
          }
          data={confirm.data}
          onConfirm={handleConfirm}
          onCancel={() => setConfirm(null)}
          variant={confirm.type === 'removeSinkhole' ? 'warning' : 'danger'}
          confirmLabel={confirm.type === 'removeSinkhole' ? 'Eliminar' : 'Confirmar'}
          isLoading={isLoading}
        />
      )}
    </div>
  );
}
