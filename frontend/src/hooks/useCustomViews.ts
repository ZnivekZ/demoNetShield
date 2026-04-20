import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { viewsApi } from '../services/api';
import type { CustomViewCreate, CustomViewUpdate } from '../types';

const VIEWS_KEY = ['custom-views'] as const;

/** Lista todas las vistas personalizadas */
export function useCustomViews() {
  return useQuery({
    queryKey: VIEWS_KEY,
    queryFn: async () => {
      const res = await viewsApi.getAll();
      if (!res.success) throw new Error(res.error ?? 'Error al cargar vistas');
      return res.data ?? [];
    },
    staleTime: 30_000,
  });
}

/** Detalle de una vista por ID */
export function useCustomView(id: string | null) {
  return useQuery({
    queryKey: [...VIEWS_KEY, id],
    queryFn: async () => {
      if (!id) return null;
      const res = await viewsApi.getById(id);
      if (!res.success) throw new Error(res.error ?? 'Error al cargar vista');
      return res.data;
    },
    enabled: !!id,
    staleTime: 30_000,
  });
}

/** Crea una nueva vista */
export function useCreateView() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CustomViewCreate) => viewsApi.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: VIEWS_KEY }),
  });
}

/** Actualiza una vista existente */
export function useUpdateView() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: CustomViewUpdate }) =>
      viewsApi.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: VIEWS_KEY }),
  });
}

/** Elimina una vista */
export function useDeleteView() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => viewsApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: VIEWS_KEY }),
  });
}

/** Marca una vista como la vista por defecto */
export function useSetDefaultView() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => viewsApi.setDefault(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: VIEWS_KEY }),
  });
}
