import { useState } from 'react';
import { useIncidentLifecycle } from '../../../hooks/widgets/hybrid';
import { WidgetSkeleton, WidgetErrorState, WidgetHeader } from '../common';
import type { IncidentStep } from '../../../types';

const STEP_ICONS: Record<string, string> = {
  detection: '🔍',
  alert: '⚠️',
  block: '🛡',
  ticket: '📄',
  resolution: '✅',
};

interface IncidentLifecycleProps {
  config?: { ip?: string };
}

export function IncidentLifecycle({ config }: IncidentLifecycleProps) {
  const [ip, setIp] = useState(config?.ip ?? '203.0.113.45');
  const [query, setQuery] = useState(config?.ip ?? '203.0.113.45');
  const { data, isLoading, error, refetch } = useIncidentLifecycle(query);

  return (
    <div className="widget-incident-lifecycle">
      <WidgetHeader title="Ciclo de Vida del Incidente" />
      <div className="widget-incident-lifecycle__search">
        <input
          type="text"
          className="input input-sm"
          value={ip}
          onChange={e => setIp(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && setQuery(ip)}
          placeholder="IP del incidente"
        />
        <button className="btn-secondary btn-sm" onClick={() => setQuery(ip)}>
          Buscar
        </button>
      </div>

      {isLoading && <WidgetSkeleton rows={3} />}
      {error && <WidgetErrorState onRetry={refetch} />}

      {data && (
        <>
          <div className="widget-incident-lifecycle__ip">
            <code>{data.ip}</code>
            {data.complete && <span className="badge badge--ok">Completo</span>}
          </div>

          {/* Timeline horizontal */}
          <div className="widget-incident-lifecycle__timeline">
            {data.steps.map((step: IncidentStep, i: number) => (
              <div
                key={step.step}
                className={`widget-incident-lifecycle__step widget-incident-lifecycle__step--${step.status}`}
              >
                <div className="widget-incident-lifecycle__step-icon">
                  {STEP_ICONS[step.step] ?? '●'}
                </div>
                {i < data.steps.length - 1 && (
                  <div className={`widget-incident-lifecycle__connector${step.status === 'done' ? ' widget-incident-lifecycle__connector--done' : ''}`} />
                )}
                <div className="widget-incident-lifecycle__step-label">
                  {step.label}
                </div>
                {step.timestamp && (
                  <div className="widget-incident-lifecycle__step-time text-muted text-xs">
                    {new Date(step.timestamp).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                )}
                {step.detail && (
                  <div className="widget-incident-lifecycle__step-detail text-xs text-muted">
                    {step.detail}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
