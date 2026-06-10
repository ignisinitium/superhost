import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import {
  ShieldCheck, Plus, RefreshCw, Activity, Trash2, Hash,
  Ban, Unlock, ShieldAlert, Network
} from 'lucide-react';
import toast from 'react-hot-toast';

interface FirewallRule {
  number: number;
  to: string;
  action: string;
  from: string;
}

interface BlockedIp {
  id: number;
  ip_address: string;
  reason: string;
  expires_at: string | null;
  created_at: string;
}

const IP_RE = /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$|^[0-9a-f:]+$/i;

function isIpDenyRule(rule: FirewallRule): boolean {
  // IP block rules: DENY action where from OR to is a specific IP (not "Anywhere")
  return (
    rule.action.toUpperCase() === 'DENY' &&
    (IP_RE.test(rule.from.replace(/\s*\(.*\)/, '').trim()) ||
      IP_RE.test(rule.to.replace(/\s*\(.*\)/, '').trim()))
  );
}

const FirewallPage: React.FC = () => {
  const queryClient = useQueryClient();

  // Port rule modal
  const [isPortModalOpen, setIsPortModalOpen] = useState(false);
  const [port, setPort] = useState('');
  const [protocol, setProtocol] = useState('tcp');

  // Block IP modal
  const [isBlockModalOpen, setIsBlockModalOpen] = useState(false);
  const [blockIp, setBlockIp] = useState('');
  const [blockReason, setBlockReason] = useState('');

  const [rawOutput, setRawOutput] = useState('');
  const [blockedPage, setBlockedPage] = useState(0);
  const BLOCKED_PAGE_SIZE = 15;

  // ── UFW status (task-based) ───────────────────────────────────────────────
  const { data: statusData, isLoading: isStatusLoading, refetch } = useQuery({
    queryKey: ['firewallStatus'],
    queryFn: async () => {
      const res = await api.get('/firewall/status');
      return res.data;
    },
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (!statusData?.taskId) return;
    const interval = setInterval(async () => {
      try {
        const taskRes = await api.get(`/tasks/${statusData.taskId}`);
        const task = taskRes.data;
        if (task.status === 'completed') {
          setRawOutput(task.payload?.result ?? '');
          clearInterval(interval);
        } else if (task.status === 'failed') {
          toast.error('Failed to fetch firewall status');
          clearInterval(interval);
        }
      } catch {
        clearInterval(interval);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [statusData?.taskId]);

  // ── Blocked IPs from DB ───────────────────────────────────────────────────
  const { data: blockedIps = [], isLoading: isBlocklistLoading } = useQuery<BlockedIp[]>({
    queryKey: ['blockedIps'],
    queryFn: async () => {
      const res = await api.get('/security/blocked-ips');
      return res.data;
    },
    refetchInterval: 30_000,
  });

  // Reset page if it goes out of range after data refresh / unblock
  useEffect(() => {
    const activeCount = blockedIps.filter(
      (e) => e.expires_at === null || new Date(e.expires_at) > new Date(),
    ).length;
    const count = Math.max(1, Math.ceil(activeCount / BLOCKED_PAGE_SIZE));
    if (blockedPage >= count) setBlockedPage(Math.max(0, count - 1));
  }, [blockedIps, blockedPage]);

  // ── Mutations ─────────────────────────────────────────────────────────────
  const allowPortMutation = useMutation({
    mutationFn: async (data: { port: string; protocol: string }) => {
      const res = await api.post('/firewall/allow', data);
      return res.data;
    },
    onSuccess: () => {
      setIsPortModalOpen(false);
      setPort('');
      toast.success('Port rule created — applying now…');
      setTimeout(() => refetch(), 2000);
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to allow port'),
  });

  const deleteRuleMutation = useMutation({
    mutationFn: async (ruleNumber: number) => {
      const res = await api.post('/firewall/delete', { ruleNumber });
      return res.data;
    },
    onSuccess: () => {
      toast.success('Rule deleted — refreshing…');
      setTimeout(() => refetch(), 2000);
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to delete rule'),
  });

  const blockIpMutation = useMutation({
    mutationFn: async (data: { ipAddress: string; reason: string }) => {
      const res = await api.post('/security/block-ip', data);
      return res.data;
    },
    onSuccess: () => {
      setIsBlockModalOpen(false);
      setBlockIp('');
      setBlockReason('');
      toast.success('IP blocked successfully');
      queryClient.invalidateQueries({ queryKey: ['blockedIps'] });
      setTimeout(() => refetch(), 2000);
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to block IP'),
  });

  const unblockIpMutation = useMutation({
    mutationFn: async (ipAddress: string) => {
      const res = await api.post('/security/unblock-ip', { ipAddress });
      return res.data;
    },
    onSuccess: () => {
      toast.success('IP unblocked');
      queryClient.invalidateQueries({ queryKey: ['blockedIps'] });
      setTimeout(() => refetch(), 2000);
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to unblock IP'),
  });

  // ── Parse & split UFW rules ───────────────────────────────────────────────
  const parseRules = (output: string): FirewallRule[] => {
    const ruleRegex = /^\[\s*(\d+)\]\s+(.*?)\s+(ALLOW|DENY|REJECT)\s+(IN\s+|OUT\s+)?(.*?)$/i;
    return output.split('\n').reduce<FirewallRule[]>((acc, line) => {
      const match = line.trim().match(ruleRegex);
      if (match) {
        acc.push({
          number: parseInt(match[1]!),
          to: match[2]!.trim(),
          action: match[3]!.trim().toUpperCase(),
          from: (match[5] ?? '').trim(),
        });
      }
      return acc;
    }, []);
  };

  const allUfwRules = parseRules(rawOutput);
  const portRules = allUfwRules.filter(r => !isIpDenyRule(r));
  const ufwIpDenyRules = allUfwRules.filter(r => isIpDenyRule(r));

  const isActive = rawOutput.toLowerCase().includes('active');
  const isLoading = isStatusLoading || isBlocklistLoading;

  const now = new Date();
  const activeBlockedIps = blockedIps.filter(
    (entry) => entry.expires_at === null || new Date(entry.expires_at) > now,
  );
  const blockedPageCount = Math.max(1, Math.ceil(activeBlockedIps.length / BLOCKED_PAGE_SIZE));
  const pagedBlockedIps = activeBlockedIps.slice(
    blockedPage * BLOCKED_PAGE_SIZE,
    (blockedPage + 1) * BLOCKED_PAGE_SIZE,
  );

  // ── Helpers ───────────────────────────────────────────────────────────────
  const handleAllowPort = (e: React.FormEvent) => {
    e.preventDefault();
    allowPortMutation.mutate({ port, protocol });
  };

  const handleBlockIp = (e: React.FormEvent) => {
    e.preventDefault();
    blockIpMutation.mutate({ ipAddress: blockIp, reason: blockReason || 'Manually blocked by admin' });
  };

  const confirmDelete = (rule: FirewallRule) => {
    if (window.confirm(`Delete firewall rule #${rule.number} (${rule.to} ${rule.action} ${rule.from})?`)) {
      deleteRuleMutation.mutate(rule.number);
    }
  };

  const confirmUnblock = (ip: string) => {
    if (window.confirm(`Unblock IP address ${ip}?`)) {
      unblockIpMutation.mutate(ip);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Firewall Management</h1>
          <p className="text-slate-500 mt-1">Manage UFW port rules and blocked IP addresses independently.</p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isLoading}
          className="bg-white border border-slate-200 text-slate-700 px-5 py-2.5 rounded-xl font-bold transition-all shadow-sm hover:bg-slate-50 flex items-center gap-2 text-sm"
        >
          <RefreshCw size={18} className={isLoading ? 'animate-spin' : ''} />
          Refresh Status
        </button>
      </div>

      {/* Status Card */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex items-center gap-5">
        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 ${isActive ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
          <ShieldCheck size={28} />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h3 className="text-base font-bold text-slate-800">UFW Firewall</h3>
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-widest ${isActive ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-slate-100 text-slate-400 border border-slate-200'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
              {isActive ? 'Active' : 'Inactive'}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            {portRules.length} port rule{portRules.length !== 1 ? 's' : ''} &nbsp;·&nbsp; {activeBlockedIps.length} blocked IP{activeBlockedIps.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {/* ── SECTION 1: Port Rules ─────────────────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Network size={20} className="text-orange-600" />
            <div>
              <h2 className="text-base font-bold text-slate-800">Port Rules</h2>
              <p className="text-[11px] text-slate-400 mt-0.5">ALLOW / DENY rules for specific ports and services</p>
            </div>
          </div>
          <button
            onClick={() => setIsPortModalOpen(true)}
            className="bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-xl font-bold transition-all shadow-sm shadow-orange-900/10 flex items-center gap-2 text-sm"
          >
            <Plus size={16} />
            Allow Port
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
              <tr>
                <th className="px-6 py-3.5 uppercase tracking-wider text-[10px] font-bold">#</th>
                <th className="px-6 py-3.5 uppercase tracking-wider text-[10px] font-bold">Port / Service</th>
                <th className="px-6 py-3.5 uppercase tracking-wider text-[10px] font-bold">Action</th>
                <th className="px-6 py-3.5 uppercase tracking-wider text-[10px] font-bold">From</th>
                <th className="px-6 py-3.5 uppercase tracking-wider text-[10px] font-bold text-right">Remove</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {!rawOutput ? (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-slate-400 italic text-sm">
                    {isStatusLoading ? 'Fetching rules…' : 'Click Refresh Status to load rules.'}
                  </td>
                </tr>
              ) : portRules.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-slate-400 italic text-sm">
                    No port rules defined.
                  </td>
                </tr>
              ) : (
                portRules.map((rule) => (
                  <tr key={rule.number} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4 font-mono text-slate-400 text-xs">{rule.number}</td>
                    <td className="px-6 py-4 font-bold text-slate-800 font-mono text-sm">{rule.to}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-widest border ${
                        rule.action === 'ALLOW'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                          : 'bg-red-50 text-red-700 border-red-100'
                      }`}>
                        {rule.action}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-500 text-xs">{rule.from || 'Anywhere'}</td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => confirmDelete(rule)}
                        disabled={deleteRuleMutation.isPending}
                        className="text-red-400 hover:text-red-600 p-2 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-40"
                        title="Delete rule"
                      >
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Raw output toggle */}
        {rawOutput && (
          <details className="border-t border-slate-800">
            <summary className="px-6 py-3 bg-slate-900 text-[10px] font-bold uppercase tracking-widest text-slate-500 flex items-center gap-2 cursor-pointer select-none hover:text-slate-400 transition-colors">
              <Hash size={11} /> Raw Terminal Output
            </summary>
            <pre className="bg-slate-900 text-[10px] text-orange-400/80 font-mono overflow-auto max-h-40 px-6 pb-4 leading-relaxed">
              {rawOutput}
            </pre>
          </details>
        )}
      </div>

      {/* ── SECTION 2: Blocked IP Addresses ──────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ShieldAlert size={20} className="text-red-500" />
            <div>
              <h2 className="text-base font-bold text-slate-800">Blocked IP Addresses</h2>
              <p className="text-[11px] text-slate-400 mt-0.5">IPs denied at the firewall — managed separately from port rules</p>
            </div>
          </div>
          <button
            onClick={() => setIsBlockModalOpen(true)}
            className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-xl font-bold transition-all shadow-sm shadow-red-900/10 flex items-center gap-2 text-sm"
          >
            <Ban size={16} />
            Block IP
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
              <tr>
                <th className="px-6 py-3.5 uppercase tracking-wider text-[10px] font-bold">IP Address</th>
                <th className="px-6 py-3.5 uppercase tracking-wider text-[10px] font-bold">Reason</th>
                <th className="px-6 py-3.5 uppercase tracking-wider text-[10px] font-bold">Expires</th>
                <th className="px-6 py-3.5 uppercase tracking-wider text-[10px] font-bold">Blocked At</th>
                <th className="px-6 py-3.5 uppercase tracking-wider text-[10px] font-bold text-right">Unblock</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isBlocklistLoading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-slate-400 italic text-sm">Loading…</td>
                </tr>
              ) : activeBlockedIps.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-slate-400 italic text-sm">
                    No IPs are currently blocked.
                  </td>
                </tr>
              ) : (
                pagedBlockedIps.map((entry) => (
                  <tr key={entry.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4 font-mono font-bold text-slate-800 text-sm">{entry.ip_address}</td>
                    <td className="px-6 py-4 text-slate-500 text-xs max-w-xs truncate">{entry.reason}</td>
                    <td className="px-6 py-4 text-xs">
                      {entry.expires_at ? (
                        <span className="text-amber-600 font-medium">
                          {new Date(entry.expires_at).toLocaleDateString()}
                        </span>
                      ) : (
                        <span className="text-red-600 font-bold">Permanent</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-slate-400 text-xs">
                      {new Date(entry.created_at).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => confirmUnblock(entry.ip_address)}
                        disabled={unblockIpMutation.isPending}
                        className="text-emerald-500 hover:text-emerald-700 p-2 rounded-lg hover:bg-emerald-50 transition-colors disabled:opacity-40"
                        title="Unblock this IP"
                      >
                        <Unlock size={15} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {blockedPageCount > 1 && (
          <div className="border-t border-slate-100 px-6 py-3 flex items-center justify-between bg-slate-50/50">
            <span className="text-xs text-slate-400">
              Page {blockedPage + 1} of {blockedPageCount} &nbsp;·&nbsp; {activeBlockedIps.length} total
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setBlockedPage(0)}
                disabled={blockedPage === 0}
                className="px-2 py-1 rounded-lg text-xs font-bold text-slate-500 hover:bg-slate-200 disabled:opacity-30 transition-colors"
              >
                «
              </button>
              <button
                onClick={() => setBlockedPage((p) => Math.max(0, p - 1))}
                disabled={blockedPage === 0}
                className="px-2 py-1 rounded-lg text-xs font-bold text-slate-500 hover:bg-slate-200 disabled:opacity-30 transition-colors"
              >
                ‹
              </button>
              {Array.from({ length: blockedPageCount }, (_, i) => (
                <button
                  key={i}
                  onClick={() => setBlockedPage(i)}
                  className={`w-7 h-7 rounded-lg text-xs font-bold transition-colors ${i === blockedPage ? 'bg-red-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-200'}`}
                >
                  {i + 1}
                </button>
              ))}
              <button
                onClick={() => setBlockedPage((p) => Math.min(blockedPageCount - 1, p + 1))}
                disabled={blockedPage === blockedPageCount - 1}
                className="px-2 py-1 rounded-lg text-xs font-bold text-slate-500 hover:bg-slate-200 disabled:opacity-30 transition-colors"
              >
                ›
              </button>
              <button
                onClick={() => setBlockedPage(blockedPageCount - 1)}
                disabled={blockedPage === blockedPageCount - 1}
                className="px-2 py-1 rounded-lg text-xs font-bold text-slate-500 hover:bg-slate-200 disabled:opacity-30 transition-colors"
              >
                »
              </button>
            </div>
          </div>
        )}

        {/* UFW IP deny rules that exist in UFW but not in DB (auto-blocked etc.) */}
        {ufwIpDenyRules.length > 0 && (
          <div className="border-t border-slate-100 px-6 py-4 bg-amber-50/50">
            <p className="text-[10px] font-bold uppercase tracking-widest text-amber-600 mb-3 flex items-center gap-2">
              <Activity size={11} /> Also enforced via UFW rules (rule #)
            </p>
            <div className="flex flex-wrap gap-2">
              {ufwIpDenyRules.map((rule) => (
                <div key={rule.number} className="flex items-center gap-2 bg-white border border-amber-200 rounded-lg px-3 py-1.5 text-xs">
                  <span className="font-mono text-slate-400 text-[10px]">#{rule.number}</span>
                  <span className="font-mono font-bold text-slate-700">{rule.from || rule.to}</span>
                  <button
                    onClick={() => confirmDelete(rule)}
                    className="text-red-400 hover:text-red-600 transition-colors ml-1"
                    title="Remove UFW rule"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Modal: Allow Port ─────────────────────────────────────────────── */}
      {isPortModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
                <Network size={18} className="text-orange-600" /> Allow Incoming Port
              </h2>
              <button onClick={() => setIsPortModalOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors text-xl leading-none">✕</button>
            </div>
            <form onSubmit={handleAllowPort} className="p-6 space-y-5">
              <div className="space-y-2">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Port Number</label>
                <input
                  type="text"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-slate-800 focus:ring-2 focus:ring-orange-500/50 outline-none transition-all font-mono text-sm"
                  value={port}
                  onChange={(e) => setPort(e.target.value.replace(/\D/g, ''))}
                  placeholder="e.g. 8080"
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Protocol</label>
                <div className="grid grid-cols-2 gap-3">
                  {(['tcp', 'udp'] as const).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setProtocol(p)}
                      className={`py-3 rounded-xl border font-bold transition-all text-sm uppercase ${protocol === p ? 'bg-slate-800 border-slate-800 text-white shadow-md' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setIsPortModalOpen(false)} className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 py-3 rounded-xl font-bold transition-all text-sm">Cancel</button>
                <button type="submit" disabled={allowPortMutation.isPending} className="flex-1 bg-orange-600 hover:bg-orange-700 text-white py-3 rounded-xl font-bold transition-all shadow-md shadow-orange-900/20 text-sm disabled:opacity-50">
                  {allowPortMutation.isPending ? 'Applying…' : 'Create Rule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal: Block IP ───────────────────────────────────────────────── */}
      {isBlockModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
                <Ban size={18} className="text-red-600" /> Block IP Address
              </h2>
              <button onClick={() => setIsBlockModalOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors text-xl leading-none">✕</button>
            </div>
            <form onSubmit={handleBlockIp} className="p-6 space-y-5">
              <div className="space-y-2">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">IP Address</label>
                <input
                  type="text"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-slate-800 focus:ring-2 focus:ring-red-500/50 outline-none transition-all font-mono text-sm"
                  value={blockIp}
                  onChange={(e) => setBlockIp(e.target.value.trim())}
                  placeholder="e.g. 203.0.113.42"
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Reason <span className="normal-case font-normal">(optional)</span></label>
                <input
                  type="text"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-slate-800 focus:ring-2 focus:ring-red-500/50 outline-none transition-all text-sm"
                  value={blockReason}
                  onChange={(e) => setBlockReason(e.target.value)}
                  placeholder="e.g. Repeated brute-force attempts"
                />
              </div>
              <div className="p-3 bg-red-50 border border-red-100 rounded-xl flex items-start gap-3">
                <ShieldAlert size={16} className="text-red-500 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-red-600 leading-relaxed">
                  This will immediately deny all traffic from this IP at the UFW level and record it in the blocklist.
                </p>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setIsBlockModalOpen(false)} className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 py-3 rounded-xl font-bold transition-all text-sm">Cancel</button>
                <button type="submit" disabled={blockIpMutation.isPending} className="flex-1 bg-red-600 hover:bg-red-700 text-white py-3 rounded-xl font-bold transition-all shadow-md shadow-red-900/20 text-sm disabled:opacity-50">
                  {blockIpMutation.isPending ? 'Blocking…' : 'Block IP'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default FirewallPage;
