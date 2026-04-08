import { useState, useEffect } from 'react';
import { useWebSocket } from './useWebSocket';
import type { PortalSession, PortalSessionWSMessage, PortalErrorWSMessage, PortalChartPoint } from '../types';

export function usePortalSessions() {
  const [sessions, setSessions] = useState<PortalSession[]>([]);
  const [chartHistory, setChartHistory] = useState<PortalChartPoint[]>([]);
  const [error, setError] = useState<string | null>(null);

  const { isConnected, lastMessage } = useWebSocket('/ws/portal/sessions');

  useEffect(() => {
    if (!lastMessage) return;

    try {
      if (lastMessage.type === 'portal_sessions') {
        const portalMsg = lastMessage as unknown as PortalSessionWSMessage;
        setSessions(portalMsg.data.sessions);
        setChartHistory(portalMsg.data.chart_history);
        setError(null);
      } else if (lastMessage.type === 'portal_error') {
        const errorMsg = lastMessage as unknown as PortalErrorWSMessage;
        setError(errorMsg.data.message);
      }
    } catch (e) {
      console.error('Error parsing portal session message:', e);
    }
  }, [lastMessage]);

  return {
    sessions,
    chartHistory,
    isConnected,
    error,
  };
}
