import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Network,
  Tag,
  FolderPlus,
  Trash2,
  Plus,
  Search,
} from 'lucide-react';
import { networkApi, mikrotikApi } from '../../services/api';
import type { IPLabel, IPGroup } from '../../types';
import VlanPanel from '../vlans/VlanPanel';

export default function NetworkPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'ips' | 'labels' | 'groups' | 'vlans'>('ips');

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
          Red & IPs
        </h1>
        <p className="text-sm text-surface-500 mt-0.5">
          Gestión de dispositivos, etiquetas y grupos de IP
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-surface-900/50 rounded-xl p-1 w-fit overflow-x-auto">
        {(['ips', 'labels', 'groups', 'vlans'] as const).map((tab) => (
          <button
            key={tab}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === tab
                ? 'bg-brand-600 text-white shadow-lg shadow-brand-500/20'
                : 'text-surface-400 hover:text-surface-200'
            }`}
            onClick={() => setActiveTab(tab)}
          >
            {tab === 'ips' ? 'Tabla ARP' : tab === 'labels' ? 'Etiquetas' : tab === 'groups' ? 'Grupos' : 'VLANs'}
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
