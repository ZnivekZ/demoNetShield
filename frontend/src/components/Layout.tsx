/**
 * Layout.tsx — Main application shell with sidebar navigation and header.
 *
 * NAVIGATION ARCHITECTURE DECISION (2026-04-03):
 * -----------------------------------------------
 * Original: Dashboard / Firewall / VLANs / Red & IPs / Reportes (5 items)
 *
 * New structure (7 of 20 max items used):
 *   SEGURIDAD group:
 *     - Seguridad (/)          — QuickView: alerts, MITRE, top agents (was "Dashboard")
 *     - Configuración (/security/config) — Blacklist, geo-block, sinkhole settings
 *   INFRAESTRUCTURA group:
 *     - Red (/network)         — Traffic, interfaces, VLANs (absorbed), ARP, labels, groups
 *     - Firewall (/firewall)   — Rules, blocks, blacklists
 *   HERRAMIENTAS group:
 *     - Phishing (/phishing)   — Detection, victims, domain management, sinkhole
 *     - Sistema (/system)      — Unified MikroTik + Wazuh health, Remote CLI
 *     - Reportes (/reports)    — AI reports (unchanged)
 *
 * Why:
 *   - "Seguridad" absorbs Dashboard (was already 90% Wazuh security data)
 *   - "Red" absorbs VLANs (they're network-layer, not separate domain)
 *   - "Phishing" needs its own item (complex subdomain: victims, sinkhole, simulation)
 *   - "Sistema" is new (unified health view was missing)
 *   - 13 item slots reserved for future expansion (SIEM rules, threat intel, VPN, etc.)
 *
 * Extensibility: Add items to the navGroups array below. Max 20 total items.
 */
import { NavLink, Outlet } from 'react-router-dom';
import {
  ShieldAlert,
  Settings,
  Network,
  Flame,
  Fish,
  Monitor,
  FileText,
  Shield,
  Menu,
  X,
  Activity,
  Wifi,
  Package,
  ShieldCheck,
  Globe,
  Settings2,
} from 'lucide-react';
import { useState } from 'react';
import { GlobalSearch } from './common/GlobalSearch';
import { NotificationPanel } from './security/NotificationPanel';
import { ConfirmModal } from './common/ConfirmModal';
import { useBlockIP } from '../hooks/useSecurityActions';
import { useMikrotikHealth } from '../hooks/useMikrotikHealth';
import { useWazuhHealth } from '../hooks/useWazuhSummary';
import { useCrowdSecHealth } from '../hooks/useCrowdSecMetrics';
import { MockModeBadge } from './common/MockModeBadge';
import { IpContextPanel } from './crowdsec/IpContextPanel';

// ── Navigation structure (max 20 items total) ─────────────────
const navGroups = [
  {
    label: 'Seguridad',
    items: [
      { to: '/', icon: ShieldAlert, label: 'Seguridad', end: true },
      { to: '/security/config', icon: Settings, label: 'Configuración', end: false },
    ],
  },
  {
    label: 'Infraestructura',
    items: [
      { to: '/network', icon: Network, label: 'Red', end: false },
      { to: '/firewall', icon: Flame, label: 'Firewall', end: false },
      { to: '/portal', icon: Wifi, label: 'Portal Cautivo', end: false },
    ],
  },
  {
    label: 'Herramientas',
    items: [
      { to: '/phishing', icon: Fish, label: 'Phishing', end: false },
      { to: '/system', icon: Monitor, label: 'Sistema', end: false },
      { to: '/reports', icon: FileText, label: 'Reportes', end: false },
    ],
  },
  {
    label: 'CrowdSec',
    items: [
      { to: '/crowdsec', icon: ShieldCheck, label: 'Centro de Mando', end: true },
      { to: '/crowdsec/intelligence', icon: Globe, label: 'Inteligencia', end: false },
      { to: '/crowdsec/config', icon: Settings2, label: 'Configuración', end: false },
    ],
  },
  {
    label: 'Inventario',
    items: [
      { to: '/inventory', icon: Package, label: 'GLPI', end: false },
    ],
  },
];

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Global block IP flow (triggered by GlobalSearch or NotificationPanel)
  const [blockIPTarget, setBlockIPTarget] = useState<string | null>(null);
  const blockIPMutation = useBlockIP();
  // Global IP context panel (CrowdSec unified view)
  const [ipContextTarget, setIpContextTarget] = useState<string | null>(null);

  // Status indicators logic
  const { data: mtHealth, isLoading: mtLoading, isError: mtError } = useMikrotikHealth();
  const { data: wazuhHealth, isLoading: wazuhLoading, isError: wazuhError } = useWazuhHealth();
  const { data: csHealth, isLoading: csLoading, isError: csError } = useCrowdSecHealth();

  const getStatusClass = (isLoading: boolean, isError: boolean, data: unknown) => {
    if (isLoading) return 'status-dot pending';
    if (isError || !data) return 'status-dot disconnected';
    return 'status-dot active';
  };

  const handleBlockIPConfirm = async () => {
    if (!blockIPTarget) return;
    await blockIPMutation.mutateAsync({
      ip: blockIPTarget,
      reason: 'Blocked from global search / notification',
      duration_hours: 24,
      source: 'manual',
    });
    setBlockIPTarget(null);
  };

  return (
    <div className="flex w-full min-h-screen">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`sidebar fixed lg:static z-50 w-64 h-screen flex flex-col transition-transform duration-300 lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-5 py-6">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center shadow-lg shadow-brand-500/20">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-base font-bold text-surface-100 tracking-tight">
              NetShield
            </h1>
            <p className="text-[0.65rem] text-surface-500 font-medium tracking-wider uppercase">
              Security Dashboard
            </p>
          </div>
          <button
            className="ml-auto lg:hidden text-surface-400 hover:text-surface-100"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation — grouped */}
        <nav className="flex-1 px-3 overflow-y-auto" style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          {navGroups.map(group => (
            <div key={group.label} style={{ marginBottom: '0.5rem' }}>
              <p className="sidebar-section-title">{group.label}</p>
              {group.items.map(item => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
                  onClick={() => setSidebarOpen(false)}
                >
                  <item.icon className="w-[18px] h-[18px]" />
                  {item.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        {/* Status indicator */}
        <div className="px-5 py-4 border-t border-surface-800/50">
          <div className="flex items-center gap-2 text-[0.7rem] text-surface-500">
            <Activity className="w-3.5 h-3.5 text-success" />
            <span>Sistema activo</span>
          </div>
          <p className="text-[0.6rem] text-surface-600 mt-1">
            Lab: 192.168.100.118
          </p>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-h-screen overflow-x-hidden">
        {/* Top bar */}
        <header className="sticky top-0 z-30 flex items-center gap-4 px-6 py-3 bg-surface-950/80 backdrop-blur-xl border-b border-surface-800/30">
          <button
            className="lg:hidden text-surface-400 hover:text-surface-100"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Global Search */}
          <div style={{ flex: 1 }}>
            <GlobalSearch
              onBlockIP={ip => setBlockIPTarget(ip)}
              onShowIpContext={ip => setIpContextTarget(ip)}
            />
          </div>

          {/* Status dots + MockModeBadge + Notification Bell */}
          <div className="flex items-center gap-3 text-xs text-surface-400">
            <div className="flex items-center gap-1.5" title={mtHealth ? `MikroTik: ${mtHealth.version}` : 'MikroTik'}>
              <span className={getStatusClass(mtLoading, mtError, mtHealth)} />
              MikroTik
            </div>
            <div className="flex items-center gap-1.5" title={wazuhHealth ? `Wazuh: ${wazuhHealth.version}` : 'Wazuh'}>
              <span className={getStatusClass(wazuhLoading, wazuhError, wazuhHealth)} />
              Wazuh
            </div>
            <div className="flex items-center gap-1.5" title={csHealth ? `CrowdSec: ${csHealth.active_decisions} decisiones activas` : 'CrowdSec'}>
              <span className={getStatusClass(csLoading, csError, csHealth)} />
              CrowdSec
            </div>
            <MockModeBadge />
            <NotificationPanel
              onBlockIP={ip => setBlockIPTarget(ip)}
              onShowIpContext={ip => setIpContextTarget(ip)}
            />
          </div>
        </header>

        {/* Page content */}
        <div className="flex-1 p-6">
          <Outlet />
        </div>
      </main>

      {/* Global Block IP Confirm Modal */}
      {blockIPTarget && (
        <ConfirmModal
          title="Bloquear IP"
          description="Esta IP será añadida a Blacklist_Automatica en MikroTik por 24 horas."
          data={{ IP: blockIPTarget, Duración: '24h', Lista: 'Blacklist_Automatica' }}
          confirmLabel="Bloquear"
          onConfirm={handleBlockIPConfirm}
          onCancel={() => setBlockIPTarget(null)}
          isLoading={blockIPMutation.isPending}
        />
      )}

      {/* Global IP Context Panel (CrowdSec unified view) */}
      <IpContextPanel
        ip={ipContextTarget}
        onClose={() => setIpContextTarget(null)}
        onFullBlock={ip => { setIpContextTarget(null); setBlockIPTarget(ip); }}
      />
    </div>
  );
}
