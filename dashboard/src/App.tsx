import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Header from './components/layout/Header';
import Sidebar from './components/layout/Sidebar';
import Footer from './components/layout/Footer';
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

const ProtectedRoute = ({ children, role }: { children: React.ReactElement, role?: 'admin' | 'client' }) => {
  const token = localStorage.getItem('token');
  const userRole = (localStorage.getItem('role') || 'admin') as 'admin' | 'client';
  
  if (!token) return <Navigate to={role === 'client' ? '/client/login' : '/login'} />;
  if (role && userRole !== role) return <Navigate to="/" />;
  
  return children;
};

const Layout = ({ role }: { role: 'admin' | 'client' }) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [themeLoaded, setThemeLoaded] = useState(false);

  useEffect(() => {
    // Fetch active theme and apply CSS variables globally
    import('./api/client').then(({ default: api }) => {
      api.get('/themes/active').then(res => {
        const theme = res.data;
        const root = document.documentElement;
        
        root.style.setProperty('--theme-primary', theme.primary_color);
        root.style.setProperty('--theme-secondary', theme.secondary_color);
        root.style.setProperty('--theme-bg', theme.background_color);
        root.style.setProperty('--theme-text', theme.text_color);
        root.style.setProperty('--theme-sidebar', theme.sidebar_bg);

        document.body.style.backgroundColor = theme.background_color;
        
        setThemeLoaded(true);
      }).catch(err => {
        console.error("Failed to load theme", err);
        setThemeLoaded(true);
      });
    });
  }, []);

  if (!themeLoaded) return <div className="h-screen flex items-center justify-center bg-slate-50 text-slate-500">Loading Configuration...</div>;

  return (
    <div className="flex h-screen font-sans overflow-hidden transition-colors duration-500" style={{ backgroundColor: 'var(--theme-bg)' }}>
      <Sidebar 
        isOpen={isSidebarOpen} 
        userRole={role} 
      />
      
      {/* Mobile sidebar overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/50 z-30 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        <Header 
          toggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)} 
          userRole={role}
        />

        <main className="flex-1 overflow-y-auto p-4 lg:p-8 scroll-smooth flex flex-col">
          <div className="flex-1 max-w-7xl w-full mx-auto">
            <Routes>
              {role === 'admin' ? (
                <>
                  <Route index element={<Dashboard />} />
                  <Route path="users" element={<UsersPage />} />
                  <Route path="users/:id/settings" element={<UserSettingsPage />} />
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
                  <Route path="settings" element={<SettingsPage />} />
                </>
              ) : (
                <>
                  <Route index element={<ClientDashboard />} />
                  <Route path="settings" element={<ClientSettingsPage />} />
                  <Route path="databases" element={<ClientDatabasesPage />} />
                  <Route path="email" element={<ClientEmailPage />} />
                  <Route path="apps" element={<ClientAppsPage />} />
                  <Route path="files" element={<ClientFileManager />} />
                  <Route path="git" element={<ClientGitManager />} />
                  <Route path="billing" element={<ClientBillingPage />} />
                  <Route path="backups" element={<ClientBackupsPage />} />
                </>
              )}
            </Routes>
          </div>
          <Footer />
        </main>
      </div>
    </div>
  );
};

function App() {
  return (
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
  );
}

export default App;
