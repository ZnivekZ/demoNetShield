/**
 * AgentsPage.tsx — Wazuh agent registry browser.
 *
 * Route: /wazuh/agents
 *
 * Layout:
 *   ┌─ Header + summary pills (active / total / disconnected) ──────────────┐
 *   ├─ Filter bar: status + search ─────────────────────────────────────────┤
 *   ├─ Agent cards grid (responsive) ──────────────────────────────────────┤
 *   └─ Pagination ──────────────────────────────────────────────────────────┘
 *
 * Each card links to /wazuh/agents/:id for the detail panel.
 */
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Server, Search, Filter, X, ChevronLeft, ChevronRight,
  Activity, Wifi, WifiOff, Clock, ChevronRight as ChevronRightIcon,
  CheckCircle2,
} from 'lucide-react';
import { useWazuhAgents } from '../../hooks/useWazuh';
import { useAgentsSummary } from '../../hooks/useWazuhSummary';
import { formatDateTime } from '../utils/time';
import type { WazuhAgent, WazuhAgentsFilters } from '../../types';

const PAGE_SIZE = 24;

type AgentStatus = WazuhAgentsFilters['status'];

const STATUS_OPTIONS: { value: AgentStatus | ''; label: string; color: string }[] = [
  { value: '', label: 'Todos', color: 'text-surface-300' },
  { value: 'active', label: 'Activos', color: 'text-emerald-400' },
  { value: 'disconnected', label: 'Desconectados', color: 'text-amber-400' },
  { value: 'never_connected', label: 'Nunca conectados', color: 'text-surface-500' },
  { value: 'pending', label: 'Pendientes', color: 'text-blue-400' },
];

export function WazuhAgentsPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const [page, setPage] = useState<number>(Number(searchParams.get('page')) || 1);
  const [status, setStatus] = useState<AgentStatus | ''>(
    (searchParams.get('status') as AgentStatus) || ''
  );
  const [search, setSearch] = useState<string>(searchParams.get('search') || '');
  const [showFilters, setShowFilters] = useState(false);

  // Sync to URL
  useEffect(() => {
    const params: Record<string, string> = {};
    if (page > 1) params.page = String(page);
    if (status) params.status = status;
    if (search) params.search = search;
    setSearchParams(params, { replace: true });
  }, [page, status, search, setSearchParams]);

  const filters: WazuhAgentsFilters = {
    page,
    page_size: PAGE_SIZE,
    status: status || undefined,
    search: search || undefined,
  };

  const { data, isLoading, isFetching } = useWazuhAgents(filters);
  const { data: summary } = useAgentsSummary();

  const items = data?.items ?? [];
  const pagination = data?.pagination;
  const hasFilters = !!(status || search);

  const applyFilters = () => {
    setPage(1);
    setShowFilters(false);
  };

  const clearAll = () => {
    setStatus('');
    setSearch('');
    setPage(1);
  };

  return (
    <div className="space-y-4">
      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Server className="w-5 h-5 text-cyan-400" />
            <h1 className="text-2xl font-bold text-surface-100">Agentes Wazuh</h1>
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
            Endpoints registrados y su estado de conexión
          </p>
        </div>
        <button
          className={`btn-secondary flex items-center gap-2 text-sm ${
            hasFilters ? 'border-cyan-500/50 text-cyan-300' : ''
          }`}
          onClick={() => setShowFilters(!showFilters)}
        >
          <Filter className="w-4 h-4" />
          Filtros {hasFilters && '(activos)'}
        </button>
      </div>

      {/* ── Summary pills ───────────────────────────────────────────── */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <SummaryPill
            icon={<CheckCircle2 className="w-4 h-4" />}
            label="Activos"
            value={summary.active ?? 0}
            color="emerald"
          />
          <SummaryPill
            icon={<WifiOff className="w-4 h-4" />}
            label="Desconectados"
            value={summary.disconnected ?? 0}
            color="amber"
          />
          <SummaryPill
            icon={<Clock className="w-4 h-4" />}
            label="Nunca conectados"
            value={summary.never_connected ?? 0}
            color="slate"
          />
          <SummaryPill
            icon={<Server className="w-4 h-4" />}
            label="Total"
            value={summary.total ?? 0}
            color="cyan"
          />
        </div>
      )}

      {/* ── Filters panel ───────────────────────────────────────────── */}
      {showFilters && (
        <div className="glass-card p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-surface-400 mb-1 flex items-center gap-1">
              <Activity className="w-3 h-3" /> Estado
            </label>
            <select
              className="input-sm w-full"
              value={status || ''}
              onChange={e => setStatus(e.target.value as AgentStatus | '')}
            >
              {STATUS_OPTIONS.map(o => (
                <option key={o.value || 'all'} value={o.value || ''}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-surface-400 mb-1 flex items-center gap-1">
              <Search className="w-3 h-3" /> Buscar
            </label>
            <input
              className="input-sm w-full"
              placeholder="nombre, IP o ID"
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
          {status && (
            <Chip onRemove={() => setStatus('')}>
              Estado: {STATUS_OPTIONS.find(o => o.value === status)?.label}
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

      {/* ── Agent grid ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {isLoading ? (
          [...Array(8)].map((_, i) => (
            <div key={i} className="glass-card p-4 h-32 animate-pulse" />
          ))
        ) : items.length === 0 ? (
          <div className="col-span-full glass-card p-12 text-center">
            <Server className="w-10 h-10 text-surface-700 mx-auto mb-2" />
            <p className="text-surface-400 text-sm">No hay agentes con los filtros actuales</p>
            {hasFilters && (
              <button className="btn-secondary text-sm mt-3" onClick={clearAll}>
                Limpiar filtros
              </button>
            )}
          </div>
        ) : (
          items.map(agent => <AgentCard key={agent.id} agent={agent} />)
        )}
      </div>

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

// ── Agent card ─────────────────────────────────────────────────────

function AgentCard({ agent }: { agent: WazuhAgent }) {
  const statusKey = (agent.status || 'unknown').toLowerCase();
  const isActive = statusKey === 'active';
  const isDisconnected = statusKey === 'disconnected';
  const StatusIcon = isActive ? Wifi : isDisconnected ? WifiOff : Clock;

  return (
    <Link
      to={`/wazuh/agents/${encodeURIComponent(agent.id)}`}
      className="glass-card p-4 hover:border-cyan-500/40 transition-all group block"
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <StatusIcon className={`w-4 h-4 shrink-0 ${
            isActive ? 'text-emerald-400' :
            isDisconnected ? 'text-amber-400' :
            'text-surface-500'
          }`} />
          <h4 className="text-sm font-semibold text-surface-100 truncate" title={agent.name}>
            {agent.name || agent.id}
          </h4>
        </div>
        <ChevronRightIcon className="w-3.5 h-3.5 text-surface-600 group-hover:text-cyan-400 transition-colors shrink-0" />
      </div>

      <p className="text-xs text-surface-400 font-mono mb-3 truncate">
        {agent.ip || '—'}
      </p>

      <div className="grid grid-cols-2 gap-1.5 text-[11px] mb-3">
        <FieldMini label="OS" value={agent.os_name || '—'} />
        <FieldMini label="Versión" value={agent.os_version || '—'} />
        <FieldMini label="Manager" value={agent.manager || '—'} />
        <FieldMini label="ID" value={agent.id} mono />
      </div>

      <div className="flex items-center justify-between text-[10px] text-surface-500 pt-2 border-t border-surface-800/40">
        <span title={agent.last_keep_alive}>
          KA: {agent.last_keep_alive ? formatDateTime(agent.last_keep_alive) : '—'}
        </span>
        {agent.group && agent.group.length > 0 && (
          <span className="px-1.5 py-0.5 rounded bg-surface-800/60 text-surface-400 truncate max-w-[100px]">
            {agent.group[0]}
          </span>
        )}
      </div>
    </Link>
  );
}

function FieldMini({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <span className="text-surface-500">{label}: </span>
      <span className={`text-surface-300 ${mono ? 'font-mono' : ''} truncate`}>{value}</span>
    </div>
  );
}

// ── Summary pill ───────────────────────────────────────────────────

function SummaryPill({
  icon, label, value, color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: 'emerald' | 'amber' | 'slate' | 'cyan';
}) {
  const colorMap = {
    emerald: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
    amber: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
    slate: 'text-surface-400 bg-surface-800/60 border-surface-700/40',
    cyan: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30',
  };
  return (
    <div className={`glass-card px-4 py-3 flex items-center gap-3 border ${colorMap[color]}`}>
      {icon}
      <div>
        <p className="text-[10px] uppercase tracking-wider text-surface-400">{label}</p>
        <p className="text-lg font-bold leading-tight">{value}</p>
      </div>
    </div>
  );
}

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