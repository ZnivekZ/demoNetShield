/**
 * useSecurityAlerts — WebSocket hub for real-time security notifications.
 *
 * Listens to /ws/security/alerts — Wazuh + MikroTik alerts.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { SecurityNotification } from '../types';

const MAX_QUEUE = 50;

/** Build a unique notification ID */
const makeId = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

/** Creates a self-reconnecting WebSocket that adds messages to shared state */
function useReconnectingWS(
  path: string,
  onMessage: (raw: string) => void,
  setConnected: (v: boolean) => void,
) {
  const wsRef   = useRef<WebSocket | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const attempts = useRef(0);

  const connect = useCallback(() => {
    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}${path}`);

      ws.onopen = () => { setConnected(true); attempts.current = 0; };
      ws.onmessage = (e) => onMessage(e.data);
      ws.onclose = () => {
        setConnected(false);
        const delay = Math.min(1000 * Math.pow(2, attempts.current), 30_000);
        attempts.current++;
        timerRef.current = setTimeout(connect, delay);
      };
      ws.onerror = () => ws.close();
      wsRef.current = ws;
    } catch {
      const delay = Math.min(1000 * Math.pow(2, attempts.current), 30_000);
      attempts.current++;
      timerRef.current = setTimeout(connect, delay);
    }
  }, [path, onMessage, setConnected]);

  return { connect, wsRef, timerRef };
}

export function useSecurityAlerts() {
  const [notifications, setNotifications] = useState<SecurityNotification[]>([]);
  const [isConnected,   setIsConnected]   = useState(false);

  const push = useCallback((notif: SecurityNotification) => {
    setNotifications(prev => [notif, ...prev].slice(0, MAX_QUEUE));
  }, []);

  // ── /ws/security/alerts handler ───────────────────────────────
  const handleSecurityMsg = useCallback((raw: string) => {
    try {
      const data = JSON.parse(raw) as Omit<SecurityNotification, 'id' | 'receivedAt'>;
      // Guard: skip malformed messages missing required SecurityNotification fields.
      // This prevents NotifItem from crashing when backend sends incomplete data.
      if (!data.type || !data.title || !data.detail) return;
      push({
        ...data,
        // Ensure actions is always an array, even if backend omits it
        actions: Array.isArray(data.actions) ? data.actions : [],
        id: makeId(data.type),
        receivedAt: new Date().toISOString(),
      });
    } catch { /* malformed — ignore */ }
  }, [push]);

  // ── Wire up WebSocket ─────────────────────────────────────────
  const sec = useReconnectingWS('/ws/security/alerts', handleSecurityMsg, setIsConnected);

  useEffect(() => {
    sec.connect();
    return () => {
      clearTimeout(sec.timerRef.current);
      sec.wsRef.current?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dismiss  = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  const clearAll = useCallback(() => setNotifications([]), []);

  const unreadCount   = notifications.length;
  const criticalCount = notifications.filter(n => n.level === 'critical').length;

  return {
    notifications,
    isConnected,
    dismiss,
    clearAll,
    unreadCount,
    criticalCount,
  };
}
