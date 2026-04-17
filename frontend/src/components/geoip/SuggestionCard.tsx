/**
 * SuggestionCard — Card individual de sugerencia de geo-bloqueo.
 *
 * Muestra evidencia (IPs CrowdSec, alertas Wazuh, agentes afectados),
 * selector de duración, botón aplicar (con confirm) y botón ignorar.
 */

import { useState } from 'react';
import { Shield, X, ChevronDown, ChevronUp, AlertTriangle, Globe } from 'lucide-react';
import { CountryFlag } from './CountryFlag';
import type { GeoBlockSuggestion } from '../../types';

interface SuggestionCardProps {
  suggestion: GeoBlockSuggestion;
  onApply: (id: string, duration: string) => void;
  onDismiss: (id: string) => void;
  isApplying: boolean;
}

const DURATION_OPTIONS = [
  { value: '1h',  label: '1 hora' },
  { value: '6h',  label: '6 horas' },
  { value: '12h', label: '12 horas' },
  { value: '24h', label: '24 horas' },
  { value: '48h', label: '48 horas' },
  { value: '7d',  label: '7 días' },
  { value: '30d', label: '30 días' },
];

function RiskBadge({ level }: { level: 'high' | 'medium' }) {
  if (level === 'high') {
    return (
      <span className="badge badge-critical text-[0.65rem]">
        🔴 Alto riesgo
      </span>
    );
  }
  return (
    <span className="badge badge-medium text-[0.65rem]">
      🟡 Riesgo medio
    </span>
  );
}

export function SuggestionCard({ suggestion, onApply, onDismiss, isApplying }: SuggestionCardProps) {
  const [duration, setDuration] = useState(suggestion.suggested_duration);
  const [showIPs, setShowIPs] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const borderColor = suggestion.risk_level === 'high'
    ? 'border-l-red-500'
    : 'border-l-amber-500';

  const handleApply = () => {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    onApply(suggestion.id, duration);
    setConfirming(false);
  };

  return (
    <div className={`glass-card border-l-4 ${borderColor} overflow-hidden`}>
      {/* Header */}
      <div className="flex items-start justify-between px-4 py-3 gap-3">
        <div className="flex items-start gap-3 min-w-0">
          {/* Icon */}
          <div className="shrink-0 mt-0.5">
            {suggestion.type === 'country' ? (
              <CountryFlag code={suggestion.target} size="md" tooltip={false} />
            ) : (
              <Globe size={20} className="text-surface-400" />
            )}
          </div>
          {/* Title + risk */}
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-surface-100 text-sm">
                {suggestion.target_name}
              </span>
              <RiskBadge level={suggestion.risk_level} />
              <span className="text-[0.65rem] text-surface-500 uppercase tracking-wide font-medium">
                {suggestion.type === 'country' ? 'País' : 'ASN'}
              </span>
            </div>
            <p className="text-xs text-surface-400 mt-1 leading-relaxed">
              {suggestion.reason}
            </p>
          </div>
        </div>

        {/* Dismiss */}
        <button
          onClick={() => onDismiss(suggestion.id)}
          className="shrink-0 p-1 rounded text-surface-600 hover:text-surface-300 hover:bg-surface-700/50 transition-colors"
          title="Ignorar sugerencia"
        >
          <X size={14} />
        </button>
      </div>

      {/* Evidence */}
      <div className="px-4 pb-3">
        <div className="flex gap-4 flex-wrap text-xs text-surface-400">
          {suggestion.evidence.crowdsec_ips.length > 0 && (
            <div className="flex items-center gap-1">
              <Shield size={11} className="text-brand-400" />
              <span>
                <span className="font-semibold text-surface-300">{suggestion.evidence.crowdsec_ips.length}</span> IPs CrowdSec
              </span>
            </div>
          )}
          {suggestion.evidence.wazuh_alerts > 0 && (
            <div className="flex items-center gap-1">
              <AlertTriangle size={11} className="text-amber-400" />
              <span>
                <span className="font-semibold text-surface-300">{suggestion.evidence.wazuh_alerts}</span> alertas Wazuh
              </span>
            </div>
          )}
          {suggestion.evidence.affected_agents.length > 0 && (
            <div className="flex items-center gap-1">
              <span className="text-surface-500">Agentes:</span>
              <span className="text-surface-300 font-medium">
                {suggestion.evidence.affected_agents.slice(0, 2).join(', ')}
                {suggestion.evidence.affected_agents.length > 2 && ` +${suggestion.evidence.affected_agents.length - 2}`}
              </span>
            </div>
          )}
        </div>

        {/* Collapsible IP list */}
        {suggestion.evidence.crowdsec_ips.length > 0 && (
          <div className="mt-2">
            <button
              onClick={() => setShowIPs(v => !v)}
              className="flex items-center gap-1 text-[0.7rem] text-surface-500 hover:text-surface-300 transition-colors"
            >
              {showIPs ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              {showIPs ? 'Ocultar' : 'Ver'} IPs ({suggestion.evidence.crowdsec_ips.length})
            </button>
            {showIPs && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {suggestion.evidence.crowdsec_ips.map(ip => (
                  <span key={ip} className="text-[0.65rem] font-mono px-1.5 py-0.5 rounded bg-surface-800 text-surface-300 border border-surface-700">
                    {ip}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-surface-800/30 border-t border-surface-700/30">
        {/* Duration selector */}
        <div className="flex items-center gap-2">
          <label className="text-xs text-surface-500 shrink-0">Duración:</label>
          <select
            className="text-xs bg-surface-800 border border-surface-700 rounded-lg px-2 py-1 text-surface-300 cursor-pointer focus:outline-none focus:border-brand-500"
            value={duration}
            onChange={e => setDuration(e.target.value)}
          >
            {DURATION_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <span className="text-[0.65rem] text-surface-600">
            ~{suggestion.estimated_block_count} IPs
          </span>
        </div>

        {/* Apply button */}
        <button
          onClick={handleApply}
          disabled={isApplying}
          className={`btn text-xs px-3 py-1.5 ${
            confirming
              ? 'btn-danger'
              : 'btn-primary'
          }`}
        >
          <Shield size={12} />
          {isApplying
            ? 'Aplicando...'
            : confirming
              ? '¿Confirmar bloqueo?'
              : 'Aplicar bloqueo'
          }
        </button>
      </div>
    </div>
  );
}
