/**
 * ConfigView — CrowdSec configuration sub-view.
 * Bouncer status, machine info, whitelist CRUD, hub collections, connection status panel.
 */
import { Settings2, Server, Package, Info } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useCrowdSecBouncers, useCrowdSecHub } from '../../hooks/useCrowdSecMetrics';
import { BouncerStatus } from './BouncerStatus';
import { WhitelistManager } from './WhitelistManager';
import { systemApi } from '../../services/api';

function Section({ title, icon: Icon, children }: { title: string; icon: React.ComponentType<any>; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.6rem' }}>
        <Icon size={14} style={{ color: 'var(--color-brand-400)' }} />
        <h2 style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--color-surface-100)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {title}
        </h2>
      </div>
      {children}
    </div>
  );
}

export function CrowdSecConfig() {
  const bouncersQuery = useCrowdSecBouncers();
  const hubQuery = useCrowdSecHub();
  const { data: mockStatus } = useQuery({
    queryKey: ['mock-status'],
    queryFn: async () => { const r = await systemApi.getMockStatus(); return r.data; },
    refetchInterval: 30_000,
    retry: false,
    throwOnError: false,
  });
  const isMock = mockStatus?.services?.crowdsec ?? false;

  const bouncers = bouncersQuery.data ?? [];
  const hub = hubQuery.data;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <div
          style={{
            width: 36, height: 36,
            borderRadius: 10,
            background: 'linear-gradient(135deg, #8b5cf6, #a78bfa)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(139,92,246,0.35)',
            flexShrink: 0,
          }}
        >
          <Settings2 size={18} style={{ color: '#fff' }} />
        </div>
        <div>
          <h1 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--color-surface-100)', margin: 0 }}>
            CrowdSec — Configuración
          </h1>
          <p style={{ fontSize: '0.72rem', color: 'var(--color-surface-400)', margin: 0 }}>
            Bouncers · Hub · Whitelist · Estado de conexión
          </p>
        </div>
        {isMock && (
          <span className="badge badge-warning" style={{ marginLeft: 'auto', fontSize: '0.62rem' }}>
            MOCK MODE
          </span>
        )}
      </div>

      {/* Connection status panel */}
      <div
        className="glass-card"
        style={{
          padding: '1rem 1.25rem',
          borderLeft: `3px solid ${isMock ? 'var(--color-warning)' : 'var(--color-success)'}`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
          <Info size={14} style={{ color: isMock ? 'var(--color-warning)' : 'var(--color-success)' }} />
          <span style={{ fontSize: '0.78rem', fontWeight: 600, color: isMock ? 'var(--color-warning)' : 'var(--color-success)' }}>
            {isMock ? 'Modo demostración (datos simulados)' : 'Conectado a CrowdSec LAPI'}
          </span>
        </div>
        {isMock ? (
          <div style={{ fontSize: '0.72rem', color: 'var(--color-surface-400)', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
            <p style={{ margin: 0 }}>Para activar CrowdSec real:</p>
            <ol style={{ margin: '0.25rem 0 0 1.2rem', display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
              <li>Instalar CrowdSec en el servidor: <code>curl -s https://install.crowdsec.net | sudo sh</code></li>
              <li>Registrar bouncer: <code>sudo cscli bouncers add netshield-bouncer</code></li>
              <li>Copiar API key a <code>CROWDSEC_API_KEY</code> en <code>.env</code></li>
              <li>Cambiar <code>MOCK_CROWDSEC=false</code> (o remover si <code>MOCK_ALL=false</code>)</li>
              <li>Reiniciar el backend</li>
            </ol>
          </div>
        ) : (
          <p style={{ fontSize: '0.72rem', color: 'var(--color-surface-400)', margin: 0 }}>
            URL: {import.meta.env.VITE_CROWDSEC_URL ?? 'http://localhost:8080'} · API Key configurada ✓
          </p>
        )}
      </div>

      {/* Bouncers */}
      <Section title="Bouncers registrados" icon={Server}>
        {bouncersQuery.isLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '1rem' }}>
            <span className="loading-spinner" />
          </div>
        ) : (
          <BouncerStatus bouncers={bouncers} />
        )}
      </Section>

      {/* Hub */}
      {hub && (
        <Section title="Collections instaladas" icon={Package}>
          <div className="glass-card" style={{ padding: '0.75rem 1rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              {hub.collections.map(c => (
                <div key={c.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-surface-200)' }}>{c.name}</span>
                  <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.65rem', color: 'var(--color-surface-500)' }}>v{c.version}</span>
                    <span className={`badge ${c.status === 'up-to-date' ? 'badge-success' : 'badge-warning'}`} style={{ fontSize: '0.55rem' }}>
                      {c.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Section>
      )}

      {/* Whitelist */}
      <Section title="Whitelist local" icon={Settings2}>
        <WhitelistManager />
      </Section>
    </div>
  );
}
