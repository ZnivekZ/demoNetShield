/**
 * AuthContext — Proveedor global del estado de autenticación NetShield.
 *
 * Envuelve la app para que cualquier componente pueda acceder a:
 *   const { user, isAuthenticated, isLoading, login, logout, error } = useAuthContext();
 */

import { createContext, useContext, type ReactNode } from 'react';
import { useAuth, type UseAuthReturn } from '../../hooks/useAuth';

const AuthContext = createContext<UseAuthReturn | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
}

export function useAuthContext(): UseAuthReturn {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuthContext debe usarse dentro de <AuthProvider>');
  }
  return ctx;
}
