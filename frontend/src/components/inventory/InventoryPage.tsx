/**
 * InventoryPage — Root page for GLPI Inventory Management.
 * Provides 5 tabs: Salud | Activos | Tickets | Usuarios | Asignaciones
 * Integrated in App.tsx as /inventory route.
 */
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Activity, Monitor, Ticket, Users, Package, Link2 } from 'lucide-react';
import { HealthView } from './HealthView';
import { AssetsView } from './AssetsView';
import { TicketsView } from './TicketsView';
import { UsersView } from './UsersView';
import { AssignmentsView } from './AssignmentsView';
import { useGlpiStatus } from '../../hooks/useGlpiAssets';

type Tab = 'health' | 'assets' | 'tickets' | 'users' | 'assignments';

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'health', label: 'Salud', icon: Activity },
  { id: 'assets', label: 'Activos', icon: Monitor },
  { id: 'tickets', label: 'Tickets', icon: Ticket },
  { id: 'users', label: 'Usuarios', icon: Users },
  { id: 'assignments', label: 'Asignaciones', icon: Link2 },
];

const isTab = (value: string | null): value is Tab =>
  !!value && TABS.some((t) => t.id === value);

export function InventoryPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlTab = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState<Tab>(isTab(urlTab) ? urlTab : 'health');

  // Deep link desde la campanita: /inventory?tab=tickets
  useEffect(() => {
    if (isTab(urlTab)) setActiveTab(urlTab);
  }, [urlTab]);

  const selectTab = (id: Tab) => {
    setActiveTab(id);
    setSearchParams({ tab: id }, { replace: true });
  };

  // GLPI status check
  const { data: glpiStatus } = useGlpiStatus();

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
            <div className="inventory-status-badge inventory-status-badge--offline">
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
              onClick={() => selectTab(tab.id)}
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
        {activeTab === 'assignments' && <AssignmentsView />}
      </div>
    </div>
  );
}
