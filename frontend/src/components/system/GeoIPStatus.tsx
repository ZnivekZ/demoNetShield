/**
 * GeoIPStatus — Panel de estado de las bases de datos GeoLite2.
 * Ubicado en la página de Sistema (/system).
 */

import { useQuery } from '@tanstack/react-query';
import { Database, RefreshCw, CheckCircle, XCircle, Info } from 'lucide-react';
import { geoipApi } from '../../services/api';
import type { GeoIPDBStatus } from '../../types';

function DBRow({ label, db }: { label: string; db: GeoIPDBStatus['city_db'] }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-surface-700/30 last:border-0">
      <div className="flex items-center gap-2">
        {db.loaded ? (
          <CheckCircle size={14} className="text-success" />
        ) : (
          <XCircle size={14} className="text-danger" />
        )}
        <span className="text-sm text-surface-300">{label}</span>
      </div>
      <div className="flex items-center gap-3 text-xs text-surface-500">
        {db.loaded ? (
          <>
            <span className="badge badge-success text-[0.6rem]">Cargada</span>
            {db.build_epoch && (
              <span title="Fecha de build de la DB">
                Build: {new Date(db.build_epoch * 1000).toLocaleDateString('es-AR')}
              </span>
            )}
          </>
        ) : (
          <span className="badge badge-medium text-[0.6rem]">No descargada</span>
        )}
        <span className="font-mono text-surface-600 text-[0.65rem] max-w-[180px] truncate" title={db.path}>
          {db.path.split('/').pop()}
        </span>
      </div>
    </div>
  );
}

export function GeoIPStatus() {
  const { data, isLoading, refetch, dataUpdatedAt } = useQuery<GeoIPDBStatus | null>({
    queryKey: ['geoip', 'db-status'],
    queryFn: async () => {
      const res = await geoipApi.getDBStatus();
      return res.success ? res.data : null;
    },
    staleTime: 1000 * 60,
    refetchInterval: 1000 * 60 * 5,
  });

  const updatedAt = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
    : '—';

  return (
    <div className="glass-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-surface-700/40">
        <div className="flex items-center gap-2">
          <Database size={16} className="text-brand-400" />
          <h3 className="text-sm font-semibold text-surface-200">GeoLite2 — Bases de Datos</h3>
          {data && (
            <span className={`badge text-[0.6rem] ${data.mock_mode ? 'badge-medium' : 'badge-success'}`}>
              {data.mock_mode ? 'MOCK' : 'REAL'}
            </span>
          )}
        </div>
        <button
          onClick={() => refetch()}
          disabled={isLoading}
          className="p-1.5 rounded-lg text-surface-500 hover:text-surface-200 hover:bg-surface-700/50 transition-colors"
          title="Verificar estado"
        >
          <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Content */}
      <div className="px-4 py-2">
        {isLoading ? (
          <div className="flex justify-center py-6">
            <div className="loading-spinner" />
          </div>
        ) : !data ? (
          <p className="text-sm text-surface-500 py-4 text-center">Error al obtener estado</p>
        ) : (
          <>
            <DBRow label="GeoLite2-City (ciudad, coordenadas)" db={data.city_db} />
            <DBRow label="GeoLite2-ASN (redes, proveedores)" db={data.asn_db} />

            {/* Cache info */}
            {!data.mock_mode && (
              <div className="mt-3 pt-3 border-t border-surface-700/30 flex gap-4 text-xs text-surface-500">
                <span>Caché: <strong className="text-surface-300">{data.cache_size}</strong> IPs en memoria</span>
                <span>TTL: <strong className="text-surface-300">{data.cache_ttl_seconds / 3600}h</strong></span>
              </div>
            )}

            {/* Mock mode instructions */}
            {data.mock_mode && (
              <div className="mt-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <div className="flex items-start gap-2">
                  <Info size={14} className="text-amber-400 mt-0.5 shrink-0" />
                  <div className="text-xs text-amber-200/80 space-y-1">
                    <p className="font-medium text-amber-300">Modo mock activo</p>
                    <p>Para usar datos reales:</p>
                    <ol className="list-decimal list-inside space-y-0.5 text-amber-200/70">
                      <li>Registrarse en <code className="font-mono">maxmind.com/en/geolite2/signup</code></li>
                      <li>Agregar <code className="font-mono">MAXMIND_LICENSE_KEY</code> al <code className="font-mono">.env</code></li>
                      <li>Ejecutar <code className="font-mono">python backend/scripts/download_geoip.py</code></li>
                      <li>Cambiar <code className="font-mono">MOCK_GEOIP=false</code> y reiniciar</li>
                    </ol>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t border-surface-700/30">
        <span className="text-[0.65rem] text-surface-600">
          Verificado {updatedAt} · MaxMind actualiza los martes
        </span>
      </div>
    </div>
  );
}
