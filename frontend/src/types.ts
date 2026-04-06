/* ── API Response Types ──────────────────────────────────────── */

export interface APIResponse<T = unknown> {
  success: boolean;
  data: T | null;
  error: string | null;
}

/* ── MikroTik Types ─────────────────────────────────────────── */

export interface InterfaceInfo {
  name: string;
  type: string;
  running: boolean;
  disabled: boolean;
  rx_byte: number;
  tx_byte: number;
  rx_packet: number;
  tx_packet: number;
  mtu: number;
  mac_address: string;
  comment: string;
}

export interface ConnectionInfo {
  src_address: string;
  dst_address: string;
  protocol: string;
  connection_state: string;
  timeout: string;
  src_port: string;
  dst_port: string;
  orig_bytes: number;
  repl_bytes: number;
}

export interface ARPEntry {
  ip_address: string;
  mac_address: string;
  interface: string;
  dynamic: boolean;
  complete: boolean;
}

export interface TrafficData {
  interface: string;
  rx_bytes_per_sec: number;
  tx_bytes_per_sec: number;
  rx_packets_per_sec: number;
  tx_packets_per_sec: number;
  timestamp: string;
}

export interface FirewallRule {
  id: string;
  chain: string;
  action: string;
  src_address: string;
  dst_address: string;
  protocol: string;
  disabled: boolean;
  comment: string;
  bytes: number;
  packets: number;
}

export interface LogEntry {
  id: string;
  time: string;
  topics: string;
  message: string;
}

/* ── Wazuh Types ────────────────────────────────────────────── */

export interface WazuhAgent {
  id: string;
  name: string;
  ip: string;
  status: string;
  os_name: string;
  os_version: string;
  manager: string;
  node_name: string;
  group: string[];
  last_keep_alive: string;
  date_add: string;
}

export interface WazuhAlert {
  id: string;
  timestamp: string;
  agent_id: string;
  agent_name: string;
  agent_ip: string;
  rule_id: string;
  rule_level: number;
  rule_description: string;
  rule_groups: string[];
  full_log: string;
  src_ip: string;
  dst_ip: string;
  location: string;
}

/* ── Network Types ──────────────────────────────────────────── */

export interface IPLabel {
  id: number;
  ip_address: string;
  label: string;
  description: string | null;
  color: string;
  criteria: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface IPGroupMember {
  id: number;
  ip_address: string;
  added_reason: string;
  added_at: string;
}

export interface IPGroup {
  id: number;
  name: string;
  description: string | null;
  color: string;
  criteria: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  members: IPGroupMember[];
}

/* ── Report Types ───────────────────────────────────────────── */

export interface ReportDraft {
  html_content: string;
  title: string;
  summary: string;
  data_sources_used: string[];
  tokens_used: number;
}

/* ── Action Log Types ───────────────────────────────────────── */

export interface ActionLogEntry {
  id: number;
  action_type: string;
  target_ip: string | null;
  details: Record<string, unknown> | null;
  performed_by: string;
  comment: string | null;
  created_at: string;
}

/* ── WebSocket Types ────────────────────────────────────────── */

export interface TrafficWSMessage {
  type: 'traffic';
  data: {
    traffic: TrafficData[];
    active_connections: number;
    timestamp: string;
  };
}

export interface AlertWSMessage {
  type: 'alerts';
  data: {
    alerts: WazuhAlert[];
  };
}

export interface ErrorWSMessage {
  type: 'error';
  data: {
    message: string;
  };
}

/* ── VLAN Types ──────────────────────────────────────────────── */

export interface VlanInfo {
  id: string;
  vlan_id: number;
  name: string;
  interface: string;
  running: boolean;
  disabled: boolean;
  mtu: number;
  mac_address: string;
  comment: string;
}

export interface VlanTrafficData {
  vlan_id: number;
  name: string;
  rx_bps: number;
  tx_bps: number;
  status: 'ok' | 'alert';
}

export interface VlanTrafficWSMessage {
  type: 'vlan_traffic';
  data: {
    timestamp: string;
    vlans: VlanTrafficData[];
  };
}

/* ── Security / Wazuh Extended Types ────────────────────────── */


export interface CriticalAlert {
  id: string;
  agent_name: string;
  agent_id: string;
  agent_ip: string;
  rule_description: string;
  rule_level: number;
  src_ip: string;
  timestamp: string;
  mitre_technique: string;
  mitre_id: string;
  rule_groups: string[];
}

export interface AlertTimelinePoint {
  minute: string;
  count: number;
}

export interface TopAgent {
  agent_id: string;
  agent_name: string;
  alert_count: number;
  last_alert_timestamp: string;
  top_mitre_technique: string;
}

export interface AgentsSummary {
  active: number;
  disconnected: number;
  never_connected: number;
  pending: number;
  total: number;
}

export interface MitreSummaryItem {
  technique_id: string;
  technique_name: string;
  count: number;
  last_seen: string;
}

export interface WazuhHealthItem {
  service_name: string;
  status: string;
}

export interface WazuhHealthResponse {
  services: WazuhHealthItem[];
  version: string;
  cluster_enabled: boolean;
}

/* ── MikroTik Extended Types ────────────────────────────────── */

export interface SystemHealthMikrotik {
  cpu_percent: number;
  ram_used_mb: number;
  ram_total_mb: number;
  ram_percent: number;
  uptime: string;
  temperature: string;
  board_name: string;
  version: string;
}

export interface AddressListEntry {
  id: string;
  address: string;
  list: string;
  timeout: string;
  comment: string;
  disabled: boolean;
  dynamic: boolean;
  creation_time: string;
}

/* ── Phishing Types ─────────────────────────────────────────── */

export interface PhishingAlert {
  id: string;
  agent_name: string;
  agent_id: string;
  src_ip: string;
  dst_url: string;
  rule_description: string;
  timestamp: string;
  rule_level: number;
  user: string;
  rule_groups: string[];
}

export interface SuspiciousDomain {
  domain: string;
  hit_count: number;
  agents_affected: number;
  first_seen: string;
  last_seen: string;
  in_sinkhole: boolean;
}

export interface PhishingVictim {
  agent_name: string;
  agent_id: string;
  ip: string;
  url: string;
  timestamp: string;
  times: number;
}

export interface PhishingStats {
  total_alerts_today: number;
  unique_suspicious_domains: number;
  affected_agents: number;
  top_url: string;
  peak_hour: string;
}

export interface SinkholeEntry {
  domain: string;
  address: string;
  added_by: string;
  reason: string;
  created_at: string;
  comment: string;
}

/* ── Security Actions Types ─────────────────────────────────── */

export interface SecurityBlockIPRequest {
  ip: string;
  reason: string;
  duration_hours: number;
  source: 'manual' | 'auto';
}

export interface QuarantineRequest {
  agent_id: string;
  vlan_quarantine_id: number;
}

export interface GeoBlockRequest {
  country_code: string;
  ip_ranges: string[];
  duration_hours: number;
}

/* ── Network Search Types ────────────────────────────────────── */

export interface NetworkSearchResult {
  query: string;
  arp_match: ARPEntry | null;
  agent_match: WazuhAgent | null;
  recent_alerts: WazuhAlert[];
  glpi_match?: GlpiAsset | null;  // Extended: GLPI inventory asset
}


/* ── CLI Types ───────────────────────────────────────────────── */

export interface CLIResponse {
  command: string;
  output: Record<string, unknown>[] | string;
  count?: number;
  error?: string | null;
}

/* ── Security WebSocket Types ────────────────────────────────── */

export type SecurityActionType = 'block_ip' | 'sinkhole_domain' | 'quarantine' | 'dismiss';
export type SecurityAlertType = 'wazuh_alert' | 'phishing_detected' | 'interface_down' | 'auto_block_triggered';
export type SecurityAlertLevel = 'critical' | 'high' | 'medium';

export interface SecurityNotification {
  type: SecurityAlertType;
  level: SecurityAlertLevel;
  title: string;
  detail: string;
  actions: SecurityActionType[];
  data: Record<string, unknown>;
  id?: string; // Frontend-assigned for dedup/dismiss
  receivedAt?: string; // Frontend timestamp
}

/* ── Portal Cautivo Types ────────────────────────────────────── */

export type PortalSessionStatus = 'registered' | 'unregistered';
export type PortalScheduleScope = 'all' | 'unregistered';

export interface PortalSession {
  user: string;
  ip: string;
  mac: string;
  uptime: string;
  bytes_in: number;
  bytes_out: number;
  rate_limit: string;
  status: PortalSessionStatus;
  login_time: string;
}

export interface PortalSessionHistory {
  user: string;
  mac: string;
  ip: string;
  login_time: string;
  logout_time: string;
  duration: string;
  bytes_in: number;
  bytes_out: number;
}

export interface PortalChartPoint {
  timestamp: string; // "HH:MM"
  registered: number;
  unregistered: number;
}

export interface PortalRealtimeStats {
  total_sessions_active: number;
  registered_users_online: number;
  unregistered_users_online: number;
  total_bandwidth_in: number;
  total_bandwidth_out: number;
  peak_hour_today: string;
}

export interface TopUserByData {
  user: string;
  bytes_total: number;
  sessions: number;
}

export interface TopUserByTime {
  user: string;
  total_uptime_seconds: number;
  sessions: number;
}

export interface NewRegistrationPoint {
  date: string; // YYYY-MM-DD
  count: number;
}

export interface PeakByDayPoint {
  day: string;   // 'monday', 'tuesday', ...
  hour: number;  // 0-23
  count: number;
}

export interface PortalSummaryStats {
  unique_users_today: number;
  unique_users_week: number;
  unique_users_month: number;
  avg_session_duration_seconds: number;
  top_by_data: TopUserByData[];
  top_by_time: TopUserByTime[];
  new_registrations_30d: NewRegistrationPoint[];
  peak_by_day: PeakByDayPoint[];
}

export interface PortalUser {
  name: string;
  profile: string;
  mac_address: string;
  limit_uptime: string;
  limit_bytes_total: string;
  disabled: boolean;
  comment: string;
  last_seen: string;
  total_sessions: number;
  created_at: string | null;
  created_by: string | null;
}

export interface PortalUserCreate {
  name: string;
  password: string;
  profile: string;
  mac_address?: string;
  limit_uptime?: string;
  limit_bytes_total?: string;
  comment?: string;
}

export interface PortalUserUpdate {
  profile?: string;
  password?: string;
  mac_address?: string;
  limit_uptime?: string;
  limit_bytes_total?: string;
  disabled?: boolean;
  comment?: string;
}

export interface BulkCreateResult {
  total: number;
  success_count: number;
  failed_count: number;
  errors: { username: string; error: string }[];
}

export interface PortalProfile {
  name: string;
  rate_limit: string;
  rate_limit_up: string;
  rate_limit_down: string;
  session_timeout: string;
  idle_timeout: string;
  is_unregistered: boolean;
}

export interface PortalProfileCreate {
  name: string;
  rate_limit_up: string;
  rate_limit_down: string;
  session_timeout?: string;
  idle_timeout?: string;
}

export interface PortalConfig {
  server_name: string;
  interface: string;
  address_pool: string;
  profile: string;
  login_by: string;
  idle_timeout: string;
  addresses_per_mac: number;
  hotspot_initialized: boolean;
}

export interface AllowedHours {
  hour_from: string; // "07:00"
  hour_to: string;   // "22:00"
}

export interface PortalScheduleConfig {
  enabled: boolean;
  allowed_hours: AllowedHours;
  blocked_days: string[];
  scope: PortalScheduleScope;
}

export interface PortalScheduleStatus {
  enabled: boolean;
  rule_count: number;
  allowed_hours: AllowedHours | null;
  blocked_days: string[];
  scope: PortalScheduleScope;
}

export interface HotspotSetupResult {
  success: boolean;
  steps_completed: string[];
  steps_failed: string[];
  message: string;
  already_existed: boolean;
}

export interface HotspotStatus {
  initialized: boolean;
  server_name: string;
  interface: string;
  address_pool: string;
  profile: string;
}

/* ── Portal WebSocket Types ──────────────────────────────────── */

export interface PortalSessionWSMessage {
  type: 'portal_sessions';
  data: {
    sessions: PortalSession[];
    chart_history: PortalChartPoint[];
    timestamp: string;
  };
}

export interface PortalErrorWSMessage {
  type: 'portal_error';
  data: {
    message: string;
    code: string;
  };
}

export type WSMessage =
  | TrafficWSMessage
  | AlertWSMessage
  | ErrorWSMessage
  | VlanTrafficWSMessage
  | PortalSessionWSMessage
  | PortalErrorWSMessage;

/* ── GLPI Types ──────────────────────────────────────────────── */

export type GlpiAssetStatus =
  | 'activo'
  | 'reparacion'
  | 'retirado'
  | 'pendiente'
  | 'bajo_investigacion';

export type GlpiTicketStatus = 'pendiente' | 'en_progreso' | 'resuelto';
export type GlpiHealth = 'ok' | 'warning' | 'critical';
export type GlpiWazuhAgent = 'active' | 'disconnected' | 'not_installed';

export interface GlpiAsset {
  id: number;
  name: string;
  serial: string;
  ip: string;
  mac: string;
  os: string;
  cpu: string;
  ram: string;
  location: string;
  location_id: number | null;
  assigned_user: string;
  status: GlpiAssetStatus;
  comment: string;
  last_update: string;
  mock?: boolean;
}

export interface GlpiAssetDetail extends GlpiAsset {
  tickets: GlpiTicket[];
}

export interface GlpiAssetCreate {
  name: string;
  serial?: string;
  ip?: string;
  mac?: string;
  os?: string;
  cpu?: string;
  ram_gb?: string;
  location_id?: number;
  assigned_user_id?: number;
  status?: GlpiAssetStatus;
  comment?: string;
}

export interface GlpiAssetUpdate {
  name?: string;
  status?: GlpiAssetStatus;
  location_id?: number;
  assigned_user_id?: number;
  comment?: string;
}

export interface GlpiAssetStats {
  activo: number;
  reparacion: number;
  retirado: number;
  pendiente: number;
  total: number;
}

export interface GlpiAssetHealth {
  asset_id: number;
  name: string;
  ip: string;
  location: string;
  glpi_status: GlpiAssetStatus;
  wazuh_agent: GlpiWazuhAgent;
  network_visible: boolean;
  health: GlpiHealth;
  health_reason: string;
  mock?: boolean;
}

export interface GlpiHealthSummary {
  ok: number;
  warning: number;
  critical: number;
  total: number;
}

export interface GlpiNetworkContext {
  asset_id: number;
  asset_name: string;
  interface: string;
  vlan: string;
  ip_assigned: string;
  last_seen: string;
  mac: string;
}

export interface GlpiLocation {
  id: number;
  name: string;
  completename: string;
  comment: string;
  building: string;
  room: string;
}

export interface GlpiTicket {
  id: number;
  title: string;
  description: string;
  priority: number;
  priority_label: string;
  status: GlpiTicketStatus;
  status_id: number;
  assigned_user: string;
  asset_name: string;
  asset_id: number | null;
  category: string;
  created_at: string;
  due_date: string;
  is_netshield: boolean;
  mock?: boolean;
}

export interface GlpiTicketCreate {
  title: string;
  description?: string;
  priority?: number;
  asset_id?: number;
  category?: string;
}

export interface GlpiTicketKanban {
  pendiente: GlpiTicket[];
  en_progreso: GlpiTicket[];
  resuelto: GlpiTicket[];
}

export interface GlpiUser {
  id: number;
  name: string;
  realname: string;
  firstname: string;
  display_name: string;
  email: string;
  department: string;
  assets_assigned?: GlpiAsset[];
}

export interface GlpiQuarantineRequest {
  reason: string;
  wazuh_alert_id?: string;
  mikrotik_block_id?: string;
}

export interface GlpiAvailability {
  available: boolean;
  message: string;
  url: string;
}

// ── Mock Status ────────────────────────────────────────────────────────────

export interface MockServiceStatus {
  mikrotik: boolean;
  wazuh: boolean;
  glpi: boolean;
  anthropic: boolean;
}

export interface MockStatus {
  mock_all: boolean;
  services: MockServiceStatus;
  any_mock_active: boolean;
}

