/**
 * usePhishing — TanStack Query hooks + mutations for phishing detection and sinkhole.
 * All data fetching through phishingApi — no direct HTTP in components.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { phishingApi } from '../services/api';

// ── Queries ────────────────────────────────────────────────────

export function usePhishingAlerts(limit = 50) {
  return useQuery({
    queryKey: ['phishing', 'alerts', limit],
    queryFn: () => phishingApi.getAlerts(limit),
    refetchInterval: 30_000,
    select: r => r.data ?? [],
  });
}

export function useSuspiciousDomains() {
  return useQuery({
    queryKey: ['phishing', 'domains', 'suspicious'],
    queryFn: () => phishingApi.getSuspiciousDomains(),
    refetchInterval: 30_000,
    select: r => r.data ?? [],
  });
}

export function usePhishingTimeline() {
  return useQuery({
    queryKey: ['phishing', 'timeline'],
    queryFn: () => phishingApi.getTimeline(),
    refetchInterval: 60_000,
    select: r => r.data ?? [],
  });
}

export function usePhishingVictims() {
  return useQuery({
    queryKey: ['phishing', 'victims'],
    queryFn: () => phishingApi.getVictims(),
    refetchInterval: 30_000,
    select: r => r.data ?? [],
  });
}

export function usePhishingStats() {
  return useQuery({
    queryKey: ['phishing', 'stats'],
    queryFn: () => phishingApi.getStats(),
    refetchInterval: 30_000,
    select: r => r.data,
  });
}

export function useSinkholes() {
  return useQuery({
    queryKey: ['phishing', 'sinkholes'],
    queryFn: () => phishingApi.getSinkholes(),
    refetchInterval: 60_000,
    select: r => r.data ?? [],
  });
}

// ── Mutations ─────────────────────────────────────────────────

export function useSinkholeDomain() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ domain, reason }: { domain: string; reason: string }) =>
      phishingApi.sinkholeDomain(domain, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['phishing', 'sinkholes'] });
      qc.invalidateQueries({ queryKey: ['phishing', 'domains'] });
    },
  });
}

export function useRemoveSinkhole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (domain: string) => phishingApi.removeSinkhole(domain),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['phishing', 'sinkholes'] });
    },
  });
}

export function usePhishingBlockIP() {
  return useMutation({
    mutationFn: ({ ip, duration_hours }: { ip: string; duration_hours?: number }) =>
      phishingApi.blockIP(ip, duration_hours),
  });
}

export function useSimulatePhishing() {
  return useMutation({
    mutationFn: (params: { target_agent_id?: string; malicious_url?: string }) =>
      phishingApi.simulate(params),
  });
}
