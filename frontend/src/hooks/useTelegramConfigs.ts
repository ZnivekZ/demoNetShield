/**
 * useTelegramConfigs — CRUD for Telegram report configurations.
 * Provides useQuery for listing and useMutation for create/update/delete/trigger.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { telegramApi } from '../services/api';
import type { TelegramReportConfigCreate } from '../types';

const QUERY_KEY = ['telegram', 'configs'];

export function useTelegramConfigs() {
  const qc = useQueryClient();

  const configs = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const res = await telegramApi.getConfigs();
      return res.data ?? [];
    },
    staleTime: 15_000,
  });

  const create = useMutation({
    mutationFn: (data: TelegramReportConfigCreate) => telegramApi.createConfig(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  });

  const update = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<TelegramReportConfigCreate> }) =>
      telegramApi.updateConfig(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  });

  const remove = useMutation({
    mutationFn: (id: number) => telegramApi.deleteConfig(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  });

  const trigger = useMutation({
    mutationFn: (id: number) => telegramApi.triggerConfig(id),
  });

  const sendTest = useMutation({
    mutationFn: () => telegramApi.sendTest(),
  });

  const sendSummary = useMutation({
    mutationFn: (data?: { sources?: string[]; chat_id?: string }) =>
      telegramApi.sendSummary(data),
  });

  return { configs, create, update, remove, trigger, sendTest, sendSummary };
}
