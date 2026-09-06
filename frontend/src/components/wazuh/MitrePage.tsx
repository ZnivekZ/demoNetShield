/**
 * MitrePage.tsx — MITRE ATT&CK matrix coverage from Wazuh alerts.
 *
 * Route: /wazuh/mitre
 *
 * Layout:
 *   ┌─ Header + tactic legend ──────────────────────────────────────────────┐
 *   ├─ Heatmap matrix: techniques (rows) × tactics (columns) ───────────────┤
 *   ├─ Top techniques list (sortable) ──────────────────────────────────────┤
 *   └─ Side panel: technique detail (last seen, description, related rules) ─┘
 *
 * The MITRE matrix is rendered as a virtual grid: each cell corresponds to
 * a technique; cells are colored by alert count and clickable for details.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Target, Crosshair, ChevronRight, AlertCircle, ArrowUpDown,
} from 'lucide-react';
import { useWazuhMitreMatrix, useWazuhStatsSummary } from '../../hooks/useWazuh';
import { useMitreSummary } from '../../hooks/useWazuhSummary';
import { formatDateTime } from '../utils/time';
import type { MitreTechnique } from '../../types';

// ── ATT&CK tactic ordering (TAxxxx → human name) ───────────────────
const TACTIC_ORDER: { id: string; name: string; short: string }[] = [
  { id: 'TA0043', name: 'Reconnaissance', short: 'Recon' },
  { id: 'TA0042', name: 'Resource Development', short: 'Resource' },
  { id: 'TA0001', name: 'Initial Access', short: 'Initial' },
  { id: 'TA0002', name: 'Execution', short: 'Exec' },
  { id: 'TA0003', name: 'Persistence', short: 'Persist' },
  { id: 'TA0004', name: 'Privilege Escalation', short: 'PrivEsc' },
  { id: 'TA0005', name: 'Defense Evasion', short: 'Defense' },
  { id: 'TA0006', name: 'Credential Access', short: 'Cred' },
  { id: 'TA0007', name: 'Discovery', short: 'Disc' },
  { id: 'TA0008', name: 'Lateral Movement', short: 'Lateral' },
  { id: 'TA0009', name: 'Collection', short: 'Collect' },
  { id: 'TA0011', name: 'Command and Control', short: 'C2' },
  { id: 'TA0010', name: 'Exfiltration', short: 'Exfil' },
  { id: 'TA0040', name: 'Impact', short: 'Impact' },
];

export function WazuhMitrePage() {
  const { data: matrix, isLoading, error } = useWazuhMitreMatrix();
  const { data: summary = [] } = useMitreSummary();
  const { data: stats } = useWazuhStatsSummary();

  const [selectedTechId, setSelectedTechId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'count' | 'name' | 'recent'>('count');

  const isBackendUnavailable = !matrix && (!!error || !isLoading);

  // Group techniques by id for cross-tactic lookup
  const techIndex = useMemo(() => {
    const m = new Map<string, MitreTechnique>();
    for (const t of summary) m.set(t.technique_id, t);
    return m;
  }, [summary]);

  // Build matrix: rows = technique ids, columns = tactic ids
  const matrixData = useMemo(() => {
    if (!matrix || !matrix.tactics) {
      return null;
    }

    // Collect all techniques across all tactics
    const tacticByTech = new Map<string, Set<string>>(); // tech -> set of tactic ids
    const techMap = new Map<string, MitreTechnique & { total: number }>();

    for (const tactic of matrix.tactics) {
      for (const tech of tactic.techniques) {
        if (!tacticByTech.has(tech.technique_id)) {
          tacticByTech.set(tech.technique_id, new Set());
          techMap.set(tech.technique_id, { ...tech, total: 0 });
        }
        tacticByTech.get(tech.technique_id)!.add(tactic.tactic_id);
        const existing = techMap.get(tech.technique_id)!;
        existing.total += tech.count;
      }
    }

    // Sort techniques
    const techniques = Array.from(techMap.values()).sort((a, b) => {
      if (sortBy === 'count') return b.total - a.total;
      if (sortBy === 'name') return a.technique_name.localeCompare(b.technique_name);
      return new Date(b.last_seen).getTime() - new Date(a.last_seen).getTime();
    });

    // Find max count for heat intensity
    const maxCount = techniques.reduce((m, t) => Math.max(m, t.total), 1);

    return { techniques, tacticByTech, maxCount };
  }, [matrix, sortBy]);

  const selectedTech = selectedTechId ? (techIndex.get(selectedTechId) ?? null) : null;
  const topTactics = stats?.top_mitre_tactics ?? [];

  return (
    <div className="space-y-4">
      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Target className="w-5 h-5 text-violet-400" />
            <h1 className="text-2xl font-bold text-surface-100">MITRE ATT&CK Matrix</h1>
            {matrixData && (
              <span className="text-sm text-surface-400 ml-1">
                ({matrixData.techniques.length} técnicas detectadas)
              </span>
            )}
          </div>
          <p className="text-sm text-surface-400">
            Cobertura de las técnicas detectadas por Wazuh en la matriz ATT&CK
          </p>
        </div>

        <div className="flex items-center gap-2">
          <select
            className="input-sm text-sm"
            value={sortBy}
            onChange={e => setSortBy(e.target.value as typeof sortBy)}
            title="Ordenar por"
          >
            <option value="count">Ordenar: Nº alertas</option>
            <option value="name">Ordenar: Nombre</option>
            <option value="recent">Ordenar: Recientes</option>
          </select>
        </div>
      </div>

      {/* ── Backend unavailable notice ──────────────────────────────── */}
      {isBackendUnavailable && (
        <div className="glass-card p-6 border-violet-500/30 bg-violet-500/5">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-violet-400 shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-semibold text-violet-300">
                Matriz MITRE no disponible
              </h3>
              <p className="text-xs text-surface-400 mt-1 leading-relaxed">
                El endpoint <code className="text-violet-300">/wazuh/mitre/matrix</code> aún no
                está expuesto. Se mostrará la matriz completa cuando esté disponible; mientras
                tanto, puedes revisar el resumen de técnicas detectadas a continuación.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Top tactics bar ─────────────────────────────────────────── */}
      {topTactics.length > 0 && (
        <div className="glass-card p-4">
          <div className="flex items-center gap-2 mb-3">
            <ArrowUpDown className="w-4 h-4 text-violet-400" />
            <h3 className="text-sm font-semibold text-surface-100">Top tácticas (24h)</h3>
          </div>
          <div className="space-y-2">
            {topTactics.map(t => (
              <div key={t.tactic_id} className="flex items-center gap-3">
                <span className="text-xs text-surface-300 w-44 truncate font-medium">
                  {t.tactic_name}
                </span>
                <div className="flex-1 h-2 bg-surface-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-violet-500 to-violet-400 rounded-full transition-all"
                    style={{
                      width: `${(t.count / (topTactics[0]?.count || 1)) * 100}%`,
                    }}
                  />
                </div>
                <span className="text-xs font-mono text-violet-300 w-12 text-right">
                  {t.count}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Main grid: matrix + detail ──────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
        {/* Matrix — 3 cols */}
        <div className="xl:col-span-3 glass-card p-4 overflow-hidden">
          <h3 className="text-sm font-semibold text-surface-100 mb-3">Heatmap de técnicas</h3>

          {isLoading ? (
            <div className="h-64 flex items-center justify-center text-sm text-surface-500">
              Cargando matriz…
            </div>
          ) : !matrixData ? (
            <div className="h-64 flex items-center justify-center text-sm text-surface-500">
              {isBackendUnavailable
                ? 'Esperando datos del backend…'
                : 'Sin datos de matriz'}
            </div>
          ) : matrixData.techniques.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-sm text-surface-500">
              Sin técnicas detectadas en las últimas 24h
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-10 bg-surface-900/80 backdrop-blur px-2 py-1.5 text-[10px] text-surface-400 uppercase tracking-wider font-medium border-b border-surface-800/50 min-w-[180px]">
                      Técnica
                    </th>
                    {TACTIC_ORDER.map(t => (
                      <th
                        key={t.id}
                        className="px-1.5 py-1.5 text-[9px] text-surface-500 uppercase tracking-wider font-medium border-b border-surface-800/50 text-center min-w-[60px]"
                        title={t.name}
                      >
                        <span className="hidden md:inline">{t.short}</span>
                        <span className="md:hidden">{t.id.slice(2)}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {matrixData.techniques.map(tech => {
                    const tactics = matrixData.tacticByTech.get(tech.technique_id) ?? new Set();
                    const intensity = tech.total / matrixData.maxCount;
                    const isSelected = selectedTechId === tech.technique_id;

                    return (
                      <tr
                        key={tech.technique_id}
                        className={`hover:bg-surface-800/20 transition-colors cursor-pointer ${
                          isSelected ? 'bg-violet-500/10' : ''
                        }`}
                        onClick={() => setSelectedTechId(tech.technique_id)}
                      >
                        <td className="sticky left-0 z-10 bg-surface-900/60 backdrop-blur px-2 py-1.5 border-b border-surface-800/30">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-mono text-violet-300 shrink-0">
                              {tech.technique_id}
                            </span>
                            <span className="text-xs text-surface-200 truncate" title={tech.technique_name}>
                              {tech.technique_name}
                            </span>
                          </div>
                        </td>
                        {TACTIC_ORDER.map(t => {
                          const active = tactics.has(t.id);
                          const opacity = active ? Math.min(1, 0.25 + intensity * 0.75) : 0;
                          return (
                            <td
                              key={t.id}
                              className="px-1 py-1 border-b border-surface-800/20 text-center"
                              title={active ? `${t.name} — ${tech.total} alertas` : t.name}
                            >
                              {active && (
                                <div
                                  className="w-5 h-5 mx-auto rounded"
                                  style={{
                                    backgroundColor: `rgba(139, 92, 246, ${opacity})`,
                                    boxShadow: opacity > 0.5 ? '0 0 6px rgba(139, 92, 246, 0.4)' : 'none',
                                  }}
                                />
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Heat legend */}
          {matrixData && matrixData.techniques.length > 0 && (
            <div className="mt-3 flex items-center gap-2 text-[10px] text-surface-500">
              <span>Intensidad:</span>
              {[0.25, 0.5, 0.75, 1].map(v => (
                <div
                  key={v}
                  className="w-4 h-3 rounded"
                  style={{ backgroundColor: `rgba(139, 92, 246, ${v})` }}
                />
              ))}
              <span className="ml-2">{matrixData.maxCount} alertas (máx)</span>
            </div>
          )}
        </div>

        {/* Detail panel — 1 col */}
        <div className="glass-card p-4">
          <div className="flex items-center gap-2 mb-3">
            <Crosshair className="w-4 h-4 text-violet-400" />
            <h3 className="text-sm font-semibold text-surface-100">Detalle</h3>
          </div>

          {!selectedTech ? (
            <p className="text-xs text-surface-500">
              Selecciona una técnica de la matriz para ver su detalle
            </p>
          ) : (
            <div className="space-y-3">
              <div>
                <p className="text-[10px] text-surface-500 uppercase tracking-wider">ID</p>
                <p className="text-sm font-mono text-violet-300">{selectedTech.technique_id}</p>
              </div>
              <div>
                <p className="text-[10px] text-surface-500 uppercase tracking-wider">Nombre</p>
                <p className="text-sm text-surface-100 font-medium">{selectedTech.technique_name}</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-[10px] text-surface-500 uppercase tracking-wider">Alertas</p>
                  <p className="text-lg font-bold text-cyan-400">{selectedTech.count}</p>
                </div>
                <div>
                  <p className="text-[10px] text-surface-500 uppercase tracking-wider">Última vez</p>
                  <p className="text-xs text-surface-200">
                    {selectedTech.last_seen ? formatDateTime(selectedTech.last_seen) : '—'}
                  </p>
                </div>
              </div>

              <Link
                to={`/wazuh/alerts?search=${encodeURIComponent(selectedTech.technique_id)}`}
                className="btn-primary text-xs w-full flex items-center justify-center gap-1.5 mt-3"
              >
                Ver alertas relacionadas <ChevronRight className="w-3 h-3" />
              </Link>

              <a
                href={`https://attack.mitre.org/techniques/${selectedTech.technique_id.replace('.', '/')}`}
                target="_blank"
                rel="noreferrer noopener"
                className="btn-secondary text-xs w-full flex items-center justify-center gap-1.5"
              >
                Ver en attack.mitre.org <ChevronRight className="w-3 h-3" />
              </a>
            </div>
          )}

          {/* Top techniques sidebar (compact) */}
          {!selectedTech && summary.length > 0 && (
            <div className="mt-4 pt-4 border-t border-surface-800/40">
              <p className="text-[10px] text-surface-500 uppercase tracking-wider mb-2">
                Top técnicas
              </p>
              <div className="space-y-1">
                {summary.slice(0, 8).map(t => (
                  <button
                    key={t.technique_id}
                    onClick={() => setSelectedTechId(t.technique_id)}
                    className="w-full flex items-center justify-between gap-2 px-2 py-1 -mx-2 rounded hover:bg-surface-800/40 transition-colors text-left"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-mono text-violet-300 truncate">
                        {t.technique_id}
                      </p>
                      <p className="text-[10px] text-surface-400 truncate">
                        {t.technique_name}
                      </p>
                    </div>
                    <span className="text-xs font-semibold text-cyan-400 shrink-0">
                      {t.count}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}