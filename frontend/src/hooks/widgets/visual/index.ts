/**
 * Hooks para widgets de la categoría VISUAL.
 * Todos usan TanStack Query y llaman a widgetsApi o APIs existentes.
 */

import { useQuery } from '@tanstack/react-query';
import {
  widgetsApi,
  wazuhApi,
  crowdsecApi,
  mikrotikApi,
  phishingApi,
  dhcpApi,
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
// Suricata integration removed — widget currently disabled.
export function useProtocolDonut() {
  return useQuery({
    queryKey: ['widget', 'protocol-donut'],
    queryFn: async () => ({ protocols: [] } as { protocols: never[] }),
    enabled: false,
    staleTime: Infinity,
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

/* ── DHCP Subnet Usage ─────────────────────────────────────────── */

export function useSubnetUsageWidget() {
  return useQuery({
    queryKey: ['widget', 'dhcp-subnet-usage'],
    queryFn: async () => {
      const res = await dhcpApi.getSubnetUsage();
      if (!res.success) throw new Error(res.error ?? 'Error cargando uso de subredes');
      return res.data ?? [];
    },
    staleTime: 60_000,
    refetchInterval: 2 * 60_000,
  });
}

/* ── Queue Bars ────────────────────────────────────────────────── */

export function useQueueBars() {
  return useQuery({
    queryKey: ['widget', 'queue-bars'],
    queryFn: async () => {
      const res = await mikrotikApi.getQueues();
      if (!res.success) throw new Error(res.error ?? 'Error cargando queues');
      const queues = (res.data ?? []) as Array<{
        id: string; name: string; target: string;
        max_limit: string; rate: string; dropped: number;
        bytes: number; disabled: boolean;
      }>;
      // Calcular % de uso: rate actual / max_limit
      function parseMbps(s: string): number {
        const v = parseFloat(s) || 0;
        if (s.includes('G')) return v * 1000;
        if (s.includes('M')) return v;
        if (s.includes('K')) return v / 1000;
        return v / 1_000_000;
      }
      return queues.map(q => {
        const [rateUp, rateDown] = q.rate.split('/').map(parseMbps);
        const [maxUp, maxDown] = q.max_limit.split('/').map(parseMbps);
        const pctUp = maxUp > 0 ? Math.min(100, Math.round((rateUp / maxUp) * 100)) : 0;
        const pctDown = maxDown > 0 ? Math.min(100, Math.round((rateDown / maxDown) * 100)) : 0;
        return {
          id: q.id, name: q.name, target: q.target,
          max_limit: q.max_limit, rate: q.rate,
          pct_up: pctUp, pct_down: pctDown,
          dropped: q.dropped, disabled: q.disabled,
        };
      });
    },
    staleTime: 10_000,
    refetchInterval: 15_000,
  });
}
