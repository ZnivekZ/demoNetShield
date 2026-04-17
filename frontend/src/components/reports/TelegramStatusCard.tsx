/**
 * TelegramStatusCard — Shows bot connection status, bot username, chat ID,
 * pending messages, and a collapsible setup guide.
 */
import { useState } from 'react';
import { Bot, CheckCircle, XCircle, AlertCircle, ChevronDown, ChevronRight, Clock } from 'lucide-react';
import { useTelegramStatus } from '../../hooks/useTelegramStatus';
import { formatDistanceToNow } from '../utils/time';

export function TelegramStatusCard() {
  const { data: status, isLoading, error } = useTelegramStatus();
  const [guideOpen, setGuideOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="glass-card" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <div className="loading-spinner" />
        <span style={{ color: 'var(--color-surface-400)', fontSize: '0.875rem' }}>Verificando estado del bot…</span>
      </div>
    );
  }

  if (error || !status) {
    return (
      <div className="glass-card" style={{ padding: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <XCircle size={18} color="var(--color-danger)" />
          <span style={{ color: 'var(--color-danger)', fontSize: '0.875rem' }}>Error al obtener estado de Telegram</span>
        </div>
      </div>
    );
  }

  const isMock = status.mock;
  const isConnected = status.connected;

  const statusColor = isMock
    ? 'var(--color-warning)'
    : isConnected
      ? 'var(--color-success)'
      : 'var(--color-danger)';

  const StatusIcon = isMock ? AlertCircle : isConnected ? CheckCircle : XCircle;
  const statusLabel = isMock ? 'MODO DEMO' : isConnected ? 'CONECTADO' : 'DESCONECTADO';

  return (
    <div className="glass-card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10,
            background: 'rgba(34,163,238,0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Bot size={20} color="#22a3ee" />
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--color-text-primary)' }}>
              Bot de Telegram
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-surface-400)' }}>
              Canal de notificaciones bidireccional
            </div>
          </div>
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.4rem',
          padding: '0.3rem 0.7rem', borderRadius: 20,
          background: `${statusColor}22`,
          border: `1px solid ${statusColor}44`,
        }}>
          <StatusIcon size={13} color={statusColor} />
          <span style={{ fontSize: '0.7rem', fontWeight: 700, color: statusColor }}>{statusLabel}</span>
        </div>
      </div>

      {/* Details grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
        <Detail label="Bot Username" value={status.bot_username ?? '—'} mono />
        <Detail label="Chat ID" value={status.chat_id ?? '—'} mono />
        <Detail label="Mensajes pendientes" value={String(status.pending_messages)} />
        <Detail
          label="Último mensaje"
          value={status.last_message_at ? formatDistanceToNow(status.last_message_at) : '—'}
          icon={<Clock size={11} />}
        />
      </div>

      {/* Collapsible setup guide */}
      <div style={{ borderTop: '1px solid var(--color-surface-700)', paddingTop: '0.75rem' }}>
        <button
          onClick={() => setGuideOpen(g => !g)}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: '0.4rem',
            color: 'var(--color-brand-300)', fontSize: '0.78rem', fontWeight: 600,
          }}
        >
          {guideOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          {isMock ? 'Cómo configurar el bot real' : 'Guía de configuración'}
        </button>
        {guideOpen && (
          <div style={{
            marginTop: '0.75rem', padding: '0.75rem',
            background: 'rgba(34,163,238,0.06)', borderRadius: 8,
            fontSize: '0.78rem', color: 'var(--color-surface-300)',
            lineHeight: 1.6,
          }}>
            <ol style={{ paddingLeft: '1.25rem', margin: 0, display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <li>Abrir <strong>@BotFather</strong> en Telegram → <code>/newbot</code></li>
              <li>Guardar el token en <code>TELEGRAM_BOT_TOKEN</code></li>
              <li>Agregar el bot al canal/grupo y obtener el chat ID</li>
              <li>Configurar <code>TELEGRAM_CHAT_ID</code> y <code>MOCK_TELEGRAM=false</code></li>
              <li>Reiniciar el backend — el bot se conectará automáticamente</li>
            </ol>
          </div>
        )}
      </div>
    </div>
  );
}

function Detail({ label, value, mono, icon }: { label: string; value: string; mono?: boolean; icon?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
      <span style={{ fontSize: '0.68rem', color: 'var(--color-surface-400)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
      <span style={{
        fontSize: '0.82rem', color: 'var(--color-text-primary)',
        fontFamily: mono ? 'var(--font-mono)' : undefined,
        display: 'flex', alignItems: 'center', gap: '0.3rem',
      }}>
        {icon}{value}
      </span>
    </div>
  );
}
