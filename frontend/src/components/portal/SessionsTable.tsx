/**
 * SessionsTable — Table of active Hotspot sessions.
 * Data fed via WebSocket (usePortalSessions). Rows highlighted by usage thresholds.
 * Disconnect action guarded by ConfirmModal.
 */
import { useState } from 'react';
import { WifiOff, User, Wifi } from 'lucide-react';
import { ConfirmModal } from '../common/ConfirmModal';
import { useDisconnectPortalUser } from '../../hooks/usePortalUsers';
import type { PortalSession } from '../../types';

interface SessionsTableProps {
  sessions: PortalSession[];
  isConnected: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function getRowClass(session: PortalSession): string {
  const gb = 1024 * 1024 * 1024;
  const totalBytes = session.bytes_in + session.bytes_out;
  if (totalBytes > gb) return 'session-row-danger';

  // Check uptime > 4h (RouterOS format: "4h30m" or "1d2h")
  const uptimeStr = session.uptime;
  let hours = 0;
  const days = uptimeStr.match(/(\d+)d/);
  const hrs = uptimeStr.match(/(\d+)h/);
  if (days) hours += parseInt(days[1]) * 24;
  if (hrs) hours += parseInt(hrs[1]);
  if (hours >= 4) return 'session-row-warning';

  return '';
}

export function SessionsTable({ sessions, isConnected }: SessionsTableProps) {
  const [confirmDisconnect, setConfirmDisconnect] = useState<PortalSession | null>(null);
  const disconnect = useDisconnectPortalUser();

  const handleDisconnect = () => {
    if (!confirmDisconnect) return;
    disconnect.mutate(confirmDisconnect.user, {
      onSuccess: () => setConfirmDisconnect(null),
    });
  };

  return (
    <>
      <div className="portal-table-wrapper">
        <div className="portal-table-header">
          <div className="portal-ws-indicator">
            {isConnected ? (
              <><Wifi size={12} className="portal-ws-dot connected" /> En vivo</>
            ) : (
              <><WifiOff size={12} className="portal-ws-dot" /> Reconectando…</>
            )}
          </div>
          <span className="portal-session-count">{sessions.length} sesiones activas</span>
        </div>

        <table className="data-table">
          <thead>
            <tr>
              <th>Usuario / MAC</th>
              <th>IP</th>
              <th>Uptime</th>
              <th>Descarga</th>
              <th>Subida</th>
              <th>Velocidad</th>
              <th>Estado</th>
              <th>Acción</th>
            </tr>
          </thead>
          <tbody>
            {sessions.length === 0 ? (
              <tr>
                <td colSpan={8} className="portal-table-empty">
                  Sin sesiones activas
                </td>
              </tr>
            ) : (
              sessions.map((s, i) => (
                <tr key={`${s.mac}-${i}`} className={getRowClass(s)}>
                  <td>
                    <div className="portal-user-cell">
                      <User size={13} />
                      <span>{s.user || '—'}</span>
                      <span className="portal-mac">{s.mac}</span>
                    </div>
                  </td>
                  <td className="font-mono text-sm">{s.ip}</td>
                  <td>{s.uptime || '—'}</td>
                  <td>{formatBytes(s.bytes_in)}</td>
                  <td>{formatBytes(s.bytes_out)}</td>
                  <td className="font-mono text-xs">{s.rate_limit || '—'}</td>
                  <td>
                    <span className={`badge ${s.status === 'registered' ? 'badge-registered' : 'badge-unregistered'}`}>
                      {s.status === 'registered' ? 'Registrado' : 'No registrado'}
                    </span>
                  </td>
                  <td>
                    {s.user && (
                      <button
                        className="btn btn-danger btn-xs"
                        onClick={() => setConfirmDisconnect(s)}
                        title="Desconectar sesión"
                      >
                        <WifiOff size={12} />
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {confirmDisconnect && (
        <ConfirmModal
          title="Desconectar sesión"
          description="Se cerrará la sesión activa del usuario. Podrá reconectarse inmediatamente."
          data={{
            Usuario: confirmDisconnect.user || 'Sin usuario',
            MAC: confirmDisconnect.mac,
            IP: confirmDisconnect.ip,
            Uptime: confirmDisconnect.uptime,
          }}
          confirmLabel="Desconectar"
          variant="warning"
          onConfirm={handleDisconnect}
          onCancel={() => setConfirmDisconnect(null)}
          isLoading={disconnect.isPending}
        />
      )}
    </>
  );
}
