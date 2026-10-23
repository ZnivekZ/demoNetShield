/**
 * LoginPage — Pantalla de autenticación del dashboard NetShield.
 *
 * Layout: split-screen. Panel visual (LoginVisual: red animada + marca) y el
 * formulario de acceso a la derecha. La lógica de auth no cambió.
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { useAuthContext } from './AuthContext';
import { LoginVisual } from './LoginVisual';

export default function LoginPage() {
  const { login, isLoading, isAuthenticated, error } = useAuthContext();
  const navigate = useNavigate();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [shake, setShake] = useState(false);

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  // Shake animation on error
  useEffect(() => {
    if (error) {
      setShake(true);
      const t = setTimeout(() => setShake(false), 500);
      return () => clearTimeout(t);
    }
  }, [error]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) return;
    await login(username.trim(), password);
  };

  return (
    <div className="login-shell">
      <LoginVisual />

      <main className="login-pane">
        <div className={`login-card animate-fade-in-up ${shake ? 'animate-shake' : ''}`}>
          {/* Logo */}
          <div className="login-card__head">
            <div className="login-card__mark">
              <Shield size={26} />
            </div>
            <h1 className="login-card__title">NetShield</h1>
            <p className="login-card__sub">Acceso al panel</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {/* Username */}
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="login-username"
                className="text-xs font-semibold tracking-wider uppercase"
                style={{ color: 'var(--color-surface-400, #94a3b8)' }}
              >
                Usuario
              </label>
              <input
                id="login-username"
                type="text"
                autoComplete="username"
                autoFocus
                className="input"
                placeholder="admin"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={isLoading}
              />
            </div>

            {/* Password */}
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="login-password"
                className="text-xs font-semibold tracking-wider uppercase"
                style={{ color: 'var(--color-surface-400, #94a3b8)' }}
              >
                Contraseña
              </label>
              <div className="relative">
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  className="input w-full pr-10"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-200 transition-colors"
                  tabIndex={-1}
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Error message */}
            {error && (
              <div
                className="flex items-start gap-2 px-3 py-2.5 rounded-lg animate-fade-in-up"
                style={{
                  background: 'color-mix(in srgb, var(--color-danger, #ef4444) 12%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--color-danger, #ef4444) 30%, transparent)',
                  color: 'var(--color-danger, #ef4444)',
                }}
              >
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span className="text-sm">{error}</span>
              </div>
            )}

            {/* Submit */}
            <button
              id="login-submit-btn"
              type="submit"
              className="btn btn-primary mt-2"
              disabled={isLoading || !username.trim() || !password.trim()}
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="loading-spinner w-4 h-4" />
                  Iniciando sesión...
                </span>
              ) : (
                'Iniciar sesión'
              )}
            </button>
          </form>

          {/* Footer */}
          <p className="login-card__foot">
            NetShield · Universidad Nacional de Mar del Plata
          </p>
        </div>
      </main>

      {/* Shake keyframe via style tag */}
      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          15% { transform: translateX(-6px); }
          30% { transform: translateX(6px); }
          45% { transform: translateX(-4px); }
          60% { transform: translateX(4px); }
          75% { transform: translateX(-2px); }
          90% { transform: translateX(2px); }
        }
        .animate-shake { animation: shake 0.5s ease-in-out; }
      `}</style>
    </div>
  );
}
