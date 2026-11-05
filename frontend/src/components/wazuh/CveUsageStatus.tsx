import type { CveUsageStatus as UsageStatus } from '../../types';

const LABELS: Record<UsageStatus, string> = {
  kernel_running: 'Kernel coincide en escaneo',
  kernel_other_version: 'Kernel distinto en escaneo',
  process_match: 'Proceso coincidente',
  unknown: 'Uso no comprobado',
};

const COLORS: Record<UsageStatus, string> = {
  kernel_running: 'border-red-500/40 bg-red-500/10 text-red-200',
  kernel_other_version: 'border-amber-500/40 bg-amber-500/10 text-amber-200',
  process_match: 'border-cyan-500/40 bg-cyan-500/10 text-cyan-200',
  unknown: 'border-surface-700 bg-surface-800/40 text-surface-300',
};

export function CveUsageContext({ status, evidence, checkedAt }: {
  status?: UsageStatus;
  evidence?: string | null;
  checkedAt?: string | null;
}) {
  if (!status || !(status in LABELS)) {
    return <span className="rounded border border-surface-700 bg-surface-800/40 px-1.5 py-0.5 text-xs text-surface-300">Uso sin evaluar</span>;
  }
  const state = status;
  const date = checkedAt ? new Date(checkedAt) : null;
  const when = date && !Number.isNaN(date.getTime())
    ? date.toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })
    : null;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
      <span className={`rounded border px-1.5 py-0.5 ${COLORS[state]}`}>{LABELS[state]}</span>
      {state !== 'unknown' && evidence && <span className="text-surface-400">{evidence}</span>}
      {state !== 'unknown' && <span className="text-surface-500">{when ? `Escaneo: ${when}` : 'Fecha del escaneo no informada'}</span>}
    </span>
  );
}
