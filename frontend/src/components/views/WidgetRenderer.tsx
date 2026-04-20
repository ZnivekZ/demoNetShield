/**
 * WidgetRenderer — Mapea cada widget.type → llamada API + tabla/vista.
 *
 * Cada widget del catálogo tiene un `type` (ej: "wazuh_alerts").
 * Este componente:
 *   1. Llama a la API correspondiente con useQuery
 *   2. Renderiza los datos como tabla compacta, stat card o lista
 *   3. Para widgets nuevos (visual/technical/hybrid), renderiza el componente dedicado
 *   4. Maneja loading/error por widget individual
 */
import React, { lazy, Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Loader,
  AlertTriangle,
  RefreshCw,
  Shield,
  Activity,
  Globe,
  Monitor,
  Bug,
  Server,
  FileText,
  Fish,
  Clock,
} from 'lucide-react';
import {
  wazuhApi,
  mikrotikApi,
  crowdsecApi,
  suricataApi,
  glpiApi,
  phishingApi,
  geoipApi,
  actionsApi,
} from '../../services/api';
import type { WidgetConfig } from '../../types';

// ── Lazy imports de widgets nuevos (visual) ──────────────────────────────
const ThreatGauge = lazy(() => import('../widgets/visual/ThreatGauge').then(m => ({ default: m.ThreatGauge })));
const NetworkPulse = lazy(() => import('../widgets/visual/NetworkPulse').then(m => ({ default: m.NetworkPulse })));
const EventCounter = lazy(() => import('../widgets/visual/EventCounter').then(m => ({ default: m.EventCounter })));
const ActivityHeatmap = lazy(() => import('../widgets/visual/ActivityHeatmap').then(m => ({ default: m.ActivityHeatmap })));
const ProtocolDonut = lazy(() => import('../widgets/visual/ProtocolDonut').then(m => ({ default: m.ProtocolDonut })));
const AgentsThermometer = lazy(() => import('../widgets/visual/AgentsThermometer').then(m => ({ default: m.AgentsThermometer })));
const BlocksTimeline = lazy(() => import('../widgets/visual/BlocksTimeline').then(m => ({ default: m.BlocksTimeline })));

// ── Lazy imports de widgets nuevos (technical) ───────────────────────────
const ActionLogWidget = lazy(() => import('../widgets/technical/ActionLogWidget').then(m => ({ default: m.ActionLogWidget })));
const PacketInspector = lazy(() => import('../widgets/technical/PacketInspector').then(m => ({ default: m.PacketInspector })));
const FlowTableWidget = lazy(() => import('../widgets/technical/FlowTableWidget').then(m => ({ default: m.FlowTableWidget })));
const FirewallTree = lazy(() => import('../widgets/technical/FirewallTree').then(m => ({ default: m.FirewallTree })));
const LiveLogs = lazy(() => import('../widgets/technical/LiveLogs').then(m => ({ default: m.LiveLogs })));
const CrowdSecRaw = lazy(() => import('../widgets/technical/CrowdSecRaw').then(m => ({ default: m.CrowdSecRaw })));
const CorrelationTimeline = lazy(() => import('../widgets/technical/CorrelationTimeline').then(m => ({ default: m.CorrelationTimeline })));
const CriticalAssets = lazy(() => import('../widgets/technical/CriticalAssets').then(m => ({ default: m.CriticalAssets })));

// ── Lazy imports de widgets nuevos (hybrid) ────────────────────────────
const IpProfiler = lazy(() => import('../widgets/hybrid/IpProfiler').then(m => ({ default: m.IpProfiler })));
const ConfirmedThreats = lazy(() => import('../widgets/hybrid/ConfirmedThreats').then(m => ({ default: m.ConfirmedThreats })));
const CountryRadar = lazy(() => import('../widgets/hybrid/CountryRadar').then(m => ({ default: m.CountryRadar })));
const IncidentLifecycle = lazy(() => import('../widgets/hybrid/IncidentLifecycle').then(m => ({ default: m.IncidentLifecycle })));
const DefenseLayers = lazy(() => import('../widgets/hybrid/DefenseLayers').then(m => ({ default: m.DefenseLayers })));
const GeoblockPredictor = lazy(() => import('../widgets/hybrid/GeoblockPredictor').then(m => ({ default: m.GeoblockPredictor })));
const SuricataGlpiCorrelation = lazy(() => import('../widgets/hybrid/SuricataGlpiCorrelation').then(m => ({ default: m.SuricataGlpiCorrelation })));
const WorldThreatMap = lazy(() => import('../widgets/hybrid/WorldThreatMap').then(m => ({ default: m.WorldThreatMap })));
const ViewReportGenerator = lazy(() => import('../widgets/hybrid/ViewReportGenerator').then(m => ({ default: m.ViewReportGenerator })));
const TelegramActivity = lazy(() => import('../widgets/hybrid/TelegramActivity').then(m => ({ default: m.TelegramActivity })));
const MitreMatrix = lazy(() => import('../widgets/hybrid/MitreMatrix').then(m => ({ default: m.MitreMatrix })));
const VlanHealth = lazy(() => import('../widgets/hybrid/VlanHealth').then(m => ({ default: m.VlanHealth })));
const QuarantineTracker = lazy(() => import('../widgets/hybrid/QuarantineTracker').then(m => ({ default: m.QuarantineTracker })));
const SinkholeEffectiveness = lazy(() => import('../widgets/hybrid/SinkholeEffectiveness').then(m => ({ default: m.SinkholeEffectiveness })));

// ── Lazy imports nuevos (visual) ──────────────────────────────────────
const PortalUsage = lazy(() => import('../widgets/visual/PortalUsage').then(m => ({ default: m.PortalUsage })));
const PhishingStats = lazy(() => import('../widgets/visual/PhishingStats').then(m => ({ default: m.PhishingStats })));
const AgentAlertHeatmap = lazy(() => import('../widgets/visual/AgentAlertHeatmap').then(m => ({ default: m.AgentAlertHeatmap })));

// ── Lazy imports nuevos (technical) ──────────────────────────────────
const DnsMonitor = lazy(() => import('../widgets/technical/DnsMonitor').then(m => ({ default: m.DnsMonitor })));
const TlsFingerprint = lazy(() => import('../widgets/technical/TlsFingerprint').then(m => ({ default: m.TlsFingerprint })));
const BandwidthTop = lazy(() => import('../widgets/technical/BandwidthTop').then(m => ({ default: m.BandwidthTop })));
const HttpInspector = lazy(() => import('../widgets/technical/HttpInspector').then(m => ({ default: m.HttpInspector })));

/** Props del WidgetRenderer */
interface WidgetRendererProps {
  widget: WidgetConfig;
}

/** Iconos por tipo de widget */
const WIDGET_ICONS: Record<string, typeof Shield> = {
  wazuh_alerts: Shield,
  wazuh_agents: Monitor,
  wazuh_summary: Activity,
  traffic_chart: Activity,
  firewall_rules: Shield,
  blocked_ips: Shield,
  mikrotik_health: Server,
  crowdsec_decisions: Globe,
  crowdsec_metrics: Activity,
  suricata_alerts: Bug,
  suricata_flows: Activity,
  glpi_assets: Monitor,
  glpi_tickets: FileText,
  phishing_detections: Fish,
  action_log: Clock,
  top_countries: Globe,
};

/** Fetcher functions por tipo de widget */
function useWidgetData(type: string, config: Record<string, unknown> = {}) {
  const limit = (config.limit as number) ?? 10;

  return useQuery({
    queryKey: ['widget', type, config],
    queryFn: async () => {
      switch (type) {
        case 'wazuh_alerts': {
          const minLevel = (config.min_level as number) || undefined;
          const r = await wazuhApi.getAlerts(limit, minLevel);
          return { kind: 'table' as const, data: r.data ?? [], columns: ['level', 'agent_name', 'description', 'timestamp'] };
        }
        case 'wazuh_agents': {
          const r = await wazuhApi.getAgents();
          return { kind: 'table' as const, data: r.data ?? [], columns: ['id', 'name', 'ip', 'status'] };
        }
        case 'wazuh_summary': {
          const r = await wazuhApi.getAgentsSummary();
          const d = r.data;
          return {
            kind: 'stats' as const,
            stats: [
              { label: 'Activos', value: d?.active ?? 0, color: 'var(--color-success)' },
              { label: 'Desconectados', value: d?.disconnected ?? 0, color: 'var(--color-danger)' },
              { label: 'Total', value: d?.total ?? 0, color: 'var(--text-secondary)' },
            ],
          };
        }
        case 'firewall_rules': {
          const r = await mikrotikApi.getFirewallRules();
          const rules = (r.data ?? []).slice(0, limit);
          return { kind: 'table' as const, data: rules, columns: ['action', 'chain', 'src-address', 'comment'] };
        }
        case 'blocked_ips': {
          const r = await mikrotikApi.getAddressList('Blacklist_Automatica');
          const ips = (r.data ?? []).slice(0, limit);
          return { kind: 'table' as const, data: ips, columns: ['address', 'list', 'timeout', 'comment'] };
        }
        case 'mikrotik_health': {
          const r = await mikrotikApi.getHealth();
          const d = r.data;
          return {
            kind: 'stats' as const,
            stats: [
              { label: 'CPU', value: `${d?.cpu_percent ?? 0}%`, color: 'var(--color-warning)' },
              { label: 'RAM', value: `${d?.ram_percent ?? 0}%`, color: 'var(--accent-primary)' },
              { label: 'Uptime', value: d?.uptime ?? '-', color: 'var(--color-success)' },
              { label: 'Versión', value: d?.version ?? '-', color: 'var(--text-secondary)' },
            ],
          };
        }
        case 'crowdsec_decisions': {
          const r = await crowdsecApi.getDecisions();
          const decs = (r.data ?? []).slice(0, limit);
          return { kind: 'table' as const, data: decs, columns: ['value', 'scenario', 'type', 'duration'] };
        }
        case 'crowdsec_metrics': {
          const r = await crowdsecApi.getMetrics();
          const d = r.data;
          return {
            kind: 'stats' as const,
            stats: [
              { label: 'Decisiones', value: d?.active_decisions ?? 0, color: 'var(--color-danger)' },
              { label: 'Alertas 24h', value: d?.alerts_24h ?? 0, color: 'var(--color-warning)' },
              { label: 'Escenarios', value: d?.scenarios_active ?? 0, color: 'var(--accent-primary)' },
              { label: 'Bouncers', value: d?.bouncers_connected ?? 0, color: 'var(--color-success)' },
            ],
          };
        }
        case 'suricata_alerts': {
          const r = await suricataApi.getAlerts({ limit });
          const d = r.data;
          const alerts = Array.isArray(d) ? d : (d?.alerts ?? []);
          return { kind: 'table' as const, data: alerts.slice(0, limit), columns: ['severity', 'signature', 'src_ip', 'timestamp'] };
        }
        case 'suricata_flows': {
          const r = await suricataApi.getFlows({ limit });
          const fd = r.data;
          const flows = Array.isArray(fd) ? fd : (fd?.flows ?? []);
          return { kind: 'table' as const, data: flows.slice(0, limit), columns: ['proto', 'src_ip', 'dest_ip', 'bytes_toserver'] };
        }
        case 'glpi_assets': {
          const r = await glpiApi.getAssets({ limit });
          const ad = r.data;
          const assets = Array.isArray(ad) ? ad : (ad?.assets ?? []);
          return { kind: 'table' as const, data: assets.slice(0, limit), columns: ['name', 'serial', 'otherserial', 'states_id'] };
        }
        case 'glpi_tickets': {
          const r = await glpiApi.getTickets({ limit });
          const td = r.data;
          const tickets = Array.isArray(td) ? td : (td?.tickets ?? []);
          return { kind: 'table' as const, data: tickets.slice(0, limit), columns: ['id', 'name', 'priority', 'status'] };
        }
        case 'phishing_detections': {
          const r = await phishingApi.getAlerts(limit);
          const alerts = (r.data ?? []).slice(0, limit);
          return { kind: 'table' as const, data: alerts, columns: ['domain', 'detected_by', 'risk_level', 'timestamp'] };
        }
        case 'action_log': {
          const r = await actionsApi.getHistory(limit);
          const entries = (r.data ?? []).slice(0, limit);
          return { kind: 'table' as const, data: entries, columns: ['action_type', 'target_ip', 'comment', 'created_at'] };
        }
        case 'top_countries': {
          const r = await geoipApi.getTopCountries({ limit });
          const countries = r.data?.countries ?? [];
          return { kind: 'table' as const, data: countries.slice(0, limit), columns: ['country_code', 'country_name', 'count', 'percentage'] };
        }

        // ── Widgets Visuales ───────────────────────────────────────────
        case 'visual_threat_gauge':
        case 'visual_network_pulse':
        case 'visual_event_counter':
        case 'visual_activity_heatmap':
        case 'visual_protocol_donut':
        case 'visual_agents_thermometer':
        case 'visual_blocks_timeline':
        case 'visual_portal_usage':
        case 'visual_phishing_stats':
        case 'visual_agent_alert_heatmap':
        // ── Widgets Técnicos ───────────────────────────────────────────
        case 'technical_action_log':
        case 'technical_packet_inspector':
        case 'technical_flow_table':
        case 'technical_firewall_tree':
        case 'technical_live_logs':
        case 'technical_crowdsec_raw':
        case 'technical_correlation_timeline':
        case 'technical_critical_assets':
        case 'technical_dns_monitor':
        case 'technical_tls_fingerprint':
        case 'technical_bandwidth_top':
        case 'technical_http_inspector':
        // ── Widgets Híbridos ───────────────────────────────────────────
        case 'hybrid_ip_profiler':
        case 'hybrid_confirmed_threats':
        case 'hybrid_country_radar':
        case 'hybrid_incident_lifecycle':
        case 'hybrid_defense_layers':
        case 'hybrid_geoblock_predictor':
        case 'hybrid_suricata_glpi':
        case 'hybrid_world_threat_map':
        case 'hybrid_view_report_generator':
        case 'hybrid_telegram_activity':
        case 'hybrid_mitre_matrix':
        case 'hybrid_vlan_health':
        case 'hybrid_quarantine_tracker':
        case 'hybrid_sinkhole_effectiveness':
          return { kind: 'custom' as const };

        default:
          return { kind: 'unknown' as const };
      }
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

/** Renderiza una fila de tabla de forma genérica */
function renderCell(value: unknown): string {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/** Columnas con labels más legibles */
const COLUMN_LABELS: Record<string, string> = {
  level: 'Nivel',
  agent_name: 'Agente',
  description: 'Descripción',
  timestamp: 'Hora',
  id: 'ID',
  name: 'Nombre',
  ip: 'IP',
  status: 'Estado',
  action: 'Acción',
  chain: 'Cadena',
  'src-address': 'IP Origen',
  comment: 'Comentario',
  address: 'IP',
  list: 'Lista',
  timeout: 'Expiración',
  value: 'IP',
  scenario: 'Escenario',
  type: 'Tipo',
  duration: 'Duración',
  severity: 'Severidad',
  signature: 'Firma',
  src_ip: 'IP Origen',
  dest_ip: 'IP Destino',
  bytes_toserver: 'Bytes',
  proto: 'Protocolo',
  serial: 'Serial',
  otherserial: 'Inv.',
  states_id: 'Estado',
  priority: 'Prioridad',
  domain: 'Dominio',
  detected_by: 'Detectado por',
  risk_level: 'Riesgo',
  action_type: 'Acción',
  target_ip: 'IP',
  created_at: 'Fecha',
  country_code: 'País',
  country_name: 'Nombre',
  count: 'Ataques',
  percentage: '%',
};

export default function WidgetRenderer({ widget }: WidgetRendererProps) {
  const { data, isLoading, isError, refetch } = useWidgetData(widget.type, widget.config);

  const Icon = WIDGET_ICONS[widget.type] ?? Activity;

  if (isLoading) {
    return (
      <div className="widget-renderer widget-renderer--loading">
        <Loader size={18} className="animate-spin" />
        <span>Cargando…</span>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="widget-renderer widget-renderer--error">
        <AlertTriangle size={18} />
        <span>Error al cargar datos</span>
        <button className="btn btn-ghost" onClick={() => refetch()} style={{ padding: '0.2rem 0.5rem', fontSize: '0.7rem' }}>
          <RefreshCw size={11} /> Reintentar
        </button>
      </div>
    );
  }

  if (data.kind === 'unknown') {
    return (
      <div className="widget-renderer widget-renderer--unknown">
        <Icon size={20} style={{ opacity: 0.3 }} />
        <span>Widget no soportado: {widget.type}</span>
      </div>
    );
  }

  // ── Custom components (widgets nuevos) ───────────────────────────
  if (data.kind === 'custom') {
    const cfg = widget.config ?? {};
    const customMap: Record<string, React.ReactNode> = {
      visual_threat_gauge:           <ThreatGauge config={cfg} />,
      visual_network_pulse:          <NetworkPulse config={cfg as { interface?: string }} />,
      visual_event_counter:          <EventCounter config={cfg as { source?: string }} />,
      visual_activity_heatmap:       <ActivityHeatmap config={cfg} />,
      visual_protocol_donut:         <ProtocolDonut config={cfg} />,
      visual_agents_thermometer:     <AgentsThermometer config={cfg} />,
      visual_blocks_timeline:        <BlocksTimeline config={cfg} />,
      visual_portal_usage:           <PortalUsage config={cfg} />,
      visual_phishing_stats:         <PhishingStats config={cfg} />,
      visual_agent_alert_heatmap:    <AgentAlertHeatmap config={cfg as { hours?: number }} />,
      technical_action_log:          <ActionLogWidget config={cfg as { limit?: number }} />,
      technical_packet_inspector:    <PacketInspector config={cfg as { limit?: number }} />,
      technical_flow_table:          <FlowTableWidget config={cfg as { limit?: number }} />,
      technical_firewall_tree:       <FirewallTree config={cfg} />,
      technical_live_logs:           <LiveLogs config={cfg as { limit?: number; filter?: string }} />,
      technical_crowdsec_raw:        <CrowdSecRaw config={cfg as { limit?: number }} />,
      technical_correlation_timeline:<CorrelationTimeline config={cfg as { minutes?: number }} />,
      technical_critical_assets:     <CriticalAssets config={cfg as { limit?: number }} />,
      technical_dns_monitor:         <DnsMonitor config={cfg as { limit?: number }} />,
      technical_tls_fingerprint:     <TlsFingerprint config={cfg as { limit?: number }} />,
      technical_bandwidth_top:       <BandwidthTop config={cfg as { limit?: number }} />,
      technical_http_inspector:      <HttpInspector config={cfg as { limit?: number }} />,
      hybrid_ip_profiler:            <IpProfiler config={cfg as { default_ip?: string }} />,
      hybrid_confirmed_threats:      <ConfirmedThreats config={cfg} />,
      hybrid_country_radar:          <CountryRadar config={cfg as { limit?: number }} />,
      hybrid_incident_lifecycle:     <IncidentLifecycle config={cfg as { ip?: string }} />,
      hybrid_defense_layers:         <DefenseLayers config={cfg} />,
      hybrid_geoblock_predictor:     <GeoblockPredictor config={cfg} />,
      hybrid_suricata_glpi:          <SuricataGlpiCorrelation config={cfg as { limit?: number }} />,
      hybrid_world_threat_map:       <WorldThreatMap config={cfg} />,
      hybrid_view_report_generator:  <ViewReportGenerator config={cfg as { audience?: string; output?: string }} />,
      hybrid_telegram_activity:      <TelegramActivity config={cfg as { limit?: number }} />,
      hybrid_mitre_matrix:           <MitreMatrix config={cfg} />,
      hybrid_vlan_health:            <VlanHealth config={cfg} />,
      hybrid_quarantine_tracker:     <QuarantineTracker config={cfg} />,
      hybrid_sinkhole_effectiveness: <SinkholeEffectiveness config={cfg} />,
    };
    const node = customMap[widget.type];
    return (
      <div className="widget-renderer widget-renderer--custom">
        <Suspense fallback={<div className="widget-renderer widget-renderer--loading"><Loader size={18} className="animate-spin" /></div>}>
          {node ?? <span className="text-muted">Widget no implementado: {widget.type}</span>}
        </Suspense>
      </div>
    );
  }

  // ── Stats layout ─────────────────────────────────────────────
  if (data.kind === 'stats') {
    return (
      <div className="widget-renderer widget-renderer--stats">
        {data.stats.map(s => (
          <div key={s.label} className="widget-stat">
            <span className="widget-stat__value" style={{ color: s.color }}>
              {s.value}
            </span>
            <span className="widget-stat__label">{s.label}</span>
          </div>
        ))}
      </div>
    );
  }

  // ── Table layout ─────────────────────────────────────────────
  if (data.kind === 'table') {
    if (data.data.length === 0) {
      return (
        <div className="widget-renderer widget-renderer--empty">
          <Icon size={18} style={{ opacity: 0.3 }} />
          <span>Sin datos disponibles</span>
        </div>
      );
    }

    return (
      <div className="widget-renderer widget-renderer--table">
        <table className="data-table" style={{ fontSize: '0.72rem' }}>
          <thead>
            <tr>
              {data.columns.map(col => (
                <th key={col}>{COLUMN_LABELS[col] ?? col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.data.map((row: Record<string, unknown>, i: number) => (
              <tr key={i}>
                {data.columns.map(col => (
                  <td key={col} style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {renderCell(row[col])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return null;
}
