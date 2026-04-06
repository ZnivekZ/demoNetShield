/**
 * useGlpiTickets — TanStack Query hook for GLPI ticket management.
 * Provides ticket list (grouped for kanban), create, and status update mutations.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { glpiApi } from '../services/api';
import type { GlpiTicketCreate } from '../types';

const TICKETS_KEY = ['glpi', 'tickets'] as const;

export function useGlpiTickets(params?: {
  priority?: number;
  status?: string;
  limit?: number;
}) {
  return useQuery({
    queryKey: [...TICKETS_KEY, params],
    queryFn: () => glpiApi.getTickets(params),
    staleTime: 20_000,
    select: (res) => ({
      tickets: res.data?.tickets ?? [],
      kanban: res.data?.kanban ?? { pendiente: [], en_progreso: [], resuelto: [] },
      mock: res.data?.mock ?? false,
    }),
  });
}

export function useCreateGlpiTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: GlpiTicketCreate) => glpiApi.createTicket(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: TICKETS_KEY }),
  });
}

export function useUpdateTicketStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: number }) =>
      glpiApi.updateTicketStatus(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: TICKETS_KEY }),
  });
}

export function useCreateNetworkMaintenance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      interface_name: string;
      error_count: number;
      error_type: string;
      asset_id?: number;
    }) => glpiApi.createNetworkMaintenance(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: TICKETS_KEY }),
  });
}
