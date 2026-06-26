import type { APIResponse } from '../types';

export function requireApiSuccess<T>(response: APIResponse<T>, fallback = 'Error en la solicitud'): T {
  if (!response.success) {
    throw new Error(response.error || fallback);
  }

  if (response.data == null) {
    throw new Error('La API respondio sin datos');
  }

  return response.data;
}

export function getApiErrorMessage(error: unknown, fallback = 'Error desconocido'): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === 'object' && error !== null) {
    const candidate = error as {
      response?: { data?: { error?: unknown; detail?: unknown } };
      message?: unknown;
    };

    const apiError = candidate.response?.data?.error ?? candidate.response?.data?.detail;
    if (typeof apiError === 'string' && apiError) {
      return apiError;
    }

    if (typeof candidate.message === 'string' && candidate.message) {
      return candidate.message;
    }
  }

  return fallback;
}
