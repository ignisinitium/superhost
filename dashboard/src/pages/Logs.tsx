import React, { useState, useEffect, useRef } from 'react';
import api from '../api/client';
import { RefreshCw, Download, Trash2, Search } from 'lucide-react';
import toast from 'react-hot-toast';

const LogViewerPage: React.FC = () => {
  const [logType, setLogType] = useState('nginx_access');
  const [lines, setLines] = useState(100);
  const [logContent, setLogContent] = useState('');
  const [isFetching, setIsFetching] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const logOptions = [
    { id: 'nginx_access', label: 'Nginx Access', color: 'bg-emerald-400' },
    { id: 'nginx_error', label: 'Nginx Error', color: 'bg-red-400' },
    { id: 'php_fpm', label: 'PHP-FPM', color: 'bg-blue-400' },
    { id: 'system', label: 'System Syslog', color: 'bg-slate-400' },
    { id: 'auth', label: 'Auth Logs', color: 'bg-orange-400' },
  ];

  const fetchLogs = async () => {
    setIsFetching(true);
    try {
      const res = await api.get(`/logs/${logType}?lines=${lines}`);
      const { taskId } = res.data;

      // Poll for task completion
      const interval = setInterval(async () => {
        try {
          const taskRes = await api.get(`/tasks/${taskId}`);
          const task = taskRes.data;

          if (task.status === 'completed') {
            setLogContent(task.payload?.result || 'No logs found.');
            clearInterval(interval);
            setIsFetching(false);
          } else if (task.status === 'failed') {
            toast.error(`Failed to fetch logs: ${task.error_message}`);
            clearInterval(interval);
            setIsFetching(false);
          }
        } catch (err) {
          clearInterval(interval);
          setIsFetching(false);
        }
      }, 1000);
    } catch (err) {
      toast.error('Request failed');
      setIsFetching(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [logType]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logContent]);

  const handleDownload = () => {
    const element = document.createElement("a");
    const file = new Blob([logContent], {type: 'text/plain'});
    element.href = URL.createObjectURL(file);
    element.download = `${logType}_${new Date().toISOString()}.log`;
    document.body.appendChild(element);
    element.click();
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">System Log Viewer</h1>
          <p className="text-slate-500 mt-1">Real-time inspection of server service logs.</p>
        </div>
        <div className="flex items-center gap-3">
          <select 
            value={lines}
            onChange={(e) => setLines(parseInt(e.target.value))}
            className="bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-orange-500/20"
          >
            <option value={50}>Last 50 lines</option>
            <option value={100}>Last 100 lines</option>
            <option value={500}>Last 500 lines</option>
          </select>
          <button 
            onClick={fetchLogs}
            disabled={isFetching}
            className="bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-xl font-bold transition-all shadow-md shadow-orange-900/10 flex items-center gap-2 text-sm disabled:opacity-50"
          >
            <RefreshCw size={16} className={isFetching ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sidebar / Selectors */}
        <div className="lg:col-span-1 space-y-2">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-3 ml-2">Select Log Source</div>
          {logOptions.map((opt) => (
            <button
              key={opt.id}
              onClick={() => setLogType(opt.id)}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-all duration-200 ${
                logType === opt.id 
                ? 'bg-white border-orange-500/50 shadow-sm' 
                : 'bg-transparent border-transparent hover:bg-slate-100 text-slate-500'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full ${opt.color}`} />
                <span className={`text-sm font-bold ${logType === opt.id ? 'text-slate-800' : ''}`}>{opt.label}</span>
              </div>
              {logType === opt.id && <div className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />}
            </button>
          ))}
          
          <div className="pt-6">
             <button 
                onClick={handleDownload}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-500 hover:bg-slate-100 transition-all text-sm font-medium"
              >
                <Download size={18} />
                Download Raw Log
              </button>
              <button 
                onClick={() => setLogContent('')}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-500 hover:bg-red-50 hover:text-red-500 transition-all text-sm font-medium"
              >
                <Trash2 size={18} />
                Clear View
              </button>
          </div>
        </div>

        {/* Log Output Area */}
        <div className="lg:col-span-3 flex flex-col bg-slate-900 rounded-2xl border border-slate-800 shadow-2xl overflow-hidden min-h-[600px]">
          <div className="px-6 py-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-red-500/50" />
                <div className="w-3 h-3 rounded-full bg-orange-500/50" />
                <div className="w-3 h-3 rounded-full bg-emerald-500/50" />
              </div>
              <span className="text-xs font-mono text-slate-500 uppercase tracking-widest ml-2">
                terminal_view://{logType}.log
              </span>
            </div>
            <div className="flex items-center gap-4">
               <div className="relative">
                 <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-600" />
                 <input 
                   type="text" 
                   placeholder="Filter output..." 
                   className="bg-slate-900 border-none rounded-lg py-1 pl-8 pr-3 text-[10px] text-slate-400 focus:ring-1 focus:ring-orange-500/50 w-40 outline-none font-mono"
                 />
               </div>
            </div>
          </div>
          
          <div 
            ref={scrollRef}
            className="flex-1 overflow-auto p-6 font-mono text-xs leading-relaxed selection:bg-orange-500/30 selection:text-orange-200"
          >
            {isFetching && logContent === '' ? (
              <div className="h-full flex items-center justify-center text-slate-600 animate-pulse">
                Establishing system stream...
              </div>
            ) : (
              <pre className="text-slate-300">
                {logContent || 'No entries found in this log source.'}
              </pre>
            )}
          </div>

          <div className="px-6 py-3 bg-slate-950 border-t border-slate-800 flex items-center justify-between">
            <div className="text-[10px] text-slate-600 font-medium">
              STATUS: {isFetching ? 'STREAMING' : 'IDLE'} | LINES: {lines}
            </div>
            <div className="text-[10px] text-slate-600 font-medium uppercase tracking-tighter">
              Superhost Modular Log Engine v1.0
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LogViewerPage;
