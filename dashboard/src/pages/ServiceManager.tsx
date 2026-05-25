import React, { useState, useEffect, useCallback } from 'react';
import api from '../api/client';
import {
  Play, Square, RefreshCw, Power, PowerOff,
  AlertTriangle, CheckCircle, XCircle, Loader2
} from 'lucide-react';
import toast from 'react-hot-toast';

interface SystemService {
  name: string;
  status: 'active' | 'inactive' | 'failed';
  autostart: boolean;
}

// Nice display names for known services
const SERVICE_LABELS: Record<string, string> = {
  'nginx':            'Nginx',
  'apache2':          'Apache2',
  'php8.1-fpm':       'PHP 8.1-FPM',
  'php8.2-fpm':       'PHP 8.2-FPM',
  'php8.3-fpm':       'PHP 8.3-FPM',
  'php8.4-fpm':       'PHP 8.4-FPM',
  'mysql':            'MySQL',
  'mariadb':          'MariaDB',
  'postgresql':       'PostgreSQL',
  'postfix':          'Postfix (SMTP)',
  'dovecot':          'Dovecot (IMAP)',
  'opendkim':         'OpenDKIM',
  'spamassassin':     'SpamAssassin',
  'bind9':            'BIND9 (DNS)',
  'proftpd':          'ProFTPD',
  'vsftpd':           'vsftpd',
  'redis':            'Redis',
  'memcached':        'Memcached',
  'clamav-daemon':    'ClamAV',
  'fail2ban':         'Fail2Ban',
  'ufw':              'UFW Firewall',
  'superhost-api':    'Superhost API',
  'superhost-worker': 'Superhost Worker',
};

// Poll a task until it completes or fails; resolves with the task object
async function pollTask(taskId: number, maxWaitMs = 30_000): Promise<any> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const res = await api.get(`/tasks/${taskId}`);
    const task = res.data;
    if (task.status === 'completed' || task.status === 'failed') return task;
    await new Promise(r => setTimeout(r, 1000));
  }
  throw new Error('Timed out waiting for task');
}

const ServiceManagerPage: React.FC = () => {
  const [services, setServices] = useState<SystemService[]>([]);
  const [isPolling, setIsPolling] = useState(false);
  // Track per-service pending actions
  const [pendingActions, setPendingActions] = useState<Record<string, string>>({});

  const fetchStatus = useCallback(async () => {
    setIsPolling(true);
    try {
      const res = await api.get('/services/status');
      const task = await pollTask(res.data.taskId);
      if (task.status === 'completed') {
        setServices(task.payload?.result ?? []);
      } else {
        toast.error(`Failed to fetch service status: ${task.error_message ?? 'unknown error'}`);
      }
    } catch (err: any) {
      toast.error(`Status fetch failed: ${err.message}`);
    } finally {
      setIsPolling(false);
    }
  }, []);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  const runAction = async (service: string, action: string) => {
    const isRestartingSelf = service === 'superhost-worker' &&
      (action === 'restart' || action === 'stop');

    setPendingActions(p => ({ ...p, [service]: action }));
    const toastId = toast.loading(`${action}ing ${SERVICE_LABELS[service] ?? service}…`);

    try {
      const res = await api.post('/services/manage', { service, action });
      const taskId: number = res.data.taskId;

      if (isRestartingSelf) {
        // Worker marks itself done before dying — just wait a moment then refresh
        toast.success('Worker is restarting — refreshing status in 5s…', { id: toastId, duration: 5000 });
        await new Promise(r => setTimeout(r, 5000));
        await fetchStatus();
      } else {
        const task = await pollTask(taskId);
        if (task.status === 'completed') {
          toast.success(`${SERVICE_LABELS[service] ?? service} ${action}ed successfully`, { id: toastId });
          await fetchStatus();
        } else {
          toast.error(`Action failed: ${task.error_message ?? 'unknown error'}`, { id: toastId });
        }
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? err.message ?? 'Action failed', { id: toastId });
    } finally {
      setPendingActions(p => { const n = { ...p }; delete n[service]; return n; });
    }
  };

  const isSuperhost = (svc: SystemService) =>
    svc.name === 'superhost-api' || svc.name === 'superhost-worker';

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Service Manager</h1>
          <p className="text-slate-500 mt-1">Start, stop, and restart system services. Changes take effect immediately.</p>
        </div>
        <button
          onClick={fetchStatus}
          disabled={isPolling}
          className="bg-white border border-slate-200 text-slate-700 px-5 py-2.5 rounded-xl font-bold transition-all shadow-sm hover:bg-slate-50 flex items-center gap-2 text-sm disabled:opacity-50"
        >
          <RefreshCw size={18} className={isPolling ? 'animate-spin' : ''} />
          Refresh Status
        </button>
      </div>

      {/* Superhost services — pinned at top */}
      {services.some(s => isSuperhost(s)) && (
        <div>
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.15em] mb-3 ml-1">
            Superhost Services
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {services.filter(s => isSuperhost(s)).map(svc => (
              <ServiceCard
                key={svc.name}
                svc={svc}
                pendingAction={pendingActions[svc.name]}
                onAction={runAction}
                highlight
              />
            ))}
          </div>
        </div>
      )}

      {/* All other services */}
      <div>
        {services.some(s => !isSuperhost(s)) && (
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.15em] mb-3 ml-1">
            System Services
          </div>
        )}

        {isPolling && services.length === 0 ? (
          <div className="col-span-3 flex items-center justify-center py-20 bg-white border border-slate-200 rounded-2xl gap-3 text-slate-400">
            <Loader2 size={20} className="animate-spin" />
            <span className="text-sm font-medium">Polling service status…</span>
          </div>
        ) : services.filter(s => !isSuperhost(s)).length === 0 && !isPolling ? (
          <div className="py-20 bg-white border border-slate-200 rounded-2xl text-center text-slate-400 text-sm font-medium">
            No system services detected. Click <strong>Refresh Status</strong>.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {services.filter(s => !isSuperhost(s)).map(svc => (
              <ServiceCard
                key={svc.name}
                svc={svc}
                pendingAction={pendingActions[svc.name]}
                onAction={runAction}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ── Service Card ──────────────────────────────────────────────────────────────
interface ServiceCardProps {
  svc: SystemService;
  pendingAction?: string;
  onAction: (service: string, action: string) => void;
  highlight?: boolean;
}

const ServiceCard: React.FC<ServiceCardProps> = ({ svc, pendingAction, onAction, highlight }) => {
  const label = SERVICE_LABELS[svc.name] ?? svc.name;
  const isPending = !!pendingAction;

  const StatusIcon =
    svc.status === 'active'  ? CheckCircle :
    svc.status === 'failed'  ? XCircle :
    AlertTriangle;

  const statusColor =
    svc.status === 'active'  ? 'text-emerald-600 bg-emerald-50' :
    svc.status === 'failed'  ? 'text-red-600 bg-red-50' :
    'text-slate-400 bg-slate-100';

  const statusLabel =
    svc.status === 'active'  ? 'Running' :
    svc.status === 'failed'  ? 'Failed' :
    'Stopped';

  return (
    <div className={`bg-white border rounded-2xl overflow-hidden shadow-sm flex flex-col transition-all ${
      highlight ? 'border-orange-200 ring-1 ring-orange-100' : 'border-slate-200 hover:border-slate-300'
    }`}>
      {/* Card header */}
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`p-1.5 rounded-lg flex-shrink-0 ${statusColor}`}>
            {isPending
              ? <Loader2 size={16} className="animate-spin" />
              : <StatusIcon size={16} />
            }
          </div>
          <div className="min-w-0">
            <div className="font-bold text-slate-800 text-sm truncate">{label}</div>
            <div className="text-[10px] font-mono text-slate-400">{svc.name}</div>
          </div>
        </div>
        <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full flex-shrink-0 ${
          isPending ? 'bg-amber-50 text-amber-600' :
          svc.status === 'active' ? 'bg-emerald-50 text-emerald-700' :
          svc.status === 'failed' ? 'bg-red-50 text-red-700' :
          'bg-slate-100 text-slate-500'
        }`}>
          {isPending ? pendingAction + 'ing…' : statusLabel}
        </span>
      </div>

      {/* Card body */}
      <div className="px-5 py-4 flex-1 flex flex-col gap-4">
        {/* Autostart toggle */}
        <div className="flex justify-between items-center">
          <span className="text-xs text-slate-400 font-medium">Start on boot</span>
          <button
            disabled={isPending}
            onClick={() => onAction(svc.name, svc.autostart ? 'disable' : 'enable')}
            className={`flex items-center gap-1.5 text-xs font-bold transition-colors disabled:opacity-40 ${
              svc.autostart
                ? 'text-blue-600 hover:text-blue-700'
                : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            {svc.autostart ? <Power size={12} /> : <PowerOff size={12} />}
            {svc.autostart ? 'Enabled' : 'Disabled'}
          </button>
        </div>

        {/* Action buttons */}
        <div className={`grid gap-2 ${svc.status === 'active' ? 'grid-cols-2' : 'grid-cols-1'}`}>
          {svc.status === 'active' ? (
            <>
              <button
                disabled={isPending}
                onClick={() => onAction(svc.name, 'stop')}
                className="flex items-center justify-center gap-1.5 bg-slate-100 hover:bg-red-50 hover:text-red-600 text-slate-600 py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-40"
              >
                <Square size={12} /> Stop
              </button>
              <button
                disabled={isPending}
                onClick={() => onAction(svc.name, 'restart')}
                className="flex items-center justify-center gap-1.5 bg-slate-100 hover:bg-orange-50 hover:text-orange-600 text-slate-600 py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-40"
              >
                <RefreshCw size={12} className={isPending && pendingAction === 'restart' ? 'animate-spin' : ''} />
                Restart
              </button>
            </>
          ) : (
            <button
              disabled={isPending}
              onClick={() => onAction(svc.name, 'start')}
              className="flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white py-2 rounded-xl text-xs font-bold transition-all shadow-sm shadow-emerald-900/10 disabled:opacity-40"
            >
              <Play size={12} /> Start Service
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ServiceManagerPage;
