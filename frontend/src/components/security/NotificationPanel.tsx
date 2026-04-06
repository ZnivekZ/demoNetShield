/**
 * NotificationPanel — Sliding panel showing real-time security notifications.
 * Connected to /ws/security/alerts via useSecurityAlerts hook.
 */
import { useState } from 'react';
import { Bell, BellOff, ShieldAlert, Fish, Wifi, X, ShieldOff } from 'lucide-react';
import { useSecurityAlerts } from '../../hooks/useSecurityAlerts';
import type { SecurityNotification } from '../../types';
import { formatDistanceToNow } from '../utils/time';

interface NotificationPanelProps {
  onBlockIP?: (ip: string) => void;
  onSinkhole?: (url: string) => void;
}

export function NotificationPanel({ onBlockIP, onSinkhole }: NotificationPanelProps) {
  const { notifications, isConnected, dismiss, clearAll, unreadCount, criticalCount } = useSecurityAlerts();
  const [open, setOpen] = useState(false);

  const getLevelColor = (level: string) => {
    if (level === 'critical') return 'var(--color-danger)';
    if (level === 'high') return 'var(--color-severity-high)';
    return 'var(--color-warning)';
  };

  const getIcon = (type: string) => {
    if (type === 'phishing_detected') return <Fish size={14} />;
    if (type === 'interface_down') return <Wifi size={14} />;
    return <ShieldAlert size={14} />;
  };

  return (
    <>
      {/* Bell Button */}
      <button
        id="notification-bell"
        onClick={() => setOpen(!open)}
        style={{
          position: 'relative',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: criticalCount > 0 ? 'var(--color-danger)' : 'var(--color-surface-400)',
          padding: '0.4rem',
          borderRadius: '8px',
          display: 'flex',
          alignItems: 'center',
          transition: 'all 0.2s',
        }}
        title={`${unreadCount} notificaciones`}
      >
        {isConnected ? <Bell size={18} /> : <BellOff size={18} />}
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute',
            top: 0,
            right: 0,
            background: criticalCount > 0 ? 'var(--color-danger)' : 'var(--color-warning)',
            borderRadius: '9999px',
            width: 16,
            height: 16,
            fontSize: '0.6rem',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
          }}>
            {Math.min(unreadCount, 99)}
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div className="notification-panel">
          <div className="notification-panel__header">
            <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>Alertas en Tiempo Real</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.7rem', color: isConnected ? 'var(--color-success)' : 'var(--color-danger)' }}>
                ● {isConnected ? 'LIVE' : 'OFF'}
              </span>
              {notifications.length > 0 && (
                <button onClick={clearAll} style={{ fontSize: '0.7rem', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-surface-500)' }}>
                  Limpiar
                </button>
              )}
              <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-surface-400)' }}>
                <X size={14} />
              </button>
            </div>
          </div>

          <div className="notification-panel__list">
            {notifications.length === 0 ? (
              <div className="notification-panel__empty">
                Sin nuevas notificaciones
              </div>
            ) : (
              notifications.map(n => (
                <NotifItem
                  key={n.id}
                  notif={n}
                  onDismiss={() => dismiss(n.id!)}
                  onBlockIP={onBlockIP}
                  onSinkhole={onSinkhole}
                  color={getLevelColor(n.level)}
                  icon={getIcon(n.type)}
                />
              ))
            )}
          </div>
        </div>
      )}
    </>
  );
}

function NotifItem({
  notif,
  onDismiss,
  onBlockIP,
  onSinkhole,
  color,
  icon,
}: {
  notif: SecurityNotification;
  onDismiss: () => void;
  onBlockIP?: (ip: string) => void;
  onSinkhole?: (url: string) => void;
  color: string;
  icon: React.ReactNode;
}) {
  const ip = notif.data?.src_ip as string | undefined;
  const url = notif.data?.dst_url as string | undefined;

  return (
    <div className="notification-item" style={{ borderLeftColor: color }}>
      <div className="notification-item__header">
        <span style={{ color }}>{icon}</span>
        <span className="notification-item__title">{notif.title}</span>
        <span className="notification-item__time">{formatDistanceToNow(notif.receivedAt ?? '')}</span>
        <button onClick={onDismiss} className="notification-item__dismiss" title="Descartar">
          <X size={11} />
        </button>
      </div>
      <p className="notification-item__detail">{notif.detail}</p>
      {(notif.actions.includes('block_ip') && ip && onBlockIP) ||
        (notif.actions.includes('sinkhole_domain') && url && onSinkhole) ? (
        <div className="notification-item__actions">
          {notif.actions.includes('block_ip') && ip && onBlockIP && (
            <button
              className="btn btn-danger"
              style={{ padding: '0.2rem 0.5rem', fontSize: '0.7rem' }}
              onClick={() => { onBlockIP(ip); onDismiss(); }}
            >
              <ShieldOff size={11} /> Bloquear IP
            </button>
          )}
          {notif.actions.includes('sinkhole_domain') && url && onSinkhole && (
            <button
              className="btn btn-ghost"
              style={{ padding: '0.2rem 0.5rem', fontSize: '0.7rem' }}
              onClick={() => { onSinkhole(url); onDismiss(); }}
            >
              Sinkhole
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}
