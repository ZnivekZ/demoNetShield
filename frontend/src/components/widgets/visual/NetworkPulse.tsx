import { useEffect, useRef, useState } from 'react';
import { useNetworkPulse } from '../../../hooks/widgets/visual';
import { WidgetSkeleton, WidgetErrorState } from '../common';
import type { TrafficData } from '../../../types';

interface NetworkPulseProps {
  config?: { interface?: string };
}

/**
 * Visualización ECG animada del tráfico de red.
 * Dibuja una línea SVG que se anima de derecha a izquierda.
 * Se respeta prefers-reduced-motion desactivando la animación.
 */
export function NetworkPulse({ config }: NetworkPulseProps) {
  const { data, isLoading, error } = useNetworkPulse();
  const svgRef = useRef<SVGSVGElement>(null);
  const [points, setPoints] = useState<number[]>(Array(60).fill(50));
  const [reducedMotion] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );

  const iface = config?.interface ?? 'ether1';

  useEffect(() => {
    if (!data) return;
    const trafficList = data as TrafficData[];
    const ifaceData = trafficList.find(d => d.interface === iface) ?? trafficList[0];
    if (!ifaceData) return;
    // TrafficData uses rx_bytes_per_sec, normalize to 0-100 assuming max 100 Mbps
    const rxBps = ifaceData.rx_bytes_per_sec * 8; // bytes -> bits
    const normalized = Math.min(100, Math.round((rxBps / 100_000_000) * 100));
    setPoints(prev => {
      const next = [...prev.slice(1), 50 + normalized * 0.4];
      return next;
    });
  }, [data, iface]);

  if (isLoading) return <WidgetSkeleton rows={2} />;
  if (error) return <WidgetErrorState message="Sin datos de tráfico" />;

  const W = 300, H = 80;
  const pointsStr = points
    .map((y, i) => `${(i / (points.length - 1)) * W},${H - y * 0.7}`)
    .join(' ');

  const rxBps = (() => {
    if (!data) return 0;
    const trafficList = data as TrafficData[];
    const ifd = trafficList.find(d => d.interface === iface) ?? trafficList[0];
    return (ifd?.rx_bytes_per_sec ?? 0) * 8;
  })();

  return (
    <div className="widget-network-pulse">
      <div className="widget-network-pulse__header">
        <span className="widget-network-pulse__iface">{iface}</span>
        <span className="widget-network-pulse__bps">
          {rxBps >= 1_000_000
            ? `${(rxBps / 1_000_000).toFixed(1)} Mbps`
            : `${(rxBps / 1_000).toFixed(0)} kbps`}
        </span>
      </div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="widget-network-pulse__svg"
        aria-hidden="true"
        style={{ overflow: 'hidden' }}
      >
        <defs>
          <linearGradient id="pulse-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-accent, #3b82f6)" stopOpacity="0.6" />
            <stop offset="100%" stopColor="var(--color-accent, #3b82f6)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <polyline
          points={pointsStr}
          fill="none"
          stroke="var(--color-accent, #3b82f6)"
          strokeWidth="2"
          strokeLinejoin="round"
          className={reducedMotion ? '' : 'widget-network-pulse__line'}
        />
      </svg>
    </div>
  );
}
