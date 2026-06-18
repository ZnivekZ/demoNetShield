/**
 * useAuth — Gestión del estado de autenticación del dashboard NetShield.
 *
 * - Al montar: si hay token en localStorage, valida con GET /api/auth/me
 * - login(username, password): guarda token y user en localStorage
 * - logout(): limpia localStorage y redirige a /login
 *
 * Usa useState + useEffect directamente (no TanStack Query).
 * Razón: el estado de auth es global y no debe ser invalidado por refetch
 * automático ni por window focus. El interceptor de Axios en api.ts
 * maneja la expiración del token de forma imperativa (redirect + clear).
 */

import { useState, useEffect, useCallback } from 'react';
import { authApi } from '../services/api';
import type { AuthUser } from '../types';

export interface UseAuthReturn {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  error: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

export function useAuth(): UseAuthReturn {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Validate existing token on mount ───────────────────────────────────────
  useEffect(() => {
    const token = localStorage.getItem('netshield_token');
    if (!token) {
      setIsLoading(false);
      return;
    }

    authApi
      .me()
      .then((res) => {
        if (res.success && res.data) {
          setUser(res.data);
          localStorage.setItem('netshield_user', JSON.stringify(res.data));
        } else {
          // Token invalid or expired
          localStorage.removeItem('netshield_token');
          localStorage.removeItem('netshield_user');
        }
      })
      .catch(() => {
        // 401 handled by Axios interceptor — will redirect to /login
        localStorage.removeItem('netshield_token');
        localStorage.removeItem('netshield_user');
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  // ── Login ──────────────────────────────────────────────────────────────────
  const login = useCallback(async (username: string, password: string) => {
    setError(null);
    setIsLoading(true);

    try {
      // POST /api/auth/login returns TokenResponse directly (not wrapped in APIResponse)
      const tokenData = await authApi.login({ username, password });
      localStorage.setItem('netshield_token', tokenData.access_token);

      // Fetch user profile with the new token
      const meRes = await authApi.me();
      if (meRes.success && meRes.data) {
        setUser(meRes.data);
        localStorage.setItem('netshield_user', JSON.stringify(meRes.data));
      }
    } catch (err: unknown) {
      // Extract error message from Axios response
      const axiosError = err as { response?: { data?: { detail?: string } } };
      const message =
        axiosError?.response?.data?.detail ||
        'Error de conexión. Verificá que el backend esté corriendo.';
      setError(message);
      localStorage.removeItem('netshield_token');
      localStorage.removeItem('netshield_user');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // ── Logout ────────────────────────────────────────────────────────────────
  const logout = useCallback(() => {
    authApi.logout().catch(() => {}); // Fire and forget — stateless logout
    localStorage.removeItem('netshield_token');
    localStorage.removeItem('netshield_user');
    setUser(null);
    setError(null);
    window.location.href = '/login';
  }, []);

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    error,
    login,
    logout,
  };
}
