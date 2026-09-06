/**
 * Hooks para widgets de la categoría TÉCNICA.
 */

import { useQuery } from '@tanstack/react-query';
import {
  widgetsApi,
  mikrotikApi,
  actionsApi,
  glpiApi,
  dhcpApi,
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
// Suricata integration removed — widget currently disabled.
export function usePacketInspector(_limit = 20) {
  return useQuery({
    queryKey: ['widget', 'packet-inspector'],
    queryFn: async () => [] as const,
    enabled: false,
    staleTime: Infinity,
  });
}

/* ── Flow Table ────────────────────────────────────────────────── */
// Suricata integration removed — widget currently disabled.
export function useFlowTable(_limit = 30) {
  return useQuery({
    queryKey: ['widget', 'flow-table'],
    queryFn: async () => [] as const,
    enabled: false,
    staleTime: Infinity,
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
// Suricata integration removed — widget currently disabled.
export function useDnsMonitor(_limit = 30) {
  return useQuery({
    queryKey: ['widget', 'dns-monitor'],
    queryFn: async () => [] as const,
    enabled: false,
    staleTime: Infinity,
  });
}

/* ── TLS Fingerprint ───────────────────────────────────────────── */
// Suricata integration removed — widget currently disabled.
export function useTlsFingerprint(_limit = 20) {
  return useQuery({
    queryKey: ['widget', 'tls-fingerprint'],
    queryFn: async () => [] as const,
    enabled: false,
    staleTime: Infinity,
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
// Suricata integration removed — widget currently disabled.
export function useHttpInspector(_limit = 25) {
  return useQuery({
    queryKey: ['widget', 'http-inspector'],
    queryFn: async () => [] as const,
    enabled: false,
    staleTime: Infinity,
  });
}

/* ── DHCP Leases ───────────────────────────────────────────── */

export function useDhcpLeasesWidget(limit = 10) {
  return useQuery({
    queryKey: ['widget', 'dhcp-leases', limit],
    queryFn: async () => {
      const res = await dhcpApi.getLeases();
      if (!res.success) throw new Error(res.error ?? 'Error cargando leases DHCP');
      return (res.data ?? []).slice(0, limit);
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

/* ── NAT Table ─────────────────────────────────────────────── */

export function useNatTable() {
  return useQuery({
    queryKey: ['widget', 'nat-table'],
    queryFn: async () => {
      const res = await mikrotikApi.getNatRules();
      if (!res.success) throw new Error(res.error ?? 'Error cargando reglas NAT');
      return res.data ?? [];
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

/* ── Route Table ───────────────────────────────────────────── */

export function useRouteTable() {
  return useQuery({
    queryKey: ['widget', 'route-table'],
    queryFn: async () => {
      const res = await mikrotikApi.getRoutes();
      if (!res.success) throw new Error(res.error ?? 'Error cargando rutas');
      return res.data ?? [];
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}
