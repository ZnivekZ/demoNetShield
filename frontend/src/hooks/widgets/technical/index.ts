/**
 * Hooks para widgets de la categoría TÉCNICA.
 */

import { useQuery } from '@tanstack/react-query';
import {
  widgetsApi,
  suricataApi,
  mikrotikApi,
  crowdsecApi,
  actionsApi,
  glpiApi,
} from '../../../services/api';

/* ── Action Log ────────────────────────────────────────────────── */

export function useActionLogWidget(limit = 50) {
  return useQuery({
    queryKey: ['widget', 'action-log', limit],
    queryFn: async () => {
      const res = await actionsApi.getHistory(limit);
      if (!res.success) throw new Error(res.error ?? 'Error');
      return res.data ?? [];
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

/* ── Packet Inspector ──────────────────────────────────────────── */

export function usePacketInspector(limit = 20) {
  return useQuery({
    queryKey: ['widget', 'packet-inspector', limit],
    queryFn: async () => {
      const res = await suricataApi.getAlerts({ limit });
      if (!res.success) throw new Error(res.error ?? 'Error');
      return res.data!;
    },
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}

/* ── Flow Table ────────────────────────────────────────────────── */

export function useFlowTable(limit = 30) {
  return useQuery({
    queryKey: ['widget', 'flow-table', limit],
    queryFn: async () => {
      const res = await suricataApi.getFlows({ limit });
      if (!res.success) throw new Error(res.error ?? 'Error');
      return res.data!;
    },
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}

/* ── Firewall Tree ─────────────────────────────────────────────── */

export function useFirewallTree() {
  return useQuery({
    queryKey: ['widget', 'firewall-tree'],
    queryFn: async () => {
      const res = await mikrotikApi.getFirewallRules();
      if (!res.success) throw new Error(res.error ?? 'Error');
      const rules = res.data ?? [];
      // Agrupar por chain
      const grouped: Record<string, typeof rules> = {};
      for (const rule of rules) {
        const chain = (rule as { chain?: string }).chain ?? 'unknown';
        (grouped[chain] ??= []).push(rule);
      }
      return { rules, grouped };
    },
    staleTime: 30_000,
  });
}

/* ── Live Logs ─────────────────────────────────────────────────── */

export function useLiveLogs(limit = 100) {
  return useQuery({
    queryKey: ['widget', 'live-logs', limit],
    queryFn: async () => {
      const res = await mikrotikApi.getLogs(limit);
      if (!res.success) throw new Error(res.error ?? 'Error');
      return res.data ?? [];
    },
    staleTime: 5_000,
    refetchInterval: 10_000,
  });
}

/* ── CrowdSec Raw ──────────────────────────────────────────────── */

export function useCrowdSecRaw(limit = 25) {
  return useQuery({
    queryKey: ['widget', 'crowdsec-raw', limit],
    queryFn: async () => {
      const res = await crowdsecApi.getDecisions();
      if (!res.success) throw new Error(res.error ?? 'Error');
      return (res.data ?? []).slice(0, limit);
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

/* ── Correlation Timeline ──────────────────────────────────────── */

export function useCorrelationTimeline(minutes = 120) {
  return useQuery({
    queryKey: ['widget', 'correlation-timeline', minutes],
    queryFn: async () => {
      const res = await widgetsApi.getCorrelationTimeline(minutes);
      if (!res.success) throw new Error(res.error ?? 'Error');
      return res.data!;
    },
    staleTime: 60_000,
    refetchInterval: 2 * 60_000,
  });
}

/* ── Critical Assets ───────────────────────────────────────────── */

export function useCriticalAssets(limit = 10) {
  return useQuery({
    queryKey: ['widget', 'critical-assets', limit],
    queryFn: async () => {
      const assetsRes = await glpiApi.getAssetHealth().catch(() => null);
      const assets = assetsRes?.success
        ? (assetsRes.data?.assets ?? []) : [];
      const partial = assetsRes === null;
      return { assets: assets.slice(0, limit), partial };
    },
    staleTime: 2 * 60_000,
  });
}

/* ── DNS Monitor ───────────────────────────────────────────────── */

export function useDnsMonitor(limit = 30) {
  return useQuery({
    queryKey: ['widget', 'dns-monitor', limit],
    queryFn: async () => {
      const res = await suricataApi.getDnsQueries({ limit });
      if (!res.success) throw new Error(res.error ?? 'Error cargando DNS');
      return (res.data as { queries?: unknown[]; total?: number } | null)?.queries ?? [];
    },
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}

/* ── TLS Fingerprint ───────────────────────────────────────────── */

export function useTlsFingerprint(limit = 20) {
  return useQuery({
    queryKey: ['widget', 'tls-fingerprint', limit],
    queryFn: async () => {
      const res = await suricataApi.getTlsHandshakes({ limit });
      if (!res.success) throw new Error(res.error ?? 'Error cargando TLS');
      return (res.data as { handshakes?: unknown[]; total?: number } | null)?.handshakes ?? [];
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

/* ── Bandwidth Top ─────────────────────────────────────────────── */

export function useBandwidthTop(limit = 10) {
  return useQuery({
    queryKey: ['widget', 'bandwidth-top', limit],
    queryFn: async () => {
      const res = await mikrotikApi.getConnections();
      if (!res.success) throw new Error(res.error ?? 'Error cargando conexiones');
      const conns = (res.data ?? []) as Array<{ src_address?: string; bytes?: number; orig_bytes?: number }>;
      // Agrega bytes por IP de origen
      const byIp = new Map<string, number>();
      for (const c of conns) {
        const ip = c.src_address ?? 'unknown';
        const bytes = (c.bytes ?? 0) + (c.orig_bytes ?? 0);
        byIp.set(ip, (byIp.get(ip) ?? 0) + bytes);
      }
      const sorted = Array.from(byIp.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([ip, bytes]) => ({ ip, bytes }));
      const max = sorted[0]?.bytes ?? 1;
      return sorted.map(r => ({ ...r, pct: Math.round((r.bytes / max) * 100) }));
    },
    staleTime: 10_000,
    refetchInterval: 20_000,
  });
}

/* ── HTTP Inspector ────────────────────────────────────────────── */

export function useHttpInspector(limit = 25) {
  return useQuery({
    queryKey: ['widget', 'http-inspector', limit],
    queryFn: async () => {
      const res = await suricataApi.getHttpTransactions({ limit });
      if (!res.success) throw new Error(res.error ?? 'Error cargando HTTP');
      return (res.data as { transactions?: unknown[]; total?: number } | null)?.transactions ?? [];
    },
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}
