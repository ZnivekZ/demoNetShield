/**
 * VulnerabilitiesPage.tsx — Wazuh vulnerability scanner browser.
 *
 * Route: /wazuh/vulnerabilities
 *
 * Layout:
 *   ┌─ Header + severity tabs ──────────────────────────────────────────────┐
 *   ├─ Summary (counts by severity) ────────────────────────────────────────┤
 *   ├─ Filter bar: severity + search ───────────────────────────────────────┤
 *   ├─ Vulnerability cards (CVE, CVSS circle, package, agent, ref) ─────────┤
 *   └─ Pagination ──────────────────────────────────────────────────────────┘
 */
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
  Bug, Search, Filter, X, ChevronLeft, ChevronRight,
  ShieldAlert, Package, ExternalLink,
} from 'lucide-react';
import { useWazuhVulnerabilities } from '../../hooks/useWazuh';
import { formatDateTime } from '../utils/time';
import type { WazuhVulnerability, WazuhVulnerabilitiesFilters } from '../../types';

const PAGE_SIZE = 20;

type SeverityFilter = WazuhVulnerabilitiesFilters['severity'];

const SEVERITY_TABS: { value: SeverityFilter | ''; label: string; color: string }[] = [
  { value: '', label: 'Todas', color: 'text-surface-300' },
  { value: 'critical', label: 'Críticas', color: 'text-red-400' },
  { value: 'high', label: 'Altas', color: 'text-orange-400' },
  { value: 'medium', label: 'Medias', color: 'text-amber-400' },
  { value: 'low', label: 'Bajas', color: 'text-blue-400' },
];

export function WazuhVulnerabilitiesPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const [page, setPage] = useState<number>(Number(searchParams.get('page')) || 1);
  const [severity, setSeverity] = useState<SeverityFilter | ''>(
    (searchParams.get('severity') as SeverityFilter) || ''
  );
  const [search, setSearch] = useState<string>(searchParams.get('search') || '');
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    const params: Record<string, string> = {};
    if (page > 1) params.page = String(page);
    if (severity) params.severity = severity;
    if (search) params.search = search;
    setSearchParams(params, { replace: true });
  }, [page, severity, search, setSearchParams]);

  const filters: WazuhVulnerabilitiesFilters = {
    page,
    page_size: PAGE_SIZE,
    severity: severity || undefined,
    search: search || undefined,
  };

  const { data, isLoading, isFetching } = useWazuhVulnerabilities(filters);
  // El hook hace select: r => r.data → data ya es el payload paginado.
  // null = el backend devolvió no_disponible (notAvailableResponse).
  const isBackendUnavailable = data === null;

  const items = data?.items ?? [];
  const pagination = data?.pagination;
  const hasFilters = !!(severity || search);

  // Compute summary counts by severity from current page (best effort)
  const summary = useMemo(() => {
    const counts = { critical: 0, high: 0, medium: 0, low: 0 };
    for (const v of items) {
      if (v.severity in counts) counts[v.severity]++;
    }
    return counts;
  }, [items]);

  const applyFilters = () => {
    setPage(1);
    setShowFilters(false);
  };

  const clearAll = () => {
    setSeverity('');
    setSearch('');
    setPage(1);
  };

  return (
    <div className="space-y-4">
      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Bug className="w-5 h-5 text-amber-400" />
            <h1 className="text-2xl font-bold text-surface-100">Vulnerabilidades</h1>
            {pagination && (
              <span className="text-sm text-surface-400 ml-1">
                ({pagination.total.toLocaleString()} total)
              </span>
            )}
            {isFetching && !isLoading && (
              <span className="text-xs text-cyan-400 ml-1 animate-pulse">actualizando…</span>
            )}
          </div>
          <p className="text-sm text-surface-400">
            CVEs detectados por el módulo Vulnerability Detector de Wazuh
          </p>
        </div>
        <button
          className={`btn-secondary flex items-center gap-2 text-sm ${
            hasFilters ? 'border-amber-500/50 text-amber-300' : ''
          }`}
          onClick={() => setShowFilters(!showFilters)}
        >
          <Filter className="w-4 h-4" />
          Filtros {hasFilters && '(activos)'}
        </button>
      </div>

      {/* ── Backend unavailable notice ──────────────────────────────── */}
      {isBackendUnavailable && (
        <div className="glass-card p-6 border-amber-500/30 bg-amber-500/5">
          <div className="flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-semibold text-amber-300">
                Pendiente de integración backend
              </h3>
              <p className="text-xs text-surface-400 mt-1 leading-relaxed">
                El backend no pudo devolver vulnerabilidades en este momento. Verificá que el
                módulo Vulnerability Detector de Wazuh esté activo y que el Indexer sea accesible.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Severity tabs ───────────────────────────────────────────── */}
      <div className="flex items-center gap-1 border-b border-surface-800/60 overflow-x-auto">
        {SEVERITY_TABS.map(tab => (
          <button
            key={tab.value || 'all'}
            onClick={() => { setSeverity(tab.value); setPage(1); }}
            className={`px-4 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
              severity === tab.value
                ? 'border-amber-400 text-amber-300'
                : 'border-transparent text-surface-400 hover:text-surface-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Severity summary (only when we have data) ───────────────── */}
      {!isBackendUnavailable && items.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <SevCount label="Críticas" count={summary.critical} color="red" />
          <SevCount label="Altas" count={summary.high} color="orange" />
          <SevCount label="Medias" count={summary.medium} color="amber" />
          <SevCount label="Bajas" count={summary.low} color="blue" />
        </div>
      )}

      {/* ── Filters panel ───────────────────────────────────────────── */}
      {showFilters && (
        <div className="glass-card p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-surface-400 mb-1 block">Severidad</label>
            <select
              className="input-sm w-full"
              value={severity || ''}
              onChange={e => setSeverity(e.target.value as SeverityFilter | '')}
            >
              {SEVERITY_TABS.map(o => (
                <option key={o.value || 'all'} value={o.value || ''}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-surface-400 mb-1 flex items-center gap-1">
              <Search className="w-3 h-3" /> Buscar (CVE, paquete, agente)
            </label>
            <input
              className="input-sm w-full"
              placeholder="ej: CVE-2024-1234"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className="sm:col-span-2 flex justify-end gap-2">
            <button className="btn-secondary text-sm" onClick={() => setShowFilters(false)}>
              Cancelar
            </button>
            <button className="btn-primary text-sm" onClick={applyFilters}>
              Aplicar filtros
            </button>
          </div>
        </div>
      )}

      {/* ── Active chips ────────────────────────────────────────────── */}
      {hasFilters && (
        <div className="flex flex-wrap items-center gap-2">
          {severity && (
            <Chip onRemove={() => setSeverity('')}>
              Severidad: {SEVERITY_TABS.find(t => t.value === severity)?.label}
            </Chip>
          )}
          {search && <Chip onRemove={() => setSearch('')}>“{search}”</Chip>}
          <button
            className="text-xs text-surface-500 hover:text-surface-300 underline"
            onClick={clearAll}
          >
            Limpiar todo
          </button>
        </div>
      )}

      {/* ── Vulnerability list ──────────────────────────────────────── */}
      {isLoading ? (
        <div className="glass-card p-6 space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-20 bg-surface-800/40 rounded animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 && !isBackendUnavailable ? (
        <div className="glass-card p-12 text-center">
          <Bug className="w-10 h-10 text-surface-700 mx-auto mb-2" />
          <p className="text-surface-400 text-sm">No hay vulnerabilidades con los filtros actuales</p>
          {hasFilters && (
            <button className="btn-secondary text-sm mt-3" onClick={clearAll}>
              Limpiar filtros
            </button>
          )}
        </div>
      ) : !isBackendUnavailable ? (
        <div className="space-y-2">
          {items.map(v => <VulnRow key={v.cve_id + v.agent_id} vuln={v} />)}
        </div>
      ) : null}

      {/* ── Pagination ──────────────────────────────────────────────── */}
      {pagination && pagination.total > 0 && (
        <div className="glass-card flex items-center justify-between px-4 py-3">
          <p className="text-xs text-surface-400">
            Mostrando{' '}
            <span className="text-surface-200 font-medium">
              {(pagination.page - 1) * pagination.page_size + 1}-
              {Math.min(pagination.page * pagination.page_size, pagination.total)}
            </span>{' '}
            de <span className="text-surface-200 font-medium">{pagination.total.toLocaleString()}</span>
          </p>
          <div className="flex items-center gap-1">
            <button
              className="btn-secondary text-xs flex items-center gap-1 disabled:opacity-30 disabled:cursor-not-allowed"
              disabled={!pagination.has_prev}
              onClick={() => setPage(pagination.page - 1)}
            >
              <ChevronLeft className="w-3.5 h-3.5" /> Anterior
            </button>
            <span className="text-xs text-surface-400 px-3">
              Página <span className="text-surface-100 font-medium">{pagination.page}</span> / {pagination.total_pages}
            </span>
            <button
              className="btn-secondary text-xs flex items-center gap-1 disabled:opacity-30 disabled:cursor-not-allowed"
              disabled={!pagination.has_next}
              onClick={() => setPage(pagination.page + 1)}
            >
              Siguiente <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Vulnerability row ──────────────────────────────────────────────

const SEV_CIRCLE: Record<string, string> = {
  critical: 'border-red-500/60 text-red-300 bg-red-500/10',
  high: 'border-orange-500/60 text-orange-300 bg-orange-500/10',
  medium: 'border-amber-500/60 text-amber-300 bg-amber-500/10',
  low: 'border-blue-500/60 text-blue-300 bg-blue-500/10',
};

function VulnRow({ vuln }: { vuln: WazuhVulnerability }) {
  const [expanded, setExpanded] = useState(false);
  const desc = vuln.description || vuln.title || '';
  const descLong = desc.length > 260;
  const shownDesc = expanded || !descLong ? desc : `${desc.slice(0, 260).trimEnd()}…`;

  return (
    <div className={`glass-card p-5 hover:border-amber-500/30 transition-colors wazuh-vuln-row wazuh-vuln-${vuln.severity}`}>
      <div className="flex items-start justify-between gap-5">
        {/* ── Identidad: badge + CVE + paquete ── */}
        <div className="min-w-0 flex-1 space-y-2.5">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className={`wazuh-sev-badge wazuh-sev-${vuln.severity}`}>
              {vuln.severity}
            </span>
            <span className="text-xs font-mono font-semibold text-amber-300/90 tracking-tight">
              {vuln.cve_id}
            </span>
            {vuln.package_name && (
              <span className="inline-flex items-center gap-1.5 text-[11px] text-surface-300 bg-surface-800/60 border border-surface-700/50 px-2 py-0.5 rounded-full">
                <Package className="w-3 h-3 text-surface-400" />
                {vuln.package_name}
                {vuln.package_version && (
                  <span className="text-surface-500">@{vuln.package_version}</span>
                )}
              </span>
            )}
          </div>

          {/* ── Descripción con clamp + expandir ── */}
          {desc && (
            <div>
              <p className="text-sm text-surface-300 leading-relaxed">
                {shownDesc}
                {descLong && !expanded && (
                  <button
                    onClick={() => setExpanded(true)}
                    className="ml-1.5 text-amber-400/90 hover:text-amber-300 text-xs align-baseline"
                  >
                    ver más
                  </button>
                )}
              </p>
              {expanded && (
                <button
                  onClick={() => setExpanded(false)}
                  className="mt-1 text-xs text-surface-500 hover:text-surface-300"
                >
                  ver menos
                </button>
              )}
            </div>
          )}
        </div>

        {/* ── Score CVSS ── */}
        <div className="flex flex-col items-center gap-1 shrink-0 pt-0.5">
          <div className={`w-14 h-14 rounded-full border-2 flex items-center justify-center ${SEV_CIRCLE[vuln.severity] || SEV_CIRCLE.low}`}>
            <span className="text-base font-bold leading-none">
              {vuln.cvss_score ? vuln.cvss_score.toFixed(1) : '—'}
            </span>
          </div>
          <span className="text-[9px] uppercase tracking-widest text-surface-500">CVSS</span>
        </div>
      </div>

      {/* ── Metadata ── */}
      <div className="mt-4 pt-3 border-t border-surface-800/50 grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-3 text-xs">
        <Meta
          label="Agente"
          value={
            <Link
              to={`/wazuh/agents/${encodeURIComponent(vuln.agent_id)}`}
              className="text-cyan-400 hover:text-cyan-300 truncate inline-block max-w-full align-bottom"
            >
              {vuln.agent_name || vuln.agent_id}
            </Link>
          }
        />
        <Meta
          label="Detectado"
          value={vuln.detected_at ? formatDateTime(vuln.detected_at) : '—'}
        />
        <Meta
          label="Referencia"
          value={
            vuln.references && vuln.references.length > 0 ? (
              <a
                href={vuln.references[0]}
                target="_blank"
                rel="noreferrer noopener"
                className="text-cyan-400 hover:text-cyan-300 inline-flex items-center gap-1"
                title={vuln.references[0]}
              >
                Ver advisory <ExternalLink className="w-3 h-3" />
              </a>
            ) : (
              '—'
            )
          }
        />
        <Meta
          label="Arquitectura"
          value={vuln.package_arch || '—'}
        />
      </div>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <span className="block text-[10px] uppercase tracking-wider text-surface-500 mb-0.5">
        {label}
      </span>
      <span className="text-surface-200 leading-snug">{value}</span>
    </div>
  );
}

function SevCount({ label, count, color }: { label: string; count: number; color: 'red' | 'orange' | 'amber' | 'blue' }) {
  const colorMap = {
    red: 'text-red-400 bg-red-500/10 border-red-500/30',
    orange: 'text-orange-400 bg-orange-500/10 border-orange-500/30',
    amber: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
    blue: 'text-blue-400 bg-blue-500/10 border-blue-500/30',
  };
  return (
    <div className={`glass-card px-3 py-2 flex items-center justify-between border ${colorMap[color]}`}>
      <span className="text-[10px] uppercase tracking-wider">{label}</span>
      <span className="text-lg font-bold">{count}</span>
    </div>
  );
}

function Chip({ children, onRemove }: { children: React.ReactNode; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs">
      {children}
      <button onClick={onRemove} className="hover:text-amber-100" aria-label="Quitar filtro">
        <X className="w-3 h-3" />
      </button>
    </span>
  );
}