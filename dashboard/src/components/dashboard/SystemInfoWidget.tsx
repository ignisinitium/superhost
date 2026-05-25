import React, { useState, useEffect } from 'react';
import { CheckCircle, Activity, Box, Settings, Globe, Cpu, AlertCircle } from 'lucide-react';
import api from '../../api/client';

interface SystemStats {
  uptime: string;
  os: string;
  kernel: string;
  ip: string;
  loadAvg: string;
}

const SystemInfoWidget: React.FC = () => {
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = async () => {
    try {
      const res = await api.get('/metrics/system');
      const { taskId } = res.data;

      // Poll for task completion
      const interval = setInterval(async () => {
        try {
          const taskRes = await api.get(`/tasks/${taskId}`);
          const task = taskRes.data;

          if (task.status === 'completed') {
            setStats(task.payload.result);
            setIsLoading(false);
            setError(null);
            clearInterval(interval);
          } else if (task.status === 'failed') {
            setError(`Worker error: ${task.error_message}`);
            clearInterval(interval);
            setIsLoading(false);
          }
        } catch (err: any) {
          setError(`Polling failed: ${err.message}`);
          clearInterval(interval);
          setIsLoading(false);
        }
      }, 1000);
    } catch (err: any) {
      if (err.response?.status === 401) {
        setError('Unauthorized. Please re-login.');
      } else {
        setError(`Fetch failed: ${err.message}`);
      }
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
    // Refresh stats every 30 seconds
    const mainInterval = setInterval(fetchStats, 30000);
    return () => clearInterval(mainInterval);
  }, []);

  const items = [
    { label: 'Uptime', value: stats?.uptime || '', icon: Activity },
    { label: 'Operating System', value: stats?.os || '', icon: Box },
    { label: 'Kernel Version', value: stats?.kernel || '', icon: Settings },
    { label: 'Primary IP', value: stats?.ip || '', icon: Globe },
    { label: 'Load Average', value: stats?.loadAvg || '', icon: Cpu },
  ];

  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 h-full flex flex-col">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-lg font-bold text-slate-800">System Info</h2>
        <span className={`px-2.5 py-1 rounded-full text-xs font-bold flex items-center gap-1 ${error ? 'bg-red-50 text-red-600' : (isLoading && !stats ? 'bg-slate-100 text-slate-500' : 'bg-green-100 text-green-700')}`}>
          {error ? <AlertCircle size={12} /> : <CheckCircle size={12} />} 
          {error ? 'Error' : (isLoading && !stats ? 'Fetching...' : 'Online')}
        </span>
      </div>
      
      {error ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-4 bg-red-50/50 rounded-xl border border-red-100 border-dashed">
          <p className="text-red-600 font-bold text-sm mb-1">Status Retrieval Failed</p>
          <p className="text-red-500 text-xs italic">{error}</p>
          <button onClick={fetchStats} className="mt-4 text-xs font-bold text-red-700 hover:underline">Retry Connection</button>
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((item, idx) => (
            <div key={idx} className="flex items-start gap-3 p-3 rounded-lg bg-slate-50 border border-slate-100">
              <div className="p-2 bg-white rounded-md shadow-sm text-slate-500">
                <item.icon className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{item.label}</p>
                {stats ? (
                  <p className="text-sm font-semibold text-slate-800 mt-0.5 truncate">{item.value}</p>
                ) : (
                  <div className="animate-pulse bg-slate-200 h-4 w-3/4 rounded mt-1"></div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default SystemInfoWidget;
