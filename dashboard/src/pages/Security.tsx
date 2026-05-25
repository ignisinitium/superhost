import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import { ShieldAlert, ShieldCheck, Play, AlertCircle, RefreshCw, FileWarning } from 'lucide-react';
import toast from 'react-hot-toast';

interface User {
  id: number;
  username: string;
}

interface ScanRecord {
  id: number;
  username: string;
  scan_path: string;
  status: string;
  infections_found: number;
  created_at: string;
  completed_at: string | null;
}

const SecurityPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [selectedUser, setSelectedUser] = useState('');

  const { data: users } = useQuery<User[]>({
    queryKey: ['users'],
    queryFn: async () => {
      const res = await api.get('/users');
      return res.data;
    }
  });

  const { data: scans, isLoading } = useQuery<ScanRecord[]>({
    queryKey: ['malwareScans'],
    queryFn: async () => {
      const res = await api.get('/security/scans');
      return res.data;
    },
    refetchInterval: 5000 // Poll every 5s for updates
  });

  const runScanMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/security/scan', { userId: parseInt(selectedUser) });
      return res.data;
    },
    onSuccess: () => {
      toast.success('Malware scan started successfully');
      setSelectedUser('');
      queryClient.invalidateQueries({ queryKey: ['malwareScans'] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Failed to start scan');
    }
  });

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Anti-Malware & Security</h1>
          <p className="text-slate-500 mt-1">Run on-demand ClamAV scans and review infection reports.</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            className="bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-orange-500/20"
            value={selectedUser}
            onChange={(e) => setSelectedUser(e.target.value)}
          >
            <option value="" disabled>Select User to Scan...</option>
            {users?.map(u => (
              <option key={u.id} value={u.id}>{u.username}</option>
            ))}
          </select>
          <button
            onClick={() => runScanMutation.mutate()}
            disabled={!selectedUser || runScanMutation.isPending}
            className="bg-red-600 hover:bg-red-700 text-white px-5 py-2.5 rounded-xl font-bold transition-all shadow-md shadow-red-900/10 flex items-center gap-2 text-sm disabled:opacity-50"
          >
            <Play size={18} className={runScanMutation.isPending ? 'animate-pulse' : ''} />
            Start Scan
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex items-center gap-4">
          <div className="p-4 bg-emerald-50 rounded-full text-emerald-600">
            <ShieldCheck size={24} />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Active Engine</p>
            <p className="text-lg font-bold text-slate-800">ClamAV Daemon</p>
          </div>
        </div>
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex items-center gap-4">
          <div className="p-4 bg-blue-50 rounded-full text-blue-600">
            <RefreshCw size={24} />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Total Scans Run</p>
            <p className="text-2xl font-bold text-slate-800">{scans?.length || 0}</p>
          </div>
        </div>
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex items-center gap-4">
          <div className="p-4 bg-red-50 rounded-full text-red-600">
            <FileWarning size={24} />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Infections Found</p>
            <p className="text-2xl font-bold text-slate-800">
              {scans?.reduce((sum, scan) => sum + (scan.infections_found || 0), 0) || 0}
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ShieldAlert className="text-slate-700" size={20} />
            <h2 className="text-lg font-bold text-slate-800">Scan History</h2>
          </div>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 uppercase tracking-wider text-[10px] font-bold">Target User</th>
                <th className="px-6 py-4 uppercase tracking-wider text-[10px] font-bold">Path Scanned</th>
                <th className="px-6 py-4 uppercase tracking-wider text-[10px] font-bold">Status</th>
                <th className="px-6 py-4 uppercase tracking-wider text-[10px] font-bold">Infections</th>
                <th className="px-6 py-4 uppercase tracking-wider text-[10px] font-bold">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-slate-400">Loading scan history...</td>
                </tr>
              ) : scans && scans.length > 0 ? (
                scans.map((scan) => (
                  <tr key={scan.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4 font-bold text-slate-800 text-xs">{scan.username}</td>
                    <td className="px-6 py-4 font-mono text-slate-500 text-xs">{scan.scan_path}</td>
                    <td className="px-6 py-4">
                      {scan.status === 'completed' ? (
                         <span className="inline-flex items-center gap-1 py-1 px-2 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                           <ShieldCheck size={12} /> Done
                         </span>
                      ) : scan.status === 'failed' ? (
                         <span className="inline-flex items-center gap-1 py-1 px-2 rounded-full text-[10px] font-bold bg-red-50 text-red-700 border border-red-200">
                           <AlertCircle size={12} /> Failed
                         </span>
                      ) : (
                         <span className="inline-flex items-center gap-1 py-1 px-2 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                           <RefreshCw size={12} className="animate-spin" /> Scanning
                         </span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {scan.infections_found > 0 ? (
                        <span className="font-bold text-red-600 flex items-center gap-1">
                          <FileWarning size={14} /> {scan.infections_found} found
                        </span>
                      ) : (
                        <span className="text-slate-400">0</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-slate-500 text-xs">
                      {new Date(scan.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-400 italic">No scans have been run yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default SecurityPage;
