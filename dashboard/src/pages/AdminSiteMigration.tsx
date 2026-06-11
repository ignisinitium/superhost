import React, { useEffect, useState } from 'react';
import api from '../api/client';
import toast from 'react-hot-toast';
import { ServerCog, Loader2, CheckCircle2, XCircle, Clock, RefreshCw, Plug, ArrowDownToLine, ArrowUpFromLine, Search, UserPlus, Users, Database, RotateCcw, Trash2, X, Server } from 'lucide-react';

interface User { id: number; username: string; }
interface Migration {
  id: number; direction: string; source_host: string; ssh_user: string; remote_path: string; domain_name: string;
  stack: string; detected_type?: string; migrated_db?: boolean; status: string; error_message?: string; created_at: string; target_user?: string;
}
interface Backend { port: number; runtime: string; name?: string; cwd?: string; db?: { engine: string; name: string } | null }
interface ScanSite {
  domain: string; remotePath?: string; frontendRoot?: string; stack: string;
  backends?: Backend[]; proxies?: { location: string; port: number }[]; serverBlock?: string | null;
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
    direction: 'pull', targetUserId: '', domainName: '', stack: 'node',
    sourceHost: '', sourcePort: '22', sshUser: 'root', authType: 'key', sshKey: '', sshPassword: '',
    remotePath: '', installCommand: 'npm install', buildCommand: '', startCommand: 'npm start', appPort: '', phpVersion: '8.3',
  });
  const set = (k: string, v: string) => setF(p => ({ ...p, [k]: v }));

  // Scan + import-account flow
  const [scanning, setScanning] = useState(false);
  const [scan, setScan] = useState<{ id: number; status: string; sites: ScanSite[] } | null>(null);
  const [sel, setSel] = useState<Record<number, boolean>>({});
  const [acct, setAcct] = useState({ mode: 'new', username: '', email: '', password: '' });
  const [importing, setImporting] = useState(false);
  const setA = (k: string, v: string) => setAcct(p => ({ ...p, [k]: v }));

  // Resume / cleanup handling
  const [resumeMig, setResumeMig] = useState<Migration | null>(null);
  const [resumeAuth, setResumeAuth] = useState({ authType: 'password', sshPassword: '', sshKey: '' });
  const [cancelMig, setCancelMig] = useState<Migration | null>(null);
  const [removeUser, setRemoveUser] = useState(false);
  const [busy, setBusy] = useState(false);

  const doResume = async () => {
    if (!resumeMig) return;
    setBusy(true);
    try {
      await api.post(`/admin/site-migrations/${resumeMig.id}/resume`, resumeAuth);
      toast.success('Resuming migration');
      setResumeMig(null); setResumeAuth({ authType: 'password', sshPassword: '', sshKey: '' });
      loadMigrations();
    } catch (e: any) { toast.error(e.response?.data?.message || 'Resume failed'); }
    finally { setBusy(false); }
  };

  const doCancel = async () => {
    if (!cancelMig) return;
    setBusy(true);
    try {
      await api.post(`/admin/site-migrations/${cancelMig.id}/cancel`, { removeUser });
      toast.success('Cleaning up…');
      setCancelMig(null); setRemoveUser(false);
      loadMigrations();
    } catch (e: any) { toast.error(e.response?.data?.message || 'Cancel failed'); }
    finally { setBusy(false); }
  };

  const doDelete = async (m: Migration) => {
    try {
      await api.delete(`/admin/site-migrations/${m.id}`);
      loadMigrations();
    } catch (e: any) { toast.error(e.response?.data?.message || 'Delete failed'); }
  };

  const loadMigrations = () => api.get('/admin/site-migrations').then(r => setMigrations(r.data)).catch(() => {});
  useEffect(() => { api.get('/users').then(r => setUsers(r.data)).catch(() => {}); loadMigrations(); }, []);

  // Auto-refresh the list while anything is mid-flight.
  useEffect(() => {
    if (!migrations.some(m => ['running', 'pending', 'cancelling'].includes(m.status))) return;
    const t = setInterval(loadMigrations, 3000);
    return () => clearInterval(t);
  }, [migrations]);

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

  const scanServer = async () => {
    setScanning(true); setScan(null);
    try {
      const { data } = await api.post('/admin/site-migrations/scan', {
        sourceHost: f.sourceHost, sourcePort: Number(f.sourcePort), sshUser: f.sshUser,
        authType: f.authType, sshPassword: f.sshPassword, sshKey: f.sshKey });
      for (let i = 0; i < 45; i++) {
        await new Promise(r => setTimeout(r, 2000));
        const s = (await api.get(`/admin/site-migrations/scan/${data.scanId}`)).data;
        if (s.status === 'completed') {
          setScan({ id: s.id, status: s.status, sites: s.sites || [] });
          const sl: Record<number, boolean> = {}; (s.sites || []).forEach((_: unknown, i2: number) => { sl[i2] = true; });
          setSel(sl);
          toast.success(`Found ${(s.sites || []).length} site(s)`);
          return;
        }
        if (s.status === 'failed') { toast.error(s.error_message || 'Scan failed'); return; }
      }
      toast.error('Scan timed out');
    } catch (e: any) { toast.error(e.response?.data?.message || 'Scan failed'); }
    finally { setScanning(false); }
  };

  const importSelected = async () => {
    if (!scan) return;
    const chosen = scan.sites.filter((_, i) => sel[i]);
    if (!chosen.length) return toast.error('Select at least one site');
    if (acct.mode === 'new' && !acct.username) return toast.error('Enter a username for the new account');
    if (acct.mode === 'existing' && !f.targetUserId) return toast.error('Pick an existing user');
    setImporting(true);
    try {
      const { data } = await api.post('/admin/site-migrations/scan-import', {
        sourceHost: f.sourceHost, sourcePort: Number(f.sourcePort), sshUser: f.sshUser,
        authType: f.authType, sshPassword: f.sshPassword, sshKey: f.sshKey,
        createUser: acct.mode === 'new', username: acct.username, email: acct.email, password: acct.password,
        targetUserId: f.targetUserId,
        sites: chosen.map(s => ({
          domainName: s.domain, frontendRoot: s.frontendRoot ?? s.remotePath, stack: s.stack,
          serverBlock: s.serverBlock ?? null, backends: s.backends ?? [], proxies: s.proxies ?? [],
        })),
      });
      toast.success(`Migrating ${data.migrated.length} site(s) into ${data.username}`);
      if (data.skipped?.length) toast(`Skipped ${data.skipped.length} (already hosted / invalid)`);
      setScan(null); setAcct({ mode: 'new', username: '', email: '', password: '' });
      loadMigrations();
    } catch (e: any) { toast.error(e.response?.data?.message || 'Import failed'); }
    finally { setImporting(false); }
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

  const isPush = f.direction === 'push';
  const isApp = !isPush && (f.stack === 'node' || f.stack === 'python');
  const input = 'w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/40';
  const pill = (on: boolean) => `flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition ${on ? 'bg-white shadow text-orange-600' : 'text-slate-500 hover:text-slate-700'}`;
  const StatusIcon = ({ s }: { s: string }) => s === 'completed' ? <CheckCircle2 size={15} className="text-green-600" /> :
    s === 'failed' ? <XCircle size={15} className="text-red-600" /> :
    s === 'cancelled' ? <XCircle size={15} className="text-slate-400" /> :
    (s === 'running' || s === 'cancelling') ? <Loader2 size={15} className="text-blue-600 animate-spin" /> : <Clock size={15} className="text-slate-400" />;

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center gap-3">
        <ServerCog className="text-orange-600" size={26} />
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Migrate a Site over SSH</h1>
          <p className="text-slate-500 text-sm">Move a Node.js, Python, static, or PHP site between this server and any server you can reach by SSH — in either direction.</p>
        </div>
      </div>

      <form onSubmit={submit} className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 space-y-5">
        <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
          <button type="button" onClick={() => set('direction', 'pull')} className={pill(!isPush)}>
            <ArrowDownToLine size={15} /> Import here (pull)
          </button>
          <button type="button" onClick={() => set('direction', 'push')} className={pill(isPush)}>
            <ArrowUpFromLine size={15} /> Export to remote (push)
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {!isPush && (
            <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Target user</label>
              <select required value={f.targetUserId} onChange={e => set('targetUserId', e.target.value)} className={input}>
                <option value="">Select…</option>{users.map(u => <option key={u.id} value={u.id}>{u.username}</option>)}
              </select></div>
          )}
          <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">{isPush ? 'Local domain to export' : 'New domain'}</label>
            <input required value={f.domainName} onChange={e => set('domainName', e.target.value.toLowerCase())} placeholder="app.example.com" className={input} /></div>
          {!isPush && (
            <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Stack</label>
              <select value={f.stack} onChange={e => set('stack', e.target.value)} className={input}>{STACKS.map(s => <option key={s.v} value={s.v}>{s.label}</option>)}</select></div>
          )}
        </div>

        <div className="border-t border-slate-100 pt-4">
          <div className="text-xs font-bold text-slate-500 uppercase mb-2">{isPush ? 'Destination server (SSH)' : 'Source server (SSH)'}</div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="md:col-span-2"><input required value={f.sourceHost} onChange={e => set('sourceHost', e.target.value)} placeholder="source host or IP" className={input} /></div>
            <input value={f.sourcePort} onChange={e => set('sourcePort', e.target.value.replace(/\D/g, ''))} placeholder="22" className={input} />
            <input required value={f.sshUser} onChange={e => set('sshUser', e.target.value)} placeholder="ssh user (e.g. root)" className={input} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-3">
            <select value={f.authType} onChange={e => set('authType', e.target.value)} className={input}>
              <option value="key">SSH private key</option><option value="password">Password</option>
            </select>
            <input required value={f.remotePath} onChange={e => set('remotePath', e.target.value)} placeholder={isPush ? '/var/www/app  (copy TO this path)' : '/var/www/app  (copy FROM this path)'} className={`${input} md:col-span-2`} />
          </div>
          {f.authType === 'key'
            ? <textarea value={f.sshKey} onChange={e => set('sshKey', e.target.value)} rows={4} placeholder="-----BEGIN OPENSSH PRIVATE KEY-----" className={`${input} mt-3 font-mono text-xs`} />
            : <input type="password" value={f.sshPassword} onChange={e => set('sshPassword', e.target.value)} placeholder="SSH password" className={`${input} mt-3`} />}
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={testConn} disabled={testing}
              className="inline-flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold px-4 py-2 rounded-lg disabled:opacity-50">
              {testing ? <Loader2 size={15} className="animate-spin" /> : <Plug size={15} />} Test connection
            </button>
            {!isPush && (
              <button type="button" onClick={scanServer} disabled={scanning}
                className="inline-flex items-center gap-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-sm font-bold px-4 py-2 rounded-lg disabled:opacity-50">
                {scanning ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />} Scan server for sites
              </button>
            )}
          </div>
        </div>

        {(isApp || isPush) && (
          <div className="border-t border-slate-100 pt-4">
            {isPush && <div className="text-xs font-bold text-slate-500 uppercase mb-2">Remote commands (run on the destination after upload, optional)</div>}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Install command</label>
                <input value={f.installCommand} onChange={e => set('installCommand', e.target.value)} placeholder="npm install" className={input} /></div>
              <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Build command (optional)</label>
                <input value={f.buildCommand} onChange={e => set('buildCommand', e.target.value)} placeholder="npm run build" className={input} /></div>
              <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">{isPush ? 'Restart / start command' : 'Start command'}</label>
                <input value={f.startCommand} onChange={e => set('startCommand', e.target.value)} placeholder={isPush ? 'pm2 restart app' : 'npm start'} className={input} /></div>
              {!isPush && (
                <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">App port (optional — auto if blank)</label>
                  <input value={f.appPort} onChange={e => set('appPort', e.target.value.replace(/\D/g, ''))} placeholder="auto" className={input} /></div>
              )}
            </div>
          </div>
        )}
        {!isPush && f.stack === 'php' && (
          <div className="border-t border-slate-100 pt-4"><label className="block text-xs font-bold text-slate-500 uppercase mb-1">PHP version</label>
            <select value={f.phpVersion} onChange={e => set('phpVersion', e.target.value)} className={`${input} md:w-40`}>{['8.1', '8.2', '8.3', '8.4'].map(v => <option key={v}>{v}</option>)}</select></div>
        )}

        <button type="submit" disabled={submitting}
          className="w-full bg-orange-600 hover:bg-orange-700 text-white font-bold py-3 rounded-xl disabled:opacity-50">
          {submitting ? 'Starting…' : 'Start migration'}
        </button>
      </form>

      {/* Discovered sites → create account & migrate */}
      {scan && (
        <div className="bg-white border border-emerald-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-100 bg-emerald-50/50 flex items-center justify-between">
            <h2 className="font-bold text-slate-800 flex items-center gap-2"><Search size={17} className="text-emerald-600" /> {scan.sites.length} site(s) found on {f.sourceHost}</h2>
            <button onClick={() => setScan(null)} className="text-slate-400 hover:text-slate-700 text-sm">Dismiss</button>
          </div>

          {scan.sites.length === 0 ? <div className="p-8 text-center text-slate-400 text-sm">No nginx/apache vhosts detected.</div> : (
            <>
              <div className="px-5 py-3 flex items-center gap-3 text-xs border-b border-slate-100">
                <button onClick={() => setSel(Object.fromEntries(scan.sites.map((_, i) => [i, true])))} className="text-emerald-700 font-bold hover:underline">Select all</button>
                <button onClick={() => setSel({})} className="text-slate-500 font-bold hover:underline">Clear</button>
              </div>
              <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto">
                {scan.sites.map((s, i) => {
                  const dbEngines = [...new Set((s.backends || []).map(b => b.db?.engine).filter(Boolean))];
                  return (
                  <label key={i} className="flex items-center gap-3 px-5 py-2.5 hover:bg-slate-50 cursor-pointer">
                    <input type="checkbox" checked={!!sel[i]} onChange={e => setSel(p => ({ ...p, [i]: e.target.checked }))} className="accent-emerald-600" />
                    <span className="font-medium text-slate-800 w-52 truncate">{s.domain}</span>
                    <span className="text-slate-400 text-xs flex-1 truncate font-mono">{s.frontendRoot ?? s.remotePath ?? '(proxy only)'}</span>
                    {(s.backends?.length ?? 0) > 0 ? (
                      <span className="flex items-center gap-1.5 text-xs">
                        <span className="bg-violet-50 text-violet-700 px-1.5 py-0.5 rounded font-bold flex items-center gap-1"><Server size={11} />{s.backends!.length} service{s.backends!.length > 1 ? 's' : ''}</span>
                        {dbEngines.map(e => <span key={e} className="bg-sky-50 text-sky-700 px-1.5 py-0.5 rounded font-bold flex items-center gap-1"><Database size={11} />{e}</span>)}
                      </span>
                    ) : (
                      <select value={s.stack}
                        onChange={e => setScan(sc => sc ? { ...sc, sites: sc.sites.map((x, j) => j === i ? { ...x, stack: e.target.value } : x) } : sc)}
                        onClick={e => e.preventDefault()}
                        className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2 py-1">
                        {STACKS.map(st => <option key={st.v} value={st.v}>{st.label}</option>)}
                      </select>
                    )}
                  </label>
                  );
                })}
              </div>

              {/* Account target */}
              <div className="p-5 border-t border-slate-100 bg-slate-50/40 space-y-4">
                <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
                  <button type="button" onClick={() => setA('mode', 'new')} className={pill(acct.mode === 'new')}><UserPlus size={15} /> Create new user</button>
                  <button type="button" onClick={() => setA('mode', 'existing')} className={pill(acct.mode === 'existing')}><Users size={15} /> Existing user</button>
                </div>
                {acct.mode === 'new' ? (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <input value={acct.username} onChange={e => setA('username', e.target.value.toLowerCase())} placeholder="new username" className={input} />
                    <input value={acct.email} onChange={e => setA('email', e.target.value)} placeholder="email (optional)" className={input} />
                    <input type="password" value={acct.password} onChange={e => setA('password', e.target.value)} placeholder="password (optional)" className={input} />
                  </div>
                ) : (
                  <select value={f.targetUserId} onChange={e => set('targetUserId', e.target.value)} className={`${input} md:w-72`}>
                    <option value="">Select user…</option>{users.map(u => <option key={u.id} value={u.id}>{u.username}</option>)}
                  </select>
                )}
                <button onClick={importSelected} disabled={importing}
                  className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-5 py-2.5 rounded-xl disabled:opacity-50">
                  {importing ? <Loader2 size={15} className="animate-spin" /> : <ArrowDownToLine size={15} />}
                  Migrate {Object.values(sel).filter(Boolean).length} selected site(s)
                </button>
              </div>
            </>
          )}
        </div>
      )}

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
                  <td className="px-5 py-3 font-medium text-slate-800 flex items-center gap-2">
                    {m.direction === 'push' ? <ArrowUpFromLine size={13} className="text-violet-500" /> : <ArrowDownToLine size={13} className="text-emerald-500" />}
                    {m.domain_name}
                  </td>
                  <td className="px-5 py-3 text-slate-500">
                    <span className="capitalize">{m.detected_type || m.stack}</span> · {m.target_user}
                    {m.migrated_db && <span className="ml-2 inline-flex items-center gap-1 text-xs bg-sky-50 text-sky-700 px-1.5 py-0.5 rounded font-bold"><Database size={11} /> DB</span>}
                  </td>
                  <td className="px-5 py-3 text-slate-500 text-xs">{m.direction === 'push' ? '→ ' : '← '}{m.ssh_user}@{m.source_host}</td>
                  <td className="px-5 py-3 text-slate-400 text-xs">{new Date(m.created_at).toLocaleString()}</td>
                  <td className="px-5 py-3 text-right whitespace-nowrap" onClick={e => e.stopPropagation()}>
                    {m.status === 'failed' && (
                      <button onClick={() => setResumeMig(m)} title="Resume" className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 hover:bg-emerald-50 px-2 py-1 rounded">
                        <RotateCcw size={13} /> Resume
                      </button>
                    )}
                    {['failed', 'running', 'pending', 'completed'].includes(m.status) && (
                      <button onClick={() => { setCancelMig(m); setRemoveUser(false); }} title="Cancel & clean up" className="inline-flex items-center gap-1 text-xs font-bold text-amber-700 hover:bg-amber-50 px-2 py-1 rounded">
                        <Trash2 size={13} /> Clean up
                      </button>
                    )}
                    {['failed', 'completed', 'cancelled'].includes(m.status) && (
                      <button onClick={() => doDelete(m)} title="Remove from list" className="inline-flex items-center text-xs text-slate-400 hover:text-slate-700 px-2 py-1 rounded">
                        <X size={14} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Resume modal — re-supply SSH credentials */}
      {resumeMig && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50" onClick={() => setResumeMig(null)}>
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-slate-800 flex items-center gap-2"><RotateCcw size={17} className="text-emerald-600" /> Resume migration of {resumeMig.domain_name}</h3>
            <p className="text-sm text-slate-500">Re-enter the SSH credentials for {resumeMig.ssh_user}@{resumeMig.source_host} (we don't store them).</p>
            <select value={resumeAuth.authType} onChange={e => setResumeAuth(p => ({ ...p, authType: e.target.value }))} className={input}>
              <option value="password">SSH password</option><option value="key">SSH private key</option>
            </select>
            {resumeAuth.authType === 'key'
              ? <textarea value={resumeAuth.sshKey} onChange={e => setResumeAuth(p => ({ ...p, sshKey: e.target.value }))} rows={4} placeholder="-----BEGIN OPENSSH PRIVATE KEY-----" className={`${input} font-mono text-xs`} />
              : <input type="password" value={resumeAuth.sshPassword} onChange={e => setResumeAuth(p => ({ ...p, sshPassword: e.target.value }))} placeholder="SSH password" className={input} />}
            <div className="flex gap-2 justify-end">
              <button onClick={() => setResumeMig(null)} className="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
              <button onClick={doResume} disabled={busy} className="px-4 py-2 text-sm font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg disabled:opacity-50">{busy ? 'Resuming…' : 'Resume'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Cleanup / cancel confirm */}
      {cancelMig && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50" onClick={() => setCancelMig(null)}>
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-slate-800 flex items-center gap-2"><Trash2 size={17} className="text-amber-600" /> Clean up {cancelMig.domain_name}</h3>
            <p className="text-sm text-slate-500">Removes the nginx vhost, any app/PM2 process, the migrated database, the synced files, and the domain record. This cannot be undone.</p>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={removeUser} onChange={e => setRemoveUser(e.target.checked)} className="accent-amber-600" />
              Also delete the user account <span className="font-mono text-xs">{cancelMig.target_user}</span> if it has no other sites
            </label>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setCancelMig(null)} className="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-lg">Keep it</button>
              <button onClick={doCancel} disabled={busy} className="px-4 py-2 text-sm font-bold bg-amber-600 hover:bg-amber-700 text-white rounded-lg disabled:opacity-50">{busy ? 'Cleaning…' : 'Clean up'}</button>
            </div>
          </div>
        </div>
      )}

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
