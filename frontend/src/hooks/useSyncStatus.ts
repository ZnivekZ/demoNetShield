/**
 * useSyncStatus — CrowdSec ↔ MikroTik synchronization status.
 * Refetches every 30s. Provides applySync mutation.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { crowdsecApi } from '../services/api';
import type { SyncApplyRequest } from '../types';

export function useSyncStatus() {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['crowdsec', 'sync'],
    queryFn: () => crowdsecApi.getSyncStatus(),
    refetchInterval: 30_000,
    select: r => r.data ?? null,
  });

  const applySync = useMutation({
    mutationFn: (data: SyncApplyRequest) => crowdsecApi.applySync(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crowdsec', 'sync'] });
      qc.invalidateQueries({ queryKey: ['crowdsec', 'decisions'] });
    },
  });

  return {
    syncStatus: query.data,
    isLoading: query.isLoading,
    isOutOfSync: query.data?.in_sync === false,
    applySync,
  };
}
