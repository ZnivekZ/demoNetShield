/**
 * useSuricataRules — Hook para gestión de reglas/firmas de Suricata.
 * Maneja: listado con filtros, rulesets, toggle y actualización.
 */
import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { suricataApi } from '../services/api';

interface RuleFilters {
  enabled?: boolean;
  ruleset?: string;
  category?: string;
  limit?: number;
}

export function useSuricataRules(initialFilters: RuleFilters = {}) {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<RuleFilters>({ limit: 100, ...initialFilters });

  const rulesQuery = useQuery({
    queryKey: ['suricata', 'rules', filters],
    queryFn: () => suricataApi.getRules(filters),
    select: r => r.data,
  });

  const rulesetsQuery = useQuery({
    queryKey: ['suricata', 'rulesets'],
    queryFn: () => suricataApi.getRulesets(),
    staleTime: 60_000,
    select: r => r.data?.rulesets ?? [],
  });

  const toggleMutation = useMutation({
    mutationFn: ({ sid, enabled }: { sid: number; enabled: boolean }) =>
      suricataApi.toggleRule(sid, enabled),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suricata', 'rules'] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: () => suricataApi.updateRules(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suricata', 'rules'] });
      queryClient.invalidateQueries({ queryKey: ['suricata', 'rulesets'] });
      queryClient.invalidateQueries({ queryKey: ['suricata', 'engine-status'] });
    },
  });

  const updateFilters = useCallback((patch: Partial<RuleFilters>) => {
    setFilters(prev => ({ ...prev, ...patch }));
  }, []);

  return {
    rules: rulesQuery.data?.rules ?? [],
    totalRules: rulesQuery.data?.total ?? 0,
    rulesets: rulesetsQuery.data ?? [],

    isLoading: rulesQuery.isLoading,
    isError: rulesQuery.isError,

    // Toggle rule enable/disable
    toggleRule: (sid: number, enabled: boolean) => toggleMutation.mutate({ sid, enabled }),
    isToggling: toggleMutation.isPending,
    toggleError: toggleMutation.error,

    // Update rules (suricata-update)
    updateRules: updateMutation.mutate,
    isUpdating: updateMutation.isPending,
    updateResult: updateMutation.data?.data,

    filters,
    updateFilters,
  };
}
