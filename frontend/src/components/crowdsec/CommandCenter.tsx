/**
 * CommandCenter — Vista principal de CrowdSec.
 * Layout: stat cards → sync banner → decisions table → timeline
 * IpContextPanel se abre al hacer clic en una fila.
 */
import { useState } from 'react';
import { ShieldCheck, ShieldAlert, Globe, Activity, Wifi, Plus } from 'lucide-react';
import { useCrowdSecDecisions } from '../../hooks/useCrowdSecDecisions';
import { useCrowdSecMetrics } from '../../hooks/useCrowdSecMetrics';
import { useSyncStatus } from '../../hooks/useSyncStatus';
import { SyncStatusBanner } from './SyncStatusBanner';
import { DecisionsTable } from './DecisionsTable';
import { DecisionsTimeline } from './DecisionsTimeline';
import { IpContextPanel } from './IpContextPanel';
import { ConfirmModal } from '../common/ConfirmModal';

export function CrowdSecCommandCenter() {
  const { decisions, isLoading, deleteDecision, addDecision } = useCrowdSecDecisions();
  const metricsQuery = useCrowdSecMetrics();
  const { syncStatus, isOutOfSync, applySync } = useSyncStatus();

  const [selectedIp, setSelectedIp] = useState<string | null>(null);
  const [unblockTarget, setUnblockTarget] = useState<{ id: string; ip: string } | null>(null);
  const [fullBlockTarget, setFullBlockTarget] = useState<string | null>(null);
  const [addDecisionOpen, setAddDecisionOpen] = useState(false);
  const [newDecision] = useState({ ip: '', duration: '24h', reason: '', type: 'ban' as 'ban' | 'captcha' });

  const metrics = metricsQuery.data;

  const statCards = [
    {
      label: 'Decisiones activas',
      value: metrics?.active_decisions ?? decisions.length,
      icon: ShieldAlert,
      color: 'var(--color-danger)',
    },
    {
      label: 'Alertas (24h)',
      value: metrics?.alerts_24h ?? '—',
      icon: Activity,
      color: 'var(--color-warning)',
    },
    {
      label: 'Scenarios',
      value: metrics?.scenarios_active ?? '—',
      icon: Globe,
      color: 'var(--color-brand-400)',
    },
    {
      label: 'Bouncers activos',
      value: metrics?.bouncers_connected ?? '—',
      icon: Wifi,
      color: 'var(--color-success)',
    },
    {
      label: 'Sync status',
      value: syncStatus?.in_sync ? 'OK' : `${(syncStatus?.only_in_crowdsec.length ?? 0)} desync`,
      icon: ShieldCheck,
      color: syncStatus?.in_sync ? 'var(--color-success)' : 'var(--color-warning)',
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <div
          style={{
            width: 36, height: 36,
            borderRadius: 10,
            background: 'linear-gradient(135deg, #6366f1, #818cf8)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(99,102,241,0.4)',
            flexShrink: 0,
          }}
        >
          <ShieldCheck size={18} style={{ color: '#fff' }} />
        </div>
        <div>
          <h1 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--color-surface-100)', margin: 0 }}>
            CrowdSec — Centro de Mando
          </h1>
          <p style={{ fontSize: '0.72rem', color: 'var(--color-surface-400)', margin: 0 }}>
            Decisiones activas · Detecciones locales · Sync con MikroTik
          </p>
        </div>
        <button
          className="btn btn-primary"
          style={{ marginLeft: 'auto', fontSize: '0.75rem' }}
          onClick={() => setAddDecisionOpen(true)}
        >
          <Plus size={13} /> Bloqueo manual
        </button>
      </div>

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '0.75rem' }}>
        {statCards.map(card => (
          <div
            key={card.label}
            className="glass-card"
            style={{
              padding: '0.9rem 1rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.4rem',
              borderTop: `2px solid ${card.color}20`,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <card.icon size={14} style={{ color: card.color, flexShrink: 0 }} />
              <span style={{ fontSize: '0.65rem', color: 'var(--color-surface-400)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                {card.label}
              </span>
            </div>
            <span style={{ fontSize: '1.5rem', fontWeight: 700, color: card.color, lineHeight: 1 }}>
              {card.value}
            </span>
          </div>
        ))}
      </div>

      {/* Sync banner */}
      {syncStatus && isOutOfSync && (
        <SyncStatusBanner
          syncStatus={syncStatus}
          onApplySync={data => applySync.mutate(data)}
          isSyncing={applySync.isPending}
        />
      )}

      {/* Main content grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '1rem', alignItems: 'start' }}>
        <DecisionsTable
          decisions={decisions}
          isLoading={isLoading}
          onRowClick={ip => setSelectedIp(ip)}
          onUnblock={(id, ip) => setUnblockTarget({ id, ip })}
        />
        <DecisionsTimeline metrics={metrics ?? null} />
      </div>

      {/* IP Context Panel */}
      <IpContextPanel
        ip={selectedIp}
        onClose={() => setSelectedIp(null)}
        onFullBlock={ip => setFullBlockTarget(ip)}
        onFullUnblock={ip => setUnblockTarget({ id: '', ip })}
      />

      {/* Unblock confirm */}
      {unblockTarget && (
        <ConfirmModal
          title="Desbloquear IP"
          description="Se eliminarán todas las decisiones activas de CrowdSec para esta IP."
          data={{ IP: unblockTarget.ip }}
          confirmLabel="Desbloquear"
          variant="warning"
          onConfirm={() => {
            if (unblockTarget.id) {
              deleteDecision.mutate(unblockTarget.id);
            }
            setUnblockTarget(null);
            setSelectedIp(null);
          }}
          onCancel={() => setUnblockTarget(null)}
          isLoading={deleteDecision.isPending}
        />
      )}

      {/* Full block confirm */}
      {fullBlockTarget && (
        <ConfirmModal
          title="Bloqueo completo"
          description="Esta IP será bloqueada simultáneamente en CrowdSec Y en MikroTik (Blacklist_Automatica)."
          data={{ IP: fullBlockTarget, MikroTik: 'Blacklist_Automatica', CrowdSec: 'ban', Duración: '24h' }}
          confirmLabel="Bloquear en todas las capas"
          variant="danger"
          onConfirm={() => {
            addDecision.mutate({ ip: fullBlockTarget, duration: '24h', reason: 'Manual block from IpContextPanel', type: 'ban' });
            setFullBlockTarget(null);
            setSelectedIp(null);
          }}
          onCancel={() => setFullBlockTarget(null)}
          isLoading={addDecision.isPending}
        />
      )}

      {/* Add decision modal */}
      {addDecisionOpen && (
        <ConfirmModal
          title="Bloqueo manual CrowdSec"
          description="Agrega una decisión de ban o captcha al agente CrowdSec local."
          data={{ IP: newDecision.ip || '(ingresar IP)', Tipo: newDecision.type, Duración: newDecision.duration }}
          confirmLabel="Aplicar decisión"
          variant="danger"
          onConfirm={() => {
            addDecision.mutate(newDecision);
            setAddDecisionOpen(false);
          }}
          onCancel={() => setAddDecisionOpen(false)}
          isLoading={addDecision.isPending}
        />
      )}
    </div>
  );
}
