/**
 * useCrowdSecDecisions — TanStack Query hook for CrowdSec active decisions.
 * Refetches every 15s. Supports add/delete mutations via ConfirmModal.
 * Subscribes to /ws/crowdsec/decisions for real-time updates.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { crowdsecApi } from '../services/api';
import type { ManualDecisionRequest } from '../types';

export function useCrowdSecDecisions(filters?: {
  ip?: string;
  scenario?: string;
  type?: string;
}) {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['crowdsec', 'decisions', filters],
    queryFn: () => crowdsecApi.getDecisions(filters),
    refetchInterval: 15_000,
    select: r => r.data ?? [],
  });

  const addDecision = useMutation({
    mutationFn: (data: ManualDecisionRequest) => crowdsecApi.addDecision(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['crowdsec', 'decisions'] }),
  });

  const deleteDecision = useMutation({
    mutationFn: (id: string) => crowdsecApi.deleteDecision(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['crowdsec', 'decisions'] }),
  });

  const deleteByIp = useMutation({
    mutationFn: (ip: string) => crowdsecApi.deleteDecisionsByIp(ip),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['crowdsec', 'decisions'] }),
  });

  return {
    decisions: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
    addDecision,
    deleteDecision,
    deleteByIp,
  };
}
