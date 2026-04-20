/**
 * AlertsPage.tsx — Vista de alertas IDS/IPS de Suricata.
 *
 * Layout:
 *   ┌─ Header + filtros ────────────────────────────────────────────────────┐
 *   ├─ Live feed (alertas WebSocket) ───────────────────────────────────────┤
 *   ├─ Timeline chart (area IDS vs IPS por minuto) ─────────────────────────┤
 *   ├─ Tabla de alertas con paginación ─────────────────────────────────────┤
 *   └─ Panel lateral: Top firmas ────────────────────────────────────────────┘
 */
import { useState } from 'react';
import {
  AlertTriangle, Filter, X,
  Clock, Shield,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { useSuricataAlerts } from '../../hooks/useSuricataAlerts';
import { useSuricataAutoResponse } from '../../hooks/useSuricataAutoResponse';
import { ConfirmModal } from '../common/ConfirmModal';
import type { SuricataAlert } from '../../types';

// ── Helpers ──────────────────────────────────────────────────────────────────

const SEVERITY_LABELS: Record<number, { label: string; cls: string }> = {
  1: { label: 'Crítica', cls: 'text-red-400 bg-red-500/10' },
  2: { label: 'Mayor', cls: 'text-amber-400 bg-amber-500/10' },
  3: { label: 'Menor', cls: 'text-blue-400 bg-blue-500/10' },
};

const ACTION_LABELS: Record<string, { label: string; cls: string }> = {
  alert: { label: 'Alerta', cls: 'text-blue-300 bg-blue-500/10' },
  drop: { label: 'Bloqueado', cls: 'text-red-300 bg-red-500/10' },
  pass: { label: 'Permitido', cls: 'text-emerald-300 bg-emerald-500/10' },
};

function SeverityBadge({ severity }: { severity: number }) {
  const s = SEVERITY_LABELS[severity] ?? SEVERITY_LABELS[3];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${s.cls}`}>
      {s.label}
    </span>
  );
}

function ActionBadge({ action }: { action: string }) {
  const a = ACTION_LABELS[action] ?? ACTION_LABELS.alert;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${a.cls}`}>
      {a.label}
    </span>
  );
}

// ── Live Feed ─────────────────────────────────────────────────────────────────

function LiveFeed({ alerts }: { alerts: SuricataAlert[] }) {
  if (alerts.length === 0) return null;

  return (
    <div className="glass-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
        <span className="text-xs font-medium text-emerald-400 uppercase tracking-wide">Live Feed</span>
        <span className="text-xs text-surface-500">{alerts.length} alertas recibidas</span>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-2">
        {alerts.slice(0, 5).map(alert => (
          <div key={alert.id} className="shrink-0 bg-surface-800/60 border border-surface-700/40 rounded-lg p-3 text-xs w-64">
            <div className="flex items-center justify-between mb-1">
              <SeverityBadge severity={alert.severity} />
              <ActionBadge action={alert.action} />
            </div>
            <p className="text-surface-200 font-medium truncate mt-1.5">{alert.signature}</p>
            <p className="text-surface-500 mt-1 font-mono">
              {alert.src_ip}:{alert.src_port} → {alert.dst_ip}:{alert.dst_port}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Alert Row ─────────────────────────────────────────────────────────────────

function AlertRow({ alert, onAutoResponse }: {
  alert: SuricataAlert;
  onAutoResponse: (alert: SuricataAlert) => void;
}) {
  return (
    <tr className="border-b border-surface-800/30 hover:bg-surface-800/20 transition-colors group">
      <td className="px-3 py-2.5 text-xs text-surface-400 font-mono whitespace-nowrap">
        {new Date(alert.timestamp).toLocaleTimeString()}
      </td>
      <td className="px-3 py-2.5"><SeverityBadge severity={alert.severity} /></td>
      <td className="px-3 py-2.5 text-xs text-surface-200 max-w-xs truncate">{alert.signature}</td>
      <td className="px-3 py-2.5 text-xs text-surface-400 font-mono whitespace-nowrap">
        {alert.src_ip}
      </td>
      <td className="px-3 py-2.5 text-xs text-surface-400 font-mono whitespace-nowrap">
        {alert.dst_ip}:{alert.dst_port}
      </td>
      <td className="px-3 py-2.5"><ActionBadge action={alert.action} /></td>
      <td className="px-3 py-2.5 text-xs text-surface-500">{alert.protocol}</td>
      <td className="px-3 py-2.5 text-xs text-surface-500 truncate max-w-[120px]">{alert.category}</td>
      <td className="px-3 py-2.5">
        <button
          className="opacity-0 group-hover:opacity-100 flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300 transition-all"
          onClick={() => onAutoResponse(alert)}
          title="Activar auto-response para esta IP"
        >
          <Shield className="w-3.5 h-3.5" />
          Responder
        </button>
      </td>
    </tr>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function SuricataAlertsPage() {
  const {
    alerts, total, timeline, signatures,
    liveAlerts, isLoading, isTimelineLoading,
    filters, updateFilters, clearFilters,
  } = useSuricataAlerts();

  const { config, trigger, isTriggering, isCircuitEnabled } = useSuricataAutoResponse();
  const [selectedAlert, setSelectedAlert] = useState<SuricataAlert | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [filterSrcIp, setFilterSrcIp] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterSeverity, setFilterSeverity] = useState('');

  const hasFilters = !!(filters.src_ip || filters.category || filters.severity);

  const applyFilters = () => {
    updateFilters({
      src_ip: filterSrcIp || undefined,
      category: filterCategory || undefined,
      severity: filterSeverity ? Number(filterSeverity) : undefined,
    });
    setShowFilters(false);
  };

  const handleClearFilters = () => {
    setFilterSrcIp('');
    setFilterCategory('');
    setFilterSeverity('');
    clearFilters();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="w-5 h-5 text-amber-400" />
            <h1 className="text-2xl font-bold text-surface-100">Alertas IDS/IPS</h1>
            <span className="text-sm text-surface-400 ml-1">({total.toLocaleString()} total)</span>
          </div>
          <p className="text-sm text-surface-400">Detecciones de Suricata en tiempo real</p>
        </div>

        <div className="flex gap-2">
          <button
            className={`btn-secondary flex items-center gap-2 text-sm ${hasFilters ? 'border-violet-500/50 text-violet-300' : ''}`}
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter className="w-4 h-4" />
            Filtros {hasFilters && `(${Object.values(filters).filter(Boolean).length})`}
          </button>
          {hasFilters && (
            <button className="btn-secondary text-sm" onClick={handleClearFilters}>
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Filters panel */}
      {showFilters && (
        <div className="glass-card p-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="text-xs text-surface-400 mb-1 block">IP Origen</label>
            <input
              className="input-sm w-full font-mono"
              placeholder="ej: 192.168.1.100"
              value={filterSrcIp}
              onChange={e => setFilterSrcIp(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-surface-400 mb-1 block">Categoría</label>
            <input
              className="input-sm w-full"
              placeholder="ej: ET SCAN"
              value={filterCategory}
              onChange={e => setFilterCategory(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-surface-400 mb-1 block">Severidad</label>
            <select
              className="input-sm w-full"
              value={filterSeverity}
              onChange={e => setFilterSeverity(e.target.value)}
            >
              <option value="">Todas</option>
              <option value="1">1 — Crítica</option>
              <option value="2">2 — Mayor</option>
              <option value="3">3 — Menor</option>
            </select>
          </div>
          <div className="sm:col-span-3 flex justify-end gap-2">
            <button className="btn-secondary text-sm" onClick={() => setShowFilters(false)}>Cancelar</button>
            <button className="btn-primary text-sm" onClick={applyFilters}>Aplicar filtros</button>
          </div>
        </div>
      )}

      {/* Live alerts feed */}
      <LiveFeed alerts={liveAlerts} />

      {/* Timeline chart */}
      <div className="glass-card p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-surface-100">Timeline de alertas (últ. 2h)</h3>
          <Clock className="w-4 h-4 text-surface-500" />
        </div>
        {isTimelineLoading ? (
          <div className="h-40 animate-pulse bg-surface-800/50 rounded-lg" />
        ) : (
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart data={timeline} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="gradIDS" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradIPS" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="minute"
                tickFormatter={v => v.slice(11, 16)}
                tick={{ fill: '#64748b', fontSize: 10 }}
                axisLine={false} tickLine={false}
              />
              <YAxis tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', fontSize: '12px' }}
              />
              <Legend wrapperStyle={{ fontSize: '11px', color: '#94a3b8' }} />
              <Area type="monotone" dataKey="count_ids" name="IDS (detectado)" stroke="#f59e0b" fill="url(#gradIDS)" strokeWidth={2} dot={false} />
              <Area type="monotone" dataKey="count_ips" name="IPS (bloqueado)" stroke="#ef4444" fill="url(#gradIPS)" strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Main content: table + sidebar */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        {/* Alerts table — 3 cols */}
        <div className="xl:col-span-3 glass-card overflow-hidden">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-8 bg-surface-800/50 rounded animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-surface-800/50 bg-surface-900/50">
                    {['Hora', 'Sev.', 'Firma', 'Src IP', 'Dst IP:Port', 'Acción', 'Proto', 'Categoría', ''].map(h => (
                      <th key={h} className="px-3 py-2.5 text-xs text-surface-400 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {alerts.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-8 text-center text-surface-500 text-sm">
                        No hay alertas con los filtros actuales
                      </td>
                    </tr>
                  ) : (
                    alerts.map(alert => (
                      <AlertRow
                        key={alert.id}
                        alert={alert}
                        onAutoResponse={setSelectedAlert}
                      />
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Top signatures sidebar — 1 col */}
        <div className="glass-card p-4">
          <h3 className="font-semibold text-surface-100 mb-3 text-sm">Top Firmas</h3>
          {signatures.length === 0 ? (
            <p className="text-surface-500 text-xs">Sin datos</p>
          ) : (
            <div className="space-y-2">
              {signatures.map((sig, i) => (
                <div key={sig.sid} className="flex items-start gap-2">
                  <span className="text-surface-600 text-xs w-4 shrink-0">{i + 1}.</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-surface-200 truncate">{sig.signature}</p>
                    <div className="flex items-center justify-between mt-0.5">
                      <span className="text-xs text-surface-500">{sig.category}</span>
                      <span className="text-xs font-medium text-amber-400">{sig.hits} hits</span>
                    </div>
                    <div className="mt-1 h-1 bg-surface-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-amber-500/60 rounded-full"
                        style={{ width: `${(sig.hits / (signatures[0]?.hits || 1)) * 100}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Auto-response confirm modal */}
      {selectedAlert && (
        <ConfirmModal
          title="Activar Auto-Response"
          description={`Esta acción bloqueará la IP ${selectedAlert.src_ip} en CrowdSec y MikroTik por 24 horas debido a la alerta detectada.`}
          data={{
            'IP Atacante': selectedAlert.src_ip,
            'Firma': selectedAlert.signature.slice(0, 50),
            'Severidad': SEVERITY_LABELS[selectedAlert.severity]?.label ?? '—',
            'Circuito': isCircuitEnabled ? 'Habilitado' : '⚠ Deshabilitado',
          }}
          confirmLabel="Bloquear IP"
          onConfirm={() => {
            if (!isCircuitEnabled) return;
            trigger({
              ip: selectedAlert.src_ip,
              trigger_alert_id: selectedAlert.id,
              duration: config?.actions.default_duration ?? '24h',
              reason: `Alerta Suricata: ${selectedAlert.signature}`,
            });
            setSelectedAlert(null);
          }}
          onCancel={() => setSelectedAlert(null)}
          isLoading={isTriggering}
        />
      )}
    </div>
  );
}
