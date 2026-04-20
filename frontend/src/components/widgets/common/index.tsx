/* ── Common Widget Components ──────────────────────────────────────────────── */

/* ---- WidgetSkeleton.tsx ---- */
export function WidgetSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="widget-skeleton">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="widget-skeleton__row" style={{ width: `${85 - i * 10}%` }} />
      ))}
    </div>
  );
}

/* ---- WidgetErrorState.tsx ---- */
interface WidgetErrorStateProps {
  message?: string;
  onRetry?: () => void;
  partial?: boolean;
}

export function WidgetErrorState({ message, onRetry, partial }: WidgetErrorStateProps) {
  if (partial) {
    return (
      <div className="widget-partial-badge">
        <span className="widget-partial-badge__icon">⚠</span>
        <span>Datos parciales</span>
      </div>
    );
  }
  return (
    <div className="widget-error-state">
      <span className="widget-error-state__icon">⚠</span>
      <span className="widget-error-state__msg">{message ?? 'Error al cargar datos'}</span>
      {onRetry && (
        <button className="btn-secondary widget-error-state__retry" onClick={onRetry}>
          Reintentar
        </button>
      )}
    </div>
  );
}

/* ---- WidgetHeader.tsx ---- */
interface WidgetHeaderProps {
  title: string;
  icon?: string;
  generatedAt?: string | null;
  badge?: React.ReactNode;
}

import React from 'react';

export function WidgetHeader({ title, generatedAt, badge }: WidgetHeaderProps) {
  const ago = generatedAt
    ? Math.round((Date.now() - new Date(generatedAt).getTime()) / 1000)
    : null;

  return (
    <div className="widget-header">
      <span className="widget-header__title">{title}</span>
      <div className="widget-header__meta">
        {badge}
        {ago !== null && (
          <span className="widget-header__ts">
            {ago < 60 ? `${ago}s` : `${Math.round(ago / 60)}m`} ago
          </span>
        )}
      </div>
    </div>
  );
}
