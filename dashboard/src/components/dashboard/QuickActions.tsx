import React from 'react';
import { Power, RefreshCw, Terminal, UploadCloud, Globe, Mail, Folder, Zap } from 'lucide-react';

interface QuickActionsProps {
  userRole: 'admin' | 'client';
}

const QuickActions: React.FC<QuickActionsProps> = ({ userRole }) => {
  const adminActions = [
    { title: 'Reboot Server', icon: Power, color: 'text-red-500', bg: 'bg-red-50' },
    { title: 'Restart Web Services', icon: RefreshCw, color: 'text-orange-500', bg: 'bg-orange-50' },
    { title: 'Root Terminal', icon: Terminal, color: 'text-slate-700', bg: 'bg-slate-100' },
    { title: 'Manual Backup', icon: UploadCloud, color: 'text-amber-600', bg: 'bg-amber-50' },
  ];

  const userActions = [
    { title: 'Add Domain', icon: Globe, color: 'text-orange-500', bg: 'bg-orange-50' },
    { title: 'Create Email', icon: Mail, color: 'text-emerald-500', bg: 'bg-emerald-50' },
    { title: 'File Manager', icon: Folder, color: 'text-amber-500', bg: 'bg-amber-50' },
    { title: 'Install WordPress', icon: Zap, color: 'text-orange-600', bg: 'bg-orange-50' },
  ];

  const actions = userRole === 'admin' ? adminActions : userActions;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      {actions.map((action, idx) => (
        <button key={idx} className="group bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-all flex flex-col items-center justify-center gap-3">
          <div className={`p-3 rounded-full ${action.bg} ${action.color} group-hover:scale-110 transition-transform`}>
            <action.icon className="w-6 h-6" />
          </div>
          <span className="text-sm font-medium text-slate-700">{action.title}</span>
        </button>
      ))}
    </div>
  );
};

export default QuickActions;
