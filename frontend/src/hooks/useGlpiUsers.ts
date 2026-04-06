/**
 * useGlpiUsers — TanStack Query hook for GLPI user management.
 * Provides user list with assets assigned per user.
 */
import { useQuery } from '@tanstack/react-query';
import { glpiApi } from '../services/api';

export function useGlpiUsers(params?: { search?: string; limit?: number }) {
  return useQuery({
    queryKey: ['glpi', 'users', params],
    queryFn: () => glpiApi.getUsers(params),
    staleTime: 60_000,
    select: (res) => ({
      users: res.data?.users ?? [],
      mock: res.data?.mock ?? false,
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
