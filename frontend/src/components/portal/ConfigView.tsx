/**
 * ConfigView — Hotspot configuration tab.
 * Sections: server info, speed profiles, schedule, and setup button.
 * Shows setup button prominently when Hotspot is not initialized.
 */
import { useState } from 'react';
import { Settings, Wifi, AlertTriangle, CheckCircle } from 'lucide-react';
import { usePortalStatus, usePortalConfig, useSetupHotspot } from '../../hooks/usePortalConfig';
import { ConfirmModal } from '../common/ConfirmModal';
import { SpeedProfiles } from './SpeedProfiles';
import { ScheduleConfig } from './ScheduleConfig';

export function ConfigView() {
  const { data: status } = usePortalStatus();
  const { data: config } = usePortalConfig();
  const setupMutation = useSetupHotspot();
  const [showSetupConfirm, setShowSetupConfirm] = useState(false);
  const [setupResult, setSetupResult] = useState<{
    success: boolean;
    message: string;
    steps: string[];
    errors: string[];
  } | null>(null);

  const isInitialized = status?.initialized ?? config?.hotspot_initialized ?? false;

  const handleSetup = () => {
    setupMutation.mutate(undefined, {
      onSuccess: (res) => {
        setShowSetupConfirm(false);
        if (res.data) {
          setSetupResult({
            success: res.data.success,
            message: res.data.message,
            steps: res.data.steps_completed,
            errors: res.data.steps_failed,
          });
        }
      },
    });
  };

  return (
    <div className="portal-view">
      {/* Setup result banner */}
      {setupResult && (
        <div className={`portal-setup-result ${setupResult.success ? 'success' : 'error'}`}>
          {setupResult.success
            ? <CheckCircle size={16} />
            : <AlertTriangle size={16} />}
          <div>
            <p className="portal-setup-result-msg">{setupResult.message}</p>
            {setupResult.errors.length > 0 && (
              <ul className="portal-setup-steps portal-setup-steps--error">
                {setupResult.errors.map((e, i) => <li key={i}>✗ {e}</li>)}
              </ul>
            )}
            {setupResult.success && setupResult.steps.length > 0 && (
              <ul className="portal-setup-steps">
                {setupResult.steps.map((s, i) => <li key={i}>✓ {s}</li>)}
              </ul>
            )}
          </div>
          <button className="btn btn-ghost btn-xs" onClick={() => setSetupResult(null)}>×</button>
        </div>
      )}

      {/* Not initialized notice */}
      {!isInitialized && !setupResult && (
        <div className="glass-card portal-setup-card">
          <div className="portal-setup-icon">
            <Wifi size={32} style={{ color: 'var(--color-primary)' }} />
          </div>
          <div className="portal-setup-body">
            <h3 className="portal-setup-title">Hotspot no inicializado</h3>
            <p className="portal-setup-desc">
              El Portal Cautivo requiere que el Hotspot de MikroTik esté configurado.
              El asistente lo inicializará automáticamente en la interfaz{' '}
              <code>ether2</code>.
            </p>
            <button
              id="portal-setup-btn"
              className="btn btn-primary"
              onClick={() => setShowSetupConfirm(true)}
            >
              <Settings size={16} /> Inicializar Hotspot
            </button>
          </div>
        </div>
      )}

      {/* Server info */}
      {isInitialized && config && (
        <div className="glass-card portal-config-info-card">
          <h3 className="portal-section-title">Servidor Hotspot</h3>
          <div className="portal-config-info-grid">
            <div className="portal-info-row">
              <span className="portal-info-key">Nombre</span>
              <span className="portal-info-val">{config.server_name || '—'}</span>
            </div>
            <div className="portal-info-row">
              <span className="portal-info-key">Interfaz</span>
              <span className="portal-info-val font-mono">{config.interface || '—'}</span>
            </div>
            <div className="portal-info-row">
              <span className="portal-info-key">Pool de IPs</span>
              <span className="portal-info-val font-mono">{config.address_pool || '—'}</span>
            </div>
            <div className="portal-info-row">
              <span className="portal-info-key">Login por</span>
              <span className="portal-info-val">{config.login_by || '—'}</span>
            </div>
            <div className="portal-info-row">
              <span className="portal-info-key">MACs por IP</span>
              <span className="portal-info-val">{config.addresses_per_mac}</span>
            </div>
            <div className="portal-info-row">
              <span className="portal-info-key">Inactividad</span>
              <span className="portal-info-val">{config.idle_timeout || '—'}</span>
            </div>
          </div>
          {/* Re-run setup button (for already initialized) */}
          <button
            className="btn btn-ghost btn-sm"
            style={{ marginTop: '12px' }}
            onClick={() => setShowSetupConfirm(true)}
          >
            <Settings size={13} /> Re-ejecutar setup
          </button>
        </div>
      )}

      {/* Speed Profiles section */}
      <div className="glass-card portal-config-section-card">
        <SpeedProfiles />
      </div>

      {/* Schedule section */}
      <div className="glass-card portal-config-section-card">
        <ScheduleConfig />
      </div>

      {/* Setup Confirm */}
      {showSetupConfirm && (
        <ConfirmModal
          title="Inicializar MikroTik Hotspot"
          description="Se configurará el servidor Hotspot, los perfiles de login y los perfiles de velocidad. La operación es segura si ya existe — solo creará lo que falta."
          data={{ Interfaz: 'ether2', 'Perfil no reg.': '512k/512k', 'Perfil registrado': '10M/10M' }}
          confirmLabel="Inicializar"
          variant="warning"
          onConfirm={handleSetup}
          onCancel={() => setShowSetupConfirm(false)}
          isLoading={setupMutation.isPending}
        />
      )}
    </div>
  );
}
