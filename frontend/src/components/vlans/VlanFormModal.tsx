import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { mikrotikApi } from '../../services/api';
import { useCreateVlan, useUpdateVlan } from '../../hooks/useVlans';
import type { VlanInfo } from '../../types';

interface VlanFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  editVlan?: VlanInfo | null;
}

export default function VlanFormModal({ isOpen, onClose, editVlan }: VlanFormModalProps) {
  const [vlanId, setVlanId] = useState('');
  const [name, setName] = useState('');
  const [iface, setIface] = useState('');
  const [comment, setComment] = useState('');

  const createMutation = useCreateVlan();
  const updateMutation = useUpdateVlan();

  const { data: interfacesResp } = useQuery({
    queryKey: ['mikrotik-interfaces'],
    queryFn: mikrotikApi.getInterfaces,
    enabled: isOpen,
  });

  const interfaces = interfacesResp?.data ?? [];

  // Pre-fill form in edit mode
  useEffect(() => {
    if (editVlan) {
      setVlanId(String(editVlan.vlan_id));
      setName(editVlan.name);
      setIface(editVlan.interface);
      setComment(editVlan.comment);
    } else {
      setVlanId('');
      setName('');
      setIface('');
      setComment('');
    }
  }, [editVlan, isOpen]);

  if (!isOpen) return null;

  const isEdit = !!editVlan;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isEdit) {
      updateMutation.mutate(
        {
          vlanId: editVlan!.id,
          data: { name: name || undefined, comment },
        },
        { onSuccess: onClose }
      );
    } else {
      createMutation.mutate(
        {
          vlan_id: parseInt(vlanId),
          name,
          interface: iface,
          comment,
        },
        { onSuccess: onClose }
      );
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;
  const error = createMutation.error || updateMutation.error;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="glass-card relative z-10 w-full max-w-md p-6 animate-fade-in-up">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-surface-100">
            {isEdit ? 'Editar VLAN' : 'Nueva VLAN'}
          </h2>
          <button
            onClick={onClose}
            className="text-surface-400 hover:text-surface-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs text-surface-400 mb-1 block">
              VLAN ID
            </label>
            <input
              type="number"
              className="input"
              placeholder="10"
              value={vlanId}
              onChange={(e) => setVlanId(e.target.value)}
              required
              min={1}
              max={4094}
              disabled={isEdit}
            />
            {isEdit && (
              <p className="text-[0.65rem] text-surface-500 mt-1">
                El VLAN ID no se puede cambiar una vez creado
              </p>
            )}
          </div>

          <div>
            <label className="text-xs text-surface-400 mb-1 block">
              Nombre
            </label>
            <input
              type="text"
              className="input"
              placeholder="VLAN-Alumnos"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="text-xs text-surface-400 mb-1 block">
              Interfaz base
            </label>
            <select
              className="input"
              value={iface}
              onChange={(e) => setIface(e.target.value)}
              required
              disabled={isEdit}
            >
              <option value="">Seleccionar interfaz...</option>
              {interfaces.map((i) => (
                <option key={i.name} value={i.name}>
                  {i.name} ({i.type})
                </option>
              ))}
            </select>
            {isEdit && (
              <p className="text-[0.65rem] text-surface-500 mt-1">
                La interfaz base no se puede cambiar
              </p>
            )}
          </div>

          <div>
            <label className="text-xs text-surface-400 mb-1 block">
              Comentario (opcional)
            </label>
            <input
              type="text"
              className="input"
              placeholder="VLAN para red de alumnos"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary w-full"
            disabled={isPending || (!isEdit && (!vlanId || !name || !iface))}
          >
            {isPending ? (
              <span className="loading-spinner" />
            ) : isEdit ? (
              'Guardar Cambios'
            ) : (
              'Crear VLAN'
            )}
          </button>

          {error && (
            <p className="text-xs text-danger mt-1">
              Error: {(error as Error).message}
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
