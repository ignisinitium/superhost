import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import api from '../../api/client';
import { BRAND } from '../../brand';
import Logo from '../Logo';
import {
  LayoutDashboard, Users, Package, Briefcase, Palette,
  Power, Download, Layers, BarChart2,
  Globe, Database, Clock, FolderOpen, HardDrive,
  ShieldCheck, ShieldAlert, Mail,
  Network, Terminal, Cpu, Paintbrush, Settings,
  Zap, GitBranch, CreditCard,
  Server, LogOut, RadioTower, UserX, ArrowDownToLine, ScrollText, ServerCog, Lock,
} from 'lucide-react';

interface SidebarProps {
  isOpen: boolean;
  userRole: 'admin' | 'client';
}

type MenuItem  = { label: string; icon: React.ElementType; path: string };
type MenuGroup = { section: string; items: MenuItem[] };

// ── Admin navigation ──────────────────────────────────────────────────────────
const adminGroups: MenuGroup[] = [
  {
    section: 'Overview',
    items: [
      { label: 'Dashboard',     icon: LayoutDashboard, path: '/dashboard' },
    ],
  },
  {
    section: 'Accounts',
    items: [
      { label: 'Users',          icon: Users,     path: '/users' },
      { label: 'Deleted Users',  icon: UserX,     path: '/deleted-users' },
      { label: 'Packages',       icon: Package,   path: '/packages' },
      { label: 'Resellers',      icon: Briefcase, path: '/resellers' },
      { label: 'White-Label',    icon: Palette,   path: '/branding' },
    ],
  },
  {
    section: 'Server',
    items: [
      { label: 'Services',       icon: Power,     path: '/services' },
      { label: 'Updates',        icon: Download,  path: '/updates' },
      { label: 'HA Cluster',     icon: Layers,    path: '/cluster' },
      { label: 'Monitoring',     icon: BarChart2, path: '/monitoring' },
    ],
  },
  {
    section: 'Hosting',
    items: [
      { label: 'Domains',        icon: Globe,     path: '/domains' },
      { label: 'DNS Zones',      icon: Network,      path: '/dns' },
      { label: 'SSL Certs',      icon: Lock,         path: '/ssl' },
      { label: 'Nameservers',    icon: RadioTower,   path: '/nameservers' },
      { label: 'Databases',      icon: Database,  path: '/databases' },
      { label: 'FTP Manager',    icon: FolderOpen, path: '/ftp' },
      { label: 'Cron Jobs',      icon: Clock,     path: '/cron' },
    ],
  },
  {
    section: 'Security',
    items: [
      { label: 'Firewall',       icon: ShieldCheck,  path: '/firewall' },
      { label: 'Malware Scan',   icon: ShieldAlert,  path: '/security' },
      { label: 'Spam Manager',   icon: Mail,         path: '/spam' },
      { label: 'Audit Log',      icon: ScrollText,   path: '/audit' },
    ],
  },
  {
    section: 'System',
    items: [
      { label: 'Networking',     icon: Globe,       path: '/network' },
      { label: 'Logs',           icon: Terminal,    path: '/logs' },
      { label: 'Processes',      icon: Cpu,         path: '/processes' },
      { label: 'Theme Engine',   icon: Paintbrush,       path: '/themes' },
      { label: 'CWP Migration',  icon: ArrowDownToLine,  path: '/migration' },
      { label: 'Site Migration', icon: ServerCog,        path: '/site-migration' },
      { label: 'Settings',       icon: Settings,         path: '/settings' },
    ],
  },
];

// ── Client navigation ─────────────────────────────────────────────────────────
const clientGroups: MenuGroup[] = [
  {
    section: 'Overview',
    items: [
      { label: 'Dashboard',      icon: LayoutDashboard, path: '/client' },
    ],
  },
  {
    section: 'Files & Storage',
    items: [
      { label: 'File Manager',   icon: FolderOpen,  path: '/client/files' },
      { label: 'FTP Accounts',   icon: Server,      path: '/client/ftp' },
      { label: 'Backups',        icon: HardDrive,   path: '/client/backups' },
    ],
  },
  {
    section: 'Hosting',
    items: [
      { label: 'DNS Manager',    icon: Network,     path: '/client/dns' },
      { label: 'Databases',      icon: Database,    path: '/client/databases' },
      { label: 'Cron Jobs',      icon: Clock,       path: '/client/cron' },
    ],
  },
  {
    section: 'Deploy',
    items: [
      { label: '1-Click Apps',   icon: Zap,         path: '/client/apps' },
      { label: 'Git Deploy',     icon: GitBranch,   path: '/client/git' },
    ],
  },
  {
    section: 'Email',
    items: [
      { label: 'Email Accounts', icon: Mail,        path: '/client/email' },
      { label: 'Spam Filter',    icon: ShieldAlert, path: '/client/spam' },
      { label: 'Mail Filtering', icon: ShieldCheck, path: '/client/mail-filter' },
    ],
  },
  {
    section: 'Account',
    items: [
      { label: 'Billing',        icon: CreditCard,  path: '/client/billing' },
      { label: 'Settings',       icon: Settings,    path: '/client/settings' },
    ],
  },
];

// ── Sidebar component ─────────────────────────────────────────────────────────
const Sidebar: React.FC<SidebarProps> = ({ isOpen, userRole }) => {
  const navigate = useNavigate();
  let groups = userRole === 'admin' ? adminGroups : clientGroups;
  // Spam-filter-only customers don't have hosting — show just the items they use.
  if (userRole === 'client') {
    let accountType = 'hosting';
    try { accountType = JSON.parse(localStorage.getItem('user') || '{}').account_type || 'hosting'; } catch { /* default */ }
    if (accountType === 'filter') {
      const allow = new Set(['/client', '/client/mail-filter', '/client/billing', '/client/settings']);
      groups = clientGroups
        .map(g => ({ ...g, items: g.items.filter(i => allow.has(i.path)) }))
        .filter(g => g.items.length > 0);
    }
  }
  // Customers see the "Quantum Creations" brand (violet); admins see the
  // "Superhost" engine brand (orange).
  const isClient = userRole === 'client';
  const activeCls = isClient
    ? 'bg-violet-500/15 text-violet-300 border border-violet-500/20'
    : 'bg-orange-500/15 text-orange-400 border border-orange-500/20';

  const handleLogout = async () => {
    // Revoke the token server-side (best-effort) before clearing local state.
    try {
      await api.post(userRole === 'admin' ? '/auth/logout' : '/client/auth/logout');
    } catch { /* ignore — still clear the local session */ }
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    localStorage.removeItem('user');
    localStorage.removeItem('admin');
    navigate(userRole === 'admin' ? '/login' : '/client/login');
  };

  return (
    <aside className={`
      fixed lg:static inset-y-0 left-0 z-40
      w-60 bg-slate-900 text-slate-300 flex flex-col
      border-r border-slate-800 shadow-2xl
      transition-transform duration-300 ease-in-out
      ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
    `}>
      {/* Logo */}
      <div className="h-14 flex items-center px-5 border-b border-slate-800 bg-slate-950 flex-shrink-0">
        {isClient ? (
          <div className="flex items-center gap-2.5">
            <Logo className="w-7 h-7 rounded-lg shadow-lg shadow-violet-500/20 flex-shrink-0" />
            <span className="text-lg font-bold text-violet-300 tracking-tight">
              {BRAND.name}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center shadow-lg shadow-orange-500/20 flex-shrink-0">
              <Server className="w-4 h-4 text-white" />
            </div>
            <span className="text-lg font-bold text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-amber-400 tracking-tight">
              Superhost
            </span>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 space-y-4">
        {groups.map((group) => (
          <div key={group.section}>
            {/* Section label — hide for single-item "Overview" group */}
            {group.items.length > 1 && (
              <div className="px-4 mb-1">
                <span className="text-[9px] font-bold text-slate-600 uppercase tracking-[0.15em]">
                  {group.section}
                </span>
              </div>
            )}
            <ul className="space-y-0.5 px-2">
              {group.items.map((item) => (
                <li key={item.path}>
                  <NavLink
                    to={item.path}
                    end={item.path === '/' || item.path === '/client'}
                    className={({ isActive }) =>
                      `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${
                        isActive
                          ? activeCls
                          : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100 border border-transparent'
                      }`
                    }
                  >
                    <item.icon className="w-4 h-4 flex-shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="flex-shrink-0 p-3 border-t border-slate-800">
        <div className="flex items-center gap-2.5 px-2 mb-2.5">
          <div className="w-7 h-7 rounded-full bg-slate-700 border border-slate-600 flex items-center justify-center flex-shrink-0">
            <span className="text-[10px] font-bold text-slate-300">
              {userRole === 'admin' ? 'A' : 'U'}
            </span>
          </div>
          <div className="min-w-0">
            <div className="text-xs font-semibold text-slate-200 truncate">
              {userRole === 'admin' ? 'Administrator' : 'Client Account'}
            </div>
            <div className="text-[10px] text-slate-500">
              {userRole === 'admin' ? 'Root Access' : 'Standard'}
            </div>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors text-xs font-semibold border border-red-500/10 hover:border-red-500/20"
        >
          <LogOut className="w-3.5 h-3.5" />
          Sign Out
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
