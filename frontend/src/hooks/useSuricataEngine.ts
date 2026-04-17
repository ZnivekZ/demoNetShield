/**
 * useSuricataEngine — Hook para el estado y métricas del motor Suricata.
 * Consulta /api/suricata/engine/status y /api/suricata/engine/stats.
 * Mutación para reload-rules con invalidación automática de queries.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { suricataApi } from '../services/api';

export function useSuricataEngine(statMinutes = 30) {
  const queryClient = useQueryClient();

  const engineStatus = useQuery({
    queryKey: ['suricata', 'engine-status'],
    queryFn: () => suricataApi.getEngineStatus(),
    refetchInterval: 10_000,
    select: r => r.data,
  });

  const engineStats = useQuery({
    queryKey: ['suricata', 'engine-stats', statMinutes],
    queryFn: () => suricataApi.getEngineStats(statMinutes),
    refetchInterval: 5_000,
    select: r => r.data,
  });

  const reloadRulesMutation = useMutation({
    mutationFn: () => suricataApi.reloadRules(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suricata', 'engine-status'] });
      queryClient.invalidateQueries({ queryKey: ['suricata', 'rules'] });
    },
  });

  return {
    // Engine status
    engineStatus: engineStatus.data,
    isLoadingStatus: engineStatus.isLoading,
    isStatusError: engineStatus.isError,

    // Engine stats + series
    stats: engineStats.data?.stats,
    series: engineStats.data?.series ?? [],
    isLoadingStats: engineStats.isLoading,

    // Reload rules mutation
    reloadRules: reloadRulesMutation.mutate,
    isReloading: reloadRulesMutation.isPending,
    reloadResult: reloadRulesMutation.data?.data,

    // Health helper (para el status dot del sidebar)
    isHealthy: engineStatus.data?.running === true,
  };
}
