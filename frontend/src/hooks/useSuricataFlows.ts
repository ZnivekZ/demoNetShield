/**
 * useSuricataFlows — Hook para flujos de red NSM capturados por Suricata.
 * Maneja: flujos con filtros, estadísticas, DNS, HTTP, TLS.
 */
import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { suricataApi } from '../services/api';

interface FlowFilters {
  src_ip?: string;
  proto?: string;
  app_proto?: string;
  has_alert?: boolean;
  limit?: number;
  offset?: number;
}

export function useSuricataFlows(initialFilters: FlowFilters = {}) {
  const [filters, setFilters] = useState<FlowFilters>({ limit: 50, ...initialFilters });

  const flowsQuery = useQuery({
    queryKey: ['suricata', 'flows', filters],
    queryFn: () => suricataApi.getFlows(filters),
    refetchInterval: 20_000,
    select: r => r.data,
  });

  const statsQuery = useQuery({
    queryKey: ['suricata', 'flows-stats'],
    queryFn: () => suricataApi.getFlowsStats(),
    refetchInterval: 30_000,
    select: r => r.data,
  });

  const dnsQuery = useQuery({
    queryKey: ['suricata', 'dns'],
    queryFn: () => suricataApi.getDnsQueries({ limit: 50 }),
    refetchInterval: 20_000,
    select: r => r.data?.queries ?? [],
  });

  const httpQuery = useQuery({
    queryKey: ['suricata', 'http'],
    queryFn: () => suricataApi.getHttpTransactions({ limit: 50 }),
    refetchInterval: 20_000,
    select: r => r.data?.transactions ?? [],
  });

  const tlsQuery = useQuery({
    queryKey: ['suricata', 'tls'],
    queryFn: () => suricataApi.getTlsHandshakes({ limit: 50 }),
    refetchInterval: 20_000,
    select: r => r.data?.handshakes ?? [],
  });

  const updateFilters = useCallback((patch: Partial<FlowFilters>) => {
    setFilters(prev => ({ ...prev, ...patch, offset: 0 }));
  }, []);

  return {
    flows: flowsQuery.data?.flows ?? [],
    totalFlows: flowsQuery.data?.total ?? 0,
    flowsStats: statsQuery.data,
    dns: dnsQuery.data ?? [],
    http: httpQuery.data ?? [],
    tls: tlsQuery.data ?? [],

    isLoading: flowsQuery.isLoading,
    isStatsLoading: statsQuery.isLoading,
    isDnsLoading: dnsQuery.isLoading,
    isHttpLoading: httpQuery.isLoading,
    isTlsLoading: tlsQuery.isLoading,

    filters,
    updateFilters,
  };
}
