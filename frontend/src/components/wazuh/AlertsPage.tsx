/**
 * AlertsPage.tsx — Paginated Wazuh alerts browser.
 *
 * Route: /wazuh/alerts
 *
 * Layout:
 *   ┌─ Header + filter bar ──────────────────────────────────────────────────┐
 *   ├─ Pagination summary + page nav ────────────────────────────────────────┤
 *   ├─ Table of alerts (severity, description, agent, src/dst IP, full log) ─┤
 *   └─ Page controls (prev/next, jump to page) ──────────────────────────────┘
 *
 * URL query string sync: ?page=&level_min=&agent_id=&rule_id=&search=
 */
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams, Link } from 'react-router-dom';
import {
  ShieldAlert, Filter, X, ChevronLeft, ChevronRight,
  Search, Activity, Hash, Server, ScrollText,
} from 'lucide-react';
import { useWazuhAlerts } from '../../hooks/useWazuh';
import { formatDateTime, severityClass } from '../utils/time';
import type { WazuhAlertsFilters, WazuhAlert } from '../../types';

const PAGE_SIZE = 25;

export function WazuhAlertsPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  // Initialise local state from URL search params (deep-link friendly)
  const [page, setPage] = useState<number>(Number(searchParams.get('page')) || 1);
  const [levelMin, setLevelMin] = useState<number | ''>(
    searchParams.get('level_min') ? Number(searchParams.get('level_min')) : ''
  );
  const [agentId, setAgentId] = useState<string>(searchParams.get('agent_id') || '');
  const [ruleId, setRuleId] = useState<string>(searchParams.get('rule_id') || '');
  const [search, setSearch] = useState<string>(searchParams.get('search') || '');
  const [showFilters, setShowFilters] = useState(false);

  // Persist to URL
  useEffect(() => {
    const params: Record<string, string> = {};
    if (page > 1) params.page = String(page);
    if (levelMin !== '') params.level_min = String(levelMin);
    if (agentId) params.agent_id = agentId;
    if (ruleId) params.rule_id = ruleId;
    if (search) params.search = search;
    setSearchParams(params, { replace: true });
  }, [page, levelMin, agentId, ruleId, search, setSearchParams]);

  const filters: WazuhAlertsFilters = {
    page,
    page_size: PAGE_SIZE,
    level_min: levelMin === '' ? undefined : levelMin,
    agent_id: agentId || undefined,
    rule_id: ruleId || undefined,
    search: search || undefined,
  };

  const { data, isLoading, isFetching } = useWazuhAlerts(filters);

  const items = data?.items ?? [];
  const pagination = data?.pagination;
  const hasFilters = !!(levelMin !== '' || agentId || ruleId || search);

  const applyFilters = () => {
    setPage(1);
    setShowFilters(false);
  };

  const clearAll = () => {
    setLevelMin('');
    setAgentId('');
    setRuleId('');
    setSearch('');
    setPage(1);
  };

  return (
    <div className="space-y-4">
      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <ShieldAlert className="w-5 h-5 text-cyan-400" />
            <h1 className="text-2xl font-bold text-surface-100">Alertas Wazuh</h1>
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
            Visor paginado con filtros por nivel, agente, regla y búsqueda libre
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            className={`btn-secondary flex items-center gap-2 text-sm ${
              hasFilters ? 'border-cyan-500/50 text-cyan-300' : ''
            }`}
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter className="w-4 h-4" />
            Filtros {hasFilters && '(activos)'}
          </button>
          {hasFilters && (
            <button className="btn-secondary text-sm" onClick={clearAll} title="Limpiar filtros">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* ── Filters panel ───────────────────────────────────────────── */}
      {showFilters && (
        <div className="glass-card p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="text-xs text-surface-400 mb-1 flex items-center gap-1">
              <Activity className="w-3 h-3" /> Nivel mínimo
            </label>
            <select
              className="input-sm w-full"
              value={levelMin === '' ? '' : String(levelMin)}
              onChange={e => setLevelMin(e.target.value === '' ? '' : Number(e.target.value))}
            >
              <option value="">Todos</option>
              <option value="3">≥ 3 (bajo)</option>
              <option value="5">≥ 5 (medio)</option>
              <option value="8">≥ 8 (alto)</option>
              <option value="12">≥ 12 (crítico)</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-surface-400 mb-1 flex items-center gap-1">
              <Server className="w-3 h-3" /> Agent ID
            </label>
            <input
              className="input-sm w-full font-mono"
              placeholder="ej: 001"
              value={agentId}
              onChange={e => setAgentId(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-surface-400 mb-1 flex items-center gap-1">
              <Hash className="w-3 h-3" /> Rule ID
            </label>
            <input
              className="input-sm w-full font-mono"
              placeholder="ej: 5715"
              value={ruleId}
              onChange={e => setRuleId(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-surface-400 mb-1 flex items-center gap-1">
              <Search className="w-3 h-3" /> Buscar
            </label>
            <input
              className="input-sm w-full"
              placeholder="descripción, agente…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className="sm:col-span-2 lg:col-span-4 flex justify-end gap-2">
            <button className="btn-secondary text-sm" onClick={() => setShowFilters(false)}>
              Cancelar
            </button>
            <button className="btn-primary text-sm" onClick={applyFilters}>
              Aplicar filtros
            </button>
          </div>
        </div>
      )}

      {/* ── Active filter chips ─────────────────────────────────────── */}
      {hasFilters && (
        <div className="flex flex-wrap items-center gap-2">
          {levelMin !== '' && (
            <Chip onRemove={() => setLevelMin('')}>Nivel ≥ {levelMin}</Chip>
          )}
          {agentId && <Chip onRemove={() => setAgentId('')}>Agent {agentId}</Chip>}
          {ruleId && <Chip onRemove={() => setRuleId('')}>Regla {ruleId}</Chip>}
          {search && <Chip onRemove={() => setSearch('')}>“{search}”</Chip>}
        </div>
      )}

      {/* ── Alerts table ────────────────────────────────────────────── */}
      <div className="glass-card overflow-hidden">
        {isLoading ? (
          <div className="p-6 space-y-3">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="h-7 bg-surface-800/40 rounded animate-pulse" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center">
            <ShieldAlert className="w-10 h-10 text-surface-700 mx-auto mb-2" />
            <p className="text-surface-400 text-sm">No hay alertas con los filtros actuales</p>
            {hasFilters && (
              <button className="btn-secondary text-sm mt-3" onClick={clearAll}>
                Limpiar filtros
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-surface-800/50 bg-surface-900/40">
                  {['Hora', 'Nivel', 'Descripción', 'Agente', 'Origen', 'Destino', 'Regla', 'Log'].map(h => (
                    <th key={h} className="px-3 py-2.5 text-[11px] text-surface-500 font-medium uppercase tracking-wider whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map(alert => (
                  <AlertRow key={alert.id} alert={alert} />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination footer */}
        {pagination && pagination.total > 0 && (
          <Pagination
            page={pagination.page}
            totalPages={pagination.total_pages}
            hasPrev={pagination.has_prev}
            hasNext={pagination.has_next}
            total={pagination.total}
            pageSize={pagination.page_size}
            onPage={setPage}
          />
        )}
      </div>
    </div>
  );
}

// ── Alert row ──────────────────────────────────────────────────────

function AlertRow({ alert }: { alert: WazuhAlert }) {
  const [showLog, setShowLog] = useState(false);

  return (
    <tr className="border-b border-surface-800/30 hover:bg-surface-800/15 transition-colors group">
      <td className="px-3 py-2.5 text-xs text-surface-400 font-mono whitespace-nowrap">
        {formatDateTime(alert.timestamp)}
      </td>
      <td className="px-3 py-2.5">
        <span className={`wazuh-sev-badge wazuh-sev-${severityClass(alert.rule_level)}`}>
          {alert.rule_level}
        </span>
      </td>
      <td className="px-3 py-2.5 text-xs text-surface-200 max-w-md">
        <p className="truncate">{alert.rule_description}</p>
        {alert.rule_groups && alert.rule_groups.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {alert.rule_groups.slice(0, 3).map(g => (
              <span key={g} className="text-[10px] px-1.5 py-0.5 rounded bg-surface-800/60 text-surface-400">
                {g}
              </span>
            ))}
          </div>
        )}
      </td>
      <td className="px-3 py-2.5 text-xs">
        <Link
          to={`/wazuh/agents/${encodeURIComponent(alert.agent_id)}`}
          className="text-cyan-400 hover:text-cyan-300 truncate max-w-[180px] inline-block"
          title={`Ver detalle del agente ${alert.agent_id}`}
        >
          {alert.agent_name}
        </Link>
        <p className="text-[10px] text-surface-500 font-mono">{alert.agent_id}</p>
      </td>
      <td className="px-3 py-2.5 text-xs text-surface-300 font-mono whitespace-nowrap">
        {alert.src_ip || '—'}
      </td>
      <td className="px-3 py-2.5 text-xs text-surface-300 font-mono whitespace-nowrap">
        {alert.dst_ip || '—'}
      </td>
      <td className="px-3 py-2.5 text-xs text-surface-500 font-mono">{alert.rule_id}</td>
      <td className="px-3 py-2.5 text-xs max-w-[180px]">
        <div className="flex items-center gap-1">
          <p className="font-mono text-[10px] text-surface-500 truncate flex-1">
            {alert.full_log || '—'}
          </p>
          {alert.full_log && (
            <button
              onClick={() => setShowLog(true)}
              className="opacity-0 group-hover:opacity-100 transition-opacity text-surface-500 hover:text-cyan-400 shrink-0 p-0.5 rounded hover:bg-surface-800/60"
              title="Leer log completo"
              aria-label="Leer log completo"
            >
              <ScrollText className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </td>

      {showLog && alert.full_log && (
        createPortal(
          <LogModal log={alert.full_log} onClose={() => setShowLog(false)} />,
          document.body,
        )
      )}
    </tr>
  );
}

// ── Log modal ─────────────────────────────────────────────────────

function LogModal({ log, onClose }: { log: string; onClose: () => void }) {
  // Cerrar con Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="glass-card w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-surface-800/60 shrink-0">
          <span className="text-xs font-semibold uppercase tracking-wider text-surface-400 flex items-center gap-2">
            <ScrollText className="w-3.5 h-3.5 text-cyan-400" />
            Log completo de la alerta
          </span>
          <button
            onClick={onClose}
            className="text-surface-500 hover:text-surface-200 p-1 rounded hover:bg-surface-800/60"
            aria-label="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <pre className="p-5 overflow-auto text-xs font-mono text-surface-300 leading-relaxed whitespace-pre-wrap break-words">
          {log}
        </pre>
      </div>
    </div>
  );
}

// ── Pagination ─────────────────────────────────────────────────────

interface PaginationProps {
  page: number;
  totalPages: number;
  hasPrev: boolean;
  hasNext: boolean;
  total: number;
  pageSize: number;
  onPage: (p: number) => void;
}

function Pagination({ page, totalPages, hasPrev, hasNext, total, pageSize, onPage }: PaginationProps) {
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-surface-800/40 bg-surface-900/20">
      <p className="text-xs text-surface-400">
        Mostrando <span className="text-surface-200 font-medium">{start}-{end}</span> de{' '}
        <span className="text-surface-200 font-medium">{total.toLocaleString()}</span>
      </p>
      <div className="flex items-center gap-1">
        <button
          className="btn-secondary text-xs flex items-center gap-1 disabled:opacity-30 disabled:cursor-not-allowed"
          disabled={!hasPrev}
          onClick={() => onPage(page - 1)}
        >
          <ChevronLeft className="w-3.5 h-3.5" /> Anterior
        </button>
        <span className="text-xs text-surface-400 px-3">
          Página <span className="text-surface-100 font-medium">{page}</span> / {totalPages}
        </span>
        <button
          className="btn-secondary text-xs flex items-center gap-1 disabled:opacity-30 disabled:cursor-not-allowed"
          disabled={!hasNext}
          onClick={() => onPage(page + 1)}
        >
          Siguiente <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

// ── Filter chip ────────────────────────────────────────────────────

function Chip({ children, onRemove }: { children: React.ReactNode; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-xs">
      {children}
      <button onClick={onRemove} className="hover:text-cyan-100" aria-label="Quitar filtro">
        <X className="w-3 h-3" />
      </button>
    </span>
  );
}

