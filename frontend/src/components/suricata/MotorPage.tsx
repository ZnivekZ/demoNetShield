/**
 * MotorPage.tsx — Vista principal del motor Suricata IDS/IPS/NSM.
 *
 * Layout:
 *   ┌─ Header con modo + versión + uptime ──────────────────────────────────┐
 *   │  [IDS badge] [v7.0.8] [↑ 2d 14h] [Reload Rules btn] [Update Rules btn] │
 *   ├─ KPI row (4 cards) ───────────────────────────────────────────────────┤
 *   │  Paquetes capturados │ Alertas totales │ Flujos activos │ Reglas cargadas │
 *   ├─ Main grid (2 col) ───────────────────────────────────────────────────┤
 *   │  EngineMetricsChart (paquetes/seg + dropped)  │ CategoryDonut + top sigs │
 *   ├─ AutoResponse panel ──────────────────────────────────────────────────┤
 *   │  Config del circuito + historial reciente                             │
 *   └───────────────────────────────────────────────────────────────────────┘
 */
import { useState } from 'react';
import {
  Radar, Cpu, Activity, ShieldCheck,
  RotateCcw, Download, Clock, Zap,
  CheckCircle2, XCircle, AlertTriangle,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import { useSuricataEngine } from '../../hooks/useSuricataEngine';
import { useSuricataAlerts } from '../../hooks/useSuricataAlerts';
import { useSuricataAutoResponse } from '../../hooks/useSuricataAutoResponse';
import { ConfirmModal } from '../common/ConfirmModal';

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(1)} KB`;
  return `${bytes} B`;
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function ModeBadge({ mode }: { mode: string }) {
  const colors: Record<string, string> = {
    ids: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
    ips: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    nsm: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
  };
  const labels: Record<string, string> = {
    ids: 'IDS — Pasivo',
    ips: 'IPS — Activo',
    nsm: 'NSM — Forense',
  };
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${colors[mode] ?? colors.ids}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
      {labels[mode] ?? mode.toUpperCase()}
    </span>
  );
}

// ── KPI Card ─────────────────────────────────────────────────────────────────

interface KpiCardProps {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ElementType;
  color: string;
}

function KpiCard({ label, value, sub, icon: Icon, color }: KpiCardProps) {
  return (
    <div className="glass-card p-4 flex gap-3 items-start">
      <div className={`p-2 rounded-lg ${color}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-surface-400">{label}</p>
        <p className="text-xl font-bold text-surface-100 tabular-nums">{value}</p>
        {sub && <p className="text-xs text-surface-500 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ── AutoResponse Panel ────────────────────────────────────────────────────────

function AutoResponsePanel() {
  const {
    config, recentHistory, isLoading,
    updateConfig, isUpdating,
    isCircuitEnabled,
  } = useSuricataAutoResponse();

  const [confirmToggle, setConfirmToggle] = useState(false);

  if (isLoading) {
    return (
      <div className="glass-card p-6 animate-pulse">
        <div className="h-4 bg-surface-700 rounded w-1/3 mb-4" />
        <div className="h-20 bg-surface-700 rounded" />
      </div>
    );
  }

  return (
    <div className="glass-card p-6">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-amber-400" />
          <h3 className="font-semibold text-surface-100">Circuito de Auto-Response</h3>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
            isCircuitEnabled
              ? 'bg-emerald-500/15 text-emerald-400'
              : 'bg-surface-700 text-surface-400'
          }`}>
            {isCircuitEnabled ? 'Activo' : 'Inactivo'}
          </span>
        </div>

        <button
          className={`btn-sm ${isCircuitEnabled ? 'btn-danger' : 'btn-primary'}`}
          onClick={() => setConfirmToggle(true)}
        >
          {isCircuitEnabled ? 'Deshabilitar' : 'Habilitar'} Circuito
        </button>
      </div>

      {/* Config grid */}
      {config && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5 text-sm">
          <div className="bg-surface-800/50 rounded-lg p-3">
            <p className="text-surface-400 text-xs mb-1">Umbral alertas</p>
            <p className="font-medium text-surface-100">{config.suricata_threshold} alertas</p>
          </div>
          <div className="bg-surface-800/50 rounded-lg p-3">
            <p className="text-surface-400 text-xs mb-1">Nivel Wazuh req.</p>
            <p className="font-medium text-surface-100">≥ {config.wazuh_level_required}</p>
          </div>
          <div className="bg-surface-800/50 rounded-lg p-3">
            <p className="text-surface-400 text-xs mb-1">Acciones</p>
            <div className="flex gap-1 flex-wrap">
              {config.actions.crowdsec_ban && (
                <span className="text-xs bg-blue-500/15 text-blue-300 px-1.5 py-0.5 rounded">CrowdSec</span>
              )}
              {config.actions.mikrotik_block && (
                <span className="text-xs bg-orange-500/15 text-orange-300 px-1.5 py-0.5 rounded">MikroTik</span>
              )}
            </div>
          </div>
          <div className="bg-surface-800/50 rounded-lg p-3">
            <p className="text-surface-400 text-xs mb-1">Duración default</p>
            <p className="font-medium text-surface-100">{config.actions.default_duration}</p>
          </div>
        </div>
      )}

      {/* Warning if auto_trigger enabled */}
      {config?.auto_trigger && (
        <div className="flex items-start gap-2 p-3 mb-4 bg-amber-500/10 border border-amber-500/20 rounded-lg text-xs text-amber-300">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            <strong>Auto-trigger activo:</strong> El circuito se activará automáticamente
            sin confirmación humana al superar el umbral. Revise la configuración.
          </span>
        </div>
      )}

      {/* Recent history */}
      {recentHistory.length > 0 && (
        <div>
          <p className="text-xs text-surface-400 mb-2 font-medium uppercase tracking-wide">Activaciones recientes</p>
          <div className="space-y-2">
            {recentHistory.slice(0, 3).map(entry => (
              <div key={entry.id} className="flex items-center justify-between text-xs bg-surface-800/40 rounded-lg px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-surface-200">{entry.ip}</span>
                  <span className="text-surface-500">—</span>
                  <span className="text-surface-400">{entry.reason || 'Auto-response'}</span>
                </div>
                <div className="flex items-center gap-2 text-surface-500">
                  <span>{entry.actions_taken.join(', ')}</span>
                  <span>{new Date(entry.triggered_at).toLocaleTimeString()}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Confirm toggle modal */}
      {confirmToggle && config && (
        <ConfirmModal
          title={isCircuitEnabled ? 'Deshabilitar Auto-Response' : 'Habilitar Auto-Response'}
          description={
            isCircuitEnabled
              ? 'El sistema dejará de bloquear IPs automáticamente al detectar amenazas Suricata.'
              : 'El sistema podrá bloquear IPs en CrowdSec y MikroTik al detectar amenazas Suricata que superen el umbral configurado.'
          }
          data={{
            'Umbral': `${config.suricata_threshold} alertas`,
            'Acciones': [config.actions.crowdsec_ban && 'CrowdSec ban', config.actions.mikrotik_block && 'MikroTik block'].filter(Boolean).join(' + '),
          }}
          confirmLabel={isCircuitEnabled ? 'Deshabilitar' : 'Habilitar'}
          onConfirm={() => {
            updateConfig({ enabled: !isCircuitEnabled });
            setConfirmToggle(false);
          }}
          onCancel={() => setConfirmToggle(false)}
          isLoading={isUpdating}
        />
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function SuricataMotorPage() {
  const { engineStatus, series, isLoadingStats, reloadRules, isReloading } = useSuricataEngine(30);
  const { categories } = useSuricataAlerts();
  const [confirmReload, setConfirmReload] = useState(false);
  const [reloadDone, setReloadDone] = useState<boolean | null>(null);

  const eng = engineStatus;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Radar className="w-6 h-6 text-violet-400" />
            <h1 className="text-2xl font-bold text-surface-100">Motor Suricata</h1>
            {eng && <ModeBadge mode={eng.mode} />}
          </div>
          <p className="text-sm text-surface-400">
            {eng ? (
              <>v{eng.version} · {eng.interface} · Uptime {formatUptime(eng.uptime_seconds)}</>
            ) : (
              'Cargando estado del motor...'
            )}
          </p>
        </div>

        <div className="flex gap-2 flex-wrap">
          <button
            className="btn-secondary flex items-center gap-2 text-sm"
            onClick={() => setConfirmReload(true)}
            disabled={isReloading}
          >
            <RotateCcw className={`w-4 h-4 ${isReloading ? 'animate-spin' : ''}`} />
            Recargar Reglas
          </button>
        </div>
      </div>

      {/* Status banner */}
      {eng && (
        <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-sm ${
          eng.running
            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
            : 'bg-red-500/10 border-red-500/20 text-red-300'
        }`}>
          {eng.running
            ? <CheckCircle2 className="w-4 h-4" />
            : <XCircle className="w-4 h-4" />}
          <span>
            Motor {eng.running ? 'activo' : 'detenido'} ·{' '}
            {eng.rules_loaded.toLocaleString()} reglas cargadas ·{' '}
            {eng.rules_failed > 0 && <span className="text-amber-300">{eng.rules_failed} fallos</span>}
            {eng.rules_failed === 0 && <span>0 fallos</span>}
          </span>
          {eng.mock && (
            <span className="ml-auto text-xs bg-violet-500/15 text-violet-300 px-2 py-0.5 rounded-full">mock</span>
          )}
        </div>
      )}

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Paquetes capturados"
          value={eng ? eng.packets_captured.toLocaleString() : '—'}
          sub={eng ? `${((eng.packets_dropped / Math.max(eng.packets_captured, 1)) * 100).toFixed(1)}% drop rate` : undefined}
          icon={Activity}
          color="bg-blue-500/10 text-blue-400"
        />
        <KpiCard
          label="Alertas totales"
          value={eng ? eng.alerts_total.toLocaleString() : '—'}
          sub="IDS + IPS"
          icon={ShieldCheck}
          color="bg-red-500/10 text-red-400"
        />
        <KpiCard
          label="Flujos activos"
          value={eng ? eng.flows_active.toLocaleString() : '—'}
          icon={Cpu}
          color="bg-emerald-500/10 text-emerald-400"
        />
        <KpiCard
          label="Datos procesados"
          value={eng ? formatBytes(eng.bytes_processed) : '—'}
          sub={`${eng?.packets_dropped.toLocaleString() ?? 0} paquetes dropped`}
          icon={Download}
          color="bg-violet-500/10 text-violet-400"
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Engine metrics chart — 2 cols */}
        <div className="glass-card p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-surface-100">Tráfico del motor (últ. 30 min)</h3>
            <Clock className="w-4 h-4 text-surface-500" />
          </div>
          {isLoadingStats ? (
            <div className="h-48 animate-pulse bg-surface-800/50 rounded-lg" />
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={series} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradPkts" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradDrop" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="minute"
                  tickFormatter={v => v.slice(11, 16)}
                  tick={{ fill: '#64748b', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', fontSize: '12px' }}
                  labelStyle={{ color: '#94a3b8' }}
                />
                <Area type="monotone" dataKey="packets_per_sec" name="Paquetes/s" stroke="#6366f1" fill="url(#gradPkts)" strokeWidth={2} dot={false} />
                <Area type="monotone" dataKey="dropped" name="Dropped" stroke="#ef4444" fill="url(#gradDrop)" strokeWidth={1.5} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Category donut — 1 col */}
        <div className="glass-card p-5">
          <h3 className="font-semibold text-surface-100 mb-4">Categorías de alertas</h3>
          {categories.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-surface-500 text-sm">Sin datos</div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={categories}
                  dataKey="count"
                  nameKey="category"
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={2}
                >
                  {categories.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', fontSize: '12px' }}
                />
                <Legend
                  iconType="circle"
                  iconSize={8}
                  wrapperStyle={{ fontSize: '11px', color: '#94a3b8' }}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Auto-response circuit */}
      <AutoResponsePanel />

      {/* Confirm reload-rules modal */}
      {confirmReload && (
        <ConfirmModal
          title="Recargar Reglas"
          description="Suricata leerá las reglas actualizadas en memoria sin reiniciar el motor. No hay pausa de captura de tráfico."
          data={{ 'Reglas activas': eng?.rules_loaded.toLocaleString() ?? '—', 'Impacto': 'Ninguno (hot-reload)' }}
          confirmLabel="Recargar"
          onConfirm={() => {
            reloadRules(undefined, {
              onSuccess: () => { setReloadDone(true); },
              onError: () => { setReloadDone(false); },
            });
            setConfirmReload(false);
          }}
          onCancel={() => setConfirmReload(false)}
          isLoading={isReloading}
        />
      )}

      {/* Reload result toast */}
      {reloadDone !== null && (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-2xl text-sm font-medium
          ${reloadDone ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}
          onClick={() => setReloadDone(null)}
        >
          {reloadDone ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
          {reloadDone ? 'Reglas recargadas exitosamente' : 'Error al recargar reglas'}
        </div>
      )}
    </div>
  );
}
