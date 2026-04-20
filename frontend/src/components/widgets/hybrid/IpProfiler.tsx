import { useState } from 'react';
import { useIpProfiler } from '../../../hooks/widgets/hybrid';
import { WidgetSkeleton, WidgetErrorState, WidgetHeader } from '../common';
import type { GeoIPResult, IpContext } from '../../../types';

interface IpProfilerData {
  ip: string;
  network: unknown;
  geo: GeoIPResult | null;
  crowdsec: IpContext | null;
  partial: boolean;
}

export function IpProfiler({ config }: { config?: { default_ip?: string } }) {
  const [ip, setIp] = useState(config?.default_ip ?? '');
  const [query, setQuery] = useState(config?.default_ip ?? '');
  const { data, isLoading, isFetching } = useIpProfiler(query || null);

  return (
    <div className="widget-ip-profiler">
      <WidgetHeader title="Perfilador de IP" />
      <div className="widget-ip-profiler__search">
        <input
          type="text"
          className="input"
          placeholder="203.0.113.45"
          value={ip}
          onChange={e => setIp(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && setQuery(ip)}
        />
        <button className="btn-primary" onClick={() => setQuery(ip)}>
          Analizar
        </button>
      </div>

      {(isLoading || isFetching) && query && <WidgetSkeleton rows={4} />}

      {data && (() => {
        const profiler = data as IpProfilerData;
        return (
          <div className="widget-ip-profiler__result">
            {profiler.partial && <WidgetErrorState partial />}

            {/* GeoIP */}
            {profiler.geo && (
              <div className="widget-ip-profiler__section">
                <h4>Geolocalización</h4>
                <div className="widget-ip-profiler__row">
                  <span>País:</span>
                  <strong>{profiler.geo.country_name ?? profiler.geo.country_code}</strong>
                </div>
                <div className="widget-ip-profiler__row">
                  <span>ASN:</span>
                  <code>{profiler.geo.as_name ?? '—'}</code>
                </div>
              </div>
            )}

            {/* CrowdSec */}
            {profiler.crowdsec && (
              <div className="widget-ip-profiler__section">
                <h4>CrowdSec CTI</h4>
                <div className="widget-ip-profiler__row">
                  <span>Score comunidad:</span>
                  <strong style={{ color: (profiler.crowdsec.crowdsec.community_score ?? 0) > 50 ? '#ef4444' : '#10b981' }}>
                    {profiler.crowdsec.crowdsec.community_score ?? '?'}
                  </strong>
                </div>
                {(profiler.crowdsec.crowdsec.classifications ?? []).slice(0, 3).map((b, i) => (
                  <span key={i} className="badge badge--warn">{b}</span>
                ))}
              </div>
            )}

            {/* Network / MikroTik */}
            {profiler.crowdsec?.mikrotik && (
              <div className="widget-ip-profiler__section">
                <h4>Red interna</h4>
                <div className="widget-ip-profiler__row">
                  <span>Estado:</span>
                  <span className={`badge badge--${profiler.crowdsec.mikrotik.in_blacklist ? 'danger' : 'ok'}`}>
                    {profiler.crowdsec.mikrotik.in_blacklist ? 'Bloqueada' : 'Permitida'}
                  </span>
                </div>
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}
