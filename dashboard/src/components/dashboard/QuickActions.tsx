import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Power, RefreshCw, Terminal, UploadCloud,
  Globe, Mail, Folder, Zap,
  AlertTriangle, CheckCircle2, XCircle, Loader2,
} from 'lucide-react';
import api from '../../api/client';

interface QuickActionsProps {
  userRole: 'admin' | 'client';
}

// ── Types ──────────────────────────────────────────────────────────────────────

type ActionStatus = 'idle' | 'confirm' | 'running' | 'done' | 'error';

interface ActionState {
  status: ActionStatus;
  message: string;
}

// ── Task poller ────────────────────────────────────────────────────────────────

async function pollTask(taskId: number, timeoutMs = 30_000): Promise<any> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await new Promise(r => setTimeout(r, 800));
    const res = await api.get(`/tasks/${taskId}`);
    const task = res.data;
    if (task.status === 'completed') return task.payload ?? {};
    if (task.status === 'failed') throw new Error(task.error_message ?? 'Task failed');
  }
  throw new Error('Operation timed out');
}

// ── Confirmation / status modal ────────────────────────────────────────────────

interface ModalProps {
  title: string;
  description: string;
  confirmLabel: string;
  confirmColor: string;
  state: ActionState;
  onConfirm: () => void;
  onClose: () => void;
}

const ActionModal: React.FC<ModalProps> = ({
  title, description, confirmLabel, confirmColor,
  state, onConfirm, onClose,
}) => (
  <div
    className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm"
    onClick={e => { if (e.target === e.currentTarget && state.status !== 'running') onClose(); }}
  >
    <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm mx-4">
      <div className="flex flex-col items-center text-center gap-4">
        {state.status === 'running' && (
          <Loader2 className="w-12 h-12 text-orange-500 animate-spin" />
        )}
        {state.status === 'done' && (
          <CheckCircle2 className="w-12 h-12 text-emerald-500" />
        )}
        {state.status === 'error' && (
          <XCircle className="w-12 h-12 text-red-500" />
        )}
        {(state.status === 'confirm' || state.status === 'idle') && (
          <AlertTriangle className="w-12 h-12 text-amber-500" />
        )}

        <div>
          <h3 className="text-lg font-bold text-slate-900">{title}</h3>
          {state.status === 'confirm' && (
            <p className="mt-1 text-sm text-slate-500">{description}</p>
          )}
          {state.message && state.status !== 'confirm' && (
            <p className={`mt-1 text-sm ${state.status === 'error' ? 'text-red-600' : 'text-slate-600'}`}>
              {state.message}
            </p>
          )}
        </div>

        <div className="flex gap-3 w-full">
          {state.status === 'confirm' && (
            <>
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={onConfirm}
                className={`flex-1 px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors ${confirmColor}`}
              >
                {confirmLabel}
              </button>
            </>
          )}
          {(state.status === 'done' || state.status === 'error') && (
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
            >
              Close
            </button>
          )}
          {state.status === 'running' && (
            <p className="text-sm text-slate-400 w-full">Please wait…</p>
          )}
        </div>
      </div>
    </div>
  </div>
);

// ── Component ──────────────────────────────────────────────────────────────────

const QuickActions: React.FC<QuickActionsProps> = ({ userRole }) => {
  const navigate = useNavigate();

  const [reboot, setReboot] = useState<ActionState>({ status: 'idle', message: '' });
  const [restartWeb, setRestartWeb] = useState<ActionState>({ status: 'idle', message: '' });
  const [backup, setBackup] = useState<ActionState>({ status: 'idle', message: '' });

  // ── Reboot Server ────────────────────────────────────────────────────────────

  const handleRebootConfirm = useCallback(async () => {
    setReboot({ status: 'running', message: 'Sending reboot command…' });
    try {
      const res = await api.post('/admin/system/reboot');
      const { taskId } = res.data as { taskId: number };
      // Task marks itself done before shutdown — just poll once quickly
      try { await pollTask(taskId, 5_000); } catch { /* expect timeout after reboot */ }
      setReboot({ status: 'done', message: 'Server is rebooting. The panel will be offline for ~1 minute.' });
    } catch (err: any) {
      setReboot({ status: 'error', message: err.response?.data?.error ?? err.message ?? 'Reboot failed' });
    }
  }, []);

  // ── Restart Web Services ─────────────────────────────────────────────────────

  const handleRestartWebConfirm = useCallback(async () => {
    setRestartWeb({ status: 'running', message: 'Restarting nginx and PHP-FPM…' });
    try {
      const res = await api.post('/admin/system/restart-web');
      const { taskId } = res.data as { taskId: number };
      await pollTask(taskId, 30_000);
      setRestartWeb({ status: 'done', message: 'Nginx and PHP-FPM restarted successfully.' });
    } catch (err: any) {
      setRestartWeb({ status: 'error', message: err.response?.data?.error ?? err.message ?? 'Restart failed' });
    }
  }, []);

  // ── Manual Backup ────────────────────────────────────────────────────────────

  const handleBackupConfirm = useCallback(async () => {
    setBackup({ status: 'running', message: 'Archiving server configuration…' });
    try {
      const res = await api.post('/admin/system/backup');
      const { taskId } = res.data as { taskId: number };
      const result = await pollTask(taskId, 120_000);
      const sizeKb = result.sizeBytes ? Math.round(result.sizeBytes / 1024) : null;
      setBackup({
        status: 'done',
        message: `Backup complete${sizeKb ? ` (${sizeKb} KB)` : ''}. Saved to /root/superhost-backups/`,
      });
    } catch (err: any) {
      setBackup({ status: 'error', message: err.response?.data?.error ?? err.message ?? 'Backup failed' });
    }
  }, []);

  // ── Admin actions ────────────────────────────────────────────────────────────

  const adminActions = [
    {
      title: 'Reboot Server',
      icon: Power,
      color: 'text-red-500',
      bg: 'bg-red-50',
      onClick: () => setReboot({ status: 'confirm', message: '' }),
    },
    {
      title: 'Restart Web Services',
      icon: RefreshCw,
      color: 'text-orange-500',
      bg: 'bg-orange-50',
      onClick: () => setRestartWeb({ status: 'confirm', message: '' }),
    },
    {
      title: 'Root Terminal',
      icon: Terminal,
      color: 'text-slate-700',
      bg: 'bg-slate-100',
      onClick: () => navigate('/terminal'),
    },
    {
      title: 'Manual Backup',
      icon: UploadCloud,
      color: 'text-amber-600',
      bg: 'bg-amber-50',
      onClick: () => setBackup({ status: 'confirm', message: '' }),
    },
  ];

  const userActions = [
    { title: 'Add Domain', icon: Globe, color: 'text-orange-500', bg: 'bg-orange-50', onClick: () => navigate('/domains') },
    { title: 'Create Email', icon: Mail, color: 'text-emerald-500', bg: 'bg-emerald-50', onClick: () => navigate('/email') },
    { title: 'File Manager', icon: Folder, color: 'text-amber-500', bg: 'bg-amber-50', onClick: () => navigate('/files') },
    { title: 'Install WordPress', icon: Zap, color: 'text-orange-600', bg: 'bg-orange-50', onClick: () => navigate('/apps') },
  ];

  const actions = userRole === 'admin' ? adminActions : userActions;

  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {actions.map((action, idx) => (
          <button
            key={idx}
            onClick={action.onClick}
            className="group bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-all flex flex-col items-center justify-center gap-3"
          >
            <div className={`p-3 rounded-full ${action.bg} ${action.color} group-hover:scale-110 transition-transform`}>
              <action.icon className="w-6 h-6" />
            </div>
            <span className="text-sm font-medium text-slate-700">{action.title}</span>
          </button>
        ))}
      </div>

      {/* Reboot modal */}
      {reboot.status !== 'idle' && (
        <ActionModal
          title="Reboot Server"
          description="This will immediately reboot the server. All sites will be offline for ~1 minute."
          confirmLabel="Reboot Now"
          confirmColor="bg-red-600 hover:bg-red-700"
          state={reboot}
          onConfirm={handleRebootConfirm}
          onClose={() => setReboot({ status: 'idle', message: '' })}
        />
      )}

      {/* Restart web services modal */}
      {restartWeb.status !== 'idle' && (
        <ActionModal
          title="Restart Web Services"
          description="Nginx and PHP-FPM will be restarted. Sites may be unavailable for a few seconds."
          confirmLabel="Restart"
          confirmColor="bg-orange-600 hover:bg-orange-700"
          state={restartWeb}
          onConfirm={handleRestartWebConfirm}
          onClose={() => setRestartWeb({ status: 'idle', message: '' })}
        />
      )}

      {/* Backup modal */}
      {backup.status !== 'idle' && (
        <ActionModal
          title="Manual Backup"
          description="Archives Nginx, Postfix, Dovecot, BIND, and OpenDKIM configs to /root/superhost-backups/."
          confirmLabel="Start Backup"
          confirmColor="bg-amber-600 hover:bg-amber-700"
          state={backup}
          onConfirm={handleBackupConfirm}
          onClose={() => setBackup({ status: 'idle', message: '' })}
        />
      )}
    </>
  );
};

export default QuickActions;
