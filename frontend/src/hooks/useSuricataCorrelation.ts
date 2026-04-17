/**
 * useSuricataCorrelation — Hook para correlación cross-service.
 * Maneja: correlación con CrowdSec y con Wazuh.
 */
import { useQuery } from '@tanstack/react-query';
import { suricataApi } from '../services/api';

export function useSuricataCorrelation() {
  const crowdSecQuery = useQuery({
    queryKey: ['suricata', 'correlation-crowdsec'],
    queryFn: () => suricataApi.getCorrelationCrowdSec(),
    refetchInterval: 30_000,
    select: r => r.data,
  });

  const wazuhQuery = useQuery({
    queryKey: ['suricata', 'correlation-wazuh'],
    queryFn: () => suricataApi.getCorrelationWazuh(),
    refetchInterval: 30_000,
    select: r => r.data,
  });

  return {
    crowdSecCorrelations: crowdSecQuery.data?.correlations ?? [],
    totalCrowdSec: crowdSecQuery.data?.total ?? 0,
    wazuhCorrelations: wazuhQuery.data?.correlations ?? [],
    totalWazuh: wazuhQuery.data?.total ?? 0,

    isLoadingCrowdSec: crowdSecQuery.isLoading,
    isLoadingWazuh: wazuhQuery.isLoading,
    isError: crowdSecQuery.isError || wazuhQuery.isError,

    // Confirmed threats: IPs con alertas en Suricata + decisión en CrowdSec
    confirmedThreats: (crowdSecQuery.data?.correlations ?? []).filter(
      c => c.correlation_type === 'confirmed_threat'
    ),
  };
}
