/** CISA KEV findings confirmed by Wazuh, with name-only candidates separated. */
import React, { useState } from 'react';
import type { CisaKevMatch, DigestResponse } from '../../types';

interface Props {
  matches: CisaKevMatch[];
  possibleMatches: CisaKevMatch[];
  status: NonNullable<DigestResponse['cisa_kev_status']>;
  totalChecked: number;
  lastUpdated?: string | null;
}

function readableDate(value?: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export const CisaKevAlert: React.FC<Props> = ({
  matches, possibleMatches, status, totalChecked, lastUpdated,
}) => {
  const [expanded, setExpanded] = useState(false);
  const verified = status === 'verified';
  const confirmed = verified ? matches : [];
  const hasConfirmed = confirmed.length > 0;
  const affectedAgents = new Set(confirmed.flatMap(m => m.evidence?.map(e => e.agent_id || e.agent_name) ?? m.matched_agents)).size;
  const updatedDate = readableDate(lastUpdated);
  const hasDetails = hasConfirmed || possibleMatches.length > 0;

  const title = hasConfirmed
    ? `¡ALERTA CRÍTICA! ${confirmed.length} CVE${confirmed.length === 1 ? '' : 's'} de CISA KEV detectada${confirmed.length === 1 ? '' : 's'} por Wazuh en ${affectedAgents} agente${affectedAgents === 1 ? '' : 's'}`
    : status === 'needs_regeneration'
      ? 'Regenerá el Digest para verificar las coincidencias CISA KEV'
      : status === 'simulated'
        ? 'CISA KEV sin verificar — datos de simulación'
      : !verified
        ? 'No se pudo verificar CISA KEV contra las vulnerabilidades de Wazuh'
        : 'Sin CVEs de CISA KEV detectados por Wazuh';
  const description = hasConfirmed
    ? 'Coincidencias por ID de CVE con hallazgos de Wazuh. Revisá paquete, versión y fecha de detección antes de actuar.'
    : verified
      ? 'No hay coincidencias confirmadas por CVE en los hallazgos actuales de Wazuh.'
      : 'El estado es desconocido; una consulta incompleta no se considera inventario limpio.';
  const mainColor = hasConfirmed ? '#ef4444' : verified ? '#22c55e' : '#f59e0b';
  const softColor = hasConfirmed ? '#fca5a5' : verified ? '#4ade80' : '#fbbf24';
  const darkColor = hasConfirmed ? '#450a0a' : verified ? '#052e16' : '#451a03';

  return (
    <div style={{
      background: `linear-gradient(135deg, ${darkColor} 0%, ${darkColor}22 100%)`,
      border: `2px solid ${mainColor}88`,
      borderRadius: 12,
      overflow: 'hidden',
    }}>
      <div
        style={{ padding: '16px 22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: hasDetails ? 'pointer' : 'default', flexWrap: 'wrap', gap: 12 }}
        onClick={() => hasDetails && setExpanded(e => !e)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 26, animation: hasConfirmed ? 'kev-pulse 1.5s ease-in-out infinite' : undefined }}>
            {hasConfirmed ? '🚨' : verified ? '✅' : '⚠️'}
          </span>
          <div>
            <p style={{ color: mainColor, fontWeight: 800, fontSize: 16 }}>{title}</p>
            <p style={{ color: softColor, fontSize: 12, marginTop: 2 }}>{description}</p>
            {possibleMatches.length > 0 && (
              <p style={{ color: '#fbbf24', fontSize: 12, marginTop: 4 }}>
                {possibleMatches.length} coincidencia{possibleMatches.length === 1 ? '' : 's'} por nombre sin verificar; no suma{possibleMatches.length === 1 ? '' : 'n'} a la alerta.
              </p>
            )}
            {verified && (
              <p style={{ color: softColor, fontSize: 11, marginTop: 4 }}>
                {totalChecked.toLocaleString()} entradas del catálogo CISA KEV consultadas
                {updatedDate ? ` · Catálogo actualizado: ${updatedDate}` : ''}
              </p>
            )}
          </div>
        </div>
        {hasDetails && (
          <button
            type="button"
            aria-expanded={expanded}
            onClick={event => { event.stopPropagation(); setExpanded(e => !e); }}
            style={{ background: `${mainColor}22`, color: mainColor, border: `1px solid ${mainColor}44`, borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
          >
            {expanded ? 'Ocultar ▲' : 'Ver detalles ▼'}
          </button>
        )}
      </div>

      {expanded && hasDetails && (
        <div style={{ borderTop: `1px solid ${mainColor}33`, padding: '16px 22px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {hasConfirmed && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {confirmed.map(m => (
                <div key={m.cve_id} style={{ background: '#ef444410', border: '1px solid #ef444433', borderRadius: 8, padding: '12px 16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                    <div>
                      <span style={{ color: '#ef4444', fontWeight: 800, fontSize: 14 }}>{m.cve_id}</span>
                      <span style={{ color: '#94a3b8', fontSize: 13, marginLeft: 10 }}>{m.vendor} / {m.product}</span>
                    </div>
                    {m.due_date && <span style={{ color: '#fca5a5', fontSize: 11 }}>Fecha CISA: {m.due_date}</span>}
                  </div>
                  <p style={{ color: '#fca5a5', fontSize: 13, marginTop: 6 }}>{m.vulnerability_name}</p>
                  {m.evidence?.map((e, i) => (
                    <div key={`${e.agent_id}-${e.package_name}-${e.package_version}-${i}`} style={{ color: '#cbd5e1', fontSize: 12, marginTop: 7 }}>
                      <strong>{e.agent_name}</strong> · {e.package_name || 'Paquete no informado'}
                      {e.package_version ? ` ${e.package_version}` : ' (versión no informada)'}
                      {' · '}Detección: {readableDate(e.detected_at) ?? 'fecha no informada'}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}

          {possibleMatches.length > 0 && (
            <div>
              <p style={{ color: '#fbbf24', fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
                Coincidencias por nombre sin verificar
              </p>
              <p style={{ color: '#94a3b8', fontSize: 12, marginBottom: 10 }}>
                El fabricante o producto coincide con un paquete; falta un hallazgo de Wazuh con el mismo CVE.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {possibleMatches.map(m => (
                  <div key={m.cve_id} style={{ background: '#f59e0b0c', border: '1px solid #f59e0b33', borderRadius: 6, padding: '8px 12px', color: '#cbd5e1', fontSize: 12 }}>
                    <strong style={{ color: '#fbbf24' }}>{m.cve_id}</strong>
                    {' · '}{m.vendor} / {m.product}
                    {m.matched_agents.length > 0 ? ` · Agentes: ${m.matched_agents.join(', ')}` : ''}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <style>{`@keyframes kev-pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.1); } }`}</style>
    </div>
  );
};
