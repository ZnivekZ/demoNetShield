/**
 * useGlpiHealth — TanStack Query hook for the GLPI-only inventory status.
 * Polls every 30 seconds to keep the dashboard fresh. No cross-tool data.
 *
 * `itemtypes` filtra por tipo de activo (vacío = todos). La respuesta trae
 * `availableTypes`/`typeCounts` calculados sobre el total, así el selector no
 * se vacía al aplicar un filtro.
 */
import { useQuery } from '@tanstack/react-query';
import { glpiApi } from '../services/api';
import type { GlpiAssetHealth, GlpiHealthSummary } from '../types';

export interface GlpiHealthData {
  assets: GlpiAssetHealth[];
  summary: GlpiHealthSummary;
  byType: Record<string, number>;
  byStatus: Record<string, number>;
  availableTypes: string[];
  typeCounts: Record<string, number>;
}

const EMPTY_SUMMARY: GlpiHealthSummary = { ok: 0, warning: 0, critical: 0, total: 0, active: 0, inactive: 0 };

export function useGlpiHealth(itemtypes: string[] = []) {
  // Clave estable e independiente del orden de selección
  const typesKey = [...itemtypes].sort().join(',');

  return useQuery({
    queryKey: ['glpi', 'health', typesKey],
    queryFn: () => glpiApi.getAssetHealth(itemtypes),
    refetchInterval: 30_000,
    staleTime: 25_000,
    select: (res): GlpiHealthData => ({
      assets: res.data?.assets ?? [],
      summary: res.data?.summary ?? EMPTY_SUMMARY,
      byType: res.data?.by_type ?? {},
      byStatus: res.data?.by_status ?? {},
      availableTypes: res.data?.available_types ?? [],
      typeCounts: res.data?.type_counts ?? {},
    }),
  });
}
