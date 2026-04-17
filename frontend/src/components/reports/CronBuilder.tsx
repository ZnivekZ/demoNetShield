/**
 * CronBuilder — Visual cron expression builder.
 * Shows human-readable label and produces a valid 5-part cron string.
 */
import { useState, useEffect } from 'react';

interface CronBuilderProps {
  value: string;
  onChange: (cron: string) => void;
}

type Frequency = 'daily' | 'weekly' | 'monthly';

const DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

function buildCron(freq: Frequency, hour: number, dayOfWeek: number, dayOfMonth: number): string {
  if (freq === 'daily') return `0 ${hour} * * *`;
  if (freq === 'weekly') return `0 ${hour} * * ${dayOfWeek}`;
  return `0 ${hour} ${dayOfMonth} * *`;
}

function parseCron(cron: string): { freq: Frequency; hour: number; dayOfWeek: number; dayOfMonth: number } {
  const parts = (cron || '0 8 * * *').split(' ');
  if (parts.length !== 5) return { freq: 'daily', hour: 8, dayOfWeek: 1, dayOfMonth: 1 };
  const [, hourStr, domStr, , dowStr] = parts;
  const hour = parseInt(hourStr) || 8;
  if (domStr !== '*') return { freq: 'monthly', hour, dayOfWeek: 1, dayOfMonth: parseInt(domStr) || 1 };
  if (dowStr !== '*') return { freq: 'weekly', hour, dayOfWeek: parseInt(dowStr) || 1, dayOfMonth: 1 };
  return { freq: 'daily', hour, dayOfWeek: 1, dayOfMonth: 1 };
}

function humanLabel(freq: Frequency, hour: number, dayOfWeek: number, dayOfMonth: number): string {
  const timeStr = `${String(hour).padStart(2, '0')}:00`;
  if (freq === 'daily') return `Todos los días a las ${timeStr}`;
  if (freq === 'weekly') return `Todos los ${DAYS[dayOfWeek]} a las ${timeStr}`;
  return `El día ${dayOfMonth} de cada mes a las ${timeStr}`;
}

export function CronBuilder({ value, onChange }: CronBuilderProps) {
  const parsed = parseCron(value);
  const [freq, setFreq] = useState<Frequency>(parsed.freq);
  const [hour, setHour] = useState(parsed.hour);
  const [dayOfWeek, setDayOfWeek] = useState(parsed.dayOfWeek);
  const [dayOfMonth, setDayOfMonth] = useState(parsed.dayOfMonth);

  useEffect(() => {
    onChange(buildCron(freq, hour, dayOfWeek, dayOfMonth));
  }, [freq, hour, dayOfWeek, dayOfMonth]);

  const sel = (style?: React.CSSProperties): React.CSSProperties => ({
    background: 'var(--color-surface-800)',
    border: '1px solid var(--color-surface-600)',
    borderRadius: 6,
    color: 'var(--color-text-primary)',
    fontSize: '0.8rem',
    padding: '0.3rem 0.5rem',
    cursor: 'pointer',
    ...style,
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {/* Frequency selector */}
      <div style={{ display: 'flex', gap: '0.4rem' }}>
        {(['daily', 'weekly', 'monthly'] as Frequency[]).map(f => (
          <button
            key={f}
            onClick={() => setFreq(f)}
            type="button"
            style={{
              padding: '0.3rem 0.7rem',
              borderRadius: 6,
              border: 'none',
              cursor: 'pointer',
              fontSize: '0.78rem',
              fontWeight: 600,
              background: freq === f ? 'var(--color-brand-500)' : 'var(--color-surface-700)',
              color: freq === f ? '#fff' : 'var(--color-surface-300)',
              transition: 'all 0.15s',
            }}
          >
            {f === 'daily' ? 'Diario' : f === 'weekly' ? 'Semanal' : 'Mensual'}
          </button>
        ))}
      </div>

      {/* Time & day selectors */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.78rem', color: 'var(--color-surface-400)' }}>Hora:</span>
        <select value={hour} onChange={e => setHour(Number(e.target.value))} style={sel()}>
          {HOURS.map(h => (
            <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
          ))}
        </select>

        {freq === 'weekly' && (
          <>
            <span style={{ fontSize: '0.78rem', color: 'var(--color-surface-400)' }}>Día:</span>
            <select value={dayOfWeek} onChange={e => setDayOfWeek(Number(e.target.value))} style={sel()}>
              {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
            </select>
          </>
        )}

        {freq === 'monthly' && (
          <>
            <span style={{ fontSize: '0.78rem', color: 'var(--color-surface-400)' }}>Día del mes:</span>
            <select value={dayOfMonth} onChange={e => setDayOfMonth(Number(e.target.value))} style={sel()}>
              {Array.from({ length: 28 }, (_, i) => i + 1).map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </>
        )}
      </div>

      {/* Human label */}
      <div style={{
        padding: '0.5rem 0.75rem',
        background: 'rgba(99,102,241,0.08)',
        borderRadius: 6,
        fontSize: '0.8rem',
        color: 'var(--color-brand-300)',
        fontWeight: 500,
      }}>
        📅 {humanLabel(freq, hour, dayOfWeek, dayOfMonth)}
      </div>
    </div>
  );
}
