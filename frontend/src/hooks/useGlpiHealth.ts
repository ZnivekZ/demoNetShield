/**
 * useGlpiHealth — TanStack Query hook for combined GLPI + Wazuh + MikroTik health.
 * Polls every 30 seconds to keep the health dashboard fresh.
 */
import { useQuery } from '@tanstack/react-query';
import { glpiApi } from '../services/api';
import type { GlpiAssetHealth, GlpiHealthSummary } from '../types';

export interface GlpiHealthData {
  assets: GlpiAssetHealth[];
  summary: GlpiHealthSummary;
  mock: boolean;
}

export function useGlpiHealth() {
  return useQuery({
    queryKey: ['glpi', 'health'],
    queryFn: () => glpiApi.getAssetHealth(),
    refetchInterval: 30_000,  // Poll every 30s
    staleTime: 25_000,
    select: (res): GlpiHealthData => ({
      assets: res.data?.assets ?? [],
      summary: res.data?.summary ?? { ok: 0, warning: 0, critical: 0, total: 0 },
      mock: res.data?.mock ?? false,
    }),
  });
}
