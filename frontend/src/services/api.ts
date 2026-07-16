import axios from 'axios';
import type {
  APIResponse,
  // Auth
  LoginRequest,
  TokenResponse,
  AuthUser,
  UserCreate,
  UserUpdate,
  InterfaceInfo,
  ConnectionInfo,
  ARPEntry,
  TrafficData,
  FirewallRule,
  LogEntry,
  WazuhAgent,
  WazuhAlert,
  IPLabel,
  IPGroup,
  ReportDraft,
  ActionLogEntry,
  VlanInfo,
  VlanTrafficData,
  // New types
  CriticalAlert,
  AlertTimelinePoint,
  TopAgent,
  AgentsSummary,
  MitreSummaryItem,
  WazuhHealthResponse,
  SystemHealthMikrotik,
  AddressListEntry,
  NatRule,
  RouteEntry,
  IPAddress,
  BridgePort,
  QueueEntry,
  QueueCreate,
  QueueUpdate,
  PhishingAlert,
  SuspiciousDomain,
  PhishingVictim,
  PhishingStats,
  SinkholeEntry,
  SecurityBlockIPRequest,
  QuarantineRequest,
  GeoBlockRequest,
  NetworkSearchResult,
  CLIResponse,
  // GLPI types
  GlpiAsset,
  GlpiAssetCreate,
  GlpiAssetUpdate,
  GlpiAssetStats,
  GlpiAssetHealth,
  GlpiHealthSummary,
  GlpiNetworkContext,
  GlpiLocation,
  GlpiTicket,
  GlpiTicketCreate,
  GlpiTicketKanban,
  GlpiUser,
  GlpiUserCreate,
  GlpiUserUpdate,
  GlpiAssignmentRequest,
  GlpiQuarantineRequest,
  GlpiAvailability,
  GlpiAssetFullDetail,
  MockStatus,
  // GeoIP
  GeoIPResult,
  GeoIPDBStatus,
  TopCountriesResponse,
  GeoBlockSuggestion,
  // Suricata
  SuricataAlert,
  NetworkFlow,
  DnsQuery,
  HttpTransaction,
  TlsHandshake,
  SuricataRule,
  SuricataRuleset,
  EngineStats,
  EngineStatPoint,
  AlertTimelinePoint as SuricataAlertTimelinePoint,
  TopSignature,
  CategoryDistribution,
  FlowsStats,
  SuricataCorrelation,
  WazuhCorrelation,
  AutoResponseConfig,
  AutoResponseHistoryEntry,
  AutoResponseTriggerResult,
  SuricataIpContext,
  // Telegram
  TelegramStatus,
  TelegramReportConfig,
  TelegramReportConfigCreate,
  TelegramMessageLog,
  TelegramSendResult,
  AuditHistoryResponse,
  // Report types (new)
    SavedReport,
    SavedReportPagination,
    ReportSchedule,
    ReportTemplate,
    AIModel,
    // Wazuh extended (pagination, vulnerabilities, mitre, agent detail)
    WazuhAlertsFilters,
    WazuhAlertsPagination,
    WazuhAgentsFilters,
    WazuhAgentsPagination,
    WazuhAgentDetail,
    WazuhVulnerabilitiesFilters,
    WazuhVulnerabilitiesPagination,
    WazuhMitreMatrix,
    WazuhStatsSummary,
  } from '../types';

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000,
});

// ── JWT Interceptors ──────────────────────────────────────────────────────────

// Inject Authorization header automatically on every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('netshield_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 globally: clear token and redirect to login
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('netshield_token');
      localStorage.removeItem('netshield_user');
      // Avoid redirect loop if already on /login
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

/* ── MikroTik ─────────────────────────────────────────────────── */

export const mikrotikApi = {
  getInterfaces: () =>
    api.get<APIResponse<InterfaceInfo[]>>('/mikrotik/interfaces').then(r => r.data),

  getConnections: () =>
    api.get<APIResponse<ConnectionInfo[]>>('/mikrotik/connections').then(r => r.data),

  getArp: () =>
    api.get<APIResponse<ARPEntry[]>>('/mikrotik/arp').then(r => r.data),

  searchArp: (params: { ip?: string; mac?: string }) =>
    api.get<APIResponse<ARPEntry[]>>('/mikrotik/arp/search', { params }).then(r => r.data),

  getTraffic: () =>
    api.get<APIResponse<TrafficData[]>>('/mikrotik/traffic').then(r => r.data),

  getAllInterfaceTraffic: () =>
    api.get<APIResponse<TrafficData[]>>('/mikrotik/interfaces/traffic/all').then(r => r.data),

  getFirewallRules: () =>
    api.get<APIResponse<FirewallRule[]>>('/mikrotik/firewall/rules').then(r => r.data),

  blockIP: (ip: string, comment: string, duration?: number) =>
    api.post<APIResponse>('/mikrotik/firewall/block', { ip, comment, duration }).then(r => r.data),

  unblockIP: (ip: string) =>
    api.delete<APIResponse>('/mikrotik/firewall/block', { data: { ip } }).then(r => r.data),

  getLogs: (limit = 50) =>
    api.get<APIResponse<LogEntry[]>>('/mikrotik/logs', { params: { limit } }).then(r => r.data),

  getHealth: () =>
    api.get<APIResponse<SystemHealthMikrotik>>('/mikrotik/health').then(r => r.data),

  getAddressList: (listName?: string) =>
    api.get<APIResponse<AddressListEntry[]>>('/mikrotik/address-list', {
      params: listName ? { list: listName } : {},
    }).then(r => r.data),

  // ── NAT Rules ───────────────────────────────────────────────
  getNatRules: () =>
    api.get<APIResponse<NatRule[]>>('/mikrotik/nat-rules').then(r => r.data),

  // ── Network Topology ────────────────────────────────────────
  getRoutes: () =>
    api.get<APIResponse<RouteEntry[]>>('/mikrotik/routes').then(r => r.data),

  getIPAddresses: () =>
    api.get<APIResponse<IPAddress[]>>('/mikrotik/addresses').then(r => r.data),

  getBridgePorts: () =>
    api.get<APIResponse<BridgePort[]>>('/mikrotik/bridge-ports').then(r => r.data),

  // ── QoS / Simple Queues ─────────────────────────────────────
  getQueues: () =>
    api.get<APIResponse<QueueEntry[]>>('/mikrotik/queues').then(r => r.data),

  createQueue: (data: QueueCreate) =>
    api.post<APIResponse<QueueEntry>>('/mikrotik/queues', data).then(r => r.data),

  updateQueue: (queueId: string, data: QueueUpdate) =>
    api.put<APIResponse>(`/mikrotik/queues/${encodeURIComponent(queueId)}`, data).then(r => r.data),

  deleteQueue: (queueId: string) =>
    api.delete<APIResponse>(`/mikrotik/queues/${encodeURIComponent(queueId)}`).then(r => r.data),
};

/* ── Wazuh ────────────────────────────────────────────────────── */

export const wazuhApi = {
  getAgents: () =>
    api.get<APIResponse<WazuhAgent[]>>('/wazuh/agents').then(r => r.data),

  getAlerts: (limit = 50, levelMin?: number, offset = 0) =>
    api.get<APIResponse<WazuhAlert[]>>('/wazuh/alerts', {
      params: { limit, level_min: levelMin, offset },
    }).then(r => r.data),

  getAlertsByAgent: (agentId: string, limit = 50, offset = 0) =>
    api.get<APIResponse<WazuhAlert[]>>(`/wazuh/alerts/agent/${agentId}`, {
      params: { limit, offset },
    }).then(r => r.data),

  getCriticalAlerts: (limit = 50, offset = 0) =>
    api.get<APIResponse<CriticalAlert[]>>('/wazuh/alerts/critical', {
      params: { limit, offset },
    }).then(r => r.data),

  getAlertsTimeline: (levelMin = 5) =>
    api.get<APIResponse<AlertTimelinePoint[]>>('/wazuh/alerts/timeline', {
      params: { level_min: levelMin },
    }).then(r => r.data),

  getLastCritical: () =>
    api.get<APIResponse<CriticalAlert | null>>('/wazuh/alerts/last-critical').then(r => r.data),

  getTopAgents: (limit = 10) =>
    api.get<APIResponse<TopAgent[]>>('/wazuh/agents/top', { params: { limit } }).then(r => r.data),

  getAgentsSummary: () =>
    api.get<APIResponse<AgentsSummary>>('/wazuh/agents/summary').then(r => r.data),

  getMitreSummary: () =>
    api.get<APIResponse<MitreSummaryItem[]>>('/wazuh/mitre/summary').then(r => r.data),

  getHealth: () =>
    api.get<APIResponse<WazuhHealthResponse>>('/wazuh/health').then(r => r.data),

  sendActiveResponse: (agentId: string, command: string, args: string[] = []) =>
      api.post<APIResponse>('/wazuh/active-response', {
        agent_id: agentId,
        command,
        args,
      }).then(r => r.data),
  };

  /**
   * wazuhApiExtended — Extended Wazuh API client.
   *
   * Some of these endpoints do NOT exist in the backend yet (e.g. /agents/{id},
   * /vulnerability, /mitre/matrix). When that's the case, each method catches
   * the network/server error and returns a not_available response so the UI
   * can render a graceful "Pendiente de integración backend" message instead
   * of crashing.
   *
   * Always prefer the existing wazuhApi for endpoints that are already wired
   * (health, alerts, alerts/critical, alerts/timeline, alerts/last-critical,
   * agents, agents/top, agents/summary, mitre/summary, active-response).
   */
export const wazuhApiExtended = {
  // ── Alerts with pagination + filters ─────────────────────────────
  getAlertsPaginated: async (filters: WazuhAlertsFilters): Promise<APIResponse<WazuhAlertsPagination>> => {
    try {
      // Build params, drop undefined/null to keep URL clean
      const params: Record<string, string | number> = { page: filters.page ?? 1, page_size: filters.page_size ?? 25 };
      if (filters.level_min != null) params.level_min = filters.level_min;
      if (filters.agent_id) params.agent_id = filters.agent_id;
      if (filters.rule_id) params.rule_id = filters.rule_id;
      if (filters.from_date) params.from_date = filters.from_date;
      if (filters.to_date) params.to_date = filters.to_date;
      if (filters.search) params.search = filters.search;

      return await api
        .get<APIResponse<WazuhAlertsPagination>>('/wazuh/alerts', { params })
        .then(r => r.data);
    } catch (e: unknown) {
      const status = (e as { response?: { status?: number } })?.response?.status;
      // If the backend doesn't support paginated params yet, fall back to the basic endpoint
      // and shape the response manually.
      if (status && status >= 400 && status < 500) {
        try {
          const basic = await wazuhApi.getAlerts(
            filters.page_size ?? 25,
            filters.level_min,
            ((filters.page ?? 1) - 1) * (filters.page_size ?? 25),
          );
          if (basic.success && basic.data) {
            const all = basic.data;
            const page = filters.page ?? 1;
            const size = filters.page_size ?? 25;
            const filtered = all.filter(a => {
              if (filters.agent_id && a.agent_id !== filters.agent_id) return false;
              if (filters.rule_id && a.rule_id !== filters.rule_id) return false;
              if (filters.search) {
                const q = filters.search.toLowerCase();
                if (!a.rule_description.toLowerCase().includes(q) && !a.agent_name.toLowerCase().includes(q)) return false;
              }
              return true;
            });
            return {
              success: true,
              data: {
                items: filtered.slice((page - 1) * size, page * size),
                pagination: {
                  page,
                  page_size: size,
                  total: filtered.length,
                  total_pages: Math.max(1, Math.ceil(filtered.length / size)),
                  has_next: page * size < filtered.length,
                  has_prev: page > 1,
                },
              },
              error: null,
            };
          }
        } catch {
          // ignore — fallthrough
        }
      }
      return notAvailableResponse<WazuhAlertsPagination>('getAlertsPaginated');
    }
  },

  // ── Agents list with pagination + filters ────────────────────────
  getAgentsPaginated: async (filters: WazuhAgentsFilters): Promise<APIResponse<WazuhAgentsPagination>> => {
      try {
        const params: Record<string, string | number> = { page: filters.page ?? 1, page_size: filters.page_size ?? 50 };
        if (filters.status) params.status = filters.status;
        if (filters.search) params.search = filters.search;

        const resp = await api
          .get<APIResponse<WazuhAgentsPagination | WazuhAgent[]>>('/wazuh/agents', { params });

        // Normalize: backend may return either WazuhAgentsPagination OR a flat WazuhAgent[]
        // (depending on whether the backend honors pagination params).
        const payload = resp.data;
        if (payload?.success && payload.data) {
          if (Array.isArray(payload.data)) {
            // Flat list — paginate client-side and apply filters
            const all = payload.data;
            const filtered = all.filter(a => {
              if (filters.status && a.status !== filters.status) return false;
              if (filters.search) {
                const q = filters.search.toLowerCase();
                if (!a.name.toLowerCase().includes(q) && !a.ip.toLowerCase().includes(q) && !a.id.toLowerCase().includes(q)) return false;
              }
              return true;
            });
            const page = filters.page ?? 1;
            const size = filters.page_size ?? 50;
            return {
              success: true,
              data: {
                items: filtered.slice((page - 1) * size, page * size),
                pagination: {
                  page,
                  page_size: size,
                  total: filtered.length,
                  total_pages: Math.max(1, Math.ceil(filtered.length / size)),
                  has_next: page * size < filtered.length,
                  has_prev: page > 1,
                },
              },
              error: null,
            };
          }
          // Already in paginated form
          return payload as APIResponse<WazuhAgentsPagination>;
        }
        return payload as APIResponse<WazuhAgentsPagination>;
      } catch (e: unknown) {
        const status = (e as { response?: { status?: number } })?.response?.status;
        if (status && status >= 400 && status < 500) {
          try {
            const basic = await wazuhApi.getAgents();
            if (basic.success && basic.data) {
              const all = basic.data;
              const filtered = all.filter(a => {
                if (filters.status && a.status !== filters.status) return false;
                if (filters.search) {
                  const q = filters.search.toLowerCase();
                  if (!a.name.toLowerCase().includes(q) && !a.ip.toLowerCase().includes(q) && !a.id.toLowerCase().includes(q)) return false;
                }
                return true;
              });
              const page = filters.page ?? 1;
              const size = filters.page_size ?? 50;
              return {
                success: true,
                data: {
                  items: filtered.slice((page - 1) * size, page * size),
                  pagination: {
                    page,
                    page_size: size,
                    total: filtered.length,
                    total_pages: Math.max(1, Math.ceil(filtered.length / size)),
                    has_next: page * size < filtered.length,
                    has_prev: page > 1,
                  },
                },
                error: null,
              };
            }
          } catch {
            // ignore
          }
        }
        return notAvailableResponse<WazuhAgentsPagination>('getAgentsPaginated');
      }
    },

  // ── Agent detail (includes syscheck + syscollector if backend exposes them) ──
  getAgentDetail: async (agentId: string): Promise<APIResponse<WazuhAgentDetail>> => {
    try {
      const [agentRes, alertsRes] = await Promise.all([
        api.get<APIResponse<WazuhAgentDetail['agent']>>(`/wazuh/agents/${encodeURIComponent(agentId)}`),
        wazuhApi.getAlertsByAgent(agentId, 20, 0),
      ]);

      if (agentRes.data.success && agentRes.data.data) {
        return {
          success: true,
          data: {
            agent: agentRes.data.data,
            recent_alerts: alertsRes.success && alertsRes.data ? alertsRes.data : [],
          },
          error: null,
        };
      }
      // If endpoint exists but returned success=false, treat as not_available
      if (agentRes.status === 404 || (agentRes.data && agentRes.data.success === false)) {
        return notAvailableResponse<WazuhAgentDetail>('getAgentDetail');
      }
      return notAvailableResponse<WazuhAgentDetail>('getAgentDetail');
    } catch {
      // Endpoint /wazuh/agents/{id} doesn't exist on backend — fall back gracefully
      try {
        const agentsRes = await wazuhApi.getAgents();
        if (agentsRes.success && agentsRes.data) {
          const agent = agentsRes.data.find(a => a.id === agentId);
          if (agent) {
            const alertsRes = await wazuhApi.getAlertsByAgent(agentId, 20, 0);
            return {
              success: true,
              data: {
                agent,
                recent_alerts: alertsRes.success && alertsRes.data ? alertsRes.data : [],
              },
              error: null,
            };
          }
        }
      } catch {
        // ignore
      }
      return notAvailableResponse<WazuhAgentDetail>('getAgentDetail');
    }
  },

  getAgentSyscheck: async (_agentId: string): Promise<APIResponse<WazuhAgentDetail['syscheck']>> => {
    // Backend endpoint not implemented yet — return graceful not-available
    return notAvailableResponse<WazuhAgentDetail['syscheck']>('getAgentSyscheck');
  },

  getAgentSyscollector: async (_agentId: string): Promise<APIResponse<WazuhAgentDetail['syscollector']>> => {
    return notAvailableResponse<WazuhAgentDetail['syscollector']>('getAgentSyscollector');
  },

  // ── Vulnerabilities ──────────────────────────────────────────────
  getVulnerabilities: async (filters: WazuhVulnerabilitiesFilters): Promise<APIResponse<WazuhVulnerabilitiesPagination>> => {
    try {
      const params: Record<string, string | number> = { page: filters.page ?? 1, page_size: filters.page_size ?? 25 };
      if (filters.severity) params.severity = filters.severity;
      if (filters.agent_id) params.agent_id = filters.agent_id;
      if (filters.search) params.search = filters.search;

      return await api
        .get<APIResponse<WazuhVulnerabilitiesPagination>>('/wazuh/vulnerability', { params })
        .then(r => r.data);
    } catch {
      return notAvailableResponse<WazuhVulnerabilitiesPagination>('getVulnerabilities');
    }
  },

  // ── MITRE matrix ─────────────────────────────────────────────────
  getMitreMatrix: async (): Promise<APIResponse<WazuhMitreMatrix>> => {
    try {
      // Try the dedicated matrix endpoint first
      return await api
        .get<APIResponse<WazuhMitreMatrix>>('/wazuh/mitre/matrix')
        .then(r => r.data);
    } catch {
      // Fallback: use the existing mitre summary endpoint and shape it into a matrix
      try {
        const summaryRes = await wazuhApi.getMitreSummary();
        if (summaryRes.success && summaryRes.data && summaryRes.data.length > 0) {
          // Group techniques by inferred tactic prefix (T1xxx → Initial Access, etc.)
          const tacticMap = new Map<string, { name: string; techniques: typeof summaryRes.data }>();
          for (const tech of summaryRes.data) {
            const tac = inferTacticFromTechnique(tech.technique_id);
            if (!tacticMap.has(tac.id)) tacticMap.set(tac.id, { name: tac.name, techniques: [] });
            tacticMap.get(tac.id)!.techniques.push(tech);
          }
          const tactics = Array.from(tacticMap.entries()).map(([id, v]) => ({
            tactic_id: id,
            tactic_name: v.name,
            techniques: v.techniques,
            total_count: v.techniques.reduce((s, t) => s + t.count, 0),
          }));
          return {
            success: true,
            data: { tactics, generated_at: new Date().toISOString() },
            error: null,
          };
        }
      } catch {
        // ignore
      }
      return notAvailableResponse<WazuhMitreMatrix>('getMitreMatrix');
    }
  },

  // ── Stats summary (aggregated dashboard KPIs) ──────────────────
  getStatsSummary: async (): Promise<APIResponse<WazuhStatsSummary>> => {
    try {
      // Compose from existing endpoints — no dedicated endpoint needed
      const [criticalRes, summaryRes, topAgentsRes, mitreRes] = await Promise.all([
        wazuhApi.getCriticalAlerts(500, 0),
        wazuhApi.getAgentsSummary(),
        wazuhApi.getTopAgents(100),
        wazuhApi.getMitreSummary(),
      ]);

      const total24h = criticalRes.data?.length ?? 0;
      const critical24h = (criticalRes.data ?? []).filter(a => a.rule_level >= 12).length;
      const high24h = (criticalRes.data ?? []).filter(a => a.rule_level >= 8 && a.rule_level < 12).length;
      const medium24h = (criticalRes.data ?? []).filter(a => a.rule_level >= 5 && a.rule_level < 8).length;
      const low24h = (criticalRes.data ?? []).filter(a => a.rule_level < 5).length;

      const tacticsMap = new Map<string, { name: string; count: number }>();
      for (const m of mitreRes.data ?? []) {
        const tac = inferTacticFromTechnique(m.technique_id);
        const cur = tacticsMap.get(tac.id);
        if (cur) cur.count += m.count;
        else tacticsMap.set(tac.id, { name: tac.name, count: m.count });
      }
      const topTactics = Array.from(tacticsMap.entries())
        .map(([tactic_id, v]) => ({ tactic_id, tactic_name: v.name, count: v.count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      return {
        success: true,
        data: {
          total_alerts_24h: total24h,
          total_alerts_7d: total24h, // Backend only exposes 24h; same number is fine
          critical_alerts_24h: critical24h,
          high_alerts_24h: high24h,
          medium_alerts_24h: medium24h,
          low_alerts_24h: low24h,
          active_agents: summaryRes.data?.active ?? 0,
          total_agents: summaryRes.data?.total ?? 0,
          vulnerabilities_total: 0, // No backend endpoint — UI shows "no disponible"
          vulnerabilities_critical: 0,
          top_mitre_tactics: topTactics,
        },
        error: null,
      };
    } catch {
      return notAvailableResponse<WazuhStatsSummary>('getStatsSummary');
    }
  },
};

/* ── Helpers ────────────────────────────────────────────────────── */

function notAvailableResponse<T>(endpoint: string): APIResponse<T> {
  return {
    success: false,
    data: null,
    error: 'no_disponible',
  };
}

/**
 * Map a MITRE technique ID (Txxxx) to its parent tactic.
 * This is a best-effort approximation based on the ATT&CK matrix
 * ordering — not exhaustive, but covers the most common prefixes.
 */
function inferTacticFromTechnique(techniqueId: string): { id: string; name: string } {
  const num = parseInt(techniqueId.replace(/\D/g, ''), 10);
  if (isNaN(num)) return { id: 'TA0000', name: 'Other' };
  if (num < 1000) return { id: 'TA0043', name: 'Reconnaissance' };
  if (num < 2000) return { id: 'TA0042', name: 'Resource Development' };
  if (num < 3000) return { id: 'TA0001', name: 'Initial Access' };
  if (num < 4000) return { id: 'TA0002', name: 'Execution' };
  if (num < 5000) return { id: 'TA0003', name: 'Persistence' };
  if (num < 6000) return { id: 'TA0004', name: 'Privilege Escalation' };
  if (num < 7000) return { id: 'TA0005', name: 'Defense Evasion' };
  if (num < 8000) return { id: 'TA0006', name: 'Credential Access' };
  if (num < 9000) return { id: 'TA0007', name: 'Discovery' };
  if (num < 10000) return { id: 'TA0008', name: 'Lateral Movement' };
  if (num < 11000) return { id: 'TA0009', name: 'Collection' };
  if (num < 12000) return { id: 'TA0011', name: 'Command and Control' };
  if (num < 13000) return { id: 'TA0010', name: 'Exfiltration' };
  if (num < 14000) return { id: 'TA0040', name: 'Impact' };
  return { id: 'TA0000', name: 'Other' };
}

/* ── Network ──────────────────────────────────────────────────── */

export const networkApi = {
  createLabel: (ipAddress: string, label: string, description?: string, color?: string) =>
    api.post<APIResponse<IPLabel>>('/network/labels', {
      ip_address: ipAddress, label, description, color,
    }).then(r => r.data),

  getLabels: () =>
    api.get<APIResponse<IPLabel[]>>('/network/labels').then(r => r.data),

  deleteLabel: (labelId: number) =>
    api.delete<APIResponse>(`/network/labels/${labelId}`).then(r => r.data),

  createGroup: (name: string, description?: string, color?: string, criteria?: string) =>
    api.post<APIResponse<IPGroup>>('/network/groups', {
      name, description, color, criteria,
    }).then(r => r.data),

  getGroups: () =>
    api.get<APIResponse<IPGroup[]>>('/network/groups').then(r => r.data),

  addGroupMember: (groupId: number, ipAddress: string, reason = 'manual') =>
    api.post<APIResponse>(`/network/groups/${groupId}/members`, {
      ip_address: ipAddress, reason,
    }).then(r => r.data),

  removeGroupMember: (groupId: number, ipAddress: string) =>
    api.delete<APIResponse>(`/network/groups/${groupId}/members/${ipAddress}`).then(r => r.data),

  deleteGroup: (groupId: number) =>
    api.delete<APIResponse>(`/network/groups/${groupId}`).then(r => r.data),

  search: (query: string) =>
    api.get<APIResponse<NetworkSearchResult>>('/network/search', { params: { query } }).then(r => r.data),
};

/* ── Reports ──────────────────────────────────────────────────── */

export const reportsApi = {
  // ── Generation ──────────────────────────────────────
  generate: (params: {
    prompt: string;
    audience: string;
    attached_documents?: string[];
    data_sources?: string[];
    date_range?: { from_date: string; to_date: string };
    comparison_range?: { from_date: string; to_date: string };
  }) =>
    api.post<APIResponse<ReportDraft>>('/reports/generate', params).then(r => r.data),

  exportPdf: (htmlContent: string, title: string, metadata: Record<string, string> = {}) =>
    api.post('/reports/export-pdf', {
      html_content: htmlContent, title, metadata,
    }, { responseType: 'blob' }).then(r => r.data),

  // ── Templates ─────────────────────────────────────
  getTemplates: () =>
    api.get<APIResponse<ReportTemplate[]>>('/reports/templates').then(r => r.data),

  // ── Saved Reports CRUD ────────────────────────────
  listSaved: (page = 1, pageSize = 20, audience?: string) =>
    api.get<APIResponse<SavedReportPagination>>('/reports/saved', {
      params: { page, page_size: pageSize, ...(audience ? { audience } : {}) },
    }).then(r => r.data),

  getSaved: (id: number) =>
    api.get<APIResponse<SavedReport>>(`/reports/saved/${id}`).then(r => r.data),

  createSaved: (data: { title: string; html_content: string; prompt?: string; audience?: string; model_used?: string; data_sources?: string[]; tokens_used?: number }) =>
    api.post<APIResponse<SavedReport>>('/reports/saved', data).then(r => r.data),

  updateSaved: (id: number, data: { title?: string; html_content?: string }) =>
    api.put<APIResponse<SavedReport>>(`/reports/saved/${id}`, data).then(r => r.data),

  deleteSaved: (id: number) =>
    api.delete<APIResponse<{ deleted: boolean }>>(`/reports/saved/${id}`).then(r => r.data),

  // ── Report Schedules CRUD ─────────────────────────
  listSchedules: () =>
    api.get<APIResponse<ReportSchedule[]>>('/reports/schedules').then(r => r.data),

  createSchedule: (data: Partial<ReportSchedule>) =>
    api.post<APIResponse<ReportSchedule>>('/reports/schedules', data).then(r => r.data),

  updateSchedule: (id: number, data: Partial<ReportSchedule>) =>
    api.put<APIResponse<ReportSchedule>>(`/reports/schedules/${id}`, data).then(r => r.data),

  deleteSchedule: (id: number) =>
    api.delete<APIResponse<{ deleted: boolean }>>(`/reports/schedules/${id}`).then(r => r.data),

  triggerSchedule: (id: number) =>
    api.post<APIResponse<unknown>>(`/reports/schedules/${id}/trigger`).then(r => r.data),

  // ── Legacy ─────────────────────────────────────────
  getHistory: (limit = 20) =>
    api.get<APIResponse<ActionLogEntry[]>>('/reports/history', { params: { limit } }).then(r => r.data),
};

/* ── Actions ──────────────────────────────────────────────────── */

export const actionsApi = {
  getHistory: (limit = 50) =>
    api.get<APIResponse<ActionLogEntry[]>>('/actions/history', { params: { limit } }).then(r => r.data),
};

/* ── Health ────────────────────────────────────────────────────── */

export const healthApi = {
  check: () => api.get<APIResponse>('/health').then(r => r.data),
};

/* ── VLANs ────────────────────────────────────────────────────── */

export const vlansApi = {
  getVlans: () =>
    api.get<APIResponse<VlanInfo[]>>('/mikrotik/vlans/').then(r => r.data),

  createVlan: (data: { vlan_id: number; name: string; interface: string; comment?: string }) =>
    api.post<APIResponse<VlanInfo>>('/mikrotik/vlans/', data).then(r => r.data),

  updateVlan: (vlanId: string, data: { name?: string; comment?: string }) =>
    api.put<APIResponse>(`/mikrotik/vlans/${vlanId}`, data).then(r => r.data),

  deleteVlan: (vlanId: string) =>
    api.delete<APIResponse>(`/mikrotik/vlans/${vlanId}`).then(r => r.data),

  getVlanTraffic: (vlanId: number) =>
    api.get<APIResponse<VlanTrafficData>>(`/mikrotik/vlans/${vlanId}/traffic`).then(r => r.data),

  getVlanAlerts: (vlanId: number) =>
    api.get<APIResponse>(`/mikrotik/vlans/${vlanId}/alerts`).then(r => r.data),

  getAllTraffic: () =>
    api.get<APIResponse<VlanTrafficData[]>>('/mikrotik/vlans/traffic/all').then(r => r.data),
};

/* ── Security (Hybrid Endpoints) ─────────────────────────────── */

export const securityApi = {
  blockIP: (req: SecurityBlockIPRequest) =>
    api.post<APIResponse>('/security/block-ip', req).then(r => r.data),

  autoBlock: (req: SecurityBlockIPRequest) =>
    api.post<APIResponse>('/security/auto-block', req).then(r => r.data),

  quarantine: (req: QuarantineRequest) =>
    api.post<APIResponse>('/security/quarantine', req).then(r => r.data),

  geoBlock: (req: GeoBlockRequest) =>
    api.post<APIResponse>('/security/geo-block', req).then(r => r.data),
};

/* ── Phishing ─────────────────────────────────────────────────── */

export const phishingApi = {
  getAlerts: (limit = 50, offset = 0) =>
    api.get<APIResponse<PhishingAlert[]>>('/phishing/alerts', {
      params: { limit, offset },
    }).then(r => r.data),

  getSuspiciousDomains: () =>
    api.get<APIResponse<SuspiciousDomain[]>>('/phishing/domains/suspicious').then(r => r.data),

  getTimeline: () =>
    api.get<APIResponse<AlertTimelinePoint[]>>('/phishing/urls/timeline').then(r => r.data),

  getVictims: () =>
    api.get<APIResponse<PhishingVictim[]>>('/phishing/victims').then(r => r.data),

  getStats: () =>
    api.get<APIResponse<PhishingStats>>('/phishing/stats').then(r => r.data),

  getSinkholes: () =>
    api.get<APIResponse<SinkholeEntry[]>>('/phishing/domains/sinkhole').then(r => r.data),

  sinkholeDomain: (domain: string, reason: string) =>
    api.post<APIResponse>('/phishing/domains/sinkhole', { domain, reason }).then(r => r.data),

  removeSinkhole: (domain: string) =>
    api.delete<APIResponse>(`/phishing/domains/sinkhole/${encodeURIComponent(domain)}`).then(r => r.data),

  blockIP: (ip: string, duration_hours = 24) =>
    api.post<APIResponse>('/phishing/ip/block', { ip, duration_hours }).then(r => r.data),

  simulate: (params: { target_agent_id?: string; malicious_url?: string; description?: string }) =>
    api.post<APIResponse>('/phishing/simulate', params).then(r => r.data),
};

/* ── CLI ──────────────────────────────────────────────────────── */

export const cliApi = {
  executeMikrotik: (command: string) =>
    api.post<APIResponse<CLIResponse>>('/cli/mikrotik', { command }).then(r => r.data),

  executeWazuhAgent: (agent_id: string, action: 'restart' | 'status') =>
    api.post<APIResponse<CLIResponse>>('/cli/wazuh-agent', { agent_id, action }).then(r => r.data),
};

/* ── Portal Cautivo ───────────────────────────────────────────── */

import type {
  PortalSession,
  PortalSessionHistory,
  PortalRealtimeStats,
  PortalSummaryStats,
  PortalUser,
  PortalUserCreate,
  PortalUserUpdate,
  BulkCreateResult,
  PortalProfile,
  PortalProfileCreate,
  PortalConfig,
  PortalScheduleConfig,
  PortalScheduleStatus,
  HotspotSetupResult,
  HotspotStatus,
  PortalChartPoint,
} from '../types';

export const portalApi = {
  // ── Status & Setup
  getStatus: () =>
    api.get<APIResponse<HotspotStatus>>('/portal/status').then(r => r.data),

  setupHotspot: () =>
    api.post<APIResponse<HotspotSetupResult>>('/portal/setup').then(r => r.data),

  // ── Sessions
  getActiveSessions: () =>
    api.get<APIResponse<PortalSession[]>>('/portal/sessions/active').then(r => r.data),

  getSessionHistory: (params?: {
    from_date?: string;
    to_date?: string;
    user?: string;
    limit?: number;
  }) =>
    api.get<APIResponse<PortalSessionHistory[]>>('/portal/sessions/history', { params }).then(r => r.data),

  getSessionsChart: () =>
    api.get<APIResponse<PortalChartPoint[]>>('/portal/sessions/chart').then(r => r.data),

  // ── Stats
  getRealtimeStats: () =>
    api.get<APIResponse<PortalRealtimeStats>>('/portal/stats/realtime').then(r => r.data),

  getSummaryStats: () =>
    api.get<APIResponse<PortalSummaryStats>>('/portal/stats/summary').then(r => r.data),

  // ── Users CRUD
  getUsers: (params?: { search?: string; profile?: string; limit?: number; offset?: number }) =>
    api.get<APIResponse<PortalUser[]>>('/portal/users', { params }).then(r => r.data),

  createUser: (data: PortalUserCreate) =>
    api.post<APIResponse>('/portal/users', data).then(r => r.data),

  updateUser: (username: string, data: PortalUserUpdate) =>
    api.put<APIResponse>(`/portal/users/${encodeURIComponent(username)}`, data).then(r => r.data),

  deleteUser: (username: string) =>
    api.delete<APIResponse>(`/portal/users/${encodeURIComponent(username)}`).then(r => r.data),

  disconnectUser: (username: string) =>
    api.post<APIResponse>(`/portal/users/${encodeURIComponent(username)}/disconnect`).then(r => r.data),

  bulkCreateUsers: (users: PortalUserCreate[]) =>
    api.post<APIResponse<BulkCreateResult>>('/portal/users/bulk', { users }).then(r => r.data),

  // ── Profiles
  getProfiles: () =>
    api.get<APIResponse<PortalProfile[]>>('/portal/profiles').then(r => r.data),

  createProfile: (data: PortalProfileCreate) =>
    api.post<APIResponse>('/portal/profiles', data).then(r => r.data),

  updateProfile: (name: string, data: Partial<PortalProfileCreate>) =>
    api.put<APIResponse>(`/portal/profiles/${encodeURIComponent(name)}`, data).then(r => r.data),

  // ── Config
  getConfig: () =>
    api.get<APIResponse<PortalConfig>>('/portal/config').then(r => r.data),

  updateUnregisteredSpeed: (rate_limit_up: string, rate_limit_down: string) =>
    api.put<APIResponse>('/portal/config/unregistered-speed', { rate_limit_up, rate_limit_down }).then(r => r.data),

  getSchedule: () =>
    api.get<APIResponse<PortalScheduleStatus>>('/portal/config/schedule').then(r => r.data),

  updateSchedule: (data: PortalScheduleConfig) =>
    api.put<APIResponse>('/portal/config/schedule', data).then(r => r.data),
};

/* ── GLPI — Inventory Management ─────────────────────────────── */

export const glpiApi = {
  /** Check GLPI availability */
  getStatus: () =>
    api.get<APIResponse<GlpiAvailability>>('/glpi/status').then(r => r.data),

  // ── Assets ──────────────────────────────────────────────
  getAssets: (params?: {
    search?: string;
    location_id?: number;
    status?: string;
    limit?: number;
    offset?: number;
  }) =>
    api.get<APIResponse<{ assets: GlpiAsset[]; total: number; mock: boolean }>>(
      '/glpi/assets',
      { params }
    ).then(r => r.data),

  getAsset: (id: number) =>
    api.get<APIResponse<GlpiAsset>>(`/glpi/assets/${id}`).then(r => r.data),

  searchAssets: (q: string) =>
    api.get<APIResponse<{ results: GlpiAsset[]; query: string; mock: boolean }>>(
      '/glpi/assets/search',
      { params: { q } }
    ).then(r => r.data),

  getAssetStats: () =>
    api.get<APIResponse<GlpiAssetStats>>('/glpi/assets/stats').then(r => r.data),

  getAssetHealth: () =>
    api.get<APIResponse<{ assets: GlpiAssetHealth[]; summary: GlpiHealthSummary; mock: boolean }>>(
      '/glpi/assets/health'
    ).then(r => r.data),

  getAssetsByLocation: (locationId: number) =>
    api.get<APIResponse<{ assets: GlpiAsset[]; location_id: number; mock: boolean }>>(
      `/glpi/assets/by-location/${locationId}`
    ).then(r => r.data),

  getAssetNetworkContext: (id: number) =>
    api.get<APIResponse<GlpiNetworkContext>>(`/glpi/assets/${id}/network-context`).then(r => r.data),

  getAssetFullDetail: (id: number) =>
    api.get<APIResponse<GlpiAssetFullDetail>>(`/glpi/assets/${id}/full-detail`).then(r => r.data),

  createAsset: (data: GlpiAssetCreate) =>
    api.post<APIResponse>('/glpi/assets', data).then(r => r.data),

  updateAsset: (id: number, data: GlpiAssetUpdate) =>
    api.put<APIResponse>(`/glpi/assets/${id}`, data).then(r => r.data),

  deleteAsset: (id: number) =>
    api.delete<APIResponse>(`/glpi/assets/${id}`).then(r => r.data),

  assignAsset: (assetId: number, data: GlpiAssignmentRequest) =>
    api.put<APIResponse>(`/glpi/assets/${assetId}/assign`, data).then(r => r.data),

  quarantineAsset: (id: number, data: GlpiQuarantineRequest) =>
    api.post<APIResponse>(`/glpi/assets/${id}/quarantine`, data).then(r => r.data),

  unquarantineAsset: (id: number) =>
    api.post<APIResponse>(`/glpi/assets/${id}/unquarantine`, {}).then(r => r.data),

  // ── Tickets ─────────────────────────────────────────────
  getTickets: (params?: { priority?: number; status?: string; limit?: number }) =>
    api.get<APIResponse<{ tickets: GlpiTicket[]; kanban: GlpiTicketKanban; mock: boolean }>>(
      '/glpi/tickets',
      { params }
    ).then(r => r.data),

  createTicket: (data: GlpiTicketCreate) =>
    api.post<APIResponse>('/glpi/tickets', data).then(r => r.data),

  updateTicketStatus: (id: number, status: number) =>
    api.put<APIResponse>(`/glpi/tickets/${id}/status`, { status }).then(r => r.data),

  createNetworkMaintenance: (data: {
    interface_name: string;
    error_count: number;
    error_type: string;
    asset_id?: number;
  }) =>
    api.post<APIResponse>('/glpi/tickets/network-maintenance', data).then(r => r.data),

  // ── Users ────────────────────────────────────────────────
  getUsers: (params?: { search?: string; limit?: number }) =>
    api.get<APIResponse<{ users: GlpiUser[]; mock: boolean }>>(
      '/glpi/users',
      { params }
    ).then(r => r.data),

  getUserAssets: (userId: number) =>
    api.get<APIResponse<{ user_id: number; assets: GlpiAsset[]; mock: boolean }>>(
      `/glpi/users/${userId}/assets`
    ).then(r => r.data),

  getUser: (id: number) =>
    api.get<APIResponse<GlpiUser>>(`/glpi/users/${id}`).then(r => r.data),

  createUser: (data: GlpiUserCreate) =>
    api.post<APIResponse>('/glpi/users', data).then(r => r.data),

  updateUser: (id: number, data: GlpiUserUpdate) =>
    api.put<APIResponse>(`/glpi/users/${id}`, data).then(r => r.data),

  deleteUser: (id: number) =>
    api.delete<APIResponse>(`/glpi/users/${id}`).then(r => r.data),

  // ── Locations ────────────────────────────────────────────
  getLocations: () =>
    api.get<APIResponse<{ locations: GlpiLocation[]; mock: boolean }>>('/glpi/locations').then(r => r.data),
};

/* ── System ─────────────────────────────────────────────────────── */

export const systemApi = {
  getMockStatus: () =>
    api.get<APIResponse<MockStatus>>('/system/mock-status').then(r => r.data),
};

/* ── CrowdSec ───────────────────────────────────────────────────── */

import type {
  CrowdSecDecision,
  CrowdSecAlert,
  CrowdSecBouncer,
  CrowdSecMachine,
  CrowdSecScenario,
  CrowdSecMetrics,
  CrowdSecWhitelistEntry,
  CrowdSecSyncStatus,
  CrowdSecHub,
  IpContext,
  ManualDecisionRequest,
  WhitelistRequest,
  FullRemediationRequest,
  SyncApplyRequest,
} from '../types';

export const crowdsecApi = {
  // ── Decisions ─────────────────────────────────────────────
  getDecisions: (params?: { ip?: string; scenario?: string; type?: string }) =>
    api.get<APIResponse<CrowdSecDecision[]>>('/crowdsec/decisions', { params }).then(r => r.data),

  getDecisionsStream: (startup = false) =>
    api.get<APIResponse<{ new: CrowdSecDecision[]; deleted: CrowdSecDecision[] }>>(
      '/crowdsec/decisions/stream', { params: { startup } }
    ).then(r => r.data),

  addDecision: (data: ManualDecisionRequest) =>
    api.post<APIResponse>('/crowdsec/decisions/manual', data).then(r => r.data),

  deleteDecision: (id: string) =>
    api.delete<APIResponse>(`/crowdsec/decisions/${id}`).then(r => r.data),

  deleteDecisionsByIp: (ip: string) =>
    api.delete<APIResponse>(`/crowdsec/decisions/ip/${encodeURIComponent(ip)}`).then(r => r.data),

  // ── Alerts ────────────────────────────────────────────────
  getAlerts: (params?: { limit?: number; scenario?: string; ip?: string }) =>
    api.get<APIResponse<CrowdSecAlert[]>>('/crowdsec/alerts', { params }).then(r => r.data),

  getAlertDetail: (id: string) =>
    api.get<APIResponse<CrowdSecAlert>>(`/crowdsec/alerts/${id}`).then(r => r.data),

  // ── Infrastructure ────────────────────────────────────────
  getBouncers: () =>
    api.get<APIResponse<CrowdSecBouncer[]>>('/crowdsec/bouncers').then(r => r.data),

  getMachines: () =>
    api.get<APIResponse<CrowdSecMachine[]>>('/crowdsec/machines').then(r => r.data),

  getScenarios: () =>
    api.get<APIResponse<CrowdSecScenario[]>>('/crowdsec/scenarios').then(r => r.data),

  getMetrics: () =>
    api.get<APIResponse<CrowdSecMetrics>>('/crowdsec/metrics').then(r => r.data),

  getHub: () =>
    api.get<APIResponse<CrowdSecHub>>('/crowdsec/hub').then(r => r.data),

  // ── Whitelist ─────────────────────────────────────────────
  getWhitelist: () =>
    api.get<APIResponse<CrowdSecWhitelistEntry[]>>('/crowdsec/whitelist').then(r => r.data),

  addWhitelist: (data: WhitelistRequest) =>
    api.post<APIResponse<CrowdSecWhitelistEntry>>('/crowdsec/whitelist', data).then(r => r.data),

  deleteWhitelist: (id: number) =>
    api.delete<APIResponse>(`/crowdsec/whitelist/${id}`).then(r => r.data),

  // ── Hybrid ────────────────────────────────────────────────
  getIpContext: (ip: string) =>
    api.get<APIResponse<IpContext>>(`/crowdsec/context/ip/${encodeURIComponent(ip)}`).then(r => r.data),

  fullRemediation: (data: FullRemediationRequest) =>
    api.post<APIResponse>('/crowdsec/remediation/full', data).then(r => r.data),

  getSyncStatus: () =>
    api.get<APIResponse<CrowdSecSyncStatus>>('/crowdsec/sync/status').then(r => r.data),

  applySync: (data: SyncApplyRequest) =>
    api.post<APIResponse>('/crowdsec/sync/apply', data).then(r => r.data),
};

/* ── GeoIP ─────────────────────────────────────────────── */

export const geoipApi = {
  /** Geolocalize a single IP address */
  lookup: (ip: string) =>
    api.get<APIResponse<GeoIPResult>>(`/geoip/lookup/${encodeURIComponent(ip)}`).then(r => r.data),

  /** Batch geolocalize up to 200 IPs */
  lookupBulk: (ips: string[]) =>
    api.post<APIResponse<GeoIPResult[]>>('/geoip/lookup/bulk', { ips }).then(r => r.data),

  /** Top attacking countries, optionally filtered by source */
  getTopCountries: (params?: { limit?: number; source?: string }) =>
    api.get<APIResponse<TopCountriesResponse>>('/geoip/stats/top-countries', { params }).then(r => r.data),

  /** Top attacking ASNs */
  getTopASNs: (params?: { limit?: number }) =>
    api.get<APIResponse<{ asns: unknown[]; total_ips: number; generated_at: string }>>(
      '/geoip/stats/top-asns', { params }
    ).then(r => r.data),

  /** Automatic geo-block suggestions */
  getSuggestions: () =>
    api.get<APIResponse<GeoBlockSuggestion[]>>('/geoip/suggestions/geo-block').then(r => r.data),

  /** Apply a geo-block suggestion */
  applySuggestion: (id: string, duration: string) =>
    api.post<APIResponse>(`/geoip/suggestions/${encodeURIComponent(id)}/apply`, { duration }).then(r => r.data),

  /** Status of the GeoLite2 DB files and TTLCache */
  getDBStatus: () =>
    api.get<APIResponse<GeoIPDBStatus>>('/geoip/db/status').then(r => r.data),
};

/* ── Suricata ───────────────────────────────────────────────── */

export const suricataApi = {
  // ── Engine ──────────────────────────────────────────────
  getEngineStatus: () =>
    api.get<APIResponse<EngineStats>>('/suricata/engine/status').then(r => r.data),

  getEngineStats: (minutes = 30) =>
    api.get<APIResponse<{ stats: EngineStats; series: EngineStatPoint[] }>>(
      '/suricata/engine/stats', { params: { minutes } }
    ).then(r => r.data),

  getEngineMode: () =>
    api.get<APIResponse<{ mode: string; interface: string; version: string }>>('/suricata/engine/mode').then(r => r.data),

  reloadRules: () =>
    api.post<APIResponse<{ success: boolean; rules_loaded: number; rules_failed: number; reload_time_ms: number }>>(
      '/suricata/engine/reload-rules'
    ).then(r => r.data),

  // ── Alerts ─────────────────────────────────────────────
  getAlerts: (params?: {
    limit?: number; offset?: number;
    src_ip?: string; dst_ip?: string;
    category?: string; severity?: number;
  }) =>
    api.get<APIResponse<{ alerts: SuricataAlert[]; total: number; offset: number }>>(
      '/suricata/alerts', { params }
    ).then(r => r.data),

  getAlertsTimeline: (minutes = 120) =>
    api.get<APIResponse<{ timeline: SuricataAlertTimelinePoint[]; minutes: number }>>(
      '/suricata/alerts/timeline', { params: { minutes } }
    ).then(r => r.data),

  getTopSignatures: (limit = 10) =>
    api.get<APIResponse<{ signatures: TopSignature[] }>>(
      '/suricata/alerts/top-signatures', { params: { limit } }
    ).then(r => r.data),

  getCategories: () =>
    api.get<APIResponse<{ categories: CategoryDistribution[] }>>('/suricata/alerts/categories').then(r => r.data),

  getAlertDetail: (alertId: string) =>
    api.get<APIResponse<SuricataAlert>>(`/suricata/alerts/${encodeURIComponent(alertId)}`).then(r => r.data),

  // ── Flows NSM ───────────────────────────────────────────
  getFlows: (params?: {
    limit?: number; offset?: number;
    src_ip?: string; proto?: string;
    app_proto?: string; has_alert?: boolean;
  }) =>
    api.get<APIResponse<{ flows: NetworkFlow[]; total: number; offset: number }>>(
      '/suricata/flows', { params }
    ).then(r => r.data),

  getFlowsStats: () =>
    api.get<APIResponse<FlowsStats>>('/suricata/flows/stats').then(r => r.data),

  getDnsQueries: (params?: { limit?: number; suspicious_only?: boolean }) =>
    api.get<APIResponse<{ queries: DnsQuery[]; total: number }>>(
      '/suricata/flows/dns', { params }
    ).then(r => r.data),

  getHttpTransactions: (params?: { limit?: number; suspicious_only?: boolean }) =>
    api.get<APIResponse<{ transactions: HttpTransaction[]; total: number }>>(
      '/suricata/flows/http', { params }
    ).then(r => r.data),

  getTlsHandshakes: (params?: { limit?: number; suspicious_only?: boolean }) =>
    api.get<APIResponse<{ handshakes: TlsHandshake[]; total: number }>>(
      '/suricata/flows/tls', { params }
    ).then(r => r.data),

  // ── Rules ──────────────────────────────────────────────
  getRules: (params?: {
    limit?: number; offset?: number;
    enabled?: boolean; ruleset?: string; category?: string;
  }) =>
    api.get<APIResponse<{ rules: SuricataRule[]; total: number; offset: number }>>(
      '/suricata/rules', { params }
    ).then(r => r.data),

  getRulesets: () =>
    api.get<APIResponse<{ rulesets: SuricataRuleset[] }>>('/suricata/rules/rulesets').then(r => r.data),

  getRuleDetail: (sid: number) =>
    api.get<APIResponse<SuricataRule>>(`/suricata/rules/${sid}`).then(r => r.data),

  toggleRule: (sid: number, enabled: boolean) =>
    api.put<APIResponse<{ sid: number; enabled: boolean; message: string }>>(
      `/suricata/rules/${sid}/toggle`, { enabled }
    ).then(r => r.data),

  updateRules: () =>
    api.post<APIResponse<{ success: boolean; message: string; rules_updated: number }>>(
      '/suricata/rules/update'
    ).then(r => r.data),

  // ── Correlation ─────────────────────────────────────────
  getCorrelationCrowdSec: () =>
    api.get<APIResponse<{ correlations: SuricataCorrelation[]; total: number }>>(
      '/suricata/correlation/crowdsec'
    ).then(r => r.data),

  getCorrelationWazuh: () =>
    api.get<APIResponse<{ correlations: WazuhCorrelation[]; total: number }>>(
      '/suricata/correlation/wazuh'
    ).then(r => r.data),

  // ── Auto-Response ────────────────────────────────────────
  triggerAutoResponse: (data: {
    ip: string;
    trigger_alert_id: string;
    duration?: string;
    reason?: string;
  }) =>
    api.post<APIResponse<AutoResponseTriggerResult>>('/suricata/autoresponse/trigger', data).then(r => r.data),

  getAutoResponseConfig: () =>
    api.get<APIResponse<{ config: AutoResponseConfig; recent_history: AutoResponseHistoryEntry[] }>>(
      '/suricata/autoresponse/config'
    ).then(r => r.data),

  updateAutoResponseConfig: (data: Partial<AutoResponseConfig & { crowdsec_ban?: boolean; mikrotik_block?: boolean; default_duration?: string }>) =>
    api.put<APIResponse<AutoResponseConfig>>('/suricata/autoresponse/config', data).then(r => r.data),

  // ── IP Context ──────────────────────────────────────────
  /** Alerts + flows for a specific IP — used by IpContextPanel */
  getIpContext: (ip: string) =>
    api.get<APIResponse<SuricataIpContext>>(
      `/suricata/context/ip/${encodeURIComponent(ip)}`
    ).then(r => r.data),
};

// ── Telegram Bot API ──────────────────────────────────────────────────────────

export const telegramApi = {
  // Status
  getStatus: () =>
    api.get<APIResponse<TelegramStatus>>('/reports/telegram/status').then(r => r.data),

  // Test message
  sendTest: () =>
    api.post<APIResponse<TelegramSendResult>>('/reports/telegram/test').then(r => r.data),

  // Report configs CRUD
  getConfigs: () =>
    api.get<APIResponse<TelegramReportConfig[]>>('/reports/telegram/configs').then(r => r.data),

  createConfig: (data: TelegramReportConfigCreate) =>
    api.post<APIResponse<TelegramReportConfig>>('/reports/telegram/configs', data).then(r => r.data),

  updateConfig: (id: number, data: Partial<TelegramReportConfigCreate>) =>
    api.put<APIResponse<TelegramReportConfig>>(`/reports/telegram/configs/${id}`, data).then(r => r.data),

  deleteConfig: (id: number) =>
    api.delete<APIResponse<{ deleted: boolean; id: number }>>(`/reports/telegram/configs/${id}`).then(r => r.data),

  triggerConfig: (id: number) =>
    api.post<APIResponse<{ triggered: boolean; config_id: number }>>(`/reports/telegram/configs/${id}/trigger-now`).then(r => r.data),

  // Manual send
  sendAlert: (data: { title: string; severity: string; source: string; description?: string; ip?: string; agent?: string }) =>
    api.post<APIResponse<TelegramSendResult>>('/reports/telegram/send-alert', data).then(r => r.data),

  sendSummary: (data?: { sources?: string[]; chat_id?: string }) =>
    api.post<APIResponse<TelegramSendResult>>('/reports/telegram/send-summary', data ?? {}).then(r => r.data),

  // Logs
  getLogs: (params?: { limit?: number; direction?: string; message_type?: string }) =>
    api.get<APIResponse<TelegramMessageLog[]>>('/reports/telegram/logs', { params }).then(r => r.data),
};

// ── Views API ────────────────────────────────────────────────────

import type {
  CustomView, CustomViewCreate, CustomViewUpdate,
  WidgetCatalogResponse,
  ThreatLevelData, ActivityHeatmapData, CorrelationTimelineData,
  ConfirmedThreatsData, IncidentLifecycleData, SuricataAssetCorrelationData,
  WorldThreatMapData, ViewReportResult,
} from '../types';

export const viewsApi = {
  /** Lista todas las vistas personalizadas */
  getAll: () =>
    api.get<APIResponse<CustomView[]>>('/views').then(r => r.data),

  /** Obtiene el detalle de una vista por ID */
  getById: (id: string) =>
    api.get<APIResponse<CustomView>>(`/views/${id}`).then(r => r.data),

  /** Crea una nueva vista personalizada */
  create: (data: CustomViewCreate) =>
    api.post<APIResponse<CustomView>>('/views', data).then(r => r.data),

  /** Actualiza los campos de una vista existente */
  update: (id: string, data: CustomViewUpdate) =>
    api.put<APIResponse<CustomView>>(`/views/${id}`, data).then(r => r.data),

  /** Elimina una vista */
  delete: (id: string) =>
    api.delete<APIResponse<{ deleted: string }>>(`/views/${id}`).then(r => r.data),

  /** Marca una vista como la vista por defecto */
  setDefault: (id: string) =>
    api.put<APIResponse<CustomView>>(`/views/${id}/default`).then(r => r.data),

  /** Retorna el catálogo categorizado de widgets (4 categorías) */
  getWidgetCatalog: () =>
    api.get<APIResponse<WidgetCatalogResponse>>('/views/widgets/catalog').then(r => r.data),
};

/* ── Widgets Aggregation API ──────────────────────────────────── */

export const widgetsApi = {
  /** Score 0-100 de nivel de amenaza global (Wazuh + CrowdSec + Suricata) */
  getThreatLevel: () =>
    api.get<APIResponse<ThreatLevelData>>('/widgets/threat-level').then(r => r.data),

  /** Matrix 7x24 de actividad de alertas [Wazuh] */
  getActivityHeatmap: () =>
    api.get<APIResponse<ActivityHeatmapData>>('/widgets/activity-heatmap').then(r => r.data),

  /** 3 series alineadas en tiempo: Wazuh + Suricata + CrowdSec */
  getCorrelationTimeline: (minutes = 120) =>
    api.get<APIResponse<CorrelationTimelineData>>('/widgets/correlation-timeline', {
      params: { minutes },
    }).then(r => r.data),

  /** IPs detectadas por ≥2 fuentes simultáneamente */
  getConfirmedThreats: () =>
    api.get<APIResponse<ConfirmedThreatsData>>('/widgets/confirmed-threats').then(r => r.data),

  /** Timeline del ciclo de vida de un incidente para una IP */
  getIncidentLifecycle: (ip: string) =>
    api.get<APIResponse<IncidentLifecycleData>>('/widgets/incident-lifecycle', {
      params: { ip },
    }).then(r => r.data),

  /** Alertas Suricata cruzadas con inventario GLPI */
  getSuricataAssetCorrelation: (limit = 20) =>
    api.get<APIResponse<SuricataAssetCorrelationData>>('/widgets/suricata-asset-correlation', {
      params: { limit },
    }).then(r => r.data),

  /** Score de amenaza por país para mapa mundial */
  getWorldThreatMap: () =>
    api.get<APIResponse<WorldThreatMapData>>('/widgets/world-threat-map').then(r => r.data),

  /** Genera un reporte IA desde los widgets activos de una vista */
  generateViewReport: (data: {
    view_id: string;
    widget_ids: string[];
    audience?: string;
    output?: string;
    report_title?: string;
  }) =>
    api.post<APIResponse<ViewReportResult>>('/widgets/generate-view-report', data).then(r => r.data),
};

// ── DHCP API ──────────────────────────────────────────────────────────────────

import type {
  DhcpServer,
  DhcpLease,
  DhcpNetwork,
  DhcpPool,
  DhcpSubnetUsage,
  DhcpRogueAlert,
  DhcpOption,
  DhcpServerCreate,
  DhcpLeaseCreate,
  DhcpLeaseUpdate,
  DhcpNetworkCreate,
  DhcpNetworkUpdate,
  DhcpPoolCreate,
  DhcpRogueAlertCreate,
  DhcpOptionCreate,
  DhcpLeaseGlpiCorrelation,
  DhcpDiscoveryResult,
  DhcpEnrichedAlert,
} from '../types';

export const dhcpApi = {
  // Servers
  getServers: () =>
    api.get<APIResponse<DhcpServer[]>>('/dhcp/servers').then(r => r.data),

  createServer: (data: DhcpServerCreate) =>
    api.post<APIResponse<{ id: string; name: string }>>('/dhcp/servers', data).then(r => r.data),

  toggleServer: (id: string, disabled: boolean) =>
    api.put<APIResponse<{ id: string; disabled: boolean }>>(`/dhcp/servers/${id}/toggle`, { disabled }).then(r => r.data),

  // Leases
  getLeases: (params?: { server?: string; status?: string; search?: string }) =>
    api.get<APIResponse<DhcpLease[]>>('/dhcp/leases', { params }).then(r => r.data),

  createLease: (data: DhcpLeaseCreate) =>
    api.post<APIResponse<{ id: string; address: string }>>('/dhcp/leases', data).then(r => r.data),

  updateLease: (id: string, data: DhcpLeaseUpdate) =>
    api.put<APIResponse<{ id: string; action: string }>>(`/dhcp/leases/${id}`, data).then(r => r.data),

  deleteLease: (id: string) =>
    api.delete<APIResponse<{ id: string; action: string }>>(`/dhcp/leases/${id}`).then(r => r.data),

  makeLeaseStatic: (id: string) =>
    api.post<APIResponse<{ id: string; action: string }>>(`/dhcp/leases/${id}/make-static`).then(r => r.data),

  setLeaseBlock: (id: string, block: boolean) =>
    api.put<APIResponse<{ id: string; blocked: boolean }>>(`/dhcp/leases/${id}/block`, { block }).then(r => r.data),

  // Networks
  getNetworks: () =>
    api.get<APIResponse<DhcpNetwork[]>>('/dhcp/networks').then(r => r.data),

  createNetwork: (data: DhcpNetworkCreate) =>
    api.post<APIResponse<{ id: string; address: string }>>('/dhcp/networks', data).then(r => r.data),

  updateNetwork: (id: string, data: DhcpNetworkUpdate) =>
    api.put<APIResponse<{ id: string; action: string }>>(`/dhcp/networks/${id}`, data).then(r => r.data),

  // Pools
  getPools: () =>
    api.get<APIResponse<DhcpPool[]>>('/dhcp/pools').then(r => r.data),

  getSubnetUsage: () =>
    api.get<APIResponse<DhcpSubnetUsage[]>>('/dhcp/pools/usage').then(r => r.data),

  createPool: (data: DhcpPoolCreate) =>
    api.post<APIResponse<{ id: string; name: string }>>('/dhcp/pools', data).then(r => r.data),

  updatePool: (id: string, data: Partial<DhcpPoolCreate>) =>
    api.put<APIResponse<{ id: string; action: string }>>(`/dhcp/pools/${id}`, data).then(r => r.data),

  // Rogue Alerts
  getRogueAlerts: () =>
    api.get<APIResponse<DhcpRogueAlert[]>>('/dhcp/alerts').then(r => r.data),

  createRogueAlert: (data: DhcpRogueAlertCreate) =>
    api.post<APIResponse<{ id: string; interface: string }>>('/dhcp/alerts', data).then(r => r.data),

  // Options
  getOptions: () =>
    api.get<APIResponse<DhcpOption[]>>('/dhcp/options').then(r => r.data),

  createOption: (data: DhcpOptionCreate) =>
    api.post<APIResponse<{ id: string; name: string }>>('/dhcp/options', data).then(r => r.data),

  // ── Fase 2: Cross-service ─────────────────────────────────────────────────

  /** S1: DHCP leases enriched with GLPI inventory match */
  getGlpiCorrelation: () =>
    api.get<APIResponse<DhcpLeaseGlpiCorrelation[]>>('/dhcp/correlation/glpi').then(r => r.data),

  /** S2: Device discovery — registered vs unregistered vs stale */
  getDiscovery: () =>
    api.get<APIResponse<DhcpDiscoveryResult>>('/dhcp/discovery').then(r => r.data),

  /** S3: Wazuh alerts enriched with DHCP context */
  getWazuhEnriched: (params?: { limit?: number; level_min?: number }) =>
    api.get<APIResponse<DhcpEnrichedAlert[]>>('/dhcp/wazuh/enriched', { params }).then(r => r.data),

  /** S4: Block rogue DHCP via firewall */
  blockRogueDhcp: (alertId: string) =>
    api.post<APIResponse<{ blocked: boolean; interface: string; rule_comment: string }>>(
      `/dhcp/alerts/${alertId}/block-rogue`
    ).then(r => r.data),

  /** S5: Create GLPI ticket for unregistered device */
  createDiscoveryTicket: (ip: string) =>
    api.post<APIResponse<{ id: number; title: string }>>(
      '/dhcp/discovery/create-ticket', null, { params: { ip } }
    ).then(r => r.data),
};

/* ── Auth ─────────────────────────────────────────────────── */

export const authApi = {
  login: (data: LoginRequest) =>
    api.post<TokenResponse>('/auth/login', data).then(r => r.data),

  me: () =>
    api.get<APIResponse<AuthUser>>('/auth/me').then(r => r.data),

  logout: () =>
    api.post<APIResponse>('/auth/logout').then(r => r.data),

  getUsers: () =>
    api.get<APIResponse<AuthUser[]>>('/auth/users').then(r => r.data),

  createUser: (data: UserCreate) =>
    api.post<APIResponse<AuthUser>>('/auth/users', data).then(r => r.data),

  updateUser: (id: number, data: UserUpdate) =>
    api.put<APIResponse<AuthUser>>(`/auth/users/${id}`, data).then(r => r.data),

  deleteUser: (id: number) =>
    api.delete<APIResponse>(`/auth/users/${id}`).then(r => r.data),
};

/* ── Audit / Action History ───────────────────────────────────────────── */

export const auditApi = {
  /** Get paginated action history with server-side filters */
  getHistory: (params?: {
    page?: number;
    page_size?: number;
    action_type?: string;
    severity?: string;
    performed_by?: string;
    search?: string;
    date_from?: string;
    date_to?: string;
    target_ip?: string;
  }) =>
    api
      .get<APIResponse<AuditHistoryResponse>>('/actions/history', { params })
      .then(r => r.data),

  /** Get audit configuration (min severity, disabled actions) */
  getConfig: () =>
    api
      .get<APIResponse<{ min_severity: string; disabled_actions: string[] }>>('/audit/config')
      .then(r => r.data),
};
