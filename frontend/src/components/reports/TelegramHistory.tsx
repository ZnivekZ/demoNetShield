/**
 * TelegramHistory — Table of sent/received Telegram messages with filters.
 * Expandable rows show full content_summary.
 */
import { useState } from 'react';
import { useTelegramLogs } from '../../hooks/useTelegramLogs';
import { formatDistanceToNow } from '../utils/time';
import { ArrowUpRight, ArrowDownLeft, AlertCircle, CheckCircle, Clock } from 'lucide-react';

const TYPE_LABELS: Record<string, string> = {
  alert: '🚨 Alerta',
  summary: '📊 Resumen',
  report: '📄 Reporte',
  test: '✅ Prueba',
  bot_query: '💬 Consulta',
  bot_response: '🤖 Respuesta',
};

export function TelegramHistory() {
  const [direction, setDirection] = useState<'outbound' | 'inbound' | ''>('');
  const [msgType, setMsgType] = useState('');
  const [expanded, setExpanded] = useState<number | null>(null);

  const { data: logs = [], isLoading } = useTelegramLogs({
    limit: 30,
    direction: direction || undefined,
    message_type: msgType || undefined,
  });

  const statusBadge = (status: string) => {
    const map: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
      sent: { color: 'var(--color-success)', icon: <CheckCircle size={11} />, label: 'Enviado' },
      failed: { color: 'var(--color-danger)', icon: <AlertCircle size={11} />, label: 'Error' },
      pending: { color: 'var(--color-warning)', icon: <Clock size={11} />, label: 'Pendiente' },
    };
    const s = map[status] ?? map['sent'];
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: '0.2rem',
        padding: '0.15rem 0.45rem', borderRadius: 20,
        background: `${s.color}22`, color: s.color,
        fontSize: '0.68rem', fontWeight: 600,
      }}>
        {s.icon} {s.label}
      </span>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {/* Filters */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: '0.75rem', color: 'var(--color-surface-400)' }}>Filtrar:</span>

        {[
          { val: '' as const, label: 'Todo' },
          { val: 'outbound' as const, label: '↑ Enviados' },
          { val: 'inbound' as const, label: '↓ Recibidos' },
        ].map(({ val, label }) => (
          <button
            key={val}
            onClick={() => setDirection(val)}
            style={{
              padding: '0.2rem 0.55rem', borderRadius: 6, border: 'none', cursor: 'pointer',
              fontSize: '0.75rem', fontWeight: 600,
              background: direction === val ? 'rgba(99,102,241,0.2)' : 'transparent',
              color: direction === val ? 'var(--color-brand-300)' : 'var(--color-surface-400)',
            }}
          >
            {label}
          </button>
        ))}

        <select
          value={msgType}
          onChange={e => setMsgType(e.target.value)}
          style={{
            background: 'var(--color-surface-800)', border: '1px solid var(--color-surface-600)',
            borderRadius: 6, color: 'var(--color-text-primary)', fontSize: '0.75rem',
            padding: '0.2rem 0.5rem', cursor: 'pointer',
          }}
        >
          <option value="">Todos los tipos</option>
          <option value="alert">Alertas</option>
          <option value="summary">Resúmenes</option>
          <option value="report">Reportes</option>
          <option value="test">Pruebas</option>
          <option value="bot_query">Consultas bot</option>
          <option value="bot_response">Respuestas bot</option>
        </select>
      </div>

      {/* Table */}
      {isLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
          <div className="loading-spinner" />
        </div>
      ) : logs.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '2.5rem',
          color: 'var(--color-surface-500)', fontSize: '0.875rem',
        }}>
          Sin mensajes registrados
        </div>
      ) : (
        <div className="data-table" style={{ fontSize: '0.82rem' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ width: 32 }}></th>
                <th>Tipo</th>
                <th>Resumen</th>
                <th>Estado</th>
                <th>Hace</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(log => (
                <>
                  <tr
                    key={log.id}
                    onClick={() => setExpanded(expanded === log.id ? null : log.id)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td style={{ textAlign: 'center' }}>
                      {log.direction === 'outbound'
                        ? <ArrowUpRight size={13} color="var(--color-brand-400)" />
                        : <ArrowDownLeft size={13} color="var(--color-success)" />}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>{TYPE_LABELS[log.message_type] ?? log.message_type}</td>
                    <td style={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {log.content_summary}
                    </td>
                    <td>{statusBadge(log.status)}</td>
                    <td style={{ color: 'var(--color-surface-400)', whiteSpace: 'nowrap' }}>
                      {formatDistanceToNow(log.created_at)}
                    </td>
                  </tr>
                  {expanded === log.id && (
                    <tr key={`exp-${log.id}`}>
                      <td colSpan={5} style={{ padding: '0.5rem 1rem 0.75rem 2.5rem' }}>
                        <div style={{
                          background: 'var(--color-surface-800)', borderRadius: 6,
                          padding: '0.6rem 0.75rem', fontSize: '0.8rem',
                          color: 'var(--color-text-primary)', lineHeight: 1.6,
                        }}>
                          <div><strong>Chat ID:</strong> <code>{log.chat_id}</code></div>
                          <div style={{ marginTop: 4 }}>{log.content_summary}</div>
                          {log.error && (
                            <div style={{ marginTop: 4, color: 'var(--color-danger)' }}>
                              ❌ {log.error}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
