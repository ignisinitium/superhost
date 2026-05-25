import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { 
  Server, Users, Box, Settings, Shield, Database, 
  Home, Folder, Globe, Mail, Lock, Zap, LogOut, Terminal, Activity, ShieldAlert, CreditCard, Paintbrush
} from 'lucide-react';

interface SidebarProps {
  isOpen: boolean;
  userRole: 'admin' | 'client';
}

const Sidebar: React.FC<SidebarProps> = ({ isOpen, userRole }) => {
  const navigate = useNavigate();
  
  const adminMenuItems = [
    { label: 'Server Overview', icon: Server, path: '/' },
    { label: 'Account Management', icon: Users, path: '/users' },
    { label: 'Packages & Features', icon: Box, path: '/packages' },
    { label: 'Service Configs', icon: Settings, path: '/settings' },
    { label: 'Security & Firewall', icon: Shield, path: '/firewall' },
    { label: 'Virtual Networking', icon: Globe, path: '/network' },
    { label: 'Anti-Malware', icon: ShieldAlert, path: '/security' },
    { label: 'Theme Engine', icon: Paintbrush, path: '/themes' },
    { label: 'HA Cluster', icon: Server, path: '/cluster' },
    { label: 'Logs', icon: Terminal, path: '/logs' },
    { label: 'Processes', icon: Activity, path: '/processes' },
    { label: 'Backup Orchestration', icon: Database, path: '/backups' }
  ];

  const userMenuItems = [
    { label: 'My Dashboard', icon: Home, path: '/client' },
    { label: 'File Manager', icon: Folder, path: '/client/files' },
    { label: 'Databases', icon: Database, path: '/client/databases' },
    { label: 'Domains & DNS', icon: Globe, path: '/client/domains' },
    { label: 'Email Accounts', icon: Mail, path: '/client/email' },
    { label: 'SSL Certificates', icon: Lock, path: '/client/ssl' },
    { label: '1-Click Apps', icon: Zap, path: '/client/apps' },
    { label: 'Billing & Services', icon: CreditCard, path: '/client/billing' },
    { label: 'Account Settings', icon: Settings, path: '/client/settings' }
  ];

  const activeMenu = userRole === 'admin' ? adminMenuItems : userMenuItems;

  const handleLogout = () => {
    localStorage.setItem('token', '');
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    localStorage.removeItem('user');
    navigate(userRole === 'admin' ? '/login' : '/client/login');
  };

  return (
    <aside className={`
      fixed lg:static inset-y-0 left-0 z-40
      w-64 bg-slate-900 text-slate-300 transition-transform duration-300 ease-in-out
      ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      flex flex-col border-r border-slate-800 shadow-2xl
    `}>
      <div className="h-16 flex items-center px-6 border-b border-slate-800 bg-slate-950">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center shadow-lg shadow-orange-500/20">
            <Server className="w-5 h-5 text-white" />
          </div>
          <span className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-amber-400">
            Super Host
          </span>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto py-4">
        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 px-6">Management</div>
        <ul className="space-y-1 px-3">
          {activeMenu.map((item, idx) => (
            <li key={idx}>
              <NavLink 
                to={item.path} 
                className={({ isActive }) => `
                  flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
                  ${isActive 
                    ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20' 
                    : 'hover:bg-slate-800 hover:text-white border border-transparent'}
                `}
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <div className="p-4 border-t border-slate-800 bg-slate-900/50">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center border-2 border-slate-600">
            <span className="text-sm font-bold text-white uppercase">{userRole === 'admin' ? 'ROOT' : 'USR'}</span>
          </div>
          <div>
            <div className="text-sm font-medium text-white truncate w-32">
              {userRole === 'admin' ? 'System Admin' : 'Client User'}
            </div>
            <div className="text-xs text-slate-500">Connected</div>
          </div>
        </div>
        <button 
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 py-2 px-4 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors text-sm font-medium"
        >
          <LogOut className="w-4 h-4" />
          Secure Logout
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
