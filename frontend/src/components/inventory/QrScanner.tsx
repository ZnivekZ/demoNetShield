/**
 * QrScanner — Camera-based QR code scanner for GLPI asset lookup.
 * Uses the useQrScanner hook which wraps html5-qrcode.
 */
import { useEffect } from 'react';
import { X, QrCode, Camera } from 'lucide-react';
import { useQrScanner, type QrScanResult } from '../../hooks/useQrScanner';

interface Props {
  onResult: (result: QrScanResult) => void;
  onClose: () => void;
}

export function QrScanner({ onResult, onClose }: Props) {
  const { status, result, error, isScanning, startScanning, stopScanning, reset } = useQrScanner('qr-reader');

  // Auto-start when mounted
  useEffect(() => {
    startScanning();
    return () => { stopScanning(); };
  }, [startScanning, stopScanning]);

  // Propagate result
  useEffect(() => {
    if (result) {
      onResult(result);
    }
  }, [result, onResult]);

  return (
    <div className="confirm-modal-overlay">
      <div className="confirm-modal animate-fade-in-up" style={{ maxWidth: 400 }}>
        {/* Header */}
        <div className="confirm-modal__header">
          <div className="confirm-modal__icon" style={{ color: 'var(--color-brand-400)' }}>
            <QrCode size={18} />
          </div>
          <h3 className="confirm-modal__title">Escanear Código QR</h3>
          <button className="confirm-modal__close" onClick={() => { stopScanning(); onClose(); }}>
            <X size={15} />
          </button>
        </div>

        <div className="confirm-modal__body">
          <p style={{ fontSize: '0.8rem', color: 'var(--color-surface-400)', marginBottom: '1rem' }}>
            Apuntá la cámara al código QR del equipo. Formatos aceptados:
            <br /><code style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--color-brand-400)' }}>GLPI-123</code>,{' '}
            número de ID, o número de serial.
          </p>

          {/* Camera viewfinder */}
          <div style={{
            width: '100%',
            aspectRatio: '1',
            background: 'rgba(0,0,0,0.4)',
            borderRadius: 12,
            overflow: 'hidden',
            position: 'relative',
            border: `2px solid ${isScanning ? 'var(--color-brand-500)' : 'rgba(148,163,184,0.2)'}`,
          }}>
            <div id="qr-reader" style={{ width: '100%', height: '100%' }} />

            {/* Scanning overlay grid */}
            {isScanning && (
              <div style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                pointerEvents: 'none',
              }}>
                <div style={{
                  width: 160,
                  height: 160,
                  border: '2px solid var(--color-brand-400)',
                  borderRadius: 8,
                  boxShadow: '0 0 0 2000px rgba(0,0,0,0.3)',
                }} />
              </div>
            )}

            {/* Error state */}
            {status === 'error' && (
              <div style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.75rem',
                color: '#fca5a5',
                fontSize: '0.82rem',
                padding: '1rem',
                textAlign: 'center',
              }}>
                <Camera size={32} style={{ opacity: 0.5 }} />
                <span>{error || 'No se pudo acceder a la cámara'}</span>
                <button className="btn btn-primary" style={{ fontSize: '0.75rem' }} onClick={reset}>
                  Reintentar
                </button>
              </div>
            )}
          </div>

          {/* Status indicator */}
          <div style={{ marginTop: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.78rem', color: 'var(--color-surface-400)' }}>
            {isScanning && <span className="loading-spinner" style={{ width: 12, height: 12 }} />}
            {isScanning && 'Escaneando…'}
            {status === 'success' && <span style={{ color: '#86efac' }}>✓ QR detectado</span>}
            {status === 'idle' && 'Cámara lista'}
          </div>
        </div>

        <div className="confirm-modal__actions">
          <button
            className="btn btn-ghost"
            onClick={() => { stopScanning(); onClose(); }}
          >
            Cancelar
          </button>
          {isScanning && (
            <button className="btn btn-ghost" onClick={stopScanning}>
              Pausar
            </button>
          )}
          {!isScanning && status !== 'error' && (
            <button className="btn btn-primary" onClick={startScanning}>
              Iniciar cámara
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
