/**
 * SystemHealth — System monitoring page (route: /system).
 * Shows health cards for ALL 5 integrations:
 *   Row 1 (3-col): MikroTik, Wazuh, CrowdSec
 *   Row 2 (2-col): Suricata, GLPI
 *   Full-width:    Interface traffic chart, GeoIP DB status
 * Tab: CLI Remota (MikroTik, Wazuh, Suricata, CrowdSec)
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Cpu, HardDrive, Clock, Thermometer, Activity, Shield, Terminal,
  Crosshair, Bug, Package, Server,
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { useMikrotikHealth, useInterfaceTraffic, useInterfaces } from '../../hooks/useMikrotikHealth';
import { useWazuhHealth, useAgentsSummary } from '../../hooks/useWazuhSummary';
import { useCrowdSecMetrics, useCrowdSecBouncers } from '../../hooks/useCrowdSecMetrics';
import { useSuricataEngine } from '../../hooks/useSuricataEngine';
import { useGlpiAssetStats } from '../../hooks/useGlpiAssets';
import { glpiApi, suricataApi } from '../../services/api';
import { RemoteCLI } from './RemoteCLI';
import { GeoIPStatus } from './GeoIPStatus';

export function SystemHealth() {
  const { data: mtHealth } = useMikrotikHealth();
  const { data: traffic = [] } = useInterfaceTraffic();
  const { data: interfaces = [] } = useInterfaces();
  const { data: wazuhHealth } = useWazuhHealth();
  const { data: agentsSummary } = useAgentsSummary();

  // CrowdSec
  const { data: csMetrics } = useCrowdSecMetrics();
  const { data: csBouncers = [] } = useCrowdSecBouncers();

  // Suricata
  const { engineStatus: surEngine } = useSuricataEngine();
  const { data: surMode } = useQuery({
    queryKey: ['suricata', 'engine-mode'],
    queryFn: () => suricataApi.getEngineMode(),
    refetchInterval: 60_000,
    select: r => r.data,
  });

  // GLPI
  const { data: glpiStatus } = useQuery({
    queryKey: ['glpi', 'status'],
    queryFn: () => glpiApi.getStatus(),
    refetchInterval: 60_000,
    select: r => r.data,
  });
  const { data: glpiStats } = useGlpiAssetStats();

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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* ── Row 1: MikroTik, Wazuh, CrowdSec (3 cols) ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.25rem' }}>
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

            {/* CrowdSec Health */}
            <div className="glass-card" style={{ padding: '1.5rem' }}>
              <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-surface-200)', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Crosshair size={15} style={{ color: 'var(--color-brand-400)' }} />
                CrowdSec
                {csMetrics && <span className="badge badge-info">LAPI</span>}
              </h3>

              {csMetrics ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {/* Key Metrics */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    {[
                      { label: 'Decisiones', value: csMetrics.active_decisions, color: 'var(--color-danger)' },
                      { label: 'Alertas 24h', value: csMetrics.alerts_24h, color: 'var(--color-warning)' },
                      { label: 'Escenarios', value: csMetrics.scenarios_active, color: 'var(--color-brand-400)' },
                    ].map(s => (
                      <div key={s.label} style={{ textAlign: 'center', padding: '0.5rem', background: 'rgba(15,23,42,0.4)', borderRadius: 8 }}>
                        <div style={{ fontSize: '1.25rem', fontWeight: 700, color: s.color }}>{s.value}</div>
                        <div style={{ fontSize: '0.65rem', color: 'var(--color-surface-500)' }}>{s.label}</div>
                      </div>
                    ))}
                  </div>

                  {/* Top Scenario */}
                  {csMetrics.top_scenario && (
                    <div style={{ padding: '0.5rem 0.75rem', background: 'rgba(15,23,42,0.3)', borderRadius: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.72rem', color: 'var(--color-surface-400)' }}>Top escenario</span>
                      <span style={{ fontSize: '0.72rem', fontFamily: 'var(--font-mono)', color: 'var(--color-surface-200)' }}>
                        {csMetrics.top_scenario.name.split('/').pop()?.slice(0, 20)}
                        <span style={{ color: 'var(--color-warning)', marginLeft: '0.5rem' }}>({csMetrics.top_scenario.count})</span>
                      </span>
                    </div>
                  )}

                  {/* Bouncers */}
                  <p style={{ fontSize: '0.72rem', color: 'var(--color-surface-500)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Bouncers</p>
                  {csBouncers.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                      {csBouncers.map(b => (
                        <div key={b.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.35rem 0.5rem', background: 'rgba(15,23,42,0.3)', borderRadius: 6 }}>
                          <span style={{ fontSize: '0.78rem', fontFamily: 'var(--font-mono)' }}>{b.name}</span>
                          <span style={{ fontSize: '0.7rem', color: b.status === 'connected' ? 'var(--color-success)' : 'var(--color-danger)' }}>
                            ● {b.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p style={{ fontSize: '0.75rem', color: 'var(--color-surface-500)' }}>Sin bouncers</p>
                  )}
                </div>
              ) : (
                <div className="empty-state">Sin datos de CrowdSec</div>
              )}
            </div>
          </div>

          {/* ── Row 2: Suricata, GLPI (2 cols) ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
            {/* Suricata Health */}
            <div className="glass-card" style={{ padding: '1.5rem' }}>
              <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-surface-200)', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Bug size={15} style={{ color: 'var(--color-brand-400)' }} />
                Suricata IDS/IPS
                {surEngine?.version && <span className="badge badge-info">{surEngine.version}</span>}
                {surEngine?.running != null && (
                  <span className={`badge ${surEngine.running ? 'badge-success' : 'badge-critical'}`} style={{ fontSize: '0.58rem' }}>
                    {surEngine.running ? 'RUNNING' : 'STOPPED'}
                  </span>
                )}
              </h3>

              {surEngine ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {/* Key stats */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem' }}>
                    {[
                      { label: 'Modo', value: (surMode?.mode || surEngine.mode || '—').toUpperCase(), color: 'var(--color-brand-400)' },
                      { label: 'Alertas', value: surEngine.alerts_total, color: 'var(--color-warning)' },
                      { label: 'Reglas', value: surEngine.rules_loaded, color: 'var(--color-success)' },
                      { label: 'Drops', value: surEngine.packets_dropped, color: surEngine.packets_dropped > 0 ? 'var(--color-danger)' : 'var(--color-surface-400)' },
                    ].map(s => (
                      <div key={s.label} style={{ textAlign: 'center', padding: '0.5rem', background: 'rgba(15,23,42,0.4)', borderRadius: 8 }}>
                        <div style={{ fontSize: '1rem', fontWeight: 700, color: s.color }}>{s.value}</div>
                        <div style={{ fontSize: '0.6rem', color: 'var(--color-surface-500)' }}>{s.label}</div>
                      </div>
                    ))}
                  </div>

                  {/* Info rows */}
                  <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                    <InfoRow icon={<Server size={12} />} label="Interfaz" value={surMode?.interface || surEngine.interface || '—'} />
                    <InfoRow icon={<Clock size={12} />} label="Uptime" value={surEngine.uptime_label || '—'} />
                    <InfoRow icon={<Activity size={12} />} label="Flujos" value={String(surEngine.flows_active)} />
                  </div>

                  {/* Rules detail */}
                  {surEngine.rules_failed > 0 && (
                    <div style={{ padding: '0.4rem 0.65rem', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 6, fontSize: '0.72rem', color: '#fca5a5' }}>
                      ⚠ {surEngine.rules_failed} reglas fallidas al cargar
                    </div>
                  )}
                </div>
              ) : (
                <div className="empty-state">Sin datos de Suricata</div>
              )}
            </div>

            {/* GLPI Health */}
            <div className="glass-card" style={{ padding: '1.5rem' }}>
              <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-surface-200)', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Package size={15} style={{ color: 'var(--color-brand-400)' }} />
                GLPI Inventario
                {glpiStatus && (
                  <span className={`badge ${glpiStatus.available ? 'badge-success' : 'badge-critical'}`} style={{ fontSize: '0.58rem' }}>
                    {glpiStatus.available ? 'ONLINE' : 'OFFLINE'}
                  </span>
                )}
              </h3>

              {glpiStatus ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {/* Connection info */}
                  <div style={{ padding: '0.5rem 0.75rem', background: 'rgba(15,23,42,0.3)', borderRadius: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--color-surface-400)' }}>Estado</span>
                    <span style={{ fontSize: '0.72rem', color: glpiStatus.available ? 'var(--color-success)' : 'var(--color-danger)' }}>
                      ● {glpiStatus.message}
                    </span>
                  </div>

                  {/* Asset Stats */}
                  {glpiStats ? (
                    <>
                      <p style={{ fontSize: '0.72rem', color: 'var(--color-surface-500)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Inventario de Activos</p>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem' }}>
                        {[
                          { label: 'Total', value: glpiStats.total ?? 0, color: 'var(--color-brand-400)' },
                          { label: 'Activos', value: glpiStats.activo ?? 0, color: 'var(--color-success)' },
                          { label: 'Reparación', value: glpiStats.reparacion ?? 0, color: 'var(--color-warning)' },
                          { label: 'Retirados', value: glpiStats.retirado ?? 0, color: 'var(--color-surface-400)' },
                        ].map(s => (
                          <div key={s.label} style={{ textAlign: 'center', padding: '0.5rem', background: 'rgba(15,23,42,0.4)', borderRadius: 8 }}>
                            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: s.color }}>{s.value}</div>
                            <div style={{ fontSize: '0.65rem', color: 'var(--color-surface-500)' }}>{s.label}</div>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <p style={{ fontSize: '0.75rem', color: 'var(--color-surface-500)' }}>Cargando estadísticas…</p>
                  )}

                  {/* URL */}
                  {glpiStatus.url && (
                    <div style={{ padding: '0.35rem 0.65rem', background: 'rgba(15,23,42,0.3)', borderRadius: 6 }}>
                      <span style={{ fontSize: '0.68rem', fontFamily: 'var(--font-mono)', color: 'var(--color-surface-500)' }}>
                        {glpiStatus.url}
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="empty-state">Sin datos de GLPI</div>
              )}
            </div>
          </div>

          {/* ── Traffic Chart (full width) ── */}
          <div className="glass-card" style={{ padding: '1.25rem' }}>
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

          {/* GeoIP DB Status */}
          <GeoIPStatus />
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
