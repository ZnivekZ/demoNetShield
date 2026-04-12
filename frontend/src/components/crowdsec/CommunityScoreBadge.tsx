/**
 * CommunityScoreBadge — Visual reputation score from CrowdSec community.
 * 0-30: green (low risk), 31-70: amber (medium), 71-100: red (high risk).
 */
interface Props {
  score: number;
  reportedBy?: number;
  compact?: boolean;
}

export function CommunityScoreBadge({ score, reportedBy, compact }: Props) {
  const color =
    score >= 71 ? 'var(--color-danger)' :
    score >= 31 ? 'var(--color-warning)' :
    'var(--color-success)';

  const label =
    score >= 71 ? 'Alto riesgo' :
    score >= 31 ? 'Medio' :
    'Bajo';

  if (compact) {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.25rem',
          fontSize: '0.72rem',
          fontWeight: 700,
          color,
          fontFamily: 'var(--font-mono)',
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: color,
            flexShrink: 0,
          }}
        />
        {score}
      </span>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', minWidth: 80 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '0.65rem', color: 'var(--color-surface-400)' }}>{label}</span>
        <span style={{ fontSize: '0.72rem', fontWeight: 700, color, fontFamily: 'var(--font-mono)' }}>
          {score}
        </span>
      </div>
      <div
        style={{
          height: 4,
          borderRadius: 2,
          background: 'var(--color-surface-700)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${score}%`,
            background: color,
            borderRadius: 2,
            transition: 'width 0.4s ease',
          }}
        />
      </div>
      {reportedBy !== undefined && (
        <span style={{ fontSize: '0.6rem', color: 'var(--color-surface-500)' }}>
          {reportedBy.toLocaleString()} reportes
        </span>
      )}
    </div>
  );
}
