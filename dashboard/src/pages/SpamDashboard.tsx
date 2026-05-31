import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import api from '../api/client';
import {
  ShieldAlert, Trash2, CheckCircle, Filter,
  Mail, UserCheck, UserX, Search, X, Square,
  SquareCheck, ShieldCheck, Bell, BellOff,
  MailOpen, Settings, Inbox, RefreshCw,
} from 'lucide-react';
import toast from 'react-hot-toast';
import type { MailUser, MailQuarantine, MailAccessControl } from '../../../shared/types';

// ── Types ──────────────────────────────────────────────────────────────────────

type Tab = 'quarantine' | 'access' | 'settings';

// ── Helpers ────────────────────────────────────────────────────────────────────

function ScoreBadge({ score }: { score: number | null }) {
  const s = score ?? 0;
  const cls = s >= 10
    ? 'bg-red-50 text-red-600 border-red-200'
    : 'bg-orange-50 text-orange-600 border-orange-200';
  return (
    <span className={`px-2 py-0.5 rounded border text-[10px] font-mono font-bold ${cls}`}>
      {s.toFixed(1)}
    </span>
  );
}

function RuleBadge({ type }: { type: 'allow' | 'block' }) {
  return type === 'allow'
    ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-100"><UserCheck size={10} />ALLOW</span>
    : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-50 text-red-700 border border-red-100"><UserX size={10} />BLOCK</span>;
}

// ── Main Page ──────────────────────────────────────────────────────────────────

const SpamDashboard: React.FC = () => {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedMailboxId, setSelectedMailboxId] = useState<string>('');
  const [activeTab, setActiveTab] = useState<Tab>('quarantine');

  const { data: mailboxes } = useQuery<MailUser[]>({
    queryKey: ['clientEmails'],
    queryFn: async () => (await api.get('/client/email')).data,
  });

  const selectedMailbox = useMemo(
    () => mailboxes?.find(m => m.id.toString() === selectedMailboxId),
    [mailboxes, selectedMailboxId]
  );

  // One-click actions from daily digest links (?release=N or ?delete=N)
  const releaseMutation = useMutation({
    mutationFn: async ({ id, addToAllowlist }: { id: number; addToAllowlist?: boolean }) =>
      (await api.post(`/client/email/quarantine/${id}/release`, { addToAllowlist })).data,
    onSuccess: (_, { addToAllowlist }) => {
      toast.success(addToAllowlist ? 'Released & added to allowlist' : 'Email released to inbox');
      queryClient.invalidateQueries({ queryKey: ['quarantine', selectedMailboxId] });
      queryClient.invalidateQueries({ queryKey: ['access-control', selectedMailboxId] });
    },
    onError: () => toast.error('Failed to release email'),
  });

  const deleteQuarantineMutation = useMutation({
    mutationFn: async (id: number) => (await api.delete(`/client/email/quarantine/${id}`)).data,
    onSuccess: () => {
      toast.success('Spam email deleted');
      queryClient.invalidateQueries({ queryKey: ['quarantine', selectedMailboxId] });
    },
    onError: () => toast.error('Failed to delete email'),
  });

  useEffect(() => {
    const releaseId = searchParams.get('release');
    const deleteId = searchParams.get('delete');
    if (!releaseId && !deleteId) return;
    const next = new URLSearchParams(searchParams);
    if (releaseId) { releaseMutation.mutate({ id: parseInt(releaseId, 10) }); next.delete('release'); }
    if (deleteId) { deleteQuarantineMutation.mutate(parseInt(deleteId, 10)); next.delete('delete'); }
    setSearchParams(next, { replace: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: 'quarantine', label: 'Quarantine', icon: ShieldAlert },
    { id: 'access',     label: 'Access Control', icon: Filter },
    { id: 'settings',   label: 'Settings', icon: Settings },
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-3">
            <ShieldAlert className="text-orange-600" size={28} />
            Spam Management
          </h1>
          <p className="text-slate-500 mt-1 ml-1">Quarantine, rules, and spam filter settings for your mailboxes.</p>
        </div>
        <select
          className="bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-700 outline-none shadow-sm focus:ring-2 focus:ring-orange-500/20"
          value={selectedMailboxId}
          onChange={e => setSelectedMailboxId(e.target.value)}
        >
          <option value="" disabled>Select Mailbox</option>
          {mailboxes?.map(m => <option key={m.id} value={m.id}>{m.email}</option>)}
        </select>
      </div>

      {!selectedMailboxId ? (
        <div className="h-96 flex flex-col items-center justify-center bg-slate-50/50 border-2 border-dashed border-slate-200 rounded-3xl p-12 text-center text-slate-400">
          <Mail className="mb-4 opacity-20" size={64} />
          <p>Select an email account above to manage spam settings.</p>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex space-x-1 bg-slate-200/50 p-1 rounded-xl w-fit">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-5 py-2.5 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${activeTab === tab.id ? 'bg-white text-orange-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                <tab.icon size={15} />
                {tab.label}
              </button>
            ))}
          </div>

          {activeTab === 'quarantine' && (
            <QuarantineTab
              selectedMailboxId={selectedMailboxId}
              releaseMutation={releaseMutation}
              deleteQuarantineMutation={deleteQuarantineMutation}
              queryClient={queryClient}
            />
          )}
          {activeTab === 'access' && (
            <AccessControlTab selectedMailboxId={selectedMailboxId} queryClient={queryClient} />
          )}
          {activeTab === 'settings' && selectedMailbox && (
            <SettingsTab mailbox={selectedMailbox} queryClient={queryClient} />
          )}
        </div>
      )}
    </div>
  );
};

// ── Quarantine tab ─────────────────────────────────────────────────────────────

const QuarantineTab: React.FC<{
  selectedMailboxId: string;
  releaseMutation: ReturnType<typeof useMutation<any, any, { id: number; addToAllowlist?: boolean }>>;
  deleteQuarantineMutation: ReturnType<typeof useMutation<any, any, number>>;
  queryClient: ReturnType<typeof useQueryClient>;
}> = ({ selectedMailboxId, releaseMutation, deleteQuarantineMutation, queryClient }) => {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selected, setSelected] = useState<Set<number>>(new Set());

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  const { data: quarantine, isLoading, refetch } = useQuery<MailQuarantine[]>({
    queryKey: ['quarantine', selectedMailboxId, debouncedSearch],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (debouncedSearch) params.set('search', debouncedSearch);
      return (await api.get(`/client/email/${selectedMailboxId}/quarantine?${params}`)).data;
    },
    enabled: !!selectedMailboxId,
  });

  const bulkMutation = useMutation({
    mutationFn: async (action: 'release' | 'delete') =>
      (await api.post('/client/email/quarantine/bulk', { ids: Array.from(selected), action })).data,
    onSuccess: (_, action) => {
      toast.success(`Bulk ${action} complete`);
      setSelected(new Set());
      queryClient.invalidateQueries({ queryKey: ['quarantine', selectedMailboxId] });
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Bulk action failed'),
  });

  const items = quarantine ?? [];
  const allIds = useMemo(() => items.map(i => i.id), [items]);
  const allSelected = allIds.length > 0 && allIds.every(id => selected.has(id));

  const toggleAll = useCallback(() => {
    setSelected(allSelected ? new Set() : new Set(allIds));
  }, [allIds, allSelected]);

  const toggle = useCallback((id: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className="w-full pl-9 pr-9 py-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-orange-500/20"
            placeholder="Search sender or subject…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              <X size={14} />
            </button>
          )}
        </div>
        <button onClick={() => refetch()} className="p-2.5 border border-slate-200 rounded-xl text-slate-500 hover:text-slate-700 hover:bg-slate-50">
          <RefreshCw size={15} />
        </button>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 bg-orange-50 border border-orange-200 rounded-xl">
          <span className="text-sm font-bold text-orange-700">{selected.size} selected</span>
          <div className="flex-1" />
          <button
            onClick={() => bulkMutation.mutate('release')}
            disabled={bulkMutation.isPending}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition-colors disabled:opacity-50"
          >
            <CheckCircle size={13} /> Release All
          </button>
          <button
            onClick={() => { if (window.confirm(`Delete ${selected.size} emails?`)) bulkMutation.mutate('delete'); }}
            disabled={bulkMutation.isPending}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-lg transition-colors disabled:opacity-50"
          >
            <Trash2 size={13} /> Delete All
          </button>
          <button onClick={() => setSelected(new Set())} className="text-orange-500 hover:text-orange-700">
            <X size={16} />
          </button>
        </div>
      )}

      <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">
        {items.length} quarantined{debouncedSearch ? ' (filtered)' : ''}
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 w-8">
                  <button onClick={toggleAll} className="text-slate-400 hover:text-orange-500">
                    {allSelected ? <SquareCheck size={15} className="text-orange-500" /> : <Square size={15} />}
                  </button>
                </th>
                <th className="px-4 py-3 uppercase tracking-wider text-[10px] font-bold">Score</th>
                <th className="px-4 py-3 uppercase tracking-wider text-[10px] font-bold">Sender</th>
                <th className="px-4 py-3 uppercase tracking-wider text-[10px] font-bold">Subject</th>
                <th className="px-4 py-3 uppercase tracking-wider text-[10px] font-bold">Date</th>
                <th className="px-4 py-3 uppercase tracking-wider text-[10px] font-bold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr><td colSpan={6} className="px-6 py-8 text-center text-slate-400">Loading…</td></tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <div className="py-14 flex flex-col items-center gap-3 text-slate-400">
                      <Inbox size={40} strokeWidth={1} />
                      <p className="text-sm italic">{debouncedSearch ? 'No results for your search.' : 'No quarantined emails — your mailbox is clean!'}</p>
                    </div>
                  </td>
                </tr>
              ) : items.map(q => (
                <tr
                  key={q.id}
                  className={`hover:bg-slate-50/50 transition-colors ${selected.has(q.id) ? 'bg-orange-50/40' : ''}`}
                >
                  <td className="px-4 py-3">
                    <button onClick={() => toggle(q.id)} className="text-slate-400 hover:text-orange-500">
                      {selected.has(q.id) ? <SquareCheck size={15} className="text-orange-500" /> : <Square size={15} />}
                    </button>
                  </td>
                  <td className="px-4 py-3"><ScoreBadge score={q.spam_score} /></td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-700 max-w-[180px] truncate">{q.sender}</td>
                  <td className="px-4 py-3 text-xs text-slate-600 max-w-[200px] truncate">
                    {q.subject || <span className="italic text-slate-400">no subject</span>}
                  </td>
                  <td className="px-4 py-3 text-[11px] text-slate-400 whitespace-nowrap">
                    {new Date(q.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="px-4 py-3 text-right space-x-1">
                    <button
                      onClick={() => releaseMutation.mutate({ id: q.id })}
                      disabled={releaseMutation.isPending}
                      title="Release to inbox"
                      className="p-1.5 text-emerald-500 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors"
                    >
                      <MailOpen size={15} />
                    </button>
                    <button
                      onClick={() => releaseMutation.mutate({ id: q.id, addToAllowlist: true })}
                      disabled={releaseMutation.isPending}
                      title="Release & add sender to allowlist"
                      className="p-1.5 text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors"
                    >
                      <UserCheck size={15} />
                    </button>
                    <button
                      onClick={() => deleteQuarantineMutation.mutate(q.id)}
                      disabled={deleteQuarantineMutation.isPending}
                      title="Delete permanently"
                      className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {items.length > 0 && (
          <div className="px-6 py-3 bg-slate-50 border-t border-slate-100">
            <p className="text-[11px] text-slate-400">
              Quarantined emails expire automatically after 30 days.
              <span className="ml-1 text-blue-500 font-medium">Release</span> (green) delivers to inbox.
              <span className="ml-1 text-blue-500 font-medium">Release + Allow</span> (blue) also adds the sender to your allowlist.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

// ── Access Control tab ─────────────────────────────────────────────────────────

const AccessControlTab: React.FC<{
  selectedMailboxId: string;
  queryClient: ReturnType<typeof useQueryClient>;
}> = ({ selectedMailboxId, queryClient }) => {
  const [newPattern, setNewPattern] = useState('');
  const [newType, setNewType] = useState<'allow' | 'block'>('allow');

  const { data: accessRules, isLoading } = useQuery<MailAccessControl[]>({
    queryKey: ['access-control', selectedMailboxId],
    queryFn: async () => (await api.get(`/client/email/${selectedMailboxId}/access-control`)).data,
    enabled: !!selectedMailboxId,
  });

  const addMutation = useMutation({
    mutationFn: async () => (await api.post(`/client/email/${selectedMailboxId}/access-control`, {
      senderPattern: newPattern, accessType: newType,
    })).data,
    onSuccess: () => {
      toast.success('Rule added');
      setNewPattern('');
      queryClient.invalidateQueries({ queryKey: ['access-control', selectedMailboxId] });
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed to add rule'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => (await api.delete(`/client/email/${selectedMailboxId}/access-control/${id}`)).data,
    onSuccess: () => {
      toast.success('Rule removed');
      queryClient.invalidateQueries({ queryKey: ['access-control', selectedMailboxId] });
    },
  });

  return (
    <div className="space-y-6">
      {/* Add Rule Form */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <h3 className="text-sm font-bold text-slate-800 mb-4">Add Whitelist / Blacklist Rule</h3>
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 space-y-1">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Sender or Domain Pattern</label>
            <input
              type="text"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-mono outline-none focus:ring-2 focus:ring-orange-500/20"
              value={newPattern}
              onChange={e => setNewPattern(e.target.value)}
              placeholder="boss@corp.com or @trusted.com"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Access Type</label>
            <select
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-700 outline-none"
              value={newType}
              onChange={e => setNewType(e.target.value as 'allow' | 'block')}
            >
              <option value="allow">Allow (Whitelist)</option>
              <option value="block">Block (Blacklist)</option>
            </select>
          </div>
          <button
            onClick={() => addMutation.mutate()}
            disabled={!newPattern || addMutation.isPending}
            className="self-end bg-orange-600 hover:bg-orange-700 text-white px-6 py-2.5 rounded-xl font-bold transition-all shadow-md shadow-orange-900/10 text-sm disabled:opacity-50"
          >
            Add Rule
          </button>
        </div>
      </div>

      {/* Rules List */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-800">Current Rules</h2>
          <div className="flex gap-2">
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-100">
              {(accessRules ?? []).filter(r => r.access_type === 'allow').length} allow
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-50 text-red-700 border border-red-100">
              {(accessRules ?? []).filter(r => r.access_type === 'block').length} block
            </span>
          </div>
        </div>
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
            <tr>
              <th className="px-6 py-4 uppercase tracking-wider text-[10px] font-bold">Pattern</th>
              <th className="px-6 py-4 uppercase tracking-wider text-[10px] font-bold">Action</th>
              <th className="px-6 py-4 uppercase tracking-wider text-[10px] font-bold">Added</th>
              <th className="px-6 py-4 uppercase tracking-wider text-[10px] font-bold text-right"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading ? (
              <tr><td colSpan={4} className="px-6 py-8 text-center text-slate-400">Loading…</td></tr>
            ) : (accessRules ?? []).length === 0 ? (
              <tr><td colSpan={4} className="px-6 py-12 text-center text-slate-400 italic">No whitelist or blacklist rules defined.</td></tr>
            ) : (accessRules ?? []).map(rule => (
              <tr key={rule.id} className="hover:bg-slate-50/50 transition-colors">
                <td className="px-6 py-4 font-mono text-xs text-slate-700 font-bold">{rule.sender_pattern}</td>
                <td className="px-6 py-4"><RuleBadge type={rule.access_type} /></td>
                <td className="px-6 py-4 text-[11px] text-slate-400">{new Date(rule.created_at).toLocaleDateString()}</td>
                <td className="px-6 py-4 text-right">
                  <button
                    onClick={() => deleteMutation.mutate(rule.id)}
                    className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <Trash2 size={15} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ── Settings tab ───────────────────────────────────────────────────────────────

const SettingsTab: React.FC<{
  mailbox: MailUser;
  queryClient: ReturnType<typeof useQueryClient>;
}> = ({ mailbox, queryClient }) => {
  const [filterEnabled, setFilterEnabled] = useState(mailbox.spam_filter_enabled);
  const [digestEnabled, setDigestEnabled] = useState(mailbox.spam_digest_enabled);
  const [threshold, setThreshold] = useState(String(mailbox.spam_score_threshold ?? 5.0));
  const [action, setAction] = useState<'quarantine' | 'tag' | 'deliver'>(mailbox.spam_action ?? 'quarantine');
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setFilterEnabled(mailbox.spam_filter_enabled);
    setDigestEnabled(mailbox.spam_digest_enabled);
    setThreshold(String(mailbox.spam_score_threshold ?? 5.0));
    setAction(mailbox.spam_action ?? 'quarantine');
    setDirty(false);
  }, [mailbox.id]);

  const saveMutation = useMutation({
    mutationFn: async () => (await api.patch(`/client/email/${mailbox.id}`, {
      spamFilterEnabled: filterEnabled,
      spamDigestEnabled: digestEnabled,
      spamScoreThreshold: parseFloat(threshold),
      spamAction: action,
    })).data,
    onSuccess: () => {
      toast.success('Spam settings saved');
      setDirty(false);
      queryClient.invalidateQueries({ queryKey: ['clientEmails'] });
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Save failed'),
  });

  function change<T>(setter: React.Dispatch<React.SetStateAction<T>>) {
    return (v: T) => { setter(v); setDirty(true); };
  }

  const ACTION_LABELS: Record<string, string> = {
    quarantine: 'Quarantine — hold suspected spam for review',
    tag:        'Tag — prepend [SPAM] to subject and deliver',
    deliver:    'Deliver — pass spam through without modification',
  };

  return (
    <div className="space-y-6">
      {/* Filter on/off */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-5">
        <h3 className="text-sm font-bold text-slate-800">Spam Filter</h3>

        <div className="flex items-center justify-between py-3 border-b border-slate-100">
          <div>
            <p className="text-sm font-bold text-slate-700">Enable spam filter</p>
            <p className="text-xs text-slate-400 mt-0.5">Scan incoming emails and apply the action below.</p>
          </div>
          <button
            onClick={() => change(setFilterEnabled)(!filterEnabled)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${filterEnabled ? 'bg-orange-500' : 'bg-slate-300'}`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${filterEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </div>

        {filterEnabled && (
          <>
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                Spam Score Threshold
              </label>
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min="1"
                  max="20"
                  step="0.5"
                  className="flex-1 accent-orange-500"
                  value={threshold}
                  onChange={e => change(setThreshold)(e.target.value)}
                />
                <span className="w-12 text-center font-mono text-sm font-bold text-slate-700 bg-slate-100 rounded-lg py-1">
                  {parseFloat(threshold).toFixed(1)}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Emails scoring above this threshold trigger the action below. Lower = more aggressive (more false positives). Default is 5.0.
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                Spam Action
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {(['quarantine', 'tag', 'deliver'] as const).map(opt => (
                  <button
                    key={opt}
                    onClick={() => change(setAction)(opt)}
                    className={`flex flex-col gap-1.5 p-4 rounded-xl border-2 text-left transition-all ${action === opt ? 'border-orange-500 bg-orange-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}
                  >
                    <div className="flex items-center gap-2">
                      {opt === 'quarantine' && <ShieldCheck size={16} className={action === opt ? 'text-orange-600' : 'text-slate-400'} />}
                      {opt === 'tag'        && <ShieldAlert size={16}  className={action === opt ? 'text-orange-600' : 'text-slate-400'} />}
                      {opt === 'deliver'    && <MailOpen size={16}     className={action === opt ? 'text-orange-600' : 'text-slate-400'} />}
                      <span className={`text-xs font-bold capitalize ${action === opt ? 'text-orange-700' : 'text-slate-600'}`}>{opt}</span>
                    </div>
                    <p className="text-[11px] text-slate-500 leading-snug">
                      {opt === 'quarantine' && 'Hold suspected spam for review in this dashboard.'}
                      {opt === 'tag'        && 'Prepend [SPAM] to subject and deliver to inbox.'}
                      {opt === 'deliver'    && 'Pass all email through without modification.'}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Digest */}
        <div className="flex items-center justify-between py-3 border-t border-slate-100">
          <div className="flex items-center gap-3">
            {digestEnabled ? <Bell size={16} className="text-orange-500" /> : <BellOff size={16} className="text-slate-400" />}
            <div>
              <p className="text-sm font-bold text-slate-700">Daily spam digest email</p>
              <p className="text-xs text-slate-400 mt-0.5">Receive a daily summary of quarantined emails with one-click actions.</p>
            </div>
          </div>
          <button
            onClick={() => change(setDigestEnabled)(!digestEnabled)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${digestEnabled ? 'bg-orange-500' : 'bg-slate-300'}`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${digestEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </div>
      </div>

      {dirty && (
        <div className="flex justify-end">
          <button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="px-6 py-2.5 bg-orange-600 hover:bg-orange-700 text-white rounded-xl font-bold text-sm transition-all shadow-md shadow-orange-900/10 disabled:opacity-50"
          >
            {saveMutation.isPending ? 'Saving…' : 'Save Settings'}
          </button>
        </div>
      )}
    </div>
  );
};

export default SpamDashboard;
