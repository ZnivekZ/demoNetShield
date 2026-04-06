/**
 * useNetworkSearch — mutation hook for unified IP/MAC network search.
 * Queries both MikroTik ARP and Wazuh agents/alerts in a single call.
 */
import { useState, useCallback } from 'react';
import { networkApi } from '../services/api';
import type { NetworkSearchResult } from '../types';

export function useNetworkSearch() {
  const [result, setResult] = useState<NetworkSearchResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = useCallback(async (query: string) => {
    if (!query.trim()) return;
    setIsLoading(true);
    setError(null);
    try {
      const response = await networkApi.search(query.trim());
      if (response.success) {
        setResult(response.data ?? null);
      } else {
        setError(response.error ?? 'Search failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search error');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const clear = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  return { search, result, isLoading, error, clear };
}
