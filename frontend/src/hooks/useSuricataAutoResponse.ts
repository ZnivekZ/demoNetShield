/**
 * useSuricataAutoResponse — Hook para el circuito de respuesta automática.
 * Maneja: config (GET/PUT) e historial, trigger manual con confirmación.
 *
 * El auto_trigger automático sin confirmación humana está deshabilitado por defecto.
 * El trigger siempre pasa por ConfirmModal en el frontend antes de llamar la API.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { suricataApi } from '../services/api';
import type { AutoResponseConfig } from '../types';

export function useSuricataAutoResponse() {
  const queryClient = useQueryClient();

  const configQuery = useQuery({
    queryKey: ['suricata', 'autoresponse-config'],
    queryFn: () => suricataApi.getAutoResponseConfig(),
    refetchInterval: 30_000,
    select: r => r.data,
  });

  const updateConfigMutation = useMutation({
    mutationFn: (data: Partial<AutoResponseConfig & {
      crowdsec_ban?: boolean;
      mikrotik_block?: boolean;
      default_duration?: string;
    }>) => suricataApi.updateAutoResponseConfig(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suricata', 'autoresponse-config'] });
    },
  });

  const triggerMutation = useMutation({
    mutationFn: (params: {
      ip: string;
      trigger_alert_id: string;
      duration?: string;
      reason?: string;
    }) => suricataApi.triggerAutoResponse(params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suricata', 'autoresponse-config'] });
    },
  });

  return {
    config: configQuery.data?.config,
    recentHistory: configQuery.data?.recent_history ?? [],
    isLoading: configQuery.isLoading,
    isError: configQuery.isError,

    // Config update
    updateConfig: updateConfigMutation.mutate,
    isUpdating: updateConfigMutation.isPending,
    updateError: updateConfigMutation.error,

    // Trigger (ALWAYS requires manual confirmation in UI before calling)
    trigger: triggerMutation.mutate,
    isTriggering: triggerMutation.isPending,
    triggerResult: triggerMutation.data?.data,
    triggerError: triggerMutation.error,

    // Helpers
    isCircuitEnabled: configQuery.data?.config?.enabled ?? false,
    isAutoTriggerOn: configQuery.data?.config?.auto_trigger ?? false,
  };
}
