/**
 * RemoteCLI — Read-only remote CLI for MikroTik and Wazuh agent actions.
 * MikroTik: sends path to whitelisted read-only commands.
 * Wazuh: restart or status on selected agent.
 */
import { useState } from 'react';
import { Terminal, RefreshCw, ChevronRight } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { cliApi, wazuhApi } from '../../services/api';
import type { CLIResponse } from '../../types';

const MIKROTIK_SUGGESTIONS = [
  '/ip/address', '/ip/route', '/ip/arp', '/ip/firewall/filter',
  '/ip/firewall/address-list', '/interface', '/system/resource',
  '/ip/dns/static', '/log', '/queue/simple',
];

export function RemoteCLI() {
  const [cliTab, setCliTab] = useState<'mikrotik' | 'wazuh'>('mikrotik');

  // MikroTik CLI state
  const [mtCommand, setMtCommand] = useState('/ip/address');
  const [mtResult, setMtResult] = useState<CLIResponse | null>(null);
  const [mtLoading, setMtLoading] = useState(false);
  const [mtError, setMtError] = useState<string | null>(null);

  // Wazuh CLI state
  const [selectedAgent, setSelectedAgent] = useState('');
  const [wazuhAction, setWazuhAction] = useState<'status' | 'restart'>('status');
  const [wazuhResult, setWazuhResult] = useState<CLIResponse | null>(null);
  const [wazuhLoading, setWazuhLoading] = useState(false);
  const [wazuhError, setWazuhError] = useState<string | null>(null);

  const { data: agentsData } = useQuery({
    queryKey: ['wazuh', 'agents'],
    queryFn: () => wazuhApi.getAgents(),
    select: r => r.data ?? [],
  });

  const executeMikrotik = async () => {
    setMtLoading(true); setMtError(null); setMtResult(null);
    try {
      const resp = await cliApi.executeMikrotik(mtCommand);
      if (resp.success) setMtResult(resp.data as CLIResponse);
      else setMtError(resp.error ?? 'Error');
    } catch (e) {
      setMtError(e instanceof Error ? e.message : 'Error de conexión');
    } finally {
      setMtLoading(false);
    }
  };

  const executeWazuh = async () => {
    if (!selectedAgent) { setWazuhError('Seleccioná un agente'); return; }
    setWazuhLoading(true); setWazuhError(null); setWazuhResult(null);
    try {
      const resp = await cliApi.executeWazuhAgent(selectedAgent, wazuhAction);
      if (resp.success) setWazuhResult(resp.data as CLIResponse);
      else setWazuhError(resp.error ?? 'Error');
    } catch (e) {
      setWazuhError(e instanceof Error ? e.message : 'Error de conexión');
    } finally {
      setWazuhLoading(false);
    }
  };

  return (
    <div className="glass-card" style={{ padding: '1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem' }}>
        <Terminal size={16} style={{ color: 'var(--color-brand-400)' }} />
        <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-surface-200)' }}>CLI Remota</h3>
        <div style={{ display: 'flex', gap: '0.4rem', marginLeft: 'auto' }}>
          {(['mikrotik', 'wazuh'] as const).map(t => (
            <button
              key={t}
              className={`btn ${cliTab === t ? 'btn-primary' : 'btn-ghost'}`}
              style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}
              onClick={() => setCliTab(t)}
            >
              {t === 'mikrotik' ? 'MikroTik' : 'Wazuh Agent'}
            </button>
          ))}
        </div>
      </div>

      {cliTab === 'mikrotik' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <p style={{ fontSize: '0.72rem', color: 'var(--color-surface-500)', padding: '0.5rem 0.75rem', background: 'rgba(99,102,241,0.08)', borderRadius: 8, borderLeft: '3px solid var(--color-brand-600)' }}>
            Solo comandos de lectura (print). Comandos destructivos bloqueados por seguridad.
          </p>

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              id="mikrotik-cli-input"
              className="input"
              style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}
              value={mtCommand}
              onChange={e => setMtCommand(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') executeMikrotik(); }}
              placeholder="/ip/address"
              list="mikrotik-suggestions"
            />
            <datalist id="mikrotik-suggestions">
              {MIKROTIK_SUGGESTIONS.map(s => <option key={s} value={s} />)}
            </datalist>
            <button
              className="btn btn-primary"
              onClick={executeMikrotik}
              disabled={mtLoading}
              style={{ flexShrink: 0 }}
            >
              {mtLoading ? <span className="loading-spinner" /> : <ChevronRight size={16} />}
            </button>
          </div>

          {/* Suggestion chips */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
            {MIKROTIK_SUGGESTIONS.map(s => (
              <button
                key={s}
                onClick={() => setMtCommand(s)}
                style={{
                  fontSize: '0.68rem', padding: '0.2rem 0.5rem', borderRadius: 6,
                  background: mtCommand === s ? 'rgba(99,102,241,0.2)' : 'rgba(148,163,184,0.06)',
                  border: '1px solid rgba(148,163,184,0.1)',
                  color: mtCommand === s ? 'var(--color-brand-300)' : 'var(--color-surface-400)',
                  cursor: 'pointer', fontFamily: 'var(--font-mono)',
                }}
              >
                {s}
              </button>
            ))}
          </div>

          {mtError && (
            <div style={{ padding: '0.75rem', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, fontSize: '0.8rem', color: '#fca5a5' }}>
              {mtError}
            </div>
          )}

          {mtResult && (
            <div className="cli-output">
              <div className="cli-output__header">
                <span>{mtCommand}</span>
                <span>{Array.isArray(mtResult.output) ? `${(mtResult.output as unknown[]).length} entradas` : ''}</span>
              </div>
              <pre className="cli-output__content">
                {JSON.stringify(mtResult.output, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}

      {cliTab === 'wazuh' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <select
              id="wazuh-agent-select"
              className="input"
              style={{ flex: '1 1 250px' }}
              value={selectedAgent}
              onChange={e => setSelectedAgent(e.target.value)}
            >
              <option value="">Seleccioná un agente…</option>
              {(agentsData ?? []).map(a => (
                <option key={a.id} value={a.id}>{a.name} ({a.ip}) — {a.status}</option>
              ))}
            </select>
            <select
              className="input"
              style={{ flex: '0 0 140px' }}
              value={wazuhAction}
              onChange={e => setWazuhAction(e.target.value as 'status' | 'restart')}
            >
              <option value="status">Status</option>
              <option value="restart">Restart</option>
            </select>
            <button
              id="wazuh-agent-execute-btn"
              className={`btn ${wazuhAction === 'restart' ? 'btn-danger' : 'btn-primary'}`}
              onClick={executeWazuh}
              disabled={wazuhLoading || !selectedAgent}
              style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}
            >
              {wazuhLoading ? <span className="loading-spinner" /> : <><RefreshCw size={13} /> Ejecutar</>}
            </button>
          </div>

          {wazuhAction === 'restart' && selectedAgent && (
            <div style={{ padding: '0.5rem 0.75rem', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.15)', borderRadius: 8, fontSize: '0.75rem', color: '#fca5a5' }}>
              ⚠ Reiniciar el agente interrumpirá temporalmente la monitorización.
            </div>
          )}

          {wazuhError && (
            <div style={{ padding: '0.75rem', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, fontSize: '0.8rem', color: '#fca5a5' }}>
              {wazuhError}
            </div>
          )}

          {wazuhResult && (
            <div className="cli-output">
              <div className="cli-output__header">
                <span>Wazuh Agent: {selectedAgent} — {wazuhAction}</span>
              </div>
              <pre className="cli-output__content">
                {JSON.stringify(wazuhResult, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
