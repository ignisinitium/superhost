import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import adminApi from '../api/admin';
import { 
  Globe, Plus, Trash2, Shield, User
} from 'lucide-react';
import toast from 'react-hot-toast';
import type { DnsZone } from '../../../shared/types';

const AdminDnsManager: React.FC = () => {
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Form State
  const [userId, setUserId] = useState<string>('');
  const [domainName, setDomainName] = useState('');
  const [ttl, setTtl] = useState('3600');

  const { data: zones, isLoading } = useQuery<DnsZone[]>({
    queryKey: ['adminDnsZones'],
    queryFn: async () => {
      const res = await adminApi.get('/dns/zones');
      return res.data;
    }
  });

  const { data: users } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const res = await adminApi.get('/users');
      return res.data;
    }
  });

  const addZoneMutation = useMutation({
    mutationFn: async () => {
      const res = await adminApi.post('/dns/zones', {
        userId: userId ? parseInt(userId) : null,
        domainName,
        ttl: parseInt(ttl)
      });
      return res.data;
    },
    onSuccess: () => {
      toast.success('DNS zone created!');
      setIsModalOpen(false);
      setDomainName('');
      queryClient.invalidateQueries({ queryKey: ['adminDnsZones'] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Failed to create zone');
    }
  });

  const deleteZoneMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await adminApi.delete(`/dns/zones/${id}`);
      return res.data;
    },
    onSuccess: () => {
      toast.success('DNS zone deleted');
      queryClient.invalidateQueries({ queryKey: ['adminDnsZones'] });
    }
  });

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-3">
             <Globe className="text-indigo-600" size={28} />
             System DNS Manager
          </h1>
          <p className="text-slate-500 mt-1 ml-1">Monitor and manage all DNS zones across the server cluster.</p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl font-bold transition-all shadow-md shadow-indigo-900/10 flex items-center gap-2 text-sm"
        >
          <Plus size={18} />
          Add Custom Zone
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield className="text-slate-700" size={20} />
            <h2 className="text-lg font-bold text-slate-800">All Hosted DNS Zones</h2>
          </div>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200 uppercase tracking-widest text-[10px]">
              <tr>
                <th className="px-6 py-4">Owner</th>
                <th className="px-6 py-4">Domain Name</th>
                <th className="px-6 py-4">TTL</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr><td colSpan={4} className="px-6 py-8 text-center text-slate-400">Loading all zones...</td></tr>
              ) : zones && zones.length > 0 ? (
                zones.map((zone) => (
                  <tr key={zone.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4">
                       <div className="flex items-center gap-2 font-bold text-slate-700">
                          <User size={14} className="text-slate-400" />
                          {zone.username || 'System (Root)'}
                       </div>
                    </td>
                    <td className="px-6 py-4">
                       <div className="text-indigo-600 font-medium">
                          {zone.domain_name}
                       </div>
                    </td>
                    <td className="px-6 py-4 text-slate-500 text-xs">
                       {zone.ttl}s
                    </td>
                    <td className="px-6 py-4 text-right">
                       <button 
                         onClick={() => { if(window.confirm('Permanently delete this DNS zone?')) deleteZoneMutation.mutate(zone.id); }}
                         className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                       >
                          <Trash2 size={16} />
                       </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan={4} className="px-6 py-12 text-center text-slate-400 italic">No DNS zones found on the system.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-800">Add New DNS Zone</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>
            
            <form onSubmit={(e) => { e.preventDefault(); addZoneMutation.mutate(); }} className="p-6 space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Owner User</label>
                <select 
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-sm"
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                >
                   <option value="">System (No Owner)</option>
                   {users?.map((u: any) => (
                     <option key={u.id} value={u.id}>{u.username}</option>
                   ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Domain Name</label>
                <div className="relative">
                   <Globe className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                   <input 
                     type="text" 
                     className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pl-10 pr-4 text-sm font-mono" 
                     value={domainName} 
                     onChange={(e) => setDomainName(e.target.value)} 
                     placeholder="example.com" 
                     required 
                   />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Default TTL</label>
                <input 
                  type="number" 
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-sm" 
                  value={ttl} 
                  onChange={(e) => setTtl(e.target.value)} 
                />
              </div>

              <div className="pt-4 flex gap-3">
                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 px-4 py-3 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 text-sm transition-all">Cancel</button>
                <button type="submit" disabled={addZoneMutation.isPending} className="flex-1 px-4 py-3 rounded-xl font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-900/10 text-sm transition-all disabled:opacity-50">
                  {addZoneMutation.isPending ? 'Creating...' : 'Add Zone'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDnsManager;
