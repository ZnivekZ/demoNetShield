import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Shield, Ban, Unlock, Clock, Search } from 'lucide-react';
import { mikrotikApi, actionsApi } from '../../services/api';
import type { FirewallRule } from '../../types';

export default function FirewallPage() {
  const queryClient = useQueryClient();
  const [blockIp, setBlockIp] = useState('');
  const [blockComment, setBlockComment] = useState('');
  const [blockDuration, setBlockDuration] = useState('');
  const [searchFilter, setSearchFilter] = useState('');

  const { data: rulesResp, isLoading } = useQuery({
    queryKey: ['firewall-rules'],
    queryFn: mikrotikApi.getFirewallRules,
    refetchInterval: 10000,
  });

  const { data: historyResp } = useQuery({
    queryKey: ['action-history'],
    queryFn: () => actionsApi.getHistory(30),
    refetchInterval: 15000,
  });

  const blockMutation = useMutation({
    mutationFn: () =>
      mikrotikApi.blockIP(
        blockIp,
        blockComment || 'Blocked via NetShield Dashboard',
        blockDuration ? parseInt(blockDuration) : undefined
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['firewall-rules'] });
      queryClient.invalidateQueries({ queryKey: ['action-history'] });
      setBlockIp('');
      setBlockComment('');
      setBlockDuration('');
    },
  });

  const unblockMutation = useMutation({
    mutationFn: (ip: string) => mikrotikApi.unblockIP(ip),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['firewall-rules'] });
      queryClient.invalidateQueries({ queryKey: ['action-history'] });
    },
  });

  const rules = rulesResp?.data ?? [];
  const history = historyResp?.data ?? [];

  const filteredRules = rules.filter(
    (r) =>
      !searchFilter ||
      r.src_address.includes(searchFilter) ||
      r.dst_address.includes(searchFilter) ||
      r.comment?.toLowerCase().includes(searchFilter.toLowerCase()) ||
      r.chain.includes(searchFilter)
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-surface-100 flex items-center gap-2">
          <Shield className="w-5 h-5 text-brand-400" />
          Firewall
        </h1>
        <p className="text-sm text-surface-500 mt-0.5">
          Administración de reglas de firewall y bloqueo de IPs
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Block IP Form */}
        <div className="glass-card p-5 animate-fade-in-up">
          <h2 className="text-sm font-semibold text-surface-200 mb-4 flex items-center gap-2">
            <Ban className="w-4 h-4 text-danger" />
            Bloquear IP
          </h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (blockIp) blockMutation.mutate();
            }}
            className="space-y-3"
          >
            <div>
              <label className="text-xs text-surface-400 mb-1 block">
                Dirección IP
              </label>
              <input
                type="text"
                className="input"
                placeholder="192.168.88.100"
                value={blockIp}
                onChange={(e) => setBlockIp(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="text-xs text-surface-400 mb-1 block">
                Motivo
              </label>
              <input
                type="text"
                className="input"
                placeholder="Actividad sospechosa"
                value={blockComment}
                onChange={(e) => setBlockComment(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-surface-400 mb-1 block">
                Duración (minutos, vacío = permanente)
              </label>
              <input
                type="number"
                className="input"
                placeholder="60"
                value={blockDuration}
                onChange={(e) => setBlockDuration(e.target.value)}
                min="1"
              />
            </div>
            <button
              type="submit"
              className="btn btn-danger w-full"
              disabled={blockMutation.isPending || !blockIp}
            >
              {blockMutation.isPending ? (
                <span className="loading-spinner" />
              ) : (
                <Ban className="w-4 h-4" />
              )}
              Bloquear IP
            </button>
            {blockMutation.isError && (
              <p className="text-xs text-danger mt-1">
                Error: {(blockMutation.error as Error).message}
              </p>
            )}
            {blockMutation.isSuccess && (
              <p className="text-xs text-success mt-1">IP bloqueada exitosamente</p>
            )}
          </form>
        </div>

        {/* Rules Table */}
        <div className="lg:col-span-2 glass-card p-5 animate-fade-in-up stagger-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-surface-200">
              Reglas Activas ({rules.length})
            </h2>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-surface-500" />
              <input
                type="text"
                className="input pl-8 w-48"
                placeholder="Buscar..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
              />
            </div>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-12">
              <div className="loading-spinner" />
            </div>
          ) : (
            <div className="overflow-auto max-h-96 rounded-lg">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Chain</th>
                    <th>Acción</th>
                    <th>Origen</th>
                    <th>Destino</th>
                    <th>Proto</th>
                    <th>Comentario</th>
                    <th>Tráfico</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRules.map((rule) => (
                    <tr
                      key={rule.id}
                      className={rule.disabled ? 'opacity-40' : ''}
                    >
                      <td className="text-xs font-mono">{rule.chain}</td>
                      <td>
                        <span
                          className={`badge ${
                            rule.action === 'drop'
                              ? 'badge-danger'
                              : rule.action === 'accept'
                              ? 'badge-success'
                              : 'badge-info'
                          }`}
                        >
                          {rule.action}
                        </span>
                      </td>
                      <td className="font-mono text-xs">
                        {rule.src_address || '*'}
                      </td>
                      <td className="font-mono text-xs">
                        {rule.dst_address || '*'}
                      </td>
                      <td className="text-xs text-surface-400">
                        {rule.protocol || 'any'}
                      </td>
                      <td className="text-xs text-surface-400 max-w-32 truncate">
                        {rule.comment || '—'}
                      </td>
                      <td className="text-xs font-mono text-surface-500">
                        {(rule.bytes / 1024).toFixed(0)} KB
                      </td>
                      <td>
                        {rule.action === 'drop' &&
                          rule.chain === 'forward' &&
                          rule.src_address && (
                            <button
                              className="btn btn-ghost text-xs py-1 px-2"
                              onClick={() =>
                                unblockMutation.mutate(rule.src_address)
                              }
                              disabled={unblockMutation.isPending}
                            >
                              <Unlock className="w-3 h-3" />
                            </button>
                          )}
                      </td>
                    </tr>
                  ))}
                  {filteredRules.length === 0 && (
                    <tr>
                      <td colSpan={8} className="text-center text-surface-500 py-8">
                        No hay reglas que coincidan
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Action History */}
      <div className="glass-card p-5 animate-fade-in-up stagger-3">
        <h2 className="text-sm font-semibold text-surface-200 mb-4 flex items-center gap-2">
          <Clock className="w-4 h-4 text-brand-400" />
          Historial de Acciones
        </h2>
        <div className="overflow-auto max-h-64">
          <table className="data-table">
            <thead>
              <tr>
                <th>Acción</th>
                <th>IP</th>
                <th>Comentario</th>
                <th>Realizado por</th>
                <th>Fecha</th>
              </tr>
            </thead>
            <tbody>
              {history.map((entry) => (
                <tr key={entry.id}>
                  <td>
                    <span
                      className={`badge ${
                        entry.action_type === 'block'
                          ? 'badge-danger'
                          : entry.action_type === 'unblock'
                          ? 'badge-success'
                          : 'badge-info'
                      }`}
                    >
                      {entry.action_type}
                    </span>
                  </td>
                  <td className="font-mono text-xs">
                    {entry.target_ip || '—'}
                  </td>
                  <td className="text-xs text-surface-400 max-w-40 truncate">
                    {entry.comment || '—'}
                  </td>
                  <td className="text-xs text-surface-500">
                    {entry.performed_by}
                  </td>
                  <td className="text-xs text-surface-500">
                    {new Date(entry.created_at).toLocaleString('es-AR')}
                  </td>
                </tr>
              ))}
              {history.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center text-surface-500 py-8">
                    No hay acciones registradas
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
