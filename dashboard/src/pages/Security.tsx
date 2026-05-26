import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import {
  ShieldAlert, ShieldCheck, Play, AlertCircle, RefreshCw,
  FileWarning, Lock, Unlock, Shield, Settings2, Save, Clock,
  Zap, Timer,
} from 'lucide-react';
import toast from 'react-hot-toast';

interface User       { id: number; username: string }
interface ScanRecord { id: number; username: string; scan_path: string; status: string; infections_found: number; created_at: string; completed_at: string | null }
interface BlockedIp  { id: number; ip_address: string; reason: string; expires_at: string | null; created_at: string }
interface BfSettings { brute_force_fail_threshold: number; brute_force_window_minutes: number; brute_force_ban_minutes: number }

// Preset ban durations — 0 = permanent
const BAN_PRESETS: { label: string; minutes: number }[] = [
  { label: '1 hour',   minutes: 60 },
  { label: '6 hours',  minutes: 360 },
  { label: '12 hours', minutes: 720 },
  { label: '24 hours', minutes: 1440 },
  { label: '3 days',   minutes: 4320 },
  { label: '7 days',   minutes: 10080 },
  { label: '30 days',  minutes: 43200 },
  { label: 'Permanent', minutes: 0 },
];

function banLabel(minutes: number): string {
  if (minutes === 0) return 'Permanent';
  if (minutes < 60)  return `${minutes}m`;
  if (minutes < 1440) return `${minutes / 60}h`;
  if (minutes < 10080) return `${minutes / 1440}d`;
  return `${Math.round(minutes / 10080)}w`;
}

// ── Main Page ─────────────────────────────────────────────────────────────────
const SecurityPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [selectedUser, setSelectedUser] = useState('');
  const [activeTab, setActiveTab] = useState<'malware' | 'blocklist'>('malware');

  const { data: users } = useQuery<User[]>({
    queryKey: ['users'],
    queryFn: async () => (await api.get('/users')).data,
  });

  const { data: scans, isLoading: isScansLoading } = useQuery<ScanRecord[]>({
    queryKey: ['malwareScans'],
    queryFn: async () => (await api.get('/security/scans')).data,
    refetchInterval: activeTab === 'malware' ? 5000 : false,
  });

  const { data: blockedIps, isLoading: isBlocklistLoading } = useQuery<BlockedIp[]>({
    queryKey: ['blockedIps'],
    queryFn: async () => (await api.get('/security/blocked-ips')).data,
    enabled: activeTab === 'blocklist',
  });

  const runScanMutation = useMutation({
    mutationFn: async () => (await api.post('/security/scan', { userId: parseInt(selectedUser) })).data,
    onSuccess: () => {
      toast.success('Malware scan started');
      setSelectedUser('');
      queryClient.invalidateQueries({ queryKey: ['malwareScans'] });
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to start scan'),
  });

  const unblockIpMutation = useMutation({
    mutationFn: async (ipAddress: string) => (await api.post('/security/unblock-ip', { ipAddress })).data,
    onSuccess: () => {
      toast.success('IP address unblocked');
      queryClient.invalidateQueries({ queryKey: ['blockedIps'] });
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to unblock IP'),
  });

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Advanced Security</h1>
          <p className="text-slate-500 mt-1">Manage ClamAV scans and automated IP brute-force protection.</p>
        </div>
        {activeTab === 'malware' && (
          <div className="flex items-center gap-3">
            <select
              className="bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-orange-500/20"
              value={selectedUser}
              onChange={e => setSelectedUser(e.target.value)}
            >
              <option value="" disabled>Select User to Scan…</option>
              {users?.map(u => <option key={u.id} value={u.id}>{u.username}</option>)}
            </select>
            <button
              onClick={() => runScanMutation.mutate()}
              disabled={!selectedUser || runScanMutation.isPending}
              className="bg-red-600 hover:bg-red-700 text-white px-5 py-2.5 rounded-xl font-bold transition-all shadow-md shadow-red-900/10 flex items-center gap-2 text-sm disabled:opacity-50"
            >
              <Play size={18} className={runScanMutation.isPending ? 'animate-pulse' : ''} />
              Start Scan
            </button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex space-x-1 bg-slate-200/50 p-1 rounded-xl w-fit">
        {(['malware', 'blocklist'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-6 py-2.5 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${
              activeTab === tab ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {tab === 'malware'
              ? <><ShieldAlert size={16} className="text-red-500" /> Malware Scanner</>
              : <><Shield size={16} className="text-orange-500" /> IP Blocklist</>
            }
          </button>
        ))}
      </div>

      {/* ── Malware tab ─────────────────────────────────────────────────────── */}
      {activeTab === 'malware' && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <StatCard icon={<ShieldCheck size={24} />} color="emerald" label="Active Engine" value="ClamAV Daemon" />
            <StatCard icon={<RefreshCw size={24} />}   color="blue"    label="Total Scans"   value={String(scans?.length ?? 0)} />
            <StatCard
              icon={<FileWarning size={24} />} color="red"
              label="Infections Found"
              value={String(scans?.reduce((s, r) => s + (r.infections_found ?? 0), 0) ?? 0)}
            />
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex items-center gap-3">
              <ShieldAlert className="text-slate-700" size={20} />
              <h2 className="text-lg font-bold text-slate-800">Scan History</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                  <tr>
                    {['Target User','Path Scanned','Status','Infections','Date'].map(h => (
                      <th key={h} className="px-6 py-4 uppercase tracking-wider text-[10px] font-bold">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {isScansLoading ? (
                    <tr><td colSpan={5} className="px-6 py-8 text-center text-slate-400">Loading scan history…</td></tr>
                  ) : scans && scans.length > 0 ? scans.map(scan => (
                    <tr key={scan.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4 font-bold text-slate-800 text-xs">{scan.username}</td>
                      <td className="px-6 py-4 font-mono text-slate-500 text-xs">{scan.scan_path}</td>
                      <td className="px-6 py-4">
                        {scan.status === 'completed'
                          ? <Badge color="emerald" icon={<ShieldCheck size={12} />}>Done</Badge>
                          : scan.status === 'failed'
                          ? <Badge color="red" icon={<AlertCircle size={12} />}>Failed</Badge>
                          : <Badge color="amber" icon={<RefreshCw size={12} className="animate-spin" />}>Scanning</Badge>
                        }
                      </td>
                      <td className="px-6 py-4">
                        {scan.infections_found > 0
                          ? <span className="font-bold text-red-600 flex items-center gap-1"><FileWarning size={14} />{scan.infections_found} found</span>
                          : <span className="text-slate-400">0</span>
                        }
                      </td>
                      <td className="px-6 py-4 text-slate-500 text-xs">{new Date(scan.created_at).toLocaleString()}</td>
                    </tr>
                  )) : (
                    <tr><td colSpan={5} className="px-6 py-12 text-center text-slate-400 italic">No scans have been run yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ── IP Blocklist tab ─────────────────────────────────────────────────── */}
      {activeTab === 'blocklist' && (
        <div className="space-y-6">
          {/* Settings card */}
          <BruteForceSettingsCard />

          {/* Blocked IPs table */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Shield className="text-orange-600" size={20} />
                <h2 className="text-lg font-bold text-slate-800">Auto-Blocked Addresses</h2>
              </div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest bg-slate-100 px-2 py-1 rounded">
                {blockedIps?.length ?? 0} blocked
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                  <tr>
                    {['IP Address','Reason','Blocked At','Expires',''].map((h, i) => (
                      <th key={i} className={`px-6 py-4 uppercase tracking-wider text-[10px] font-bold ${i === 4 ? 'text-right' : ''}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {isBlocklistLoading ? (
                    <tr><td colSpan={5} className="px-6 py-8 text-center text-slate-400">Loading blocklist…</td></tr>
                  ) : blockedIps && blockedIps.length > 0 ? blockedIps.map(block => (
                    <tr key={block.id} className="hover:bg-slate-50/50 transition-colors group">
                      <td className="px-6 py-4 font-bold text-slate-800 font-mono text-xs">{block.ip_address}</td>
                      <td className="px-6 py-4 text-slate-500 text-xs italic">{block.reason}</td>
                      <td className="px-6 py-4 text-slate-500 text-xs">{new Date(block.created_at).toLocaleString()}</td>
                      <td className="px-6 py-4">
                        <Badge color={block.expires_at ? 'amber' : 'red'} icon={<Lock size={12} />}>
                          {block.expires_at ? new Date(block.expires_at).toLocaleDateString() : 'Permanent'}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => {
                            if (window.confirm(`Unblock IP ${block.ip_address}?`))
                              unblockIpMutation.mutate(block.ip_address);
                          }}
                          className="text-emerald-500 hover:text-emerald-700 p-2 rounded-lg hover:bg-emerald-50 transition-colors"
                          title="Unblock IP"
                        >
                          <Unlock size={18} />
                        </button>
                      </td>
                    </tr>
                  )) : (
                    <tr><td colSpan={5} className="px-6 py-12 text-center text-slate-400 italic">No IP addresses are currently blocked.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Brute Force Settings Card ─────────────────────────────────────────────────
const BruteForceSettingsCard: React.FC = () => {
  const [threshold, setThreshold] = useState(5);
  const [window,    setWindow]    = useState(15);
  const [banMins,   setBanMins]   = useState(1440);
  const [custom,    setCustom]    = useState('');    // raw input for custom duration

  const { data: settings, isLoading } = useQuery<BfSettings>({
    queryKey: ['bfSettings'],
    queryFn: async () => (await api.get('/security/brute-force-settings')).data,
  });

  useEffect(() => {
    if (!settings) return;
    setThreshold(settings.brute_force_fail_threshold);
    setWindow(settings.brute_force_window_minutes);
    setBanMins(settings.brute_force_ban_minutes);
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: async () =>
      (await api.put('/security/brute-force-settings', {
        brute_force_fail_threshold: threshold,
        brute_force_window_minutes: window,
        brute_force_ban_minutes:    banMins,
      })).data,
    onSuccess: () => toast.success('Brute force settings saved'),
    onError: (err: any) => toast.error(err.response?.data?.message || 'Save failed'),
  });

  const isPreset = BAN_PRESETS.some(p => p.minutes === banMins);

  const applyCustom = () => {
    const v = parseInt(custom, 10);
    if (!isNaN(v) && v >= 0) { setBanMins(v); setCustom(''); }
  };

  if (isLoading) return null;

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
      <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex items-center gap-3">
        <Settings2 className="text-orange-600" size={20} />
        <h2 className="text-lg font-bold text-slate-800">Brute Force Protection Settings</h2>
      </div>

      <div className="p-6 space-y-6">

        {/* Threshold + Window */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div className="space-y-2">
            <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
              <Zap size={11} className="text-orange-500" /> Failed Attempts Before Ban
            </label>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min={1}
                max={100}
                value={threshold}
                onChange={e => setThreshold(parseInt(e.target.value) || 1)}
                className="w-24 border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-mono font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-400/30 focus:border-orange-400 bg-white text-center"
              />
              <span className="text-sm text-slate-500">consecutive failures</span>
            </div>
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
              <Clock size={11} className="text-blue-500" /> Detection Window
            </label>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min={1}
                max={1440}
                value={window}
                onChange={e => setWindow(parseInt(e.target.value) || 1)}
                className="w-24 border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-mono font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-400/30 focus:border-orange-400 bg-white text-center"
              />
              <span className="text-sm text-slate-500">minutes look-back</span>
            </div>
          </div>
        </div>

        {/* Ban duration */}
        <div className="space-y-3">
          <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
            <Timer size={11} className="text-red-500" /> Ban Duration
            <span className="ml-auto font-mono text-orange-600 normal-case tracking-normal text-xs">
              {banMins === 0 ? 'Permanent' : `${banLabel(banMins)} (${banMins} min)`}
            </span>
          </label>

          {/* Preset chips */}
          <div className="flex flex-wrap gap-2">
            {BAN_PRESETS.map(p => (
              <button
                key={p.minutes}
                onClick={() => setBanMins(p.minutes)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                  banMins === p.minutes
                    ? p.minutes === 0
                      ? 'bg-red-500 border-red-500 text-white'
                      : 'bg-orange-500 border-orange-500 text-white'
                    : 'bg-white border-slate-200 text-slate-600 hover:border-orange-300 hover:text-orange-600'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Custom input */}
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              value={custom}
              onChange={e => setCustom(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && applyCustom()}
              placeholder="Custom minutes…"
              className="w-44 border border-slate-200 rounded-xl px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-orange-400/30 focus:border-orange-400 bg-white"
            />
            <button
              type="button"
              onClick={applyCustom}
              disabled={!custom}
              className="px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:border-orange-300 hover:text-orange-600 disabled:opacity-40 transition-all"
            >
              Apply
            </button>
            {!isPreset && banMins > 0 && (
              <span className="text-xs text-slate-400">Custom: {banMins} minutes</span>
            )}
          </div>
        </div>

        {/* Summary + Save */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-4 border-t border-slate-100">
          <p className="text-xs text-slate-500">
            Block an IP for{' '}
            <span className="font-bold text-slate-700">{banMins === 0 ? 'permanently' : banLabel(banMins)}</span>{' '}
            after{' '}
            <span className="font-bold text-slate-700">{threshold}</span> failed attempts
            {' '}within{' '}
            <span className="font-bold text-slate-700">{window} minutes</span>.
          </p>
          <button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="flex items-center gap-2 bg-slate-800 hover:bg-slate-900 text-white px-6 py-2.5 rounded-xl font-bold text-sm transition-all shadow-md shadow-slate-900/10 disabled:opacity-50 flex-shrink-0"
          >
            <Save size={15} className="text-orange-400" />
            {saveMutation.isPending ? 'Saving…' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Shared helpers ────────────────────────────────────────────────────────────
const StatCard: React.FC<{ icon: React.ReactNode; color: string; label: string; value: string }> = ({
  icon, color, label, value,
}) => (
  <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex items-center gap-4">
    <div className={`p-4 bg-${color}-50 rounded-full text-${color}-600`}>{icon}</div>
    <div>
      <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">{label}</p>
      <p className="text-lg font-bold text-slate-800">{value}</p>
    </div>
  </div>
);

const Badge: React.FC<{ color: string; icon?: React.ReactNode; children: React.ReactNode }> = ({
  color, icon, children,
}) => (
  <span className={`inline-flex items-center gap-1 py-1 px-2 rounded-full text-[10px] font-bold bg-${color}-50 text-${color}-700 border border-${color}-200`}>
    {icon}{children}
  </span>
);

export default SecurityPage;
