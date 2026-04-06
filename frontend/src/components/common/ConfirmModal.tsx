/**
 * ConfirmModal — Global confirmation dialog for all destructive actions.
 * Used before: block IP, sinkhole domain, quarantine, geo-block, unblock.
 *
 * Features:
 * - Displays action title, description, and key data summary
 * - 2-second countdown before the confirm button becomes active
 * - Danger (red) vs Warning (amber) variants
 * - Click-outside and ESC to dismiss
 */
import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, ShieldAlert, X } from 'lucide-react';

export interface ConfirmModalProps {
  title: string;
  description: string;
  data?: Record<string, string | number>;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning';
  onConfirm: () => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export function ConfirmModal({
  title,
  description,
  data,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  variant = 'danger',
  onConfirm,
  onCancel,
  isLoading = false,
}: ConfirmModalProps) {
  const [countdown, setCountdown] = useState(2);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Countdown timer before confirm becomes active
  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  // ESC key to cancel
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onCancel]);

  const isDanger = variant === 'danger';
  const accentColor = isDanger ? 'rgba(239,68,68,0.3)' : 'rgba(245,158,11,0.3)';
  const btnClass = isDanger ? 'btn btn-danger' : 'btn';
  const Icon = isDanger ? ShieldAlert : AlertTriangle;
  const ready = countdown === 0 && !isLoading;

  return (
    <div
      ref={overlayRef}
      className="confirm-modal-overlay"
      onClick={e => { if (e.target === overlayRef.current) onCancel(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
    >
      <div className="confirm-modal animate-fade-in-up">
        {/* Header */}
        <div className="confirm-modal__header" style={{ borderBottomColor: accentColor }}>
          <div className="confirm-modal__icon" style={{ color: isDanger ? 'var(--color-danger)' : 'var(--color-warning)' }}>
            <Icon size={20} />
          </div>
          <h3 id="confirm-modal-title" className="confirm-modal__title">{title}</h3>
          <button className="confirm-modal__close" onClick={onCancel} aria-label="Cerrar">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="confirm-modal__body">
          <p className="confirm-modal__description">{description}</p>

          {data && Object.keys(data).length > 0 && (
            <div className="confirm-modal__data">
              {Object.entries(data).map(([k, v]) => (
                <div key={k} className="confirm-modal__data-row">
                  <span className="confirm-modal__data-key">{k}</span>
                  <span className="confirm-modal__data-val">{String(v)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="confirm-modal__actions">
          <button className="btn btn-ghost" onClick={onCancel} disabled={isLoading}>
            {cancelLabel}
          </button>
          <button
            id="confirm-modal-btn"
            className={`${btnClass} countdown-btn`}
            onClick={onConfirm}
            disabled={!ready}
            style={!isDanger ? { background: 'linear-gradient(135deg,#b45309,#d97706)', color: '#fff' } : undefined}
          >
            {isLoading
              ? <span className="loading-spinner" />
              : countdown > 0
                ? `${confirmLabel} (${countdown}s)`
                : confirmLabel
            }
          </button>
        </div>
      </div>
    </div>
  );
}
