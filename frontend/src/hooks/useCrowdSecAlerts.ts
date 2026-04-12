/**
 * useCrowdSecAlerts — TanStack Query hook for CrowdSec attack alerts.
 * Supports filtering by scenario and source IP. Refetches every 30s.
 */
import { useQuery } from '@tanstack/react-query';
import { crowdsecApi } from '../services/api';

export function useCrowdSecAlerts(filters?: {
  limit?: number;
  scenario?: string;
  ip?: string;
}) {
  const query = useQuery({
    queryKey: ['crowdsec', 'alerts', filters],
    queryFn: () => crowdsecApi.getAlerts(filters),
    refetchInterval: 30_000,
    select: r => r.data ?? [],
  });

  return {
    alerts: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}

export function useCrowdSecAlertDetail(alertId: string | null) {
  return useQuery({
    queryKey: ['crowdsec', 'alert', alertId],
    queryFn: () => crowdsecApi.getAlertDetail(alertId!),
    enabled: !!alertId,
    select: r => r.data ?? null,
  });
}
