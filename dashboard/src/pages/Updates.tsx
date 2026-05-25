import React, { useState, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import api from '../api/client';
import { RefreshCw, Download, ShieldCheck, AlertCircle, Clock, Settings, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';

interface UpdateItem {
  name: string;
  info: string;
}

interface UpdateStatus {
  updates: UpdateItem[];
  isAutoEnabled: boolean;
}

const UpdatesPage: React.FC = () => {
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [isFetching, setIsFetching] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);

  const fetchUpdates = async () => {
    setIsFetching(true);
    try {
      const res = await api.get('/admin/updates');
      const { taskId } = res.data;

      const interval = setInterval(async () => {
        try {
          const taskRes = await api.get(`/tasks/${taskId}`);
          const task = taskRes.data;
          if (task.status === 'completed') {
            setStatus(task.payload.result);
            setIsFetching(false);
            clearInterval(interval);
          } else if (task.status === 'failed') {
            toast.error('Failed to check for updates');
            setIsFetching(false);
            clearInterval(interval);
          }
        } catch (e) {
          clearInterval(interval);
          setIsFetching(false);
        }
      }, 1500);
    } catch (err) {
      toast.error('Failed to initiate update check');
      setIsFetching(false);
    }
  };

  useEffect(() => {
    fetchUpdates();
  }, []);

  const installMutation = useMutation({
    mutationFn: async () => {
      setIsInstalling(true);
      const res = await api.post('/admin/updates/install');
      const { taskId } = res.data;

      const interval = setInterval(async () => {
        try {
          const taskRes = await api.get(`/tasks/${taskId}`);
          const task = taskRes.data;
          if (task.status === 'completed') {
            toast.success('System updates installed successfully!');
            setIsInstalling(false);
            fetchUpdates();
            clearInterval(interval);
          } else if (task.status === 'failed') {
            toast.error('Installation failed: ' + task.error_message);
            setIsInstalling(false);
            clearInterval(interval);
          }
        } catch (e) {
          clearInterval(interval);
          setIsInstalling(false);
        }
      }, 2000);
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Failed to start installation');
      setIsInstalling(false);
    }
  });

  const toggleAutoMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const res = await api.post('/admin/updates/auto', { enabled });
      const { taskId } = res.data;
      
      return new Promise((resolve, reject) => {
        const interval = setInterval(async () => {
           const taskRes = await api.get(`/tasks/${taskId}`);
           if (taskRes.data.status === 'completed') {
             clearInterval(interval);
             resolve(true);
           } else if (taskRes.data.status === 'failed') {
             clearInterval(interval);
             reject(new Error('Failed to update settings'));
           }
        }, 1000);
      });
    },
    onSuccess: () => {
      toast.success('Automatic updates configuration updated');
      fetchUpdates();
    }
  });

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Server Update Management</h1>
          <p className="text-slate-500 mt-1">Keep your machine secure with the latest patches and kernels.</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={fetchUpdates}
            disabled={isFetching || isInstalling}
            className="bg-white border border-slate-200 text-slate-700 px-5 py-2.5 rounded-xl font-bold transition-all shadow-sm hover:bg-slate-50 flex items-center gap-2 text-sm disabled:opacity-50"
          >
            <RefreshCw size={18} className={isFetching ? 'animate-spin' : ''} />
            Check Now
          </button>
          <button 
            onClick={() => installMutation.mutate()}
            disabled={!status?.updates?.length || isInstalling || isFetching}
            className="bg-orange-600 hover:bg-orange-700 text-white px-5 py-2.5 rounded-xl font-bold transition-all shadow-md shadow-orange-900/10 flex items-center gap-2 text-sm disabled:opacity-50"
          >
            <Download size={18} className={isInstalling ? 'animate-bounce' : ''} />
            {isInstalling ? 'Installing Patches...' : 'Install All Updates'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
           <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
             <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <ShieldCheck className="text-emerald-600" size={20} />
                  <h2 className="text-lg font-bold text-slate-800">Pending Packages</h2>
                </div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest bg-slate-100 px-2 py-1 rounded">
                  {status?.updates?.length || 0} Available
                </span>
             </div>
             
             <div className="overflow-x-auto max-h-[500px]">
               <table className="w-full text-left text-sm">
                 <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-200 sticky top-0">
                   <tr>
                     <th className="px-6 py-4 uppercase tracking-wider text-[10px] font-bold">Package Name</th>
                     <th className="px-6 py-4 uppercase tracking-wider text-[10px] font-bold">Update Path</th>
                   </tr>
                 </thead>
                 <tbody className="divide-y divide-slate-100">
                   {isFetching && !status ? (
                     <tr><td colSpan={2} className="px-6 py-12 text-center text-slate-400">Refreshing repository metadata...</td></tr>
                   ) : status?.updates?.length ? (
                     status.updates.map((up) => (
                       <tr key={up.name} className="hover:bg-slate-50/50 transition-colors">
                         <td className="px-6 py-4 font-bold text-slate-800 font-mono text-xs">{up.name}</td>
                         <td className="px-6 py-4 text-slate-500 text-xs italic">{up.info}</td>
                       </tr>
                     ))
                   ) : (
                     <tr>
                       <td colSpan={2} className="px-6 py-20 text-center">
                         <div className="flex flex-col items-center gap-3">
                           <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center">
                             <CheckCircle2 size={24} />
                           </div>
                           <p className="text-slate-500 font-medium">Your system is fully up to date.</p>
                         </div>
                       </td>
                     </tr>
                   )}
                 </tbody>
               </table>
             </div>
           </div>
        </div>

        <div className="lg:col-span-1 space-y-6">
           <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
              <div className="flex items-center gap-3 mb-6 text-orange-600">
                <Settings size={20} />
                <h3 className="font-bold text-slate-800">Auto-Patching</h3>
              </div>
              <p className="text-sm text-slate-500 mb-6 leading-relaxed">
                Unattended-upgrades automatically installs high-priority security patches every night to keep your machine protected.
              </p>
              
              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100">
                <div className="flex items-center gap-2">
                   <Clock size={16} className="text-slate-400" />
                   <span className="text-sm font-bold text-slate-700">Security Auto-Update</span>
                </div>
                <button 
                  onClick={() => toggleAutoMutation.mutate(!status?.isAutoEnabled)}
                  disabled={toggleAutoMutation.isPending || isFetching}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${status?.isAutoEnabled ? 'bg-orange-600' : 'bg-slate-300'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${status?.isAutoEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
           </div>

           <div className="bg-amber-50 border border-amber-100 rounded-2xl p-6">
              <div className="flex items-center gap-3 mb-3 text-amber-600">
                <AlertCircle size={20} />
                <h3 className="font-bold text-amber-900 uppercase tracking-wider text-xs">Kernel Notice</h3>
              </div>
              <p className="text-xs text-amber-800 leading-relaxed">
                Applying updates to the Linux Kernel or System Libraries may require a server reboot to take effect. Always perform backups before massive upgrades.
              </p>
           </div>
        </div>
      </div>
    </div>
  );
};

export default UpdatesPage;
