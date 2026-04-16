/**
 * useSecurityAlerts — WebSocket hub for real-time security notifications.
 *
 * Listens to TWO WebSocket endpoints:
 *   /ws/security/alerts   — Wazuh + MikroTik alerts (existing)
 *   /ws/crowdsec/decisions — CrowdSec new decisions (new)
 *
 * Both streams are merged into a single rolling notifications queue.
 * CrowdSec events are normalized into SecurityNotification with
 * type='crowdsec_decision' and actions=['block_ip','view_ip_context'].
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
  const [csConnected,   setCsConnected]   = useState(false);

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

  // ── /ws/crowdsec/decisions handler ───────────────────────────
  const handleCrowdSecMsg = useCallback((raw: string) => {
    try {
      const envelope = JSON.parse(raw) as {
        type: string;
        data: {
          ip?: string;
          scenario?: string;
          type?: string;    // ban | captcha
          duration?: string;
          community_score?: number;
          is_known_attacker?: boolean;
          country?: string;
          decisions?: { ip: string; scenario: string; type: string }[];
          count?: number;
        };
      };

      if (envelope.type !== 'crowdsec_decision') return;

      const d = envelope.data;

      // Batch decision events (stream returns {decisions: [...], count: N})
      const items = d.decisions ?? (d.ip ? [d] : []);

      items.slice(0, 3).forEach((item) => {
        const ip       = item.ip ?? '?';
        const scenario = (item.scenario ?? '').split('/')[1] ?? item.scenario ?? '?';
        const decType  = item.type ?? 'ban';
        const score    = (d as {community_score?: number}).community_score;
        const known    = (d as {is_known_attacker?: boolean}).is_known_attacker;
        const country  = (d as {country?: string}).country ?? '';

        const level: SecurityNotification['level'] =
          known ? 'critical' : (score != null && score >= 71 ? 'high' : 'medium');

        push({
          type:    'crowdsec_decision',
          level,
          title:   `CrowdSec: ${decType.toUpperCase()} aplicado`,
          detail:  `${ip}${country ? ` (${country})` : ''} — ${scenario}`,
          actions: ['block_ip', 'view_ip_context'],
          data:    { src_ip: ip, scenario: item.scenario ?? '', decision_type: decType, community_score: score ?? 0 },
          id:      makeId('crowdsec_decision'),
          receivedAt: new Date().toISOString(),
        });
      });
    } catch { /* malformed — ignore */ }
  }, [push]);

  // ── Wire up both WebSockets ───────────────────────────────────
  const sec = useReconnectingWS('/ws/security/alerts',   handleSecurityMsg, setIsConnected);
  const cs  = useReconnectingWS('/ws/crowdsec/decisions', handleCrowdSecMsg, setCsConnected);

  useEffect(() => {
    sec.connect();
    cs.connect();
    return () => {
      clearTimeout(sec.timerRef.current);
      clearTimeout(cs.timerRef.current);
      sec.wsRef.current?.close();
      cs.wsRef.current?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dismiss  = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  const clearAll = useCallback(() => setNotifications([]), []);

  const unreadCount   = notifications.length;
  const criticalCount = notifications.filter(n => n.level === 'critical').length;
  const crowdsecCount = notifications.filter(n => n.type === 'crowdsec_decision').length;

  return {
    notifications,
    isConnected,
    csConnected,
    dismiss,
    clearAll,
    unreadCount,
    criticalCount,
    crowdsecCount,
  };
}
