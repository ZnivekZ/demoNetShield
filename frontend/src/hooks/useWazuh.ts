/**
 * useWazuh — Extended TanStack Query hooks for the Wazuh SIEM module.
 *
 * Reuses wazuhApi (existing) for endpoints already wired on the backend,
 * and wazuhApiExtended (new) for paginated/extended endpoints. Hooks
 * return the raw data — the components decide how to render it.
 *
 * If a backend endpoint is missing, the API client returns
 * `{ success: false, error: 'no_disponible', data: null }` and the
 * components show a graceful "Pendiente de integración backend" message.
 *
 * The companion hook file `useWazuhSummary.ts` already covers the
 * dashboard-side widgets (timeline, top agents, last critical, etc.).
 * This file adds the deeper, paginated hooks used by the dedicated
 * Wazuh subpages.
 */
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { wazuhApiExtended } from '../services/api';
import type {
  WazuhAlertsFilters,
  WazuhAgentsFilters,
  WazuhVulnerabilitiesFilters,
} from '../types';

/* ── Alerts ─────────────────────────────────────────────────────── */

export function useWazuhAlerts(filters: WazuhAlertsFilters) {
  return useQuery({
    queryKey: ['wazuh-ext', 'alerts', filters],
    queryFn: () => wazuhApiExtended.getAlertsPaginated(filters),
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
    select: r => r.data,
  });
}

/* ── Agents ─────────────────────────────────────────────────────── */

export function useWazuhAgents(filters: WazuhAgentsFilters) {
  return useQuery({
    queryKey: ['wazuh-ext', 'agents', filters],
    queryFn: () => wazuhApiExtended.getAgentsPaginated(filters),
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
    select: r => r.data,
  });
}

export function useWazuhAgentDetail(agentId: string | null | undefined) {
  return useQuery({
    queryKey: ['wazuh-ext', 'agent', agentId],
    queryFn: () => wazuhApiExtended.getAgentDetail(agentId as string),
    enabled: !!agentId,
    refetchInterval: 30_000,
    select: r => r.data,
  });
}

export function useWazuhAgentSyscheck(agentId: string | null | undefined) {
  return useQuery({
    queryKey: ['wazuh-ext', 'agent', agentId, 'syscheck'],
    queryFn: () => wazuhApiExtended.getAgentSyscheck(agentId as string),
    enabled: !!agentId,
    select: r => r.data,
  });
}

export function useWazuhAgentSyscollector(agentId: string | null | undefined) {
  return useQuery({
    queryKey: ['wazuh-ext', 'agent', agentId, 'syscollector'],
    queryFn: () => wazuhApiExtended.getAgentSyscollector(agentId as string),
    enabled: !!agentId,
    select: r => r.data,
  });
}

/* ── Vulnerabilities ────────────────────────────────────────────── */

export function useWazuhVulnerabilities(filters: WazuhVulnerabilitiesFilters) {
  return useQuery({
    queryKey: ['wazuh-ext', 'vulnerabilities', filters],
    queryFn: () => wazuhApiExtended.getVulnerabilities(filters),
    placeholderData: keepPreviousData,
    refetchInterval: 120_000,
    select: r => r.data,
  });
}

/* ── MITRE ──────────────────────────────────────────────────────── */

export function useWazuhMitreMatrix() {
  return useQuery({
    queryKey: ['wazuh-ext', 'mitre-matrix'],
    queryFn: () => wazuhApiExtended.getMitreMatrix(),
    refetchInterval: 120_000,
    select: r => r.data,
  });
}

/* ── Stats Summary ──────────────────────────────────────────────── */

export function useWazuhStatsSummary() {
  return useQuery({
    queryKey: ['wazuh-ext', 'stats-summary'],
    queryFn: () => wazuhApiExtended.getStatsSummary(),
    refetchInterval: 30_000,
    select: r => r.data,
  });
}