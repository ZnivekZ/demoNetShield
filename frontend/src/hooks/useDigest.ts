import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { digestApi } from '../services/api';
import type { AgentCategory } from '../types';

// ── Query keys ─────────────────────────────────────────────────────────────
export const DIGEST_KEYS = {
  latest:    ['digest', 'latest'] as const,
  history:   (limit: number) => ['digest', 'history', limit] as const,
  byDate:    (date: string) => ['digest', 'date', date] as const,
  delta:     ['digest', 'delta'] as const,
  agents:    ['digest', 'agents'] as const,
  cisaKev:   ['digest', 'cisa-kev'] as const,
};

// ── Hooks ──────────────────────────────────────────────────────────────────

export function useDigestLatest() {
  return useQuery({
    queryKey: DIGEST_KEYS.latest,
    queryFn:  () => digestApi.getLatest().then(r => r.data ?? null),
    staleTime: 60_000,
    retry: 1,
  });
}

export function useDigestHistory(limit = 30) {
  return useQuery({
    queryKey: DIGEST_KEYS.history(limit),
    queryFn:  () => digestApi.getHistory(limit).then(r => {
      const data = (r as any)?.data;
      return Array.isArray(data) ? data : (Array.isArray(r) ? r : []);
    }),
    staleTime: 300_000,
  });
}

export function useDigestByDate(date: string | null) {
  return useQuery({
    queryKey: DIGEST_KEYS.byDate(date ?? ''),
    queryFn:  () => digestApi.getByDate(date!).then(r => r.data ?? null),
    enabled:  !!date,
    staleTime: Infinity,
  });
}

export function useDigestDelta() {
  return useQuery({
    queryKey: DIGEST_KEYS.delta,
    queryFn:  () => digestApi.getDelta().then(r => r.data ?? null),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

export function useDigestAgents() {
  return useQuery({
    queryKey: DIGEST_KEYS.agents,
    queryFn:  () => digestApi.getAgents().then(r => r.data ?? []),
    staleTime: 120_000,
  });
}

export function useDigestCisaKev() {
  return useQuery({
    queryKey: DIGEST_KEYS.cisaKev,
    queryFn:  () => digestApi.getCisaKev().then(r => r.data ?? null),
    staleTime: 300_000,
  });
}

export function useDigestGenerate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (force = false) => digestApi.generate(force),
    onSuccess: () => {
      // Invalidate all digest queries so UI refreshes
      qc.invalidateQueries({ queryKey: ['digest'] });
    },
  });
}

export function useDigestUpdateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ agentId, category }: { agentId: string; category: AgentCategory }) =>
      digestApi.updateAgentCategory(agentId, category),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: DIGEST_KEYS.agents });
    },
  });
}
