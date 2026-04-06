import { useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { useDeleteVlan } from '../../hooks/useVlans';
import type { VlanInfo, VlanTrafficData } from '../../types';

interface VlanTableProps {
  vlans: VlanInfo[];
  latestTraffic: VlanTrafficData[];
  isLoading: boolean;
  onEdit: (vlan: VlanInfo) => void;
}

function formatBps(bps: number): string {
  if (bps >= 1_000_000) return `${(bps / 1_000_000).toFixed(1)} Mbps`;
  if (bps >= 1_000) return `${(bps / 1_000).toFixed(1)} Kbps`;
  return `${bps.toFixed(0)} bps`;
}

export default function VlanTable({ vlans, latestTraffic, isLoading, onEdit }: VlanTableProps) {
  const deleteMutation = useDeleteVlan();
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const showStatus = (type: 'success' | 'error', text: string) => {
    setStatusMsg({ type, text });
    setTimeout(() => setStatusMsg(null), 4000);
  };

  // Build traffic lookup by vlan_id
  const trafficMap = new Map<number, VlanTrafficData>();
  for (const t of latestTraffic) {
    trafficMap.set(t.vlan_id, t);
  }

  const handleDelete = (vlan: VlanInfo) => {
    if (confirmDelete === vlan.id) {
      deleteMutation.mutate(vlan.id, {
        onSuccess: () => {
          setConfirmDelete(null);
          showStatus('success', `VLAN ${vlan.name} eliminada correctamente`);
        },
        onError: (err) => {
          setConfirmDelete(null);
          showStatus('error', `Error al eliminar VLAN: ${err.message}`);
        },
      });
    } else {
      setConfirmDelete(vlan.id);
      // Auto-reset confirmation after 3 seconds
      setTimeout(() => setConfirmDelete(null), 3000);
    }
  };

  if (isLoading) {
    return (
      <div className="glass-card p-5">
        <div className="flex justify-center py-12">
          <div className="loading-spinner" />
        </div>
      </div>
    );
  }

  return (
    <div className="glass-card p-5 animate-fade-in-up stagger-2">
      <h2 className="text-sm font-semibold text-surface-200 mb-4 flex items-center justify-between">
        <span>VLANs Configuradas ({vlans.length})</span>
        {statusMsg && (
          <span className={`text-xs px-2 py-1 rounded animate-fade-in ${
            statusMsg.type === 'success' ? 'bg-success/20 text-success' : 'bg-danger/20 text-danger'
          }`}>
            {statusMsg.text}
          </span>
        )}
      </h2>

      <div className="overflow-auto max-h-96 rounded-lg">
        <table className="data-table">
          <thead>
            <tr>
              <th>VLAN ID</th>
              <th>Nombre</th>
              <th>Interfaz</th>
              <th>Estado</th>
              <th>Tráfico Actual</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {vlans.map((vlan) => {
              const traffic = trafficMap.get(vlan.vlan_id);
              const status = traffic?.status ?? 'ok';
              const isAlert = status === 'alert';

              return (
                <tr
                  key={vlan.id}
                  className={`transition-colors duration-500 ${
                    isAlert
                      ? 'bg-danger/[0.08]'
                      : vlan.running
                      ? 'bg-success/[0.04]'
                      : ''
                  }`}
                >
                  <td className="font-mono text-xs font-semibold text-surface-100">
                    {vlan.vlan_id}
                  </td>
                  <td className="text-surface-200">{vlan.name}</td>
                  <td className="font-mono text-xs text-surface-400">{vlan.interface}</td>
                  <td>
                    <span
                      className={`badge ${
                        isAlert
                          ? 'badge-danger'
                          : vlan.running
                          ? 'badge-success'
                          : 'badge-low'
                      }`}
                    >
                      {isAlert ? 'alert' : vlan.running ? 'running' : 'stopped'}
                    </span>
                  </td>
                  <td className="text-xs font-mono">
                    {traffic ? (
                      <div className="flex flex-col gap-0.5">
                        <span className="text-success">
                          ↓ {formatBps(traffic.rx_bps)}
                        </span>
                        <span className="text-brand-400">
                          ↑ {formatBps(traffic.tx_bps)}
                        </span>
                      </div>
                    ) : (
                      <span className="text-surface-500">—</span>
                    )}
                  </td>
                  <td>
                    <div className="flex items-center gap-1">
                      <button
                        className="btn btn-ghost text-xs py-1 px-2"
                        onClick={() => onEdit(vlan)}
                        title="Editar"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        className={`btn text-xs py-1 px-2 ${
                          confirmDelete === vlan.id ? 'btn-danger' : 'btn-ghost'
                        }`}
                        onClick={() => handleDelete(vlan)}
                        disabled={deleteMutation.isPending}
                        title={confirmDelete === vlan.id ? 'Confirmar eliminación' : 'Eliminar'}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        {confirmDelete === vlan.id && (
                          <span className="text-[0.65rem]">¿Seguro?</span>
                        )}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {vlans.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center text-surface-500 py-8">
                  No hay VLANs configuradas
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
