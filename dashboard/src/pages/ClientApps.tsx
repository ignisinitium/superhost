import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import { Zap, DownloadCloud, Globe, Lock, User, AtSign, TextCursor } from 'lucide-react';
import toast from 'react-hot-toast';

interface Domain {
  id: number;
  domain_name: string;
}

const ClientAppsPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [domainId, setDomainId] = useState('');
  const [siteTitle, setSiteTitle] = useState('');
  const [adminUser, setAdminUser] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminEmail, setAdminEmail] = useState('');

  const { data: domains } = useQuery<Domain[]>({
    queryKey: ['clientDomains'],
    queryFn: async () => {
      const res = await api.get('/client/domains');
      return res.data;
    }
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
      toast.success('WordPress installation started! It will be ready in a few minutes.');
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

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">1-Click App Installer</h1>
          <p className="text-slate-500 mt-1">Instantly deploy popular applications to your domains.</p>
        </div>
      </div>

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
              <p className="text-sm text-slate-500">The world's most popular CMS. Version 6.x</p>
            </div>
          </div>
          <span className="bg-blue-50 text-blue-600 text-xs font-bold px-3 py-1.5 rounded-full border border-blue-100 flex items-center gap-1">
            <Zap size={14} /> Available
          </span>
        </div>
        
        <div className="p-8">
          <form 
            onSubmit={(e) => { e.preventDefault(); installWpMutation.mutate(); }}
            className="space-y-6 max-w-2xl"
          >
            <div className="space-y-2">
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Installation Domain</label>
              <div className="relative">
                <Globe className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <select
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pl-10 pr-4 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all font-mono text-sm appearance-none"
                  value={domainId}
                  onChange={(e) => setDomainId(e.target.value)}
                  required
                >
                  <option value="" disabled>Select a domain...</option>
                  {domains?.map(d => (
                    <option key={d.id} value={d.id}>{d.domain_name}</option>
                  ))}
                </select>
              </div>
              <p className="text-xs text-slate-400 ml-1">This will overwrite existing files in the domain's public directory.</p>
            </div>

            <div className="space-y-2">
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Site Title</label>
              <div className="relative">
                <TextCursor className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  type="text"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pl-10 pr-4 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all text-sm"
                  value={siteTitle}
                  onChange={(e) => setSiteTitle(e.target.value)}
                  placeholder="My Awesome Blog"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Admin Username</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input
                    type="text"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pl-10 pr-4 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all font-mono text-sm"
                    value={adminUser}
                    onChange={(e) => setAdminUser(e.target.value.replace(/[^a-zA-Z0-9]/g, ''))}
                    placeholder="admin"
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Admin Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input
                    type="password"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pl-10 pr-4 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all font-mono text-sm"
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    required
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Admin Email</label>
              <div className="relative">
                <AtSign className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  type="email"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pl-10 pr-4 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all font-mono text-sm"
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  placeholder="admin@yourdomain.com"
                  required
                />
              </div>
            </div>

            <button 
              type="submit"
              disabled={installWpMutation.isPending}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white py-4 rounded-xl font-bold transition-all shadow-lg shadow-blue-900/20 flex items-center justify-center gap-2 text-sm disabled:opacity-50 mt-4"
            >
              <DownloadCloud size={20} className={installWpMutation.isPending ? 'animate-bounce' : ''} />
              {installWpMutation.isPending ? 'Deploying Database & Application...' : 'Install WordPress Now'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ClientAppsPage;
