/**
 * BotConversation — Chat-style view of bot queries and responses.
 * Also shows a collapsible "How to use" panel with example commands.
 */
import { useState } from 'react';
import { MessageSquare, ChevronDown, ChevronRight, Info, Bot, User } from 'lucide-react';
import { useTelegramLogs } from '../../hooks/useTelegramLogs';
import { formatDistanceToNow } from '../utils/time';

const EXAMPLES = [
  { cmd: '/alertas', desc: 'Alertas críticas de las últimas 24h' },
  { cmd: '/estado', desc: 'Estado de todos los servicios' },
  { cmd: '/atacantes', desc: 'Top IPs atacantes y bloqueos activos' },
  { cmd: '/mikrotik', desc: 'CPU, RAM, tráfico y conexiones' },
  { cmd: '/crowdsec', desc: 'Decisiones y escenarios activos' },
];

export function BotConversation() {
  const [infoOpen, setInfoOpen] = useState(false);

  const { data: allLogs = [] } = useTelegramLogs({ limit: 50 });

  // Filter only bot_query + bot_response pairs, group them
  const conversation: Array<{ question: string; answer: string; qTime: string; aTime: string }> = [];
  const queries = allLogs.filter(l => l.message_type === 'bot_query');
  const responses = allLogs.filter(l => l.message_type === 'bot_response');

  queries.forEach((q, i) => {
    const r = responses[i];
    if (r) {
      conversation.push({
        question: q.content_summary,
        answer: r.content_summary,
        qTime: q.created_at,
        aTime: r.created_at,
      });
    }
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Info panel */}
      <div style={{
        background: 'rgba(34,163,238,0.06)',
        border: '1px solid rgba(34,163,238,0.2)',
        borderRadius: 10, padding: '0.75rem 1rem',
      }}>
        <button
          onClick={() => setInfoOpen(o => !o)}
          style={{
            background: 'none', border: 'none', cursor: 'pointer', width: '100%',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#22a3ee', fontSize: '0.82rem', fontWeight: 600 }}>
            <Info size={14} /> Cómo usar el bot de NetShield
          </div>
          {infoOpen ? <ChevronDown size={14} color="#22a3ee" /> : <ChevronRight size={14} color="#22a3ee" />}
        </button>

        {infoOpen && (
          <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--color-surface-300)', lineHeight: 1.6 }}>
              El bot responde consultas en lenguaje natural sobre el estado del sistema.
              Solo usuarios autorizados (<code>TELEGRAM_ADMIN_CHAT_IDS</code>) pueden interactuar con él.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem' }}>
              {EXAMPLES.map(({ cmd, desc }) => (
                <div key={cmd} style={{
                  background: 'var(--color-surface-800)', borderRadius: 6, padding: '0.5rem 0.65rem',
                  display: 'flex', flexDirection: 'column', gap: '0.1rem',
                }}>
                  <code style={{ fontSize: '0.78rem', color: '#22a3ee' }}>{cmd}</code>
                  <span style={{ fontSize: '0.72rem', color: 'var(--color-surface-400)' }}>{desc}</span>
                </div>
              ))}
            </div>

            <div style={{
              display: 'flex', alignItems: 'flex-start', gap: '0.4rem',
              background: 'rgba(245,158,11,0.08)', borderRadius: 6, padding: '0.5rem 0.65rem',
              fontSize: '0.75rem', color: 'var(--color-warning)',
            }}>
              <span style={{ minWidth: 16 }}>⚠️</span>
              <span>El bot es estrictamente informativo. No puede bloquear IPs ni ejecutar acciones. Las acciones se realizan exclusivamente desde el dashboard.</span>
            </div>
          </div>
        )}
      </div>

      {/* Conversation */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '-0.25rem' }}>
        <MessageSquare size={15} color="var(--color-brand-400)" />
        <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>
          Historial de conversaciones ({conversation.length})
        </span>
      </div>

      {conversation.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '2.5rem',
          color: 'var(--color-surface-500)', fontSize: '0.875rem',
          border: '1px dashed var(--color-surface-600)', borderRadius: 10,
        }}>
          <Bot size={32} style={{ opacity: 0.3, marginBottom: '0.75rem' }} />
          <div>Sin consultas al bot todavía.</div>
          <div style={{ fontSize: '0.8rem', marginTop: '0.4rem' }}>
            Envía un mensaje al bot desde Telegram para verlo aquí.
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {conversation.map((pair, idx) => (
            <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {/* User question */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', alignItems: 'flex-end' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.15rem', maxWidth: '75%' }}>
                  <div style={{
                    background: 'rgba(99,102,241,0.18)', borderRadius: '12px 12px 2px 12px',
                    padding: '0.5rem 0.75rem', fontSize: '0.82rem',
                    color: 'var(--color-text-primary)', lineHeight: 1.5,
                  }}>
                    {pair.question}
                  </div>
                  <span style={{ fontSize: '0.65rem', color: 'var(--color-surface-500)' }}>
                    {formatDistanceToNow(pair.qTime)}
                  </span>
                </div>
                <div style={{
                  width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                  background: 'rgba(99,102,241,0.2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <User size={13} color="var(--color-brand-400)" />
                </div>
              </div>

              {/* Bot response */}
              <div style={{ display: 'flex', justifyContent: 'flex-start', gap: '0.5rem', alignItems: 'flex-end' }}>
                <div style={{
                  width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                  background: 'rgba(34,163,238,0.15)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Bot size={13} color="#22a3ee" />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem', maxWidth: '80%' }}>
                  <div style={{
                    background: 'var(--color-surface-800)', borderRadius: '2px 12px 12px 12px',
                    padding: '0.5rem 0.75rem', fontSize: '0.82rem',
                    color: 'var(--color-text-primary)', lineHeight: 1.6,
                    border: '1px solid var(--color-surface-600)',
                  }}>
                    {pair.answer}
                  </div>
                  <span style={{ fontSize: '0.65rem', color: 'var(--color-surface-500)' }}>
                    NetShield Bot · {formatDistanceToNow(pair.aTime)}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
