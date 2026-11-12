import { api } from './api';
import type { APIResponse } from '../types';

export interface CandidateConfig {
  enabled: boolean;
  include_archives: boolean;
  poll_seconds: number;
  prompt_text: string;
  prompt_version: number;
  included_agent_ids: string[];
  excluded_agent_ids: string[];
  last_run_at: string | null;
  last_error: string | null;
  last_run: Record<string, unknown>;
}

export interface CandidateRule {
  id: number;
  name: string;
  category: 'critical' | 'ssh' | 'windows' | 'web' | 'custom';
  sources: 'alerts' | 'archives' | 'both';
  decision_mode: 'automatic' | 'ai';
  enabled: boolean;
  min_level: number;
  min_count: number;
  window_minutes: number;
  pattern: string;
  rule_ids: string[];
  version: number;
}

export type CandidateRuleInput = Omit<CandidateRule, 'id' | 'version'>;

export interface CandidateRow {
  id: number;
  day: string;
  ip: string;
  first_seen: string;
  last_seen: string;
  decided_at: string;
  reasons: string[];
  categories: string[];
  agent_ids: string[];
  agent_names: string[];
  sources: string[];
  evaluation_ids: number[];
  event_count: number;
  decision_source: string;
  days_seen: number;
}

export interface CandidateEvaluation {
  id: number;
  day: string;
  ip: string;
  rule_name: string;
  rule_version: number;
  category: string;
  decision: 'SI' | 'NO';
  decision_source: string;
  reason: string;
  technical_reason: string | null;
  first_seen: string;
  last_seen: string;
  decided_at: string;
  event_count: number;
  agent_names: string[];
  sources: string[];
  ai_model: string | null;
  prompt_snapshot?: string | null;
  prompt_version?: number | null;
  payload?: unknown;
  ai_response?: unknown;
  rule_snapshot?: unknown;
  event_refs?: string[];
}

export interface CandidateHistory {
  ip: string;
  days_seen: number;
  candidates: CandidateRow[];
  evaluations: CandidateEvaluation[];
}

export interface CandidateSource {
  source: 'alerts' | 'archives';
  index: string;
  status: 'receiving' | 'no_recent_events' | 'error';
  last_15m: number | null;
  last_24h: number | null;
  latest_at: string | null;
  sample_with_ip: number;
  sample_size: number;
  sample_agents: string[];
  error: string | null;
}

function unpack<T>(response: APIResponse<T>): T {
  if (!response.success || response.data === null || response.data === undefined) {
    throw new Error(response.error || 'Respuesta vacía');
  }
  return response.data;
}

const get = async <T>(url: string, params?: Record<string, string>) =>
  unpack((await api.get<APIResponse<T>>(url, { params })).data);
const put = async <T>(url: string, body: unknown) =>
  unpack((await api.put<APIResponse<T>>(url, body)).data);
const post = async <T>(url: string, body?: unknown, params?: Record<string, string>) =>
  unpack((await api.post<APIResponse<T>>(url, body, { params })).data);

export const candidateApi = {
  config: () => get<CandidateConfig>('/candidates/config'),
  updateConfig: (body: Partial<CandidateConfig>) => put<CandidateConfig>('/candidates/config', body),
  rules: () => get<CandidateRule[]>('/candidates/rules'),
  createRule: (body: CandidateRuleInput) => post<CandidateRule>('/candidates/rules', body),
  updateRule: (id: number, body: CandidateRuleInput) => put<CandidateRule>(`/candidates/rules/${id}`, body),
  days: () => get<{ day: string; count: number }[]>('/candidates/days'),
  daily: (day: string) => get<CandidateRow[]>('/candidates/daily', { day }),
  history: (ip: string) => get<CandidateHistory>(`/candidates/ip/${encodeURIComponent(ip)}`),
  evaluation: (id: number) => get<CandidateEvaluation>(`/candidates/evaluations/${id}`),
  scan: (day: string, recentMinutes?: number) => post<{ running: boolean; day: string }>('/candidates/scan', {}, { day, ...(recentMinutes ? { recent_minutes: String(recentMinutes) } : {}) }),
  scanStatus: () => get<{ running: boolean; result: Record<string, unknown> | null; error: string | null }>('/candidates/scan/status'),
  sources: () => get<CandidateSource[]>('/candidates/sources'),
};
