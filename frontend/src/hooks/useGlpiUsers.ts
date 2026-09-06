/**
 * useGlpiUsers — TanStack Query hook for GLPI user management.
 * Provides user list with assets assigned per user.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { glpiApi } from '../services/api';
import type { GlpiUserCreate, GlpiUserUpdate } from '../types';

const USERS_KEY = ['glpi', 'users'] as const;

export function useGlpiUsers(params?: { search?: string; limit?: number }) {
  return useQuery({
    queryKey: [...USERS_KEY, params],
    queryFn: () => glpiApi.getUsers(params),
    staleTime: 60_000,
    select: (res) => ({
      users: res.data?.users ?? [],
    }),
  });
}

export function useGlpiUserAssets(userId: number | null) {
  return useQuery({
    queryKey: ['glpi', 'users', userId, 'assets'],
    queryFn: () => glpiApi.getUserAssets(userId!),
    enabled: userId !== null,
    staleTime: 30_000,
    select: (res) => res.data?.assets ?? [],
  });
}

export function useCreateGlpiUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: GlpiUserCreate) => glpiApi.createUser(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: USERS_KEY }),
  });
}

export function useUpdateGlpiUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: GlpiUserUpdate }) =>
      glpiApi.updateUser(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: USERS_KEY }),
  });
}

export function useDeleteGlpiUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => glpiApi.deleteUser(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: USERS_KEY }),
  });
}
