import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import adminApi from '../api/admin';
import { 
  Plus, Settings, Briefcase, User
} from 'lucide-react';
import toast from 'react-hot-toast';

const ResellerManager: React.FC = () => {
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Form State
  const [adminId, setAdminId] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [planTier, setPlanTier] = useState('standard');
  const [maxUsers, setMaxUsers] = useState('10');

  const { data: resellers, isLoading } = useQuery<any[]>({
    queryKey: ['resellers'],
    queryFn: async () => {
      const res = await adminApi.get('/reseller');
      return res.data;
    }
  });

  const { data: admins } = useQuery<any[]>({
    queryKey: ['allAdmins'],
    queryFn: async () => {
      // We assume there's an endpoint to list admins or we just use existing users for demo
      const res = await adminApi.get('/users'); 
      return res.data;
    }
  });

  const createResellerMutation = useMutation({
    mutationFn: async () => {
      const res = await adminApi.post('/reseller', {
        adminId: parseInt(adminId),
        companyName,
        planTier,
        maxUsers: parseInt(maxUsers)
      });
      return res.data;
    },
    onSuccess: () => {
      toast.success('Reseller account activated!');
      setIsModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ['resellers'] });
    }
  });

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-3">
             <Briefcase className="text-indigo-600" size={28} />
             Reseller Management
          </h1>
          <p className="text-slate-500 mt-1 ml-1">Promote administrators to resellers and manage their hosting quotas.</p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl font-bold transition-all shadow-md shadow-indigo-900/10 flex items-center gap-2 text-sm"
        >
          <Plus size={18} />
          Add Reseller
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-800">Active Resellers</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500 border-b border-slate-200 uppercase tracking-widest text-[10px] font-bold">
              <tr>
                <th className="px-6 py-4">Company / Admin</th>
                <th className="px-6 py-4">Plan Tier</th>
                <th className="px-6 py-4">User Quota</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr><td colSpan={4} className="px-6 py-8 text-center animate-pulse">Loading resellers...</td></tr>
              ) : resellers && resellers.length > 0 ? (
                resellers.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4">
                       <div className="font-bold text-slate-800">{r.company_name}</div>
                       <div className="text-[10px] text-slate-400 flex items-center gap-1">
                          <User size={10} /> {r.username} ({r.email})
                       </div>
                    </td>
                    <td className="px-6 py-4">
                       <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${
                          r.plan_tier === 'unlimited' ? 'bg-purple-50 text-purple-700 border border-purple-100' :
                          r.plan_tier === 'pro' ? 'bg-blue-50 text-blue-700 border border-blue-100' :
                          'bg-slate-100 text-slate-600'
                       }`}>
                          {r.plan_tier}
                       </span>
                    </td>
                    <td className="px-6 py-4 font-mono text-xs">
                       <span className="text-indigo-600 font-bold">0</span> / {r.max_users} Users
                    </td>
                    <td className="px-6 py-4 text-right">
                       <button className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all">
                          <Settings size={16} />
                       </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan={4} className="px-6 py-12 text-center text-slate-400 italic">No reseller accounts defined.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-800">Activate Reseller Tier</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>
            <form onSubmit={e => { e.preventDefault(); createResellerMutation.mutate(); }} className="p-6 space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Select Administrator</label>
                <select className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm" value={adminId} onChange={e => setAdminId(e.target.value)} required>
                   <option value="">Choose account...</option>
                   {admins?.map(a => <option key={a.id} value={a.id}>{a.username} ({a.email})</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Company Name</label>
                <input type="text" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm" value={companyName} onChange={e => setCompanyName(e.target.value)} required placeholder="Acme Hosting" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                 <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Plan Tier</label>
                    <select className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm" value={planTier} onChange={e => setPlanTier(e.target.value)}>
                       <option value="standard">Standard</option>
                       <option value="pro">Professional</option>
                       <option value="unlimited">Unlimited</option>
                    </select>
                 </div>
                 <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Max Sub-Users</label>
                    <input type="number" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm" value={maxUsers} onChange={e => setMaxUsers(e.target.value)} />
                 </div>
              </div>
              <div className="pt-4 flex gap-3">
                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 px-4 py-3 rounded-xl font-bold text-slate-600 bg-slate-100 text-sm">Cancel</button>
                <button type="submit" className="flex-1 px-4 py-3 rounded-xl font-bold text-white bg-indigo-600 hover:bg-indigo-700 text-sm shadow-md shadow-indigo-900/10 transition-all">Activate Reseller</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ResellerManager;
