import React, { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import api from '../api/client';
import { Terminal, RefreshCw, AlertCircle, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import { useTaskMonitor } from '../hooks/useTaskMonitor';

interface ProcessInfo {
  user: string;
  pid: string;
  cpu: string;
  mem: string;
  vsz: string;
  rss: string;
  tty: string;
  stat: string;
  start: string;
  time: string;
  command: string;
}

const ProcessesPage: React.FC = () => {
  const { monitorTask } = useTaskMonitor();
  const [searchTerm, setSearchTerm] = useState('');
  const [processList, setProcessList] = useState<ProcessInfo[]>([]);

  const { data: fetchRes, isLoading, refetch } = useQuery({
    queryKey: ['processes'],
    queryFn: async () => {
      const res = await api.get('/processes');
      return res.data;
    },
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (fetchRes?.taskId) {
      // We monitor the task and when it's done, we can fetch the result from the task payload
      const toastId = toast.loading('Fetching process list...');
      
      const checkTask = async () => {
        try {
          const res = await api.get(`/tasks/${fetchRes.taskId}`);
          const task = res.data;

          if (task.status === 'completed') {
            toast.success('Processes fetched!', { id: toastId });
            // The worker stores stdout in task.payload.result
            if (task.payload?.result) {
              parseProcesses(task.payload.result);
            }
            return true;
          } else if (task.status === 'failed') {
            toast.error(`Failed: ${task.error_message}`, { id: toastId });
            return true;
          }
          return false;
        } catch (err) {
          return true;
        }
      };

      const interval = setInterval(async () => {
        const isDone = await checkTask();
        if (isDone) clearInterval(interval);
      }, 1500);
    }
  }, [fetchRes?.taskId]);

  const parseProcesses = (raw: string) => {
    const lines = raw.trim().split('\n');
    const parsed = lines.map(line => {
      const parts = line.trim().split(/\s+/);
      return {
        user: parts[0],
        pid: parts[1],
        cpu: parts[2],
        mem: parts[3],
        vsz: parts[4],
        rss: parts[5],
        tty: parts[6],
        stat: parts[7],
        start: parts[8],
        time: parts[9],
        command: parts.slice(10).join(' '),
      };
    });
    setProcessList(parsed);
  };

  const restartServiceMutation = useMutation({
    mutationFn: async (serviceName: string) => {
      const res = await api.post('/processes/restart', { serviceName });
      return res.data;
    },
    onSuccess: (data) => {
      if (data.taskId) {
        monitorTask(data.taskId, 'Service restarted successfully!');
      }
    },
  });

  const filteredProcesses = processList.filter(p => 
    p.command.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.user.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Process Monitoring</h1>
          <p className="text-slate-400">Real-time status of Nginx and PHP-FPM processes.</p>
        </div>
        <div className="flex gap-3">
           <button 
            onClick={() => restartServiceMutation.mutate('nginx')}
            className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors border border-slate-600"
          >
            <RefreshCw size={18} />
            Restart Nginx
          </button>
          <button 
            onClick={() => refetch()}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
          >
            <RefreshCw size={18} className={isLoading ? 'animate-spin' : ''} />
            Refresh List
          </button>
        </div>
      </div>

      <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden shadow-lg">
        <div className="p-4 border-b border-slate-700 bg-slate-700/30 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Terminal size={18} className="text-blue-500" />
            <h3 className="font-semibold">System Processes</h3>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
            <input 
              type="text"
              placeholder="Filter processes..."
              className="bg-slate-900 border border-slate-700 rounded-lg py-1.5 pl-10 pr-4 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500 w-64"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-900/50 text-slate-400 text-xs font-medium uppercase tracking-wider">
                <th className="px-6 py-3">PID</th>
                <th className="px-6 py-3">User</th>
                <th className="px-6 py-3">CPU %</th>
                <th className="px-6 py-3">MEM %</th>
                <th className="px-6 py-3">Command</th>
                <th className="px-6 py-3 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700 text-sm">
              {filteredProcesses.length > 0 ? (
                filteredProcesses.map((p) => (
                  <tr key={p.pid} className="hover:bg-slate-700/30 transition-colors">
                    <td className="px-6 py-4 font-mono text-blue-400">{p.pid}</td>
                    <td className="px-6 py-4 text-slate-300">{p.user}</td>
                    <td className="px-6 py-4 text-slate-400">{p.cpu}</td>
                    <td className="px-6 py-4 text-slate-400">{p.mem}</td>
                    <td className="px-6 py-4">
                      <code className="text-xs bg-slate-900 px-2 py-1 rounded border border-slate-700 text-slate-300">
                        {p.command.length > 60 ? p.command.substring(0, 60) + '...' : p.command}
                      </code>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className="bg-green-500/10 text-green-500 px-2 py-0.5 rounded text-[10px] font-bold uppercase border border-green-500/20">
                        Running
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                    {isLoading ? 'Fetching system processes...' : 'No processes found matching your filter.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-blue-500/5 border border-blue-500/20 p-6 rounded-xl flex items-start gap-4">
          <div className="p-3 bg-blue-500/10 rounded-lg text-blue-500">
            <AlertCircle size={24} />
          </div>
          <div>
            <h4 className="font-semibold text-white mb-1">Process Information</h4>
            <p className="text-sm text-slate-400">
              Only processes related to Nginx and PHP-FPM are shown here for system security. Use the CLI for full process management.
            </p>
          </div>
        </div>
        <div className="bg-slate-800 border border-slate-700 p-6 rounded-xl flex items-center justify-between">
          <div>
            <h4 className="font-semibold text-white">PHP-FPM Status</h4>
            <p className="text-xs text-slate-500">FastCGI Process Manager</p>
          </div>
          <button 
            onClick={() => restartServiceMutation.mutate('php8.3-fpm')}
            className="text-blue-400 hover:text-blue-300 text-sm font-semibold flex items-center gap-2"
          >
            <RefreshCw size={14} /> Restart Service
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProcessesPage;
