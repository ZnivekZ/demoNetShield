/**
 * Cliente HTTP del portal público (`/soporte`).
 *
 * Deliberadamente **sin** el interceptor de JWT ni el redirect a /login:
 * estas rutas se usan sin autenticación.
 */
import axios from 'axios';
import type { APIResponse } from '../types';

const publicApi = axios.create({ baseURL: '/api/public', timeout: 30_000 });

export type PublicCategory = 'red' | 'hardware' | 'so' | 'seguridad';

export interface PublicTicketPayload {
  email: string;
  title: string;
  description: string;
  category?: PublicCategory;
  priority?: number;
  equipment?: string;
  /** Honeypot: siempre vacío en humanos. */
  website?: string;
}

export interface PublicTicketCreated {
  ticket_id: number;
  message: string;
}

export interface PublicTicketStatus {
  ticket_id: number;
  title: string;
  status: number;
  status_label: string;
  created_at?: string | null;
  updated_at?: string | null;
  attachment?: string | null;
}

export const publicTicketsApi = {
  create: (payload: PublicTicketPayload) =>
    publicApi.post<APIResponse<PublicTicketCreated>>('/tickets', payload).then((r) => r.data),

  status: (ticketId: number, email: string) =>
    publicApi
      .get<APIResponse<PublicTicketStatus>>(`/tickets/${ticketId}`, { params: { email } })
      .then((r) => r.data),

  attach: (ticketId: number, email: string, file: File) => {
    const form = new FormData();
    form.append('email', email);
    form.append('file', file);
    return publicApi
      .post<APIResponse<{ ticket_id: number; attachment: string }>>(`/tickets/${ticketId}/attachment`, form)
      .then((r) => r.data);
  },
};

/** Traduce errores de FastAPI (`detail`) a un mensaje para el usuario. */
export function publicErrorMessage(err: unknown): string {
  const e = err as { response?: { status?: number; data?: { detail?: unknown } } };
  const detail = e.response?.data?.detail;
  if (typeof detail === 'string' && detail) return detail;
  if (Array.isArray(detail) && detail.length) return 'Revisá los datos del formulario.';
  if (e.response?.status === 429) return 'Demasiadas solicitudes. Esperá unos minutos.';
  return 'No pudimos completar la solicitud. Intentá de nuevo.';
}
