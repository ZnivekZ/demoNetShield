/**
 * InventoryPage — Root page for GLPI Inventory Management.
 * Provides 4 tabs: Salud | Activos | Tickets | Usuarios
 * Integrated in App.tsx as /inventory route.
 */
import { useState } from 'react';
import { Activity, Monitor, Ticket, Users, Package } from 'lucide-react';
import { HealthView } from './HealthView';
import { AssetsView } from './AssetsView';
import { TicketsView } from './TicketsView';
import { UsersView } from './UsersView';
import { useQuery } from '@tanstack/react-query';
import { glpiApi } from '../../services/api';

type Tab = 'health' | 'assets' | 'tickets' | 'users';

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'health', label: 'Salud', icon: Activity },
  { id: 'assets', label: 'Activos', icon: Monitor },
  { id: 'tickets', label: 'Tickets', icon: Ticket },
  { id: 'users', label: 'Usuarios', icon: Users },
];

export function InventoryPage() {
  const [activeTab, setActiveTab] = useState<Tab>('health');

  // GLPI status check
  const { data: glpiStatus } = useQuery({
    queryKey: ['glpi', 'status'],
    queryFn: () => glpiApi.getStatus(),
    refetchInterval: 60_000,
    select: (res) => res.data,
  });

  return (
    <div className="inventory-page">
      {/* Page Header */}
      <div className="inventory-header">
        <div className="inventory-header__left">
          <div className="inventory-header__icon">
            <Package size={22} />
          </div>
          <div>
            <h1 className="inventory-header__title">Inventario GLPI</h1>
            <p className="inventory-header__subtitle">
              Gestión de activos, tickets y salud de equipos
            </p>
          </div>
        </div>

        {/* GLPI status badge */}
        <div className="inventory-header__status">
          {glpiStatus?.available ? (
            <div className="inventory-status-badge inventory-status-badge--live">
              <span className="status-dot active" />
              <span>GLPI Conectado</span>
            </div>
          ) : (
            <div className="inventory-status-badge inventory-status-badge--live" style={{ opacity: 0.7 }}>
              <span className="status-dot disconnected" />
              <span>GLPI Sin conexión</span>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="inventory-tabs">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              id={`inventory-tab-${tab.id}`}
              className={`inventory-tab ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <Icon size={15} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div className="inventory-content">
        {activeTab === 'health' && <HealthView />}
        {activeTab === 'assets' && <AssetsView />}
        {activeTab === 'tickets' && <TicketsView />}
        {activeTab === 'users' && <UsersView />}
      </div>
    </div>
  );
}
