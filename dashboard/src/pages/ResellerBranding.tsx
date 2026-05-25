import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import adminApi from '../api/admin';
import { 
  Palette, Save, Globe, Mail, Link, 
  Key, Plus, Trash2,
  Layout, Settings2
} from 'lucide-react';
import toast from 'react-hot-toast';

const ResellerBranding: React.FC = () => {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'branding' | 'keys'>('branding');

  // Branding Query
  const { data: branding, isLoading: isBrandingLoading } = useQuery({
    queryKey: ['brandingSettings'],
    queryFn: async () => {
      const res = await adminApi.get('/reseller/branding');
      return res.data;
    }
  });

  // API Keys Query
  const { data: keys, isLoading: isKeysLoading } = useQuery<any[]>({
    queryKey: ['apiKeys'],
    queryFn: async () => {
      const res = await adminApi.get('/reseller/keys');
      return res.data;
    }
  });

  // Branding Form
  const [formData, setFormData] = useState<any>(null);

  useEffect(() => {
    if (branding) setFormData(branding);
  }, [branding]);

  const updateBrandingMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await adminApi.put('/reseller/branding', data);
      return res.data;
    },
    onSuccess: () => {
      toast.success('Branding updated! Reloading theme...');
      queryClient.invalidateQueries({ queryKey: ['brandingSettings'] });
      // In a real app, we'd trigger a theme reload here
    }
  });

  const createKeyMutation = useMutation({
    mutationFn: async (label: string) => {
      const res = await adminApi.post('/reseller/keys', { label });
      return res.data;
    },
    onSuccess: (data) => {
      // Key is shown only once
      window.alert(`Your new API Key is: ${data.key}\n\nPLEASE COPY THIS NOW. It will never be shown again.`);
      queryClient.invalidateQueries({ queryKey: ['apiKeys'] });
    }
  });

  const deleteKeyMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await adminApi.delete(`/reseller/keys/${id}`);
      return res.data;
    },
    onSuccess: () => {
      toast.success('API key revoked');
      queryClient.invalidateQueries({ queryKey: ['apiKeys'] });
    }
  });

  if (isBrandingLoading) return <div className="p-12 text-center text-slate-400 animate-pulse">Loading branding profile...</div>;

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-3">
             <Palette className="text-indigo-600" size={28} />
             White-Label & Branding
          </h1>
          <p className="text-slate-500 mt-1 ml-1">Customize the control panel identity and manage programmatic access.</p>
        </div>
      </div>

      <div className="flex space-x-1 bg-slate-200/50 p-1 rounded-xl w-fit">
        <button onClick={() => setActiveTab('branding')} className={`px-6 py-2.5 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${activeTab === 'branding' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
          <Layout size={16} /> Visual Identity
        </button>
        <button onClick={() => setActiveTab('keys')} className={`px-6 py-2.5 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${activeTab === 'keys' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
          <Key size={16} /> API Access
        </button>
      </div>

      {activeTab === 'branding' && formData && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
           <div className="lg:col-span-2 space-y-6">
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6">
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-1">
                       <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Panel Display Name</label>
                       <input 
                         type="text" 
                         className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold" 
                         value={formData.panel_name || ''} 
                         onChange={e => setFormData({...formData, panel_name: e.target.value})}
                       />
                    </div>
                    <div className="space-y-1">
                       <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Support Email</label>
                       <div className="relative">
                          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                          <input 
                            type="email" 
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pl-10 pr-4 text-sm" 
                            value={formData.support_email || ''} 
                            onChange={e => setFormData({...formData, support_email: e.target.value})}
                          />
                       </div>
                    </div>
                 </div>

                 <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Logo URL (SVG/PNG)</label>
                    <div className="relative">
                       <Link className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                       <input 
                         type="text" 
                         className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pl-10 pr-4 text-sm font-mono" 
                         value={formData.logo_url || ''} 
                         onChange={e => setFormData({...formData, logo_url: e.target.value})}
                         placeholder="https://cdn.yourdomain.com/logo.svg"
                       />
                    </div>
                 </div>

                 <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Custom Domain (CNAME)</label>
                    <div className="relative">
                       <Globe className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                       <input 
                         type="text" 
                         className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pl-10 pr-4 text-sm font-mono" 
                         value={formData.custom_domain || ''} 
                         onChange={e => setFormData({...formData, custom_domain: e.target.value})}
                         placeholder="cp.yourcompany.com"
                       />
                    </div>
                 </div>

                 <div className="pt-4 flex justify-end">
                    <button 
                      onClick={() => updateBrandingMutation.mutate(formData)}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-3 rounded-xl font-bold transition-all shadow-lg shadow-indigo-900/20 flex items-center gap-2"
                    >
                       <Save size={18} /> Update Branding
                    </button>
                 </div>
              </div>
           </div>

           <div className="space-y-6">
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                 <h3 className="text-sm font-bold text-slate-800 mb-4">Color Palette</h3>
                 <div className="space-y-4">
                    <div className="flex items-center justify-between">
                       <span className="text-xs text-slate-500 font-medium">Primary Brand Color</span>
                       <input 
                         type="color" 
                         className="w-10 h-10 border-0 p-0 bg-transparent cursor-pointer rounded-lg overflow-hidden" 
                         value={formData.primary_color || '#4f46e5'} 
                         onChange={e => setFormData({...formData, primary_color: e.target.value})}
                       />
                    </div>
                    <div className="p-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 flex items-center gap-3">
                       <div className="w-8 h-8 rounded-lg shadow-sm" style={{ backgroundColor: formData.primary_color }}></div>
                       <div className="text-[10px] font-mono font-bold text-slate-600">{formData.primary_color}</div>
                    </div>
                 </div>
              </div>

              <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-6">
                 <h3 className="text-sm font-bold text-indigo-900 mb-2 flex items-center gap-2">
                    <Settings2 size={16} />
                    Live Preview
                 </h3>
                 <p className="text-xs text-indigo-700 mb-4">This color will be used for buttons, links, and active states in the panel.</p>
                 <button 
                   className="w-full py-2.5 rounded-lg font-bold text-white text-xs shadow-sm transition-all"
                   style={{ backgroundColor: formData.primary_color }}
                 >
                    Sample Button
                 </button>
              </div>
           </div>
        </div>
      )}

      {activeTab === 'keys' && (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
           <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-800">API Access Keys</h2>
              <button 
                onClick={() => { const label = window.prompt('Key Label (e.g. "WHMCS Integration")'); if(label) createKeyMutation.mutate(label); }}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl font-bold transition-all text-xs flex items-center gap-2"
              >
                 <Plus size={14} /> New API Key
              </button>
           </div>
           <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                 <thead className="bg-slate-50 text-slate-500 border-b border-slate-200 uppercase tracking-widest text-[10px] font-bold">
                   <tr>
                     <th className="px-6 py-4">Label</th>
                     <th className="px-6 py-4">Key Prefix</th>
                     <th className="px-6 py-4">Last Used</th>
                     <th className="px-6 py-4 text-right">Actions</th>
                   </tr>
                 </thead>
                 <tbody className="divide-y divide-slate-100">
                    {isKeysLoading ? (
                       <tr><td colSpan={4} className="px-6 py-8 text-center animate-pulse">Loading keys...</td></tr>
                    ) : keys && keys.length > 0 ? (
                       keys.map(key => (
                          <tr key={key.id} className="hover:bg-slate-50/50 transition-colors">
                             <td className="px-6 py-4 font-bold text-slate-700">{key.label}</td>
                             <td className="px-6 py-4">
                                <code className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-mono text-xs">sh_{key.key_prefix}...</code>
                             </td>
                             <td className="px-6 py-4 text-slate-400 text-xs italic">
                                {key.last_used_at ? new Date(key.last_used_at).toLocaleDateString() : 'Never used'}
                             </td>
                             <td className="px-6 py-4 text-right">
                                <button onClick={() => { if(window.confirm('Revoke this key?')) deleteKeyMutation.mutate(key.id); }} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                                   <Trash2 size={16} />
                                </button>
                             </td>
                          </tr>
                       ))
                    ) : (
                       <tr><td colSpan={4} className="px-6 py-12 text-center text-slate-400 italic">No API keys created yet. Programmatic access is disabled.</td></tr>
                    )}
                 </tbody>
              </table>
           </div>
        </div>
      )}
    </div>
  );
};

export default ResellerBranding;
