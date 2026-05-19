import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Network,
  Plus,
  Trash2,
  Activity,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { vlansApi } from '../../services/api';
import type { VlanInfo } from '../../types';

export default function VlanPanel() {
  const queryClient = useQueryClient();

  const { data: vlansResp, isLoading } = useQuery({
    queryKey: ['vlans'],
    queryFn: vlansApi.getVlans,
    refetchInterval: 15000,
  });

  const vlans: VlanInfo[] = vlansResp?.data ?? [];

  // ── Create form state ──
  const [vlanId, setVlanId] = useState('');
  const [name, setName] = useState('');
  const [iface, setIface] = useState('ether1');
  const [comment, setComment] = useState('');

  const createMutation = useMutation({
    mutationFn: () =>
      vlansApi.createVlan({
        vlan_id: parseInt(vlanId, 10),
        name,
        interface: iface,
        comment: comment || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vlans'] });
      setVlanId('');
      setName('');
      setComment('');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => vlansApi.deleteVlan(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['vlans'] }),
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* ── Create VLAN form ── */}
      <div className="glass-card p-5 animate-fade-in-up">
        <h2 className="text-sm font-semibold text-surface-200 mb-4 flex items-center gap-2">
          <Network className="w-4 h-4 text-brand-400" />
          Nueva VLAN
        </h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (vlanId && name) createMutation.mutate();
          }}
          className="space-y-3"
        >
          <input
            className="input"
            placeholder="VLAN ID (ej: 100)"
            type="number"
            min="1"
            max="4094"
            value={vlanId}
            onChange={(e) => setVlanId(e.target.value)}
            required
          />
          <input
            className="input"
            placeholder="Nombre (ej: VLAN-Servidores)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <input
            className="input"
            placeholder="Interfaz padre (ej: ether1)"
            value={iface}
            onChange={(e) => setIface(e.target.value)}
            required
          />
          <input
            className="input"
            placeholder="Comentario (opcional)"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
          <button
            type="submit"
            className="btn btn-primary w-full"
            disabled={createMutation.isPending}
          >
            <Plus className="w-4 h-4" />
            Crear VLAN
          </button>
        </form>
      </div>

      {/* ── VLANs list ── */}
      <div className="lg:col-span-2 glass-card p-5 animate-fade-in-up stagger-2">
        <h2 className="text-sm font-semibold text-surface-200 mb-4 flex items-center gap-2">
          <Activity className="w-4 h-4 text-brand-400" />
          VLANs Configuradas ({vlans.length})
        </h2>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="loading-spinner" />
          </div>
        ) : vlans.length === 0 ? (
          <p className="text-center text-surface-500 py-8 text-sm">
            No hay VLANs configuradas
          </p>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {vlans.map((v) => (
              <div
                key={v.id}
                className="flex items-center justify-between p-3 rounded-lg bg-surface-900/30 border border-surface-800/20"
              >
                <div className="flex items-center gap-3">
                  {v.running ? (
                    <Wifi className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <WifiOff className="w-4 h-4 text-surface-600" />
                  )}
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="badge badge-info text-[0.6rem]">
                        ID {v.vlan_id}
                      </span>
                      <span className="text-sm font-semibold text-surface-200">
                        {v.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[0.65rem] text-surface-500">
                        Interfaz: {v.interface}
                      </span>
                      <span className="text-[0.65rem] text-surface-600">
                        MTU: {v.mtu}
                      </span>
                      {v.mac_address && (
                        <span className="font-mono text-[0.6rem] text-surface-600">
                          {v.mac_address}
                        </span>
                      )}
                    </div>
                    {v.comment && (
                      <p className="text-[0.65rem] text-surface-500 mt-0.5">
                        {v.comment}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`status-dot ${v.running ? 'active' : 'disconnected'}`}
                  />
                  <button
                    className="btn btn-ghost p-1.5"
                    onClick={() => deleteMutation.mutate(v.id)}
                    title="Eliminar VLAN"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-danger" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
