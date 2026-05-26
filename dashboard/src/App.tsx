import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Header from './components/layout/Header';
import Sidebar from './components/layout/Sidebar';
import Footer from './components/layout/Footer';
import { ErrorBoundary } from './components/ErrorBoundary';
import Login from './pages/Login';
import UsersPage from './pages/Users';
import DomainsPage from './pages/Domains';
import SettingsPage from './pages/Settings';
import FirewallPage from './pages/Firewall';
import ClientLogin from './pages/ClientLogin';
import ClientDashboard from './pages/ClientDashboard';
import ProcessesPage from './pages/Processes';
import Dashboard from './pages/Dashboard';
import LogViewerPage from './pages/Logs';
import ClientSettingsPage from './pages/ClientSettings';
import ClientDatabasesPage from './pages/ClientDatabases';
import ClientEmailPage from './pages/ClientEmail';
import ClientAppsPage from './pages/ClientApps';
import ClientBillingPage from './pages/ClientBilling';
import ClientBackupsPage from './pages/ClientBackups';
import ClientFileManager from './pages/ClientFileManager';
import ClientGitManager from './pages/ClientGitManager';
import SecurityPage from './pages/Security';
import NetworkPage from './pages/Network';
import ThemeEnginePage from './pages/ThemeEngine';
import UserSettingsPage from './pages/UserSettings';
import ClusterPage from './pages/Cluster';
import PackagesPage from './pages/Packages';
import DatabasesPage from './pages/Databases';
import ServiceManagerPage from './pages/ServiceManager';
import UpdatesPage from './pages/Updates';
import ClientCronManager from './pages/ClientCronManager';
import AdminCronManager from './pages/AdminCronManager';
import ClientFtpManager from './pages/ClientFtpManager';
import AdminFtpManager from './pages/AdminFtpManager';
import ClientDnsManager from './pages/ClientDnsManager';
import AdminDnsManager from './pages/AdminDnsManager';
import AdminNameserversPage from './pages/AdminNameservers';
import AdminUserWebsitesPage from './pages/AdminUserWebsites';
import AdminUserDatabasesPage from './pages/AdminUserDatabases';
import SpamDashboard from './pages/SpamDashboard';
import AdminMonitoring from './pages/AdminMonitoring';
import ResellerManager from './pages/ResellerManager';
import ResellerBranding from './pages/ResellerBranding';

// ---------------------------------------------------------------------------
// JWT helpers — decode payload WITHOUT verification (verification is server-side)
// We only use this for UI routing decisions; the API enforces auth on every request.
// ---------------------------------------------------------------------------
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = parts[1];
    if (!payload) return null;
    const padded = payload.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = atob(padded);
    return JSON.parse(decoded) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function getTokenRole(): 'admin' | 'client' | null {
  const token = localStorage.getItem('token');
  if (!token) return null;
  const payload = decodeJwtPayload(token);
  if (!payload) return null;
  const role = payload['role'];
  if (role === 'admin' || role === 'client') return role;
  return null;
}

function isTokenExpired(): boolean {
  const token = localStorage.getItem('token');
  if (!token) return true;
  const payload = decodeJwtPayload(token);
  if (!payload) return true;
  const exp = payload['exp'];
  if (typeof exp !== 'number') return true;
  return Date.now() / 1000 > exp;
}

// ---------------------------------------------------------------------------
// CSS color validation
// ---------------------------------------------------------------------------
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

function safeSetCssVar(varName: string, value: unknown): void {
  if (typeof value === 'string' && (HEX_COLOR_RE.test(value) || value.startsWith('rgb') || value.startsWith('hsl'))) {
    document.documentElement.style.setProperty(varName, value);
  }
}

// ---------------------------------------------------------------------------
// ProtectedRoute — reads role from JWT payload, not a separate localStorage key
// ---------------------------------------------------------------------------
const ProtectedRoute = ({ children, role }: { children: React.ReactElement; role?: 'admin' | 'client' }) => {
  // Check token presence and expiry
  if (isTokenExpired()) {
    localStorage.removeItem('token');
    return <Navigate to={role === 'client' ? '/client/login' : '/login'} replace />;
  }

  // Check role from JWT payload directly
  const tokenRole = getTokenRole();
  if (role && tokenRole !== role) {
    // Wrong role — redirect to appropriate login
    return <Navigate to={role === 'client' ? '/client/login' : '/login'} replace />;
  }

  return children;
};

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------
const Layout = ({ role }: { role: 'admin' | 'client' }) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [themeLoaded, setThemeLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    import('./api/client').then(({ default: api }) => {
      api.get('/themes/active')
        .then(res => {
          if (cancelled) return;
          const theme = res.data;

          // Validate each color before applying to prevent CSS injection
          safeSetCssVar('--theme-primary', theme.primary_color);
          safeSetCssVar('--theme-secondary', theme.secondary_color);
          safeSetCssVar('--theme-bg', theme.background_color);
          safeSetCssVar('--theme-text', theme.text_color);
          safeSetCssVar('--theme-sidebar', theme.sidebar_bg);

          if (theme.background_color && HEX_COLOR_RE.test(theme.background_color)) {
            document.body.style.backgroundColor = theme.background_color;
          }

          setThemeLoaded(true);
        })
        .catch(() => {
          if (!cancelled) setThemeLoaded(true);
        });
    });

    return () => { cancelled = true; };
  }, []);

  if (!themeLoaded) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-50 text-slate-500">
        Loading Configuration...
      </div>
    );
  }

  return (
    <div
      className="flex h-screen font-sans overflow-hidden transition-colors duration-500"
      style={{ backgroundColor: 'var(--theme-bg)' }}
    >
      <Sidebar isOpen={isSidebarOpen} userRole={role} />

      {/* Mobile sidebar overlay */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-slate-900/50 z-30 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        <Header toggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)} userRole={role} />

        <main className="flex-1 overflow-y-auto p-4 lg:p-8 scroll-smooth flex flex-col">
          <div className="flex-1 max-w-7xl w-full mx-auto">
            <ErrorBoundary>
              <Routes>
                {role === 'admin' ? (
                  <>
                    <Route index element={<Dashboard />} />
                    <Route path="users" element={<UsersPage />} />
                    <Route path="users/:id/settings" element={<UserSettingsPage />} />
                    <Route path="users/:id/websites" element={<AdminUserWebsitesPage />} />
                    <Route path="users/:id/databases" element={<AdminUserDatabasesPage />} />
                    <Route path="packages" element={<PackagesPage />} />
                    <Route path="databases" element={<DatabasesPage />} />
                    <Route path="domains" element={<DomainsPage />} />
                    <Route path="firewall" element={<FirewallPage />} />
                    <Route path="processes" element={<ProcessesPage />} />
                    <Route path="logs" element={<LogViewerPage />} />
                    <Route path="network" element={<NetworkPage />} />
                    <Route path="security" element={<SecurityPage />} />
                    <Route path="themes" element={<ThemeEnginePage />} />
                    <Route path="cluster" element={<ClusterPage />} />
                    <Route path="services" element={<ServiceManagerPage />} />
                    <Route path="updates" element={<UpdatesPage />} />
                    <Route path="monitoring" element={<AdminMonitoring />} />
                    <Route path="spam" element={<SpamDashboard mode="admin" />} />
                    <Route path="resellers" element={<ResellerManager />} />
                    <Route path="branding" element={<ResellerBranding />} />
                    <Route path="cron" element={<AdminCronManager />} />
                    <Route path="ftp" element={<AdminFtpManager />} />
                    <Route path="dns" element={<AdminDnsManager />} />
                    <Route path="nameservers" element={<AdminNameserversPage />} />
                    <Route path="settings" element={<SettingsPage />} />
                  </>
                ) : (
                  <>
                    <Route index element={<ClientDashboard />} />
                    <Route path="settings" element={<ClientSettingsPage />} />
                    <Route path="databases" element={<ClientDatabasesPage />} />
                    <Route path="email" element={<ClientEmailPage />} />
                    <Route path="spam" element={<SpamDashboard />} />
                    <Route path="apps" element={<ClientAppsPage />} />
                    <Route path="cron" element={<ClientCronManager />} />
                    <Route path="ftp" element={<ClientFtpManager />} />
                    <Route path="dns" element={<ClientDnsManager />} />
                    <Route path="files" element={<ClientFileManager />} />
                    <Route path="git" element={<ClientGitManager />} />
                    <Route path="billing" element={<ClientBillingPage />} />
                    <Route path="backups" element={<ClientBackupsPage />} />
                  </>
                )}
              </Routes>
            </ErrorBoundary>
          </div>
          <Footer />
        </main>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// App root
// ---------------------------------------------------------------------------
function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/client/login" element={<ClientLogin />} />

          {/* Admin Routes */}
          <Route
            path="/*"
            element={
              <ProtectedRoute role="admin">
                <Layout role="admin" />
              </ProtectedRoute>
            }
          />

          {/* Client Routes */}
          <Route
            path="/client/*"
            element={
              <ProtectedRoute role="client">
                <Layout role="client" />
              </ProtectedRoute>
            }
          />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;
