import { useQuery } from '@tanstack/react-query';
import { portalApi } from '../services/api';

export function usePortalRealtimeStats(isConnected: boolean) {
  return useQuery({
    queryKey: ['portal', 'stats', 'realtime'],
    queryFn: () => portalApi.getRealtimeStats(),
    // Poll less frequently if WebSocket is connected, as WS handles active sessions
    refetchInterval: isConnected ? 30_000 : 10_000,
    select: (r) => r.data,
  });
}

export function usePortalSummaryStats() {
  return useQuery({
    queryKey: ['portal', 'stats', 'summary'],
    queryFn: () => portalApi.getSummaryStats(),
    refetchInterval: 60_000, // Every minute is fine for historical summary
    select: (r) => r.data,
  });
}
