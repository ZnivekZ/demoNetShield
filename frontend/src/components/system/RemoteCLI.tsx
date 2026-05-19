/**
 * RemoteCLI — Read-only remote CLI for MikroTik, Wazuh, Suricata, and CrowdSec.
 * MikroTik: sends path to whitelisted read-only commands.
 * Wazuh: restart or status on selected agent.
 * Suricata: engine status, mode, reload rules (with ConfirmModal).
 * CrowdSec: decisions, bouncers, scenarios queries.
 */
import { useState } from 'react';
import { Terminal, RefreshCw, ChevronRight, AlertTriangle } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { cliApi, wazuhApi, suricataApi, crowdsecApi } from '../../services/api';
import { ConfirmModal } from '../common/ConfirmModal';
import type { CLIResponse } from '../../types';

const MIKROTIK_SUGGESTIONS = [
  '/ip/address', '/ip/route', '/ip/arp', '/ip/firewall/filter',
  '/ip/firewall/address-list', '/interface', '/system/resource',
  '/ip/dns/static', '/log', '/queue/simple',
];

type CliTab = 'mikrotik' | 'wazuh' | 'suricata' | 'crowdsec';

export function RemoteCLI() {
  const [cliTab, setCliTab] = useState<CliTab>('mikrotik');

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

  // Suricata CLI state
  const [surResult, setSurResult] = useState<Record<string, unknown> | null>(null);
  const [surLoading, setSurLoading] = useState(false);
  const [surError, setSurError] = useState<string | null>(null);
  const [surLastAction, setSurLastAction] = useState('');
  const [showReloadConfirm, setShowReloadConfirm] = useState(false);
  const [reloading, setReloading] = useState(false);

  // CrowdSec CLI state
  const [csResult, setCsResult] = useState<unknown>(null);
  const [csLoading, setCsLoading] = useState(false);
  const [csError, setCsError] = useState<string | null>(null);
  const [csLastAction, setCsLastAction] = useState('');
  const [csIpFilter, setCsIpFilter] = useState('');

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

  // ── Suricata actions ──
  const executeSuricata = async (action: 'status' | 'mode' | 'reload') => {
    if (action === 'reload') {
      setShowReloadConfirm(true);
      return;
    }
    setSurLoading(true); setSurError(null); setSurResult(null);
    setSurLastAction(action === 'status' ? 'Engine Status' : 'Engine Mode');
    try {
      const resp = action === 'status'
        ? await suricataApi.getEngineStatus()
        : await suricataApi.getEngineMode();
      if (resp.success) setSurResult(resp.data as Record<string, unknown>);
      else setSurError(resp.error ?? 'Error');
    } catch (e) {
      setSurError(e instanceof Error ? e.message : 'Error de conexión');
    } finally {
      setSurLoading(false);
    }
  };

  const confirmReloadRules = async () => {
    setReloading(true); setSurError(null); setSurResult(null);
    setSurLastAction('Reload Rules');
    try {
      const resp = await suricataApi.reloadRules();
      if (resp.success) setSurResult(resp.data as Record<string, unknown>);
      else setSurError(resp.error ?? 'Error');
    } catch (e) {
      setSurError(e instanceof Error ? e.message : 'Error de conexión');
    } finally {
      setReloading(false);
      setShowReloadConfirm(false);
    }
  };

  // ── CrowdSec actions ──
  const executeCrowdSec = async (action: 'decisions' | 'bouncers' | 'scenarios' | 'metrics') => {
    setCsLoading(true); setCsError(null); setCsResult(null);
    const labels: Record<string, string> = {
      decisions: 'Decisiones activas', bouncers: 'Bouncers', scenarios: 'Escenarios', metrics: 'Métricas',
    };
    setCsLastAction(labels[action]);
    try {
      let resp;
      switch (action) {
        case 'decisions': resp = await crowdsecApi.getDecisions(csIpFilter ? { ip: csIpFilter } : undefined); break;
        case 'bouncers': resp = await crowdsecApi.getBouncers(); break;
        case 'scenarios': resp = await crowdsecApi.getScenarios(); break;
        case 'metrics': resp = await crowdsecApi.getMetrics(); break;
      }
      if (resp.success) setCsResult(resp.data);
      else setCsError(resp.error ?? 'Error');
    } catch (e) {
      setCsError(e instanceof Error ? e.message : 'Error de conexión');
    } finally {
      setCsLoading(false);
    }
  };

  const tabLabels: Record<CliTab, string> = {
    mikrotik: 'MikroTik', wazuh: 'Wazuh Agent', suricata: 'Suricata', crowdsec: 'CrowdSec',
  };

  return (
    <div className="glass-card" style={{ padding: '1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem' }}>
        <Terminal size={16} style={{ color: 'var(--color-brand-400)' }} />
        <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-surface-200)' }}>CLI Remota</h3>
        <div style={{ display: 'flex', gap: '0.4rem', marginLeft: 'auto' }}>
          {(Object.keys(tabLabels) as CliTab[]).map(t => (
            <button
              key={t}
              className={`btn ${cliTab === t ? 'btn-primary' : 'btn-ghost'}`}
              style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}
              onClick={() => setCliTab(t)}
            >
              {tabLabels[t]}
            </button>
          ))}
        </div>
      </div>

      {/* ── MikroTik Tab ── */}
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

          <CLIError error={mtError} />
          <CLIOutput label={mtCommand} result={mtResult} />
        </div>
      )}

      {/* ── Wazuh Tab ── */}
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

          <CLIError error={wazuhError} />
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

      {/* ── Suricata Tab ── */}
      {cliTab === 'suricata' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <p style={{ fontSize: '0.72rem', color: 'var(--color-surface-500)', padding: '0.5rem 0.75rem', background: 'rgba(99,102,241,0.08)', borderRadius: 8, borderLeft: '3px solid var(--color-brand-600)' }}>
            Consultas al motor Suricata. Reload Rules requiere confirmación.
          </p>

          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {[
              { key: 'status', label: 'Engine Status', variant: 'btn-primary' },
              { key: 'mode', label: 'Engine Mode', variant: 'btn-primary' },
              { key: 'reload', label: '⟳ Reload Rules', variant: 'btn-danger' },
            ].map(a => (
              <button
                key={a.key}
                className={`btn ${a.variant}`}
                style={{ fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                onClick={() => executeSuricata(a.key as 'status' | 'mode' | 'reload')}
                disabled={surLoading || reloading}
              >
                {(surLoading || reloading) && surLastAction === a.label ? <span className="loading-spinner" /> : null}
                {a.label}
              </button>
            ))}
          </div>

          <CLIError error={surError} />
          {surResult && (
            <div className="cli-output">
              <div className="cli-output__header">
                <span>Suricata — {surLastAction}</span>
              </div>
              <pre className="cli-output__content">
                {JSON.stringify(surResult, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* ── CrowdSec Tab ── */}
      {cliTab === 'crowdsec' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <p style={{ fontSize: '0.72rem', color: 'var(--color-surface-500)', padding: '0.5rem 0.75rem', background: 'rgba(99,102,241,0.08)', borderRadius: 8, borderLeft: '3px solid var(--color-brand-600)' }}>
            Consultas de solo lectura a la API local de CrowdSec (LAPI).
          </p>

          {/* IP filter for decisions */}
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <input
              className="input"
              style={{ flex: '1 1 200px', fontFamily: 'var(--font-mono)', fontSize: '0.82rem' }}
              value={csIpFilter}
              onChange={e => setCsIpFilter(e.target.value)}
              placeholder="IP para filtrar decisiones (opcional)"
            />
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {[
              { key: 'decisions', label: 'Decisiones' },
              { key: 'bouncers', label: 'Bouncers' },
              { key: 'scenarios', label: 'Escenarios' },
              { key: 'metrics', label: 'Métricas' },
            ].map(a => (
              <button
                key={a.key}
                className="btn btn-primary"
                style={{ fontSize: '0.78rem' }}
                onClick={() => executeCrowdSec(a.key as 'decisions' | 'bouncers' | 'scenarios' | 'metrics')}
                disabled={csLoading}
              >
                {csLoading && csLastAction === a.label ? <span className="loading-spinner" /> : null}
                {a.label}
              </button>
            ))}
          </div>

          <CLIError error={csError} />
          {csResult && (
            <div className="cli-output">
              <div className="cli-output__header">
                <span>CrowdSec — {csLastAction}</span>
                <span>{Array.isArray(csResult) ? `${csResult.length} entradas` : ''}</span>
              </div>
              <pre className="cli-output__content">
                {JSON.stringify(csResult, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* ── Reload Rules Confirm Modal ── */}
      {showReloadConfirm && (
        <ConfirmModal
          title="Recargar Reglas Suricata"
          description="Se recargarán todas las reglas en el motor Suricata sin reiniciarlo. Esto puede afectar brevemente el rendimiento de detección."
          data={{ Acción: 'suricata-update + reload', Motor: 'No se reinicia', Impacto: 'Brevemente reducido' }}
          confirmLabel="Recargar"
          onConfirm={confirmReloadRules}
          onCancel={() => setShowReloadConfirm(false)}
          isLoading={reloading}
        />
      )}
    </div>
  );
}

// ── Internal helpers ──

function CLIError({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <div style={{ padding: '0.75rem', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, fontSize: '0.8rem', color: '#fca5a5', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
      <AlertTriangle size={14} /> {error}
    </div>
  );
}

function CLIOutput({ label, result }: { label: string; result: CLIResponse | null }) {
  if (!result) return null;
  return (
    <div className="cli-output">
      <div className="cli-output__header">
        <span>{label}</span>
        <span>{Array.isArray(result.output) ? `${(result.output as unknown[]).length} entradas` : ''}</span>
      </div>
      <pre className="cli-output__content">
        {JSON.stringify(result.output, null, 2)}
      </pre>
    </div>
  );
}
