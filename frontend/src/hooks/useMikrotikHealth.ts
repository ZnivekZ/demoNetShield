/**
 * useMikrotikHealth — TanStack Query hooks for MikroTik system health and traffic.
 * All fetching goes through mikrotikApi — never direct fetch in components.
 */
import { useQuery } from '@tanstack/react-query';
import { mikrotikApi } from '../services/api';

export function useMikrotikHealth() {
  return useQuery({
    queryKey: ['mikrotik', 'health'],
    queryFn: () => mikrotikApi.getHealth(),
    refetchInterval: 15_000,
    select: r => r.data,
  });
}

export function useInterfaceTraffic() {
  return useQuery({
    queryKey: ['mikrotik', 'interfaces', 'traffic', 'all'],
    queryFn: () => mikrotikApi.getAllInterfaceTraffic(),
    refetchInterval: 10_000,
    select: r => r.data ?? [],
  });
}

export function useInterfaces() {
  return useQuery({
    queryKey: ['mikrotik', 'interfaces'],
    queryFn: () => mikrotikApi.getInterfaces(),
    refetchInterval: 15_000,
    select: r => r.data ?? [],
  });
}
