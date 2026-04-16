/**
 * IpContextPanel — slide-over lateral para contexto unificado de IP.
 * Combina datos CrowdSec + MikroTik + Wazuh en un único panel.
 * Se abre desde DecisionsTable (clic en fila) o GlobalSearch (botón).
 */
import { useEffect } from 'react';
import { X, Shield, Wifi, ShieldAlert, Globe, ShieldOff, ShieldCheck } from 'lucide-react';
import { useIpContext } from '../../hooks/useIpContext';
import { CommunityScoreBadge } from './CommunityScoreBadge';
import { formatDistanceToNow } from '../utils/time';

interface Props {
  ip: string | null;
  onClose: () => void;
  onFullBlock?: (ip: string) => void;
  onFullUnblock?: (ip: string) => void;
}

export function IpContextPanel({ ip, onClose, onFullBlock, onFullUnblock }: Props) {
  const { context, isLoading, isError } = useIpContext(ip);

  // Close on ESC
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  if (!ip) return null;

  return (
    <>
      {/* Overlay */}
      <div
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          zIndex: 200, backdropFilter: 'blur(2px)',
        }}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0, width: 480,
          background: 'var(--color-surface-900)',
          borderLeft: '1px solid var(--color-surface-700)',
          zIndex: 201, display: 'flex', flexDirection: 'column',
          boxShadow: '-8px 0 32px rgba(0,0,0,0.4)',
          animation: 'slideInRight 0.2s ease',
        }}
        className="animate-fade-in-up"
      >
        {/* Header */}
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: '0.75rem',
            padding: '1rem 1.25rem',
            borderBottom: '1px solid var(--color-surface-700)',
            background: 'var(--color-surface-800)',
          }}
        >
          <Globe size={18} style={{ color: 'var(--color-brand-400)' }} />
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: '0.7rem', color: 'var(--color-surface-400)', margin: 0 }}>
              Contexto unificado
            </p>
            <h3 style={{ fontFamily: 'var(--font-mono)', fontSize: '1rem', margin: 0, color: 'var(--color-surface-100)' }}>
              {ip}
            </h3>
          </div>
          <button
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-surface-400)' }}
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {isLoading && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
              <span className="loading-spinner" />
            </div>
          )}

          {isError && (
            <div className="badge badge-danger" style={{ fontSize: '0.75rem', padding: '0.5rem' }}>
              Error cargando contexto
            </div>
          )}

          {context && (
            <>
              {/* CrowdSec section */}
              <section>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.6rem' }}>
                  <Shield size={14} style={{ color: 'var(--color-brand-400)' }} />
                  <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--color-brand-400)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                    CrowdSec
                  </span>
                </div>
                <div className="glass-card" style={{ padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--color-surface-400)' }}>Reputación comunidad</span>
                    <CommunityScoreBadge
                      score={context.crowdsec.community_score}
                      reportedBy={context.crowdsec.reported_by}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {context.crowdsec.classifications.map(c => (
                      <span key={c} className="badge badge-warning" style={{ fontSize: '0.6rem' }}>{c}</span>
                    ))}
                    {context.crowdsec.background_noise && (
                      <span className="badge badge-danger" style={{ fontSize: '0.6rem' }}>background-noise</span>
                    )}
                  </div>
                  {context.crowdsec.country && (
                    <div style={{ fontSize: '0.72rem', color: 'var(--color-surface-400)' }}>
                      🌍 {context.crowdsec.country} — {context.crowdsec.as_name}
                    </div>
                  )}
                  {context.crowdsec.decisions.length > 0 && (
                    <div>
                      <p style={{ fontSize: '0.65rem', color: 'var(--color-surface-500)', margin: '0.25rem 0 0.35rem' }}>
                        Decisiones activas: {context.crowdsec.decisions.length}
                      </p>
                      {context.crowdsec.decisions.slice(0, 3).map(d => (
                        <div key={d.id} style={{ fontSize: '0.68rem', fontFamily: 'var(--font-mono)', color: 'var(--color-danger)', margin: '0.1rem 0' }}>
                          {d.type.toUpperCase()} — {d.scenario} ({d.duration})
                        </div>
                      ))}
                    </div>
                  )}
                  {context.crowdsec.alerts.length > 0 && (
                    <div>
                      <p style={{ fontSize: '0.65rem', color: 'var(--color-surface-500)', margin: '0.25rem 0 0.35rem' }}>
                        Alertas recientes
                      </p>
                      {context.crowdsec.alerts.slice(0, 3).map(a => (
                        <div key={a.id} style={{ fontSize: '0.68rem', color: 'var(--color-surface-300)', margin: '0.1rem 0' }}>
                          • {a.scenario} — {a.events_count} eventos
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>

              {/* MikroTik section */}
              <section>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.6rem' }}>
                  <Wifi size={14} style={{ color: 'var(--color-success)' }} />
                  <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--color-success)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                    MikroTik
                  </span>
                </div>
                <div className="glass-card" style={{ padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem' }}>
                    <span style={{ color: 'var(--color-surface-400)' }}>En ARP table</span>
                    <span className={`badge ${context.mikrotik.in_arp ? 'badge-success' : 'badge-warning'}`} style={{ fontSize: '0.6rem' }}>
                      {context.mikrotik.in_arp ? 'Sí' : 'No'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem' }}>
                    <span style={{ color: 'var(--color-surface-400)' }}>En Blacklist_Automatica</span>
                    <span className={`badge ${context.mikrotik.in_blacklist ? 'badge-danger' : 'badge-success'}`} style={{ fontSize: '0.6rem' }}>
                      {context.mikrotik.in_blacklist ? 'Bloqueada' : 'No bloqueada'}
                    </span>
                  </div>
                  {context.mikrotik.arp_comment && (
                    <div style={{ fontSize: '0.68rem', color: 'var(--color-surface-400)' }}>
                      Comentario: {context.mikrotik.arp_comment}
                    </div>
                  )}
                </div>
              </section>

              {/* Wazuh section */}
              <section>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.6rem' }}>
                  <ShieldAlert size={14} style={{ color: 'var(--color-danger)' }} />
                  <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--color-danger)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                    Wazuh
                  </span>
                </div>
                <div className="glass-card" style={{ padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem' }}>
                    <span style={{ color: 'var(--color-surface-400)' }}>Alertas relacionadas</span>
                    <span className={`badge ${context.wazuh.alerts_count > 0 ? 'badge-danger' : 'badge-success'}`} style={{ fontSize: '0.6rem' }}>
                      {context.wazuh.alerts_count}
                    </span>
                  </div>
                  {context.wazuh.agents_affected.length > 0 && (
                    <div style={{ fontSize: '0.68rem', color: 'var(--color-surface-400)' }}>
                      Agentes afectados: {context.wazuh.agents_affected.join(', ')}
                    </div>
                  )}
                  {context.wazuh.last_alert && (
                    <div style={{ fontSize: '0.68rem', color: 'var(--color-surface-300)' }}>
                      Última alerta: {context.wazuh.last_alert.rule_description}
                      <br />
                      <span style={{ color: 'var(--color-surface-500)' }}>
                        {formatDistanceToNow(context.wazuh.last_alert.timestamp)}
                      </span>
                    </div>
                  )}
                </div>
              </section>
            </>
          )}
        </div>

        {/* Footer actions */}
        <div
          style={{
            display: 'flex', gap: '0.5rem',
            padding: '0.75rem 1.25rem',
            borderTop: '1px solid var(--color-surface-700)',
            background: 'var(--color-surface-800)',
          }}
        >
          {onFullUnblock && context && (
            <button
              className="btn btn-ghost"
              style={{ flex: 1, fontSize: '0.75rem' }}
              onClick={() => onFullUnblock(ip)}
            >
              <ShieldCheck size={13} />
              Desbloquear todo
            </button>
          )}
          {onFullBlock && (
            <button
              className="btn btn-danger"
              style={{ flex: 1, fontSize: '0.75rem' }}
              onClick={() => onFullBlock(ip)}
            >
              <ShieldOff size={13} />
              Bloqueo completo
            </button>
          )}
        </div>
      </div>
    </>
  );
}
