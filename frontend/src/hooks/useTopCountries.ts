import { useQuery } from '@tanstack/react-query';
import { geoipApi } from '../services/api';
import type { TopCountriesResponse } from '../types';

interface UseTopCountriesOptions {
  limit?: number;
  source?: 'all' | 'crowdsec' | 'wazuh' | 'mikrotik';
  enabled?: boolean;
}

/** Hook para top países atacantes con polling cada 5 minutos */
export function useTopCountries({
  limit = 7,
  source = 'all',
  enabled = true,
}: UseTopCountriesOptions = {}) {
  return useQuery<TopCountriesResponse | null>({
    queryKey: ['geoip', 'top-countries', limit, source],
    queryFn: async () => {
      const res = await geoipApi.getTopCountries({ limit, source });
      return res.success ? res.data : null;
    },
    enabled,
    staleTime: 1000 * 60 * 5,       // 5 minutos
    refetchInterval: 1000 * 60 * 5, // polling automático
    gcTime: 1000 * 60 * 15,
  });
}
