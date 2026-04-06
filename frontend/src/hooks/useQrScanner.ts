/**
 * useQrScanner — Hook for QR code scanning using html5-qrcode.
 * Manages camera lifecycle (start/stop) and parsed QR data.
 * Supports scanning asset serial numbers or GLPI asset IDs.
 */
import { useState, useCallback, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

export type QrScanStatus = 'idle' | 'scanning' | 'success' | 'error';

export interface QrScanResult {
  raw: string;
  assetId: number | null;  // Parsed GLPI ID if QR contains numeric or "GLPI-NNN" format
  serial: string | null;   // Serial number if QR is alphanumeric
}

function parseQrResult(raw: string): QrScanResult {
  const trimmed = raw.trim();
  // Format: "GLPI-123" or "glpi:123"
  const glpiMatch = trimmed.match(/^(?:GLPI[-:]?)(\d+)$/i);
  if (glpiMatch) {
    return { raw: trimmed, assetId: parseInt(glpiMatch[1], 10), serial: null };
  }
  // Pure number = GLPI ID
  if (/^\d+$/.test(trimmed)) {
    return { raw: trimmed, assetId: parseInt(trimmed, 10), serial: null };
  }
  // Anything else = serial number
  return { raw: trimmed, assetId: null, serial: trimmed };
}

export function useQrScanner(containerId: string = 'qr-scanner-container') {
  const [status, setStatus] = useState<QrScanStatus>('idle');
  const [result, setResult] = useState<QrScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);

  const startScanning = useCallback(async () => {
    setError(null);
    setResult(null);
    setStatus('scanning');

    try {
      const scanner = new Html5Qrcode(containerId);
      scannerRef.current = scanner;

      await scanner.start(
        { facingMode: 'environment' },  // Use rear camera
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
          const parsed = parseQrResult(decodedText);
          setResult(parsed);
          setStatus('success');
          // Auto-stop after successful scan
          scanner.stop().catch(() => {});
          scannerRef.current = null;
        },
        () => {},  // Error callback (frame decode failures, not fatal)
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error al iniciar cámara';
      setError(msg);
      setStatus('error');
    }
  }, [containerId]);

  const stopScanning = useCallback(async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
      } catch {
        // Already stopped
      }
      scannerRef.current = null;
    }
    setStatus('idle');
  }, []);

  const reset = useCallback(() => {
    stopScanning();
    setResult(null);
    setError(null);
    setStatus('idle');
  }, [stopScanning]);

  return {
    status,
    result,
    error,
    isScanning: status === 'scanning',
    startScanning,
    stopScanning,
    reset,
  };
}
