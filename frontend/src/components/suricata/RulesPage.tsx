/**
 * RulesPage.tsx — Gestión de reglas/firmas de Suricata.
 *
 * Layout:
 *   ┌─ Header + stats rulesets ─────────────────────────────────────────────┐
 *   ├─ Ruleset cards ───────────────────────────────────────────────────────┤
 *   ├─ Filtros: habilitadas / ruleset / categoría ───────────────────────────┤
 *   └─ Tabla de reglas con toggle on/off ───────────────────────────────────┘
 */
import { useState } from 'react';
import {
  BookOpen, ToggleLeft, ToggleRight, RefreshCw,
  CheckCircle2, XCircle, Search,
} from 'lucide-react';
import { useSuricataRules } from '../../hooks/useSuricataRules';
import { ConfirmModal } from '../common/ConfirmModal';
import type { SuricataRule, SuricataRuleset } from '../../types';

// ── Ruleset Card ─────────────────────────────────────────────────────────────

function RulesetCard({ ruleset }: { ruleset: SuricataRuleset }) {
  const pct = ruleset.rules_count > 0
    ? Math.round((ruleset.enabled_count / ruleset.rules_count) * 100)
    : 0;

  return (
    <div className="glass-card p-4">
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="font-medium text-surface-100 text-sm">{ruleset.name}</p>
          <p className="text-xs text-surface-400 mt-0.5">{ruleset.description}</p>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
          ruleset.is_active ? 'bg-emerald-500/15 text-emerald-400' : 'bg-surface-700 text-surface-400'
        }`}>
          {ruleset.is_active ? 'Activo' : 'Inactivo'}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 bg-surface-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-500/60 rounded-full transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-xs text-surface-400">{ruleset.enabled_count}/{ruleset.rules_count}</span>
      </div>
      {ruleset.last_updated && (
        <p className="text-xs text-surface-500 mt-2">
          Actualizado: {new Date(ruleset.last_updated).toLocaleDateString()}
          {ruleset.version && ` · v${ruleset.version}`}
        </p>
      )}
    </div>
  );
}

// ── Rule Row ─────────────────────────────────────────────────────────────────

function RuleRow({
  rule,
  onToggle,
  isToggling,
}: {
  rule: SuricataRule;
  onToggle: (sid: number, enabled: boolean) => void;
  isToggling: boolean;
}) {
  return (
    <tr className="border-b border-surface-800/30 hover:bg-surface-800/15 transition-colors group">
      <td className="px-3 py-2.5 text-xs text-surface-400 font-mono">{rule.sid}</td>
      <td className="px-3 py-2.5">
        <span className={`text-xs px-2 py-0.5 rounded font-medium ${
          rule.enabled ? 'bg-emerald-500/10 text-emerald-400' : 'bg-surface-700 text-surface-400'
        }`}>
          {rule.enabled ? 'Activa' : 'Inactiva'}
        </span>
      </td>
      <td className="px-3 py-2.5 text-xs text-violet-300">{rule.ruleset}</td>
      <td className="px-3 py-2.5 text-xs text-surface-300 max-w-xs truncate" title={rule.rule}>
        {rule.rule.replace(/^alert\s+/, '').slice(0, 80)}
      </td>
      <td className="px-3 py-2.5 text-xs text-surface-400">{rule.category}</td>
      <td className="px-3 py-2.5 text-right">
        <span className={`text-xs font-medium tabular-nums ${rule.hits_total > 0 ? 'text-amber-400' : 'text-surface-500'}`}>
          {rule.hits_total.toLocaleString()}
        </span>
      </td>
      <td className="px-3 py-2.5 text-right">
        <span className={`text-xs tabular-nums ${rule.hits_last_hour > 0 ? 'text-amber-300' : 'text-surface-600'}`}>
          {rule.hits_last_hour}
        </span>
      </td>
      <td className="px-3 py-2.5">
        <button
          className="p-1 rounded hover:bg-surface-700/50 transition-colors disabled:opacity-40"
          onClick={() => onToggle(rule.sid, !rule.enabled)}
          disabled={isToggling}
          title={rule.enabled ? 'Deshabilitar regla' : 'Habilitar regla'}
        >
          {rule.enabled
            ? <ToggleRight className="w-5 h-5 text-emerald-400" />
            : <ToggleLeft className="w-5 h-5 text-surface-500" />}
        </button>
      </td>
    </tr>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function SuricataRulesPage() {
  const {
    rules, totalRules, rulesets,
    isLoading,
    toggleRule, isToggling,
    updateRules, isUpdating, updateResult,
    filters, updateFilters,
  } = useSuricataRules();

  const [search, setSearch] = useState('');
  const [confirmUpdate, setConfirmUpdate] = useState(false);
  const [pendingToggle, setPendingToggle] = useState<{ sid: number; enabled: boolean } | null>(null);

  // Client-side search filter
  const displayed = search
    ? rules.filter(r =>
        r.rule.toLowerCase().includes(search.toLowerCase()) ||
        r.category.toLowerCase().includes(search.toLowerCase()) ||
        String(r.sid).includes(search)
      )
    : rules;

  const enabledCount = rules.filter(r => r.enabled).length;
  const hitRules = rules.filter(r => r.hits_total > 0).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <BookOpen className="w-5 h-5 text-blue-400" />
            <h1 className="text-2xl font-bold text-surface-100">Reglas Suricata</h1>
          </div>
          <p className="text-sm text-surface-400">
            {enabledCount} activas · {totalRules - enabledCount} inactivas · {hitRules} con hits
          </p>
        </div>

        <button
          className="btn-primary flex items-center gap-2 text-sm"
          onClick={() => setConfirmUpdate(true)}
          disabled={isUpdating}
        >
          <RefreshCw className={`w-4 h-4 ${isUpdating ? 'animate-spin' : ''}`} />
          {isUpdating ? 'Actualizando...' : 'Actualizar Reglas'}
        </button>
      </div>

      {/* Update result */}
      {updateResult && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-xl border text-sm ${
          updateResult.success
            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
            : 'bg-red-500/10 border-red-500/20 text-red-300'
        }`}>
          {updateResult.success ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
          {updateResult.success
            ? `suricata-update completado: ${updateResult.rules_updated?.toLocaleString() ?? '?'} reglas`
            : `Error: ${updateResult.message}`}
        </div>
      )}

      {/* Ruleset cards */}
      {rulesets.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {rulesets.map(rs => <RulesetCard key={rs.name} ruleset={rs} />)}
        </div>
      )}

      {/* Filters + search */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-surface-500" />
          <input
            className="input-sm pl-8 w-full"
            placeholder="Buscar por SID, texto de regla o categoría…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select
          className="input-sm"
          value={filters.enabled === undefined ? '' : String(filters.enabled)}
          onChange={e => updateFilters({ enabled: e.target.value === '' ? undefined : e.target.value === 'true' })}
        >
          <option value="">Todas</option>
          <option value="true">Activas</option>
          <option value="false">Inactivas</option>
        </select>
        <select
          className="input-sm"
          value={filters.ruleset ?? ''}
          onChange={e => updateFilters({ ruleset: e.target.value || undefined })}
        >
          <option value="">Todos los rulesets</option>
          {rulesets.map(rs => <option key={rs.name} value={rs.name}>{rs.name}</option>)}
        </select>
      </div>

      {/* Rules table */}
      <div className="glass-card overflow-hidden">
        {isLoading ? (
          <div className="p-6 space-y-2">
            {[...Array(8)].map((_, i) => <div key={i} className="h-8 bg-surface-800/50 rounded animate-pulse" />)}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-surface-800/50 bg-surface-900/50">
                  {['SID', 'Estado', 'Ruleset', 'Regla', 'Categoría', 'Hits', 'Últ. hora', 'Toggle'].map(h => (
                    <th key={h} className="px-3 py-2.5 text-xs text-surface-400 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayed.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-surface-500 text-sm">
                      No hay reglas con los filtros actuales
                    </td>
                  </tr>
                ) : displayed.map(rule => (
                  <RuleRow
                    key={rule.sid}
                    rule={rule}
                    onToggle={(sid, enabled) => setPendingToggle({ sid, enabled })}
                    isToggling={isToggling}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="px-4 py-2 border-t border-surface-800/30 text-xs text-surface-500">
          Mostrando {displayed.length} de {totalRules} reglas
        </div>
      </div>

      {/* Confirm update-rules modal */}
      {confirmUpdate && (
        <ConfirmModal
          title="Actualizar Reglas"
          description="Se ejecutará suricata-update para descargar la versión más reciente del ruleset. Las reglas se recargarán automáticamente en el motor al finalizar."
          data={{
            'Operación': 'suricata-update + hot-reload',
            'Duración estimada': '~10-30 segundos',
            'Impacto': 'Ninguno durante la captura',
          }}
          confirmLabel="Actualizar"
          onConfirm={() => { updateRules(); setConfirmUpdate(false); }}
          onCancel={() => setConfirmUpdate(false)}
          isLoading={isUpdating}
        />
      )}

      {/* Confirm toggle rule modal */}
      {pendingToggle && (
        <ConfirmModal
          title={pendingToggle.enabled ? 'Habilitar Regla' : 'Deshabilitar Regla'}
          description={`La regla SID ${pendingToggle.sid} ${pendingToggle.enabled ? 'comenzará a' : 'dejará de'} generar alertas. El cambio se aplica en el próximo ciclo de detección.`}
          data={{ 'SID': pendingToggle.sid, 'Acción': pendingToggle.enabled ? 'Habilitar' : 'Deshabilitar' }}
          confirmLabel={pendingToggle.enabled ? 'Habilitar' : 'Deshabilitar'}
          onConfirm={() => {
            toggleRule(pendingToggle.sid, pendingToggle.enabled);
            setPendingToggle(null);
          }}
          onCancel={() => setPendingToggle(null)}
          isLoading={isToggling}
        />
      )}
    </div>
  );
}
