import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import { 
  Zap, Code, Terminal, Play, Square, RefreshCw, Trash2, Plus
} from 'lucide-react';
import toast from 'react-hot-toast';

interface Domain {
  id: number;
  domain_name: string;
}

interface App {
  id: number;
  name: string;
  type: 'node' | 'python';
  port: number;
  startup_script: string;
  status: string;
  domain_name: string;
  created_at: string;
}

const ClientAppsPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'installer' | 'custom'>('installer');
  const [isModalOpen, setIsModalOpen] = useState(false);

  // WordPress State
  const [domainId, setDomainId] = useState('');
  const [siteTitle, setSiteTitle] = useState('');
  const [adminUser, setAdminUser] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminEmail, setAdminEmail] = useState('');

  // Custom App State
  const [appName, setAppName] = useState('');
  const [appType, setAppType] = useState<'node' | 'python'>('node');
  const [appDomainId, setAppDomainId] = useState('');
  const [startupScript, setStartupScript] = useState('');

  const { data: domains } = useQuery<Domain[]>({
    queryKey: ['clientDomains'],
    queryFn: async () => {
      const res = await api.get('/client/domains');
      return res.data;
    }
  });

  const { data: apps, isLoading: isAppsLoading } = useQuery<App[]>({
    queryKey: ['userApps'],
    queryFn: async () => {
      const res = await api.get('/client/apps');
      return res.data;
    },
    enabled: activeTab === 'custom'
  });

  const installWpMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/client/apps/install-wordpress', {
        domainId: parseInt(domainId),
        title: siteTitle,
        adminUser,
        adminPassword,
        adminEmail
      });
      return res.data;
    },
    onSuccess: () => {
      toast.success('WordPress installation started!');
      setDomainId('');
      setSiteTitle('');
      setAdminUser('');
      setAdminPassword('');
      setAdminEmail('');
      queryClient.invalidateQueries({ queryKey: ['clientDatabases'] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Failed to start installation');
    }
  });

  const createAppMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/client/apps', {
        name: appName,
        type: appType,
        domainId: parseInt(appDomainId),
        startupScript
      });
      return res.data;
    },
    onSuccess: () => {
      toast.success('Application runtime setup initiated!');
      setIsModalOpen(false);
      setAppName('');
      setAppDomainId('');
      setStartupScript('');
      queryClient.invalidateQueries({ queryKey: ['userApps'] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Failed to create app');
    }
  });

  const manageAppMutation = useMutation({
    mutationFn: async ({ id, action }: { id: number, action: string }) => {
      const res = await api.post(`/client/apps/${id}/manage`, { action });
      return res.data;
    },
    onSuccess: (_, variables) => {
      toast.success(`App ${variables.action}ed!`);
      setTimeout(() => queryClient.invalidateQueries({ queryKey: ['userApps'] }), 2000);
    }
  });

  const deleteAppMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await api.delete(`/client/apps/${id}`);
      return res.data;
    },
    onSuccess: () => {
      toast.success('App deletion queued');
      queryClient.invalidateQueries({ queryKey: ['userApps'] });
    }
  });

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Application Manager</h1>
          <p className="text-slate-500 mt-1">Deploy managed apps or custom Node.js/Python runtimes.</p>
        </div>
        {activeTab === 'custom' && (
          <button
            onClick={() => setIsModalOpen(true)}
            className="bg-orange-600 hover:bg-orange-700 text-white px-5 py-2.5 rounded-xl font-bold transition-all shadow-md shadow-orange-900/10 flex items-center gap-2 text-sm"
          >
            <Plus size={18} />
            New Application
          </button>
        )}
      </div>

      <div className="flex space-x-1 bg-slate-200/50 p-1 rounded-xl w-fit">
        <button
          onClick={() => setActiveTab('installer')}
          className={`px-6 py-2.5 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${
            activeTab === 'installer' 
            ? 'bg-white text-slate-800 shadow-sm' 
            : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <Zap size={16} className="text-orange-500" />
          1-Click Installer
        </button>
        <button
          onClick={() => setActiveTab('custom')}
          className={`px-6 py-2.5 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${
            activeTab === 'custom' 
            ? 'bg-white text-slate-800 shadow-sm' 
            : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <Code size={16} className="text-blue-500" />
          Custom Runtimes
        </button>
      </div>

      {activeTab === 'installer' ? (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-[#21759b] flex items-center justify-center shadow-lg shadow-[#21759b]/20">
                <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12.158 12.786l-2.698 7.84c.806.236 1.657.365 2.54.365 1.047 0 2.05-.18 2.986-.51-.024-.037-.046-.078-.065-.123l-2.763-7.572zm9.842-1.786c0 .878-.124 1.722-.353 2.522l-4.108-11.233c.875 1.025 1.547 2.256 1.936 3.633 1.02 2.378 1.558 4.975 1.558 7.671 0 .618-.035 1.229-.101 1.832l1.068 2.924V11zm-22 0C0 17.627 5.373 23 12 23c2.454 0 4.733-.74 6.641-2l-3.64-9.974-1.63 4.735c-.015.045-.034.088-.057.13-.935.33-1.938.51-2.986.51-.884 0-1.734-.13-2.541-.365L4.766 7.42A10.96 10.96 0 000 11z"/>
                </svg>
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-800">WordPress</h2>
                <p className="text-sm text-slate-500">Deploy the world's most popular CMS.</p>
              </div>
            </div>
          </div>
          
          <div className="p-8">
            <form onSubmit={(e) => { e.preventDefault(); installWpMutation.mutate(); }} className="space-y-6 max-w-2xl">
              <div className="space-y-2">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Installation Domain</label>
                <select className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-sm" value={domainId} onChange={(e) => setDomainId(e.target.value)} required>
                  <option value="" disabled>Select a domain...</option>
                  {domains?.map(d => (<option key={d.id} value={d.id}>{d.domain_name}</option>))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Site Title</label>
                <input type="text" className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-sm" value={siteTitle} onChange={(e) => setSiteTitle(e.target.value)} placeholder="My Blog" required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Admin User</label>
                  <input type="text" className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-sm" value={adminUser} onChange={(e) => setAdminUser(e.target.value)} placeholder="admin" required />
                </div>
                <div className="space-y-2">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Admin Password</label>
                  <input type="password" className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-sm" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} required />
                </div>
              </div>
              <button type="submit" disabled={installWpMutation.isPending} className="w-full bg-orange-600 hover:bg-orange-700 text-white py-4 rounded-xl font-bold shadow-lg disabled:opacity-50">
                {installWpMutation.isPending ? 'Deploying...' : 'Install WordPress Now'}
              </button>
            </form>
          </div>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Terminal className="text-slate-700" size={20} />
              <h2 className="text-lg font-bold text-slate-800">Active Runtimes</h2>
            </div>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200 uppercase tracking-widest text-[10px]">
                <tr>
                  <th className="px-6 py-4">Application</th>
                  <th className="px-6 py-4">Domain / Proxy</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isAppsLoading ? (
                  <tr><td colSpan={4} className="px-6 py-8 text-center text-slate-400">Loading applications...</td></tr>
                ) : apps && apps.length > 0 ? (
                  apps.map((app) => (
                    <tr key={app.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4">
                         <div className="font-bold text-slate-800">{app.name}</div>
                         <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mt-0.5">{app.type} Runtime</div>
                      </td>
                      <td className="px-6 py-4">
                         <div className="text-slate-700 font-medium">{app.domain_name}</div>
                         <div className="text-[10px] font-mono text-slate-400">Proxied to localhost:{app.port}</div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border ${
                          app.status === 'online' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-slate-50 text-slate-600 border-slate-200'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${app.status === 'online' ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`}></span>
                          {app.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                           <button 
                             onClick={() => manageAppMutation.mutate({ id: app.id, action: app.status === 'online' ? 'stop' : 'start' })}
                             className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 transition-all"
                           >
                             {app.status === 'online' ? <Square size={16} /> : <Play size={16} />}
                           </button>
                           <button 
                             onClick={() => manageAppMutation.mutate({ id: app.id, action: 'restart' })}
                             className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 transition-all"
                           >
                             <RefreshCw size={16} />
                           </button>
                           <button 
                             onClick={() => { if(window.confirm('Delete this application?')) deleteAppMutation.mutate(app.id); }}
                             className="p-2 hover:bg-red-50 rounded-lg text-red-400 hover:text-red-600 transition-all"
                           >
                             <Trash2 size={16} />
                           </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr><td colSpan={4} className="px-6 py-12 text-center text-slate-400 italic">No custom applications found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-800">New Custom Application</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); createAppMutation.mutate(); }} className="p-6 space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">App Name</label>
                <input type="text" className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-sm" value={appName} onChange={(e) => setAppName(e.target.value)} placeholder="My Express App" required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Runtime</label>
                  <select className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-sm appearance-none outline-none" value={appType} onChange={(e) => setAppType(e.target.value as any)}>
                    <option value="node">Node.js</option>
                    <option value="python">Python 3</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Domain</label>
                  <select className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-sm appearance-none outline-none" value={appDomainId} onChange={(e) => setAppDomainId(e.target.value)} required>
                    <option value="" disabled>Select Domain</option>
                    {domains?.map(d => (<option key={d.id} value={d.id}>{d.domain_name}</option>))}
                  </select>
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Startup Script</label>
                <input type="text" className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-sm font-mono" value={startupScript} onChange={(e) => setStartupScript(e.target.value)} placeholder="e.g. index.js or app.py" required />
              </div>
              <div className="pt-4 flex gap-3">
                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 px-4 py-3 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 text-sm transition-all">Cancel</button>
                <button type="submit" disabled={createAppMutation.isPending} className="flex-1 px-4 py-3 rounded-xl font-bold text-white bg-orange-600 hover:bg-orange-700 shadow-md shadow-orange-900/10 text-sm transition-all disabled:opacity-50">
                  {createAppMutation.isPending ? 'Provisioning...' : 'Deploy Application'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ClientAppsPage;
