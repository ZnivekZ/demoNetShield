/**
 * useAuditHistory — Hook para consultar el historial de auditoría de acciones.
 *
 * Fuente de datos: GET /api/actions/history
 * Almacenamiento: tabla action_logs (SQLite, modelo ActionLog)
 *
 * Soporta filtros opcionales por action_type y performed_by.
 * Los filtros se aplican en el cliente para evitar modificar el endpoint existente.
 */

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { auditApi } from '../services/api';
import type { ActionLogEntry } from '../types';

export interface AuditFilters {
  action_type: string;   // '' = todos
  performed_by: string;  // '' = todos
  search: string;        // búsqueda libre en details/comment
}

const DEFAULT_FILTERS: AuditFilters = {
  action_type: '',
  performed_by: '',
  search: '',
};

const PAGE_SIZE = 50;

export function useAuditHistory() {
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [filters, setFilters] = useState<AuditFilters>(DEFAULT_FILTERS);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['audit-history', limit],
    queryFn: () => auditApi.getHistory({ limit }),
    staleTime: 0, // siempre refetch al montar
    refetchOnWindowFocus: false,
  });

  const allEntries: ActionLogEntry[] = data?.data ?? [];

  // Filtrado en cliente (el endpoint existente solo soporta limit)
  const filtered = useMemo(() => {
    return allEntries.filter(entry => {
      if (filters.action_type && !entry.action_type.startsWith(filters.action_type)) {
        return false;
      }
      if (filters.performed_by && entry.performed_by !== filters.performed_by) {
        return false;
      }
      if (filters.search) {
        const q = filters.search.toLowerCase();
        const inType = entry.action_type.toLowerCase().includes(q);
        const inComment = entry.comment?.toLowerCase().includes(q) ?? false;
        const inDetails = JSON.stringify(entry.details ?? {}).toLowerCase().includes(q);
        const inIp = entry.target_ip?.toLowerCase().includes(q) ?? false;
        const inBy = entry.performed_by.toLowerCase().includes(q);
        if (!inType && !inComment && !inDetails && !inIp && !inBy) return false;
      }
      return true;
    });
  }, [allEntries, filters]);

  // Lista única de operadores para el dropdown
  const operators = useMemo(() => {
    const set = new Set(allEntries.map(e => e.performed_by));
    return Array.from(set).sort();
  }, [allEntries]);

  const loadMore = () => setLimit(prev => prev + PAGE_SIZE);

  const resetFilters = () => setFilters(DEFAULT_FILTERS);

  const hasMore = allEntries.length === limit;

  return {
    entries: filtered,
    totalFetched: allEntries.length,
    isLoading,
    isError,
    refetch,
    filters,
    setFilters,
    resetFilters,
    operators,
    loadMore,
    hasMore,
  };
}
