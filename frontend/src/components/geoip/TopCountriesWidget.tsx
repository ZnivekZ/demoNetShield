/**
 * TopCountriesWidget — Top países atacantes cruzando CrowdSec + Wazuh + MikroTik.
 * Ubicado en IntelligenceView (/crowdsec/intelligence).
 */

import { useState } from 'react';
import { Globe, RefreshCw, Shield } from 'lucide-react';
import { useTopCountries } from '../../hooks/useTopCountries';
import { CountryFlag } from './CountryFlag';
import type { TopCountryItem } from '../../types';

const SOURCE_OPTIONS = [
  { value: 'all',       label: 'Todas las fuentes' },
  { value: 'crowdsec',  label: 'CrowdSec' },
  { value: 'wazuh',     label: 'Wazuh' },
  { value: 'mikrotik',  label: 'MikroTik' },
] as const;

type Source = typeof SOURCE_OPTIONS[number]['value'];

function ProgressBar({ pct }: { pct: number }) {
  return (
    <div className="flex-1 h-1.5 bg-surface-800 rounded-full overflow-hidden">
      <div
        className="h-full rounded-full bg-gradient-to-r from-brand-600 to-brand-400 transition-all duration-700"
        style={{ width: `${Math.min(pct, 100)}%` }}
      />
    </div>
  );
}

function SourceBadge({ label, count }: { label: string; count: number }) {
  if (count === 0) return null;
  return (
    <span className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[0.6rem] font-medium bg-surface-800 text-surface-400 border border-surface-700">
      {label} <span className="text-surface-200">{count}</span>
    </span>
  );
}

function CountryRow({ country, onBlock }: { country: TopCountryItem; onBlock?: (cc: string) => void }) {
  return (
    <tr className="group hover:bg-brand-600/5 transition-colors">
      <td className="py-2.5 px-3">
        <div className="flex items-center gap-2">
          <CountryFlag code={country.country_code} size="sm" tooltip={false} />
          <div>
            <div className="text-sm font-medium text-surface-200 leading-tight">
              {country.country_name}
            </div>
            <div className="text-[0.65rem] text-surface-500 font-mono">
              {country.country_code}
            </div>
          </div>
        </div>
      </td>
      <td className="py-2.5 px-2">
        <div className="flex items-center gap-2">
          <ProgressBar pct={country.percentage} />
          <span className="text-xs text-surface-400 w-8 text-right shrink-0">
            {country.percentage.toFixed(0)}%
          </span>
        </div>
      </td>
      <td className="py-2.5 px-2 text-right">
        <span className="text-sm font-semibold text-surface-200">{country.count}</span>
      </td>
      <td className="py-2.5 px-2">
        <div className="flex gap-1 flex-wrap">
          <SourceBadge label="CS" count={country.sources.crowdsec} />
          <SourceBadge label="WZ" count={country.sources.wazuh} />
          <SourceBadge label="MT" count={country.sources.mikrotik} />
        </div>
      </td>
      <td className="py-2.5 px-3 text-right">
        <button
          onClick={() => onBlock?.(country.country_code)}
          className="opacity-0 group-hover:opacity-100 transition-opacity btn btn-ghost text-xs px-2 py-1 text-danger border-danger/30 hover:bg-danger/10"
          title={`Bloquear tráfico de ${country.country_name}`}
        >
          <Shield size={12} />
          Bloquear
        </button>
      </td>
    </tr>
  );
}

interface TopCountriesWidgetProps {
  className?: string;
  onBlockCountry?: (countryCode: string) => void;
}

export function TopCountriesWidget({ className = '', onBlockCountry }: TopCountriesWidgetProps) {
  const [source, setSource] = useState<Source>('all');
  const { data, isLoading, refetch, dataUpdatedAt } = useTopCountries({ limit: 7, source });

  const updatedAt = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
    : '—';

  return (
    <div className={`glass-card overflow-hidden ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-surface-700/40">
        <div className="flex items-center gap-2">
          <Globe size={16} className="text-brand-400" />
          <h3 className="text-sm font-semibold text-surface-200">Top Países Atacantes</h3>
          {data && (
            <span className="badge badge-info text-[0.6rem]">
              {data.total_ips} IPs
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Source selector */}
          <select
            className="text-xs bg-surface-800 border border-surface-700 rounded-lg px-2 py-1 text-surface-300 cursor-pointer focus:outline-none focus:border-brand-500"
            value={source}
            onChange={e => setSource(e.target.value as Source)}
          >
            {SOURCE_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <button
            onClick={() => refetch()}
            disabled={isLoading}
            className="p-1.5 rounded-lg text-surface-500 hover:text-surface-200 hover:bg-surface-700/50 transition-colors"
            title="Actualizar"
          >
            <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-10">
          <div className="loading-spinner" />
        </div>
      ) : !data?.countries.length ? (
        <div className="flex flex-col items-center justify-center py-10 gap-2">
          <Globe size={28} className="text-surface-600" />
          <p className="text-sm text-surface-500">Sin datos de geolocalización</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th className="text-left">País</th>
                <th className="text-left">Distribución</th>
                <th className="text-right">IPs</th>
                <th className="text-left">Fuentes</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.countries.map(c => (
                <CountryRow key={c.country_code} country={c} onBlock={onBlockCountry} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Footer */}
      <div className="px-4 py-2 border-t border-surface-700/30 flex items-center justify-between">
        <span className="text-[0.65rem] text-surface-600">
          Actualizado {updatedAt} · polling cada 5 min
        </span>
        {data?.source && data.source !== 'all' && (
          <span className="badge badge-info text-[0.6rem]">
            Solo {data.source}
          </span>
        )}
      </div>
    </div>
  );
}
