/**
 * BulkImportModal — CSV import for multiple hotspot users.
 * Parses CSV, shows preview, and calls bulkCreateUsers mutation.
 * Report shows per-user success/failure after creation.
 */
import { useState } from 'react';
import { X, Upload, AlertTriangle, CheckCircle } from 'lucide-react';
import { useBulkCreatePortalUsers } from '../../hooks/usePortalUsers';
import type { PortalUserCreate, BulkCreateResult } from '../../types';

interface BulkImportModalProps {
  onClose: () => void;
}

const CSV_EXAMPLE = `nombre,contraseña,perfil,mac,comentario
juan.perez,pass123,registered,,Juan Pérez
maria.gomez,pass456,registered,AA:BB:CC:DD:EE:FF,María Gómez
invitado1,inv2024,registered,,Invitado temporal`;

function parseCsv(raw: string): PortalUserCreate[] {
  const lines = raw.trim().split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];
  // Skip header
  return lines.slice(1).map(line => {
    const parts = line.split(',').map(p => p.trim());
    return {
      name: parts[0] || '',
      password: parts[1] || '',
      profile: parts[2] || 'registered',
      mac_address: parts[3] || undefined,
      comment: parts[4] || undefined,
    };
  }).filter(u => u.name && u.password);
}

export function BulkImportModal({ onClose }: BulkImportModalProps) {
  const [csv, setCsv] = useState('');
  const [result, setResult] = useState<BulkCreateResult | null>(null);
  const bulkCreate = useBulkCreatePortalUsers();

  const parsed = parseCsv(csv);
  const isReady = parsed.length > 0;

  const handleImport = () => {
    bulkCreate.mutate(parsed, {
      onSuccess: (res) => {
        if (res.data) setResult(res.data);
      },
    });
  };

  return (
    <div className="confirm-modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="confirm-modal portal-bulk-modal animate-fade-in-up">
        <div className="confirm-modal__header">
          <h3 className="confirm-modal__title">Importar usuarios (CSV)</h3>
          <button className="confirm-modal__close" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="confirm-modal__body">
          {!result ? (
            <>
              <p className="confirm-modal__description">
                Pegá un CSV con las columnas: <code>nombre, contraseña, perfil, mac (opcional), comentario (opcional)</code>
              </p>

              <div className="portal-csv-example">
                <span className="portal-csv-label">Ejemplo:</span>
                <pre className="portal-csv-pre">{CSV_EXAMPLE}</pre>
              </div>

              <textarea
                className="portal-bulk-textarea"
                placeholder="Pegá el CSV acá…"
                value={csv}
                onChange={e => setCsv(e.target.value)}
                rows={8}
              />

              {isReady && (
                <div className="portal-bulk-preview">
                  <CheckCircle size={14} style={{ color: 'var(--color-success)' }} />
                  <span>{parsed.length} usuario{parsed.length !== 1 ? 's' : ''} detectado{parsed.length !== 1 ? 's' : ''}</span>
                  <div className="portal-bulk-preview-list">
                    {parsed.slice(0, 5).map(u => (
                      <span key={u.name} className="portal-bulk-tag">{u.name}</span>
                    ))}
                    {parsed.length > 5 && (
                      <span className="portal-bulk-tag">+{parsed.length - 5} más</span>
                    )}
                  </div>
                </div>
              )}

              {csv && !isReady && (
                <div className="portal-bulk-preview portal-bulk-preview--warn">
                  <AlertTriangle size={14} />
                  <span>No se detectaron usuarios válidos. Verificá el formato.</span>
                </div>
              )}
            </>
          ) : (
            /* Result screen */
            <div className="portal-bulk-result">
              <div className="portal-bulk-result-header">
                {result.failed_count === 0 ? (
                  <CheckCircle size={24} style={{ color: 'var(--color-success)' }} />
                ) : (
                  <AlertTriangle size={24} style={{ color: 'var(--color-warning)' }} />
                )}
                <div>
                  <p className="portal-bulk-result-title">
                    {result.success_count}/{result.total} usuarios creados
                  </p>
                  {result.failed_count > 0 && (
                    <p className="portal-bulk-result-subtitle">
                      {result.failed_count} error{result.failed_count !== 1 ? 'es' : ''}
                    </p>
                  )}
                </div>
              </div>

              {result.errors.length > 0 && (
                <div className="portal-bulk-errors">
                  <p className="portal-form-label">Usuarios con error:</p>
                  {result.errors.map(e => (
                    <div key={e.username} className="portal-bulk-error-row">
                      <span className="portal-bulk-tag portal-bulk-tag--error">{e.username}</span>
                      <span className="portal-form-hint">{e.error}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="confirm-modal__actions">
          <button className="btn btn-ghost" onClick={onClose}>
            {result ? 'Cerrar' : 'Cancelar'}
          </button>
          {!result && (
            <button
              className="btn btn-primary"
              onClick={handleImport}
              disabled={!isReady || bulkCreate.isPending}
            >
              {bulkCreate.isPending
                ? <span className="loading-spinner" />
                : <><Upload size={14} /> Importar {parsed.length} usuario{parsed.length !== 1 ? 's' : ''}</>
              }
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
