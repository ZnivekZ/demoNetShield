import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { vlansApi } from '../services/api';

/**
 * Hook for listing VLANs with automatic polling.
 */
export function useVlans() {
  return useQuery({
    queryKey: ['vlans'],
    queryFn: vlansApi.getVlans,
    refetchInterval: 10000,
  });
}

/**
 * Hook to create a new VLAN. Invalidates the VLAN list on success.
 */
export function useCreateVlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { vlan_id: number; name: string; interface: string; comment?: string }) => {
      const res = await vlansApi.createVlan(data);
      if (!res.success) throw new Error(res.error || 'Error al crear VLAN');
      return res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vlans'] });
    },
  });
}

/**
 * Hook to update a VLAN. Invalidates the VLAN list on success.
 */
export function useUpdateVlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ vlanId, data }: { vlanId: string; data: { name?: string; comment?: string } }) => {
      const res = await vlansApi.updateVlan(vlanId, data);
      if (!res.success) throw new Error(res.error || 'Error al actualizar VLAN');
      return res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vlans'] });
    },
  });
}

/**
 * Hook to delete a VLAN. Invalidates the VLAN list on success.
 */
export function useDeleteVlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vlanId: string) => {
      const res = await vlansApi.deleteVlan(vlanId);
      if (!res.success) throw new Error(res.error || 'Error al eliminar VLAN');
      return res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vlans'] });
    },
  });
}
