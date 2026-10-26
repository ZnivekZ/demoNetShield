/**
 * useGlpiAssets — TanStack Query hook for GLPI computer/asset management.
 * Provides: asset list, single asset detail, search, stats, and mutations.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { glpiApi } from '../services/api';
import type { GlpiAssetCreate, GlpiAssetUpdate, GlpiAssignmentRequest, GlpiQuarantineRequest } from '../types';

const ASSETS_KEY = ['glpi', 'assets'] as const;

export function useGlpiAssets(params?: {
  search?: string;
  location_id?: number;
  status?: string;
  limit?: number;
}) {
  return useQuery({
    queryKey: [...ASSETS_KEY, params],
    queryFn: () => glpiApi.getAssets(params),
    staleTime: 30_000,
    select: (res) => res.data,
  });
}

export function useGlpiAsset(id: number | null, itemtype?: string) {
  return useQuery({
    queryKey: [...ASSETS_KEY, itemtype ?? 'Computer', id],
    queryFn: () => glpiApi.getAsset(id!, itemtype),
    enabled: id !== null,
    staleTime: 30_000,
    select: (res) => res.data,
  });
}

export function useGlpiAssetSearch(query: string) {
  return useQuery({
    queryKey: ['glpi', 'assets', 'search', query],
    queryFn: () => glpiApi.searchAssets(query),
    enabled: query.length >= 2,
    staleTime: 10_000,
    select: (res) => res.data?.results ?? [],
  });
}

export function useGlpiAssetStats() {
  return useQuery({
    queryKey: ['glpi', 'assets', 'stats'],
    queryFn: () => glpiApi.getAssetStats(),
    staleTime: 60_000,
    select: (res) => res.data,
  });
}

/** GLPI connectivity status (shared cache key with InventoryPage). */
export function useGlpiStatus() {
  return useQuery({
    queryKey: ['glpi', 'status'],
    queryFn: () => glpiApi.getStatus(),
    refetchInterval: 60_000,
    select: (res) => res.data,
  });
}

export function useGlpiAssetNetworkContext(id: number | null) {
  return useQuery({
    queryKey: ['glpi', 'assets', id, 'network-context'],
    queryFn: () => glpiApi.getAssetNetworkContext(id!),
    enabled: id !== null,
    staleTime: 20_000,
    select: (res) => res.data,
  });
}

export function useGlpiAssetFullDetail(id: number | null, itemtype?: string) {
  return useQuery({
    queryKey: ['glpi', 'assets', itemtype ?? 'Computer', id, 'full-detail'],
    queryFn: () => glpiApi.getAssetFullDetail(id!, itemtype),
    enabled: id !== null,
    staleTime: 60_000,
    select: (res) => res.data,
  });
}

// ── Mutations ─────────────────────────────────────────────────────

export function useCreateGlpiAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: GlpiAssetCreate) => glpiApi.createAsset(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ASSETS_KEY }),
  });
}

export function useUpdateGlpiAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data, itemtype }: { id: number; data: GlpiAssetUpdate; itemtype?: string }) =>
      glpiApi.updateAsset(id, data, itemtype),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ASSETS_KEY });
      qc.invalidateQueries({ queryKey: ['glpi', 'health'] });
    },
  });
}

export function useQuarantineGlpiAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: GlpiQuarantineRequest }) =>
      glpiApi.quarantineAsset(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ASSETS_KEY });
      qc.invalidateQueries({ queryKey: ['glpi', 'health'] });
    },
  });
}

export function useUnquarantineGlpiAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => glpiApi.unquarantineAsset(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ASSETS_KEY });
      qc.invalidateQueries({ queryKey: ['glpi', 'health'] });
    },
  });
}

export function useGlpiLocations() {
  return useQuery({
    queryKey: ['glpi', 'locations'],
    queryFn: () => glpiApi.getLocations(),
    staleTime: 120_000,
    select: (res) => res.data?.locations ?? [],
  });
}

export function useGlpiAssetsByLocation(locationId: number | null) {
  return useQuery({
    queryKey: ['glpi', 'assets', 'by-location', locationId],
    queryFn: () => glpiApi.getAssetsByLocation(locationId!),
    enabled: locationId !== null,
    staleTime: 30_000,
    select: (res) => res.data?.assets ?? [],
  });
}

export function useDeleteGlpiAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, itemtype }: { id: number; itemtype?: string }) =>
      glpiApi.deleteAsset(id, itemtype),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ASSETS_KEY });
      qc.invalidateQueries({ queryKey: ['glpi', 'health'] });
    },
  });
}

export function useAssignGlpiAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ assetId, data, itemtype }: { assetId: number; data: GlpiAssignmentRequest; itemtype?: string }) =>
      glpiApi.assignAsset(assetId, data, itemtype),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ASSETS_KEY });
      qc.invalidateQueries({ queryKey: ['glpi', 'users'] });
      qc.invalidateQueries({ queryKey: ['glpi', 'health'] });
    },
  });
}
