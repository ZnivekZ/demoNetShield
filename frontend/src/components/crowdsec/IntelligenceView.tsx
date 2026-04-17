/**
 * IntelligenceView — Threat intelligence sub-view.
 * Country heatmap + scenarios table + top attackers.
 */
import { useState } from 'react';
import { Globe } from 'lucide-react';
import { useCrowdSecMetrics, useCrowdSecScenarios } from '../../hooks/useCrowdSecMetrics';
import { useCrowdSecDecisions } from '../../hooks/useCrowdSecDecisions';
import { CountryHeatmap } from './CountryHeatmap';
import { ScenariosTable } from './ScenariosTable';
import { TopAttackers } from './TopAttackers';
import { IpContextPanel } from './IpContextPanel';
import { ConfirmModal } from '../common/ConfirmModal';
import { TopCountriesWidget } from '../geoip/TopCountriesWidget';
import { GeoBlockSuggestions } from '../geoip/GeoBlockSuggestions';

export function CrowdSecIntelligence() {
  const metricsQuery = useCrowdSecMetrics();
  const scenariosQuery = useCrowdSecScenarios();
  const { decisions, addDecision } = useCrowdSecDecisions();
  const [selectedIp, setSelectedIp] = useState<string | null>(null);
  const [blockTarget, setBlockTarget] = useState<string | null>(null);

  const metrics = metricsQuery.data;
  const scenarios = scenariosQuery.data ?? [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <div
          style={{
            width: 36, height: 36,
            borderRadius: 10,
            background: 'linear-gradient(135deg, #06b6d4, #0891b2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(6,182,212,0.35)',
            flexShrink: 0,
          }}
        >
          <Globe size={18} style={{ color: '#fff' }} />
        </div>
        <div>
          <h1 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--color-surface-100)', margin: 0 }}>
            CrowdSec — Inteligencia
          </h1>
          <p style={{ fontSize: '0.72rem', color: 'var(--color-surface-400)', margin: 0 }}>
            Geografía de amenazas · Técnicas detectadas · Atacantes activos · Geo-bloqueo automático
          </p>
        </div>
      </div>

      {/* Country heatmap */}
      {metricsQuery.isLoading ? (
        <div className="glass-card" style={{ height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span className="loading-spinner" />
        </div>
      ) : (
        <CountryHeatmap countries={metrics?.top_countries ?? []} />
      )}

      {/* Scenarios + Top Attackers grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '1rem', alignItems: 'start' }}>
        {scenariosQuery.isLoading ? (
          <div className="glass-card" style={{ height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span className="loading-spinner" />
          </div>
        ) : (
          <ScenariosTable scenarios={scenarios} />
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <TopAttackers
            decisions={decisions}
            onBlock={ip => setBlockTarget(ip)}
            onRowClick={ip => setSelectedIp(ip)}
          />
          {/* TopCountries cross-source — wider view than dashboard, shows 7 countries */}
          <TopCountriesWidget onBlockCountry={cc => setBlockTarget(cc)} />
        </div>
      </div>

      {/* Geo-block suggestions  */}
      <GeoBlockSuggestions />

      {/* IP Context Panel */}
      <IpContextPanel
        ip={selectedIp}
        onClose={() => setSelectedIp(null)}
        onFullBlock={ip => setBlockTarget(ip)}
      />

      {/* Block confirm */}
      {blockTarget && (
        <ConfirmModal
          title="Bloqueo completo"
          description="Esta IP será bloqueada en CrowdSec y en MikroTik Blacklist_Automatica."
          data={{ IP: blockTarget, Duración: '24h', Capas: 'CrowdSec + MikroTik' }}
          confirmLabel="Bloquear en todas las capas"
          variant="danger"
          onConfirm={() => {
            addDecision.mutate({ ip: blockTarget, duration: '24h', reason: 'Manual block from Intelligence view', type: 'ban' });
            setBlockTarget(null);
            setSelectedIp(null);
          }}
          onCancel={() => setBlockTarget(null)}
          isLoading={addDecision.isPending}
        />
      )}
    </div>
  );
}
