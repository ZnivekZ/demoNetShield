/**
 * NotificationPanel — Sliding panel showing real-time security notifications.
 *
 * Connected to TWO WebSocket streams via useSecurityAlerts:
 *   /ws/security/alerts    — Wazuh + MikroTik alerts  (existing)
 *   /ws/crowdsec/decisions — CrowdSec new decisions   (new)
 *
 * CrowdSec notifications have:
 *   - Purple left border + Shield icon
 *   - "Bloquear IP" quick action → ConfirmModal upstream
 *   - "Ver contexto completo →" quick action → IpContextPanel upstream
 */
import { useState } from 'react';
import { Bell, BellOff, ShieldAlert, Fish, Wifi, X, ShieldOff, ShieldCheck } from 'lucide-react';
import { useSecurityAlerts } from '../../hooks/useSecurityAlerts';
import type { SecurityNotification } from '../../types';
import { formatDistanceToNow } from '../utils/time';

interface NotificationPanelProps {
  onBlockIP?: (ip: string) => void;
  onSinkhole?: (url: string) => void;
  onShowIpContext?: (ip: string) => void;
}

export function NotificationPanel({ onBlockIP, onSinkhole, onShowIpContext }: NotificationPanelProps) {
  const {
    notifications, isConnected, csConnected,
    dismiss, clearAll,
    unreadCount, criticalCount, crowdsecCount,
  } = useSecurityAlerts();

  const [open,   setOpen]   = useState(false);
  const [filter, setFilter] = useState<'all' | 'crowdsec' | 'security'>('all');

  const filtered = filter === 'crowdsec'
    ? notifications.filter(n => n.type === 'crowdsec_decision')
    : filter === 'security'
    ? notifications.filter(n => n.type !== 'crowdsec_decision')
    : notifications;

  const getLevelColor = (level: string, type: string): string => {
    if (type === 'crowdsec_decision') return 'var(--color-brand-500)';   // purple
    if (level === 'critical') return 'var(--color-danger)';
    if (level === 'high') return 'var(--color-severity-high)';
    return 'var(--color-warning)';
  };

  const getIcon = (type: string) => {
    if (type === 'crowdsec_decision') return <ShieldCheck size={14} />;
    if (type === 'phishing_detected') return <Fish size={14} />;
    if (type === 'interface_down')    return <Wifi size={14} />;
    return <ShieldAlert size={14} />;
  };

  // Indicator color: red if critical, purple if crowdsec active, grey otherwise
  const bellColor =
    criticalCount > 0        ? 'var(--color-danger)'   :
    crowdsecCount > 0        ? 'var(--color-brand-400)' :
    unreadCount > 0          ? 'var(--color-warning)'   :
    'var(--color-surface-400)';

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
          color: bellColor,
          padding: '0.4rem',
          borderRadius: '8px',
          display: 'flex',
          alignItems: 'center',
          transition: 'all 0.2s',
        }}
        title={`${unreadCount} notificaciones • CrowdSec ${csConnected ? 'LIVE' : 'OFF'}`}
      >
        {isConnected || csConnected ? <Bell size={18} /> : <BellOff size={18} />}
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute',
            top: 0,
            right: 0,
            background: criticalCount > 0 ? 'var(--color-danger)' : crowdsecCount > 0 ? 'var(--color-brand-500)' : 'var(--color-warning)',
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
          {/* Header */}
          <div className="notification-panel__header">
            <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>Alertas en Tiempo Real</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              {/* Connection dots */}
              <span
                style={{ fontSize: '0.65rem', color: isConnected ? 'var(--color-success)' : 'var(--color-danger)' }}
                title="Wazuh/MikroTik"
              >
                ● Wazuh
              </span>
              <span
                style={{ fontSize: '0.65rem', color: csConnected ? 'var(--color-brand-400)' : 'var(--color-danger)' }}
                title="CrowdSec"
              >
                ● CS
              </span>
              {notifications.length > 0 && (
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
              >
                <X size={14} />
              </button>
            </div>
          </div>

          {/* Filter tabs */}
          <div style={{
            display: 'flex',
            gap: '0.25rem',
            padding: '0.5rem 0.75rem',
            borderBottom: '1px solid var(--color-surface-700)',
            background: 'var(--color-surface-800)',
          }}>
            {(['all', 'security', 'crowdsec'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  fontSize: '0.65rem',
                  fontWeight: 600,
                  padding: '0.15rem 0.5rem',
                  borderRadius: 6,
                  border: 'none',
                  cursor: 'pointer',
                  background: filter === f ? 'rgba(99,102,241,0.2)' : 'transparent',
                  color: filter === f ? 'var(--color-brand-300)' : 'var(--color-surface-400)',
                  transition: 'all 0.15s',
                }}
              >
                {f === 'all'      ? `Todo (${unreadCount})` :
                 f === 'security' ? `Wazuh/MT (${unreadCount - crowdsecCount})` :
                                    `CrowdSec (${crowdsecCount})`}
              </button>
            ))}
          </div>

          {/* Notification list */}
          <div className="notification-panel__list">
            {filtered.length === 0 ? (
              <div className="notification-panel__empty">
                Sin notificaciones{filter !== 'all' ? ` de ${filter}` : ''}
              </div>
            ) : (
              filtered.map(n => (
                <NotifItem
                  key={n.id}
                  notif={n}
                  onDismiss={() => dismiss(n.id!)}
                  onBlockIP={onBlockIP}
                  onSinkhole={onSinkhole}
                  onShowIpContext={onShowIpContext}
                  color={getLevelColor(n.level, n.type)}
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
  onShowIpContext,
  color,
  icon,
}: {
  notif: SecurityNotification;
  onDismiss: () => void;
  onBlockIP?: (ip: string) => void;
  onSinkhole?: (url: string) => void;
  onShowIpContext?: (ip: string) => void;
  color: string;
  icon: React.ReactNode;
}) {
  const ip  = notif.data?.src_ip as string | undefined;
  const url = notif.data?.dst_url as string | undefined;
  const isCrowdSec = notif.type === 'crowdsec_decision';
  const score = notif.data?.community_score as number | undefined;
  // Defensive fallback: ensure actions is always an array to prevent crashes
  // if a malformed notification arrives without the actions field.
  const actions = Array.isArray(notif.actions) ? notif.actions : [];

  return (
    <div className="notification-item" style={{ borderLeftColor: color }}>
      <div className="notification-item__header">
        <span style={{ color }}>{icon}</span>
        <span className="notification-item__title">{notif.title}</span>
        {isCrowdSec && score != null && (
          <span style={{
            fontSize: '0.6rem',
            fontWeight: 700,
            color: score >= 71 ? 'var(--color-danger)' : score >= 31 ? 'var(--color-warning)' : 'var(--color-success)',
            fontFamily: 'var(--font-mono)',
          }}>
            {score}
          </span>
        )}
        <span className="notification-item__time">{formatDistanceToNow(notif.receivedAt ?? '')}</span>
        <button onClick={onDismiss} className="notification-item__dismiss" title="Descartar">
          <X size={11} />
        </button>
      </div>
      <p className="notification-item__detail">{notif.detail}</p>

      {/* Actions */}
      {(
        (actions.includes('block_ip')         && ip  && onBlockIP) ||
        (actions.includes('sinkhole_domain')  && url && onSinkhole) ||
        (actions.includes('view_ip_context')  && ip  && onShowIpContext)
      ) && (
        <div className="notification-item__actions">
          {actions.includes('block_ip') && ip && onBlockIP && (
            <button
              className="btn btn-danger"
              style={{ padding: '0.2rem 0.5rem', fontSize: '0.7rem' }}
              onClick={() => { onBlockIP(ip); onDismiss(); }}
            >
              <ShieldOff size={11} /> Bloquear IP
            </button>
          )}
          {actions.includes('view_ip_context') && ip && onShowIpContext && (
            <button
              className="btn btn-ghost"
              style={{ padding: '0.2rem 0.5rem', fontSize: '0.7rem', color: 'var(--color-brand-300)' }}
              onClick={() => { onShowIpContext(ip); onDismiss(); }}
            >
              <ShieldCheck size={11} /> Ver contexto →
            </button>
          )}
          {actions.includes('sinkhole_domain') && url && onSinkhole && (
            <button
              className="btn btn-ghost"
              style={{ padding: '0.2rem 0.5rem', fontSize: '0.7rem' }}
              onClick={() => { onSinkhole(url); onDismiss(); }}
            >
              Sinkhole
            </button>
          )}
        </div>
      )}
    </div>
  );
}
