import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import { Database, Download, CheckCircle, RefreshCw, XCircle, HardDrive, RotateCcw } from 'lucide-react';
import toast from 'react-hot-toast';

interface BackupRecord {
  id: number;
  type: string;
  status: string;
  file_path: string;
  size_bytes: number | null;
  created_at: string;
  completed_at: string | null;
}

const ClientBackupsPage: React.FC = () => {
  const queryClient = useQueryClient();

  const { data: backups, isLoading } = useQuery<BackupRecord[]>({
    queryKey: ['clientBackups'],
    queryFn: async () => {
      const res = await api.get('/client/backups');
      return res.data;
    },
    refetchInterval: 5000 // Auto refresh for pending backups
  });

  const createBackupMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/client/backups');
      return res.data;
    },
    onSuccess: () => {
      toast.success('Backup generation started!');
      queryClient.invalidateQueries({ queryKey: ['clientBackups'] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Failed to start backup');
    }
  });

  const restoreBackupMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await api.post(`/client/backups/${id}/restore`);
      return res.data;
    },
    onSuccess: () => {
      toast.success('Backup restoration started! This may take a few minutes.');
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Failed to start restore');
    }
  });

  const handleDownload = (id: number) => {
    // In a real app, this should open a new tab or trigger a file download natively.
    // We need to fetch it with auth headers or open via a secure signed URL.
    // Here we'll do a programmatic fetch and blob download.
    toast.loading('Preparing download...', { duration: 2000 });
    
    api.get(`/client/backups/${id}/download`, { responseType: 'blob' })
      .then(response => {
        const _url = window.URL.createObjectURL(new Blob([response.data]));
        const link = document.createElement('a');
        link.href = _url;
        link.setAttribute('download', `backup_${id}.tar.gz`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      })
      .catch(() => toast.error('Failed to download backup'));
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Backup Engine</h1>
          <p className="text-slate-500 mt-1">Create and manage point-in-time snapshots of your entire account.</p>
        </div>
        <button
          onClick={() => createBackupMutation.mutate()}
          disabled={createBackupMutation.isPending}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl font-bold transition-all shadow-md shadow-indigo-900/10 flex items-center gap-2 text-sm disabled:opacity-50"
        >
          <Database size={18} className={createBackupMutation.isPending ? 'animate-pulse' : ''} />
          {createBackupMutation.isPending ? 'Queuing Backup...' : 'Generate New Backup'}
        </button>
      </div>

      <div className="bg-indigo-50 border border-indigo-100 p-6 rounded-2xl flex items-start gap-4">
        <div className="p-3 bg-indigo-100 text-indigo-600 rounded-full shrink-0">
          <HardDrive size={24} />
        </div>
        <div>
          <h3 className="text-lg font-bold text-indigo-900 mb-1">Full Account Snapshots</h3>
          <p className="text-sm text-indigo-700">
            A full backup includes all of your web files (<code>public_html</code>), configuration data, and fully exported `.sql` dumps of all your MySQL databases. These are securely compressed into a single <code>.tar.gz</code> archive.
          </p>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex items-center gap-3">
          <Database className="text-slate-700" size={20} />
          <h2 className="text-lg font-bold text-slate-800">Available Backups</h2>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 uppercase tracking-wider text-[10px] font-bold">Backup ID</th>
                <th className="px-6 py-4 uppercase tracking-wider text-[10px] font-bold">Type</th>
                <th className="px-6 py-4 uppercase tracking-wider text-[10px] font-bold">Date Generated</th>
                <th className="px-6 py-4 uppercase tracking-wider text-[10px] font-bold">Size</th>
                <th className="px-6 py-4 uppercase tracking-wider text-[10px] font-bold">Status</th>
                <th className="px-6 py-4 uppercase tracking-wider text-[10px] font-bold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-slate-400">Loading backups...</td>
                </tr>
              ) : backups && backups.length > 0 ? (
                backups.map((backup) => (
                  <tr key={backup.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4 font-mono text-xs text-slate-600">BKP-{backup.id.toString().padStart(4, '0')}</td>
                    <td className="px-6 py-4 text-slate-800 font-medium">{backup.type.replace('_', ' ').toUpperCase()}</td>
                    <td className="px-6 py-4 text-slate-500 text-xs">{new Date(backup.created_at).toLocaleString()}</td>
                    <td className="px-6 py-4 font-mono text-slate-600 text-xs">
                      {backup.size_bytes ? `${(backup.size_bytes / (1024 * 1024)).toFixed(2)} MB` : '--'}
                    </td>
                    <td className="px-6 py-4">
                      {backup.status === 'completed' ? (
                         <span className="inline-flex items-center gap-1 py-1 px-2.5 rounded-full text-[10px] font-bold bg-green-50 text-green-700 border border-green-200">
                           <CheckCircle size={12} /> Ready
                         </span>
                      ) : backup.status === 'pending' ? (
                         <span className="inline-flex items-center gap-1 py-1 px-2.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                           <RefreshCw size={12} className="animate-spin" /> Compressing...
                         </span>
                      ) : (
                         <span className="inline-flex items-center gap-1 py-1 px-2.5 rounded-full text-[10px] font-bold bg-red-50 text-red-700 border border-red-200">
                           <XCircle size={12} /> Failed
                         </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                       <button 
                         onClick={() => {
                           if(window.confirm('Are you sure you want to overwrite your current files and databases with this backup?')) {
                             restoreBackupMutation.mutate(backup.id);
                           }
                         }}
                         disabled={backup.status !== 'completed' || restoreBackupMutation.isPending}
                         className="text-slate-400 hover:text-orange-600 p-2 rounded-lg hover:bg-orange-50 transition-colors inline-block disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-slate-400 mr-1" 
                         title="Restore Archive"
                       >
                         <RotateCcw size={18} />
                       </button>
                       <button 
                         onClick={() => handleDownload(backup.id)}
                         disabled={backup.status !== 'completed'}
                         className="text-slate-400 hover:text-indigo-600 p-2 rounded-lg hover:bg-indigo-50 transition-colors inline-block disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-slate-400" 
                         title="Download Archive"
                       >
                         <Download size={18} />
                       </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-400 italic">No backups found on your account. Create your first snapshot.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ClientBackupsPage;
