/** KEV findings from the saved Wazuh snapshot, separated from name-only clues. */
import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { CisaKevMatch, DigestResponse } from '../../types';

interface Props {
  matches: CisaKevMatch[];
  possibleMatches: CisaKevMatch[];
  status: NonNullable<DigestResponse['cisa_kev_status']>;
  totalChecked: number;
  lastUpdated?: string | null;
  generatedAt?: string | null;
}

const SEVERITY: Record<string, { label: string; rank: number; color: string }> = {
  critical: { label: 'Crítica', rank: 4, color: '#ef4444' },
  high:     { label: 'Alta', rank: 3, color: '#f97316' },
  medium:   { label: 'Media', rank: 2, color: '#eab308' },
  low:      { label: 'Baja', rank: 1, color: '#22c55e' },
};

function readableDate(value?: string | null, withTime = false): string | null {
  if (!value) return null;
  // CISA dates contain no timezone; parsing them as UTC shifts the day in ART.
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-');
    return `${day}/${month}/${year}`;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return withTime
    ? date.toLocaleString('es-AR', {
        timeZone: 'America/Argentina/Buenos_Aires',
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })
    : date.toLocaleDateString('es-AR', {
        timeZone: 'America/Argentina/Buenos_Aires',
        day: '2-digit', month: '2-digit', year: 'numeric',
      });
}

function wazuhSeverity(match: CisaKevMatch) {
  return (match.evidence ?? []).reduce<(typeof SEVERITY)[string] | null>((highest, evidence) => {
    const value = SEVERITY[(evidence.severity ?? '').toLowerCase()];
    return value && (!highest || value.rank > highest.rank) ? value : highest;
  }, null);
}

function maxCvss(match: CisaKevMatch): number | null {
  const scores = (match.evidence ?? [])
    .map(evidence => evidence.cvss_score)
    .filter((score): score is number => typeof score === 'number' && score > 0);
  return scores.length ? Math.max(...scores) : null;
}

export const CisaKevAlert: React.FC<Props> = ({
  matches, possibleMatches, status, totalChecked, lastUpdated, generatedAt,
}) => {
  const [expanded, setExpanded] = useState(false);
  const [candidatesOpen, setCandidatesOpen] = useState(false);
  const [visibleCandidates, setVisibleCandidates] = useState(10);
  const verified = status === 'verified';
  const confirmed = verified ? matches : [];
  const hasConfirmed = confirmed.length > 0;
  const hasDetails = hasConfirmed || possibleMatches.length > 0;
  const affectedAgents = new Set(confirmed.flatMap(match =>
    match.evidence?.length
      ? match.evidence.map(evidence => evidence.agent_id || evidence.agent_name)
      : match.matched_agents
  )).size;
  const snapshotDate = readableDate(generatedAt, true);
  const catalogDate = readableDate(lastUpdated, true);

  const title = hasConfirmed
    ? `${confirmed.length} CVE${confirmed.length === 1 ? '' : 's'} de CISA KEV con hallazgo de Wazuh en ${affectedAgents} agente${affectedAgents === 1 ? '' : 's'}`
    : status === 'needs_regeneration'
      ? 'Regenerá el Digest para verificar CISA KEV'
      : status === 'simulated'
        ? 'CISA KEV sin verificar — datos de simulación'
        : verified
          ? 'Sin CVEs de CISA KEV confirmadas por Wazuh'
          : 'No se pudo verificar CISA KEV contra Wazuh';
  const accent = hasConfirmed ? '#ef4444' : verified ? '#22c55e' : '#f59e0b';

  return (
    <section
      className="rounded-xl overflow-hidden"
      style={{ background: '#0d111b', border: `1px solid ${accent}66` }}
      aria-label="Estado de CISA KEV"
    >
      <div className="px-5 py-5 sm:px-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-3 min-w-0">
            <span className="text-2xl" aria-hidden="true">{hasConfirmed ? '🚨' : verified ? '✅' : '⚠️'}</span>
            <div className="min-w-0">
              <h3 className="text-base font-bold leading-snug" style={{ color: accent }}>{title}</h3>
              <p className="text-sm text-surface-300 mt-1">
                {hasConfirmed
                  ? 'Prioridad de revisión alta: el CVE coincide por ID con un hallazgo del índice de Wazuh.'
                  : verified
                    ? 'No se encontraron coincidencias por ID de CVE en los hallazgos consultados.'
                    : 'La consulta está incompleta; no se puede concluir que el inventario esté libre de CVEs KEV.'}
              </p>
            </div>
          </div>
          {hasDetails && (
            <button
              type="button"
              aria-expanded={expanded}
              onClick={() => setExpanded(open => !open)}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold shrink-0"
              style={{ color: accent, background: `${accent}18`, border: `1px solid ${accent}55` }}
            >
              {expanded ? 'Ocultar detalles' : 'Ver detalles'}
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-2 mt-4 text-xs">
          <span className="rounded-md px-2.5 py-1 font-semibold" style={{ color: hasConfirmed ? '#fca5a5' : '#94a3b8', background: hasConfirmed ? '#ef44441a' : '#33415544' }}>
            {confirmed.length} CVE${confirmed.length === 1 ? '' : 's'} confirmado${confirmed.length === 1 ? '' : 's'}
          </span>
          <span className="rounded-md px-2.5 py-1 font-semibold text-surface-300 bg-surface-800/60">
            {possibleMatches.length} por nombre · sin verificar
          </span>
        </div>
        <p className="text-xs text-surface-500 mt-3">
          {snapshotDate ? `Estado guardado al generar el Digest: ${snapshotDate} (Argentina)` : 'Estado guardado al generar el Digest'}
          {verified ? ` · ${totalChecked.toLocaleString('es-AR')} CVEs en el catálogo KEV` : ''}
          {catalogDate ? ` · Catálogo consultado: ${catalogDate}` : ''}
        </p>
      </div>

      {expanded && hasDetails && (
        <div className="border-t border-surface-800 px-5 py-5 sm:px-6 space-y-6">
          {hasConfirmed && (
            <section aria-label="Hallazgos confirmados por CVE">
              <h4 className="text-sm font-bold text-surface-100">Hallazgos con CVE confirmado</h4>
              <p className="text-xs text-surface-400 mt-1 mb-3">
                Se encontraron en el índice de Wazuh al generar este Digest. La fecha de detección puede ser anterior;
                verificá en Wazuh si el hallazgo sigue activo antes de intervenir.
              </p>
              <div className="space-y-3">
                {confirmed.map(match => {
                  const severity = wazuhSeverity(match);
                  const cvss = maxCvss(match);
                  const evidence = match.evidence ?? [];
                  return (
                    <article key={match.cve_id} className="rounded-lg p-4" style={{ background: '#ef44440c', border: '1px solid #ef444433' }}>
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div>
                          <p className="text-base font-bold text-red-300">{match.cve_id}</p>
                          <p className="text-sm text-surface-200 mt-0.5">{match.vendor} / {match.product}</p>
                        </div>
                        <div className="flex gap-2 flex-wrap text-xs font-semibold">
                          <span className="rounded-md px-2.5 py-1 text-red-200 bg-red-500/15">KEV · revisión prioritaria</span>
                          <span
                            className="rounded-md px-2.5 py-1"
                            style={{ color: severity?.color ?? '#cbd5e1', background: severity ? `${severity.color}20` : '#33415566' }}
                          >
                            Severidad Wazuh: {severity?.label ?? 'no informada'}{cvss !== null ? ` · CVSS máx. ${cvss.toFixed(1)}` : ''}
                          </span>
                        </div>
                      </div>
                      {match.vulnerability_name && (
                        <p className="text-xs text-surface-400 mt-2">{match.vulnerability_name}</p>
                      )}
                      <div className="flex gap-x-5 gap-y-1 flex-wrap text-xs text-surface-400 mt-3">
                        {match.date_added && <span>En catálogo KEV desde: <strong className="text-surface-200">{readableDate(match.date_added)}</strong></span>}
                        {match.due_date && <span>Plazo CISA para agencias federales: <strong className="text-surface-200">{readableDate(match.due_date)}</strong></span>}
                      </div>
                      <div className="border-t border-red-500/15 mt-3 pt-3">
                        <p className="text-xs font-semibold text-surface-200 mb-2">Evidencia en Wazuh</p>
                        {evidence.length ? evidence.map((item, index) => (
                          <div key={`${item.agent_id}-${item.package_name}-${item.package_version}-${index}`} className="text-xs text-surface-300 py-1.5 border-b border-surface-800/50 last:border-0">
                            <span className="font-semibold text-surface-100">{item.agent_name || item.agent_id}</span>
                            <span> · {item.package_name || 'Paquete no informado'}{item.package_version ? ` ${item.package_version}` : ' (versión no informada)'}</span>
                            <div className="text-surface-500 mt-0.5">
                              Estado Wazuh: {item.status?.toLowerCase() === 'active' ? 'activo' : 'no informado'}
                              {' · '}Detectado: {readableDate(item.detected_at) ?? 'fecha no informada'}
                            </div>
                          </div>
                        )) : (
                          <p className="text-xs text-surface-500">
                            Wazuh informó el CVE en {match.matched_agents.join(', ') || 'un agente'}, sin detalle de paquete guardado.
                          </p>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
              <p className="text-xs text-surface-500 mt-3">
                CISA KEV indica explotación conocida de la vulnerabilidad; este hallazgo no demuestra que el agente haya sido explotado.
              </p>
            </section>
          )}

          {possibleMatches.length > 0 && (
            <section className="rounded-lg border border-surface-700/70 bg-surface-900/40 overflow-hidden" aria-label="Coincidencias por nombre sin verificar">
              <button
                type="button"
                aria-expanded={candidatesOpen}
                onClick={() => setCandidatesOpen(open => !open)}
                className="w-full flex items-start justify-between gap-3 p-4 text-left"
              >
                <span>
                  <span className="block text-sm font-semibold text-surface-100">
                    {possibleMatches.length} coincidencias de inventario por nombre
                  </span>
                  <span className="block text-xs text-surface-400 mt-1">
                    Sin CVE confirmado en Wazuh. No se clasifican como vulnerabilidades ni se suman al riesgo.
                  </span>
                </span>
                {candidatesOpen ? <ChevronUp className="w-4 h-4 text-surface-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-surface-400 shrink-0" />}
              </button>
              {candidatesOpen && (
                <div className="border-t border-surface-800 p-4">
                  <p className="text-xs text-surface-500 mb-3">
                    Coincide el fabricante o producto de un paquete. Falta comprobar el CVE y si la versión instalada está afectada.
                  </p>
                  <div className="space-y-2">
                    {possibleMatches.slice(0, visibleCandidates).map(match => {
                      const names = match.matched_agents ?? [];
                      const shownNames = names.slice(0, 4).join(', ');
                      return (
                        <div key={match.cve_id} className="rounded-md border border-surface-800 bg-surface-900/50 p-3 text-xs">
                          <div className="flex items-start justify-between gap-2 flex-wrap">
                            <span className="font-semibold text-surface-200">{match.cve_id} · {match.vendor} / {match.product}</span>
                            <span className="text-surface-500">Sin verificar</span>
                          </div>
                          {names.length > 0 && (
                            <p className="text-surface-500 mt-1">Nombre coincidente en: {shownNames}{names.length > 4 ? ` y ${names.length - 4} más` : ''}</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {visibleCandidates < possibleMatches.length && (
                    <button
                      type="button"
                      onClick={() => setVisibleCandidates(count => count + 10)}
                      className="mt-3 text-xs font-semibold text-indigo-300 hover:text-indigo-200"
                    >
                      Mostrar 10 más ({possibleMatches.length - visibleCandidates} restantes)
                    </button>
                  )}
                </div>
              )}
            </section>
          )}
        </div>
      )}
    </section>
  );
};
