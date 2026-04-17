/**
 * TelegramQuickActions — Buttons for sending test messages and status summaries.
 * Both actions require ConfirmModal confirmation.
 */
import { useState } from 'react';
import { Send, Activity, AlertCircle } from 'lucide-react';
import { useTelegramConfigs } from '../../hooks/useTelegramConfigs';
import { ConfirmModal } from '../common/ConfirmModal';

export function TelegramQuickActions() {
  const { sendTest, sendSummary } = useTelegramConfigs();
  const [confirmTest, setConfirmTest] = useState(false);
  const [confirmSummary, setConfirmSummary] = useState(false);
  const [lastResult, setLastResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const handleTest = () => {
    sendTest.mutate(undefined, {
      onSuccess: res => {
        setLastResult({ ok: res.data?.ok ?? false, msg: res.data?.ok ? 'Mensaje de prueba enviado ✅' : `Error: ${res.data?.error}` });
        setConfirmTest(false);
      },
    });
  };

  const handleSummary = () => {
    sendSummary.mutate(undefined, {
      onSuccess: res => {
        setLastResult({ ok: res.data?.ok ?? false, msg: res.data?.ok ? 'Resumen enviado ✅' : `Error: ${res.data?.error}` });
        setConfirmSummary(false);
      },
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        {/* Test message */}
        <button
          id="telegram-test-btn"
          className="btn btn-ghost"
          style={{ gap: '0.4rem', padding: '0.5rem 1rem', fontSize: '0.82rem' }}
          onClick={() => setConfirmTest(true)}
          disabled={sendTest.isPending}
        >
          {sendTest.isPending ? <span className="loading-spinner" /> : <Send size={14} />}
          Enviar mensaje de prueba
        </button>

        {/* Status summary */}
        <button
          id="telegram-summary-btn"
          className="btn btn-ghost"
          style={{ gap: '0.4rem', padding: '0.5rem 1rem', fontSize: '0.82rem' }}
          onClick={() => setConfirmSummary(true)}
          disabled={sendSummary.isPending}
        >
          {sendSummary.isPending ? <span className="loading-spinner" /> : <Activity size={14} />}
          Enviar resumen del sistema
        </button>
      </div>

      {/* Inline result feedback */}
      {lastResult && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.5rem',
          padding: '0.4rem 0.75rem', borderRadius: 6,
          background: lastResult.ok ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
          border: `1px solid ${lastResult.ok ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
          fontSize: '0.8rem',
          color: lastResult.ok ? 'var(--color-success)' : 'var(--color-danger)',
        }}>
          {!lastResult.ok && <AlertCircle size={13} />}
          {lastResult.msg}
          <button
            onClick={() => setLastResult(null)}
            style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', opacity: 0.6, fontSize: '0.75rem' }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Confirm modals */}
      {confirmTest && (
        <ConfirmModal
          title="Enviar mensaje de prueba"
          description="Se enviará un mensaje de prueba al canal de Telegram configurado para verificar la conexión."
          confirmLabel="Enviar prueba"
          variant="warning"
          isLoading={sendTest.isPending}
          onConfirm={handleTest}
          onCancel={() => setConfirmTest(false)}
        />
      )}

      {confirmSummary && (
        <ConfirmModal
          title="Enviar resumen del sistema"
          description="Se recabará el estado actual de todos los servicios (MikroTik, Wazuh, CrowdSec, Suricata) y se enviará un resumen al canal de Telegram."
          confirmLabel="Enviar resumen"
          variant="warning"
          isLoading={sendSummary.isPending}
          onConfirm={handleSummary}
          onCancel={() => setConfirmSummary(false)}
        />
      )}
    </div>
  );
}
