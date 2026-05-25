import React, { useState, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import api from '../api/client';
import { Settings, Play, Square, RefreshCw, Power, PowerOff } from 'lucide-react';
import toast from 'react-hot-toast';

interface SystemService {
  name: string;
  status: 'active' | 'inactive' | 'failed';
  autostart: boolean;
}

const ServiceManagerPage: React.FC = () => {
  const [services, setServices] = useState<SystemService[]>([]);
  const [isPolling, setIsPolling] = useState(false);

  const fetchStatus = async () => {
    setIsPolling(true);
    try {
      const res = await api.get('/services/status');
      const { taskId } = res.data;

      const interval = setInterval(async () => {
        try {
          const taskRes = await api.get(`/tasks/${taskId}`);
          const task = taskRes.data;
          if (task.status === 'completed') {
            setServices(task.payload.result);
            setIsPolling(false);
            clearInterval(interval);
          } else if (task.status === 'failed') {
            toast.error('Failed to fetch service status');
            setIsPolling(false);
            clearInterval(interval);
          }
        } catch (e) {
          clearInterval(interval);
          setIsPolling(false);
        }
      }, 1000);
    } catch (err) {
      toast.error('Failed to initiate status fetch');
      setIsPolling(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const manageMutation = useMutation({
    mutationFn: async ({ service, action }: { service: string, action: string }) => {
      const res = await api.post('/services/manage', { service, action });
      return res.data;
    },
    onSuccess: () => {
      toast.success('Service action queued');
      // Wait a bit then refresh
      setTimeout(fetchStatus, 2000);
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Action failed');
    }
  });

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Service Management</h1>
          <p className="text-slate-500 mt-1">Control system daemons and configure boot-time persistence.</p>
        </div>
        <button 
          onClick={fetchStatus}
          disabled={isPolling}
          className="bg-white border border-slate-200 text-slate-700 px-5 py-2.5 rounded-xl font-bold transition-all shadow-sm hover:bg-slate-50 flex items-center gap-2 text-sm"
        >
          <RefreshCw size={18} className={isPolling ? 'animate-spin' : ''} />
          Refresh Status
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {services.length === 0 && !isPolling ? (
           <div className="col-span-3 text-center py-20 bg-white border border-slate-200 rounded-3xl text-slate-400 font-medium">
             No system services detected. Click refresh.
           </div>
        ) : services.map((svc) => (
          <div key={svc.name} className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm flex flex-col group hover:border-orange-200 transition-all">
            <div className="p-5 border-b border-slate-50 bg-slate-50/30 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${svc.status === 'active' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                  <Settings size={18} />
                </div>
                <span className="font-bold text-slate-800 capitalize">{svc.name.replace('-', ' ')}</span>
              </div>
              <div className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full ${svc.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                {svc.status}
              </div>
            </div>
            
            <div className="p-5 flex-1 space-y-4">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400 font-medium">Autostart on Boot</span>
                <button 
                  onClick={() => manageMutation.mutate({ service: svc.name, action: svc.autostart ? 'disable' : 'enable' })}
                  className={`flex items-center gap-1.5 font-bold uppercase tracking-tighter transition-colors ${svc.autostart ? 'text-blue-600 hover:text-blue-700' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  {svc.autostart ? <Power size={12} /> : <PowerOff size={12} />}
                  {svc.autostart ? 'Enabled' : 'Disabled'}
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2">
                {svc.status === 'active' ? (
                  <>
                    <button 
                      onClick={() => manageMutation.mutate({ service: svc.name, action: 'stop' })}
                      className="flex items-center justify-center gap-2 bg-slate-100 hover:bg-red-50 hover:text-red-600 text-slate-600 py-2 rounded-lg text-xs font-bold transition-all"
                    >
                      <Square size={14} /> Stop
                    </button>
                    <button 
                      onClick={() => manageMutation.mutate({ service: svc.name, action: 'restart' })}
                      className="flex items-center justify-center gap-2 bg-slate-100 hover:bg-orange-50 hover:text-orange-600 text-slate-600 py-2 rounded-lg text-xs font-bold transition-all"
                    >
                      <RefreshCw size={14} /> Restart
                    </button>
                  </>
                ) : (
                  <button 
                    onClick={() => manageMutation.mutate({ service: svc.name, action: 'start' })}
                    className="col-span-2 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white py-2 rounded-lg text-xs font-bold transition-all shadow-md shadow-emerald-900/10"
                  >
                    <Play size={14} /> Start Service
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ServiceManagerPage;
