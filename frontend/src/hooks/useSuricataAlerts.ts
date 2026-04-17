/**
 * useSuricataAlerts — Hook para alertas IDS/IPS de Suricata.
 * Maneja: listado con filtros, timeline, top firmas, categorías.
 * Suscripción WebSocket a /ws/suricata/alerts para alertas en tiempo real.
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { suricataApi } from '../services/api';
import type { SuricataAlert } from '../types';

interface AlertFilters {
  src_ip?: string;
  dst_ip?: string;
  category?: string;
  severity?: number;
  limit?: number;
  offset?: number;
}

export function useSuricataAlerts(initialFilters: AlertFilters = {}) {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<AlertFilters>({ limit: 50, ...initialFilters });
  const [liveAlerts, setLiveAlerts] = useState<SuricataAlert[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const tickRef = useRef(0);

  // ── REST queries ──────────────────────────────────────────────────
  const alertsQuery = useQuery({
    queryKey: ['suricata', 'alerts', filters],
    queryFn: () => suricataApi.getAlerts(filters),
    refetchInterval: 15_000,
    select: r => r.data,
  });

  const timelineQuery = useQuery({
    queryKey: ['suricata', 'alerts-timeline', 120],
    queryFn: () => suricataApi.getAlertsTimeline(120),
    refetchInterval: 30_000,
    select: r => r.data?.timeline ?? [],
  });

  const signaturesQuery = useQuery({
    queryKey: ['suricata', 'top-signatures'],
    queryFn: () => suricataApi.getTopSignatures(10),
    refetchInterval: 30_000,
    select: r => r.data?.signatures ?? [],
  });

  const categoriesQuery = useQuery({
    queryKey: ['suricata', 'categories'],
    queryFn: () => suricataApi.getCategories(),
    refetchInterval: 60_000,
    select: r => r.data?.categories ?? [],
  });

  // ── WebSocket subscription ────────────────────────────────────────
  useEffect(() => {
    const wsUrl = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws/suricata/alerts`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'suricata_alert' && msg.data) {
          setLiveAlerts(prev => {
            // Prepend and cap at 20 live alerts
            const next = [msg.data, ...prev].slice(0, 20);
            return next;
          });
          // Invalidate REST query de alertas para que el contador se actualice
          tickRef.current += 1;
          if (tickRef.current % 5 === 0) {
            queryClient.invalidateQueries({ queryKey: ['suricata', 'alerts'] });
          }
        }
      } catch (_) { /* ignore parse errors */ }
    };

    ws.onerror = () => ws.close();

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [queryClient]);

  // ── Filter controls ───────────────────────────────────────────────
  const updateFilters = useCallback((patch: Partial<AlertFilters>) => {
    setFilters(prev => ({ ...prev, ...patch, offset: 0 }));
  }, []);

  const clearFilters = useCallback(() => {
    setFilters({ limit: 50 });
  }, []);

  return {
    // Data
    alerts: alertsQuery.data?.alerts ?? [],
    total: alertsQuery.data?.total ?? 0,
    timeline: timelineQuery.data ?? [],
    signatures: signaturesQuery.data ?? [],
    categories: categoriesQuery.data ?? [],
    liveAlerts,

    // Loading states
    isLoading: alertsQuery.isLoading,
    isTimelineLoading: timelineQuery.isLoading,
    isError: alertsQuery.isError,

    // Filters
    filters,
    updateFilters,
    clearFilters,
  };
}
