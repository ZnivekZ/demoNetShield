/**
 * Hooks para widgets de la categoría VISUAL.
 * Todos usan TanStack Query y llaman a widgetsApi o APIs existentes.
 */

import { useQuery } from '@tanstack/react-query';
import {
  widgetsApi,
  suricataApi,
  wazuhApi,
  crowdsecApi,
  mikrotikApi,
  portalApi,
  phishingApi,
} from '../../../services/api';

/* ── Threat Gauge ──────────────────────────────────────────────── */

export function useThreatGauge() {
  return useQuery({
    queryKey: ['widget', 'threat-gauge'],
    queryFn: async () => {
      const res = await widgetsApi.getThreatLevel();
      if (!res.success) throw new Error(res.error ?? 'Error cargando nivel de amenaza');
      return res.data!;
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

/* ── Network Pulse ─────────────────────────────────────────────── */

export function useNetworkPulse() {
  return useQuery({
    queryKey: ['widget', 'network-pulse'],
    queryFn: async () => {
      const res = await mikrotikApi.getTraffic();
      if (!res.success) throw new Error(res.error ?? 'Error cargando tráfico');
      return res.data ?? [];
    },
    staleTime: 5_000,
    refetchInterval: 10_000,
  });
}

/* ── Event Counter ─────────────────────────────────────────────── */

export function useEventCounter(source: string = 'wazuh') {
  return useQuery({
    queryKey: ['widget', 'event-counter', source],
    queryFn: async () => {
      if (source === 'crowdsec') {
        const res = await crowdsecApi.getMetrics();
        if (!res.success) throw new Error(res.error ?? 'Error');
        return {
          count: (res.data as { alerts_24h?: number })?.alerts_24h ?? 0,
          source,
          label: 'Alertas CrowdSec 24h',
        };
      }
      if (source === 'suricata') {
        const res = await suricataApi.getEngineStatus();
        if (!res.success) throw new Error(res.error ?? 'Error');
        return {
          count: (res.data as { alerts_total?: number })?.alerts_total ?? 0,
          source,
          label: 'Alertas Suricata',
        };
      }
      // Default: wazuh
      const res = await wazuhApi.getAlertsTimeline();
      if (!res.success) throw new Error(res.error ?? 'Error');
      const total = (res.data ?? []).reduce((s, p) => s + p.count, 0);
      return { count: total, source, label: 'Eventos Wazuh 1h' };
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

/* ── Activity Heatmap ──────────────────────────────────────────── */

export function useActivityHeatmap() {
  return useQuery({
    queryKey: ['widget', 'activity-heatmap'],
    queryFn: async () => {
      const res = await widgetsApi.getActivityHeatmap();
      if (!res.success) throw new Error(res.error ?? 'Error cargando heatmap');
      return res.data!;
    },
    staleTime: 5 * 60_000,
  });
}

/* ── Protocol Donut ────────────────────────────────────────────── */

export function useProtocolDonut() {
  return useQuery({
    queryKey: ['widget', 'protocol-donut'],
    queryFn: async () => {
      const res = await suricataApi.getFlowsStats();
      if (!res.success) throw new Error(res.error ?? 'Error cargando flujos');
      return res.data!;
    },
    staleTime: 60_000,
    refetchInterval: 2 * 60_000,
  });
}

/* ── Agents Thermometer ────────────────────────────────────────── */

export function useAgentsThermometer() {
  return useQuery({
    queryKey: ['widget', 'agents-thermometer'],
    queryFn: async () => {
      const res = await wazuhApi.getAgentsSummary();
      if (!res.success) throw new Error(res.error ?? 'Error cargando agentes');
      return res.data!;
    },
    staleTime: 60_000,
    refetchInterval: 2 * 60_000,
  });
}

/* ── Blocks Timeline ───────────────────────────────────────────── */

export function useBlocksTimeline() {
  return useQuery({
    queryKey: ['widget', 'blocks-timeline'],
    queryFn: async () => {
      const [csRes, mtRes] = await Promise.allSettled([
        crowdsecApi.getDecisions(),
        mikrotikApi.getAddressList('Blacklist_Automatica'),
      ]);
      const csData = csRes.status === 'fulfilled' && csRes.value.success
        ? (csRes.value.data ?? []) : [];
      const mtData = mtRes.status === 'fulfilled' && mtRes.value.success
        ? (mtRes.value.data ?? []) : [];

      return {
        crowdsec: csData,
        mikrotik: mtData,
        total_blocks: csData.length + mtData.length,
        partial: csRes.status === 'rejected' || mtRes.status === 'rejected',
      };
    },
    staleTime: 60_000,
    refetchInterval: 2 * 60_000,
  });
}

/* ── Portal Usage ──────────────────────────────────────────────── */

export function usePortalUsage() {
  return useQuery({
    queryKey: ['widget', 'portal-usage'],
    queryFn: async () => {
      const [sessionsRes, statsRes] = await Promise.allSettled([
        portalApi.getActiveSessions(),
        portalApi.getRealtimeStats(),
      ]);
      const sessions = sessionsRes.status === 'fulfilled' && sessionsRes.value.success
        ? (sessionsRes.value.data ?? []) : [];
      const stats = statsRes.status === 'fulfilled' && statsRes.value.success
        ? statsRes.value.data : null;
      return {
        active: sessions.length,
        max_sessions: (stats as { max_sessions?: number } | null)?.max_sessions ?? 100,
        bytes_up: (stats as { bytes_up?: number } | null)?.bytes_up ?? 0,
        bytes_down: (stats as { bytes_down?: number } | null)?.bytes_down ?? 0,
        partial: sessionsRes.status === 'rejected' || statsRes.status === 'rejected',
      };
    },
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}

/* ── Phishing Stats ────────────────────────────────────────────── */

export function usePhishingStats() {
  return useQuery({
    queryKey: ['widget', 'phishing-stats'],
    queryFn: async () => {
      const res = await phishingApi.getStats();
      if (!res.success) throw new Error(res.error ?? 'Error cargando estadísticas de phishing');
      return res.data!;
    },
    staleTime: 2 * 60_000,
    refetchInterval: 5 * 60_000,
  });
}

/* ── Agent Alert Heatmap ───────────────────────────────────────── */

export function useAgentAlertHeatmap(hours = 12) {
  return useQuery({
    queryKey: ['widget', 'agent-alert-heatmap', hours],
    queryFn: async () => {
      const res = await wazuhApi.getAlerts(200);
      if (!res.success) throw new Error(res.error ?? 'Error cargando alertas');
      const alerts = res.data ?? [];
      const now = Date.now();
      const cutoff = now - hours * 60 * 60 * 1000;
      const agents = new Map<string, number[]>();
      for (const alert of alerts) {
        const ts = new Date(alert.timestamp).getTime();
        if (ts < cutoff) continue;
        const slot = Math.floor((ts - cutoff) / (60 * 60 * 1000));
        if (slot < 0 || slot >= hours) continue;
        const key = alert.agent_name ?? 'unknown';
        if (!agents.has(key)) agents.set(key, new Array(hours).fill(0));
        agents.get(key)![slot]++;
      }
      return {
        hours,
        agents: Array.from(agents.entries()).map(([name, slots]) => ({ name, slots })),
      };
    },
    staleTime: 60_000,
    refetchInterval: 2 * 60_000,
  });
}
