import { RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { useCountryRadar } from '../../../hooks/widgets/hybrid';
import { WidgetSkeleton, WidgetErrorState, WidgetHeader } from '../common';

export function CountryRadar({ config }: { config?: { limit?: number } }) {
  const limit = config?.limit ?? 6;
  const { data, isLoading, error, refetch } = useCountryRadar(limit);

  if (isLoading) return <WidgetSkeleton rows={3} />;
  if (error || !data) return <WidgetErrorState onRetry={() => refetch()} />;

  const countries = (data.countries ?? []).slice(0, limit);

  const radarData = countries.map(c => ({
    country: c.country_code,
    CrowdSec: c.sources?.crowdsec ?? 0,
    Wazuh: c.sources?.wazuh ?? 0,
    MikroTik: c.sources?.mikrotik ?? 0,
  }));

  return (
    <div className="widget-country-radar">
      <WidgetHeader title="Radar de Países Atacantes" />
      <ResponsiveContainer width="100%" height={220}>
        <RadarChart data={radarData}>
          <PolarGrid stroke="var(--color-border, #334155)" />
          <PolarAngleAxis
            dataKey="country"
            tick={{ fill: 'var(--color-text-muted, #64748b)', fontSize: 11 }}
          />
          <Radar name="CrowdSec" dataKey="CrowdSec" stroke="#10b981" fill="#10b981" fillOpacity={0.2} />
          <Radar name="Wazuh" dataKey="Wazuh" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.15} />
          <Radar name="Suricata" dataKey="Suricata" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.15} />
          <Tooltip
            contentStyle={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: '8px',
              fontSize: '12px',
            }}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
