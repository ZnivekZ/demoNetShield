/**
 * Time utility helpers shared across components.
 */

export function formatDistanceToNow(isoTimestamp: string): string {
  if (!isoTimestamp) return '';
  try {
    const ts = new Date(isoTimestamp.replace('+0000', 'Z'));
    const diff = Date.now() - ts.getTime();
    if (diff < 60_000) return 'ahora';
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
    return `${Math.floor(diff / 86_400_000)}d`;
  } catch {
    return '';
  }
}

export function formatTime(isoTimestamp: string): string {
  if (!isoTimestamp) return '';
  try {
    const ts = new Date(isoTimestamp.replace('+0000', 'Z'));
    return ts.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return isoTimestamp;
  }
}

export function formatDateTime(isoTimestamp: string): string {
  if (!isoTimestamp) return '';
  try {
    const ts = new Date(isoTimestamp.replace('+0000', 'Z'));
    return ts.toLocaleString('es-AR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return isoTimestamp;
  }
}

export function severityClass(level: number): string {
  if (level >= 12) return 'critical';
  if (level >= 8) return 'high';
  if (level >= 5) return 'medium';
  return 'low';
}
