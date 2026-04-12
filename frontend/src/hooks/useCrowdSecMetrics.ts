/**
 * useCrowdSecMetrics — aggregated metrics, bouncers, scenarios.
 * All refetch every 60s — these stats are not real-time critical.
 *
 * useCrowdSecHealth uses getMetrics() as a connectivity probe:
 *   if metrics respond → service is reachable → green dot in header.
 */
import { useQuery } from '@tanstack/react-query';
import { crowdsecApi } from '../services/api';

/** Health check for CrowdSec: uses /crowdsec/metrics as connectivity probe. */
export function useCrowdSecHealth() {
  return useQuery({
    queryKey: ['crowdsec', 'health'],
    queryFn: () => crowdsecApi.getMetrics(),
    refetchInterval: 30_000,
    select: r => r.data ?? null,
  });
}

export function useCrowdSecMetrics() {
  return useQuery({
    queryKey: ['crowdsec', 'metrics'],
    queryFn: () => crowdsecApi.getMetrics(),
    refetchInterval: 60_000,
    select: r => r.data ?? null,
  });
}

export function useCrowdSecBouncers() {
  return useQuery({
    queryKey: ['crowdsec', 'bouncers'],
    queryFn: () => crowdsecApi.getBouncers(),
    refetchInterval: 60_000,
    select: r => r.data ?? [],
  });
}

export function useCrowdSecScenarios() {
  return useQuery({
    queryKey: ['crowdsec', 'scenarios'],
    queryFn: () => crowdsecApi.getScenarios(),
    refetchInterval: 60_000,
    select: r => r.data ?? [],
  });
}

export function useCrowdSecHub() {
  return useQuery({
    queryKey: ['crowdsec', 'hub'],
    queryFn: () => crowdsecApi.getHub(),
    refetchInterval: 120_000,
    select: r => r.data ?? null,
  });
}
