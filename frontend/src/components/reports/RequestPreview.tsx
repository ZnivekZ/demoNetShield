import type { PreparedReport } from '../../types';

/** Human-readable view plus the literal request body used by Groq. */
export function RequestPreview({ request }: { request: PreparedReport['request'] }) {
  const system = request.messages.find(message => message.role === 'system')?.content ?? '';
  const user = request.messages.find(message => message.role === 'user')?.content ?? '';
  let readable = user;
  try { readable = JSON.stringify(JSON.parse(user), null, 2); } catch { /* Plain text is shown unchanged. */ }
  return <div className="space-y-2">
    <p className="text-xs text-surface-400">Modelo: {request.model} · salida máxima: {request.max_completion_tokens} tokens · temperatura: {request.temperature}</p>
    <details open className="border border-surface-700 rounded-lg p-3">
      <summary className="cursor-pointer text-xs font-semibold text-surface-200">Instrucciones para Groq</summary>
      <pre className="text-xs text-surface-300 whitespace-pre-wrap break-words max-h-48 overflow-auto mt-2">{system}</pre>
    </details>
    <details open className="border border-surface-700 rounded-lg p-3">
      <summary className="cursor-pointer text-xs font-semibold text-surface-200">Información que se enviará</summary>
      <pre className="text-xs text-surface-300 whitespace-pre-wrap break-all max-h-96 overflow-auto mt-2">{readable}</pre>
    </details>
    <details className="border border-surface-700 rounded-lg p-3">
      <summary className="cursor-pointer text-xs font-semibold text-surface-200">Solicitud exacta (JSON)</summary>
      <pre className="text-xs text-surface-300 whitespace-pre-wrap break-all max-h-96 overflow-auto mt-2">{JSON.stringify(request, null, 2)}</pre>
    </details>
  </div>;
}
