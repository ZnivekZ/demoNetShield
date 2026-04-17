/**
 * GeoBlockSuggestions — Panel con sugerencias automáticas de geo-bloqueo.
 * Se ubica en IntelligenceView debajo del CountryHeatmap.
 */

import { Lightbulb, RefreshCw } from 'lucide-react';
import { useGeoBlockSuggestions } from '../../hooks/useGeoBlockSuggestions';
import { SuggestionCard } from './SuggestionCard';

export function GeoBlockSuggestions() {
  const { suggestions, isLoading, apply, isApplying, dismiss, refresh } = useGeoBlockSuggestions();

  return (
    <div className="space-y-3">
      {/* Section header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Lightbulb size={16} className="text-amber-400" />
          <h3 className="text-sm font-semibold text-surface-200">
            Sugerencias de Geo-Bloqueo
          </h3>
          {suggestions.length > 0 && (
            <span className="badge badge-high text-[0.6rem]">
              {suggestions.length}
            </span>
          )}
        </div>
        <button
          onClick={refresh}
          disabled={isLoading}
          className="p-1.5 rounded-lg text-surface-500 hover:text-surface-200 hover:bg-surface-700/50 transition-colors"
          title="Actualizar sugerencias"
        >
          <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="glass-card flex items-center justify-center py-8">
          <div className="loading-spinner" />
        </div>
      ) : suggestions.length === 0 ? (
        <div className="glass-card flex flex-col items-center justify-center py-8 gap-2">
          <Lightbulb size={28} className="text-surface-600" />
          <p className="text-sm text-surface-500">Sin sugerencias activas</p>
          <p className="text-xs text-surface-600 text-center max-w-xs">
            Las sugerencias se generan automáticamente cuando se detectan patrones
            de ataque concentrados por región o ASN.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {suggestions.map(s => (
            <SuggestionCard
              key={s.id}
              suggestion={s}
              onApply={(id, duration) => apply({ id, duration })}
              onDismiss={dismiss}
              isApplying={isApplying}
            />
          ))}
        </div>
      )}

      {/* Disclaimer */}
      <p className="text-[0.65rem] text-surface-600 leading-relaxed">
        * En modo mock, los bloqueos son simulados. En producción se requiere configurar
        la resolución de rangos CIDR por país/ASN.
      </p>
    </div>
  );
}
