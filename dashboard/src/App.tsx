import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import Header from './components/layout/Header';
import Sidebar from './components/layout/Sidebar';
import Footer from './components/layout/Footer';
import { ErrorBoundary } from './components/ErrorBoundary';
import Login from './pages/Login';
import UsersPage from './pages/Users';
import DeletedUsersPage from './pages/DeletedUsers';
import DomainsPage from './pages/Domains';
import SettingsPage from './pages/Settings';
import FirewallPage from './pages/Firewall';
import ClientLogin from './pages/ClientLogin';
import SetClientPassword from './pages/SetClientPassword';
import MarketingHome from './pages/MarketingHome';
import Order from './pages/Order';
import OrderFilter from './pages/OrderFilter';
import OrderSuccess from './pages/OrderSuccess';
import ClientMailFilter from './pages/ClientMailFilter';
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
import AdminEmailPage from './pages/AdminEmail';
import SpamDashboard from './pages/SpamDashboard';
import MailSpamLogin from './pages/MailSpamLogin';
import AdminMonitoring from './pages/AdminMonitoring';
import ResellerManager from './pages/ResellerManager';
import ResellerBranding from './pages/ResellerBranding';
import TerminalPage from './pages/Terminal';
import AdminSpam from './pages/AdminSpam';
import MigrationPage from './pages/Migration';
import AuditLogPage from './pages/AuditLog';

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

function getTokenRole(): 'admin' | 'client' | 'mail_user' | null {
  const token = localStorage.getItem('token');
  if (!token) return null;
  const payload = decodeJwtPayload(token);
  if (!payload) return null;
  const role = payload['role'];
  if (role === 'admin' || role === 'client' || role === 'mail_user') return role;
  return null;
}

function getMailUserId(): number | null {
  const token = localStorage.getItem('token');
  if (!token) return null;
  const payload = decodeJwtPayload(token);
  if (!payload) return null;
  const id = payload['mailUserId'];
  return typeof id === 'number' ? id : null;
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
  if (isTokenExpired()) {
    localStorage.removeItem('token');
    return <Navigate to={role === 'client' ? '/client/login' : '/login'} replace />;
  }
  const tokenRole = getTokenRole();
  if (role && tokenRole !== role) {
    return <Navigate to={role === 'client' ? '/client/login' : '/login'} replace />;
  }
  return children;
};

// Public storefront at "/": marketing site for visitors; authenticated users
// are bounced to their dashboard.
const RootGate = () => {
  if (!isTokenExpired()) {
    const role = getTokenRole();
    if (role === 'admin') return <Navigate to="/dashboard" replace />;
    if (role === 'client') return <Navigate to="/client" replace />;
  }
  return <MarketingHome />;
};

// Accepts both 'client' and 'mail_user' tokens — used for the standalone /spam route
const SpamProtectedRoute = ({ children }: { children: React.ReactElement }) => {
  if (isTokenExpired()) {
    localStorage.removeItem('token');
    return <Navigate to="/spam-login" replace />;
  }
  const tokenRole = getTokenRole();
  if (tokenRole !== 'client' && tokenRole !== 'mail_user') {
    return <Navigate to="/spam-login" replace />;
  }

  return children;
};

// ---------------------------------------------------------------------------
// Impersonation banner — shown in client view when an admin is impersonating
// ---------------------------------------------------------------------------
const ImpersonationBanner: React.FC = () => {
  const navigate = useNavigate();
  const adminToken = localStorage.getItem('adminToken');
  const impersonatedUser = localStorage.getItem('impersonatedUser');

  if (!adminToken) return null;

  const exit = () => {
    localStorage.setItem('token', adminToken);
    localStorage.removeItem('adminToken');
    localStorage.removeItem('impersonatedUser');
    navigate('/');
  };

  return (
    <div className="flex items-center justify-between bg-amber-500 text-white px-5 py-2.5 text-sm font-medium shrink-0 z-40">
      <span className="flex items-center gap-2">
        <span className="text-base">👤</span>
        Viewing as <strong className="font-bold">{impersonatedUser}</strong>
        <span className="opacity-70 text-xs ml-1">— all actions are real</span>
      </span>
      <button
        onClick={exit}
        className="bg-white text-amber-700 hover:bg-amber-50 px-3 py-1 rounded-lg font-bold text-xs transition-colors shadow-sm"
      >
        ✕ Exit Impersonation
      </button>
    </div>
  );
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
        {role === 'client' && <ImpersonationBanner />}

        <main className="flex-1 overflow-y-auto p-4 lg:p-8 scroll-smooth flex flex-col">
          <div className="flex-1 max-w-7xl w-full mx-auto">
            <ErrorBoundary>
              <Routes>
                {role === 'admin' ? (
                  <>
                    <Route index element={<Navigate to="/dashboard" replace />} />
                    <Route path="dashboard" element={<Dashboard />} />
                    <Route path="users" element={<UsersPage />} />
                    <Route path="deleted-users" element={<DeletedUsersPage />} />
                    <Route path="users/:id/settings" element={<UserSettingsPage />} />
                    <Route path="users/:id/websites" element={<AdminUserWebsitesPage />} />
                    <Route path="users/:id/databases" element={<AdminUserDatabasesPage />} />
                    <Route path="users/:id/email" element={<AdminEmailPage />} />
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
                    <Route path="spam" element={<AdminSpam />} />
                    <Route path="audit" element={<AuditLogPage />} />
                    <Route path="resellers" element={<ResellerManager />} />
                    <Route path="branding" element={<ResellerBranding />} />
                    <Route path="cron" element={<AdminCronManager />} />
                    <Route path="ftp" element={<AdminFtpManager />} />
                    <Route path="dns" element={<AdminDnsManager />} />
                    <Route path="nameservers" element={<AdminNameserversPage />} />
                    <Route path="terminal" element={<TerminalPage />} />
                    <Route path="settings" element={<SettingsPage />} />
                    <Route path="migration" element={<MigrationPage />} />
                  </>
                ) : (
                  <>
                    <Route index element={<ClientDashboard />} />
                    <Route path="settings" element={<ClientSettingsPage />} />
                    <Route path="databases" element={<ClientDatabasesPage />} />
                    <Route path="email" element={<ClientEmailPage />} />
                    <Route path="spam" element={<SpamDashboard />} />
                    <Route path="mail-filter" element={<ClientMailFilter />} />
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
          {/* Public storefront */}
          <Route path="/" element={<RootGate />} />
          <Route path="/order" element={<Order />} />
          <Route path="/order/filter" element={<OrderFilter />} />
          <Route path="/order/success" element={<OrderSuccess />} />

          <Route path="/login" element={<Login />} />
          <Route path="/client/login" element={<ClientLogin />} />
          <Route path="/client/set-password" element={<SetClientPassword />} />
          <Route path="/spam-login" element={<MailSpamLogin />} />
          <Route
            path="/my-spam"
            element={
              <SpamProtectedRoute>
                <SpamDashboard mailUserIdOverride={getMailUserId()} />
              </SpamProtectedRoute>
            }
          />

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
