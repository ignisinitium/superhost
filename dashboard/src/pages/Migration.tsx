import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import type { CwpMigration, CwpDiscoveredUser } from '../../../shared/types';
import {
  ArrowRight, CheckCircle2, RefreshCw, Loader2,
  Server, Database, Mail, Globe, HardDrive,
  ChevronDown, ChevronRight, AlertTriangle, Trash2,
  KeyRound, Lock, User, ArrowLeft, Play, Wifi,
} from 'lucide-react';
import toast from 'react-hot-toast';

type Step = 'connect' | 'discovering' | 'select' | 'migrating' | 'done';

const STEPS: { key: Step; label: string }[] = [
  { key: 'connect',     label: 'Connect'   },
  { key: 'select',      label: 'Select'    },
  { key: 'migrating',   label: 'Migrate'   },
  { key: 'done',        label: 'Complete'  },
];

function stepIndex(s: Step): number {
  const map: Record<Step, number> = { connect: 0, discovering: 0, select: 1, migrating: 2, done: 3 };
  return map[s];
}

function fmt(n: number, unit: string) { return `${n} ${unit}${n !== 1 ? 's' : ''}`; }
function fmtMb(mb: number) { return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb} MB`; }

// ── Discovered user card ──────────────────────────────────────────────────────
const UserCard: React.FC<{
  user: CwpDiscoveredUser;
  checked: boolean;
  onToggle: () => void;
}> = ({ user, checked, onToggle }) => {
  const [open, setOpen] = useState(false);
  const totalItems = user.domains.length + user.databases.length + user.email_accounts.length;

  return (
    <div className={`border rounded-xl overflow-hidden transition-all ${checked ? 'border-indigo-300 bg-indigo-50/30' : 'border-slate-200 bg-white'}`}>
      <div className="flex items-center gap-3 px-4 py-3">
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          className="w-4 h-4 accent-indigo-600 cursor-pointer flex-shrink-0"
        />
        <button
          className="flex-1 flex items-center gap-3 text-left"
          onClick={() => setOpen(o => !o)}
        >
          <div className="w-9 h-9 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center flex-shrink-0">
            <User size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-slate-800 text-sm font-mono">{user.username}</p>
            <p className="text-xs text-slate-400 truncate">{user.email}</p>
          </div>
          <div className="flex items-center gap-4 text-xs text-slate-400 pr-2">
            <span className="flex items-center gap-1"><Globe size={11} /> {user.domains.length}</span>
            <span className="flex items-center gap-1"><Database size={11} /> {user.databases.length}</span>
            <span className="flex items-center gap-1"><Mail size={11} /> {user.email_accounts.length}</span>
            <span className="flex items-center gap-1"><HardDrive size={11} /> {fmtMb(user.disk_usage_mb)}</span>
          </div>
          {open ? <ChevronDown size={15} className="text-slate-400 flex-shrink-0" /> : <ChevronRight size={15} className="text-slate-400 flex-shrink-0" />}
        </button>
      </div>

      {open && (
        <div className="border-t border-slate-100 px-4 pb-4 pt-3 space-y-3 bg-slate-50/50">
          {user.domains.length > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2 flex items-center gap-1.5"><Globe size={10} /> Domains</p>
              <div className="space-y-2">
                {user.domains.map((d) => (
                  <div key={d.domain}>
                    <div className="flex items-center gap-2 text-xs text-slate-600">
                      <span className="font-mono font-semibold">{d.domain}</span>
                      <span className="text-slate-400">PHP {d.php_version}</span>
                      {d.has_ssl && <span className="text-emerald-600 font-bold text-[10px]">SSL</span>}
                      {d.dns_records?.length > 0 && (
                        <span className="text-violet-500 text-[10px] font-bold">{d.dns_records.length} DNS</span>
                      )}
                    </div>
                    {d.dns_records?.length > 0 && (
                      <div className="mt-1 ml-2 space-y-0.5">
                        {d.dns_records.map((r, i) => (
                          <div key={i} className="flex items-baseline gap-1.5 text-[10px] font-mono text-slate-500">
                            <span className="text-violet-400 font-bold w-10 flex-shrink-0">{r.type}</span>
                            <span className="text-slate-400 w-24 flex-shrink-0 truncate">{r.name}</span>
                            <span className="truncate text-slate-500">{r.content}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          {user.databases.length > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2 flex items-center gap-1.5"><Database size={10} /> Databases</p>
              <div className="space-y-1">
                {user.databases.map((d) => (
                  <div key={d.db_name} className="flex items-center gap-2 text-xs text-slate-600">
                    <span className="font-mono font-semibold">{d.db_name}</span>
                    <span className="text-slate-400">{fmtMb(d.size_mb)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {user.email_accounts.length > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2 flex items-center gap-1.5"><Mail size={10} /> Email Accounts</p>
              <div className="space-y-1">
                {user.email_accounts.map((e) => (
                  <p key={e.email} className="text-xs font-mono text-slate-600">{e.email}</p>
                ))}
              </div>
            </div>
          )}
          {totalItems === 0 && (
            <p className="text-xs text-slate-400 italic">No domains, databases or email accounts detected</p>
          )}
        </div>
      )}
    </div>
  );
};

// ── Past migrations list ──────────────────────────────────────────────────────
const PastMigrations: React.FC<{
  onResume: (mig: CwpMigration) => void;
  onRetry: (mig: CwpMigration) => void;
}> = ({ onResume, onRetry }) => {
  const qc = useQueryClient();
  const { data: migrations = [] } = useQuery<CwpMigration[]>({
    queryKey: ['cwpMigrations'],
    queryFn: async () => (await api.get('/admin/migrations')).data,
    refetchInterval: 10_000,
  });

  const deleteMut = useMutation({
    mutationFn: async (id: number) => api.delete(`/admin/migrations/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['cwpMigrations'] }); toast.success('Migration record deleted'); },
  });

  if (migrations.length === 0) return null;

  const statusColor: Record<string, string> = {
    discovering: 'text-amber-600 bg-amber-50 border-amber-200',
    ready:       'text-blue-600 bg-blue-50 border-blue-200',
    migrating:   'text-indigo-600 bg-indigo-50 border-indigo-200',
    completed:   'text-emerald-600 bg-emerald-50 border-emerald-200',
    failed:      'text-red-600 bg-red-50 border-red-200',
    pending:     'text-slate-500 bg-slate-100 border-slate-200',
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
      <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
        <h2 className="text-base font-bold text-slate-800">Previous Migrations</h2>
      </div>
      <div className="divide-y divide-slate-100">
        {migrations.map((m) => (
          <div key={m.id} className="flex items-center gap-4 px-6 py-4">
            <div className="flex-1 min-w-0">
              <p className="font-bold text-slate-800 text-sm font-mono">{m.remote_host}</p>
              <p className="text-xs text-slate-400">
                {new Date(m.created_at).toLocaleString()} · {m.remote_user}@{m.remote_host}:{m.remote_port}
                {m.selected_users?.length ? ` · ${m.selected_users.length} user(s)` : ''}
              </p>
              {m.error_message && <p className="text-xs text-red-500 mt-0.5 truncate">{m.error_message}</p>}
            </div>
            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-widest border ${statusColor[m.status] ?? ''}`}>
              {m.status}
            </span>
            {(m.status === 'ready' || m.status === 'migrating' || m.status === 'discovering') && (
              <button
                onClick={() => onResume(m)}
                className="text-xs font-bold text-indigo-600 hover:text-indigo-800 px-3 py-1.5 rounded-lg hover:bg-indigo-50 transition-colors"
              >
                View
              </button>
            )}
            {m.status === 'failed' && (
              <button
                onClick={() => onRetry(m)}
                className="text-xs font-bold text-amber-600 hover:text-amber-800 px-3 py-1.5 rounded-lg hover:bg-amber-50 transition-colors"
              >
                Retry
              </button>
            )}
            <button
              onClick={() => deleteMut.mutate(m.id)}
              disabled={deleteMut.isPending}
              className="text-slate-400 hover:text-red-500 p-1.5 rounded-lg hover:bg-red-50 transition-colors"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

// ── Main Page ─────────────────────────────────────────────────────────────────
const MigrationPage: React.FC = () => {
  const qc = useQueryClient();
  const logRef = useRef<HTMLDivElement>(null);

  const [step, setStep]             = useState<Step>('connect');
  const [migrationId, setMigId]     = useState<number | null>(null);
  const [migration, setMigration]   = useState<CwpMigration | null>(null);
  const [selected, setSelected]     = useState<Set<string>>(new Set());

  // Connection form
  const [host, setHost]             = useState('');
  const [port, setPort]             = useState(22);
  const [user, setUser]             = useState('root');
  const [authType, setAuthType]     = useState<'password' | 'key'>('password');
  const [password, setPassword]     = useState('');
  const [sshKey, setSshKey]         = useState('');

  // Test connection state
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'ok' | 'error'>('idle');
  const [testError, setTestError]   = useState('');

  // Discovery error (shown inline in the connect form)
  const [discoverError, setDiscoverError] = useState('');

  // Poll migration record when we have an ID — only while actively discovering or migrating
  useEffect(() => {
    if (!migrationId || step === 'connect') return;
    const iv = setInterval(async () => {
      try {
        const res = await api.get<CwpMigration>(`/admin/migrations/${migrationId}`);
        const mig = res.data;
        setMigration(mig);
        if (mig.status === 'ready' && step === 'discovering') {
          setStep('select');
          const discoveredUsers = mig.discovery_data?.users ?? [];
          setSelected(new Set(discoveredUsers.map((u) => u.username)));
        } else if (mig.status === 'completed' && step === 'migrating') {
          setStep('done');
          qc.invalidateQueries({ queryKey: ['cwpMigrations'] });
        } else if (mig.status === 'failed' && step !== 'done') {
          if (step === 'discovering') {
            setStep('connect');
            setDiscoverError(mig.error_message ?? 'Discovery failed');
          } else if (step === 'migrating' || step === 'select') {
            setStep('select');
            toast.error(mig.error_message ?? 'Migration failed');
          }
          qc.invalidateQueries({ queryKey: ['cwpMigrations'] });
        }
      } catch { /* ignore poll errors */ }
    }, 2500);
    return () => clearInterval(iv);
  }, [migrationId, step, qc]);

  // Auto-scroll logs
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [migration?.logs]);

  // Retry discover for a failed migration
  const retryDiscoverMut = useMutation({
    mutationFn: async (migId: number) => {
      await api.post(`/admin/migrations/${migId}/retry-discover`, {
        authType,
        sshPassword: authType === 'password' ? password : undefined,
        sshKey: authType === 'key' ? sshKey.trim() : undefined,
      });
    },
    onSuccess: (_, migId) => {
      setMigId(migId);
      setStep('discovering');
      qc.invalidateQueries({ queryKey: ['cwpMigrations'] });
    },
    onError: (err: any) => toast.error(err.response?.data?.message ?? 'Retry failed'),
  });

  const handleRetry = (mig: CwpMigration) => {
    setHost(mig.remote_host);
    setPort(mig.remote_port);
    setUser(mig.remote_user);
    setMigId(mig.id);
    setMigration(mig);
    setDiscoverError(mig.error_message ?? '');
    setTestStatus('idle');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubmitDiscover = () => {
    setDiscoverError('');
    if (migrationId !== null) {
      retryDiscoverMut.mutate(migrationId);
    } else {
      discoverMut.mutate();
    }
  };

  // Test connection
  const testConnection = async () => {
    setTestStatus('testing');
    setTestError('');
    try {
      const res = await api.post<{ taskId: number }>('/admin/migrations/test-connection', {
        remoteHost: host.trim(),
        remotePort: port,
        remoteUser: user.trim(),
        authType,
        sshPassword: authType === 'password' ? password : undefined,
        sshKey: authType === 'key' ? sshKey.trim() : undefined,
      });
      const { taskId } = res.data;
      // Poll until done
      const poll = setInterval(async () => {
        try {
          const t = await api.get<{ status: string; error_message?: string }>(`/tasks/${taskId}`);
          if (t.data.status === 'completed') {
            clearInterval(poll);
            setTestStatus('ok');
          } else if (t.data.status === 'failed') {
            clearInterval(poll);
            setTestStatus('error');
            setTestError(t.data.error_message ?? 'Connection failed');
          }
        } catch { clearInterval(poll); setTestStatus('error'); setTestError('Poll error'); }
      }, 1500);
    } catch (err: any) {
      setTestStatus('error');
      setTestError(err.response?.data?.message ?? 'Request failed');
    }
  };

  // Discover mutation
  const discoverMut = useMutation({
    mutationFn: async () => {
      const res = await api.post<{ migrationId: number }>('/admin/migrations/discover', {
        remoteHost: host.trim(),
        remotePort: port,
        remoteUser: user.trim(),
        authType,
        sshPassword: authType === 'password' ? password : undefined,
        sshKey: authType === 'key' ? sshKey.trim() : undefined,
      });
      return res.data;
    },
    onSuccess: ({ migrationId: id }) => {
      setMigId(id);
      setStep('discovering');
      qc.invalidateQueries({ queryKey: ['cwpMigrations'] });
    },
    onError: (err: any) => toast.error(err.response?.data?.message ?? 'Discovery failed'),
  });

  // Migrate mutation
  const migrateMut = useMutation({
    mutationFn: async () => {
      await api.post(`/admin/migrations/${migrationId!}/migrate`, {
        selectedUsers: [...selected],
        authType,
        sshPassword: authType === 'password' ? password : undefined,
        sshKey: authType === 'key' ? sshKey.trim() : undefined,
      });
    },
    onSuccess: () => {
      setStep('migrating');
    },
    onError: (err: any) => toast.error(err.response?.data?.message ?? 'Failed to start migration'),
  });

  const handleResume = (mig: CwpMigration) => {
    setMigId(mig.id);
    setMigration(mig);
    setHost(mig.remote_host);
    setPort(mig.remote_port);
    setUser(mig.remote_user);
    if (mig.status === 'ready') {
      setSelected(new Set(mig.discovery_data?.users.map((u) => u.username) ?? []));
      setStep('select');
    } else if (mig.status === 'migrating') {
      setStep('migrating');
    } else if (mig.status === 'discovering') {
      setStep('discovering');
    }
  };

  const discoveredUsers = migration?.discovery_data?.users ?? [];
  const progress = migration?.progress ?? { users_total: 0, users_done: 0 };
  const pct = progress.users_total > 0 ? Math.round((progress.users_done / progress.users_total) * 100) : 0;

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Import from CWP</h1>
        <p className="text-slate-500 mt-1">Migrate users, websites, databases and email from a Control Web Panel server.</p>
      </div>

      {/* Past migrations */}
      {step === 'connect' && <PastMigrations onResume={handleResume} onRetry={handleRetry} />}

      {/* Step indicators */}
      <div className="flex items-center gap-0">
        {STEPS.map((s, idx) => {
          const current = stepIndex(step);
          const done = current > idx;
          const active = current === idx;
          return (
            <React.Fragment key={s.key}>
              <div className="flex flex-col items-center gap-1">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all ${
                  done   ? 'bg-emerald-500 border-emerald-500 text-white' :
                  active ? 'bg-indigo-600 border-indigo-600 text-white shadow-md shadow-indigo-900/20' :
                           'bg-white border-slate-200 text-slate-400'
                }`}>
                  {done ? <CheckCircle2 size={14} /> : <span>{idx + 1}</span>}
                </div>
                <span className={`text-[10px] font-bold uppercase tracking-widest hidden sm:block ${active ? 'text-indigo-600' : done ? 'text-emerald-600' : 'text-slate-400'}`}>
                  {s.label}
                </span>
              </div>
              {idx < STEPS.length - 1 && (
                <div className={`flex-1 h-0.5 mt-[-14px] mx-1 transition-all ${done ? 'bg-emerald-400' : 'bg-slate-200'}`} />
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* ── Step 1: Connect ──────────────────────────────────────────────── */}
      {(step === 'connect' || step === 'discovering') && (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
            <h2 className="text-base font-bold text-slate-800 flex items-center gap-2"><Server size={18} className="text-indigo-600" /> Remote Server Connection</h2>
          </div>
          <div className="p-6 space-y-5">
            {/* Retry context banner */}
            {migrationId !== null && step === 'connect' && (
              <div className="flex items-center justify-between p-3 bg-indigo-50 border border-indigo-200 rounded-xl text-sm">
                <span className="text-indigo-700 font-medium">
                  Retrying migration <span className="font-mono font-bold">#{migrationId}</span> — enter credentials and click Retry Discovery
                </span>
                <button
                  type="button"
                  onClick={() => { setMigId(null); setMigration(null); setDiscoverError(''); setHost(''); }}
                  className="text-xs font-bold text-indigo-600 hover:text-indigo-800 underline ml-4 flex-shrink-0"
                >
                  Start new instead
                </button>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-2 space-y-1.5">
                <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 ml-0.5">Hostname / IP</label>
                <input
                  type="text"
                  value={host}
                  onChange={(e) => { setHost(e.target.value); setTestStatus('idle'); setMigId(null); setMigration(null); setDiscoverError(''); }}
                  placeholder="203.0.113.42 or cwp.example.com"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-sm font-mono text-slate-800 focus:ring-2 focus:ring-indigo-500/40 outline-none transition-all"
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 ml-0.5">SSH Port</label>
                <input
                  type="number"
                  value={port}
                  onChange={(e) => setPort(Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-sm font-mono text-slate-800 focus:ring-2 focus:ring-indigo-500/40 outline-none transition-all"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 ml-0.5">SSH Username</label>
              <input
                type="text"
                value={user}
                onChange={(e) => setUser(e.target.value)}
                placeholder="root"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-sm font-mono text-slate-800 focus:ring-2 focus:ring-indigo-500/40 outline-none transition-all"
              />
            </div>

            {/* Auth type */}
            <div className="space-y-1.5">
              <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 ml-0.5">Authentication</label>
              <div className="grid grid-cols-2 gap-3">
                {(['password', 'key'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setAuthType(t)}
                    className={`py-3 rounded-xl border font-bold transition-all text-sm flex items-center justify-center gap-2 ${
                      authType === t
                        ? 'bg-slate-800 border-slate-800 text-white shadow-md'
                        : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                    }`}
                  >
                    {t === 'password' ? <Lock size={14} /> : <KeyRound size={14} />}
                    {t === 'password' ? 'Password' : 'SSH Key'}
                  </button>
                ))}
              </div>
            </div>

            {authType === 'password' ? (
              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 ml-0.5">SSH Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setTestStatus('idle'); }}
                  placeholder="••••••••"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-sm text-slate-800 focus:ring-2 focus:ring-indigo-500/40 outline-none transition-all"
                />
              </div>
            ) : (
              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 ml-0.5">Private Key (PEM)</label>
                <textarea
                  value={sshKey}
                  onChange={(e) => { setSshKey(e.target.value); setTestStatus('idle'); }}
                  placeholder="-----BEGIN RSA PRIVATE KEY-----&#10;..."
                  rows={6}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-xs font-mono text-slate-800 focus:ring-2 focus:ring-indigo-500/40 outline-none transition-all resize-none"
                />
              </div>
            )}

            {/* Credential notice */}
            <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl text-xs text-amber-700 flex items-start gap-2">
              <AlertTriangle size={14} className="mt-0.5 flex-shrink-0 text-amber-500" />
              Credentials are sent securely to the worker and used only for this migration. They are not stored.
              Migrated user accounts will require a password reset before they can log into this panel.
            </div>

            {/* Test connection result */}
            {testStatus === 'ok' && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm font-bold text-emerald-700 flex items-center gap-2">
                <CheckCircle2 size={16} className="flex-shrink-0" /> SSH connection successful
              </div>
            )}
            {testStatus === 'error' && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-start gap-2">
                <AlertTriangle size={15} className="flex-shrink-0 mt-0.5 text-red-500" />
                <span className="break-all">{testError}</span>
              </div>
            )}

            {/* Discovery error (returned after a failed discover attempt) */}
            {discoverError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-start gap-2">
                <AlertTriangle size={15} className="flex-shrink-0 mt-0.5 text-red-500" />
                <span className="break-all">{discoverError}</span>
              </div>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={testConnection}
                disabled={testStatus === 'testing' || step === 'discovering' || !host.trim() || (authType === 'password' ? !password : !sshKey.trim())}
                className="flex items-center gap-2 px-4 py-3 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-600 hover:bg-slate-50 transition-all disabled:opacity-50 flex-shrink-0"
              >
                {testStatus === 'testing'
                  ? <><Loader2 size={14} className="animate-spin" /> Testing…</>
                  : <><Wifi size={14} /> Test SSH</>
                }
              </button>
              <button
                onClick={handleSubmitDiscover}
                disabled={discoverMut.isPending || retryDiscoverMut.isPending || step === 'discovering' || !host.trim()}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-xl font-bold text-sm transition-all shadow-md shadow-indigo-900/20 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {(discoverMut.isPending || retryDiscoverMut.isPending || step === 'discovering') ? (
                  <><Loader2 size={16} className="animate-spin" /> Discovering…</>
                ) : migrationId !== null ? (
                  <><RefreshCw size={16} /> Retry Discovery</>
                ) : (
                  <><RefreshCw size={16} /> Connect &amp; Discover Accounts</>
                )}
              </button>
            </div>

            {/* Live log output while discovering */}
            {step === 'discovering' && (
              <div className="bg-slate-900 rounded-xl overflow-hidden border border-slate-800">
                <div className="px-4 py-2 border-b border-slate-800 flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Discovery Log</span>
                  <span className="flex gap-1">
                    <span className="w-2 h-2 rounded-full bg-red-500/60" />
                    <span className="w-2 h-2 rounded-full bg-amber-500/60" />
                    <span className="w-2 h-2 rounded-full bg-emerald-500/60" />
                  </span>
                </div>
                <div
                  ref={logRef}
                  className="h-40 overflow-y-auto p-3 font-mono text-[11px] leading-relaxed space-y-0.5"
                >
                  {(migration?.logs ?? []).length === 0 ? (
                    <p className="text-slate-500 italic animate-pulse">Connecting to remote server…</p>
                  ) : (
                    (migration?.logs ?? []).map((line, i) => (
                      <p key={i} className={
                        line.includes('ERROR') || line.includes('FATAL') ? 'text-red-400' :
                        line.includes('established') || line.includes('complete') ? 'text-emerald-400' :
                        'text-slate-400'
                      }>{line}</p>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Step 2: Select ───────────────────────────────────────────────── */}
      {step === 'select' && migration?.discovery_data && (
        <div className="space-y-4">
          {/* Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Users',    icon: User,     value: discoveredUsers.length,                                        color: 'text-indigo-600 bg-indigo-50' },
              { label: 'Domains',  icon: Globe,    value: discoveredUsers.reduce((s, u) => s + u.domains.length, 0),     color: 'text-sky-600 bg-sky-50' },
              { label: 'Databases',icon: Database, value: discoveredUsers.reduce((s, u) => s + u.databases.length, 0),  color: 'text-violet-600 bg-violet-50' },
              { label: 'Emails',   icon: Mail,     value: discoveredUsers.reduce((s, u) => s + u.email_accounts.length, 0), color: 'text-emerald-600 bg-emerald-50' },
            ].map(({ label, icon: Icon, value, color }) => (
              <div key={label} className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3 shadow-sm">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
                  <Icon size={18} />
                </div>
                <div>
                  <p className="text-xl font-bold text-slate-800">{value}</p>
                  <p className="text-xs text-slate-400">{label}</p>
                </div>
              </div>
            ))}
          </div>

          {/* User list */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-800">Select Accounts to Migrate</h2>
              <div className="flex gap-2">
                <button
                  onClick={() => setSelected(new Set(discoveredUsers.map((u) => u.username)))}
                  className="text-xs font-bold text-indigo-600 hover:text-indigo-800 px-2 py-1 rounded-lg hover:bg-indigo-50 transition-colors"
                >
                  All
                </button>
                <button
                  onClick={() => setSelected(new Set())}
                  className="text-xs font-bold text-slate-500 hover:text-slate-700 px-2 py-1 rounded-lg hover:bg-slate-100 transition-colors"
                >
                  None
                </button>
              </div>
            </div>
            <div className="p-4 space-y-2">
              {discoveredUsers.map((u) => (
                <UserCard
                  key={u.username}
                  user={u}
                  checked={selected.has(u.username)}
                  onToggle={() => {
                    setSelected((prev) => {
                      const next = new Set(prev);
                      if (next.has(u.username)) next.delete(u.username);
                      else next.add(u.username);
                      return next;
                    });
                  }}
                />
              ))}
            </div>
          </div>

          {/* Discovery log — always shown, prominent when 0 accounts */}
          <div className={`bg-slate-900 rounded-2xl overflow-hidden border ${discoveredUsers.length === 0 ? 'border-amber-500/40' : 'border-slate-800'}`}>
            <div className="px-4 py-2.5 border-b border-slate-800 flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Discovery Log</span>
              {discoveredUsers.length === 0 && (
                <span className="text-[10px] font-bold text-amber-400 uppercase tracking-widest">0 accounts found — check log below</span>
              )}
            </div>
            <div
              ref={logRef}
              className="h-48 overflow-y-auto p-4 font-mono text-[11px] leading-relaxed space-y-0.5"
            >
              {(migration.logs ?? []).map((line, i) => (
                <p key={i} className={
                  line.includes('ERROR') || line.includes('FATAL') ? 'text-red-400' :
                  line.includes('complete') || line.includes('established') ? 'text-emerald-400' :
                  line.includes('Skipped') ? 'text-amber-400' :
                  line.includes('accepted') ? 'text-sky-400' :
                  'text-slate-400'
                }>{line}</p>
              ))}
              {(migration.logs ?? []).length === 0 && (
                <p className="text-slate-600 italic">No log entries.</p>
              )}
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => { setStep('connect'); setMigId(null); setMigration(null); }}
              className="bg-white border border-slate-200 text-slate-600 px-5 py-3 rounded-xl font-bold text-sm flex items-center gap-2 hover:bg-slate-50 transition-all"
            >
              <ArrowLeft size={15} /> Back
            </button>
            <button
              onClick={() => migrateMut.mutate()}
              disabled={selected.size === 0 || migrateMut.isPending || !password && authType === 'password'}
              className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 shadow-md shadow-indigo-900/20 disabled:opacity-50 transition-all"
            >
              {migrateMut.isPending
                ? <><Loader2 size={16} className="animate-spin" /> Starting…</>
                : <><Play size={16} /> Migrate {selected.size} {selected.size === 1 ? 'User' : 'Users'}</>
              }
            </button>
          </div>
        </div>
      )}

      {/* ── Step 3: Migrating ────────────────────────────────────────────── */}
      {step === 'migrating' && (
        <div className="space-y-4">
          {/* Progress header */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center flex-shrink-0">
                <Loader2 size={24} className="animate-spin" />
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-slate-800">Migration in progress</h3>
                <p className="text-sm text-slate-500 mt-0.5">
                  {progress.current_step
                    ? `${progress.current_user ? `[${progress.current_user}] ` : ''}${progress.current_step}`
                    : 'Initialising…'
                  }
                </p>
              </div>
              <span className="text-2xl font-bold text-indigo-600">{pct}%</span>
            </div>

            {/* Progress bar */}
            <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
              <div
                className="bg-indigo-500 h-2.5 rounded-full transition-all duration-700"
                style={{ width: `${Math.max(2, pct)}%` }}
              />
            </div>

            <p className="text-xs text-slate-400 text-right">
              {progress.users_done} / {progress.users_total} user{progress.users_total !== 1 ? 's' : ''} complete
            </p>
          </div>

          {/* Log output */}
          <div className="bg-slate-900 rounded-2xl overflow-hidden shadow-sm border border-slate-800">
            <div className="px-4 py-2.5 border-b border-slate-800 flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Migration Log</span>
              <span className="flex gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500/60" />
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/60" />
              </span>
            </div>
            <div
              ref={logRef}
              className="h-72 overflow-y-auto p-4 font-mono text-[11px] leading-relaxed space-y-0.5"
            >
              {(migration?.logs ?? []).map((line, i) => (
                <p key={i} className={
                  line.includes('ERROR') || line.includes('FATAL') ? 'text-red-400' :
                  line.includes('✓') || line.includes('complete') ? 'text-emerald-400' :
                  line.includes('━━━') ? 'text-indigo-300 font-bold' :
                  'text-slate-400'
                }>{line}</p>
              ))}
              {(migration?.logs ?? []).length === 0 && (
                <p className="text-slate-600 italic">Waiting for worker…</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Step 4: Done ─────────────────────────────────────────────────── */}
      {step === 'done' && migration && (
        <div className="space-y-4">
          <div className="bg-white border border-emerald-200 rounded-2xl p-8 shadow-sm text-center space-y-3">
            <div className="w-16 h-16 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
              <CheckCircle2 size={36} />
            </div>
            <h2 className="text-xl font-bold text-slate-800">Migration Complete</h2>
            <p className="text-slate-500 text-sm max-w-md mx-auto">
              {fmt(migration.selected_users?.length ?? 0, 'account')} migrated from {migration.remote_host}.
              Migrated users cannot log in until an admin sets their password via the Users page.
            </p>
            <div className="flex gap-3 justify-center pt-2">
              <a
                href="/users"
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-xl font-bold text-sm transition-all flex items-center gap-2"
              >
                <User size={15} /> View Users <ArrowRight size={15} />
              </a>
              <button
                onClick={() => { setStep('connect'); setMigId(null); setMigration(null); setSelected(new Set()); setHost(''); setPassword(''); setSshKey(''); }}
                className="bg-white border border-slate-200 text-slate-600 px-6 py-2.5 rounded-xl font-bold text-sm hover:bg-slate-50 transition-all"
              >
                New Migration
              </button>
            </div>
          </div>

          {/* Final log */}
          <div className="bg-slate-900 rounded-2xl overflow-hidden shadow-sm border border-slate-800">
            <div className="px-4 py-2.5 border-b border-slate-800">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Migration Log</span>
            </div>
            <div className="h-64 overflow-y-auto p-4 font-mono text-[11px] leading-relaxed space-y-0.5">
              {(migration.logs ?? []).map((line, i) => (
                <p key={i} className={
                  line.includes('ERROR') || line.includes('FATAL') ? 'text-red-400' :
                  line.includes('✓') || line.includes('complete') || line.includes('successfully') ? 'text-emerald-400' :
                  line.includes('━━━') ? 'text-indigo-300 font-bold' :
                  'text-slate-400'
                }>{line}</p>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MigrationPage;
