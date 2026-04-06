/**
 * TicketKanban — Three-column Kanban board for GLPI tickets.
 * Columns: Pendiente | En Progreso | Resuelto
 * Drag-and-drop: uses native HTML5 DnD API to move cards between columns.
 */
import { useState } from 'react';
import { useUpdateTicketStatus } from '../../hooks/useGlpiTickets';
import { useQueryClient } from '@tanstack/react-query';
import { TicketCard } from './TicketCard';
import type { GlpiTicket, GlpiTicketKanban } from '../../types';

interface Props {
  kanban: GlpiTicketKanban;
}

// GLPI status IDs to map kanban column to
const COL_STATUS_ID: Record<string, number> = {
  pendiente: 1,
  en_progreso: 3,
  resuelto: 5,
};

const COL_LABELS: Record<string, string> = {
  pendiente: 'Pendiente',
  en_progreso: 'En Progreso',
  resuelto: 'Resuelto',
};

const COL_ACCENT: Record<string, string> = {
  pendiente: 'var(--color-brand-400)',
  en_progreso: '#f59e0b',
  resuelto: '#22c55e',
};

export function TicketKanban({ kanban }: Props) {
  const qc = useQueryClient();
  const updateStatus = useUpdateTicketStatus();
  const [dragOver, setDragOver] = useState<string | null>(null);

  const handleDrop = async (ticketId: number, targetCol: string) => {
    const statusId = COL_STATUS_ID[targetCol];
    if (!statusId) return;
    await updateStatus.mutateAsync({ id: ticketId, status: statusId });
    qc.invalidateQueries({ queryKey: ['glpi', 'tickets'] });
  };

  const columns: Array<{ id: keyof GlpiTicketKanban; label: string }> = [
    { id: 'pendiente', label: 'Pendiente' },
    { id: 'en_progreso', label: 'En Progreso' },
    { id: 'resuelto', label: 'Resuelto' },
  ];

  return (
    <div className="ticket-kanban">
      {columns.map((col) => {
        const tickets: GlpiTicket[] = kanban[col.id] ?? [];
        const isOver = dragOver === col.id;

        return (
          <div
            key={col.id}
            id={`kanban-col-${col.id}`}
            className={`kanban-column ${isOver ? 'kanban-column--over' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(col.id);
            }}
            onDragLeave={() => setDragOver(null)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(null);
              const ticketId = parseInt(e.dataTransfer.getData('ticketId'), 10);
              if (ticketId) handleDrop(ticketId, col.id);
            }}
          >
            {/* Column Header */}
            <div className="kanban-column__header">
              <span
                className="kanban-column__accent"
                style={{ background: COL_ACCENT[col.id] }}
              />
              <span className="kanban-column__label">{COL_LABELS[col.id]}</span>
              <span className="kanban-column__count">{tickets.length}</span>
            </div>

            {/* Cards */}
            <div className="kanban-column__cards">
              {tickets.length === 0 ? (
                <div className="kanban-column__empty">
                  Arrastrá tickets aquí
                </div>
              ) : (
                tickets.map((ticket) => (
                  <TicketCard
                    key={ticket.id}
                    ticket={ticket}
                  />
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
