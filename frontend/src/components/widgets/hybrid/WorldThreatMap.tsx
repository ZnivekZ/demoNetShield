import { useState, useEffect, useRef } from 'react';
import { feature } from 'topojson-client';
import { geoNaturalEarth1, geoPath } from 'd3-geo';
import { useWorldThreatMap } from '../../../hooks/widgets/hybrid';
import { WidgetSkeleton, WidgetErrorState, WidgetHeader } from '../common';
import type { WorldThreatCountry } from '../../../types';
import { NUMERIC_TO_ALPHA2 } from '../../../lib/countryCodeMap';
import type { Topology, GeometryCollection } from 'topojson-specification';

const W = 800, H = 420;
const projection = geoNaturalEarth1().scale(153).translate([W / 2, H / 2]);
const pathGen = geoPath(projection);

function scoreColor(score: number): string {
  if (score === 0)  return 'var(--color-surface-elevated,#1e293b)';
  if (score >= 80)  return '#ef4444';
  if (score >= 60)  return '#f97316';
  if (score >= 40)  return '#f59e0b';
  if (score >= 20)  return '#eab308';
  return '#84cc16';
}

export function WorldThreatMap({ config: _config }: { config?: Record<string, unknown> }) {
  const { data, isLoading, error, refetch } = useWorldThreatMap();
  const [hovered, setHovered] = useState<WorldThreatCountry | null>(null);
  const [paths, setPaths] = useState<{ id: number; d: string }[]>([]);
  const svgRef = useRef<SVGSVGElement>(null);

  // Carga el topojson una sola vez
  useEffect(() => {
    fetch('/world-110m.json')
      .then(r => r.json())
      .then((topo: Topology) => {
        const countries = feature(
          topo,
          topo.objects['countries'] as GeometryCollection
        );
        const built = (countries.features as GeoJSON.Feature[])
          .map(f => ({
            id: Number((f as { id?: unknown }).id ?? 0),
            d: pathGen(f) ?? '',
          }))
          .filter(p => p.d);
        setPaths(built);
      })
      .catch(console.error);
  }, []);

  if (isLoading) return <WidgetSkeleton rows={4} />;
  if (error || !data) return <WidgetErrorState onRetry={() => refetch()} />;

  // Índice de score por alpha-2
  const scoreMap = Object.fromEntries(
    data.countries.map((c: WorldThreatCountry) => [c.country_code, c])
  );

  return (
    <div className="widget-world-threat-map">
      <WidgetHeader title="Mapa Mundial de Amenazas" generatedAt={data.generated_at} />

      <div className="widget-world-threat-map__map-wrap">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="widget-world-threat-map__svg"
          aria-label="Mapa de amenazas por país"
        >
          {/* Fondo oceánico */}
          <rect width={W} height={H} fill="var(--color-surface,#0f172a)" rx="8" />

          {/* Países */}
          {paths.map(({ id, d }) => {
            const alpha2 = NUMERIC_TO_ALPHA2[id];
            const country = alpha2 ? scoreMap[alpha2] : undefined;
            const score   = country?.score ?? 0;
            const fill    = scoreColor(score);
            return (
              <path
                key={id}
                d={d}
                fill={fill}
                stroke="var(--color-border,#1e293b)"
                strokeWidth={0.4}
                className="world-map-country"
                onMouseEnter={() => country && setHovered(country)}
                onMouseLeave={() => setHovered(null)}
                style={{ transition: 'fill 0.3s', cursor: country ? 'pointer' : 'default' }}
              />
            );
          })}
        </svg>

        {/* Tooltip flotante */}
        {hovered && (
          <div className="widget-world-threat-map__floating-tip">
            <strong>{hovered.country_name}</strong>
            <div className="tip-row"><span>Score</span><strong style={{ color: scoreColor(hovered.score) }}>{hovered.score}/100</strong></div>
            <div className="tip-row"><span>CrowdSec</span><span>{hovered.crowdsec_count}</span></div>
            <div className="tip-row"><span>Wazuh</span><span>{hovered.wazuh_count} (L{hovered.wazuh_max_level})</span></div>
            <div className="tip-row"><span>Suricata</span><span>{hovered.suricata_count}</span></div>
            {hovered.top_asn && <div className="tip-asn">{hovered.top_asn}</div>}
          </div>
        )}
      </div>

      {/* Leyenda */}
      <div className="widget-world-threat-map__legend">
        {[
          { label: 'Sin actividad', color: 'var(--color-surface-elevated,#1e293b)' },
          { label: 'Baja',   color: '#84cc16' },
          { label: 'Media',  color: '#f59e0b' },
          { label: 'Alta',   color: '#f97316' },
          { label: 'Crítica',color: '#ef4444' },
        ].map(({ label, color }) => (
          <div key={label} className="legend-item">
            <div className="legend-dot" style={{ background: color }} />
            <span>{label}</span>
          </div>
        ))}
      </div>

      {/* Top países */}
      <div className="widget-world-threat-map__top">
        {data.countries.slice(0, 5).map((c: WorldThreatCountry) => (
          <div
            key={c.country_code}
            className="top-country-row"
            onMouseEnter={() => setHovered(c)}
            onMouseLeave={() => setHovered(null)}
          >
            <span className="top-cc">{c.country_code}</span>
            <div className="top-bar-track">
              <div className="top-bar-fill" style={{ width: `${c.score}%`, background: scoreColor(c.score) }} />
            </div>
            <span className="top-score">{c.score}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
