/**
 * useGlpiHealth — TanStack Query hook for the GLPI-only inventory status.
 * Polls every 30 seconds to keep the dashboard fresh. No cross-tool data.
 */
import { useQuery } from '@tanstack/react-query';
import { glpiApi } from '../services/api';
import type { GlpiAssetHealth, GlpiHealthSummary } from '../types';

export interface GlpiHealthData {
  assets: GlpiAssetHealth[];
  summary: GlpiHealthSummary;
  byType: Record<string, number>;
  byStatus: Record<string, number>;
}

const EMPTY_SUMMARY: GlpiHealthSummary = { ok: 0, warning: 0, critical: 0, total: 0, active: 0, inactive: 0 };

export function useGlpiHealth() {
  return useQuery({
    queryKey: ['glpi', 'health'],
    queryFn: () => glpiApi.getAssetHealth(),
    refetchInterval: 30_000,
    staleTime: 25_000,
    select: (res): GlpiHealthData => ({
      assets: res.data?.assets ?? [],
      summary: res.data?.summary ?? EMPTY_SUMMARY,
      byType: res.data?.by_type ?? {},
      byStatus: res.data?.by_status ?? {},
    }),
  });
}
