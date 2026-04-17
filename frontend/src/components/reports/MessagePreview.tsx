/**
 * MessagePreview — Real-time preview of how a Telegram message will look.
 * Uses mock data always — shows formatted Telegram-style message bubble.
 */
import type { TelegramReportConfig } from '../../types';

interface MessagePreviewProps {
  config: Partial<TelegramReportConfig>;
}

const SOURCE_LABELS: Record<string, string> = {
  wazuh: '🛡️ Wazuh',
  mikrotik: '🖥️ MikroTik',
  crowdsec: '🔒 CrowdSec',
  suricata: '📡 Suricata',
};

const AUDIENCE_LABELS: Record<string, string> = {
  executive: 'Ejecutivo',
  technical: 'Técnico',
  compliance: 'Cumplimiento',
};

export function MessagePreview({ config }: MessagePreviewProps) {
  const name = config.name || 'Sin nombre';
  const audience = config.audience || 'technical';
  const sources = config.sources || ['wazuh'];
  const trigger = config.trigger || 'scheduled';

  const triggerLabel =
    trigger === 'scheduled' ? `📅 Programado: ${config.schedule ?? 'sin definir'}`
    : trigger === 'on_alert' ? '🚨 Al detectar alerta crítica'
    : '📊 Al superar umbral';

  const sourceList = sources.map(s => SOURCE_LABELS[s] ?? s).join(' • ');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      <span style={{ fontSize: '0.7rem', color: 'var(--color-surface-400)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
        Vista previa del mensaje
      </span>

      {/* Telegram bubble */}
      <div style={{
        background: 'var(--color-surface-800)',
        borderRadius: 12,
        padding: '0.85rem 1rem',
        border: '1px solid var(--color-surface-600)',
        position: 'relative',
        fontFamily: 'var(--font-mono)',
        fontSize: '0.78rem',
        lineHeight: 1.7,
        color: 'var(--color-text-primary)',
        maxWidth: '100%',
      }}>
        {/* Telegram blue dot indicator */}
        <div style={{
          position: 'absolute', top: 10, right: 10, width: 8, height: 8,
          borderRadius: '50%', background: '#22a3ee',
        }} />

        <div style={{ color: '#22a3ee', fontWeight: 700, marginBottom: 4 }}>📊 {name}</div>
        <div style={{ color: 'var(--color-surface-400)', fontSize: '0.72rem', marginBottom: 6 }}>
          {triggerLabel} · {AUDIENCE_LABELS[audience]}
        </div>

        <div style={{ borderTop: '1px solid var(--color-surface-700)', paddingTop: 6, marginBottom: 6 }} />

        <div style={{ color: 'var(--color-surface-300)', marginBottom: 4 }}>
          <span style={{ color: 'var(--color-success)' }}>✅</span> Fuentes: {sourceList}
        </div>

        {audience !== 'executive' && (
          <>
            <div>🛡️ <strong>Wazuh:</strong> 12 agentes | 3 alertas críticas</div>
            <div>🖥️ <strong>MikroTik:</strong> CPU 23% | 847 conexiones</div>
          </>
        )}

        {audience === 'executive' && (
          <div>
            📈 <strong>Resumen:</strong> Sin incidentes críticos en las últimas 24h.
            El sistema opera dentro de parámetros normales.
          </div>
        )}

        <div style={{
          marginTop: 6, paddingTop: 6,
          borderTop: '1px solid var(--color-surface-700)',
          color: 'var(--color-surface-500)', fontSize: '0.7rem',
        }}>
          ⏰ {new Date().toLocaleString('es-AR', { hour12: false })} UTC
        </div>
      </div>

      <p style={{ fontSize: '0.7rem', color: 'var(--color-surface-500)', margin: 0, fontStyle: 'italic' }}>
        * Vista previa con datos de ejemplo. El mensaje real incluirá datos en tiempo real.
      </p>
    </div>
  );
}
