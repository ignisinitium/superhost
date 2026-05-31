import React, { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  AreaChart, Area, CartesianGrid,
} from 'recharts';
import adminApi from '../api/admin';
import {
  ShieldAlert, Trash2, CheckCircle2, Filter, Mail,
  TrendingDown, AlertTriangle, Search, RefreshCw, Send,
  UserCheck, UserX, MailOpen, ShieldCheck,
  CircleAlert, Inbox, SquareCheck, Square, X, ArrowUpDown,
  Globe, Plus, CalendarRange, Undo2,
} from 'lucide-react';
import toast from 'react-hot-toast';

// ── Types ──────────────────────────────────────────────────────────────────────

interface SpamStats {
  totalMailboxes: number;
  totalQuarantined: number;
  releasedCount: number;
  filterEnabled: number;
  totalRules: number;
  highSeverity: number;
  topSenders: { sender: string; count: number }[];
  scoreDistribution: { range: string; count: number }[];
  recentQuarantine: QuarantineItem[];
  dailyVolume: { day: string; count: number }[];
}

interface GlobalRule {
  id: number;
  sender_pattern: string;
  access_type: 'allow' | 'block';
  note: string | null;
  created_at: string;
}

interface QuarantineItem {
  id: number;
  sender: string;
  subject: string;
  spam_score: number | null;
  created_at: string;
  file_path?: string;
  mail_user_id: number;
  mailbox_email: string;
  domain_name: string;
  owner: string;
}

interface AdminRule {
  id: number;
  sender_pattern: string;
  access_type: 'allow' | 'block';
  created_at: string;
  mail_user_id: number;
  mailbox_email: string;
  domain_name: string;
  owner: string;
}

interface AdminMailbox {
  id: number;
  email: string;
  quota: number;
  spam_filter_enabled: boolean;
  is_catchall: boolean;
  domain_name: string;
  owner: string;
  created_at?: string;
}

interface User { id: number; username: string }

// ── Helpers ────────────────────────────────────────────────────────────────────

function scoreColor(score: number | null): string {
  if (score === null || score === undefined) return 'bg-slate-50 text-slate-500 border-slate-100';
  if (score >= 20) return 'bg-red-100 text-red-700 border-red-200';
  if (score >= 10) return 'bg-orange-100 text-orange-700 border-orange-200';
  return 'bg-amber-50 text-amber-700 border-amber-100';
}

function ScoreBadge({ score }: { score: number | null }) {
  const s = score ?? 0;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold font-mono border ${scoreColor(s)}`}>
      {s.toFixed(1)}
    </span>
  );
}

function RuleBadge({ type }: { type: 'allow' | 'block' }) {
  return type === 'allow'
    ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-100"><UserCheck size={10} />ALLOW</span>
    : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-50 text-red-700 border border-red-100"><UserX size={10} />BLOCK</span>;
}

function EmptyState({ icon: Icon, text }: { icon: React.ElementType; text: string }) {
  return (
    <div className="py-16 flex flex-col items-center gap-3 text-slate-400">
      <Icon size={40} strokeWidth={1} />
      <p className="text-sm italic">{text}</p>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

type Tab = 'overview' | 'quarantine' | 'mailboxes' | 'rules';

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'overview',   label: 'Overview',   icon: TrendingDown },
  { id: 'quarantine', label: 'Quarantine', icon: ShieldAlert },
  { id: 'mailboxes',  label: 'Mailboxes',  icon: Mail },
  { id: 'rules',      label: 'Rules',      icon: Filter },
];

const AdminSpam: React.FC = () => {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<Tab>('overview');

  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-orange-100 rounded-xl">
            <ShieldAlert className="text-orange-600" size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Spam Command Center</h1>
            <p className="text-sm text-slate-500 mt-0.5">Server-wide quarantine, filter rules, and mailbox health.</p>
          </div>
        </div>

        <DigestButton queryClient={queryClient} />
      </div>

      {/* Tabs */}
      <div className="flex space-x-1 bg-slate-100 p-1 rounded-xl w-fit">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-bold transition-all ${
              activeTab === tab.id
                ? 'bg-white text-orange-600 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <tab.icon size={15} />
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'overview'   && <OverviewTab />}
      {activeTab === 'quarantine' && <QuarantineTab queryClient={queryClient} />}
      {activeTab === 'mailboxes'  && <MailboxesTab  queryClient={queryClient} />}
      {activeTab === 'rules'      && <RulesTab       queryClient={queryClient} />}
    </div>
  );
};

// ── Digest button ──────────────────────────────────────────────────────────────

const DigestButton: React.FC<{ queryClient: ReturnType<typeof useQueryClient> }> = () => {
  const digestMutation = useMutation({
    mutationFn: async () => (await adminApi.post('/spam/digest/all')).data,
    onSuccess: () => toast.success('Daily digest queued for all users'),
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed'),
  });

  return (
    <button
      onClick={() => digestMutation.mutate()}
      disabled={digestMutation.isPending}
      className="flex items-center gap-2 px-4 py-2.5 bg-orange-600 hover:bg-orange-700 text-white rounded-xl font-bold text-sm transition-all shadow-md shadow-orange-900/10 disabled:opacity-50"
    >
      <Send size={15} className={digestMutation.isPending ? 'animate-pulse' : ''} />
      {digestMutation.isPending ? 'Queuing…' : 'Send Digest to All'}
    </button>
  );
};

// ── Overview tab ───────────────────────────────────────────────────────────────

const OverviewTab: React.FC = () => {
  const { data: stats, isLoading } = useQuery<SpamStats>({
    queryKey: ['adminSpamStats'],
    queryFn: async () => (await adminApi.get('/spam/stats')).data,
    refetchInterval: 30_000,
  });

  if (isLoading) return <LoadingGrid />;
  if (!stats) return null;

  const filterPct = stats.totalMailboxes > 0
    ? Math.round((stats.filterEnabled / stats.totalMailboxes) * 100)
    : 0;

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard color="orange"  icon={<Inbox size={20} />}       label="Quarantined"     value={stats.totalQuarantined.toLocaleString()} />
        <StatCard color="red"     icon={<CircleAlert size={20} />}  label="High Severity"   value={stats.highSeverity.toLocaleString()} sub="score > 10" />
        <StatCard color="emerald" icon={<Undo2 size={20} />}        label="Released (30d)"  value={stats.releasedCount.toLocaleString()} sub="false positives" />
        <StatCard color="sky"     icon={<Mail size={20} />}         label="Mailboxes"       value={stats.totalMailboxes.toLocaleString()} />
        <StatCard color="blue"    icon={<ShieldCheck size={20} />}  label="Filter Coverage" value={`${filterPct}%`} sub={`${stats.filterEnabled} of ${stats.totalMailboxes}`} />
        <StatCard color="violet"  icon={<Filter size={20} />}       label="Rules"           value={stats.totalRules.toLocaleString()} />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 14-day volume */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <h3 className="text-sm font-bold text-slate-700 mb-4">Quarantine Volume — Last 14 Days</h3>
          {stats.dailyVolume.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={stats.dailyVolume} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="volGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f97316" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="day" tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={v => v.slice(5)} />
                <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
                  labelFormatter={v => `Date: ${v}`}
                />
                <Area type="monotone" dataKey="count" stroke="#f97316" strokeWidth={2} fill="url(#volGrad)" name="Emails" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[180px] flex items-center justify-center text-slate-400 text-sm italic">No data yet</div>
          )}
        </div>

        {/* Score distribution */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <h3 className="text-sm font-bold text-slate-700 mb-4">Spam Score Distribution</h3>
          {stats.scoreDistribution.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={stats.scoreDistribution} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="range" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} allowDecimals={false} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }} />
                <Bar dataKey="count" fill="#f97316" radius={[4, 4, 0, 0]} name="Emails" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[180px] flex items-center justify-center text-slate-400 text-sm italic">No data yet</div>
          )}
        </div>
      </div>

      {/* Bottom row: top senders + recent */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top spam senders */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/60 flex items-center gap-2">
            <AlertTriangle size={16} className="text-red-500" />
            <h3 className="text-sm font-bold text-slate-800">Top Spam Sources</h3>
          </div>
          {stats.topSenders.length > 0 ? (
            <div className="divide-y divide-slate-100">
              {stats.topSenders.map((s, i) => {
                const maxCount = stats.topSenders[0]?.count ?? 1;
                const pct = Math.round((s.count / maxCount) * 100);
                return (
                  <div key={i} className="flex items-center gap-4 px-6 py-3">
                    <span className="text-xs font-bold text-slate-300 w-4 shrink-0">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-mono text-slate-700 truncate">{s.sender}</p>
                      <div className="mt-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-orange-400 rounded-full transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                    <span className="text-xs font-bold text-slate-500 shrink-0">{s.count}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState icon={ShieldCheck} text="No spam senders recorded yet." />
          )}
        </div>

        {/* Recent quarantine */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/60 flex items-center gap-2">
            <Inbox size={16} className="text-orange-500" />
            <h3 className="text-sm font-bold text-slate-800">Recently Quarantined</h3>
          </div>
          {stats.recentQuarantine.length > 0 ? (
            <div className="divide-y divide-slate-100">
              {stats.recentQuarantine.map(q => (
                <div key={q.id} className="flex items-start gap-3 px-6 py-3">
                  <ScoreBadge score={q.spam_score} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-slate-700 truncate">{q.subject || '(no subject)'}</p>
                    <p className="text-[10px] text-slate-400 truncate font-mono">{q.sender}</p>
                    <p className="text-[10px] text-slate-400">→ {q.mailbox_email}</p>
                  </div>
                  <span className="text-[10px] text-slate-400 whitespace-nowrap shrink-0">
                    {new Date(q.created_at).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon={Inbox} text="Nothing quarantined yet." />
          )}
        </div>
      </div>
    </div>
  );
};

// ── Quarantine tab ─────────────────────────────────────────────────────────────

const QuarantineTab: React.FC<{ queryClient: ReturnType<typeof useQueryClient> }> = ({ queryClient }) => {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [userFilter, setUserFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selected, setSelected] = useState<Set<number>>(new Set());

  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  const { data: users } = useQuery<User[]>({
    queryKey: ['users'],
    queryFn: async () => (await adminApi.get('/../users')).data,
  });

  const { data, isLoading, refetch } = useQuery<{ items: QuarantineItem[]; total: number }>({
    queryKey: ['adminQuarantine', debouncedSearch, userFilter, dateFrom, dateTo],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '200' });
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (userFilter) params.set('userId', userFilter);
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo + 'T23:59:59');
      return (await adminApi.get(`/spam/quarantine?${params}`)).data;
    },
    refetchInterval: 15_000,
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const allIds = useMemo(() => items.map(i => i.id), [items]);
  const allSelected = allIds.length > 0 && allIds.every(id => selected.has(id));

  const toggleAll = useCallback(() => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(allIds));
  }, [allIds, allSelected]);

  const toggle = useCallback((id: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['adminQuarantine'] });
    queryClient.invalidateQueries({ queryKey: ['adminSpamStats'] });
    setSelected(new Set());
  }, [queryClient]);

  const releaseMutation = useMutation({
    mutationFn: async (id: number) => (await adminApi.post(`/spam/quarantine/${id}/release`)).data,
    onSuccess: () => { toast.success('Released to inbox'); invalidate(); },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Release failed'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => (await adminApi.delete(`/spam/quarantine/${id}`)).data,
    onSuccess: () => { toast.success('Deleted'); invalidate(); },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Delete failed'),
  });

  const bulkMutation = useMutation({
    mutationFn: async (action: 'release' | 'delete') =>
      (await adminApi.post('/spam/quarantine/bulk', { ids: Array.from(selected), action })).data,
    onSuccess: (_, action) => {
      toast.success(`Bulk ${action} complete for ${selected.size} emails`);
      invalidate();
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Bulk action failed'),
  });

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-orange-500/20"
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
        <select
          className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none bg-white"
          value={userFilter}
          onChange={e => setUserFilter(e.target.value)}
        >
          <option value="">All users</option>
          {users?.map(u => <option key={u.id} value={u.id}>{u.username}</option>)}
        </select>
        <button onClick={() => refetch()} className="p-2.5 border border-slate-200 rounded-xl text-slate-500 hover:text-slate-700 hover:bg-slate-50">
          <RefreshCw size={16} />
        </button>
      </div>
      {/* Date range */}
      <div className="flex flex-col sm:flex-row items-center gap-2">
        <CalendarRange size={14} className="text-slate-400 shrink-0" />
        <input
          type="date"
          className="border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none bg-white focus:ring-2 focus:ring-orange-500/20"
          value={dateFrom}
          onChange={e => setDateFrom(e.target.value)}
          title="From date"
        />
        <span className="text-slate-400 text-sm">to</span>
        <input
          type="date"
          className="border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none bg-white focus:ring-2 focus:ring-orange-500/20"
          value={dateTo}
          onChange={e => setDateTo(e.target.value)}
          title="To date"
        />
        {(dateFrom || dateTo) && (
          <button
            onClick={() => { setDateFrom(''); setDateTo(''); }}
            className="text-xs text-slate-400 hover:text-slate-600 underline"
          >
            Clear dates
          </button>
        )}
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
            <CheckCircle2 size={13} /> Release All
          </button>
          <button
            onClick={() => {
              if (window.confirm(`Delete ${selected.size} quarantined emails?`))
                bulkMutation.mutate('delete');
            }}
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

      {/* Count badge */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
          {total.toLocaleString()} quarantined {debouncedSearch || userFilter ? '(filtered)' : 'total'}
        </span>
        {items.length < total && (
          <span className="text-[10px] text-slate-400">— showing {items.length}</span>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 w-8">
                  <button onClick={toggleAll} className="text-slate-400 hover:text-orange-500">
                    {allSelected ? <SquareCheck size={16} className="text-orange-500" /> : <Square size={16} />}
                  </button>
                </th>
                <th className="px-4 py-3 text-[10px] uppercase tracking-wider font-bold">Score</th>
                <th className="px-4 py-3 text-[10px] uppercase tracking-wider font-bold">Sender</th>
                <th className="px-4 py-3 text-[10px] uppercase tracking-wider font-bold">Subject</th>
                <th className="px-4 py-3 text-[10px] uppercase tracking-wider font-bold">Mailbox</th>
                <th className="px-4 py-3 text-[10px] uppercase tracking-wider font-bold">Owner</th>
                <th className="px-4 py-3 text-[10px] uppercase tracking-wider font-bold">Date</th>
                <th className="px-4 py-3 text-right text-[10px] uppercase tracking-wider font-bold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr><td colSpan={8} className="px-6 py-10 text-center text-slate-400">Loading…</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={8}><EmptyState icon={Inbox} text="No quarantined emails match your filters." /></td></tr>
              ) : items.map(q => (
                <tr
                  key={q.id}
                  className={`transition-colors hover:bg-slate-50/60 ${selected.has(q.id) ? 'bg-orange-50/40' : ''}`}
                >
                  <td className="px-4 py-3">
                    <button onClick={() => toggle(q.id)} className="text-slate-400 hover:text-orange-500">
                      {selected.has(q.id) ? <SquareCheck size={15} className="text-orange-500" /> : <Square size={15} />}
                    </button>
                  </td>
                  <td className="px-4 py-3"><ScoreBadge score={q.spam_score} /></td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-700 max-w-[180px] truncate">{q.sender}</td>
                  <td className="px-4 py-3 text-xs text-slate-600 max-w-[220px] truncate">{q.subject || <span className="italic text-slate-400">no subject</span>}</td>
                  <td className="px-4 py-3 text-[11px] text-slate-500 font-mono">{q.mailbox_email}</td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-bold">{q.owner}</span>
                  </td>
                  <td className="px-4 py-3 text-[11px] text-slate-400 whitespace-nowrap">
                    {new Date(q.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="px-4 py-3 text-right space-x-1">
                    <button
                      onClick={() => releaseMutation.mutate(q.id)}
                      disabled={releaseMutation.isPending}
                      title="Release to inbox"
                      className="p-1.5 text-emerald-500 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors"
                    >
                      <MailOpen size={15} />
                    </button>
                    <button
                      onClick={() => deleteMutation.mutate(q.id)}
                      disabled={deleteMutation.isPending}
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
      </div>
    </div>
  );
};

// ── Mailboxes tab ──────────────────────────────────────────────────────────────

const MailboxesTab: React.FC<{ queryClient: ReturnType<typeof useQueryClient> }> = ({ queryClient }) => {
  const [search, setSearch] = useState('');
  const [filterEnabled, setFilterEnabled] = useState<'all' | 'on' | 'off'>('all');

  const { data: mailboxes, isLoading } = useQuery<AdminMailbox[]>({
    queryKey: ['adminMailboxes'],
    queryFn: async () => (await adminApi.get('/admin/email')).data,
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, enabled }: { id: number; enabled: boolean }) =>
      (await adminApi.patch(`/admin/email/${id}`, { spamFilterEnabled: enabled })).data,
    onSuccess: () => { toast.success('Updated'); queryClient.invalidateQueries({ queryKey: ['adminMailboxes'] }); },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Update failed'),
  });

  const digestMutation = useMutation({
    mutationFn: async (mailUserId: number) => (await adminApi.post(`/spam/digest/${mailUserId}`)).data,
    onSuccess: () => toast.success('Digest queued'),
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed'),
  });

  const filtered = useMemo(() => {
    return (mailboxes ?? []).filter(m => {
      if (search && !m.email.toLowerCase().includes(search.toLowerCase()) && !m.owner.toLowerCase().includes(search.toLowerCase())) return false;
      if (filterEnabled === 'on' && !m.spam_filter_enabled) return false;
      if (filterEnabled === 'off' && m.spam_filter_enabled) return false;
      return true;
    });
  }, [mailboxes, search, filterEnabled]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-orange-500/20"
            placeholder="Search email or owner…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
          {(['all', 'on', 'off'] as const).map(v => (
            <button
              key={v}
              onClick={() => setFilterEnabled(v)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${filterEnabled === v ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              {v === 'all' ? 'All' : v === 'on' ? 'Filter ON' : 'Filter OFF'}
            </button>
          ))}
        </div>
      </div>

      <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">
        {filtered.length} of {mailboxes?.length ?? 0} mailboxes
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
              <tr>
                <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-wider">Email</th>
                <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-wider">Owner</th>
                <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-wider">Domain</th>
                <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-wider">Spam Filter</th>
                <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr><td colSpan={5} className="px-6 py-10 text-center text-slate-400">Loading…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={5}><EmptyState icon={Mail} text="No mailboxes match your filter." /></td></tr>
              ) : filtered.map(m => (
                <tr key={m.id} className="hover:bg-slate-50/60 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-bold text-slate-800">{m.email}</span>
                      {m.is_catchall && (
                        <span className="px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 text-[9px] font-bold">CATCHALL</span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-bold">{m.owner}</span>
                  </td>
                  <td className="px-6 py-4 text-xs text-slate-500 font-mono">{m.domain_name}</td>
                  <td className="px-6 py-4">
                    <button
                      onClick={() => toggleMutation.mutate({ id: m.id, enabled: !m.spam_filter_enabled })}
                      disabled={toggleMutation.isPending}
                      className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold border transition-all ${
                        m.spam_filter_enabled
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                          : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      <ShieldCheck size={11} />
                      {m.spam_filter_enabled ? 'Active' : 'Disabled'}
                    </button>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => digestMutation.mutate(m.id)}
                      disabled={digestMutation.isPending}
                      title="Send spam digest"
                      className="p-1.5 text-slate-400 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-colors"
                    >
                      <Send size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// ── Rules tab ──────────────────────────────────────────────────────────────────

const RulesTab: React.FC<{ queryClient: ReturnType<typeof useQueryClient> }> = ({ queryClient }) => {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'allow' | 'block'>('all');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  // Global rule form state
  const [globalPattern, setGlobalPattern] = useState('');
  const [globalType, setGlobalType] = useState<'allow' | 'block'>('block');
  const [globalNote, setGlobalNote] = useState('');

  // Per-mailbox rule form state
  const [mbMailboxId, setMbMailboxId] = useState('');
  const [mbPattern, setMbPattern] = useState('');
  const [mbType, setMbType] = useState<'allow' | 'block'>('allow');

  const { data: rules, isLoading } = useQuery<AdminRule[]>({
    queryKey: ['adminRules'],
    queryFn: async () => (await adminApi.get('/spam/rules')).data,
  });

  const { data: globalRules, isLoading: isGLoading } = useQuery<GlobalRule[]>({
    queryKey: ['adminGlobalRules'],
    queryFn: async () => (await adminApi.get('/spam/global-rules')).data,
  });

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['adminRules'] });
    queryClient.invalidateQueries({ queryKey: ['adminGlobalRules'] });
    queryClient.invalidateQueries({ queryKey: ['adminSpamStats'] });
  }, [queryClient]);

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => (await adminApi.delete(`/spam/rules/${id}`)).data,
    onSuccess: () => { toast.success('Rule deleted'); invalidate(); },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Delete failed'),
  });

  const deleteGlobalMutation = useMutation({
    mutationFn: async (id: number) => (await adminApi.delete(`/spam/global-rules/${id}`)).data,
    onSuccess: () => { toast.success('Global rule deleted'); invalidate(); },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Delete failed'),
  });

  const { data: allMailboxes } = useQuery<AdminMailbox[]>({
    queryKey: ['adminMailboxes'],
    queryFn: async () => (await adminApi.get('/admin/email')).data,
  });

  const addGlobalMutation = useMutation({
    mutationFn: async (vars: { senderPattern: string; accessType: 'allow' | 'block'; note?: string }) =>
      (await adminApi.post('/spam/global-rules', vars)).data,
    onSuccess: () => {
      toast.success('Global rule saved');
      setGlobalPattern('');
      setGlobalNote('');
      invalidate();
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed to save rule'),
  });

  const addMailboxRuleMutation = useMutation({
    mutationFn: async (vars: { mailUserId: number; senderPattern: string; accessType: 'allow' | 'block' }) =>
      (await adminApi.post('/spam/rules', vars)).data,
    onSuccess: () => {
      toast.success('Rule added');
      setMbPattern('');
      invalidate();
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed to add rule'),
  });

  const filtered = useMemo(() => {
    let arr = (rules ?? []).filter(r => {
      if (typeFilter !== 'all' && r.access_type !== typeFilter) return false;
      if (search && !r.sender_pattern.toLowerCase().includes(search.toLowerCase()) && !r.owner.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
    arr = [...arr].sort((a, b) => {
      const cmp = a.sender_pattern.localeCompare(b.sender_pattern);
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [rules, typeFilter, search, sortDir]);

  const allowCount = (rules ?? []).filter(r => r.access_type === 'allow').length;
  const blockCount = (rules ?? []).filter(r => r.access_type === 'block').length;

  return (
    <div className="space-y-6">
      {/* ── Global Rules ─────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/60 flex items-center gap-2">
          <Globe size={16} className="text-violet-500" />
          <h3 className="text-sm font-bold text-slate-800">Global Rules</h3>
          <span className="ml-auto text-[10px] text-slate-400">Apply server-wide to all mailboxes</span>
        </div>

        {/* Add form */}
        <div className="px-6 py-4 border-b border-slate-100 bg-violet-50/30">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3">Add Global Rule</p>
          <div className="flex flex-col md:flex-row gap-3">
            <input
              className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-mono outline-none focus:ring-2 focus:ring-violet-500/20 bg-white"
              placeholder="sender@domain.com or @domain.com"
              value={globalPattern}
              onChange={e => setGlobalPattern(e.target.value)}
            />
            <div className="flex gap-1 bg-slate-100 p-1 rounded-xl shrink-0">
              {(['block', 'allow'] as const).map(v => (
                <button
                  key={v}
                  onClick={() => setGlobalType(v)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${globalType === v ? (v === 'block' ? 'bg-red-600 text-white shadow-sm' : 'bg-emerald-600 text-white shadow-sm') : 'text-slate-500 hover:text-slate-700'}`}
                >
                  {v === 'allow' ? 'Allow' : 'Block'}
                </button>
              ))}
            </div>
            <input
              className="w-48 px-4 py-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-violet-500/20 bg-white"
              placeholder="Note (optional)"
              value={globalNote}
              onChange={e => setGlobalNote(e.target.value)}
            />
            <button
              onClick={() => addGlobalMutation.mutate({
                senderPattern: globalPattern.trim(),
                accessType: globalType,
                note: globalNote.trim() || undefined,
              })}
              disabled={!globalPattern.trim() || addGlobalMutation.isPending}
              className="flex items-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl font-bold text-sm transition-all disabled:opacity-50"
            >
              <Plus size={14} /> {addGlobalMutation.isPending ? 'Saving…' : 'Add'}
            </button>
          </div>
        </div>

        {/* Global rules list */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
              <tr>
                <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-wider">Type</th>
                <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-wider">Pattern</th>
                <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-wider">Note</th>
                <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-wider">Added</th>
                <th className="px-6 py-3 text-right text-[10px] font-bold uppercase tracking-wider"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isGLoading ? (
                <tr><td colSpan={5} className="px-6 py-6 text-center text-slate-400">Loading…</td></tr>
              ) : (globalRules ?? []).length === 0 ? (
                <tr><td colSpan={5}><EmptyState icon={Globe} text="No global rules yet. Add one above to block or allow patterns server-wide." /></td></tr>
              ) : (globalRules ?? []).map(r => (
                <tr key={r.id} className="hover:bg-slate-50/60 transition-colors">
                  <td className="px-6 py-3"><RuleBadge type={r.access_type} /></td>
                  <td className="px-6 py-3 font-mono text-xs font-bold text-slate-800">{r.sender_pattern}</td>
                  <td className="px-6 py-3 text-xs text-slate-500 italic">{r.note ?? '—'}</td>
                  <td className="px-6 py-3 text-[11px] text-slate-400">{new Date(r.created_at).toLocaleDateString()}</td>
                  <td className="px-6 py-3 text-right">
                    <button
                      onClick={() => { if (window.confirm(`Delete global rule for ${r.sender_pattern}?`)) deleteGlobalMutation.mutate(r.id); }}
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

      {/* ── Per-mailbox rules ─────────────────────────────────────────────── */}
      <div className="space-y-4">
        {/* Add per-mailbox rule form */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/60 flex items-center gap-2">
            <Filter size={15} className="text-orange-500" />
            <h3 className="text-sm font-bold text-slate-800">Add Rule for a Mailbox</h3>
          </div>
          <div className="px-6 py-4">
            <div className="flex flex-col md:flex-row gap-3">
              <select
                className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none bg-white focus:ring-2 focus:ring-orange-500/20"
                value={mbMailboxId}
                onChange={e => setMbMailboxId(e.target.value)}
              >
                <option value="">Select mailbox…</option>
                {(allMailboxes ?? []).map(m => (
                  <option key={m.id} value={m.id}>{m.email} ({m.owner})</option>
                ))}
              </select>
              <input
                className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-mono outline-none focus:ring-2 focus:ring-orange-500/20"
                placeholder="sender@domain.com or @domain.com"
                value={mbPattern}
                onChange={e => setMbPattern(e.target.value)}
              />
              <div className="flex gap-1 bg-slate-100 p-1 rounded-xl shrink-0">
                {(['allow', 'block'] as const).map(v => (
                  <button
                    key={v}
                    onClick={() => setMbType(v)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${mbType === v ? (v === 'allow' ? 'bg-emerald-600 text-white shadow-sm' : 'bg-red-600 text-white shadow-sm') : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    {v === 'allow' ? 'Allow' : 'Block'}
                  </button>
                ))}
              </div>
              <button
                onClick={() => addMailboxRuleMutation.mutate({
                  mailUserId: parseInt(mbMailboxId, 10),
                  senderPattern: mbPattern.trim(),
                  accessType: mbType,
                })}
                disabled={!mbMailboxId || !mbPattern.trim() || addMailboxRuleMutation.isPending}
                className="flex items-center gap-2 px-4 py-2.5 bg-orange-600 hover:bg-orange-700 text-white rounded-xl font-bold text-sm transition-all disabled:opacity-50"
              >
                <Plus size={14} /> {addMailboxRuleMutation.isPending ? 'Saving…' : 'Add'}
              </button>
            </div>
          </div>
        </div>

        {/* Summary chips */}
        <div className="flex gap-3">
          <div className="flex items-center gap-2 px-4 py-2 bg-emerald-50 border border-emerald-200 rounded-xl">
            <UserCheck size={14} className="text-emerald-600" />
            <span className="text-xs font-bold text-emerald-700">{allowCount} user whitelist rules</span>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 bg-red-50 border border-red-200 rounded-xl">
            <UserX size={14} className="text-red-600" />
            <span className="text-xs font-bold text-red-700">{blockCount} user blacklist rules</span>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-orange-500/20"
              placeholder="Search pattern or owner…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
            {(['all', 'allow', 'block'] as const).map(v => (
              <button
                key={v}
                onClick={() => setTypeFilter(v)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${typeFilter === v ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                {v === 'all' ? 'All' : v === 'allow' ? 'Whitelist' : 'Blacklist'}
              </button>
            ))}
          </div>
          <button
            onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')}
            className="flex items-center gap-2 px-3 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-500 hover:text-slate-700 hover:bg-slate-50"
            title="Toggle sort direction"
          >
            <ArrowUpDown size={14} />
            {sortDir === 'asc' ? 'A→Z' : 'Z→A'}
          </button>
        </div>

        <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">
          {filtered.length} user rules
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
                <tr>
                  <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-wider">Type</th>
                  <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-wider">Pattern</th>
                  <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-wider">Mailbox</th>
                  <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-wider">Owner</th>
                  <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-wider">Domain</th>
                  <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-wider">Added</th>
                  <th className="px-6 py-3 text-right text-[10px] font-bold uppercase tracking-wider"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoading ? (
                  <tr><td colSpan={7} className="px-6 py-10 text-center text-slate-400">Loading…</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={7}><EmptyState icon={Filter} text="No per-mailbox rules match your filter." /></td></tr>
                ) : filtered.map(r => (
                  <tr key={r.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="px-6 py-4"><RuleBadge type={r.access_type} /></td>
                    <td className="px-6 py-4 font-mono text-xs font-bold text-slate-800">{r.sender_pattern}</td>
                    <td className="px-6 py-4 text-[11px] text-slate-500 font-mono">{r.mailbox_email}</td>
                    <td className="px-6 py-4">
                      <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-bold">{r.owner}</span>
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-500">{r.domain_name}</td>
                    <td className="px-6 py-4 text-[11px] text-slate-400">{new Date(r.created_at).toLocaleDateString()}</td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => { if (window.confirm(`Delete rule for ${r.sender_pattern}?`)) deleteMutation.mutate(r.id); }}
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
      </div>
    </div>
  );
};

// ── Shared sub-components ──────────────────────────────────────────────────────

const StatCard: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string;
  color: string;
  sub?: string;
}> = ({ icon, label, value, color, sub }) => (
  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex items-start gap-4">
    <div className={`p-3 rounded-xl bg-${color}-50 text-${color}-600 shrink-0`}>{icon}</div>
    <div className="min-w-0">
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest truncate">{label}</p>
      <p className="text-xl font-bold text-slate-900 mt-0.5">{value}</p>
      {sub && <p className="text-[10px] text-slate-400 mt-0.5">{sub}</p>}
    </div>
  </div>
);

const LoadingGrid: React.FC = () => (
  <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
    {Array.from({ length: 5 }).map((_, i) => (
      <div key={i} className="h-24 bg-slate-100 rounded-2xl animate-pulse" />
    ))}
  </div>
);

export default AdminSpam;
