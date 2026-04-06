/**
 * LastIncidentCard — Highlighted card showing the last critical alert.
 * Has a red pulsing border and quick-action buttons.
 */
import { Clock, MapPin, Cpu, ShieldOff } from 'lucide-react';
import type { CriticalAlert } from '../../types';
import { formatDateTime, severityClass } from '../utils/time';

interface LastIncidentCardProps {
  alert: CriticalAlert;
  onBlockIP?: (ip: string) => void;
}

export function LastIncidentCard({ alert, onBlockIP }: LastIncidentCardProps) {
  const isCritical = alert.rule_level >= 12;

  return (
    <div
      className={`glass-card incident-card ${isCritical ? 'incident-card-critical' : ''} animate-fade-in-up`}
      style={{ padding: '1.25rem' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.7rem', color: 'var(--color-surface-400)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Último Incidente Crítico
            </span>
            <span className={`badge badge-${severityClass(alert.rule_level)}`}>Nivel {alert.rule_level}</span>
          </div>

          <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--color-surface-100)', marginBottom: '0.75rem', lineHeight: 1.4 }}>
            {alert.rule_description}
          </h3>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
            <InfoChip icon={<Cpu size={12} />} label={alert.agent_name} />
            {alert.src_ip && <InfoChip icon={<MapPin size={12} />} label={alert.src_ip} mono />}
            <InfoChip icon={<Clock size={12} />} label={formatDateTime(alert.timestamp)} />
            {alert.mitre_technique && (
              <InfoChip
                icon={<span style={{ fontSize: '10px', fontWeight: 700 }}>ATT&CK</span>}
                label={`${alert.mitre_id ? `[${alert.mitre_id}] ` : ''}${alert.mitre_technique}`}
                highlight
              />
            )}
          </div>
        </div>

        {alert.src_ip && onBlockIP && (
          <button
            id="last-incident-block-btn"
            className="btn btn-danger"
            onClick={() => onBlockIP(alert.src_ip)}
            style={{ flexShrink: 0 }}
          >
            <ShieldOff size={14} />
            Bloquear IP
          </button>
        )}
      </div>
    </div>
  );
}

function InfoChip({ icon, label, mono = false, highlight = false }: {
  icon: React.ReactNode;
  label: string;
  mono?: boolean;
  highlight?: boolean;
}) {
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '0.35rem',
      fontSize: mono ? '0.75rem' : '0.8rem',
      color: highlight ? 'var(--color-brand-300)' : 'var(--color-surface-400)',
      fontFamily: mono ? 'var(--font-mono)' : 'inherit',
    }}>
      {icon}
      {label}
    </span>
  );
}
