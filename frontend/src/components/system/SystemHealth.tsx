/**
 * SystemHealth — System monitoring page (route: /system).
 * Shows: MikroTik health metrics, Wazuh services status, interface traffic, Remote CLI.
 */
import { useState } from 'react';
import { Cpu, HardDrive, Clock, Thermometer, Activity, Shield, Terminal } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { useMikrotikHealth, useInterfaceTraffic, useInterfaces } from '../../hooks/useMikrotikHealth';
import { useWazuhHealth, useAgentsSummary } from '../../hooks/useWazuhSummary';
import { RemoteCLI } from './RemoteCLI';

export function SystemHealth() {
  const { data: mtHealth } = useMikrotikHealth();
  const { data: traffic = [] } = useInterfaceTraffic();
  const { data: interfaces = [] } = useInterfaces();
  const { data: wazuhHealth } = useWazuhHealth();
  const { data: agentsSummary } = useAgentsSummary();
  const [tab, setTab] = useState<'overview' | 'cli'>('overview');

  const trafficChartData = traffic.slice(0, 10).map(t => ({
    name: t.interface.slice(0, 8),
    rx: Math.round(t.rx_bytes_per_sec / 1024),
    tx: Math.round(t.tx_bytes_per_sec / 1024),
  }));

  return (
    <div className="animate-fade-in-up" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-surface-100)' }}>
          Sistema
        </h2>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {(['overview', 'cli'] as const).map(t => (
            <button
              key={t}
              className={`btn ${tab === t ? 'btn-primary' : 'btn-ghost'}`}
              style={{ fontSize: '0.8rem' }}
              onClick={() => setTab(t)}
            >
              {t === 'overview' ? <><Activity size={13} /> Vista General</> : <><Terminal size={13} /> CLI Remota</>}
            </button>
          ))}
        </div>
      </div>

      {tab === 'overview' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
          {/* MikroTik Health */}
          <div className="glass-card" style={{ padding: '1.5rem' }}>
            <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-surface-200)', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Activity size={15} style={{ color: 'var(--color-brand-400)' }} />
              MikroTik Router
              {mtHealth?.board_name && <span className="badge badge-info">{mtHealth.board_name}</span>}
            </h3>

            {mtHealth ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <MetricRow
                  icon={<Cpu size={14} />}
                  label="CPU"
                  value={`${mtHealth.cpu_percent}%`}
                  bar={mtHealth.cpu_percent}
                  barColor={mtHealth.cpu_percent > 80 ? 'var(--color-danger)' : 'var(--color-brand-500)'}
                />
                <MetricRow
                  icon={<HardDrive size={14} />}
                  label="RAM"
                  value={`${mtHealth.ram_used_mb} / ${mtHealth.ram_total_mb} MB`}
                  bar={mtHealth.ram_percent}
                  barColor={mtHealth.ram_percent > 85 ? 'var(--color-danger)' : 'var(--color-success)'}
                />
                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                  <InfoRow icon={<Clock size={12} />} label="Uptime" value={mtHealth.uptime} />
                  {mtHealth.temperature !== 'N/A' && (
                    <InfoRow icon={<Thermometer size={12} />} label="Temp" value={mtHealth.temperature} />
                  )}
                  <InfoRow icon={<Activity size={12} />} label="RouterOS" value={mtHealth.version} />
                </div>

                {/* Interface Status */}
                <div>
                  <p style={{ fontSize: '0.72rem', color: 'var(--color-surface-500)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
                    Interfaces
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                    {interfaces.slice(0, 10).map(iface => (
                      <span
                        key={iface.name}
                        style={{
                          fontSize: '0.7rem',
                          padding: '0.2rem 0.5rem',
                          borderRadius: 6,
                          background: iface.running ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                          border: `1px solid ${iface.running ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`,
                          color: iface.running ? 'var(--color-success)' : 'var(--color-danger)',
                        }}
                      >
                        {iface.name}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="empty-state">Sin datos de MikroTik</div>
            )}
          </div>

          {/* Wazuh Health */}
          <div className="glass-card" style={{ padding: '1.5rem' }}>
            <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-surface-200)', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Shield size={15} style={{ color: 'var(--color-brand-400)' }} />
              Wazuh SIEM
              {wazuhHealth?.version && <span className="badge badge-info">{wazuhHealth.version}</span>}
            </h3>

            {wazuhHealth ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {/* Agents Summary */}
                {agentsSummary && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', marginBottom: '0.75rem' }}>
                    {[
                      { label: 'Activos', value: agentsSummary.active, color: 'var(--color-success)' },
                      { label: 'Desconectados', value: agentsSummary.disconnected, color: 'var(--color-danger)' },
                      { label: 'Nunca conectados', value: agentsSummary.never_connected, color: 'var(--color-surface-500)' },
                    ].map(s => (
                      <div key={s.label} style={{ textAlign: 'center', padding: '0.5rem', background: 'rgba(15,23,42,0.4)', borderRadius: 8 }}>
                        <div style={{ fontSize: '1.25rem', fontWeight: 700, color: s.color }}>{s.value}</div>
                        <div style={{ fontSize: '0.65rem', color: 'var(--color-surface-500)' }}>{s.label}</div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Services */}
                <p style={{ fontSize: '0.72rem', color: 'var(--color-surface-500)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Servicios</p>
                {wazuhHealth.services.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', maxHeight: 200, overflowY: 'auto' }}>
                    {wazuhHealth.services.map(s => (
                      <div key={s.service_name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.35rem 0.5rem', background: 'rgba(15,23,42,0.3)', borderRadius: 6 }}>
                        <span style={{ fontSize: '0.78rem', fontFamily: 'var(--font-mono)' }}>{s.service_name}</span>
                        <span style={{ fontSize: '0.7rem', color: s.status === 'running' ? 'var(--color-success)' : 'var(--color-danger)' }}>
                          ● {s.status}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ fontSize: '0.75rem', color: 'var(--color-surface-500)' }}>Sin datos de servicios</p>
                )}
              </div>
            ) : (
              <div className="empty-state">Sin datos de Wazuh</div>
            )}
          </div>

          {/* Traffic Chart */}
          <div className="glass-card" style={{ padding: '1.25rem', gridColumn: '1 / -1' }}>
            <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-surface-200)', marginBottom: '1rem' }}>
              Tráfico por Interfaz (KB/s)
            </h3>
            {trafficChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={trafficChartData} barCategoryGap="30%">
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip
                    contentStyle={{ background: 'var(--color-surface-800)', border: '1px solid rgba(148,163,184,0.1)', borderRadius: 8 }}
                    formatter={(v: unknown) => [`${Number(v)} KB/s`]}
                  />
                  <Bar dataKey="rx" fill="#6366f1" name="RX" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="tx" fill="#22c55e" name="TX" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="empty-state">Sin datos de tráfico</div>
            )}
          </div>
        </div>
      )}

      {tab === 'cli' && <RemoteCLI />}
    </div>
  );
}

// ── Internal helpers ────────────────────────────────────────────

function MetricRow({ icon, label, value, bar, barColor }: {
  icon: React.ReactNode; label: string; value: string; bar: number; barColor: string;
}) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.78rem', color: 'var(--color-surface-400)' }}>
          {icon} {label}
        </span>
        <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--color-surface-200)' }}>{value}</span>
      </div>
      <div style={{ height: 6, background: 'rgba(148,163,184,0.1)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${Math.min(bar, 100)}%`, background: barColor, borderRadius: 3, transition: 'width 0.3s' }} />
      </div>
    </div>
  );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', color: 'var(--color-surface-400)' }}>
      {icon} <span style={{ color: 'var(--color-surface-600)' }}>{label}:</span> {value}
    </span>
  );
}
