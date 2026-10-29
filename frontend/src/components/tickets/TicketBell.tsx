/**
 * TicketBell — ícono propio (al lado de la campanita de alertas) para los
 * tickets recién creados en GLPI.
 *
 * Se alimenta de `useTicketNotifications` (polling 60 s con línea base en
 * localStorage) y al hacer click en un ticket abre la pestaña Tickets.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Inbox, Ticket, X } from 'lucide-react';
import { useTicketNotifications, type TicketNotification } from '../../hooks/useTicketNotifications';
import { formatDistanceToNow } from '../utils/time';

const PRIORITY_COLORS: Record<number, string> = {
  1: '#64748b',
  2: '#22c55e',
  3: '#f59e0b',
  4: '#f97316',
  5: '#ef4444',
};

const PRIORITY_LABELS: Record<number, string> = {
  1: 'Muy baja',
  2: 'Baja',
  3: 'Media',
  4: 'Alta',
  5: 'Muy alta',
};

export function TicketBell() {
  const { notifications, dismiss, clearAll, count } = useTicketNotifications();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const openTicket = (t: TicketNotification) => {
    dismiss(t.id);
    setOpen(false);
    navigate('/inventory?tab=tickets');
  };

  return (
    <div className="tb-wrap">
      <button
        id="ticket-bell"
        className={`tb-btn ${count > 0 ? 'has-new' : ''}`}
        onClick={() => setOpen(!open)}
        title={count > 0 ? `${count} tickets nuevos` : 'Sin tickets nuevos'}
        aria-label={`Tickets nuevos: ${count}`}
      >
        <Ticket size={18} />
        {count > 0 && <span className="tb-badge">{Math.min(count, 99)}</span>}
      </button>

      {open && (
        <div className="notification-panel tb-panel">
          <div className="notification-panel__header">
            <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>Tickets nuevos</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              {count > 0 && (
                <button
                  onClick={clearAll}
                  style={{ fontSize: '0.7rem', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-surface-500)' }}
                >
                  Limpiar
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-surface-400)' }}
                aria-label="Cerrar tickets"
              >
                <X size={14} />
              </button>
            </div>
          </div>

          <div className="notification-panel__list">
            {count === 0 ? (
              <div className="notification-panel__empty">
                <Inbox size={16} style={{ opacity: 0.6, marginBottom: 4 }} />
                Sin tickets nuevos
              </div>
            ) : (
              notifications.map((t) => {
                const color = PRIORITY_COLORS[t.priority] ?? PRIORITY_COLORS[3];
                const high = t.priority >= 4;
                return (
                  <div
                    key={t.id}
                    className="notification-item tn-item"
                    style={{ borderLeftColor: color, cursor: 'pointer' }}
                    role="button"
                    tabIndex={0}
                    onClick={() => openTicket(t)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        openTicket(t);
                      }
                    }}
                    title="Ver tickets"
                  >
                    <div className="notification-item__header">
                      <span style={{ color }}>{high ? <AlertTriangle size={14} /> : <Ticket size={14} />}</span>
                      <span className="notification-item__title">{t.title}</span>
                      <span className="notification-item__time">{formatDistanceToNow(t.receivedAt)}</span>
                      <button
                        className="notification-item__dismiss"
                        title="Descartar"
                        onClick={(e) => { e.stopPropagation(); dismiss(t.id); }}
                      >
                        <X size={11} />
                      </button>
                    </div>
                    <p className="notification-item__detail">
                      #{t.ticketId} · Prioridad {PRIORITY_LABELS[t.priority] ?? 'Media'} · {t.status}
                    </p>
                  </div>
                );
              })
            )}
          </div>

          <div className="notif-footer">Los tickets se revisan cada 60 segundos.</div>
        </div>
      )}
    </div>
  );
}
