/**
 * useIpContext — unified IP context panel data (CrowdSec + MikroTik + Wazuh).
 * Only fetches when an IP is selected. Provides full remediation mutation.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { crowdsecApi } from '../services/api';
import type { FullRemediationRequest } from '../types';

export function useIpContext(ip: string | null) {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['crowdsec', 'ip-context', ip],
    queryFn: () => crowdsecApi.getIpContext(ip!),
    enabled: !!ip,
    staleTime: 30_000,
    select: r => r.data ?? null,
  });

  const fullRemediation = useMutation({
    mutationFn: (data: FullRemediationRequest) => crowdsecApi.fullRemediation(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crowdsec', 'decisions'] });
      qc.invalidateQueries({ queryKey: ['crowdsec', 'ip-context', ip] });
      qc.invalidateQueries({ queryKey: ['crowdsec', 'sync'] });
    },
  });

  return {
    context: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    fullRemediation,
  };
}

export function useWhitelist() {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['crowdsec', 'whitelist'],
    queryFn: () => crowdsecApi.getWhitelist(),
    select: r => r.data ?? [],
  });

  const addWhitelist = useMutation({
    mutationFn: (data: { ip: string; reason: string }) => crowdsecApi.addWhitelist(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['crowdsec', 'whitelist'] }),
  });

  const deleteWhitelist = useMutation({
    mutationFn: (id: number) => crowdsecApi.deleteWhitelist(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['crowdsec', 'whitelist'] }),
  });

  return {
    whitelist: query.data ?? [],
    isLoading: query.isLoading,
    addWhitelist,
    deleteWhitelist,
  };
}
