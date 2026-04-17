/**
 * useTelegramLogs — Fetches Telegram message history with optional filters.
 */
import { useQuery } from '@tanstack/react-query';
import { telegramApi } from '../services/api';

interface LogFilters {
  limit?: number;
  direction?: 'outbound' | 'inbound' | '';
  message_type?: string;
}

export function useTelegramLogs(filters: LogFilters = {}) {
  return useQuery({
    queryKey: ['telegram', 'logs', filters],
    queryFn: async () => {
      const params: Record<string, unknown> = { limit: filters.limit ?? 20 };
      if (filters.direction) params.direction = filters.direction;
      if (filters.message_type) params.message_type = filters.message_type;
      const res = await telegramApi.getLogs(params as Parameters<typeof telegramApi.getLogs>[0]);
      return res.data ?? [];
    },
    staleTime: 10_000,
    refetchInterval: 30_000,
  });
}
