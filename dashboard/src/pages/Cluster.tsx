import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import { Server, Plus, Trash2, RefreshCw, Activity, ShieldCheck } from 'lucide-react';
import toast from 'react-hot-toast';

interface ClusterNode {
  id: number;
  hostname: string;
  ip_address: string;
  role: string;
  status: string;
  ssh_port: number;
  last_seen: string | null;
}

const ClusterPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [hostname, setHostname] = useState('');
  const [ipAddress, setIpAddress] = useState('');
  const [role, setRole] = useState('edge');
  const [sshPort, setSshPort] = useState('22');

  const { data: nodes, isLoading } = useQuery<ClusterNode[]>({
    queryKey: ['clusterNodes'],
    queryFn: async () => {
      const res = await api.get('/cluster/nodes');
      return res.data;
    },
    refetchInterval: 10000 // Poll every 10s
  });

  const addNodeMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/cluster/nodes', { 
        hostname, 
        ipAddress, 
        role, 
        sshPort: parseInt(sshPort) 
      });
      return res.data;
    },
    onSuccess: () => {
      toast.success('Node added to cluster!');
      setIsModalOpen(false);
      setHostname('');
      setIpAddress('');
      queryClient.invalidateQueries({ queryKey: ['clusterNodes'] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Failed to add node');
    }
  });

  const deleteNodeMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await api.delete(`/cluster/nodes/${id}`);
      return res.data;
    },
    onSuccess: () => {
      toast.success('Node removed from cluster');
      queryClient.invalidateQueries({ queryKey: ['clusterNodes'] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Failed to remove node');
    }
  });

  const syncAllMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/cluster/sync-all');
      return res.data;
    },
    onSuccess: (data) => {
      toast.success(data.message);
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Global sync failed');
    }
  });

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">High Availability Cluster</h1>
          <p className="text-slate-500 mt-1">Orchestrate configurations and health across multiple edge nodes.</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => syncAllMutation.mutate()}
            disabled={syncAllMutation.isPending}
            className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-5 py-2.5 rounded-xl font-bold transition-all flex items-center gap-2 text-sm border border-slate-200"
          >
            <RefreshCw size={18} className={syncAllMutation.isPending ? 'animate-spin' : ''} />
            Global Sync
          </button>
          <button
            onClick={() => setIsModalOpen(true)}
            className="bg-orange-600 hover:bg-orange-700 text-white px-5 py-2.5 rounded-xl font-bold transition-all shadow-md shadow-orange-900/10 flex items-center gap-2 text-sm"
          >
            <Plus size={18} />
            Add Edge Node
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex items-center gap-4">
          <div className="p-4 bg-orange-50 rounded-full text-orange-600">
            <Server size={24} />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Active Nodes</p>
            <p className="text-2xl font-bold text-slate-800">{nodes?.filter(n => n.status === 'online').length || 0}</p>
          </div>
        </div>
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex items-center gap-4">
          <div className="p-4 bg-blue-50 rounded-full text-blue-600">
            <Activity size={24} />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Cluster Role</p>
            <p className="text-lg font-bold text-slate-800">Master Panel</p>
          </div>
        </div>
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex items-center gap-4">
          <div className="p-4 bg-emerald-50 rounded-full text-emerald-600">
            <ShieldCheck size={24} />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Replication</p>
            <p className="text-lg font-bold text-slate-800">Synchronized</p>
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Server className="text-slate-700" size={20} />
            <h2 className="text-lg font-bold text-slate-800">Cluster Nodes</h2>
          </div>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 uppercase tracking-wider text-[10px] font-bold">Hostname</th>
                <th className="px-6 py-4 uppercase tracking-wider text-[10px] font-bold">IP Address</th>
                <th className="px-6 py-4 uppercase tracking-wider text-[10px] font-bold">Role</th>
                <th className="px-6 py-4 uppercase tracking-wider text-[10px] font-bold">Status</th>
                <th className="px-6 py-4 uppercase tracking-wider text-[10px] font-bold">Last Seen</th>
                <th className="px-6 py-4 uppercase tracking-wider text-[10px] font-bold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-slate-400">Loading cluster topology...</td>
                </tr>
              ) : nodes && nodes.length > 0 ? (
                nodes.map((node) => (
                  <tr key={node.id} className="hover:bg-slate-50/50 transition-colors group">
                    <td className="px-6 py-4 font-bold text-slate-800 text-xs">{node.hostname}</td>
                    <td className="px-6 py-4 font-mono text-slate-500 text-xs">{node.ip_address}</td>
                    <td className="px-6 py-4">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                        {node.role}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {node.status === 'online' ? (
                         <span className="inline-flex items-center gap-1 py-1 px-2.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-sm">
                           <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                           Online
                         </span>
                      ) : (
                         <span className="inline-flex items-center gap-1 py-1 px-2.5 rounded-full text-[10px] font-bold bg-red-50 text-red-700 border border-red-200">
                           Offline
                         </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-slate-400 text-[10px]">
                      {node.last_seen ? new Date(node.last_seen).toLocaleTimeString() : 'Never'}
                    </td>
                    <td className="px-6 py-4 text-right">
                       <button 
                         onClick={() => deleteNodeMutation.mutate(node.id)}
                         disabled={deleteNodeMutation.isPending}
                         className="text-red-400 hover:text-red-600 p-2 rounded-lg hover:bg-red-50 transition-colors inline-block"
                         title="Remove Node"
                       >
                         <Trash2 size={16} />
                       </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-400 italic">No edge nodes configured. Your cluster is running in standalone mode.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-800">Add Cluster Node</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>
            
            <form onSubmit={(e) => { e.preventDefault(); addNodeMutation.mutate(); }} className="p-6 space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Node Hostname</label>
                <input type="text" className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-sm" value={hostname} onChange={(e) => setHostname(e.target.value)} placeholder="edge-01.yourdomain.com" required />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">IP Address</label>
                <input type="text" className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-sm font-mono" value={ipAddress} onChange={(e) => setIpAddress(e.target.value)} placeholder="1.2.3.4" required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">SSH Port</label>
                  <input type="number" className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-sm font-mono" value={sshPort} onChange={(e) => setSshPort(e.target.value)} required />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Role</label>
                  <select className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-sm appearance-none outline-none" value={role} onChange={(e) => setRole(e.target.value)}>
                    <option value="edge">Edge Node</option>
                    <option value="database">DB Replica</option>
                    <option value="storage">Storage Node</option>
                  </select>
                </div>
              </div>
              <div className="pt-4 flex gap-3">
                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 px-4 py-3 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 text-sm transition-all">Cancel</button>
                <button type="submit" disabled={addNodeMutation.isPending} className="flex-1 px-4 py-3 rounded-xl font-bold text-white bg-orange-600 hover:bg-orange-700 shadow-md shadow-orange-900/10 text-sm transition-all disabled:opacity-50">
                  {addNodeMutation.isPending ? 'Provisioning...' : 'Provision Node'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ClusterPage;
