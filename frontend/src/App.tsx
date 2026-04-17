/**
 * App.tsx — Route configuration for NetShield Dashboard.
 *
 * NAVIGATION DECISION (2026-04-03):
 * See Layout.tsx for full rationale on the 7-group navigation structure.
 *
 * Routes:
 *   /                  → QuickView (Security overview — replaces Dashboard)
 *   /security/config   → ConfigView (Blacklist, geo-block, DNS sinkhole)
 *   /network           → NetworkPage (traffic, ARP, labels, groups; VLANs tab merged in)
 *   /firewall          → FirewallPage (existing — firewall rules, blocks)
 *   /phishing          → PhishingPanel (detection, victims, sinkhole)
 *   /system            → SystemHealth (unified MikroTik + Wazuh health, CLI)
 *   /reports           → ReportsPage (existing — AI reports)
 *
 * Legacy routes:
 *   /vlans             → redirected to /network (VLANs tab now lives there)
 */
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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
// Suricata
import { SuricataMotorPage } from './components/suricata/MotorPage';
import { SuricataAlertsPage } from './components/suricata/AlertsPage';
import { SuricataNSMPage } from './components/suricata/NSMPage';
import { SuricataRulesPage } from './components/suricata/RulesPage';


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
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            {/* Security */}
            <Route path="/" element={<QuickView />} />
            <Route path="/security/config" element={<ConfigView />} />

            {/* Infrastructure */}
            <Route path="/network" element={<NetworkPage />} />
            <Route path="/firewall" element={<FirewallPage />} />
            <Route path="/portal" element={<PortalPage />} />

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

            {/* Suricata IDS/IPS/NSM */}
            <Route path="/suricata" element={<SuricataMotorPage />} />
            <Route path="/suricata/alerts" element={<SuricataAlertsPage />} />
            <Route path="/suricata/network" element={<SuricataNSMPage />} />
            <Route path="/suricata/rules" element={<SuricataRulesPage />} />

            {/* Legacy redirect — VLANs page merged into /network */}
            <Route path="/vlans" element={<Navigate to="/network" replace />} />

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
