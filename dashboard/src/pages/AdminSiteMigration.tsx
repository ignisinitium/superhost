import React, { useEffect, useState } from 'react';
import api from '../api/client';
import toast from 'react-hot-toast';
import { ServerCog, Loader2, CheckCircle2, XCircle, Clock, RefreshCw, Plug } from 'lucide-react';

interface User { id: number; username: string; }
interface Migration {
  id: number; source_host: string; ssh_user: string; remote_path: string; domain_name: string;
  stack: string; status: string; error_message?: string; created_at: string; target_user?: string;
}

const STACKS = [
  { v: 'node', label: 'Node.js' }, { v: 'python', label: 'Python' },
  { v: 'static', label: 'Static (HTML/SPA)' }, { v: 'php', label: 'PHP' },
];

const AdminSiteMigration: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [migrations, setMigrations] = useState<Migration[]>([]);
  const [viewing, setViewing] = useState<{ id: number; log: string; status: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [f, setF] = useState({
    targetUserId: '', domainName: '', stack: 'node',
    sourceHost: '', sourcePort: '22', sshUser: 'root', authType: 'key', sshKey: '', sshPassword: '',
    remotePath: '', installCommand: 'npm install', buildCommand: '', startCommand: 'npm start', appPort: '', phpVersion: '8.3',
  });
  const set = (k: string, v: string) => setF(p => ({ ...p, [k]: v }));

  const loadMigrations = () => api.get('/admin/site-migrations').then(r => setMigrations(r.data)).catch(() => {});
  useEffect(() => { api.get('/users').then(r => setUsers(r.data)).catch(() => {}); loadMigrations(); }, []);

  // Poll a viewed migration's log while it runs.
  useEffect(() => {
    if (!viewing || (viewing.status !== 'running' && viewing.status !== 'pending')) return;
    const t = setInterval(async () => {
      const r = await api.get(`/admin/site-migrations/${viewing.id}`);
      setViewing({ id: viewing.id, log: r.data.log, status: r.data.status });
      if (r.data.status === 'completed' || r.data.status === 'failed') loadMigrations();
    }, 2500);
    return () => clearInterval(t);
  }, [viewing]);

  const testConn = async () => {
    setTesting(true);
    try {
      const { data } = await api.post('/admin/site-migrations/test-connection', {
        host: f.sourceHost, port: Number(f.sourcePort), user: f.sshUser, authType: f.authType, sshPassword: f.sshPassword, sshKey: f.sshKey });
      // poll the task
      for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 1500));
        const t = (await api.get(`/tasks/${data.taskId}`)).data;
        if (t.status === 'completed') { toast.success('SSH connection OK'); break; }
        if (t.status === 'failed') { toast.error(t.error_message || 'Connection failed'); break; }
      }
    } catch (e: any) { toast.error(e.response?.data?.message || 'Test failed'); }
    finally { setTesting(false); }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setSubmitting(true);
    try {
      const { data } = await api.post('/admin/site-migrations', f);
      toast.success('Migration started');
      await loadMigrations();
      const m = (await api.get(`/admin/site-migrations/${data.id}`)).data;
      setViewing({ id: data.id, log: m.log, status: m.status });
    } catch (e: any) { toast.error(e.response?.data?.message || 'Failed to start'); }
    finally { setSubmitting(false); }
  };

  const isApp = f.stack === 'node' || f.stack === 'python';
  const input = 'w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/40';
  const StatusIcon = ({ s }: { s: string }) => s === 'completed' ? <CheckCircle2 size={15} className="text-green-600" /> :
    s === 'failed' ? <XCircle size={15} className="text-red-600" /> :
    s === 'running' ? <Loader2 size={15} className="text-blue-600 animate-spin" /> : <Clock size={15} className="text-slate-400" />;

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center gap-3">
        <ServerCog className="text-orange-600" size={26} />
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Migrate a Site over SSH</h1>
          <p className="text-slate-500 text-sm">Pull a Node.js, Python, static, or PHP site from any server you can reach by SSH, and set it up here.</p>
        </div>
      </div>

      <form onSubmit={submit} className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Target user</label>
            <select required value={f.targetUserId} onChange={e => set('targetUserId', e.target.value)} className={input}>
              <option value="">Select…</option>{users.map(u => <option key={u.id} value={u.id}>{u.username}</option>)}
            </select></div>
          <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Domain</label>
            <input required value={f.domainName} onChange={e => set('domainName', e.target.value.toLowerCase())} placeholder="app.example.com" className={input} /></div>
          <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Stack</label>
            <select value={f.stack} onChange={e => set('stack', e.target.value)} className={input}>{STACKS.map(s => <option key={s.v} value={s.v}>{s.label}</option>)}</select></div>
        </div>

        <div className="border-t border-slate-100 pt-4">
          <div className="text-xs font-bold text-slate-500 uppercase mb-2">Source server (SSH)</div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="md:col-span-2"><input required value={f.sourceHost} onChange={e => set('sourceHost', e.target.value)} placeholder="source host or IP" className={input} /></div>
            <input value={f.sourcePort} onChange={e => set('sourcePort', e.target.value.replace(/\D/g, ''))} placeholder="22" className={input} />
            <input required value={f.sshUser} onChange={e => set('sshUser', e.target.value)} placeholder="ssh user (e.g. root)" className={input} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-3">
            <select value={f.authType} onChange={e => set('authType', e.target.value)} className={input}>
              <option value="key">SSH private key</option><option value="password">Password</option>
            </select>
            <input required value={f.remotePath} onChange={e => set('remotePath', e.target.value)} placeholder="/var/www/app  (remote path)" className={`${input} md:col-span-2`} />
          </div>
          {f.authType === 'key'
            ? <textarea value={f.sshKey} onChange={e => set('sshKey', e.target.value)} rows={4} placeholder="-----BEGIN OPENSSH PRIVATE KEY-----" className={`${input} mt-3 font-mono text-xs`} />
            : <input type="password" value={f.sshPassword} onChange={e => set('sshPassword', e.target.value)} placeholder="SSH password" className={`${input} mt-3`} />}
          <button type="button" onClick={testConn} disabled={testing}
            className="mt-3 inline-flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold px-4 py-2 rounded-lg disabled:opacity-50">
            {testing ? <Loader2 size={15} className="animate-spin" /> : <Plug size={15} />} Test connection
          </button>
        </div>

        {isApp && (
          <div className="border-t border-slate-100 pt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Install command</label>
              <input value={f.installCommand} onChange={e => set('installCommand', e.target.value)} placeholder="npm install" className={input} /></div>
            <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Build command (optional)</label>
              <input value={f.buildCommand} onChange={e => set('buildCommand', e.target.value)} placeholder="npm run build" className={input} /></div>
            <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Start command</label>
              <input value={f.startCommand} onChange={e => set('startCommand', e.target.value)} placeholder="npm start" className={input} /></div>
            <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">App port (optional — auto if blank)</label>
              <input value={f.appPort} onChange={e => set('appPort', e.target.value.replace(/\D/g, ''))} placeholder="auto" className={input} /></div>
          </div>
        )}
        {f.stack === 'php' && (
          <div className="border-t border-slate-100 pt-4"><label className="block text-xs font-bold text-slate-500 uppercase mb-1">PHP version</label>
            <select value={f.phpVersion} onChange={e => set('phpVersion', e.target.value)} className={`${input} md:w-40`}>{['8.1', '8.2', '8.3', '8.4'].map(v => <option key={v}>{v}</option>)}</select></div>
        )}

        <button type="submit" disabled={submitting}
          className="w-full bg-orange-600 hover:bg-orange-700 text-white font-bold py-3 rounded-xl disabled:opacity-50">
          {submitting ? 'Starting…' : 'Start migration'}
        </button>
      </form>

      {/* History */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <h2 className="font-bold text-slate-800">Migrations</h2>
          <button onClick={loadMigrations} className="text-slate-400 hover:text-slate-700"><RefreshCw size={16} /></button>
        </div>
        {migrations.length === 0 ? <div className="p-8 text-center text-slate-400 text-sm">No migrations yet.</div> : (
          <table className="w-full text-sm">
            <tbody>
              {migrations.map(m => (
                <tr key={m.id} className="border-t border-slate-100 hover:bg-slate-50/50 cursor-pointer"
                  onClick={async () => { const r = await api.get(`/admin/site-migrations/${m.id}`); setViewing({ id: m.id, log: r.data.log, status: r.data.status }); }}>
                  <td className="px-5 py-3"><StatusIcon s={m.status} /></td>
                  <td className="px-5 py-3 font-medium text-slate-800">{m.domain_name}</td>
                  <td className="px-5 py-3 text-slate-500">{m.stack} · {m.target_user}</td>
                  <td className="px-5 py-3 text-slate-500 text-xs">{m.ssh_user}@{m.source_host}</td>
                  <td className="px-5 py-3 text-slate-400 text-xs">{new Date(m.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {viewing && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50" onClick={() => setViewing(null)}>
          <div className="bg-slate-900 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-3 border-b border-slate-700 flex items-center justify-between">
              <span className="text-slate-200 font-bold text-sm">Migration #{viewing.id} — {viewing.status}</span>
              <button onClick={() => setViewing(null)} className="text-slate-400 hover:text-white">✕</button>
            </div>
            <pre className="p-5 text-xs text-green-300 font-mono whitespace-pre-wrap max-h-[60vh] overflow-y-auto">{viewing.log || 'Starting…'}</pre>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminSiteMigration;
