import React, { useState, useCallback, useEffect } from 'react';
import api from '../api/client';
import {
  Server, RefreshCw, CheckCircle, XCircle, Loader2,
  Save, Play, Square, RotateCcw, Globe, Shield,
  AlertTriangle, Copy, Check,
} from 'lucide-react';
import toast from 'react-hot-toast';

// ── Types ──────────────────────────────────────────────────────────────────────
interface Settings {
  ns1: string;
  ns2: string;
  master_domain: string;
  server_ip: string;
}

interface BindStatus {
  isActive: boolean;
  isEnabled: boolean;
  version: string;
  zones: string[];
}

interface Zone {
  id: number;
  domain_name: string;
  ttl: number;
  record_count: number;
  username: string | null;
  created_at: string;
}

// ── Poll task until complete ───────────────────────────────────────────────────
async function pollTask(taskId: number, maxMs = 15_000): Promise<any> {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const res = await api.get(`/tasks/${taskId}`);
    const t = res.data;
    if (t.status === 'completed' || t.status === 'failed') return t;
    await new Promise(r => setTimeout(r, 1000));
  }
  throw new Error('Timed out');
}

// ── Copy button ────────────────────────────────────────────────────────────────
const CopyBtn: React.FC<{ text: string }> = ({ text }) => {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <button onClick={copy} className="text-slate-400 hover:text-slate-600 transition-colors ml-1.5">
      {copied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
    </button>
  );
};

// ── Main page ─────────────────────────────────────────────────────────────────
const AdminNameserversPage: React.FC = () => {
  const [settings, setSettings] = useState<Settings>({ ns1: '', ns2: '', master_domain: '', server_ip: '' });
  const [draft, setDraft] = useState<Settings>({ ns1: '', ns2: '', master_domain: '', server_ip: '' });
  const [bindStatus, setBindStatus] = useState<BindStatus | null>(null);
  const [zones, setZones] = useState<Zone[]>([]);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [bindAction, setBindAction] = useState<string | null>(null);

  // ── Load settings & BIND status ──────────────────────────────────────────────
  const loadStatus = useCallback(async () => {
    setLoadingStatus(true);
    try {
      const [settingsRes, zonesRes] = await Promise.all([
        api.get('/admin/nameservers/settings'),
        api.get('/admin/nameservers/zones'),
      ]);

      const s: Settings = {
        ns1:           settingsRes.data.settings.ns1           ?? '',
        ns2:           settingsRes.data.settings.ns2           ?? '',
        master_domain: settingsRes.data.settings.master_domain ?? '',
        server_ip:     settingsRes.data.settings.server_ip     ?? '',
      };
      setSettings(s);
      setDraft(s);
      setZones(zonesRes.data);

      // Poll the BIND status task
      const task = await pollTask(settingsRes.data.taskId);
      if (task.status === 'completed') {
        setBindStatus(task.payload as BindStatus);
      }
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to load nameserver settings');
    } finally {
      setLoadingStatus(false);
    }
  }, []);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  // ── Save settings ────────────────────────────────────────────────────────────
  const saveSettings = async () => {
    setSavingSettings(true);
    try {
      await api.put('/admin/nameservers/settings', draft);
      setSettings(draft);
      toast.success('Nameserver settings saved');
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? err.message ?? 'Save failed');
    } finally {
      setSavingSettings(false);
    }
  };

  const isDirty = JSON.stringify(draft) !== JSON.stringify(settings);

  // ── BIND9 action ─────────────────────────────────────────────────────────────
  const runBindAction = async (action: string) => {
    setBindAction(action);
    const toastId = toast.loading(`${action.charAt(0).toUpperCase() + action.slice(1)}ing BIND9…`);
    try {
      const res = await api.post(`/admin/nameservers/bind/${action}`);
      const task = await pollTask(res.data.taskId, 20_000);
      if (task.status === 'completed') {
        toast.success(`BIND9 ${action}ed`, { id: toastId });
        await loadStatus();
      } else {
        toast.error(`Action failed: ${task.error_message ?? 'unknown'}`, { id: toastId });
      }
    } catch (err: any) {
      toast.error(err.message ?? 'Action failed', { id: toastId });
    } finally {
      setBindAction(null);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  const isActive = bindStatus?.isActive ?? false;

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in duration-500">

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Nameserver Configuration</h1>
          <p className="text-slate-500 mt-1">Manage ns3/ns4 nameservers and BIND9 for hosted domains.</p>
        </div>
        <button
          onClick={loadStatus}
          disabled={loadingStatus}
          className="bg-white border border-slate-200 text-slate-700 px-5 py-2.5 rounded-xl font-bold transition-all shadow-sm hover:bg-slate-50 flex items-center gap-2 text-sm disabled:opacity-50"
        >
          <RefreshCw size={16} className={loadingStatus ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── Left column ─────────────────────────────────────────────────────── */}
        <div className="lg:col-span-1 space-y-5">

          {/* BIND9 Status */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className={`p-1.5 rounded-lg ${isActive ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                  <Shield size={16} />
                </div>
                <span className="font-bold text-slate-800 text-sm">BIND9 Status</span>
              </div>
              {loadingStatus
                ? <Loader2 size={14} className="animate-spin text-slate-400" />
                : isActive
                  ? <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">Running</span>
                  : <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-red-50 text-red-700">Stopped</span>
              }
            </div>
            <div className="px-5 py-4 space-y-3">
              {bindStatus ? (
                <>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-400">Version</span>
                    <span className="font-mono text-slate-600 text-[11px]">{bindStatus.version || 'unknown'}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-400">Auto-start</span>
                    <span className={`font-bold ${bindStatus.isEnabled ? 'text-emerald-600' : 'text-slate-400'}`}>
                      {bindStatus.isEnabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-400">Loaded zones</span>
                    <span className="font-bold text-slate-700">{bindStatus.zones.length}</span>
                  </div>
                </>
              ) : (
                <p className="text-xs text-slate-400 text-center py-2">
                  {loadingStatus ? 'Loading…' : 'No data'}
                </p>
              )}

              {/* Control buttons */}
              <div className="pt-2 grid grid-cols-3 gap-2">
                {isActive ? (
                  <>
                    <button
                      disabled={!!bindAction}
                      onClick={() => runBindAction('stop')}
                      className="flex items-center justify-center gap-1 bg-slate-100 hover:bg-red-50 hover:text-red-600 text-slate-600 py-2 rounded-xl text-[11px] font-bold transition-all disabled:opacity-40"
                    >
                      {bindAction === 'stop' ? <Loader2 size={11} className="animate-spin" /> : <Square size={11} />}
                      Stop
                    </button>
                    <button
                      disabled={!!bindAction}
                      onClick={() => runBindAction('restart')}
                      className="flex items-center justify-center gap-1 bg-slate-100 hover:bg-orange-50 hover:text-orange-600 text-slate-600 py-2 rounded-xl text-[11px] font-bold transition-all disabled:opacity-40"
                    >
                      {bindAction === 'restart' ? <Loader2 size={11} className="animate-spin" /> : <RotateCcw size={11} />}
                      Restart
                    </button>
                    <button
                      disabled={!!bindAction}
                      onClick={() => runBindAction('reload')}
                      className="flex items-center justify-center gap-1 bg-slate-100 hover:bg-blue-50 hover:text-blue-600 text-slate-600 py-2 rounded-xl text-[11px] font-bold transition-all disabled:opacity-40"
                    >
                      {bindAction === 'reload' ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
                      Reload
                    </button>
                  </>
                ) : (
                  <button
                    disabled={!!bindAction}
                    onClick={() => runBindAction('start')}
                    className="col-span-3 flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white py-2 rounded-xl text-xs font-bold transition-all shadow-sm disabled:opacity-40"
                  >
                    {bindAction === 'start' ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
                    Start BIND9
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* BIND9 Zones list */}
          {bindStatus && bindStatus.zones.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
              <div className="px-5 py-4 border-b border-slate-100">
                <span className="font-bold text-slate-800 text-sm">Active BIND Zones</span>
                <span className="ml-2 text-[10px] font-bold bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full">{bindStatus.zones.length}</span>
              </div>
              <ul className="divide-y divide-slate-50 max-h-64 overflow-y-auto">
                {bindStatus.zones.map(z => (
                  <li key={z} className="px-5 py-2.5 flex items-center gap-2">
                    <Globe size={12} className="text-slate-400 flex-shrink-0" />
                    <span className="font-mono text-xs text-slate-700 truncate">{z}</span>
                    <CopyBtn text={z} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* ── Right column ─────────────────────────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-5">

          {/* Nameserver settings form */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 rounded-lg bg-orange-50 text-orange-600">
                  <Server size={16} />
                </div>
                <span className="font-bold text-slate-800 text-sm">Nameserver Settings</span>
              </div>
              {isDirty && (
                <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-amber-50 text-amber-600">
                  Unsaved
                </span>
              )}
            </div>
            <div className="px-5 py-5 space-y-4">

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Primary Nameserver (NS1)" hint="e.g. ns3.qc.fyi">
                  <input
                    value={draft.ns1}
                    onChange={e => setDraft(d => ({ ...d, ns1: e.target.value }))}
                    placeholder="ns3.qc.fyi"
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-orange-400/30 focus:border-orange-400"
                  />
                </Field>
                <Field label="Secondary Nameserver (NS2)" hint="e.g. ns4.qc.fyi">
                  <input
                    value={draft.ns2}
                    onChange={e => setDraft(d => ({ ...d, ns2: e.target.value }))}
                    placeholder="ns4.qc.fyi"
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-orange-400/30 focus:border-orange-400"
                  />
                </Field>
                <Field label="Master Domain" hint="SOA contact domain">
                  <input
                    value={draft.master_domain}
                    onChange={e => setDraft(d => ({ ...d, master_domain: e.target.value }))}
                    placeholder="web02.qc.fyi"
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-orange-400/30 focus:border-orange-400"
                  />
                </Field>
                <Field label="Server IP" hint="Public IP for glue records">
                  <input
                    value={draft.server_ip}
                    onChange={e => setDraft(d => ({ ...d, server_ip: e.target.value }))}
                    placeholder="15.235.73.176"
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-orange-400/30 focus:border-orange-400"
                  />
                </Field>
              </div>

              {/* Info banner */}
              <div className="flex gap-2.5 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-xs text-blue-700">
                <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
                <span>
                  Changes apply to <strong>newly synced zones only</strong>. To update all existing zones, use the DNS Zones page to re-sync them, or restart BIND9 to reload.
                </span>
              </div>

              <div className="flex justify-end">
                <button
                  onClick={saveSettings}
                  disabled={savingSettings || !isDirty}
                  className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white px-5 py-2.5 rounded-xl text-sm font-bold transition-all shadow-sm shadow-orange-900/10"
                >
                  {savingSettings ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                  Save Settings
                </button>
              </div>
            </div>
          </div>

          {/* Zone table */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-800 text-sm">DNS Zones in Database</span>
                <span className="text-[10px] font-bold bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full">{zones.length}</span>
              </div>
              <span className="text-xs text-slate-400">Manage records in DNS Zones</span>
            </div>
            {zones.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-sm">No zones yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[10px] font-bold uppercase tracking-widest text-slate-400 border-b border-slate-100">
                      <th className="text-left px-5 py-3">Domain</th>
                      <th className="text-left px-5 py-3">Owner</th>
                      <th className="text-center px-5 py-3">Records</th>
                      <th className="text-center px-5 py-3">TTL</th>
                      <th className="text-center px-5 py-3">BIND</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {zones.map(z => {
                      const inBind = bindStatus?.zones.includes(z.domain_name) ?? false;
                      return (
                        <tr key={z.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono text-slate-800 text-xs font-semibold">{z.domain_name}</span>
                              <CopyBtn text={z.domain_name} />
                            </div>
                          </td>
                          <td className="px-5 py-3 text-slate-500 text-xs">{z.username ?? <em className="text-slate-300">system</em>}</td>
                          <td className="px-5 py-3 text-center">
                            <span className="bg-slate-100 text-slate-600 text-[11px] font-bold px-2 py-0.5 rounded-full">{z.record_count}</span>
                          </td>
                          <td className="px-5 py-3 text-center text-slate-400 text-xs font-mono">{z.ttl}s</td>
                          <td className="px-5 py-3 text-center">
                            {inBind
                              ? <CheckCircle size={14} className="text-emerald-500 mx-auto" />
                              : <XCircle   size={14} className="text-slate-300 mx-auto" />
                            }
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
};

// ── Field wrapper ──────────────────────────────────────────────────────────────
const Field: React.FC<{ label: string; hint?: string; children: React.ReactNode }> = ({ label, hint, children }) => (
  <div className="space-y-1.5">
    <label className="block text-xs font-bold text-slate-600">{label}</label>
    {children}
    {hint && <p className="text-[11px] text-slate-400">{hint}</p>}
  </div>
);

export default AdminNameserversPage;
