/**
 * usePortalConfig — TanStack Query hooks for hotspot config, profiles, and schedule.
 * All HTTP via portalApi — no direct fetch in components.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { portalApi } from '../services/api';
import type { PortalProfileCreate, PortalScheduleConfig } from '../types';

// ── Queries ────────────────────────────────────────────────────

export function usePortalStatus() {
  return useQuery({
    queryKey: ['portal', 'status'],
    queryFn: () => portalApi.getStatus(),
    refetchInterval: 30_000,
    select: (r) => r.data,
  });
}

export function usePortalConfig() {
  return useQuery({
    queryKey: ['portal', 'config'],
    queryFn: () => portalApi.getConfig(),
    refetchInterval: 60_000,
    select: (r) => r.data,
  });
}

export function usePortalProfiles() {
  return useQuery({
    queryKey: ['portal', 'profiles'],
    queryFn: () => portalApi.getProfiles(),
    refetchInterval: 30_000,
    select: (r) => r.data ?? [],
  });
}

export function usePortalSchedule() {
  return useQuery({
    queryKey: ['portal', 'schedule'],
    queryFn: () => portalApi.getSchedule(),
    refetchInterval: 60_000,
    select: (r) => r.data,
  });
}

// ── Mutations ─────────────────────────────────────────────────

export function useSetupHotspot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => portalApi.setupHotspot(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['portal', 'status'] });
      qc.invalidateQueries({ queryKey: ['portal', 'config'] });
      qc.invalidateQueries({ queryKey: ['portal', 'profiles'] });
    },
  });
}

export function useCreatePortalProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: PortalProfileCreate) => portalApi.createProfile(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['portal', 'profiles'] });
    },
  });
}

export function useUpdatePortalProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, data }: { name: string; data: Partial<PortalProfileCreate> }) =>
      portalApi.updateProfile(name, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['portal', 'profiles'] });
    },
  });
}

export function useUpdateUnregisteredSpeed() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ up, down }: { up: string; down: string }) =>
      portalApi.updateUnregisteredSpeed(up, down),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['portal', 'profiles'] });
    },
  });
}

export function useUpdateSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: PortalScheduleConfig) => portalApi.updateSchedule(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['portal', 'schedule'] });
    },
  });
}
