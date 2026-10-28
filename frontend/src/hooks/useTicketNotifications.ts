/**
 * useTicketNotifications — tickets nuevos de GLPI como notificaciones.
 *
 * El WebSocket `/ws/security/alerts` sólo transporta alertas, así que los
 * tickets se detectan por polling (60 s) diferenciando contra los IDs ya
 * vistos (localStorage). La primera carga sólo fija la línea base: no notifica
 * los tickets que ya existían.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { glpiApi } from '../services/api';

const SEEN_KEY = 'netshield_seen_ticket_ids';
const MAX_SEEN = 500;
const MAX_VISIBLE = 50;

export interface TicketNotification {
  id: string;
  ticketId: number;
  title: string;
  priority: number;
  status: string;
  createdAt: string;
  receivedAt: string;
}

function loadSeen(): Set<number> | null {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? new Set(parsed.filter((n): n is number => typeof n === 'number')) : null;
  } catch {
    return null;
  }
}

function saveSeen(ids: Set<number>) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify([...ids].slice(-MAX_SEEN)));
  } catch {
    /* storage lleno o bloqueado: peor caso, se repite el aviso */
  }
}

export function useTicketNotifications() {
  const [notifications, setNotifications] = useState<TicketNotification[]>([]);
  const seenRef = useRef<Set<number> | null>(loadSeen());

  const { data } = useQuery({
    queryKey: ['glpi', 'tickets', 'notifications'],
    queryFn: () => glpiApi.getTickets({ limit: 50 }),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  useEffect(() => {
    const list = data?.data?.tickets ?? [];
    if (!list.length) return;

    const known = seenRef.current;
    if (known === null) {
      // Primera vez: todo lo que ya existe es la línea base.
      const baseline = new Set(list.map((t) => t.id));
      seenRef.current = baseline;
      saveSeen(baseline);
      return;
    }

    const fresh = list.filter((t) => !known.has(t.id));
    if (!fresh.length) return;

    fresh.forEach((t) => known.add(t.id));
    saveSeen(known);

    const now = new Date().toISOString();
    const items: TicketNotification[] = fresh.map((t) => ({
      id: `tk-${t.id}`,
      ticketId: t.id,
      title: t.title || `Ticket #${t.id}`,
      priority: t.priority ?? 3,
      status: t.status ?? 'pendiente',
      createdAt: t.created_at ?? now,
      receivedAt: now,
    }));

    setNotifications((prev) => {
      const ids = new Set(items.map((i) => i.id));
      return [...items, ...prev.filter((p) => !ids.has(p.id))].slice(0, MAX_VISIBLE);
    });
  }, [data]);

  const dismiss = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const clearAll = useCallback(() => setNotifications([]), []);

  return { notifications, dismiss, clearAll, count: notifications.length };
}
