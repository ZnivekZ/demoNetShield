/**
 * CountryHeatmap — Grid of top attacking countries with visual intensity.
 */
import type { CrowdSecCountry } from '../../types';

interface Props {
  countries: CrowdSecCountry[];
}

const FLAG_EMOJI: Record<string, string> = {
  CN: '🇨🇳', RU: '🇷🇺', US: '🇺🇸', BR: '🇧🇷', NL: '🇳🇱',
  DE: '🇩🇪', UA: '🇺🇦', IN: '🇮🇳', KR: '🇰🇷', FR: '🇫🇷',
  GB: '🇬🇧', PL: '🇵🇱', CZ: '🇨🇿', RO: '🇷🇴', TR: '🇹🇷',
};

export function CountryHeatmap({ countries }: Props) {
  const max = Math.max(...countries.map(c => c.count), 1);

  return (
    <div className="glass-card" style={{ padding: '1rem 1.25rem' }}>
      <h3 style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--color-surface-100)', marginBottom: '0.75rem' }}>
        Top países de origen
      </h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '0.5rem' }}>
        {countries.map((c, i) => {
          const intensity = c.count / max;
          return (
            <div
              key={c.code}
              style={{
                background: `rgba(99,102,241,${0.08 + intensity * 0.3})`,
                border: `1px solid rgba(99,102,241,${0.15 + intensity * 0.3})`,
                borderRadius: 8,
                padding: '0.6rem 0.75rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              <span style={{ fontSize: '1.25rem' }}>{FLAG_EMOJI[c.code] ?? '🌐'}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--color-surface-100)', margin: 0,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {c.country}
                </p>
                <p style={{ fontSize: '0.65rem', color: 'var(--color-surface-400)', margin: 0 }}>
                  {c.count} alertas · {c.pct}%
                </p>
              </div>
              {i === 0 && (
                <span className="badge badge-danger" style={{ fontSize: '0.55rem', flexShrink: 0 }}>
                  #1
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
