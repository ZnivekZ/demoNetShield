import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Network,
  Tag,
  FolderPlus,
  Trash2,
  Plus,
  Search,
  Map,
  Gauge,
  Edit2,
  CheckCircle2,
  XCircle,
  RefreshCw,
  ArrowRight,
} from 'lucide-react';
import { networkApi, mikrotikApi } from '../../services/api';
import type { IPLabel, IPGroup, RouteEntry, IPAddress, BridgePort, QueueEntry, QueueCreate, QueueUpdate } from '../../types';
import VlanPanel from '../vlans/VlanPanel';

type TabId = 'ips' | 'labels' | 'groups' | 'vlans' | 'topologia' | 'queues';

const TAB_LABELS: Record<TabId, string> = {
  ips: 'Tabla ARP',
  labels: 'Etiquetas',
  groups: 'Grupos',
  vlans: 'VLANs',
  topologia: 'Topología',
  queues: 'Queues',
};

export default function NetworkPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabId>('ips');

  // ── Data queries ──
  const { data: arpResp } = useQuery({
    queryKey: ['arp-table'],
    queryFn: mikrotikApi.getArp,
    refetchInterval: 15000,
  });

  const { data: labelsResp } = useQuery({
    queryKey: ['labels'],
    queryFn: networkApi.getLabels,
  });

  const { data: groupsResp } = useQuery({
    queryKey: ['groups'],
    queryFn: networkApi.getGroups,
  });

  const arpEntries = arpResp?.data ?? [];
  const labels = labelsResp?.data ?? [];
  const groups = groupsResp?.data ?? [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-surface-100 flex items-center gap-2">
          <Network className="w-5 h-5 text-brand-400" />
          Red &amp; IPs
        </h1>
        <p className="text-sm text-surface-500 mt-0.5">
          Gestión de dispositivos, etiquetas, grupos, topología y control de ancho de banda
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-surface-900/50 rounded-xl p-1 w-fit overflow-x-auto">
        {(Object.keys(TAB_LABELS) as TabId[]).map((tab) => (
          <button
            key={tab}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === tab
                ? 'bg-brand-600 text-white shadow-lg shadow-brand-500/20'
                : 'text-surface-400 hover:text-surface-200'
            }`}
            onClick={() => setActiveTab(tab)}
          >
            {TAB_LABELS[tab]}
          </button>
        ))}
      </div>

      {activeTab === 'ips' && <ARPTable entries={arpEntries} labels={labels} />}
      {activeTab === 'labels' && (
        <LabelsPanel labels={labels} queryClient={queryClient} />
      )}
      {activeTab === 'groups' && (
        <GroupsPanel groups={groups} queryClient={queryClient} />
      )}
      {activeTab === 'vlans' && (
        <div className="mt-4">
          <VlanPanel />
        </div>
      )}
      {activeTab === 'topologia' && <TopologyPanel />}
      {activeTab === 'queues' && <QueuesPanel />}
    </div>
  );
}

/* ── ARP Table Tab ──────────────────────────────────────────── */

function ARPTable({
  entries,
  labels,
}: {
  entries: { ip_address: string; mac_address: string; interface: string; dynamic: boolean }[];
  labels: IPLabel[];
}) {
  const [filter, setFilter] = useState('');
  const labelMap = Object.fromEntries(labels.map((l) => [l.ip_address, l]));

  const filtered = entries.filter(
    (e) =>
      !filter ||
      e.ip_address.includes(filter) ||
      e.mac_address.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="glass-card p-5 animate-fade-in-up">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-surface-200">
          Dispositivos en Red ({entries.length})
        </h2>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-surface-500" />
          <input
            type="text"
            className="input pl-8 w-48"
            placeholder="Buscar IP o MAC..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
      </div>
      <div className="overflow-auto max-h-96 rounded-lg">
        <table className="data-table">
          <thead>
            <tr>
              <th>IP</th>
              <th>MAC</th>
              <th>Interfaz</th>
              <th>Tipo</th>
              <th>Etiqueta</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((entry, i) => {
              const label = labelMap[entry.ip_address];
              return (
                <tr key={i}>
                  <td className="font-mono text-xs">{entry.ip_address}</td>
                  <td className="font-mono text-xs text-surface-400">
                    {entry.mac_address}
                  </td>
                  <td className="text-xs text-surface-400">{entry.interface}</td>
                  <td>
                    <span
                      className={`badge ${
                        entry.dynamic ? 'badge-info' : 'badge-success'
                      }`}
                    >
                      {entry.dynamic ? 'Dinámico' : 'Estático'}
                    </span>
                  </td>
                  <td>
                    {label ? (
                      <span
                        className="badge"
                        style={{
                          background: `${label.color}20`,
                          color: label.color,
                          border: `1px solid ${label.color}40`,
                        }}
                      >
                        {label.label}
                      </span>
                    ) : (
                      <span className="text-xs text-surface-600">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Labels Panel ───────────────────────────────────────────── */

function LabelsPanel({
  labels,
  queryClient,
}: {
  labels: IPLabel[];
  queryClient: ReturnType<typeof useQueryClient>;
}) {
  const [ip, setIp] = useState('');
  const [label, setLabel] = useState('');
  const [desc, setDesc] = useState('');
  const [color, setColor] = useState('#6366f1');

  const createMutation = useMutation({
    mutationFn: () => networkApi.createLabel(ip, label, desc, color),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['labels'] });
      setIp('');
      setLabel('');
      setDesc('');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => networkApi.deleteLabel(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['labels'] }),
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Create form */}
      <div className="glass-card p-5 animate-fade-in-up">
        <h2 className="text-sm font-semibold text-surface-200 mb-4 flex items-center gap-2">
          <Tag className="w-4 h-4 text-brand-400" />
          Nueva Etiqueta
        </h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (ip && label) createMutation.mutate();
          }}
          className="space-y-3"
        >
          <input
            className="input"
            placeholder="IP (192.168.88.10)"
            value={ip}
            onChange={(e) => setIp(e.target.value)}
            required
          />
          <input
            className="input"
            placeholder="Etiqueta (ej: Servidor Web)"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            required
          />
          <input
            className="input"
            placeholder="Descripción (opcional)"
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
          />
          <div className="flex items-center gap-2">
            <label className="text-xs text-surface-400">Color:</label>
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="w-8 h-8 rounded cursor-pointer bg-transparent border-none"
            />
          </div>
          <button
            type="submit"
            className="btn btn-primary w-full"
            disabled={createMutation.isPending}
          >
            <Plus className="w-4 h-4" />
            Asignar Etiqueta
          </button>
        </form>
      </div>

      {/* Labels list */}
      <div className="lg:col-span-2 glass-card p-5 animate-fade-in-up stagger-2">
        <h2 className="text-sm font-semibold text-surface-200 mb-4">
          Etiquetas ({labels.length})
        </h2>
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {labels.map((l) => (
            <div
              key={l.id}
              className="flex items-center justify-between p-3 rounded-lg bg-surface-900/30 border border-surface-800/20"
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ background: l.color }}
                />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-surface-200">
                      {l.ip_address}
                    </span>
                    <span
                      className="badge text-[0.6rem]"
                      style={{
                        background: `${l.color}20`,
                        color: l.color,
                        border: `1px solid ${l.color}40`,
                      }}
                    >
                      {l.label}
                    </span>
                  </div>
                  {l.description && (
                    <p className="text-[0.65rem] text-surface-500 mt-0.5">
                      {l.description}
                    </p>
                  )}
                </div>
              </div>
              <button
                className="btn btn-ghost p-1.5"
                onClick={() => deleteMutation.mutate(l.id)}
              >
                <Trash2 className="w-3.5 h-3.5 text-danger" />
              </button>
            </div>
          ))}
          {labels.length === 0 && (
            <p className="text-center text-surface-500 py-8 text-sm">
              No hay etiquetas asignadas
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Groups Panel ───────────────────────────────────────────── */

function GroupsPanel({
  groups,
  queryClient,
}: {
  groups: IPGroup[];
  queryClient: ReturnType<typeof useQueryClient>;
}) {
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [color, setColor] = useState('#8b5cf6');
  const [criteria, setCriteria] = useState('');

  const createMutation = useMutation({
    mutationFn: () =>
      networkApi.createGroup(name, desc, color, criteria || undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      setName('');
      setDesc('');
      setCriteria('');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => networkApi.deleteGroup(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['groups'] }),
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Create form */}
      <div className="glass-card p-5 animate-fade-in-up">
        <h2 className="text-sm font-semibold text-surface-200 mb-4 flex items-center gap-2">
          <FolderPlus className="w-4 h-4 text-brand-400" />
          Nuevo Grupo
        </h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (name) createMutation.mutate();
          }}
          className="space-y-3"
        >
          <input
            className="input"
            placeholder="Nombre del grupo"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <input
            className="input"
            placeholder="Descripción"
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
          />
          <textarea
            className="input"
            placeholder='Criterios JSON (ej: {"min_connections": 50})'
            value={criteria}
            onChange={(e) => setCriteria(e.target.value)}
            rows={3}
          />
          <div className="flex items-center gap-2">
            <label className="text-xs text-surface-400">Color:</label>
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="w-8 h-8 rounded cursor-pointer bg-transparent border-none"
            />
          </div>
          <button
            type="submit"
            className="btn btn-primary w-full"
            disabled={createMutation.isPending}
          >
            <Plus className="w-4 h-4" />
            Crear Grupo
          </button>
        </form>
      </div>

      {/* Groups list */}
      <div className="lg:col-span-2 glass-card p-5 animate-fade-in-up stagger-2">
        <h2 className="text-sm font-semibold text-surface-200 mb-4">
          Grupos ({groups.length})
        </h2>
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {groups.map((g) => (
            <div
              key={g.id}
              className="p-4 rounded-lg border border-surface-800/20 bg-surface-900/30"
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ background: g.color }}
                  />
                  <h3 className="text-sm font-semibold text-surface-200">
                    {g.name}
                  </h3>
                  <span className="badge badge-info text-[0.6rem]">
                    {g.members.length} IPs
                  </span>
                </div>
                <button
                  className="btn btn-ghost p-1.5"
                  onClick={() => deleteMutation.mutate(g.id)}
                >
                  <Trash2 className="w-3.5 h-3.5 text-danger" />
                </button>
              </div>
              {g.description && (
                <p className="text-xs text-surface-500 mb-2">{g.description}</p>
              )}
              {g.members.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {g.members.map((m) => (
                    <span
                      key={m.id}
                      className="font-mono text-[0.65rem] px-2 py-0.5 rounded-md bg-surface-800/50 text-surface-300 border border-surface-700/30"
                    >
                      {m.ip_address}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
          {groups.length === 0 && (
            <p className="text-center text-surface-500 py-8 text-sm">
              No hay grupos creados
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Topology Panel ─────────────────────────────────────────── */

type TopoSubTab = 'routes' | 'addresses' | 'bridge';
const TOPO_LABELS: Record<TopoSubTab, string> = {
  routes: 'Rutas',
  addresses: 'IPs por Interfaz',
  bridge: 'Bridge Ports',
};

function TopologyPanel() {
  const [subTab, setSubTab] = useState<TopoSubTab>('routes');

  const { data: routesResp, isLoading: loadingRoutes, refetch: refetchRoutes } = useQuery({
    queryKey: ['mikrotik-routes'],
    queryFn: mikrotikApi.getRoutes,
    staleTime: 30_000,
  });

  const { data: addrResp, isLoading: loadingAddr, refetch: refetchAddr } = useQuery({
    queryKey: ['mikrotik-addresses'],
    queryFn: mikrotikApi.getIPAddresses,
    staleTime: 30_000,
  });

  const { data: bridgeResp, isLoading: loadingBridge, refetch: refetchBridge } = useQuery({
    queryKey: ['mikrotik-bridge-ports'],
    queryFn: mikrotikApi.getBridgePorts,
    staleTime: 30_000,
  });

  const routes = routesResp?.data ?? [];
  const addresses = addrResp?.data ?? [];
  const bridgePorts = bridgeResp?.data ?? [];

  const handleRefresh = () => {
    refetchRoutes();
    refetchAddr();
    refetchBridge();
  };

  return (
    <div className="space-y-4 animate-fade-in-up">
      {/* Sub-tabs + refresh */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1 bg-surface-900/50 rounded-lg p-1 w-fit">
          {(Object.keys(TOPO_LABELS) as TopoSubTab[]).map((t) => (
            <button
              key={t}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                subTab === t
                  ? 'bg-brand-600/80 text-white'
                  : 'text-surface-400 hover:text-surface-200'
              }`}
              onClick={() => setSubTab(t)}
            >
              {TOPO_LABELS[t]}
            </button>
          ))}
        </div>
        <button className="btn btn-ghost text-xs gap-1.5" onClick={handleRefresh}>
          <RefreshCw className="w-3.5 h-3.5" />
          Actualizar
        </button>
      </div>

      {/* Routes */}
      {subTab === 'routes' && (
        <div className="glass-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Map className="w-4 h-4 text-brand-400" />
            <h2 className="text-sm font-semibold text-surface-200">
              Tabla de Ruteo ({routes.length} entradas)
            </h2>
          </div>
          {loadingRoutes ? (
            <div className="flex justify-center py-8"><div className="loading-spinner" /></div>
          ) : (
            <div className="overflow-auto max-h-[28rem] rounded-lg">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Destino</th>
                    <th>Gateway</th>
                    <th>Dist.</th>
                    <th>Tipo</th>
                    <th>Estado</th>
                    <th>Comentario</th>
                  </tr>
                </thead>
                <tbody>
                  {(routes as RouteEntry[]).map((r) => (
                    <tr key={r.id}>
                      <td className="font-mono text-xs font-semibold text-surface-100">{r.dst_address}</td>
                      <td className="font-mono text-xs text-brand-400">
                        <span className="flex items-center gap-1">
                          <ArrowRight className="w-3 h-3" />{r.gateway}
                        </span>
                      </td>
                      <td className="text-xs text-center">{r.distance}</td>
                      <td>
                        {r.static && <span className="badge badge-info">estática</span>}
                        {r.connect && <span className="badge badge-success">conectada</span>}
                        {r.ospf && <span className="badge badge-high">OSPF</span>}
                        {r.dynamic && !r.connect && !r.ospf && <span className="badge badge-medium">dinámica</span>}
                      </td>
                      <td>
                        {r.active ? (
                          <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--color-success, #22c55e)' }}>
                            <CheckCircle2 className="w-3.5 h-3.5" /> Activa
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-xs text-danger">
                            <XCircle className="w-3.5 h-3.5" /> Inactiva
                          </span>
                        )}
                      </td>
                      <td className="text-xs text-surface-500">{r.comment || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {routes.length === 0 && (
                <p className="text-center text-surface-500 py-8 text-sm">Sin datos de ruteo</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* IP Addresses */}
      {subTab === 'addresses' && (
        <div className="glass-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Network className="w-4 h-4 text-brand-400" />
            <h2 className="text-sm font-semibold text-surface-200">
              IPs por Interfaz ({addresses.length} asignadas)
            </h2>
          </div>
          {loadingAddr ? (
            <div className="flex justify-center py-8"><div className="loading-spinner" /></div>
          ) : (
            <div className="overflow-auto max-h-[28rem] rounded-lg">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Dirección</th>
                    <th>Red</th>
                    <th>Interfaz</th>
                    <th>Tipo</th>
                    <th>Estado</th>
                    <th>Comentario</th>
                  </tr>
                </thead>
                <tbody>
                  {(addresses as IPAddress[]).map((a) => (
                    <tr key={a.id}>
                      <td className="font-mono text-xs font-semibold text-surface-100">{a.address}</td>
                      <td className="font-mono text-xs text-surface-400">{a.network}</td>
                      <td className="text-xs">
                        <span className="font-mono bg-surface-800/50 px-1.5 py-0.5 rounded text-brand-300">
                          {a.interface}
                        </span>
                      </td>
                      <td>
                        <span className={`badge ${a.dynamic ? 'badge-info' : 'badge-success'}`}>
                          {a.dynamic ? 'dinámica' : 'estática'}
                        </span>
                      </td>
                      <td>
                        {a.disabled ? (
                          <span className="badge badge-danger">deshabilitada</span>
                        ) : a.invalid ? (
                          <span className="badge badge-critical">inválida</span>
                        ) : (
                          <span className="badge badge-success">activa</span>
                        )}
                      </td>
                      <td className="text-xs text-surface-500">{a.comment || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {addresses.length === 0 && (
                <p className="text-center text-surface-500 py-8 text-sm">Sin IPs asignadas</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Bridge Ports */}
      {subTab === 'bridge' && (
        <div className="glass-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Network className="w-4 h-4 text-brand-400" />
            <h2 className="text-sm font-semibold text-surface-200">
              Puertos Bridge ({bridgePorts.length} configurados)
            </h2>
          </div>
          {loadingBridge ? (
            <div className="flex justify-center py-8"><div className="loading-spinner" /></div>
          ) : (
            <div className="overflow-auto max-h-[28rem] rounded-lg">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Interfaz</th>
                    <th>Bridge</th>
                    <th>PVID</th>
                    <th>Path Cost</th>
                    <th>HW Offload</th>
                    <th>Estado</th>
                    <th>Comentario</th>
                  </tr>
                </thead>
                <tbody>
                  {(bridgePorts as BridgePort[]).map((bp) => (
                    <tr key={bp.id}>
                      <td className="font-mono text-xs font-semibold text-surface-100">{bp.interface}</td>
                      <td className="font-mono text-xs text-brand-300">{bp.bridge}</td>
                      <td className="text-xs text-center font-mono">{bp.pvid}</td>
                      <td className="text-xs text-center">{bp.path_cost}</td>
                      <td className="text-center">
                        {bp.hw ? (
                          <CheckCircle2 className="w-4 h-4 mx-auto" style={{ color: 'var(--color-success, #22c55e)' }} />
                        ) : (
                          <XCircle className="w-4 h-4 text-surface-600 mx-auto" />
                        )}
                      </td>
                      <td>
                        {bp.disabled ? (
                          <span className="badge badge-danger">deshabilitado</span>
                        ) : bp.inactive ? (
                          <span className="badge badge-medium">inactivo</span>
                        ) : (
                          <span className="badge badge-success">activo</span>
                        )}
                      </td>
                      <td className="text-xs text-surface-500">{bp.comment || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {bridgePorts.length === 0 && (
                <p className="text-center text-surface-500 py-8 text-sm">Sin puertos bridge configurados</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Queues Panel ───────────────────────────────────────────── */

function QueuesPanel() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<QueueCreate>({
    name: '',
    target: '',
    max_limit: '10M/10M',
    comment: '',
  });

  const { data: queuesResp, isLoading } = useQuery({
    queryKey: ['mikrotik-queues'],
    queryFn: mikrotikApi.getQueues,
    refetchInterval: 15_000,
  });

  const queues = (queuesResp?.data ?? []) as QueueEntry[];

  const createMutation = useMutation({
    mutationFn: (data: QueueCreate) => mikrotikApi.createQueue(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mikrotik-queues'] });
      setShowForm(false);
      setFormData({ name: '', target: '', max_limit: '10M/10M', comment: '' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: QueueUpdate }) =>
      mikrotikApi.updateQueue(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mikrotik-queues'] });
      setEditingId(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => mikrotikApi.deleteQueue(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['mikrotik-queues'] }),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, disabled }: { id: string; disabled: boolean }) =>
      mikrotikApi.updateQueue(id, { disabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['mikrotik-queues'] }),
  });

  function fmtBytes(bytes: number) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  }

  function parseMaxLimit(limit: string) {
    const [up, down] = limit.split('/');
    return { up: up || '0', down: down || '0' };
  }

  return (
    <div className="space-y-4 animate-fade-in-up">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Gauge className="w-4 h-4 text-brand-400" />
          <h2 className="text-sm font-semibold text-surface-200">
            Simple Queues — Control de Ancho de Banda
          </h2>
          <span className="badge badge-info">{queues.length} colas</span>
        </div>
        <button
          className="btn btn-primary text-xs gap-1.5"
          onClick={() => setShowForm(!showForm)}
        >
          <Plus className="w-3.5 h-3.5" />
          Nueva Cola
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <div className="glass-card p-5 border border-brand-500/20">
          <h3 className="text-sm font-semibold text-surface-200 mb-4">
            Crear Nueva Queue Simple
          </h3>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createMutation.mutate(formData);
            }}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3"
          >
            <div>
              <label className="text-xs text-surface-400 mb-1 block">Nombre *</label>
              <input
                className="input"
                placeholder="limit-PC-01"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="text-xs text-surface-400 mb-1 block">Target (IP o red) *</label>
              <input
                className="input"
                placeholder="192.168.88.20 o 192.168.88.0/24"
                value={formData.target}
                onChange={(e) => setFormData({ ...formData, target: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="text-xs text-surface-400 mb-1 block">
                Límite (upload/download)
              </label>
              <input
                className="input"
                placeholder="10M/10M"
                value={formData.max_limit}
                onChange={(e) => setFormData({ ...formData, max_limit: e.target.value })}
              />
              <p className="text-[0.6rem] text-surface-600 mt-0.5">Ej: 5M/10M — 0/0 = sin límite</p>
            </div>
            <div>
              <label className="text-xs text-surface-400 mb-1 block">Comentario</label>
              <input
                className="input"
                placeholder="Descripción opcional"
                value={formData.comment}
                onChange={(e) => setFormData({ ...formData, comment: e.target.value })}
              />
            </div>
            <div className="md:col-span-2 lg:col-span-4 flex gap-2 justify-end">
              <button
                type="button"
                className="btn btn-ghost text-xs"
                onClick={() => setShowForm(false)}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="btn btn-primary text-xs"
                disabled={createMutation.isPending}
              >
                {createMutation.isPending ? 'Creando...' : 'Crear Queue'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Queues list */}
      <div className="glass-card p-5">
        {isLoading ? (
          <div className="flex justify-center py-8"><div className="loading-spinner" /></div>
        ) : queues.length === 0 ? (
          <p className="text-center text-surface-500 py-8 text-sm">
            No hay queues configuradas. Creá una para limitar el ancho de banda de una IP o red.
          </p>
        ) : (
          <div className="space-y-3">
            {queues.map((q) => {
              const { up, down } = parseMaxLimit(q.max_limit);
              const isEditing = editingId === q.id;

              return (
                <div
                  key={q.id}
                  className={`p-4 rounded-xl border transition-all ${
                    q.disabled
                      ? 'border-surface-800/20 bg-surface-900/20 opacity-60'
                      : 'border-surface-700/30 bg-surface-900/40'
                  }`}
                >
                  {isEditing ? (
                    <EditQueueForm
                      queue={q}
                      onSave={(data) => updateMutation.mutate({ id: q.id, data })}
                      onCancel={() => setEditingId(null)}
                      isPending={updateMutation.isPending}
                    />
                  ) : (
                    <div className="flex items-start justify-between gap-4">
                      {/* Queue info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-semibold text-surface-100 truncate">
                            {q.name}
                          </span>
                          {q.disabled && (
                            <span className="badge badge-danger text-[0.6rem]">deshabilitada</span>
                          )}
                          {q.dynamic && (
                            <span className="badge badge-info text-[0.6rem]">dinámica</span>
                          )}
                        </div>
                        <div className="flex items-center gap-4 text-xs text-surface-400 flex-wrap">
                          <span className="font-mono">🎯 {q.target}</span>
                          <span className="font-mono text-brand-300">↑ {up} / ↓ {down}</span>
                          {q.rate !== '0/0' && (
                            <span className="font-mono" style={{ color: 'var(--color-success, #22c55e)' }}>
                              ~{q.rate}
                            </span>
                          )}
                          {q.dropped > 0 && (
                            <span className="font-mono text-warning">
                              {q.dropped.toLocaleString()} drops
                            </span>
                          )}
                          <span className="text-surface-600">
                            {fmtBytes(q.bytes)} transferidos
                          </span>
                        </div>
                        {q.comment && (
                          <p className="text-[0.65rem] text-surface-500 mt-1">{q.comment}</p>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          className="btn btn-ghost p-1.5"
                          title={q.disabled ? 'Habilitar' : 'Deshabilitar'}
                          onClick={() => toggleMutation.mutate({ id: q.id, disabled: !q.disabled })}
                        >
                          {q.disabled ? (
                            <CheckCircle2 className="w-4 h-4" style={{ color: 'var(--color-success, #22c55e)' }} />
                          ) : (
                            <XCircle className="w-4 h-4 text-surface-500" />
                          )}
                        </button>
                        <button
                          className="btn btn-ghost p-1.5"
                          title="Editar"
                          onClick={() => setEditingId(q.id)}
                        >
                          <Edit2 className="w-4 h-4 text-brand-400" />
                        </button>
                        <button
                          className="btn btn-ghost p-1.5"
                          title="Eliminar"
                          onClick={() => {
                            if (confirm(`¿Eliminar queue "${q.name}"?`)) {
                              deleteMutation.mutate(q.id);
                            }
                          }}
                        >
                          <Trash2 className="w-4 h-4 text-danger" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Edit Queue Form ────────────────────────────────────────── */

function EditQueueForm({
  queue,
  onSave,
  onCancel,
  isPending,
}: {
  queue: QueueEntry;
  onSave: (data: QueueUpdate) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const [name, setName] = useState(queue.name);
  const [maxLimit, setMaxLimit] = useState(queue.max_limit);
  const [comment, setComment] = useState(queue.comment);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave({ name, max_limit: maxLimit, comment });
      }}
      className="grid grid-cols-1 md:grid-cols-3 gap-3"
    >
      <div>
        <label className="text-xs text-surface-400 mb-1 block">Nombre</label>
        <input
          className="input text-sm"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </div>
      <div>
        <label className="text-xs text-surface-400 mb-1 block">Límite (up/down)</label>
        <input
          className="input text-sm font-mono"
          value={maxLimit}
          onChange={(e) => setMaxLimit(e.target.value)}
          placeholder="10M/10M"
        />
      </div>
      <div>
        <label className="text-xs text-surface-400 mb-1 block">Comentario</label>
        <input
          className="input text-sm"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />
      </div>
      <div className="md:col-span-3 flex gap-2 justify-end">
        <button type="button" className="btn btn-ghost text-xs" onClick={onCancel}>
          Cancelar
        </button>
        <button type="submit" className="btn btn-primary text-xs" disabled={isPending}>
          {isPending ? 'Guardando...' : 'Guardar Cambios'}
        </button>
      </div>
    </form>
  );
}
