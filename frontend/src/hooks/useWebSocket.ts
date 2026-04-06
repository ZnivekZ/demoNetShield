import { useEffect, useRef, useState, useCallback } from 'react';
import type { WSMessage, TrafficData } from '../types';

/**
 * Custom hook for WebSocket connection with automatic reconnection.
 * Provides connection state and latest data.
 */
export function useWebSocket(url: string) {
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<WSMessage | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const reconnectAttempts = useRef(0);

  const connect = useCallback(() => {
    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}${url}`;
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        setIsConnected(true);
        reconnectAttempts.current = 0;
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as WSMessage;
          setLastMessage(data);
        } catch {
          console.error('Failed to parse WebSocket message');
        }
      };

      ws.onclose = () => {
        setIsConnected(false);
        // Exponential backoff reconnection
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
        reconnectAttempts.current++;
        reconnectTimeoutRef.current = setTimeout(connect, delay);
      };

      ws.onerror = () => {
        ws.close();
      };

      wsRef.current = ws;
    } catch {
      // Connection failed, retry
      const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
      reconnectAttempts.current++;
      reconnectTimeoutRef.current = setTimeout(connect, delay);
    }
  }, [url]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, [connect]);

  return { isConnected, lastMessage };
}

/**
 * Hook for real-time traffic data with history tracking for charts.
 */
export function useTrafficStream(maxHistory = 30) {
  const { isConnected, lastMessage } = useWebSocket('/ws/traffic');
  const [trafficHistory, setTrafficHistory] = useState<
    { timestamp: string; traffic: TrafficData[] }[]
  >([]);
  const [activeConnections, setActiveConnections] = useState(0);

  useEffect(() => {
    if (lastMessage?.type === 'traffic') {
      const { traffic, active_connections, timestamp } = lastMessage.data;
      setActiveConnections(active_connections);
      setTrafficHistory((prev) => {
        const next = [...prev, { timestamp, traffic }];
        return next.slice(-maxHistory);
      });
    }
  }, [lastMessage, maxHistory]);

  return { isConnected, trafficHistory, activeConnections };
}
