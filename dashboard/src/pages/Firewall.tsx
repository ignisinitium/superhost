import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import { Shield, ShieldCheck, Plus, RefreshCw, Activity, Trash2, Hash } from 'lucide-react';
import toast from 'react-hot-toast';
import { useTaskMonitor } from '../hooks/useTaskMonitor';

const FirewallPage: React.FC = () => {
  const queryClient = useQueryClient();
  const { monitorTask } = useTaskMonitor();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [port, setPort] = useState('');
  const [protocol, setProtocol] = useState('tcp');
  const [rawOutput, setRawOutput] = useState('');

  const { data: statusData, isLoading, refetch } = useQuery({
    queryKey: ['firewallStatus'],
    queryFn: async () => {
      const res = await api.get('/firewall/status');
      return res.data;
    },
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (statusData?.taskId) {
      // We poll for the task result which contains the UFW output
      const interval = setInterval(async () => {
        try {
          const taskRes = await api.get(`/tasks/${statusData.taskId}`);
          const task = taskRes.data;
          if (task.status === 'completed') {
            setRawOutput(task.payload.result);
            clearInterval(interval);
          } else if (task.status === 'failed') {
            toast.error('Failed to fetch firewall status');
            clearInterval(interval);
          }
        } catch (e) {
          clearInterval(interval);
        }
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [statusData?.taskId]);

  const allowPortMutation = useMutation({
    mutationFn: async (data: { port: string, protocol: string }) => {
      const res = await api.post('/firewall/allow', data);
      return res.data;
    },
    onSuccess: (data) => {
      setIsModalOpen(false);
      setPort('');
      toast.success('Port allowance task created');
      refetch();
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Failed to allow port');
    }
  });

  const deleteRuleMutation = useMutation({
    mutationFn: async (ruleNumber: number) => {
      const res = await api.post('/firewall/delete', { ruleNumber });
      return res.data;
    },
    onSuccess: () => {
      toast.success('Rule deletion task created');
      refetch();
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Failed to delete rule');
    }
  });

  // Simple parser for ufw status numbered output
  const parseRules = (output: string) => {
    const lines = output.split('\n');
    const rules: { number: number, to: string, action: string, from: string }[] = [];
    const ruleRegex = /^\[\s*(\d+)\]\s+(.*?)\s+(ALLOW|DENY|REJECT)\s+(.*?)$/i;

    lines.forEach(line => {
      const match = line.trim().match(ruleRegex);
      if (match) {
        rules.push({
          number: parseInt(match[1]),
          to: match[2].trim(),
          action: match[3].trim(),
          from: match[4].trim()
        });
      }
    });
    return rules;
  };

  const firewallRules = parseRules(rawOutput);

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Firewall Management</h1>
          <p className="text-slate-500 mt-1">Manage UFW rules and machine-level network security.</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => refetch()}
            disabled={isLoading}
            className="bg-white border border-slate-200 text-slate-700 px-5 py-2.5 rounded-xl font-bold transition-all shadow-sm hover:bg-slate-50 flex items-center gap-2 text-sm"
          >
            <RefreshCw size={18} className={isLoading ? 'animate-spin' : ''} />
            Refresh Status
          </button>
          <button 
            onClick={() => setIsModalOpen(true)}
            className="bg-orange-600 hover:bg-orange-700 text-white px-5 py-2.5 rounded-xl font-bold transition-all shadow-md shadow-orange-900/10 flex items-center gap-2 text-sm"
          >
            <Plus size={20} />
            Allow Port
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Status Card */}
        <div className="lg:col-span-1 bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col items-center text-center">
            <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 ${rawOutput.includes('active') ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
              <ShieldCheck size={32} />
            </div>
            <h3 className="text-lg font-bold text-slate-800">UFW Status</h3>
            <p className="text-sm text-slate-500 mb-6">System Level Firewall</p>
            
            <div className="w-full p-3 bg-slate-50 rounded-xl border border-slate-100 flex justify-between items-center mb-2">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">State</span>
              <span className={`text-xs font-bold uppercase tracking-widest ${rawOutput.includes('active') ? 'text-emerald-600' : 'text-slate-400'}`}>
                {rawOutput.includes('active') ? 'Active' : 'Offline'}
              </span>
            </div>
            <p className="text-[10px] text-slate-400 italic mt-auto">
              Controlled via root worker daemon
            </p>
        </div>

        {/* Rules Table */}
        <div className="lg:col-span-3 bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex items-center gap-3">
            <Activity size={20} className="text-orange-600" />
            <h2 className="text-lg font-bold text-slate-800">Active Firewall Rules</h2>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-200">
                <tr>
                  <th className="px-6 py-4 uppercase tracking-wider text-[10px] font-bold">#</th>
                  <th className="px-6 py-4 uppercase tracking-wider text-[10px] font-bold">To</th>
                  <th className="px-6 py-4 uppercase tracking-wider text-[10px] font-bold">Action</th>
                  <th className="px-6 py-4 uppercase tracking-wider text-[10px] font-bold">From</th>
                  <th className="px-6 py-4 uppercase tracking-wider text-[10px] font-bold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {!rawOutput ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-slate-400 italic">
                      {isLoading ? 'Fetching status...' : 'Click refresh to view active rules.'}
                    </td>
                  </tr>
                ) : firewallRules.length > 0 ? (
                  firewallRules.map((rule) => (
                    <tr key={rule.number} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4 font-mono text-slate-400 text-xs">{rule.number}</td>
                      <td className="px-6 py-4 font-bold text-slate-800">{rule.to}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-widest border ${
                          rule.action === 'ALLOW' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-red-50 text-red-700 border-red-100'
                        }`}>
                          {rule.action}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-slate-500 text-xs">{rule.from}</td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => {
                            if (window.confirm(`Delete firewall rule #${rule.number} (${rule.to})?`)) {
                              deleteRuleMutation.mutate(rule.number);
                            }
                          }}
                          className="text-red-400 hover:text-red-600 p-2 rounded-lg hover:bg-red-50 transition-colors inline-block"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-slate-400 italic">No custom rules defined in UFW.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {rawOutput && (
            <div className="p-4 bg-slate-900 border-t border-slate-800">
               <div className="flex items-center gap-2 mb-2 text-slate-500">
                  <Hash size={12} />
                  <span className="text-[10px] font-bold uppercase tracking-widest">Raw Terminal Output</span>
               </div>
               <pre className="text-[10px] text-orange-400/80 font-mono overflow-auto max-h-40 p-2 leading-relaxed">
                 {rawOutput}
               </pre>
            </div>
          )}
        </div>
      </div>

      {/* Allow Port Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-800">Allow Incoming Port</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors">✕</button>
            </div>

            <form onSubmit={handleAllowPort} className="p-6 space-y-5">
              <div className="space-y-2">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Port Number</label>
                <input
                  type="text"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-slate-800 focus:ring-2 focus:ring-orange-500/50 outline-none transition-all font-mono text-sm"
                  value={port}
                  onChange={(e) => setPort(e.target.value.replace(/\D/g, ''))}
                  placeholder="e.g. 8080"
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Protocol</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setProtocol('tcp')}
                    className={`py-3 rounded-xl border font-bold transition-all text-sm ${protocol === 'tcp' ? 'bg-slate-800 border-slate-800 text-white shadow-md' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}
                  >
                    TCP
                  </button>
                  <button
                    type="button"
                    onClick={() => setProtocol('udp')}
                    className={`py-3 rounded-xl border font-bold transition-all text-sm ${protocol === 'udp' ? 'bg-slate-800 border-slate-800 text-white shadow-md' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}
                  >
                    UDP
                  </button>
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button 
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 py-3 rounded-xl font-bold transition-all text-sm"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={allowPortMutation.isPending}
                  className="flex-1 bg-orange-600 hover:bg-orange-700 text-white py-3 rounded-xl font-bold transition-all shadow-md shadow-orange-900/20 text-sm disabled:opacity-50"
                >
                  {allowPortMutation.isPending ? 'Processing...' : 'Create Rule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default FirewallPage;
