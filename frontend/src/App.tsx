/**
 * App.tsx — Route configuration for NetShield Dashboard.
 *
 * Auth flow:
 *   /login              → LoginPage (sin Layout, sin protección)
 *   todas las demás     → ProtectedRoute → Layout → página
 *
 * Routes:
 *   /                  → QuickView (Security overview)
 *   /security/config   → ConfigView
 *   /network           → NetworkPage
 *   /firewall          → FirewallPage
 *   /phishing          → PhishingPanel
 *   /system            → SystemHealth
 *   /reports           → ReportsPage
 *   /admin/users       → UsersManagementPage (acceso desde SettingsDrawer)
 *   /admin/audit       → AuditHistoryPage    (acceso desde SettingsDrawer)
 *
 * Legacy routes:
 *   /vlans             → redirected to /network
 */
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './components/auth/AuthContext';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import LoginPage from './components/auth/LoginPage';
import Layout from './components/Layout';
// Existing pages
import FirewallPage from './components/firewall/FirewallPage';
import NetworkPage from './components/network/NetworkPage';
import ReportsPage from './components/reports/ReportsPage';
// New pages
import { QuickView } from './components/security/QuickView';
import { ConfigView } from './components/security/ConfigView';
import { PhishingPanel } from './components/phishing/PhishingPanel';
import { SystemHealth } from './components/system/SystemHealth';
import { PortalPage } from './components/portal/PortalPage';
import { InventoryPage } from './components/inventory/InventoryPage';
// CrowdSec
import { CrowdSecCommandCenter } from './components/crowdsec/CommandCenter';
import { CrowdSecIntelligence } from './components/crowdsec/IntelligenceView';
import { CrowdSecConfig } from './components/crowdsec/ConfigView';
// Custom Views
import ViewsListPage from './components/views/ViewsListPage';
import ViewBuilderPage from './components/views/ViewBuilderPage';
import ViewDetailPage from './components/views/ViewDetailPage';
// Wazuh SIEM
import { WazuhDashboard } from './components/wazuh/WazuhDashboard';
import { WazuhAlertsPage } from './components/wazuh/AlertsPage';
import { WazuhAgentsPage } from './components/wazuh/AgentsPage';
import { WazuhVulnerabilitiesPage } from './components/wazuh/VulnerabilitiesPage';
import { WazuhMitrePage } from './components/wazuh/MitrePage';
import { AgentDetailPage as WazuhAgentDetailPage } from './components/wazuh/AgentDetailPanel';
// DHCP
import DhcpPage from './components/dhcp/DhcpPage';
// Admin
import UsersManagementPage from './components/admin/UsersManagementPage';
import AuditHistoryPage from './components/admin/AuditHistoryPage';


const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 2,
      staleTime: 5_000,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            {/* Login — outside Layout, no auth required */}
            <Route path="/login" element={<LoginPage />} />

            {/* Protected routes — require valid JWT */}
            <Route
              element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }
            >
              {/* Security */}
              <Route path="/" element={<QuickView />} />
              <Route path="/security/config" element={<ConfigView />} />

              {/* Infrastructure */}
              <Route path="/network" element={<NetworkPage />} />
              <Route path="/firewall" element={<FirewallPage />} />
              <Route path="/portal" element={<PortalPage />} />
              <Route path="/dhcp" element={<DhcpPage />} />

              {/* Tools */}
              <Route path="/phishing" element={<PhishingPanel />} />
              <Route path="/system" element={<SystemHealth />} />
              <Route path="/reports" element={<ReportsPage />} />

              {/* Inventory — GLPI */}
              <Route path="/inventory" element={<InventoryPage />} />

              {/* CrowdSec */}
              <Route path="/crowdsec" element={<CrowdSecCommandCenter />} />
              <Route path="/crowdsec/intelligence" element={<CrowdSecIntelligence />} />
              <Route path="/crowdsec/config" element={<CrowdSecConfig />} />

              {/* Legacy redirect — VLANs page merged into /network */}
              <Route path="/vlans" element={<Navigate to="/network" replace />} />

              {/* Custom Views */}
              <Route path="/views" element={<ViewsListPage />} />
              <Route path="/views/new" element={<ViewBuilderPage />} />
              <Route path="/views/:id" element={<ViewDetailPage />} />
              <Route path="/views/:id/edit" element={<ViewBuilderPage />} />

              {/* Wazuh SIEM */}
              <Route path="/wazuh" element={<WazuhDashboard />} />
              <Route path="/wazuh/alerts" element={<WazuhAlertsPage />} />
              <Route path="/wazuh/agents" element={<WazuhAgentsPage />} />
              <Route path="/wazuh/agents/:agentId" element={<WazuhAgentDetailPage />} />
              <Route path="/wazuh/vulnerabilities" element={<WazuhVulnerabilitiesPage />} />
              <Route path="/wazuh/mitre" element={<WazuhMitrePage />} />

              {/* Admin — accessible from SettingsDrawer */}
              <Route path="/admin/users" element={<UsersManagementPage />} />
              <Route path="/admin/audit" element={<AuditHistoryPage />} />

              {/* Fallback */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
