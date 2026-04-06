/**
 * usePortalUsers — TanStack Query hooks for hotspot user CRUD.
 * All HTTP via portalApi — no direct fetch in components.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { portalApi } from '../services/api';
import type { PortalUserCreate, PortalUserUpdate } from '../types';

// ── Queries ────────────────────────────────────────────────────

export function usePortalUsers(params?: {
  search?: string;
  profile?: string;
  limit?: number;
  offset?: number;
}) {
  return useQuery({
    queryKey: ['portal', 'users', params],
    queryFn: () => portalApi.getUsers(params),
    refetchInterval: 30_000,
    select: (r) => r.data ?? [],
  });
}

export function usePortalSessionHistory(params?: {
  from_date?: string;
  to_date?: string;
  user?: string;
  limit?: number;
}) {
  return useQuery({
    queryKey: ['portal', 'sessions', 'history', params],
    queryFn: () => portalApi.getSessionHistory(params),
    refetchInterval: 60_000,
    select: (r) => r.data ?? [],
  });
}

// ── Mutations ─────────────────────────────────────────────────

export function useCreatePortalUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: PortalUserCreate) => portalApi.createUser(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['portal', 'users'] });
    },
  });
}

export function useUpdatePortalUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ username, data }: { username: string; data: PortalUserUpdate }) =>
      portalApi.updateUser(username, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['portal', 'users'] });
    },
  });
}

export function useDeletePortalUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (username: string) => portalApi.deleteUser(username),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['portal', 'users'] });
    },
  });
}

export function useDisconnectPortalUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (username: string) => portalApi.disconnectUser(username),
    onSuccess: () => {
      // Invalidate sessions — user is gone from active list
      qc.invalidateQueries({ queryKey: ['portal', 'sessions'] });
    },
  });
}

export function useBulkCreatePortalUsers() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (users: PortalUserCreate[]) => portalApi.bulkCreateUsers(users),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['portal', 'users'] });
    },
  });
}
