import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import { Globe, Plus, Trash2, Link } from 'lucide-react';
import toast from 'react-hot-toast';

interface VirtualIp {
  id: number;
  ip_address: string;
  interface: string;
  is_allocated: boolean;
  assigned_domain_id: number | null;
  domain_name: string | null;
}

interface Domain {
  id: number;
  domain_name: string;
}

const NetworkPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [ipAddress, setIpAddress] = useState('');
  const [interfaceName, setInterfaceName] = useState('eth0:1');
  const [selectedDomainId, setSelectedDomainId] = useState<Record<number, string>>({});

  const { data: ips, isLoading } = useQuery<VirtualIp[]>({
    queryKey: ['virtualIps'],
    queryFn: async () => {
      const res = await api.get('/network/ips');
      return res.data;
    }
  });

  const { data: domains } = useQuery<Domain[]>({
    queryKey: ['domains'],
    queryFn: async () => {
      const res = await api.get('/domains');
      return res.data;
    }
  });

  const addIpMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/network/ips', { ipAddress, interfaceName });
      return res.data;
    },
    onSuccess: () => {
      toast.success('Virtual IP added');
      setIpAddress('');
      queryClient.invalidateQueries({ queryKey: ['virtualIps'] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Failed to add IP');
    }
  });

  const removeIpMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await api.delete(`/network/ips/${id}`);
      return res.data;
    },
    onSuccess: () => {
      toast.success('Virtual IP removed');
      queryClient.invalidateQueries({ queryKey: ['virtualIps'] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Failed to remove IP');
    }
  });

  const assignIpMutation = useMutation({
    mutationFn: async ({ id, domainId }: { id: number, domainId: string }) => {
      const res = await api.post(`/network/ips/${id}/assign`, { domainId: domainId ? parseInt(domainId) : null });
      return res.data;
    },
    onSuccess: () => {
      toast.success('IP assignment updated');
      queryClient.invalidateQueries({ queryKey: ['virtualIps'] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Failed to assign IP');
    }
  });

  const handleDomainChange = (id: number, value: string) => {
    setSelectedDomainId(prev => ({ ...prev, [id]: value }));
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Virtual Networking</h1>
          <p className="text-slate-500 mt-1">Manage dedicated IP addresses and virtual network interfaces.</p>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Globe className="text-slate-700" size={20} />
            <h2 className="text-lg font-bold text-slate-800">IP Address Pool</h2>
          </div>
          <form 
            onSubmit={(e) => { e.preventDefault(); addIpMutation.mutate(); }}
            className="flex items-center gap-2"
          >
            <input 
              type="text" 
              placeholder="192.168.x.x" 
              className="bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-orange-500/20"
              value={ipAddress}
              onChange={(e) => setIpAddress(e.target.value)}
              required
            />
            <input 
              type="text" 
              placeholder="eth0:1" 
              className="bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-orange-500/20 w-24"
              value={interfaceName}
              onChange={(e) => setInterfaceName(e.target.value)}
              required
            />
            <button 
              type="submit" 
              disabled={addIpMutation.isPending}
              className="bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-xl font-bold transition-all shadow-md shadow-orange-900/10 flex items-center gap-2 text-sm disabled:opacity-50"
            >
              <Plus size={16} /> Add IP
            </button>
          </form>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 uppercase tracking-wider text-[10px] font-bold">IP Address</th>
                <th className="px-6 py-4 uppercase tracking-wider text-[10px] font-bold">Interface</th>
                <th className="px-6 py-4 uppercase tracking-wider text-[10px] font-bold">Status</th>
                <th className="px-6 py-4 uppercase tracking-wider text-[10px] font-bold">Assigned Domain</th>
                <th className="px-6 py-4 uppercase tracking-wider text-[10px] font-bold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-slate-400">Loading IPs...</td>
                </tr>
              ) : ips && ips.length > 0 ? (
                ips.map((ip) => (
                  <tr key={ip.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4 font-mono font-bold text-slate-800 text-xs">{ip.ip_address}</td>
                    <td className="px-6 py-4 font-mono text-slate-500 text-xs">{ip.interface}</td>
                    <td className="px-6 py-4">
                      {ip.is_allocated ? (
                        <span className="inline-flex items-center gap-1 py-1 px-2.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                          Allocated
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 py-1 px-2.5 rounded-full text-[10px] font-bold bg-green-50 text-green-700 border border-green-200">
                          Available
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <select 
                          className="bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-700 outline-none w-48"
                          value={selectedDomainId[ip.id] !== undefined ? selectedDomainId[ip.id] : (ip.assigned_domain_id || '')}
                          onChange={(e) => handleDomainChange(ip.id, e.target.value)}
                        >
                          <option value="">-- Unassigned --</option>
                          {domains?.map(d => (
                            <option key={d.id} value={d.id}>{d.domain_name}</option>
                          ))}
                        </select>
                        <button 
                          onClick={() => assignIpMutation.mutate({ id: ip.id, domainId: selectedDomainId[ip.id] !== undefined ? selectedDomainId[ip.id] : (ip.assigned_domain_id?.toString() || '') })}
                          disabled={assignIpMutation.isPending}
                          className="text-slate-400 hover:text-blue-600 p-1.5 rounded bg-slate-100 hover:bg-blue-50 transition-colors"
                          title="Apply Assignment"
                        >
                          <Link size={14} />
                        </button>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => {
                          if (window.confirm(`Delete virtual IP ${ip.ip_address}?`)) {
                            removeIpMutation.mutate(ip.id);
                          }
                        }}
                        disabled={removeIpMutation.isPending}
                        className="text-red-400 hover:text-red-600 p-2 rounded-lg hover:bg-red-50 transition-colors inline-block"
                        title="Delete IP"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-400 italic">No virtual IPs found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default NetworkPage;
