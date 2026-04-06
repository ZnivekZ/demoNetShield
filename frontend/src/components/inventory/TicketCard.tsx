/**
 * TicketCard — Draggable card for the Kanban board.
 * Shows: title, priority badge, asset link, assignee.
 */
import type { GlpiTicket } from '../../types';
import { Tag, User, Monitor } from 'lucide-react';

interface Props {
  ticket: GlpiTicket;
}

const PRIORITY_COLORS: Record<number, string> = {
  1: '#64748b',
  2: '#22c55e',
  3: '#f59e0b',
  4: '#f97316',
  5: '#ef4444',
};

export function TicketCard({ ticket }: Props) {
  return (
    <div
      id={`ticket-card-${ticket.id}`}
      className="ticket-card"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('ticketId', String(ticket.id));
        e.dataTransfer.effectAllowed = 'move';
      }}
    >
      {/* Priority indicator stripe */}
      <div
        className="ticket-card__stripe"
        style={{ background: PRIORITY_COLORS[ticket.priority] ?? '#64748b' }}
      />

      <div className="ticket-card__body">
        {/* Header */}
        <div className="ticket-card__header">
          <span className="ticket-card__id">#{ticket.id}</span>
          {ticket.is_netshield && (
            <span className="badge badge-info" style={{ fontSize: '0.58rem' }}>NetShield</span>
          )}
        </div>

        {/* Title */}
        <div className="ticket-card__title">{ticket.title}</div>

        {/* Meta */}
        <div className="ticket-card__meta">
          {/* Priority */}
          <span className="ticket-card__meta-item" style={{ color: PRIORITY_COLORS[ticket.priority] ?? '#94a3b8' }}>
            <Tag size={10} />
            {ticket.priority_label}
          </span>

          {/* Asset */}
          {ticket.asset_name && (
            <span className="ticket-card__meta-item">
              <Monitor size={10} />
              {ticket.asset_name}
            </span>
          )}

          {/* Assignee */}
          {ticket.assigned_user && (
            <span className="ticket-card__meta-item">
              <User size={10} />
              {ticket.assigned_user}
            </span>
          )}
        </div>

        {/* Date */}
        {ticket.created_at && (
          <div className="ticket-card__date">
            {new Date(ticket.created_at).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })}
          </div>
        )}
      </div>
    </div>
  );
}
