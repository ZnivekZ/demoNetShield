/**
 * TicketsView — GLPI ticket management with Kanban board.
 * Tabs: Kanban (drag-drop columns) | Lista plana
 */
import { useState } from 'react';
import { Plus, RefreshCw } from 'lucide-react';
import { useGlpiTickets } from '../../hooks/useGlpiTickets';
import { useQueryClient } from '@tanstack/react-query';
import { TicketKanban } from './TicketKanban';
import { TicketFormModal } from './TicketFormModal';

type View = 'kanban' | 'list';

const PRIORITY_COLORS: Record<number, string> = {
  1: '#64748b',
  2: '#22c55e',
  3: '#f59e0b',
  4: '#f97316',
  5: '#ef4444',
};

export function TicketsView() {
  const qc = useQueryClient();
  const [view, setView] = useState<View>('kanban');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const { data, isLoading } = useGlpiTickets({ limit: 100 });

  const tickets = data?.tickets ?? [];
  const kanban = data?.kanban ?? { pendiente: [], en_progreso: [], resuelto: [] };
  const isMock = data?.mock;

  return (
    <div className="tickets-view">
      {/* Toolbar */}
      <div className="tickets-toolbar glass-card">
        <div className="tickets-toolbar__left">
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            <button
              id="tickets-view-kanban"
              className={`btn btn-ghost ${view === 'kanban' ? 'active' : ''}`}
              onClick={() => setView('kanban')}
              style={{ fontSize: '0.78rem' }}
            >
              Kanban
            </button>
            <button
              id="tickets-view-list"
              className={`btn btn-ghost ${view === 'list' ? 'active' : ''}`}
              onClick={() => setView('list')}
              style={{ fontSize: '0.78rem' }}
            >
              Lista
            </button>
          </div>
          {isMock && (
            <span className="badge badge-warning" style={{ fontSize: '0.65rem' }}>Demo</span>
          )}
        </div>

        <div className="tickets-toolbar__right">
          <button
            id="tickets-refresh"
            className="btn btn-ghost"
            onClick={() => qc.invalidateQueries({ queryKey: ['glpi', 'tickets'] })}
            style={{ fontSize: '0.75rem' }}
          >
            <RefreshCw size={14} />
          </button>
          <button
            id="tickets-create-btn"
            className="btn btn-primary"
            onClick={() => setShowCreateModal(true)}
            style={{ fontSize: '0.8rem' }}
          >
            <Plus size={14} /> Nuevo Ticket
          </button>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div style={{ padding: '3rem', textAlign: 'center' }}>
          <span className="loading-spinner" />
        </div>
      ) : view === 'kanban' ? (
        <TicketKanban kanban={kanban} />
      ) : (
        /* List view */
        <div className="glass-card" style={{ overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Título</th>
                  <th>Prioridad</th>
                  <th>Estado</th>
                  <th>Equipo</th>
                  <th>Asignado</th>
                  <th>Creado</th>
                </tr>
              </thead>
              <tbody>
                {tickets.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', color: 'var(--color-surface-500)', padding: '2rem' }}>
                      No hay tickets.
                    </td>
                  </tr>
                ) : (
                  tickets.map((ticket) => (
                    <tr key={ticket.id}>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--color-surface-500)' }}>
                        #{ticket.id}
                      </td>
                      <td style={{ fontWeight: 500, color: 'var(--color-surface-100)', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {ticket.is_netshield && (
                          <span className="badge badge-info" style={{ fontSize: '0.58rem', marginRight: 4 }}>NS</span>
                        )}
                        {ticket.title}
                      </td>
                      <td>
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          fontSize: '0.72rem',
                          color: PRIORITY_COLORS[ticket.priority] ?? '#94a3b8',
                        }}>
                          <span style={{
                            width: 6, height: 6, borderRadius: '50%',
                            background: PRIORITY_COLORS[ticket.priority] ?? '#94a3b8',
                            display: 'inline-block'
                          }} />
                          {ticket.priority_label}
                        </span>
                      </td>
                      <td>
                        <span className={`badge ${ticket.status === 'resuelto' ? 'badge-success' : ticket.status === 'en_progreso' ? 'badge-warning' : 'badge-low'}`} style={{ fontSize: '0.62rem' }}>
                          {ticket.status}
                        </span>
                      </td>
                      <td style={{ fontSize: '0.72rem' }}>{ticket.asset_name || '—'}</td>
                      <td style={{ fontSize: '0.72rem' }}>{ticket.assigned_user || '—'}</td>
                      <td style={{ fontSize: '0.72rem', color: 'var(--color-surface-500)' }}>
                        {ticket.created_at ? new Date(ticket.created_at).toLocaleDateString('es-AR') : '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create modal */}
      {showCreateModal && (
        <TicketFormModal
          onClose={() => setShowCreateModal(false)}
          onCreated={() => {
            setShowCreateModal(false);
            qc.invalidateQueries({ queryKey: ['glpi', 'tickets'] });
          }}
        />
      )}
    </div>
  );
}
