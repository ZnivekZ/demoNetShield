import { useQuery } from '@tanstack/react-query';
import { geoipApi } from '../services/api';
import type { GeoIPResult } from '../types';

/** Hook para geolocalizacion de una IP individual */
export function useGeoIP(ip: string | null) {
  return useQuery<GeoIPResult | null>({
    queryKey: ['geoip', 'lookup', ip],
    queryFn: async () => {
      if (!ip) return null;
      const res = await geoipApi.lookup(ip);
      return res.success ? res.data : null;
    },
    enabled: !!ip,
    staleTime: 1000 * 60 * 60, // 1 hora — mismo TTL que el backend
    gcTime: 1000 * 60 * 60 * 2,
  });
}
