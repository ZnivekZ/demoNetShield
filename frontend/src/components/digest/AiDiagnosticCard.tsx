/**
 * AiDiagnosticCard.tsx
 * Shows the Groq AI diagnosis section.
 * - If real: renders the markdown summary + model badge
 * - If no key: shows "Simulación" banner + mock response
 * - If Groq fails: shows a failure banner without claiming the key is missing
 * Styled with NetShield glass-card system.
 */
import React, { useState } from 'react';
import { Bot, ChevronDown, ChevronRight } from 'lucide-react';

interface Props {
  aiSummary: string | null;
  aiModelUsed: string | null;
  aiIsMock: boolean;
  aiPayloadSent: Record<string, unknown> | null;
  aiGeneratedAt: string | null;
}

function MarkdownText({ text }: { text: string }) {
  const lines = text.split('\n');
  return (
    <div className="leading-relaxed text-sm text-surface-200">
      {lines.map((line, i) => {
        if (line.startsWith('## ')) {
          return (
            <h3 key={i} className="text-surface-100 font-bold text-base mt-4 mb-1.5">
              {line.slice(3)}
            </h3>
          );
        }
        if (line.startsWith('### ')) {
          return (
            <h4 key={i} className="text-surface-100 font-semibold text-sm mt-3 mb-1">
              {line.slice(4)}
            </h4>
          );
        }
        if (line.trim() === '') return <div key={i} className="h-2" />;

        // Inline bold
        const parts = line.split(/(\*\*[^*]+\*\*)/g);
        return (
          <p key={i} className="my-0.5">
            {parts.map((part, j) =>
              part.startsWith('**') && part.endsWith('**')
                ? <strong key={j} className="text-surface-100 font-semibold">{part.slice(2, -2)}</strong>
                : part
            )}
          </p>
        );
      })}
    </div>
  );
}

export const AiDiagnosticCard: React.FC<Props> = ({
  aiSummary,
  aiModelUsed,
  aiIsMock,
  aiPayloadSent,
  aiGeneratedAt,
}) => {
  const [payloadOpen, setPayloadOpen] = useState(false);
  const missingKey = aiIsMock && aiModelUsed === 'mock';
  const labSimulation = aiIsMock && aiModelUsed === 'simulado';
  const groqFailed = aiIsMock && !missingKey && !labSimulation;

  const formattedDate = aiGeneratedAt
    ? new Date(aiGeneratedAt).toLocaleString('es-AR', {
        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
      })
    : null;

  return (
    <div
      className="glass-card overflow-hidden"
      style={{ border: `1px solid ${aiIsMock ? '#f9731633' : '#6366f133'}` }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between flex-wrap gap-2.5 px-6 py-4 border-b border-surface-800/60"
        style={{ background: aiIsMock ? 'rgba(120,53,15,0.1)' : 'rgba(30,27,75,0.1)' }}
      >
        <div className="flex items-center gap-3">
          <Bot className="w-5 h-5 text-indigo-400 flex-shrink-0" />
          <div>
            <p className="font-semibold text-surface-100 text-sm">
              Diagnóstico IA — SOC Analyst
            </p>
            {formattedDate && (
              <p className="text-xs text-surface-500 mt-0.5">Generado: {formattedDate}</p>
            )}
          </div>
        </div>

        <div className="flex gap-2 items-center flex-wrap">
          {aiIsMock ? (
            <span
              className="text-xs font-bold rounded-full px-3 py-1"
              style={{
                background: '#f9731618', color: '#fb923c',
                border: '1px solid #f9731633',
              }}
            >
              {labSimulation ? '📋 SIMULACIÓN LOCAL' : missingKey ? '📋 SIMULACIÓN — Sin API key Groq' : '⚠️ Groq no generó el análisis'}
            </span>
          ) : (
            <span
              className="text-xs font-bold rounded-full px-3 py-1"
              style={{
                background: '#6366f118', color: '#a5b4fc',
                border: '1px solid #6366f133',
              }}
            >
              ✨ {aiModelUsed ?? 'Groq'}
            </span>
          )}
        </div>
      </div>

      {/* Mock banner */}
      {aiIsMock && (
        <div
          className="flex items-start gap-2 px-6 py-2.5 text-xs border-b border-surface-800/40"
          style={{ background: 'rgba(120,53,15,0.12)', color: '#fbbf24' }}
        >
          <span className="mt-0.5">💡</span>
          {labSimulation ? <span>Datos y respuesta simulados para comprobar la interfaz.</span> : missingKey ? (
            <span>
              Para análisis real, agregá{' '}
              <code className="bg-surface-900 text-surface-300 px-1.5 py-0.5 rounded text-[11px]">GROQ_API_KEY=gsk_...</code>{' '}
              en{' '}
              <code className="bg-surface-900 text-surface-300 px-1.5 py-0.5 rounded text-[11px]">backend/.env</code>{' '}
              y reiniciá el backend.
            </span>
          ) : (
            <span>
              La clave está configurada, pero Groq rechazó o no pudo completar la solicitud.
              Revisá los modelos disponibles y los logs del backend; luego regenerá el Digest.
            </span>
          )}
        </div>
      )}

      {/* Summary body */}
      <div className="px-6 py-5">
        {aiSummary ? (
          <MarkdownText text={aiSummary} />
        ) : (
          <p className="text-sm text-surface-500 italic">Sin resumen disponible.</p>
        )}
      </div>

      {/* Payload collapsible (mock mode) */}
      {aiIsMock && aiPayloadSent && (
        <div className="border-t border-surface-800/40">
          <button
            onClick={() => setPayloadOpen(o => !o)}
            className="w-full flex items-center gap-2 px-6 py-3 text-xs text-surface-500 hover:text-surface-300 transition-colors text-left"
          >
            {payloadOpen
              ? <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" />
              : <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" />}
            {groqFailed ? 'Ver payload preparado para Groq' : 'Ver payload que se enviaría a Groq (~1200 tokens)'}
          </button>
          {payloadOpen && (
            <div className="px-6 pb-5">
              <pre
                className="rounded-lg p-4 text-xs text-surface-400 overflow-auto leading-relaxed"
                style={{
                  background: 'var(--bg-primary, #000)',
                  border: '1px solid var(--border-default, #1f1f1f)',
                  maxHeight: 400,
                }}
              >
                {JSON.stringify(aiPayloadSent, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
