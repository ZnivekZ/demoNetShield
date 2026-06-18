/**
 * ProtectedRoute — Guard que redirige al login si no hay sesión activa.
 *
 * Uso en App.tsx:
 *   <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
 *     ...rutas protegidas...
 *   </Route>
 */

import { Navigate } from 'react-router-dom';
import { useAuthContext } from './AuthContext';

function FullScreenSpinner() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-surface-950">
      <div className="flex flex-col items-center gap-4">
        <div className="loading-spinner w-10 h-10" />
        <p className="text-surface-400 text-sm">Verificando sesión...</p>
      </div>
    </div>
  );
}

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading } = useAuthContext();

  if (isLoading) {
    return <FullScreenSpinner />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
