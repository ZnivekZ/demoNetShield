/**
 * useWazuhSummary — TanStack Query hooks for all Wazuh security panel data.
 * All fetching goes through wazuhApi — never direct fetch in components.
 */
import { useQuery } from '@tanstack/react-query';
import { wazuhApi } from '../services/api';

export function useCriticalAlerts(limit = 50) {
  return useQuery({
    queryKey: ['wazuh', 'alerts', 'critical', limit],
    queryFn: () => wazuhApi.getCriticalAlerts(limit),
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

export function useMitreSummary() {
  return useQuery({
    queryKey: ['wazuh', 'mitre', 'summary'],
    queryFn: () => wazuhApi.getMitreSummary(),
    refetchInterval: 60_000,
    select: r => r.data ?? [],
  });
}

export function useWazuhHealth() {
  return useQuery({
    queryKey: ['wazuh', 'health'],
    queryFn: () => wazuhApi.getHealth(),
    refetchInterval: 30_000,
    select: r => r.data,
  });
}
