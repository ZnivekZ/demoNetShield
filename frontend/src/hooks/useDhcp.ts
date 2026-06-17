/**
 * DHCP Hooks — TanStack Query hooks for DHCP module.
 * All data fetching for the /dhcp page lives here.
 *
 * Polling intervals:
 *   leases    → 30s  (active clients can change frequently)
 *   servers   → 60s  (rarely change)
 *   networks  → 60s
 *   pools     → 60s
 *   usage     → 30s  (utilization changes with leases)
 *   alerts    → 45s
 *   options   → 120s (very static)
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { dhcpApi } from '../services/api';
import type {
  DhcpLeaseCreate,
  DhcpLeaseUpdate,
  DhcpServerCreate,
  DhcpNetworkCreate,
  DhcpNetworkUpdate,
  DhcpPoolCreate,
  DhcpRogueAlertCreate,
  DhcpOptionCreate,
} from '../types';

// ── Query keys ───────────────────────────────────────────────────────────────

export const dhcpKeys = {
  all: ['dhcp'] as const,
  servers: () => [...dhcpKeys.all, 'servers'] as const,
  leases: (params?: object) => [...dhcpKeys.all, 'leases', params] as const,
  networks: () => [...dhcpKeys.all, 'networks'] as const,
  pools: () => [...dhcpKeys.all, 'pools'] as const,
  usage: () => [...dhcpKeys.all, 'usage'] as const,
  alerts: () => [...dhcpKeys.all, 'alerts'] as const,
  options: () => [...dhcpKeys.all, 'options'] as const,
};

// ── Read hooks ───────────────────────────────────────────────────────────────

export function useDhcpServers() {
  return useQuery({
    queryKey: dhcpKeys.servers(),
    queryFn: () => dhcpApi.getServers(),
    refetchInterval: 60_000,
    select: r => r.data ?? [],
  });
}

export function useDhcpLeases(params?: { server?: string; status?: string; search?: string }) {
  return useQuery({
    queryKey: dhcpKeys.leases(params),
    queryFn: () => dhcpApi.getLeases(params),
    refetchInterval: 30_000,
    select: r => r.data ?? [],
  });
}

export function useDhcpNetworks() {
  return useQuery({
    queryKey: dhcpKeys.networks(),
    queryFn: () => dhcpApi.getNetworks(),
    refetchInterval: 60_000,
    select: r => r.data ?? [],
  });
}

export function useDhcpPools() {
  return useQuery({
    queryKey: dhcpKeys.pools(),
    queryFn: () => dhcpApi.getPools(),
    refetchInterval: 60_000,
    select: r => r.data ?? [],
  });
}

export function useDhcpSubnetUsage() {
  return useQuery({
    queryKey: dhcpKeys.usage(),
    queryFn: () => dhcpApi.getSubnetUsage(),
    refetchInterval: 30_000,
    select: r => r.data ?? [],
  });
}

export function useDhcpRogueAlerts() {
  return useQuery({
    queryKey: dhcpKeys.alerts(),
    queryFn: () => dhcpApi.getRogueAlerts(),
    refetchInterval: 45_000,
    select: r => r.data ?? [],
  });
}

export function useDhcpOptions() {
  return useQuery({
    queryKey: dhcpKeys.options(),
    queryFn: () => dhcpApi.getOptions(),
    refetchInterval: 120_000,
    select: r => r.data ?? [],
  });
}

// ── Mutation hooks ────────────────────────────────────────────────────────────

export function useCreateDhcpLease() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: DhcpLeaseCreate) => dhcpApi.createLease(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: dhcpKeys.all }),
  });
}

export function useUpdateDhcpLease() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: DhcpLeaseUpdate }) =>
      dhcpApi.updateLease(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: dhcpKeys.leases() }),
  });
}

export function useDeleteDhcpLease() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => dhcpApi.deleteLease(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: dhcpKeys.leases() });
      qc.invalidateQueries({ queryKey: dhcpKeys.usage() });
    },
  });
}

export function useMakeDhcpLeaseStatic() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => dhcpApi.makeLeaseStatic(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: dhcpKeys.leases() }),
  });
}

export function useSetDhcpLeaseBlock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, block }: { id: string; block: boolean }) =>
      dhcpApi.setLeaseBlock(id, block),
    onSuccess: () => qc.invalidateQueries({ queryKey: dhcpKeys.leases() }),
  });
}

export function useToggleDhcpServer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, disabled }: { id: string; disabled: boolean }) =>
      dhcpApi.toggleServer(id, disabled),
    onSuccess: () => qc.invalidateQueries({ queryKey: dhcpKeys.servers() }),
  });
}

export function useCreateDhcpServer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: DhcpServerCreate) => dhcpApi.createServer(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: dhcpKeys.servers() }),
  });
}

export function useCreateDhcpNetwork() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: DhcpNetworkCreate) => dhcpApi.createNetwork(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: dhcpKeys.networks() }),
  });
}

export function useUpdateDhcpNetwork() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: DhcpNetworkUpdate }) =>
      dhcpApi.updateNetwork(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: dhcpKeys.networks() }),
  });
}

export function useCreateDhcpPool() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: DhcpPoolCreate) => dhcpApi.createPool(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: dhcpKeys.pools() });
      qc.invalidateQueries({ queryKey: dhcpKeys.usage() });
    },
  });
}

export function useUpdateDhcpPool() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<DhcpPoolCreate> }) =>
      dhcpApi.updatePool(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: dhcpKeys.pools() });
      qc.invalidateQueries({ queryKey: dhcpKeys.usage() });
    },
  });
}

export function useCreateDhcpRogueAlert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: DhcpRogueAlertCreate) => dhcpApi.createRogueAlert(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: dhcpKeys.alerts() }),
  });
}

export function useCreateDhcpOption() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: DhcpOptionCreate) => dhcpApi.createOption(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: dhcpKeys.options() }),
  });
}

// ── Fase 2 Hooks ─────────────────────────────────────────────────────────────

/** S1: DHCP ↔ GLPI correlation — leases enriched with inventory data */
export function useDhcpGlpiCorrelation() {
  return useQuery({
    queryKey: [...dhcpKeys.all, 'glpi-correlation'],
    queryFn: () => dhcpApi.getGlpiCorrelation(),
    refetchInterval: 60_000,
    select: r => r.data ?? [],
  });
}

/** S2: Device discovery — unregistered, registered, stale */
export function useDhcpDiscovery() {
  return useQuery({
    queryKey: [...dhcpKeys.all, 'discovery'],
    queryFn: () => dhcpApi.getDiscovery(),
    refetchInterval: 60_000,
    select: r => r.data ?? { leases: [], stale: [] },
  });
}

/** S3: Wazuh alerts enriched with DHCP lease context */
export function useDhcpWazuhEnriched(limit = 50, levelMin = 5) {
  return useQuery({
    queryKey: [...dhcpKeys.all, 'wazuh-enriched', limit, levelMin],
    queryFn: () => dhcpApi.getWazuhEnriched({ limit, level_min: levelMin }),
    refetchInterval: 30_000,
    select: r => r.data ?? [],
  });
}

/** S4: Block rogue DHCP server via firewall */
export function useBlockRogueDhcp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (alertId: string) => dhcpApi.blockRogueDhcp(alertId),
    onSuccess: () => qc.invalidateQueries({ queryKey: dhcpKeys.alerts() }),
  });
}

/** S5: Create GLPI ticket for unregistered device */
export function useCreateDiscoveryTicket() {
  return useMutation({
    mutationFn: (ip: string) => dhcpApi.createDiscoveryTicket(ip),
  });
}

