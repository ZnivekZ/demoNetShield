/**
 * Layout.tsx — Main application shell with sidebar navigation and header.
 *
 * NAVIGATION ARCHITECTURE DECISION (2026-04-03):
 * -----------------------------------------------
 * Original: Dashboard / Firewall / VLANs / Red & IPs / Reportes (5 items)
 *
 * Current structure (7 groups):
 *   SEGURIDAD group:
 *     - Seguridad (/)          — QuickView: alerts, MITRE, top agents
 *     - Configuración (/security/config) — Blacklist, geo-block, sinkhole settings
 *   INFRAESTRUCTURA group:
 *     - Red (/network)         — Traffic, interfaces, VLANs, ARP, labels, groups
 *     - Firewall (/firewall)   — Rules, blocks, blacklists
 *   HERRAMIENTAS group:
 *     - Phishing (/phishing)   — Detection, victims, domain management, sinkhole
 *     - Sistema (/system)      — Unified MikroTik + Wazuh health, Remote CLI
 *     - Reportes (/reports)    — AI reports
 *
 * Extensibility: Add items to the navGroups array below.
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
  ChevronLeft,
  Activity,
  Package,
  ShieldCheck,
  Globe,
  Settings2,
  LayoutDashboard,
  Server,
  LogOut,
  Bell,
  Bug,
  Target,
} from 'lucide-react';
import { useState } from 'react';
import { GlobalSearch } from './common/GlobalSearch';
import { NotificationPanel } from './security/NotificationPanel';
import { ConfirmModal } from './common/ConfirmModal';
import { useBlockIP } from '../hooks/useSecurityActions';
import { IpContextPanel } from './crowdsec/IpContextPanel';
import { SettingsDrawer } from './common/SettingsDrawer';
import { useAuthContext } from './auth/AuthContext';

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
      { to: '/dhcp', icon: Server, label: 'DHCP', end: false },
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
  {
    label: 'Wazuh SIEM',
    items: [
      { to: '/wazuh', icon: ShieldAlert, label: 'Dashboard', end: true },
      { to: '/wazuh/alerts', icon: Bell, label: 'Alertas', end: false },
      { to: '/wazuh/agents', icon: Server, label: 'Agentes', end: false },
      { to: '/wazuh/vulnerabilities', icon: Bug, label: 'Vulnerabilidades', end: false },
      { to: '/wazuh/mitre', icon: Target, label: 'MITRE ATT&CK', end: false },
    ],
  },
  {
    label: 'Mis Vistas',
    items: [
      { to: '/views', icon: LayoutDashboard, label: 'Vistas personalizadas', end: false },
    ],
  },
];

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarHidden, setSidebarHidden] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { user, logout } = useAuthContext();

  // Global block IP flow (triggered by GlobalSearch or NotificationPanel)
  const [blockIPTarget, setBlockIPTarget] = useState<string | null>(null);
  const blockIPMutation = useBlockIP();
  // Global IP context panel (CrowdSec unified view)
  const [ipContextTarget, setIpContextTarget] = useState<string | null>(null);


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
    <div className="w-full min-h-screen">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`sidebar fixed top-0 left-0 z-50 w-64 h-screen flex flex-col transition-transform duration-300 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } ${sidebarHidden ? 'lg:-translate-x-full' : 'lg:translate-x-0'}`}
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
            className="ml-auto hidden lg:flex items-center justify-center text-surface-400 hover:text-surface-100 transition-colors"
            onClick={() => setSidebarHidden(true)}
            aria-label="Ocultar menú lateral"
            title="Ocultar menú lateral"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            className="ml-auto lg:hidden text-surface-400 hover:text-surface-100"
            onClick={() => setSidebarOpen(false)}
            aria-label="Cerrar menú lateral"
            title="Cerrar menú lateral"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation — grouped */}
        <nav className="sidebar-scroll-area flex-1 min-h-0 px-3" style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
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

        {/* Status indicator + User info */}
        <div className="px-5 py-4 border-t border-surface-800/50">
          <div className="flex items-center gap-2 text-[0.7rem] text-surface-500">
            <Activity className="w-3.5 h-3.5 text-success" />
            <span>Sistema activo</span>
          </div>
          <p className="text-[0.6rem] text-surface-600 mt-1">
            Lab: 192.168.100.118
          </p>
          {/* Current user + logout */}
          {user && (
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-surface-800/50">
              <span className="text-[0.7rem] text-surface-400 font-medium truncate">
                {user.full_name || user.username}
              </span>
              <button
                id="sidebar-logout-btn"
                onClick={logout}
                className="flex items-center gap-1 text-[0.65rem] text-surface-500 hover:text-danger transition-colors"
                title="Cerrar sesión"
              >
                <LogOut className="w-3 h-3" />
                Salir
              </button>
            </div>
          )}
        </div>
      </aside>

      {sidebarHidden && (
        <button
          className="sidebar-toggle-floating hidden lg:flex"
          onClick={() => setSidebarHidden(false)}
          aria-label="Mostrar menú lateral"
          title="Mostrar menú lateral"
        >
          <Menu className="w-4 h-4" />
        </button>
      )}

      {/* Main Content */}
      <main className={`flex flex-col min-h-screen overflow-x-hidden transition-[margin] duration-300 ${sidebarHidden ? 'lg:ml-0' : 'lg:ml-64'}`}>
        {/* Top bar */}
        <header className={`sticky top-0 z-30 flex items-center gap-4 px-6 py-3 bg-surface-950/80 backdrop-blur-xl border-b border-surface-800/30 transition-[padding] duration-300 ${sidebarHidden ? 'lg:pl-16' : ''}`}>
          <button
            className="lg:hidden text-surface-400 hover:text-surface-100"
            onClick={() => setSidebarOpen(true)}
            aria-label="Abrir menú lateral"
            title="Abrir menú lateral"
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

          {/* Notification Bell */}
          <div className="flex items-center gap-3 text-xs text-surface-400">
            <NotificationPanel
              onBlockIP={ip => setBlockIPTarget(ip)}
              onShowIpContext={ip => setIpContextTarget(ip)}
            />
            {/* Settings gear button */}
            <button
              id="settings-drawer-toggle"
              className="settings-gear-btn"
              onClick={() => setSettingsOpen(true)}
              aria-label="Abrir Centro de Control"
              title="Centro de Control"
            >
              <Settings className="w-4 h-4" />
            </button>
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

      {/* Settings Drawer — Centro de Control */}
      <SettingsDrawer
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  );
}
