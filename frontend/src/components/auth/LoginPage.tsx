/**
 * LoginPage — Pantalla de autenticación del dashboard NetShield.
 *
 * Diseño coherente con el design system del proyecto:
 * - Fondo oscuro con gradiente brand
 * - Card central con glassmorphism (glass-card)
 * - Inputs y botones del design system (input, btn-primary)
 * - Animación de shake en error, fade-in en carga
 * - Respeta data-theme (temas claro/oscuro)
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { useAuthContext } from './AuthContext';

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
    <div
      className="min-h-screen flex items-center justify-center relative overflow-hidden"
      style={{ background: 'var(--color-surface-950, #050508)' }}
    >
      {/* Ambient background gradient */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 80% 60% at 50% -10%, color-mix(in srgb, var(--color-brand-600, #4f46e5) 18%, transparent), transparent)',
        }}
      />

      {/* Grid pattern subtle overlay */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage:
            'linear-gradient(var(--color-surface-600, #475569) 1px, transparent 1px), linear-gradient(90deg, var(--color-surface-600, #475569) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />

      {/* Login Card */}
      <div
        className={`glass-card relative z-10 w-full max-w-md mx-4 p-8 animate-fade-in-up ${
          shake ? 'animate-shake' : ''
        }`}
        style={{
          '--tw-shadow':
            '0 25px 50px -12px rgba(0,0,0,0.5), 0 0 0 1px rgba(99,102,241,0.1)',
          boxShadow: 'var(--tw-shadow)',
        } as React.CSSProperties}
      >
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4 shadow-lg"
            style={{
              background: 'linear-gradient(135deg, var(--color-brand-500, #6366f1), var(--color-brand-700, #4338ca))',
              boxShadow: '0 8px 32px -8px rgba(99,102,241,0.5)',
            }}
          >
            <Shield className="w-8 h-8 text-white" />
          </div>
          <h1
            className="text-2xl font-bold tracking-tight"
            style={{ color: 'var(--color-surface-50, #f8fafc)' }}
          >
            NetShield
          </h1>
          <p
            className="text-sm mt-1 font-medium tracking-widest uppercase"
            style={{ color: 'var(--color-surface-400, #94a3b8)' }}
          >
            Security Dashboard
          </p>
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
                {showPassword ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
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
        <p
          className="text-center text-xs mt-6"
          style={{ color: 'var(--color-surface-600, #475569)' }}
        >
          NetShield Dashboard · Lab environment
        </p>
      </div>

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
