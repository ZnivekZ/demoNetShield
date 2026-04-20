/**
 * Hooks para widgets de la categoría HÍBRIDA.
 * Todos usan APIs de múltiples fuentes con manejo de fallo parcial.
 */

import { useQuery, useMutation } from '@tanstack/react-query';
import {
  widgetsApi,
  geoipApi,
  networkApi,
  crowdsecApi,
  wazuhApi,
  suricataApi,
  mikrotikApi,
  telegramApi,
  vlansApi,
  actionsApi,
  phishingApi,
} from '../../../services/api';

/* ── IP Profiler ───────────────────────────────────────────────── */

export function useIpProfiler(ip: string | null) {
  return useQuery({
    queryKey: ['widget', 'ip-profiler', ip],
    enabled: !!ip && ip.length > 6,
    queryFn: async () => {
      if (!ip) return null;
      const [networkRes, geoRes, csRes] = await Promise.allSettled([
        networkApi.search(ip),
        geoipApi.lookup(ip),
        crowdsecApi.getIpContext(ip),
      ]);
      return {
        ip,
        network: networkRes.status === 'fulfilled' && networkRes.value.success
          ? networkRes.value.data : null,
        geo: geoRes.status === 'fulfilled' && geoRes.value.success
          ? geoRes.value.data : null,
        crowdsec: csRes.status === 'fulfilled' && csRes.value.success
          ? csRes.value.data : null,
        partial:
          networkRes.status === 'rejected' ||
          geoRes.status === 'rejected' ||
          csRes.status === 'rejected',
      };
    },
    staleTime: 60_000,
  });
}

/* ── Confirmed Threats ─────────────────────────────────────────── */

export function useConfirmedThreats() {
  return useQuery({
    queryKey: ['widget', 'confirmed-threats'],
    queryFn: async () => {
      const res = await widgetsApi.getConfirmedThreats();
      if (!res.success) throw new Error(res.error ?? 'Error');
      return res.data!;
    },
    staleTime: 60_000,
    refetchInterval: 2 * 60_000,
  });
}

/* ── Country Radar ─────────────────────────────────────────────── */

export function useCountryRadar(limit = 6) {
  return useQuery({
    queryKey: ['widget', 'country-radar', limit],
    queryFn: async () => {
      const res = await geoipApi.getTopCountries({ limit });
      if (!res.success) throw new Error(res.error ?? 'Error');
      return res.data!;
    },
    staleTime: 5 * 60_000,
  });
}

/* ── Incident Lifecycle ────────────────────────────────────────── */

export function useIncidentLifecycle(ip: string) {
  return useQuery({
    queryKey: ['widget', 'incident-lifecycle', ip],
    queryFn: async () => {
      const res = await widgetsApi.getIncidentLifecycle(ip);
      if (!res.success) throw new Error(res.error ?? 'Error');
      return res.data!;
    },
    staleTime: 60_000,
  });
}

/* ── Defense Layers ────────────────────────────────────────────── */

export function useDefenseLayers() {
  return useQuery({
    queryKey: ['widget', 'defense-layers'],
    queryFn: async () => {
      const [wazuhRes, mikrotikRes, csRes, surRes] = await Promise.allSettled([
        wazuhApi.getHealth(),
        mikrotikApi.getHealth(),
        crowdsecApi.getMetrics(),
        suricataApi.getEngineStatus(),
      ]);
      return {
        wazuh: {
          ok: wazuhRes.status === 'fulfilled' && wazuhRes.value.success,
          label: 'Wazuh SIEM',
        },
        mikrotik: {
          ok: mikrotikRes.status === 'fulfilled' && mikrotikRes.value.success,
          label: 'MikroTik Firewall',
        },
        crowdsec: {
          ok: csRes.status === 'fulfilled' && csRes.value.success,
          label: 'CrowdSec IPS',
          decisions: (csRes.status === 'fulfilled' && csRes.value.success)
            ? csRes.value.data?.active_decisions : undefined,
        },
        suricata: {
          ok: surRes.status === 'fulfilled' && surRes.value.success,
          label: 'Suricata IDS',
          mode: (surRes.status === 'fulfilled' && surRes.value.success)
            ? surRes.value.data?.mode : undefined,
        },
        partial: [wazuhRes, mikrotikRes, csRes, surRes].some(r => r.status === 'rejected'),
      };
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

/* ── Geoblock Predictor ────────────────────────────────────────── */

export function useGeoblockPredictor() {
  return useQuery({
    queryKey: ['widget', 'geoblock-predictor'],
    queryFn: async () => {
      const res = await geoipApi.getSuggestions();
      if (!res.success) throw new Error(res.error ?? 'Error');
      return res.data ?? [];
    },
    staleTime: 5 * 60_000,
  });
}

export function useApplyGeoblockSuggestion() {
  return useMutation({
    mutationFn: ({ id, duration }: { id: string; duration: string }) =>
      geoipApi.applySuggestion(id, duration),
  });
}

/* ── Suricata × GLPI ───────────────────────────────────────────── */

export function useSuricataGlpi(limit = 10) {
  return useQuery({
    queryKey: ['widget', 'suricata-glpi', limit],
    queryFn: async () => {
      const res = await widgetsApi.getSuricataAssetCorrelation(limit);
      if (!res.success) throw new Error(res.error ?? 'Error');
      return res.data!;
    },
    staleTime: 2 * 60_000,
  });
}

/* ── World Threat Map ──────────────────────────────────────────── */

export function useWorldThreatMap() {
  return useQuery({
    queryKey: ['widget', 'world-threat-map'],
    queryFn: async () => {
      const res = await widgetsApi.getWorldThreatMap();
      if (!res.success) throw new Error(res.error ?? 'Error');
      return res.data!;
    },
    staleTime: 5 * 60_000,
  });
}

/* ── View Report Generator ─────────────────────────────────────── */

export function useViewReportGenerator() {
  return useMutation({
    mutationFn: (data: {
      view_id: string;
      widget_ids: string[];
      audience?: string;
      output?: string;
      report_title?: string;
    }) => widgetsApi.generateViewReport(data),
  });
}

/* ── Telegram Activity ─────────────────────────────────────────── */

export function useTelegramActivity(limit = 20) {
  return useQuery({
    queryKey: ['widget', 'telegram-activity', limit],
    queryFn: async () => {
      const [statusRes, logsRes] = await Promise.allSettled([
        telegramApi.getStatus(),
        telegramApi.getLogs({ limit }),
      ]);
      const status = statusRes.status === 'fulfilled' && statusRes.value.success
        ? statusRes.value.data : null;
      const logs = logsRes.status === 'fulfilled' && logsRes.value.success
        ? (logsRes.value.data ?? []) : [];
      const today = new Date().toDateString();
      const sent = logs.filter((m: { direction?: string; timestamp?: string }) =>
        m.direction === 'outbound' && new Date(m.timestamp ?? '').toDateString() === today
      ).length;
      const received = logs.filter((m: { direction?: string; timestamp?: string }) =>
        m.direction === 'inbound' && new Date(m.timestamp ?? '').toDateString() === today
      ).length;
      return { status, logs, sent_today: sent, received_today: received };
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

/* ── MITRE Matrix ──────────────────────────────────────────────── */

export function useMitreMatrix() {
  return useQuery({
    queryKey: ['widget', 'mitre-matrix'],
    queryFn: async () => {
      const res = await wazuhApi.getMitreSummary();
      if (!res.success) throw new Error(res.error ?? 'Error cargando MITRE');
      const items = res.data ?? [];
      // Agrupa por táctica
      const byTactic = new Map<string, { technique: string; count: number }[]>();
      for (const item of items) {
        const tactic = (item as { tactic?: string }).tactic ?? 'Unknown';
        const technique = (item as { technique?: string; id?: string }).technique ?? (item as { id?: string }).id ?? '?';
        const count = (item as { count?: number }).count ?? 1;
        if (!byTactic.has(tactic)) byTactic.set(tactic, []);
        byTactic.get(tactic)!.push({ technique, count });
      }
      return {
        tactics: Array.from(byTactic.entries()).map(([tactic, techniques]) => ({
          tactic,
          techniques,
          total: techniques.reduce((s, t) => s + t.count, 0),
        })),
        total_detections: items.reduce((s, i) => s + ((i as { count?: number }).count ?? 1), 0),
      };
    },
    staleTime: 5 * 60_000,
    refetchInterval: 10 * 60_000,
  });
}

/* ── VLAN Health ───────────────────────────────────────────────── */

export function useVlanHealth() {
  return useQuery({
    queryKey: ['widget', 'vlan-health'],
    queryFn: async () => {
      const [vlansRes, alertsRes] = await Promise.allSettled([
        vlansApi.getVlans(),
        wazuhApi.getAlerts(200),
      ]);
      const vlans = vlansRes.status === 'fulfilled' && vlansRes.value.success
        ? (vlansRes.value.data ?? []) : [];
      const alerts = alertsRes.status === 'fulfilled' && alertsRes.value.success
        ? (alertsRes.value.data ?? []) : [];

      return {
        vlans: (vlans as Array<{ vlan_id?: number; name?: string; address?: string }>).map(v => {
          // Cuenta alertas que contienen la subred del VLAN (simplificado: match por nombre)
          const count = alerts.filter((a: { description?: string; agent_name?: string }) =>
            (a.description ?? '').includes(v.name ?? '') ||
            (a.agent_name ?? '').includes(v.name ?? '')
          ).length;
          const health = count === 0 ? 'ok' : count < 5 ? 'warning' : 'critical';
          return { ...v, alert_count: count, health };
        }),
        partial: vlansRes.status === 'rejected' || alertsRes.status === 'rejected',
      };
    },
    staleTime: 2 * 60_000,
    refetchInterval: 5 * 60_000,
  });
}

/* ── Quarantine Tracker ────────────────────────────────────────── */

export function useQuarantineTracker() {
  return useQuery({
    queryKey: ['widget', 'quarantine-tracker'],
    queryFn: async () => {
      const [assetsRes, logsRes] = await Promise.allSettled([
        actionsApi.getHistory(100),
        actionsApi.getHistory(50),
      ]);
      // Filtra acciones de tipo quarantine del action log
      const logs = logsRes.status === 'fulfilled' && logsRes.value.success
        ? (logsRes.value.data ?? []) : [];
      const quarantined = logs.filter(
        (l: { action_type?: string }) => l.action_type === 'quarantine'
      );
      const unquarantined = new Set(
        logs
          .filter(l => l.action_type === 'unquarantine')
          .map(l => l.target_ip ?? undefined)
      );
      const active = quarantined.filter(
        l => !unquarantined.has(l.target_ip ?? undefined)
      );
      return { active, total_quarantined: quarantined.length, partial: assetsRes.status === 'rejected' };
    },
    staleTime: 60_000,
    refetchInterval: 2 * 60_000,
  });
}

/* ── Sinkhole Effectiveness ────────────────────────────────────── */

export function useSinkholeEffectiveness() {
  return useQuery({
    queryKey: ['widget', 'sinkhole-effectiveness'],
    queryFn: async () => {
      const [sinkholeRes, statsRes] = await Promise.allSettled([
        phishingApi.getSinkholes(),
        phishingApi.getStats(),
      ]);
      const sinkholes = sinkholeRes.status === 'fulfilled' && sinkholeRes.value.success
        ? (sinkholeRes.value.data ?? []) : [];
      const stats = statsRes.status === 'fulfilled' && statsRes.value.success
        ? statsRes.value.data : null;
      const totalBlocked = (stats as { blocked_by_sinkhole?: number } | null)?.blocked_by_sinkhole ?? 0;
      return {
        sinkholes,
        total_blocked: totalBlocked,
        effectiveness_pct: sinkholes.length > 0
          ? Math.min(100, Math.round((totalBlocked / (sinkholes.length * 10)) * 100))
          : 0,
        partial: sinkholeRes.status === 'rejected' || statsRes.status === 'rejected',
      };
    },
    staleTime: 5 * 60_000,
    refetchInterval: 10 * 60_000,
  });
}
