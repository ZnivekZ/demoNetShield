/**
 * useSecurityActions — useMutation hooks for all destructive security operations.
 * Each action invalidates relevant query caches after success.
 * IMPORTANT: All mutations MUST be preceded by a ConfirmModal on the UI side.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { securityApi } from '../services/api';
import type { SecurityBlockIPRequest, QuarantineRequest, GeoBlockRequest } from '../types';

export function useBlockIP() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: SecurityBlockIPRequest) => securityApi.blockIP(req),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mikrotik', 'address-list'] });
    },
  });
}

export function useAutoBlock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: SecurityBlockIPRequest) => securityApi.autoBlock(req),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mikrotik', 'address-list'] });
    },
  });
}

export function useQuarantine() {
  return useMutation({
    mutationFn: (req: QuarantineRequest) => securityApi.quarantine(req),
  });
}

export function useGeoBlock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: GeoBlockRequest) => securityApi.geoBlock(req),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mikrotik', 'address-list'] });
    },
  });
}
