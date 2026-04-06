import type { WazuhAlert } from '../../types';

function getSeverityBadge(level: number) {
  if (level >= 12) return { class: 'badge-critical', label: 'Crítico' };
  if (level >= 8) return { class: 'badge-high', label: 'Alto' };
  if (level >= 4) return { class: 'badge-medium', label: 'Medio' };
  return { class: 'badge-low', label: 'Bajo' };
}

function timeAgo(timestamp: string): string {
  try {
    const diff = Date.now() - new Date(timestamp).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Ahora';
    if (mins < 60) return `Hace ${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `Hace ${hours}h`;
    return `Hace ${Math.floor(hours / 24)}d`;
  } catch {
    return timestamp;
  }
}

export default function AlertsFeed({ alerts }: { alerts: WazuhAlert[] }) {
  if (alerts.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-surface-500 text-sm">
        No hay alertas recientes
      </div>
    );
  }

  return (
    <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
      {alerts.slice(0, 20).map((alert, idx) => {
        const severity = getSeverityBadge(alert.rule_level);
        return (
          <div
            key={alert.id || idx}
            className="p-3 rounded-lg border border-surface-800/30 bg-surface-900/30 hover:bg-surface-900/50 transition-colors"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`badge ${severity.class}`}>
                    {severity.label} ({alert.rule_level})
                  </span>
                  <span className="text-[0.65rem] text-surface-500 font-mono">
                    Rule {alert.rule_id}
                  </span>
                </div>
                <p className="text-xs text-surface-200 truncate">
                  {alert.rule_description}
                </p>
                <div className="flex items-center gap-3 mt-1.5 text-[0.65rem] text-surface-500">
                  <span>📡 {alert.agent_name || `Agent ${alert.agent_id}`}</span>
                  {alert.src_ip && <span>🔗 {alert.src_ip}</span>}
                </div>
              </div>
              <span className="text-[0.6rem] text-surface-600 whitespace-nowrap">
                {timeAgo(alert.timestamp)}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
