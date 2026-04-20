import { useTelegramActivity } from '../../../hooks/widgets/hybrid';
import { WidgetSkeleton, WidgetErrorState, WidgetHeader } from '../common';

interface MsgLog { direction?: string; text?: string; timestamp?: string; username?: string }
interface TelegramStatusData { connected?: boolean; username?: string; mock?: boolean }

/**
 * Timeline compacta de mensajes Telegram + contadores de hoy.
 * Inbound (verde) / Outbound (azul) + estado del bot.
 */
export function TelegramActivity({ config }: { config?: { limit?: number } }) {
  const limit = config?.limit ?? 20;
  const { data, isLoading, error, refetch } = useTelegramActivity(limit);

  if (isLoading) return <WidgetSkeleton rows={4} />;
  if (error || !data) return <WidgetErrorState message={String(error)} onRetry={() => refetch()} />;

  const status = data.status as TelegramStatusData | null;
  const logs = (data.logs ?? []) as MsgLog[];
  const isOnline = status?.connected ?? false;

  return (
    <div className="widget-telegram-activity">
      <WidgetHeader title="Actividad Telegram" />

      {/* Bot status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
        <span style={{
          width: 8, height: 8, borderRadius: '50%',
          background: isOnline ? 'var(--color-success, #10b981)' : 'var(--color-danger, #ef4444)',
          display: 'inline-block', flexShrink: 0,
        }} />
        <span style={{ fontSize: '0.7rem', color: 'var(--color-text-secondary)' }}>
          {status?.username ? `@${status.username}` : 'Bot'} — {isOnline ? 'Conectado' : 'Desconectado'}
        </span>
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.6rem' }}>
        {[
          { label: 'Enviados hoy', value: data.sent_today, color: 'var(--accent-primary,#6366f1)' },
          { label: 'Recibidos hoy', value: data.received_today, color: 'var(--color-success,#10b981)' },
        ].map(s => (
          <div key={s.label} style={{
            flex: 1, background: 'var(--color-surface-alt,#1e293b)',
            borderRadius: '6px', padding: '0.4rem', textAlign: 'center',
          }}>
            <div style={{ color: s.color, fontWeight: 700, fontSize: '1.1rem' }}>{s.value}</div>
            <div style={{ color: 'var(--color-text-muted)', fontSize: '0.6rem' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Message timeline */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', maxHeight: '150px', overflowY: 'auto' }}>
        {logs.slice(0, 15).map((m, i) => {
          const isOut = m.direction === 'outbound';
          return (
            <div key={i} style={{
              display: 'flex', gap: '0.4rem', alignItems: 'flex-start',
              flexDirection: isOut ? 'row-reverse' : 'row',
            }}>
              <span style={{
                fontSize: '0.6rem', padding: '0.2rem 0.45rem', borderRadius: '8px',
                background: isOut ? 'rgba(99,102,241,0.15)' : 'rgba(16,185,129,0.15)',
                color: isOut ? 'var(--accent-primary,#6366f1)' : 'var(--color-success,#10b981)',
                maxWidth: '80%', wordBreak: 'break-word',
              }}>
                {m.text ? (m.text.length > 60 ? m.text.slice(0, 60) + '…' : m.text) : '[sin texto]'}
              </span>
              <span style={{ color: 'var(--color-text-muted)', fontSize: '0.55rem', flexShrink: 0, marginTop: '0.2rem' }}>
                {m.timestamp ? new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
              </span>
            </div>
          );
        })}
        {logs.length === 0 && (
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.7rem', textAlign: 'center' }}>Sin mensajes recientes</p>
        )}
      </div>
    </div>
  );
}
