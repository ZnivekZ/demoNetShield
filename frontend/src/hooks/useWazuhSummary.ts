/**
 * useWazuhSummary — TanStack Query hooks for all Wazuh security panel data.
 * All fetching goes through wazuhApi — never direct fetch in components.
 */
import { useQuery } from '@tanstack/react-query';
import { wazuhApi } from '../services/api';
import type { WazuhNodeResources, AgentVulnRanking } from '../types';
import { requireApiSuccess } from '../services/apiResponse';

export function useCriticalAlerts(limit = 50) {
  return useQuery({
    queryKey: ['wazuh', 'alerts', 'critical', limit],
    queryFn: () => wazuhApi.getCriticalAlerts(limit),
    refetchInterval: 15_000,
    select: r => r.data ?? [],
  });
}

/** Recent alerts at ANY level ≥ levelMin (not only critical) — used by the
 *  dashboard "Alertas recientes" feed so it reflects real volume. */
export function useRecentAlerts(limit = 50, levelMin = 5) {
  return useQuery({
    queryKey: ['wazuh', 'alerts', 'recent', limit, levelMin],
    queryFn: () => wazuhApi.getAlerts(limit, levelMin),
    refetchInterval: 15_000,
    select: r => r.data ?? [],
  });
}

export function useAlertsTimeline(levelMin = 5) {
  return useQuery({
    queryKey: ['wazuh', 'alerts', 'timeline', levelMin],
    queryFn: () => wazuhApi.getAlertsTimeline(levelMin),
    refetchInterval: 60_000,
    select: r => r.data ?? [],
  });
}

export function useLastCritical() {
  return useQuery({
    queryKey: ['wazuh', 'alerts', 'last-critical'],
    queryFn: () => wazuhApi.getLastCritical(),
    refetchInterval: 15_000,
    select: r => r.data ?? null,
  });
}

export function useTopAgents(limit = 10) {
  return useQuery({
    queryKey: ['wazuh', 'agents', 'top', limit],
    queryFn: () => wazuhApi.getTopAgents(limit),
    refetchInterval: 30_000,
    select: r => r.data ?? [],
  });
}

export function useAgentsSummary() {
  return useQuery({
    queryKey: ['wazuh', 'agents', 'summary'],
    queryFn: () => wazuhApi.getAgentsSummary(),
    refetchInterval: 30_000,
    select: r => r.data,
  });
}

/** Flat list of registered agents — used to build name dropdowns in filters. */
export function useAgentsList() {
  return useQuery({
    queryKey: ['wazuh', 'agents', 'list'],
    queryFn: () => wazuhApi.getAgents(),
    refetchInterval: 60_000,
    select: r => r.data ?? [],
  });
}

export function useMitreSummary() {
  return useQuery({
    queryKey: ['wazuh', 'mitre', 'summary'],
    queryFn: () => wazuhApi.getMitreSummary(),
    refetchInterval: 60_000,
    select: r => r.data ?? [],
  });
}

export function useWazuhResources() {
  return useQuery<WazuhNodeResources>({
    queryKey: ['wazuh', 'resources'],
    queryFn: async () =>
      requireApiSuccess(await wazuhApi.getResources(), 'Sin recursos de Wazuh') as WazuhNodeResources,
    refetchInterval: 30_000,
  });
}

export function useAgentsByVulnerabilities(limit = 6) {
  return useQuery<AgentVulnRanking[]>({
    queryKey: ['wazuh', 'agents', 'by-vulnerabilities', limit],
    queryFn: async () =>
      requireApiSuccess(
        await wazuhApi.getAgentsByVulnerabilities(limit), 'Sin ranking de agentes',
      ) as AgentVulnRanking[],
    refetchInterval: 60_000,
  });
}

export function useWazuhHealth() {
  return useQuery({
    queryKey: ['wazuh', 'health'],
    queryFn: async () => requireApiSuccess(await wazuhApi.getHealth(), 'No se pudo verificar Wazuh'),
    refetchInterval: 30_000,
  });
}
