import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { geoipApi } from '../services/api';
import type { GeoBlockSuggestion } from '../types';
import { useState } from 'react';

/** Hook para sugerencias de geo-bloqueo y su aplicación */
export function useGeoBlockSuggestions() {
  const queryClient = useQueryClient();
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  const query = useQuery<GeoBlockSuggestion[]>({
    queryKey: ['geoip', 'suggestions'],
    queryFn: async () => {
      const res = await geoipApi.getSuggestions();
      return (res.success && res.data) ? res.data : [];
    },
    staleTime: 1000 * 60 * 5,
    refetchInterval: 1000 * 60 * 10, // polling cada 10 minutos
  });

  const applyMutation = useMutation({
    mutationFn: ({ id, duration }: { id: string; duration: string }) =>
      geoipApi.applySuggestion(id, duration),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['geoip', 'suggestions'] });
      queryClient.invalidateQueries({ queryKey: ['crowdsec'] });
    },
  });

  /** Descartar una sugerencia de la vista sin aplicarla */
  const dismiss = (id: string) => {
    setDismissedIds(prev => new Set([...prev, id]));
  };

  const suggestions = (query.data ?? []).filter(s => !dismissedIds.has(s.id));

  return {
    suggestions,
    isLoading: query.isLoading,
    error: query.error,
    apply: applyMutation.mutate,
    isApplying: applyMutation.isPending,
    dismiss,
    refresh: () => queryClient.invalidateQueries({ queryKey: ['geoip', 'suggestions'] }),
  };
}
