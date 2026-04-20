import { useState } from 'react';
import { useCrowdSecRaw } from '../../../hooks/widgets/technical';
import { WidgetSkeleton, WidgetErrorState, WidgetHeader } from '../common';

interface CrowdSecRawProps {
  config?: { limit?: number };
  onUnblock?: (ip: string) => void;
}

export function CrowdSecRaw({ config, onUnblock }: CrowdSecRawProps) {
  const limit = config?.limit ?? 25;
  const { data, isLoading, error, refetch } = useCrowdSecRaw(limit);
  const [confirmIp, setConfirmIp] = useState<string | null>(null);

  if (isLoading) return <WidgetSkeleton rows={6} />;
  if (error || !data) return <WidgetErrorState onRetry={() => refetch()} />;

  const decisions = data as { id?: string; ip?: string; value?: string; duration?: string; scenario?: string; origin?: string; type?: string }[];

  return (
    <div className="widget-technical">
      <WidgetHeader title="CrowdSec Raw" />

      {confirmIp && (
        <div className="widget-crowdsec-raw__confirm">
          <span>¿Desbloquear <code>{confirmIp}</code>?</span>
          <button className="btn-danger btn-sm" onClick={() => {
            onUnblock?.(confirmIp);
            setConfirmIp(null);
          }}>
            Sí, desbloquear
          </button>
          <button className="btn-secondary btn-sm" onClick={() => setConfirmIp(null)}>
            Cancelar
          </button>
        </div>
      )}

      <div className="widget-technical__scroll-body">
        <table className="data-table data-table--compact">
          <thead>
            <tr>
              <th>IP</th>
              <th>Escenario</th>
              <th>Tipo</th>
              <th>Duración</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {decisions.map((d, i) => {
              const ip = d.ip ?? d.value ?? '?';
              return (
                <tr key={d.id ?? i}>
                  <td><code className="font-mono">{ip}</code></td>
                  <td className="text-truncate text-xs text-muted">{d.scenario ?? '—'}</td>
                  <td><span className="badge badge--danger">{d.type ?? 'ban'}</span></td>
                  <td className="text-muted text-xs">{d.duration ?? '—'}</td>
                  <td>
                    <button
                      className="btn-icon btn-icon--sm"
                      onClick={() => setConfirmIp(ip)}
                      title={`Desbloquear ${ip}`}
                    >
                      🔓
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
