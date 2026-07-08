/**
 * useAuditHistory — Hook para consultar el historial de auditoría de acciones.
 *
 * Fuente de datos: GET /api/actions/history
 * Almacenamiento: tabla action_logs (SQLite, modelo ActionLog)
 *
 * Soporta filtros server-side: action_type, severity, performed_by, search,
 * date_from, date_to, target_ip, paginación real y debounce en búsqueda.
 */

import { useState, useCallback, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { auditApi } from '../services/api';
import type { ActionLogEntry, ActionSeverity, AuditPaginationMeta } from '../types';

export interface AuditFilters {
  action_type: string;    // '' = todos
  severity: string;       // '' = todos | 'critical' | 'high' | 'medium' | 'low' | 'info'
  performed_by: string;   // '' = todos
  search: string;         // búsqueda libre server-side
  date_from: string;      // ISO date string '' = sin límite
  date_to: string;        // ISO date string '' = sin límite
  target_ip: string;      // '' = todos
}

const DEFAULT_FILTERS: AuditFilters = {
  action_type: '',
  severity: '',
  performed_by: '',
  search: '',
  date_from: '',
  date_to: '',
  target_ip: '',
};

const PAGE_SIZE = 50;

export function useAuditHistory() {
  const [page, setPage] = useState(1);
  const [pageSize] = useState(PAGE_SIZE);
  const [filters, setFilters] = useState<AuditFilters>(DEFAULT_FILTERS);

  // Debounce search with a ref timer
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const handleFiltersChange = useCallback((newFilters: Partial<AuditFilters>) => {
    setFilters(prev => {
      const merged = { ...prev, ...newFilters };
      // Debounce only the search field
      if ('search' in newFilters) {
        if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
        searchDebounceRef.current = setTimeout(() => {
          setDebouncedSearch(merged.search);
        }, 400);
      }
      return merged;
    });
    // Reset to page 1 when filters change
    setPage(1);
  }, []);

  // Build clean params (omit empty strings)
  const params = {
    page,
    page_size: pageSize,
    ...(filters.action_type && { action_type: filters.action_type }),
    ...(filters.severity && { severity: filters.severity }),
    ...(filters.performed_by && { performed_by: filters.performed_by }),
    ...(debouncedSearch && { search: debouncedSearch }),
    ...(filters.date_from && { date_from: filters.date_from }),
    ...(filters.date_to && { date_to: filters.date_to }),
    ...(filters.target_ip && { target_ip: filters.target_ip }),
  };

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['audit-history', params],
    queryFn: () => auditApi.getHistory(params),
    staleTime: 0,
    refetchOnWindowFocus: false,
  });

  const entries: ActionLogEntry[] = data?.data?.items ?? [];
  const pagination: AuditPaginationMeta = data?.data?.pagination ?? {
    page: 1,
    page_size: PAGE_SIZE,
    total: 0,
    total_pages: 1,
    has_next: false,
    has_prev: false,
  };

  const goToPage = (p: number) => setPage(p);
  const nextPage = () => pagination.has_next && setPage(p => p + 1);
  const prevPage = () => pagination.has_prev && setPage(p => p - 1);

  const resetFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
    setDebouncedSearch('');
    setPage(1);
  }, []);

  return {
    entries,
    pagination,
    isLoading,
    isError,
    refetch,
    filters,
    setFilters: handleFiltersChange,
    resetFilters,
    page,
    goToPage,
    nextPage,
    prevPage,
  };
}
