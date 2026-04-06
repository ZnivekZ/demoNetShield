import { useState } from 'react';
import { Layers, Plus, Wifi } from 'lucide-react';
import { useVlans } from '../../hooks/useVlans';
import { useVlanTraffic } from '../../hooks/useVlanTraffic';
import VlanTable from './VlanTable';
import VlanFormModal from './VlanFormModal';
import VlanTrafficCard from './VlanTrafficCard';
import type { VlanInfo } from '../../types';

export default function VlanPanel() {
  const [modalOpen, setModalOpen] = useState(false);
  const [editVlan, setEditVlan] = useState<VlanInfo | null>(null);

  const { data: vlansResp, isLoading } = useVlans();
  const { isConnected, trafficByVlan, latestTraffic } = useVlanTraffic(60);

  const vlans = vlansResp?.data ?? [];

  const handleEdit = (vlan: VlanInfo) => {
    setEditVlan(vlan);
    setModalOpen(true);
  };

  const handleCloseModal = () => {
    setModalOpen(false);
    setEditVlan(null);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-surface-100 flex items-center gap-2">
            <Layers className="w-5 h-5 text-brand-400" />
            VLANs
          </h1>
          <p className="text-sm text-surface-500 mt-0.5">
            Gestión y monitoreo de VLANs del MikroTik CHR
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs text-surface-400">
            <Wifi className={`w-3.5 h-3.5 ${isConnected ? 'text-success' : 'text-danger'}`} />
            {isConnected ? 'En vivo' : 'Desconectado'}
          </div>
          <button
            className="btn btn-primary"
            onClick={() => {
              setEditVlan(null);
              setModalOpen(true);
            }}
          >
            <Plus className="w-4 h-4" />
            Nueva VLAN
          </button>
        </div>
      </div>

      {/* Table */}
      <VlanTable
        vlans={vlans}
        latestTraffic={latestTraffic}
        isLoading={isLoading}
        onEdit={handleEdit}
      />

      {/* Traffic Charts */}
      {vlans.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-surface-200 flex items-center gap-2">
            Tráfico en Tiempo Real por VLAN
          </h2>
          {vlans.map((vlan, index) => {
            const history = trafficByVlan[vlan.vlan_id] ?? [];
            const latest = latestTraffic.find((t) => t.vlan_id === vlan.vlan_id);
            const status = latest?.status ?? 'ok';

            return (
              <div
                key={vlan.id}
                className={`animate-fade-in-up stagger-${Math.min(index + 1, 4)}`}
              >
                <VlanTrafficCard
                  vlanId={vlan.vlan_id}
                  name={vlan.name}
                  history={history}
                  latestStatus={status}
                />
              </div>
            );
          })}
        </div>
      )}

      {/* Modal */}
      <VlanFormModal
        isOpen={modalOpen}
        onClose={handleCloseModal}
        editVlan={editVlan}
      />
    </div>
  );
}
