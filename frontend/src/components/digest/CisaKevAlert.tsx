/** Compact KEV snapshot in the Digest; current findings live in the CVE view. */
import { Link } from 'react-router-dom';
import { ArrowUpRight, ShieldAlert } from 'lucide-react';
import type { CisaKevMatch, DigestResponse } from '../../types';

interface Props {
  matches: CisaKevMatch[];
  status: NonNullable<DigestResponse['cisa_kev_status']>;
  totalChecked: number;
  generatedAt?: string | null;
}

function snapshotTime(value?: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export function CisaKevAlert({ matches, status, totalChecked, generatedAt }: Props) {
  const verified = status === 'verified';
  const count = verified ? matches.length : 0;
  const agents = new Set(matches.flatMap(match =>
    match.evidence?.length
      ? match.evidence.map(evidence => evidence.agent_id || evidence.agent_name)
      : match.matched_agents ?? []
  )).size;
  const time = snapshotTime(generatedAt);

  return (
    <section className={`rounded-xl border p-5 sm:p-6 ${count
      ? 'border-red-500/40 bg-red-500/5'
      : verified ? 'border-green-500/30 bg-green-500/5' : 'border-amber-500/30 bg-amber-500/5'}`}
      aria-label="Estado de CISA KEV al generar el Digest">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <ShieldAlert className={`w-5 h-5 shrink-0 mt-0.5 ${count ? 'text-red-400' : verified ? 'text-green-400' : 'text-amber-400'}`} />
          <div>
            <h3 className="text-base font-bold text-surface-100">CISA KEV en el Digest</h3>
            <p className="text-sm text-surface-300 mt-1">
              {verified
                ? count
                  ? `Al generarlo, el inventario Wazuh incluía ${count} CVE${count === 1 ? '' : 's'} de CISA KEV en ${agents} agente${agents === 1 ? '' : 's'}.`
                  : 'Al generarlo, el inventario Wazuh no incluía CVE de CISA KEV.'
                : status === 'needs_regeneration'
                  ? 'Este Digest usa un método anterior. Regeneralo para obtener una comparación válida.'
                  : 'No se pudo comprobar CISA KEV al generar este Digest.'}
            </p>
            <p className="text-xs text-surface-500 mt-2">
              {time ? `Foto del ${time} (Argentina). ` : 'Foto del momento de generación. '}
              {verified ? `${totalChecked.toLocaleString('es-AR')} CVE del catálogo consultado${totalChecked === 1 ? '' : 's'}. ` : ''}
              Revisá el inventario actual para ver qué sigue informado.
            </p>
          </div>
        </div>
        <Link to="/wazuh/vulnerabilities?kev=1"
          className="btn-secondary inline-flex items-center gap-1.5 text-sm shrink-0">
          Ver CVE en inventario <ArrowUpRight className="w-4 h-4" />
        </Link>
      </div>
    </section>
  );
}
