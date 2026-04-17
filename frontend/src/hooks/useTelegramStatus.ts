/**
 * useTelegramStatus — Polls GET /api/reports/telegram/status every 30s.
 */
import { useQuery } from '@tanstack/react-query';
import { telegramApi } from '../services/api';

export function useTelegramStatus() {
  return useQuery({
    queryKey: ['telegram', 'status'],
    queryFn: async () => {
      const res = await telegramApi.getStatus();
      return res.data ?? null;
    },
    refetchInterval: 30_000,
    staleTime: 20_000,
  });
}
