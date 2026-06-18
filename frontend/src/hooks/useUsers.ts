/**
 * useUsers — CRUD de usuarios del dashboard NetShield.
 *
 * Usa TanStack Query con queryKey ['auth-users'].
 * Sigue el patrón exacto de usePortalUsers y otros hooks existentes.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authApi } from '../services/api';
import type { UserCreate, UserUpdate } from '../types';

export function useUsers() {
  const queryClient = useQueryClient();

  const {
    data,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['auth-users'],
    queryFn: () => authApi.getUsers(),
    select: (res) => res.data ?? [],
  });

  const createUser = useMutation({
    mutationFn: (payload: UserCreate) => authApi.createUser(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auth-users'] });
    },
  });

  const updateUser = useMutation({
    mutationFn: ({ id, data }: { id: number; data: UserUpdate }) =>
      authApi.updateUser(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auth-users'] });
    },
  });

  const deleteUser = useMutation({
    mutationFn: (id: number) => authApi.deleteUser(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auth-users'] });
    },
  });

  return {
    users: data ?? [],
    isLoading,
    isError,
    error,
    createUser,
    updateUser,
    deleteUser,
  };
}
