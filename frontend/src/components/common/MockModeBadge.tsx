import { useQuery } from '@tanstack/react-query';
import { FlaskConical } from 'lucide-react';
import { systemApi } from '../../services/api';
import type { MockStatus } from '../../types';

/**
 * MockModeBadge — aparece en el topbar cuando uno o más servicios están en modo mock.
 * Muestra un tooltip con el detalle de qué servicios están simulados.
 *
 * Polling: cada 30 s, sin suspense ni errores visibles si el endpoint no responde
 * (el badge simplemente no se muestra).
 */
export function MockModeBadge() {
  const { data } = useQuery<MockStatus>({
    queryKey: ['mock-status'],
    queryFn: async () => {
      const res = await systemApi.getMockStatus();
      return res.data as MockStatus;
    },
    refetchInterval: 30_000,
    retry: false,
    // No propagate errors al UI — si el backend no responde simplemente no mostramos el badge
    throwOnError: false,
  });

  if (!data?.any_mock_active) return null;

  const active = Object.entries(data.services)
    .filter(([, v]) => v)
    .map(([k]) => k.toUpperCase());

  const isMockAll = data.mock_all;

  return (
    <div
      className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold cursor-default select-none"
      style={{
        background: 'rgba(234, 179, 8, 0.12)',
        border: '1px solid rgba(234, 179, 8, 0.35)',
        color: '#eab308',
      }}
      title={
        isMockAll
          ? 'MOCK ALL — todos los servicios externos están simulados (sin infraestructura real)'
          : `Servicios en mock: ${active.join(', ')}`
      }
    >
      <FlaskConical className="w-3.5 h-3.5" />
      <span>{isMockAll ? 'MOCK ALL' : `MOCK: ${active.join(' · ')}`}</span>
    </div>
  );
}
