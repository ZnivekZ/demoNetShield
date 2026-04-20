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

export type SecurityActionType = 'block_ip' | 'sinkhole_domain' | 'quarantine' | 'dismiss' | 'view_ip_context';
export type SecurityAlertType = 'wazuh_alert' | 'phishing_detected' | 'interface_down' | 'auto_block_triggered' | 'crowdsec_decision';
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
  crowdsec: boolean;
  geoip: boolean;
  suricata: boolean;
  telegram: boolean;
}

export interface MockStatus {
  mock_all: boolean;
  services: MockServiceStatus;
  any_mock_active: boolean;
}

/* ── CrowdSec Types ──────────────────────────────────────────────── */

export interface CrowdSecDecision {
  id: string;
  ip: string;
  type: 'ban' | 'captcha';
  duration: string;
  reason: string;
  origin: 'crowdsec' | 'cscli' | 'console';
  scenario: string;
  country: string;
  as_name: string;
  expires_at: string;
  community_score: number;
  reported_by: number;
  is_known_attacker: boolean;
  mock?: boolean;
  // GeoIP enrichment (injected by backend geoip_service)
  geo?: {
    city: string | null;
    latitude: number | null;
    longitude: number | null;
    network_type: string | null;
    is_datacenter: boolean;
    is_tor: boolean;
    raw_available: boolean;
  };
}

export interface CrowdSecAlert {
  id: string;
  scenario: string;
  message: string;
  events_count: number;
  start_at: string;
  stop_at: string;
  source_ip: string;
  source_country: string;
  source_as_name: string;
  decisions: { type: string; duration: string; scope: string; value: string }[];
  target_agent: string | null;
  target_ip: string | null;
  events?: { timestamp: string; meta: { key: string; value: string }[] }[];
}

export interface CrowdSecBouncer {
  name: string;
  ip_address: string;
  type: string;
  version: string;
  last_pull: string;
  created_at: string;
  status: 'connected' | 'disconnected';
}

export interface CrowdSecMachine {
  name: string;
  version: string;
  status: string;
  last_push: string;
  created_at: string;
  info: string;
}

export interface CrowdSecScenario {
  name: string;
  description: string;
  alerts_count: number;
  last_triggered: string;
  trend: 'up' | 'down' | 'stable';
}

export interface CrowdSecCountry {
  country: string;
  code: string;
  count: number;
  pct: number;
}

export interface CrowdSecMetrics {
  active_decisions: number;
  alerts_24h: number;
  scenarios_active: number;
  bouncers_connected: number;
  top_countries: CrowdSecCountry[];
  top_scenario: { name: string; count: number };
  decisions_per_hour: { hour: string; count: number }[];
}

export interface CrowdSecWhitelistEntry {
  id: number;
  ip: string;
  reason: string;
  added_by: string;
  created_at: string;
  mock?: boolean;
}

export interface CrowdSecSyncStatus {
  in_sync: boolean;
  only_in_crowdsec: string[];
  only_in_mikrotik: string[];
  synced_ips: string[];
  synced_count: number;
  total_crowdsec: number;
  total_mikrotik: number;
}

export interface CrowdSecCTI {
  community_score: number;
  is_known_attacker: boolean;
  reported_by: number;
  background_noise: boolean;
  classifications: string[];
}

export interface IpContext {
  ip: string;
  crowdsec: {
    decisions: CrowdSecDecision[];
    alerts: CrowdSecAlert[];
    community_score: number;
    is_known_attacker: boolean;
    reported_by: number;
    background_noise: boolean;
    classifications: string[];
    country: string;
    as_name: string;
  };
  mikrotik: {
    in_arp: boolean;
    arp_comment: string | null;
    in_blacklist: boolean;
    firewall_rules: unknown[];
  };
  wazuh: {
    alerts_count: number;
    last_alert: WazuhAlert | null;
    agents_affected: string[];
  };
}

export interface CrowdSecHubItem {
  name: string;
  status: string;
  version: string;
}

export interface CrowdSecHub {
  collections: CrowdSecHubItem[];
  parsers: CrowdSecHubItem[];
  last_update: string;
}

/* ── CrowdSec WebSocket Types ────────────────────────────────────── */

export interface CrowdSecDecisionWSMessage {
  type: 'crowdsec_decision';
  data: CrowdSecDecision & { is_new?: boolean; timestamp: string };
}

export interface SuricataAlertWSMessage {
  type: 'suricata_alert';
  data: SuricataAlert;
}

export type WSMessage =
  | TrafficWSMessage
  | AlertWSMessage
  | ErrorWSMessage
  | VlanTrafficWSMessage
  | PortalSessionWSMessage
  | PortalErrorWSMessage
  | CrowdSecDecisionWSMessage
  | SuricataAlertWSMessage;

/* ── CrowdSec Request Types ──────────────────────────────────────── */

export interface ManualDecisionRequest {
  ip: string;
  duration: string;
  reason: string;
  type: 'ban' | 'captcha';
}

export interface WhitelistRequest {
  ip: string;
  reason: string;
}

export interface FullRemediationRequest {
  ip: string;
  duration?: string;
  reason: string;
  trigger?: string;
}

export interface SyncApplyRequest {
  add_to_mikrotik: string[];
  remove_from_mikrotik: string[];
}

/* ── GeoIP Types ─────────────────────────────────────────────── */

/** Full GeoIP result for a single IP address */
export interface GeoIPResult {
  ip: string;
  country_code: string;  // ISO 3166-1 alpha-2 | "LOCAL" | "UNKNOWN"
  country_name: string;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  asn: number | null;
  as_name: string | null;
  network_type: string | null;  // "ISP" | "Hosting" | "Business" | "Residential" | "Local"
  is_datacenter: boolean;
  is_tor: boolean;
  raw_available: boolean;  // false when using mock data
}

/** Enrichment sub-object injected into existing Wazuh alerts */
export interface GeoIPGeo {
  country_code: string;
  country_name: string;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  network_type: string | null;
  is_datacenter: boolean;
  is_tor: boolean;
  raw_available: boolean;
}

export interface SourceCounts {
  crowdsec: number;
  wazuh: number;
  mikrotik: number;
}

export interface TopCountryItem {
  country_code: string;
  country_name: string;
  count: number;
  percentage: number;
  sources: SourceCounts;
  top_asns: string[];
}

export interface TopCountriesResponse {
  countries: TopCountryItem[];
  total_ips: number;
  source: string;
  generated_at: string;
}

export interface TopASNItem {
  asn: number;
  as_name: string;
  country_code: string;
  count: number;
  is_datacenter: boolean;
}

export interface SuggestionEvidence {
  crowdsec_ips: string[];
  wazuh_alerts: number;
  affected_agents: string[];
}

export interface GeoBlockSuggestion {
  id: string;
  type: 'country' | 'asn';
  target: string;       // country_code or "AS60729"
  target_name: string;
  reason: string;
  evidence: SuggestionEvidence;
  risk_level: 'high' | 'medium';
  estimated_block_count: number;
  suggested_duration: string;
}

export interface GeoIPDBEntry {
  loaded: boolean;
  path: string;
  build_epoch: number | null;
  description: string;
}

export interface GeoIPDBStatus {
  city_db: GeoIPDBEntry;
  asn_db: GeoIPDBEntry;
  mock_mode: boolean;
  cache_size: number;
  cache_ttl_seconds: number;
}

/* ── Suricata IDS/IPS/NSM Types ───────────────────────────────── */

export interface SuricataGeo {
  country: string;
  country_name: string;
  as_name: string;
}

export interface SuricataAlert {
  id: string;
  timestamp: string;
  signature_id: number;
  signature: string;
  category: string;
  severity: 1 | 2 | 3;  // 1=critical 2=major 3=minor
  protocol: string;
  src_ip: string;
  src_port: number;
  dst_ip: string;
  dst_port: number;
  action: 'alert' | 'drop' | 'pass';
  flow_id: string | null;
  app_proto: string | null;
  mitre_technique: string | null;
  mitre_name: string | null;
  wazuh_alert_id: string | null;
  crowdsec_decision_id: string | null;
  geo: SuricataGeo | null;
  mock?: boolean;
}

export interface NetworkFlow {
  id: string;
  timestamp: string;
  protocol: string;
  src_ip: string;
  src_port: number;
  dst_ip: string;
  dst_port: number;
  bytes_toserver: number;
  bytes_toclient: number;
  pkts_toserver: number;
  pkts_toclient: number;
  app_proto: string | null;
  state: 'new' | 'established' | 'closed';
  duration_ms: number;
  has_alert: boolean;
}

export interface DnsQuery {
  id: string;
  timestamp: string;
  src_ip: string;
  src_port: number;
  dst_ip: string;
  dst_port: number;
  query: string;
  type: string;
  response: string;
  is_suspicious: boolean;
  flow_id: string | null;
}

export interface HttpTransaction {
  id: string;
  timestamp: string;
  src_ip: string;
  dst_ip: string;
  dst_port: number;
  hostname: string;
  url: string;
  method: string;
  status: number;
  user_agent: string;
  content_type: string;
  response_bytes: number;
  is_suspicious: boolean;
  flow_id: string | null;
}

export interface TlsHandshake {
  id: string;
  timestamp: string;
  src_ip: string;
  dst_ip: string;
  dst_port: number;
  sni: string | null;
  version: string;
  ja3: string | null;
  ja3s: string | null;
  is_suspicious: boolean;
  flow_id: string | null;
}

export interface SuricataRule {
  sid: number;
  enabled: boolean;
  ruleset: string;
  category: string;
  rule: string;
  hits_total: number;
  hits_last_hour: number;
  last_hit: string | null;
}

export interface SuricataRuleset {
  name: string;
  description: string;
  rules_count: number;
  enabled_count: number;
  last_updated: string | null;
  version: string | null;
  is_active: boolean;
}

export interface EngineStats {
  running: boolean;
  mode: 'ids' | 'ips' | 'nsm';
  version: string;
  uptime_seconds: number;
  uptime_label: string;
  threads: { detect: number; output: number; capture: number };
  packets_captured: number;
  packets_decoded: number;
  packets_dropped: number;
  alerts_total: number;
  flows_active: number;
  bytes_processed: number;
  interface: string;
  rules_loaded: number;
  rules_failed: number;
  last_reload: string | null;
  mock?: boolean;
}

export interface EngineStatPoint {
  minute: string;
  packets_per_sec: number;
  alerts_per_min: number;
  dropped: number;
}

export interface AlertTimelinePoint {
  minute: string;
  count_ids: number;
  count_ips: number;
}

export interface TopSignature {
  sid: number;
  signature: string;
  category: string;
  hits: number;
  last_hit: string | null;
}

export interface CategoryDistribution {
  category: string;
  count: number;
  color: string;
}

export interface FlowsStats {
  total_flows: number;
  active_flows: number;
  top_protocols: { proto: string; count: number; bytes: number }[];
  top_app_protos: { app_proto: string; count: number; bytes: number }[];
  top_src_ips: { ip: string; flows: number; bytes: number; has_alerts?: boolean }[];
  top_dst_ports: { port: number; count: number }[];
}

export interface SuricataCorrelation {
  ip: string;
  suricata_alerts: number;
  suricata_signatures: string[];
  crowdsec_decision_id: string | null;
  crowdsec_scenario: string | null;
  crowdsec_type: string | null;
  correlation_type: 'confirmed_threat' | 'correlated' | 'suricata_only';
  geo: SuricataGeo | null;
}

export interface WazuhCorrelation {
  suricata_alert_id: string;
  suricata_signature: string;
  suricata_timestamp: string;
  wazuh_alert_id: string;
  wazuh_description: string;
  wazuh_timestamp: string;
  wazuh_agent: string;
  delta_seconds: number;
  correlation_strength: 'high' | 'medium' | 'low';
}

export interface AutoResponseConfig {
  enabled: boolean;
  auto_trigger: boolean;
  suricata_threshold: number;
  wazuh_level_required: number;
  actions: {
    crowdsec_ban: boolean;
    mikrotik_block: boolean;
    default_duration: string;
  };
  last_updated: string;
  updated_by: string;
}

export interface AutoResponseHistoryEntry {
  id: string;
  ip: string;
  triggered_at: string;
  triggered_by: string;
  trigger_alert_id?: string;
  suricata_alerts_count: number;
  wazuh_level: number | null;
  actions_taken: string[];
  crowdsec_decision_id?: string;
  mikrotik_rule_id?: string;
  duration: string;
  reason: string;
  mock?: boolean;
}

export interface AutoResponseTriggerResult {
  success: boolean;
  ip: string;
  trigger_alert_id: string;
  actions_taken: string[];
  history_entry_id: string;
  crowdsec?: unknown;
  mikrotik?: unknown;
  error?: string;
}

export interface SuricataIpContext {
  ip: string;
  alerts_count: number;
  recent_alerts: SuricataAlert[];
  flows_count: number;
  top_signatures: string[];
  last_seen: string | null;
}

/* ── Telegram Bot Types ──────────────────────────────────────────────── */

export interface TelegramStatus {
  connected: boolean;
  bot_username: string | null;
  chat_id: string | null;
  pending_messages: number;
  last_message_at: string | null;
  mock: boolean;
}

export interface TelegramReportConfig {
  id: number;
  name: string;
  enabled: boolean;
  trigger: 'scheduled' | 'on_alert' | 'on_threshold';
  schedule: string | null;
  sources: string[];
  min_severity: number;
  audience: 'executive' | 'technical' | 'compliance';
  include_summary: boolean;
  include_charts: boolean;
  chat_id: string | null;
  last_triggered: string | null;
  created_at: string;
  updated_at: string;
}

export interface TelegramReportConfigCreate {
  name: string;
  enabled?: boolean;
  trigger: 'scheduled' | 'on_alert' | 'on_threshold';
  schedule?: string | null;
  sources: string[];
  min_severity?: number;
  audience?: 'executive' | 'technical' | 'compliance';
  include_summary?: boolean;
  include_charts?: boolean;
  chat_id?: string | null;
}

export interface TelegramMessageLog {
  id: number;
  direction: 'outbound' | 'inbound';
  chat_id: string;
  message_type: 'alert' | 'summary' | 'report' | 'test' | 'bot_query' | 'bot_response';
  content_summary: string;
  status: 'sent' | 'failed' | 'pending';
  error: string | null;
  created_at: string;
}

export interface TelegramSendResult {
  ok: boolean;
  message_id?: number;
  chat_id?: string;
  error?: string;
  mock?: boolean;
}

/* ── Custom Views Types ──────────────────────────────── */

export interface WidgetConfig {
  /** ID único del widget dentro de la vista (generado en el frontend) */
  id: string;
  /** Tipo del widget — coincide con el catálogo del backend */
  type: string;
  /** Título visible del widget */
  title: string;
  /** Tamaño del widget en el grid */
  size: 'small' | 'medium' | 'large' | 'full';
  /** Configuración específica del widget (filters, limits, etc.) */
  config: Record<string, unknown>;
}

export interface CustomView {
  id: string;
  name: string;
  description: string | null;
  widgets: WidgetConfig[];
  icon: string | null;
  color: string | null;
  is_default: boolean;
  created_at: string | null;
  updated_at: string | null;
}

export interface CustomViewCreate {
  name: string;
  description?: string;
  widgets: WidgetConfig[];
  icon?: string;
  color?: string;
}

export interface CustomViewUpdate {
  name?: string;
  description?: string;
  widgets?: WidgetConfig[];
  icon?: string;
  color?: string;
}

export interface WidgetConfigSchema {
  type: 'number' | 'string' | 'boolean';
  default: unknown;
  label: string;
}

export interface WidgetCatalogItem {
  type: string;
  title: string;
  description: string;
  icon: string;
  source: 'wazuh' | 'mikrotik' | 'crowdsec' | 'suricata' | 'glpi' | 'phishing' | 'general' | 'mixed';
  category?: 'standard' | 'visual' | 'technical' | 'hybrid';
  default_size: WidgetConfig['size'];
  available_sizes: WidgetConfig['size'][];
  config_schema: Record<string, WidgetConfigSchema>;
  preview_color?: string;
}

export interface WidgetCategory {
  id: 'standard' | 'visual' | 'technical' | 'hybrid';
  label: string;
  description: string;
  icon: string;
  widgets: WidgetCatalogItem[];
}

export interface WidgetCatalogResponse {
  categories: WidgetCategory[];
}

/* ── Widget Data Types (new endpoints) ────────────────────────── */

export interface ThreatLevelSource {
  count: number;
  score: number;
  weight: number;
  label: string;
}

export interface ThreatLevelData {
  score: number;
  breakdown: {
    wazuh: ThreatLevelSource;
    crowdsec: ThreatLevelSource;
    suricata: ThreatLevelSource;
  };
  generated_at: string;
}

export interface ActivityHeatmapData {
  matrix: number[][];  // [7][24] — day x hour
  labels_day: string[];
  max_value: number;
  generated_at: string;
}

export interface CorrelationPoint {
  timestamp: string;
  wazuh_alerts: number;
  suricata_alerts: number;
  crowdsec_decisions: number;
}

export interface CorrelationTimelineData {
  series: CorrelationPoint[];
  minutes: number;
  generated_at: string;
}

export interface ConfirmedThreatGeo {
  country_code: string;
  country_name: string;
  city: string | null;
  as_name: string | null;
}

export interface ConfirmedThreat {
  ip: string;
  sources: string[];  // 'suricata' | 'crowdsec' | 'wazuh'
  confirmation_level: number;  // 2 or 3
  score: number;
  geo: ConfirmedThreatGeo | null;
  suricata_signatures: string[];
  crowdsec_scenario: string | null;
  wazuh_level: number;
  last_seen: string;
}

export interface ConfirmedThreatsData {
  threats: ConfirmedThreat[];
  total: number;
  generated_at: string;
}

export interface IncidentStep {
  step: 'detection' | 'alert' | 'block' | 'ticket' | 'resolution';
  label: string;
  icon: string;
  status: 'done' | 'pending' | 'failed';
  timestamp: string | null;
  source: 'wazuh' | 'crowdsec' | 'mikrotik' | 'glpi' | 'suricata' | null;
  detail: string | null;
}

export interface IncidentLifecycleData {
  ip: string;
  steps: IncidentStep[];
  complete: boolean;
  generated_at: string;
}

export interface AssetCorrelation {
  asset_name: string;
  asset_id: number | null;
  asset_owner: string;
  asset_location: string;
  dst_ip: string;
  suricata_severity: 1 | 2 | 3;
  suricata_signature: string;
  suricata_category: string;
  wazuh_agent: boolean;
  timestamp: string;
}

export interface SuricataAssetCorrelationData {
  correlations: AssetCorrelation[];
  total: number;
  generated_at: string;
}

export interface WorldThreatCountry {
  country_code: string;
  country_name: string;
  score: number;  // 0-100
  crowdsec_count: number;
  wazuh_count: number;
  suricata_count: number;
  top_asn: string;
  wazuh_max_level: number;
  suricata_top_signature: string;
}

export interface WorldThreatMapData {
  countries: WorldThreatCountry[];
  total_countries_with_activity: number;
  generated_at: string;
}

export interface ViewReportResult {
  success: boolean;
  pdf_url: string | null;
  telegram_sent: boolean;
  report_summary: string;
  html_content?: string;
  view_id: string;
  widget_ids: string[];
  audience: string;
  mock?: boolean;
}
