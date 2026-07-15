/**
 * SystemHealth — System monitoring page (route: /system).
 * Shows health cards for ALL integrations:
 *   Row 1 (4-col): MikroTik, Wazuh, CrowdSec, GLPI
 *   Full-width:    Interface traffic chart, GeoIP DB status
 * Tab: CLI Remota (MikroTik, Wazuh, CrowdSec)
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Cpu, HardDrive, Clock, Thermometer, Activity, Shield, Terminal,
  Crosshair, Package, Server, RefreshCw,
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { useMikrotikHealth, useInterfaceTraffic, useInterfaces } from '../../hooks/useMikrotikHealth';
import { useWazuhHealth, useAgentsSummary } from '../../hooks/useWazuhSummary';
import { useCrowdSecMetrics, useCrowdSecBouncers } from '../../hooks/useCrowdSecMetrics';
import { useGlpiAssetStats } from '../../hooks/useGlpiAssets';
import { glpiApi } from '../../services/api';
import { getApiErrorMessage, requireApiSuccess } from '../../services/apiResponse';
import { RemoteCLI } from './RemoteCLI';
import { GeoIPStatus } from './GeoIPStatus';

type ScenarioSummary = {
  name?: unknown;
  count?: unknown;
  alerts_count?: unknown;
};

export function SystemHealth() {
  const { data: mtHealth, isLoading: mtLoading, isFetching: mtFetching, isError: mtError, error: mtErrorObj, refetch: refetchMt } = useMikrotikHealth();
  const { data: traffic = [] } = useInterfaceTraffic();
  const { data: interfaces = [] } = useInterfaces();
  const { data: wazuhHealth, isLoading: wazuhLoading, isFetching: wazuhFetching, isError: wazuhError, error: wazuhErrorObj, refetch: refetchWazuh } = useWazuhHealth();
  const { data: agentsSummary } = useAgentsSummary();

  // CrowdSec
  const { data: csMetrics, isLoading: csLoading, isFetching: csFetching, isError: csError, error: csErrorObj, refetch: refetchCs } = useCrowdSecMetrics();
  const { data: csBouncers = [] } = useCrowdSecBouncers();

  // GLPI
  const { data: glpiStatus, isLoading: glpiLoading, isFetching: glpiFetching, isError: glpiError, error: glpiErrorObj, refetch: refetchGlpi } = useQuery({
    queryKey: ['glpi', 'status'],
    queryFn: async () => requireApiSuccess(await glpiApi.getStatus(), 'No se pudo verificar GLPI'),
    refetchInterval: 60_000,
  });
  const { data: glpiStats } = useGlpiAssetStats();

  const [tab, setTab] = useState<'overview' | 'cli'>('overview');

  const safeInterfaces = Array.isArray(interfaces) ? interfaces : [];
  const wazuhServices = Array.isArray(wazuhHealth?.services) ? wazuhHealth.services : [];
  const crowdsecBouncers = Array.isArray(csBouncers) ? csBouncers : [];
  const topScenario = csMetrics?.top_scenario as ScenarioSummary | undefined;
  const topScenarioName = typeof topScenario?.name === 'string' ? topScenario.name : '';
  const topScenarioCount =
    typeof topScenario?.count === 'number'
      ? topScenario.count
      : typeof topScenario?.alerts_count === 'number'
        ? topScenario.alerts_count
        : null;
  const topScenarioLabel = topScenarioName.split('/').pop()?.slice(0, 20) ?? '';
  const trafficChartData = (Array.isArray(traffic) ? traffic : []).slice(0, 10).map(t => ({
    name: t.interface.slice(0, 8),
    rx: Math.round((t.rx_bytes_per_sec ?? 0) / 1024),
    tx: Math.round((t.tx_bytes_per_sec ?? 0) / 1024),
  }));

  const integrationStatuses = [
    {
      name: 'MikroTik',
      icon: <Activity size={15} />,
      isLoading: mtLoading,
      isFetching: mtFetching,
      isError: mtError,
      isOnline: !!mtHealth,
      detail: mtHealth?.version ?? mtHealth?.board_name ?? 'RouterOS',
      errorMessage: mtError ? getApiErrorMessage(mtErrorObj, 'No se pudo conectar con MikroTik') : null,
      onRetry: refetchMt,
    },
    {
      name: 'Wazuh',
      icon: <Shield size={15} />,
      isLoading: wazuhLoading,
      isFetching: wazuhFetching,
      isError: wazuhError,
      isOnline: !!wazuhHealth,
      detail: wazuhHealth?.version ?? 'SIEM',
      errorMessage: wazuhError ? getApiErrorMessage(wazuhErrorObj, 'No se pudo conectar con Wazuh') : null,
      onRetry: refetchWazuh,
    },
    {
      name: 'CrowdSec',
      icon: <Crosshair size={15} />,
      isLoading: csLoading,
      isFetching: csFetching,
      isError: csError,
      isOnline: !!csMetrics,
      detail: csMetrics ? `${csMetrics.active_decisions} decisiones activas` : 'LAPI',
      errorMessage: csError ? getApiErrorMessage(csErrorObj, 'No se pudo conectar con CrowdSec') : null,
      onRetry: refetchCs,
    },
    {
      name: 'GLPI',
      icon: <Package size={15} />,
      isLoading: glpiLoading,
      isFetching: glpiFetching,
      isError: glpiError,
      isOnline: glpiStatus?.available === true,
      detail: glpiStatus
        ? glpiStatus.available
          ? glpiStatus.url ?? 'Inventario'
          : glpiStatus.message   // mensaje descriptivo del backend cuando está offline
        : 'Inventario',
      errorMessage: glpiError
        ? getApiErrorMessage(glpiErrorObj, 'No se pudo conectar con GLPI')
        : glpiStatus?.available === false
          ? glpiStatus.message
          : null,
      onRetry: refetchGlpi,
    },
  ];
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
          <div className="glass-card" style={{ padding: '1rem 1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', marginBottom: '0.85rem' }}>
              <h3 style={{ margin: 0, fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-surface-200)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Activity size={15} style={{ color: 'var(--color-brand-400)' }} />
                Estado de integraciones
              </h3>
              <span style={{ fontSize: '0.72rem', color: 'var(--color-surface-500)' }}>
                Herramientas externas
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
              {integrationStatuses.map(service => (
                <IntegrationStatusCard key={service.name} {...service} />
              ))}
            </div>
          </div>
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
                      {safeInterfaces.slice(0, 10).map(iface => (
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
                  {wazuhServices.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', maxHeight: 200, overflowY: 'auto' }}>
                      {wazuhServices.map(s => (
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
                  {topScenarioLabel && (
                    <div style={{ padding: '0.5rem 0.75rem', background: 'rgba(15,23,42,0.3)', borderRadius: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.72rem', color: 'var(--color-surface-400)' }}>Top escenario</span>
                      <span style={{ fontSize: '0.72rem', fontFamily: 'var(--font-mono)', color: 'var(--color-surface-200)' }}>
                        {topScenarioLabel}
                        {topScenarioCount !== null && (
                          <span style={{ color: 'var(--color-warning)', marginLeft: '0.5rem' }}>({topScenarioCount})</span>
                        )}
                      </span>
                    </div>
                  )}

                  {/* Bouncers */}
                  <p style={{ fontSize: '0.72rem', color: 'var(--color-surface-500)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Bouncers</p>
                  {crowdsecBouncers.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                      {crowdsecBouncers.map(b => (
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

          {/* ── Row 2: GLPI Inventory (full width) ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1.25rem' }}>
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

          {/* Traffic Chart (full width) */}
          <div className="glass-card" style={{ padding: '1.25rem' }}>
            <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-surface-200)', marginBottom: '1rem' }}>
              Trafico por Interfaz (KB/s)
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
              <div className="empty-state">Sin datos de trafico</div>
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

function integrationStatusClass(isChecking: boolean, hasProblem: boolean) {
  if (isChecking) return 'status-dot pending';
  if (hasProblem) return 'status-dot disconnected';
  return 'status-dot active';
}

function integrationStatusText({
  isChecking,
  hasProblem,
  detail,
  errorMessage,
}: {
  isChecking: boolean;
  hasProblem: boolean;
  detail?: string | number | null;
  errorMessage?: string | null;
}) {
  if (isChecking) return 'Verificando conexión…';
  if (hasProblem) return errorMessage || 'Sin conexión al servidor';
  return detail ? String(detail) : 'Conectado';
}

function IntegrationStatusCard({
  name,
  icon,
  isLoading,
  isFetching,
  isError,
  isOnline,
  detail,
  errorMessage,
  onRetry,
}: {
  name: string;
  icon: React.ReactNode;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  isOnline: boolean;
  detail?: string | number | null;
  errorMessage?: string | null;
  onRetry: () => Promise<unknown> | void;
}) {
  // Solo mostrar "Verificando" en la carga inicial, no en refetches periódicos de background
  const isChecking = isLoading;
  const isRetrying = isLoading || isFetching;
  const hasProblem = isError || !isOnline;
  const label = integrationStatusText({ isChecking, hasProblem, detail, errorMessage });
  const statusColor = isChecking
    ? 'rgba(245,158,11,0.18)'
    : hasProblem
      ? 'rgba(239,68,68,0.18)'
      : 'rgba(34,197,94,0.16)';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.7rem',
        padding: '0.75rem',
        background: 'rgba(15,23,42,0.32)',
        border: `1px solid ${statusColor}`,
        borderRadius: 8,
        minWidth: 0,
      }}
    >
      <div style={{ color: 'var(--color-brand-400)', flexShrink: 0 }}>{icon}</div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', minWidth: 0 }}>
          <span className={integrationStatusClass(isChecking, hasProblem)} />
          <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--color-surface-100)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
        </div>
        <div
          title={label}
          style={{
            marginTop: 3,
            fontSize: '0.68rem',
            color: hasProblem && !isChecking ? 'var(--color-danger)' : 'var(--color-surface-500)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {label}
        </div>
      </div>
      <button
        type="button"
        className="btn btn-ghost"
        onClick={() => { void onRetry(); }}
        disabled={isRetrying}
        title={`Reintentar conexion con ${name}`}
        aria-label={`Reintentar conexion con ${name}`}
        style={{ width: 30, height: 30, padding: 0, justifyContent: 'center', flexShrink: 0 }}
      >
        <RefreshCw size={13} className={isRetrying ? 'spin' : undefined} />
      </button>
    </div>
  );
}
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
