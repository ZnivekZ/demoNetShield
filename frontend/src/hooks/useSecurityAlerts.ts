/**
 * useSecurityAlerts — WebSocket hook for /ws/security/alerts.
 * Maintains a rolling queue of SecurityNotification objects.
 * Provides dismiss and clear actions.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { SecurityNotification } from '../types';

const MAX_QUEUE = 50;

export function useSecurityAlerts() {
  const [notifications, setNotifications] = useState<SecurityNotification[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout>>();
  const attemptsRef = useRef(0);

  const connect = useCallback(() => {
    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws/security/alerts`);

      ws.onopen = () => {
        setIsConnected(true);
        attemptsRef.current = 0;
      };

      ws.onmessage = (event) => {
        try {
          const raw = JSON.parse(event.data) as Omit<SecurityNotification, 'id' | 'receivedAt'>;
          const notif: SecurityNotification = {
            ...raw,
            id: `${raw.type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            receivedAt: new Date().toISOString(),
          };
          setNotifications(prev => [notif, ...prev].slice(0, MAX_QUEUE));
        } catch {
          // malformed message — ignore
        }
      };

      ws.onclose = () => {
        setIsConnected(false);
        const delay = Math.min(1000 * Math.pow(2, attemptsRef.current), 30000);
        attemptsRef.current++;
        reconnectRef.current = setTimeout(connect, delay);
      };

      ws.onerror = () => { ws.close(); };
      wsRef.current = ws;
    } catch {
      const delay = Math.min(1000 * Math.pow(2, attemptsRef.current), 30000);
      attemptsRef.current++;
      reconnectRef.current = setTimeout(connect, delay);
    }
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const dismiss = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
  }, []);

  const unreadCount = notifications.length;
  const criticalCount = notifications.filter(n => n.level === 'critical').length;

  return { notifications, isConnected, dismiss, clearAll, unreadCount, criticalCount };
}
