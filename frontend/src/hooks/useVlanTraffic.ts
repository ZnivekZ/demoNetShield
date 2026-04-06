import { useEffect, useRef, useState, useCallback } from 'react';
import type { VlanTrafficData, VlanTrafficWSMessage } from '../types';

/**
 * WebSocket hook for real-time VLAN traffic data.
 * Connects to /ws/vlans/traffic and maintains a 60-sample buffer per VLAN ID.
 */
export function useVlanTraffic(maxHistory = 60) {
  const [isConnected, setIsConnected] = useState(false);
  const [trafficByVlan, setTrafficByVlan] = useState<Record<number, VlanTrafficData[]>>({});
  const [latestTraffic, setLatestTraffic] = useState<VlanTrafficData[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const reconnectAttempts = useRef(0);

  const connect = useCallback(() => {
    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws/vlans/traffic`;
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        setIsConnected(true);
        reconnectAttempts.current = 0;
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as VlanTrafficWSMessage;
          if (msg.type === 'vlan_traffic') {
            const vlans = msg.data.vlans;
            setLatestTraffic(vlans);

            setTrafficByVlan((prev) => {
              const next = { ...prev };
              for (const vt of vlans) {
                const existing = next[vt.vlan_id] ?? [];
                next[vt.vlan_id] = [...existing, vt].slice(-maxHistory);
              }
              return next;
            });
          }
        } catch {
          console.error('Failed to parse VLAN traffic WebSocket message');
        }
      };

      ws.onclose = () => {
        setIsConnected(false);
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
        reconnectAttempts.current++;
        reconnectTimeoutRef.current = setTimeout(connect, delay);
      };

      ws.onerror = () => {
        ws.close();
      };

      wsRef.current = ws;
    } catch {
      const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
      reconnectAttempts.current++;
      reconnectTimeoutRef.current = setTimeout(connect, delay);
    }
  }, [maxHistory]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, [connect]);

  return { isConnected, trafficByVlan, latestTraffic };
}
