/**
 * PortalPage — Main Captive Portal page with internal tab navigation.
 * Single route /portal with 4 tabs: Monitor, Usuarios, Configuración, Estadísticas.
 * Tab state is local (useState) — no sub-routes needed.
 */
import { useState } from 'react';
import { Monitor, Users, Settings, BarChart2 } from 'lucide-react';
import { MonitorView } from './MonitorView';
import { UsersView } from './UsersView';
import { ConfigView } from './ConfigView';
import { StatsView } from './StatsView';

type Tab = 'monitor' | 'users' | 'config' | 'stats';

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'monitor', label: 'Monitor', icon: <Monitor size={15} /> },
  { id: 'users', label: 'Usuarios', icon: <Users size={15} /> },
  { id: 'config', label: 'Configuración', icon: <Settings size={15} /> },
  { id: 'stats', label: 'Estadísticas', icon: <BarChart2 size={15} /> },
];

export function PortalPage() {
  const [activeTab, setActiveTab] = useState<Tab>('monitor');

  return (
    <div className="portal-page">
      {/* Page header */}
      <div className="portal-page-header">
        <div>
          <h1 className="portal-page-title">Portal Cautivo</h1>
          <p className="portal-page-subtitle">Gestión de sesiones y usuarios del Hotspot MikroTik</p>
        </div>
      </div>

      {/* Tab bar — pill style matching existing pages */}
      <div className="portal-tabs" role="tablist" aria-label="Portal Cautivo">
        {TABS.map(tab => (
          <button
            key={tab.id}
            id={`portal-tab-${tab.id}`}
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`portal-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="portal-tab-content">
        {activeTab === 'monitor' && <MonitorView />}
        {activeTab === 'users' && <UsersView />}
        {activeTab === 'config' && <ConfigView />}
        {activeTab === 'stats' && <StatsView />}
      </div>
    </div>
  );
}
