/** Current CVEs explicitly marked Active by the Wazuh vulnerability index. */
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Bug, Search, X, ChevronDown, ChevronLeft, ChevronRight,
  RefreshCw, Server, Package, Clock, ShieldAlert,
} from 'lucide-react';
import { useActiveCveInventory } from '../../hooks/useWazuh';
import { formatDateTime } from '../utils/time';
import type { ActiveCve, CveSeverity } from '../../types';

const PAGE_SIZE = 20;
const SEVERITIES: Array<{ value: CveSeverity | ''; label: string }> = [
  { value: '', label: 'Todas' },
  { value: 'critical', label: 'Críticas' },
  { value: 'high', label: 'Altas' },
  { value: 'medium', label: 'Medias' },
  { value: 'low', label: 'Bajas' },
  { value: 'unknown', label: 'Sin clasificar' },
];
const SEVERITY_LABEL: Record<CveSeverity, string> = {
  critical: 'Crítica', high: 'Alta', medium: 'Media', low: 'Baja', unknown: 'Sin clasificar',
};
const SEVERITY_COLOR: Record<CveSeverity, string> = {
  critical: 'text-red-300 bg-red-500/15 border-red-500/40',
  high: 'text-orange-300 bg-orange-500/15 border-orange-500/40',
  medium: 'text-amber-300 bg-amber-500/15 border-amber-500/40',
  low: 'text-blue-300 bg-blue-500/15 border-blue-500/40',
  unknown: 'text-slate-300 bg-slate-500/15 border-slate-500/40',
};

function formatArgentina(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) return isoTimestamp;
  return date.toLocaleString('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export function WazuhVulnerabilitiesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const rawSeverity = searchParams.get('severity') || '';
  const severity = SEVERITIES.some(option => option.value === rawSeverity)
    ? rawSeverity as CveSeverity | '' : '';
  const search = searchParams.get('search') || '';
  const agentId = searchParams.get('agent') || '';
  const kevOnly = searchParams.get('kev') === '1';
  const rawPage = Number(searchParams.get('page'));
  const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  const updateFilters = (changes: Record<string, string>) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(changes).forEach(([key, value]) => value ? next.set(key, value) : next.delete(key));
    if (!('page' in changes)) next.delete('page');
    setSearchParams(next, { replace: true });
  };

  const { data, isLoading, isFetching, refetch } = useActiveCveInventory({
    page, page_size: PAGE_SIZE, severity: severity || undefined,
    search: search || undefined, agent_id: agentId || undefined, kev_only: kevOnly,
  });
  const items = data?.items ?? [];
  const summary = data?.summary;
  const pagination = data?.pagination;
  const hasFilters = !!(search || severity || agentId || kevOnly);
  const unavailable = !isLoading && data === null;
  const checkedAt = data?.checked_at ? formatArgentina(data.checked_at) : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Bug className="w-5 h-5 text-amber-400" />
            <h1 className="text-2xl font-bold text-surface-100">CVEs activos en Wazuh</h1>
            {pagination && <span className="text-sm text-surface-400">({pagination.total.toLocaleString('es-AR')})</span>}
          </div>
          <p className="text-sm text-surface-400 mt-1">
            Vulnerabilidades que Wazuh informa como activas en sus agentes.
          </p>
          <p className="text-xs text-surface-500 mt-1">
            {checkedAt ? `Consultado: ${checkedAt} (Argentina)` : 'Estado actual del índice de Wazuh'}
            {' · '}La detección no demuestra que el equipo haya sido explotado.
          </p>
        </div>
        <button className="btn-secondary flex items-center gap-2 text-sm disabled:opacity-50"
          onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
          {isFetching ? 'Actualizando…' : 'Actualizar'}
        </button>
      </div>

      {unavailable && (
        <div className="glass-card p-5 border-amber-500/30 bg-amber-500/5 flex gap-3">
          <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-amber-300">No se pudo comprobar el estado actual</p>
            <p className="text-xs text-surface-400 mt-1">
              {kevOnly
                ? 'Revisá la conexión con Wazuh o quitá el filtro CISA KEV si el catálogo no está disponible.'
                : 'Revisá la conexión con Wazuh Indexer y volvé a consultar.'}
            </p>
          </div>
        </div>
      )}

      {data && !data.kev_available && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-xs text-amber-200">
          El catálogo CISA KEV no está disponible. Se muestran los CVEs activos; su pertenencia a KEV queda sin determinar.
        </div>
      )}

      <div className="glass-card p-4 space-y-4">
        <div className="flex flex-wrap gap-2 border-b border-surface-800/70 pb-3">
          {SEVERITIES.map(option => (
            <button key={option.value || 'all'}
              onClick={() => updateFilters({ severity: option.value })}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold border transition-colors ${severity === option.value
                ? 'border-amber-400/50 bg-amber-500/15 text-amber-200'
                : 'border-surface-700/60 text-surface-400 hover:text-surface-200'}`}>
              {option.label}{summary && option.value ? ` ${summary[option.value]}` : ''}
            </button>
          ))}
        </div>
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(160px,230px)_auto] items-end">
          <SearchBox key={search} value={search} onSubmit={value => updateFilters({ search: value })} />
          <div>
            <label htmlFor="cve-agent" className="block text-xs text-surface-400 mb-1">Agente</label>
            <select id="cve-agent" className="input-sm w-full" value={agentId}
              onChange={event => updateFilters({ agent: event.target.value })}>
              <option value="">Todos los agentes</option>
              {(data?.agents ?? []).map(agent =>
                <option key={agent.id} value={agent.id}>{agent.name || agent.id}</option>
              )}
            </select>
          </div>
          <label className="inline-flex items-center gap-2 text-xs text-surface-300 min-h-9 cursor-pointer">
            <input type="checkbox" checked={kevOnly} disabled={data?.kev_available === false}
              onChange={event => updateFilters({ kev: event.target.checked ? '1' : '' })} />
            Solo CISA KEV
          </label>
        </div>
        {hasFilters && (
          <button className="text-xs text-surface-400 hover:text-surface-200 inline-flex items-center gap-1"
            onClick={() => setSearchParams({}, { replace: true })}>
            <X className="w-3 h-3" /> Limpiar filtros
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="glass-card p-6 space-y-3">{Array.from({ length: 5 }, (_, i) =>
          <div key={i} className="h-16 rounded bg-surface-800/40 animate-pulse" />
        )}</div>
      ) : data && items.length === 0 ? (
        <div className="glass-card p-10 text-center">
          <Bug className="w-9 h-9 text-surface-600 mx-auto mb-2" />
          <p className="text-sm text-surface-300">
            {hasFilters ? 'No hay CVEs activos con estos filtros' : 'Wazuh no informa CVEs activos en este momento'}
          </p>
          <p className="text-xs text-surface-500 mt-1">La consulta solo incluye hallazgos con estado Active.</p>
        </div>
      ) : data ? (
        <div className="space-y-2">{items.map(item => <CveRow key={item.cve_id} cve={item} />)}</div>
      ) : null}

      {pagination && pagination.total > 0 && (
        <div className="glass-card px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-surface-400">
            {Math.min((pagination.page - 1) * pagination.page_size + 1, pagination.total)}–
            {Math.min(pagination.page * pagination.page_size, pagination.total)} de {pagination.total.toLocaleString('es-AR')} CVEs
          </p>
          <div className="flex items-center gap-2 text-xs text-surface-400">
            <button className="btn-secondary disabled:opacity-30" disabled={!pagination.has_prev}
              onClick={() => updateFilters({ page: String(pagination.page - 1) })} aria-label="Página anterior">
              <ChevronLeft className="w-4 h-4" />
            </button>
            Página {pagination.page} / {pagination.total_pages}
            <button className="btn-secondary disabled:opacity-30" disabled={!pagination.has_next}
              onClick={() => updateFilters({ page: String(pagination.page + 1) })} aria-label="Página siguiente">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SearchBox({ value, onSubmit }: { value: string; onSubmit: (value: string) => void }) {
  const [draft, setDraft] = useState(value);
  return (
    <form onSubmit={event => { event.preventDefault(); onSubmit(draft.trim()); }}>
      <label htmlFor="cve-search" className="block text-xs text-surface-400 mb-1">CVE, paquete o agente</label>
      <div className="flex gap-2">
        <input id="cve-search" className="input-sm w-full" placeholder="Buscar CVE-2026-…"
          value={draft} onChange={event => setDraft(event.target.value)} />
        <button type="submit" className="btn-secondary" aria-label="Buscar"><Search className="w-4 h-4" /></button>
      </div>
    </form>
  );
}

function CveRow({ cve }: { cve: ActiveCve }) {
  const [open, setOpen] = useState(false);
  return (
    <article className="glass-card overflow-hidden">
      <button type="button" className="w-full px-4 py-3 text-left hover:bg-surface-800/20"
        onClick={() => setOpen(value => !value)} aria-expanded={open}>
        <div className="flex flex-wrap items-center gap-2">
          <span title="Mayor severidad informada entre los agentes" className={`rounded border px-2 py-0.5 text-xs font-semibold ${SEVERITY_COLOR[cve.severity]}`}>
            {SEVERITY_LABEL[cve.severity]}
          </span>
          <span className="font-mono text-sm font-bold text-surface-100">{cve.cve_id}</span>
          {cve.is_kev && <span className="rounded border border-red-500/40 bg-red-500/10 px-2 py-0.5 text-xs font-semibold text-red-300">CISA KEV</span>}
          <span className="rounded border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-xs text-cyan-200">Activo según Wazuh</span>
          <ChevronDown className={`ml-auto w-4 h-4 text-surface-400 transition-transform ${open ? 'rotate-180' : ''}`} />
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-surface-400">
          <span>{cve.agent_count} agente{cve.agent_count === 1 ? '' : 's'}</span>
          <span>CVSS {cve.cvss_score !== null ? cve.cvss_score.toFixed(1) : 'no informado'}</span>
          {cve.is_kev && cve.kev_product && <span>KEV: {cve.kev_product}</span>}
        </div>
        {cve.description && <p className="mt-2 text-xs text-surface-400 line-clamp-2">{cve.description}</p>}
      </button>
      {open && (
        <div className="border-t border-surface-800 px-4 py-3 space-y-3">
          <p className="text-xs text-surface-400">Wazuh mantiene este CVE como activo en los siguientes agentes y paquetes:</p>
          {cve.agents.map((evidence, index) => (
            <div key={`${evidence.agent_id}-${evidence.package_name}-${evidence.package_version}-${index}`}
              className="rounded-lg border border-surface-800 bg-surface-900/40 px-3 py-2 text-xs">
              <div className="flex flex-wrap gap-x-5 gap-y-1">
                <span className="inline-flex items-center gap-1 text-surface-200 font-semibold">
                  <Server className="w-3.5 h-3.5 text-cyan-400" />
                  {evidence.agent_id
                    ? <Link to={`/wazuh/agents/${encodeURIComponent(evidence.agent_id)}`} className="text-cyan-300 hover:underline">{evidence.agent_name || evidence.agent_id}</Link>
                    : evidence.agent_name}
                </span>
                <span className="inline-flex items-center gap-1 text-surface-300">
                  <Package className="w-3.5 h-3.5 text-surface-500" />
                  {evidence.package_name || 'Paquete no informado'}{evidence.package_version ? ` ${evidence.package_version}` : ''}
                </span>
                <span className="inline-flex items-center gap-1 text-surface-400">
                  <Clock className="w-3.5 h-3.5 text-surface-500" />
                  Detectado: {evidence.detected_at ? formatDateTime(evidence.detected_at) : 'fecha no informada'}
                </span>
                <span className={`rounded border px-1.5 py-0.5 ${SEVERITY_COLOR[evidence.severity]}`}>
                  {SEVERITY_LABEL[evidence.severity]}{evidence.cvss_score !== null ? ` · CVSS ${evidence.cvss_score.toFixed(1)}` : ''}
                </span>
                <span className="text-cyan-300">Activo</span>
              </div>
            </div>
          ))}
          {cve.is_kev && <p className="text-xs text-surface-500">CISA KEV señala explotación conocida de esta vulnerabilidad, no explotación de estos equipos.</p>}
        </div>
      )}
    </article>
  );
}
