import { useState } from 'react';
import type { ConnectionInfo } from '../../types';

export default function ConnectionsTable({
  connections,
}: {
  connections: ConnectionInfo[];
}) {
  const [filter, setFilter] = useState('');
  const [protocolFilter, setProtocolFilter] = useState('all');

  const protocols = [...new Set(connections.map((c) => c.protocol))].filter(Boolean);

  const filtered = connections.filter((c) => {
    const matchesText =
      !filter ||
      c.src_address.includes(filter) ||
      c.dst_address.includes(filter);
    const matchesProtocol =
      protocolFilter === 'all' || c.protocol === protocolFilter;
    return matchesText && matchesProtocol;
  });

  return (
    <div>
      {/* Filters */}
      <div className="flex gap-2 mb-3">
        <input
          type="text"
          placeholder="Filtrar por IP..."
          className="input flex-1"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <select
          className="input w-32"
          value={protocolFilter}
          onChange={(e) => setProtocolFilter(e.target.value)}
        >
          <option value="all">Todos</option>
          {protocols.map((p) => (
            <option key={p} value={p}>
              {p.toUpperCase()}
            </option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="overflow-auto max-h-80 rounded-lg">
        <table className="data-table">
          <thead>
            <tr>
              <th>Origen</th>
              <th>Destino</th>
              <th>Proto</th>
              <th>Estado</th>
              <th>Bytes</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 50).map((conn, i) => (
              <tr key={i}>
                <td className="font-mono text-xs">
                  {conn.src_address}
                  {conn.src_port && (
                    <span className="text-surface-500">:{conn.src_port}</span>
                  )}
                </td>
                <td className="font-mono text-xs">
                  {conn.dst_address}
                  {conn.dst_port && (
                    <span className="text-surface-500">:{conn.dst_port}</span>
                  )}
                </td>
                <td>
                  <span className="badge badge-info">
                    {conn.protocol.toUpperCase()}
                  </span>
                </td>
                <td className="text-xs text-surface-400">
                  {conn.connection_state}
                </td>
                <td className="text-xs font-mono text-surface-400">
                  {((conn.orig_bytes + conn.repl_bytes) / 1024).toFixed(1)} KB
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center text-surface-500 py-8">
                  No hay conexiones que coincidan
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-[0.65rem] text-surface-600 mt-2">
        Mostrando {Math.min(filtered.length, 50)} de {filtered.length} conexiones
      </p>
    </div>
  );
}
