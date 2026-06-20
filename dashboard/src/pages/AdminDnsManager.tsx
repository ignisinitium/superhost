import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import api from '../api/client';
import {
  Globe, Plus, Trash2, Edit2, User, Shield,
  ChevronRight, Server, Search, Copy, CheckCheck,
  Layers, AlertCircle, CheckCircle2, Loader2, XCircle, History, ChevronDown
} from 'lucide-react';
import toast from 'react-hot-toast';
import type { DnsZone, DnsRecord, DnsSyncTask } from '../../../shared/types';
import { validateRecord, hasErrors, type DnsFieldErrors } from '../lib/dnsValidation';
import { DNS_TEMPLATES, type DnsTemplate, type TemplateRecord } from '../lib/dnsTemplates';

// ── Record type metadata (same as client page) ────────────────────────────────
const RECORD_TYPES = ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'SRV', 'CAA'] as const;
type RecordType = typeof RECORD_TYPES[number];

const TYPE_META: Record<RecordType, { color: string; badge: string; placeholder: string; hint: string }> = {
  A:     { color: 'bg-blue-50 text-blue-700 border-blue-100',       badge: 'bg-blue-600',    placeholder: '203.0.113.10',              hint: 'IPv4 address' },
  AAAA:  { color: 'bg-violet-50 text-violet-700 border-violet-100', badge: 'bg-violet-600',  placeholder: '2001:db8::1',               hint: 'IPv6 address' },
  CNAME: { color: 'bg-cyan-50 text-cyan-700 border-cyan-100',       badge: 'bg-cyan-600',    placeholder: 'target.example.com.',       hint: 'Canonical hostname' },
  MX:    { color: 'bg-orange-50 text-orange-700 border-orange-100', badge: 'bg-orange-500',  placeholder: 'mail.example.com.',         hint: 'Mail server hostname' },
  TXT:   { color: 'bg-emerald-50 text-emerald-700 border-emerald-100', badge: 'bg-emerald-600', placeholder: 'v=spf1 include:... ~all', hint: 'SPF, DKIM, verification' },
  NS:    { color: 'bg-slate-100 text-slate-600 border-slate-200',   badge: 'bg-slate-500',   placeholder: 'ns1.example.com.',          hint: 'Nameserver' },
  SRV:   { color: 'bg-pink-50 text-pink-700 border-pink-100',       badge: 'bg-pink-600',    placeholder: '10 5060 sip.example.com.',  hint: 'weight port target' },
  CAA:   { color: 'bg-amber-50 text-amber-700 border-amber-100',    badge: 'bg-amber-600',   placeholder: '0 issue "letsencrypt.org"', hint: 'CA Authorization' },
};


function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(value).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
  };
  return (
    <button onClick={copy} className="p-1 text-slate-300 hover:text-slate-500 transition-colors" title="Copy">
      {copied ? <CheckCheck size={12} className="text-emerald-500" /> : <Copy size={12} />}
    </button>
  );
}

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const secs = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (secs < 5) return 'just now';
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

const SYNC_META: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
  completed:  { label: 'Synced',     cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: <CheckCircle2 size={12} /> },
  failed:     { label: 'Sync failed', cls: 'bg-red-50 text-red-700 border-red-200',            icon: <XCircle size={12} /> },
  processing: { label: 'Syncing…',   cls: 'bg-amber-50 text-amber-700 border-amber-200',       icon: <Loader2 size={12} className="animate-spin" /> },
  pending:    { label: 'Queued…',    cls: 'bg-amber-50 text-amber-700 border-amber-200',       icon: <Loader2 size={12} className="animate-spin" /> },
};

// ── Component ─────────────────────────────────────────────────────────────────
const AdminDnsManager: React.FC = () => {
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();

  const [selectedZone, setSelectedZone] = useState<(DnsZone & { username?: string }) | null>(null);
  // Pre-populate search from ?user=username query param (linked from UserSettings)
  const [zoneSearch, setZoneSearch]     = useState(searchParams.get('user') ?? '');

  // Zone modal
  const [isZoneModalOpen, setIsZoneModalOpen] = useState(false);
  const [newUserId, setNewUserId]   = useState('');
  const [newDomain, setNewDomain]   = useState('');
  const [newTtl, setNewTtl]         = useState('3600');

  // Record modal
  const [isRecordModalOpen, setIsRecordModalOpen] = useState(false);
  const [editingRecord, setEditingRecord]         = useState<DnsRecord | null>(null);
  const [rName, setRName]       = useState('@');
  const [rType, setRType]       = useState<RecordType>('A');
  const [rContent, setRContent] = useState('');
  const [rPriority, setRPriority] = useState('10');
  const [rTtl, setRTtl]         = useState('3600');
  const [showErrors, setShowErrors] = useState(false);

  // Template modal
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [activeTemplate, setActiveTemplate] = useState<DnsTemplate | null>(null);
  const [templateVals, setTemplateVals] = useState<Record<string, string>>({});

  // Sync history panel
  const [showHistory, setShowHistory] = useState(false);

  // ── Data ──────────────────────────────────────────────────────────────────
  const { data: zones = [], isLoading: isLoadingZones } = useQuery<(DnsZone & { username?: string })[]>({
    queryKey: ['adminDnsZones'],
    queryFn: async () => (await api.get('/admin/dns/zones')).data,
  });

  const { data: users = [] } = useQuery<{ id: number; username: string }[]>({
    queryKey: ['users'],
    queryFn: async () => (await api.get('/users')).data,
  });

  const { data: records = [], isLoading: isLoadingRecords } = useQuery<DnsRecord[]>({
    queryKey: ['adminDnsRecords', selectedZone?.id],
    queryFn: async () => {
      if (!selectedZone) return [];
      return (await api.get(`/admin/dns/zones/${selectedZone.id}/records`)).data;
    },
    enabled: !!selectedZone,
  });

  // Sync status / history — polls while a sync is still pending or processing.
  const { data: syncTasks = [] } = useQuery<DnsSyncTask[]>({
    queryKey: ['adminDnsSync', selectedZone?.id],
    queryFn: async () => {
      if (!selectedZone) return [];
      return (await api.get(`/admin/dns/zones/${selectedZone.id}/sync-status`)).data;
    },
    enabled: !!selectedZone,
    refetchInterval: (q) => {
      const latest = (q.state.data as DnsSyncTask[] | undefined)?.[0];
      return latest && (latest.status === 'pending' || latest.status === 'processing') ? 2000 : false;
    },
  });
  const latestSync = syncTasks[0] ?? null;

  const refreshAfterSync = () => {
    queryClient.invalidateQueries({ queryKey: ['adminDnsRecords', selectedZone?.id] });
    queryClient.invalidateQueries({ queryKey: ['adminDnsSync', selectedZone?.id] });
  };

  // ── Mutations ─────────────────────────────────────────────────────────────
  const addZoneMutation = useMutation({
    mutationFn: async () => (await api.post('/admin/dns/zones', {
      userId: newUserId ? parseInt(newUserId) : null,
      domainName: newDomain,
      ttl: parseInt(newTtl) || 3600,
    })).data,
    onSuccess: () => {
      toast.success('DNS zone created!');
      setIsZoneModalOpen(false);
      setNewDomain(''); setNewUserId(''); setNewTtl('3600');
      queryClient.invalidateQueries({ queryKey: ['adminDnsZones'] });
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to create zone'),
  });

  const deleteZoneMutation = useMutation({
    mutationFn: async (id: number) => (await api.delete(`/admin/dns/zones/${id}`)).data,
    onSuccess: (_, id) => {
      toast.success('DNS zone deleted');
      if (selectedZone?.id === id) setSelectedZone(null);
      queryClient.invalidateQueries({ queryKey: ['adminDnsZones'] });
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to delete zone'),
  });

  const saveRecordMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: rName || '@',
        type: rType,
        content: rContent,
        priority: (rType === 'MX' || rType === 'SRV') ? parseInt(rPriority) : null,
        ttl: parseInt(rTtl) || 3600,
      };
      if (editingRecord) {
        return (await api.put(`/admin/dns/zones/${selectedZone?.id}/records/${editingRecord.id}`, payload)).data;
      }
      return (await api.post(`/admin/dns/zones/${selectedZone?.id}/records`, payload)).data;
    },
    onSuccess: () => {
      toast.success(editingRecord ? 'Record updated — syncing…' : 'Record added — syncing…');
      closeRecordModal();
      refreshAfterSync();
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to save record'),
  });

  const deleteRecordMutation = useMutation({
    mutationFn: async (id: number) =>
      (await api.delete(`/admin/dns/zones/${selectedZone?.id}/records/${id}`)).data,
    onSuccess: () => {
      toast.success('Record deleted — syncing…');
      refreshAfterSync();
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to delete record'),
  });

  const applyTemplateMutation = useMutation({
    mutationFn: async (records: TemplateRecord[]) =>
      (await api.post(`/admin/dns/zones/${selectedZone?.id}/records/bulk`, { records })).data,
    onSuccess: (rows: DnsRecord[]) => {
      toast.success(`Added ${rows.length} record${rows.length !== 1 ? 's' : ''} — syncing…`);
      closeTemplateModal();
      refreshAfterSync();
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to apply template'),
  });

  // Auto-select the first zone when arriving via ?user= deep link
  useEffect(() => {
    const userParam = searchParams.get('user');
    if (userParam && zones.length > 0 && !selectedZone) {
      const match = zones.find(z =>
        (z.username ?? '').toLowerCase() === userParam.toLowerCase()
      );
      if (match) setSelectedZone(match);
    }
  }, [zones, searchParams]);

  // ── Helpers ───────────────────────────────────────────────────────────────
  const closeRecordModal = () => {
    setIsRecordModalOpen(false);
    setEditingRecord(null);
    setShowErrors(false);
    setRName('@'); setRType('A'); setRContent(''); setRPriority('10'); setRTtl('3600');
  };

  const openEditRecord = (r: DnsRecord) => {
    setEditingRecord(r);
    setShowErrors(false);
    setRName(r.name); setRType((r.type as RecordType) || 'A');
    setRContent(r.content); setRPriority(r.priority?.toString() ?? '10');
    setRTtl(r.ttl?.toString() ?? '3600');
    setIsRecordModalOpen(true);
  };

  const closeTemplateModal = () => {
    setIsTemplateModalOpen(false);
    setActiveTemplate(null);
    setTemplateVals({});
  };

  const openTemplate = (t: DnsTemplate) => {
    setActiveTemplate(t);
    const defaults: Record<string, string> = {};
    t.fields.forEach((f) => { defaults[f.key] = f.default ?? ''; });
    setTemplateVals(defaults);
  };

  const submitRecord = () => {
    const errs = validateRecord({ name: rName, type: rType, content: rContent, priority: needsPriority ? rPriority : null });
    if (hasErrors(errs)) { setShowErrors(true); return; }
    saveRecordMutation.mutate();
  };

  // Live validation for the record modal.
  const recordErrors: DnsFieldErrors = validateRecord({
    name: rName, type: rType, content: rContent,
    priority: (rType === 'MX' || rType === 'SRV') ? rPriority : null,
  });

  // Preview of records the active template would create (each validated).
  const templatePreview: (TemplateRecord & { error?: string })[] = activeTemplate && selectedZone
    ? activeTemplate.build(templateVals, { domain: selectedZone.domain_name }).map((r) => {
        const e = validateRecord({ name: r.name, type: r.type, content: r.content, priority: r.priority });
        const msg = e.name || e.content || e.priority;
        return msg ? { ...r, error: msg } : { ...r };
      })
    : [];
  const templateHasErrors = templatePreview.some((r) => r.error) || templatePreview.length === 0;

  const filtered = zones.filter(z =>
    z.domain_name.toLowerCase().includes(zoneSearch.toLowerCase()) ||
    (z.username ?? '').toLowerCase().includes(zoneSearch.toLowerCase())
  );

  const grouped = RECORD_TYPES.reduce<Record<string, DnsRecord[]>>((acc, t) => {
    const recs = records.filter(r => r.type === t);
    if (recs.length) acc[t] = recs;
    return acc;
  }, {});

  const needsPriority = rType === 'MX' || rType === 'SRV';

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-3">
            <Globe className="text-indigo-600" size={26} />
            System DNS Manager
          </h1>
          <p className="text-slate-500 mt-1">Manage all DNS zones and records across all hosted accounts.</p>
        </div>
        <button
          onClick={() => setIsZoneModalOpen(true)}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl font-bold transition-all shadow-md shadow-indigo-900/10 flex items-center gap-2 text-sm"
        >
          <Plus size={18} />
          Add Zone
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sidebar — zone list */}
        <div className="lg:col-span-1">
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="p-3 border-b border-slate-100">
              <div className="relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search zones…"
                  value={zoneSearch}
                  onChange={(e) => setZoneSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>
            </div>
            <div className="p-2 space-y-0.5 max-h-[60vh] overflow-y-auto">
              {isLoadingZones ? (
                <div className="p-4 text-center text-slate-400 text-xs italic">Loading…</div>
              ) : filtered.length === 0 ? (
                <div className="p-4 text-center text-slate-400 text-xs italic">No zones found.</div>
              ) : (
                filtered.map(zone => {
                  const isActive = selectedZone?.id === zone.id;
                  return (
                    <button
                      key={zone.id}
                      onClick={() => setSelectedZone(zone)}
                      className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-left transition-all ${
                        isActive
                          ? 'bg-indigo-50 border border-indigo-100'
                          : 'hover:bg-slate-50 border border-transparent'
                      }`}
                    >
                      <Globe size={13} className={isActive ? 'text-indigo-500' : 'text-slate-300'} />
                      <div className="flex-1 min-w-0">
                        <div className={`text-xs font-semibold truncate ${isActive ? 'text-indigo-700' : 'text-slate-700'}`}>
                          {zone.domain_name}
                        </div>
                        <div className="text-[10px] text-slate-400 truncate">
                          {zone.username ?? 'System'}
                        </div>
                      </div>
                      <ChevronRight size={13} className={isActive ? 'text-indigo-400' : 'text-slate-200'} />
                    </button>
                  );
                })
              )}
            </div>
            <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50/50">
              <span className="text-[10px] text-slate-400">{zones.length} zone{zones.length !== 1 ? 's' : ''} total</span>
            </div>
          </div>
        </div>

        {/* Main panel — records */}
        <div className="lg:col-span-3">
          {!selectedZone ? (
            <div className="min-h-[400px] flex flex-col items-center justify-center bg-white border-2 border-dashed border-slate-200 rounded-2xl p-12 text-center">
              <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-300 mb-4">
                <Shield size={32} />
              </div>
              <h3 className="text-base font-bold text-slate-700">Select a Zone</h3>
              <p className="text-sm text-slate-400 max-w-xs mt-2">
                Pick a DNS zone from the sidebar to view and manage its records.
              </p>
            </div>
          ) : (
            <div className="space-y-4 animate-in fade-in duration-300">
              {/* Zone header */}
              <div className="bg-white border border-slate-200 rounded-2xl px-6 py-4 shadow-sm flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-slate-800">{selectedZone.domain_name}</h2>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="flex items-center gap-1 text-[11px] text-slate-400">
                      <User size={11} />
                      {selectedZone.username ?? 'System (Root)'}
                    </span>
                    <span className="text-slate-200">|</span>
                    <span className="text-[11px] text-slate-400">TTL: <strong>{selectedZone.ttl}s</strong></span>
                    <span className="text-slate-200">|</span>
                    <span className="text-[11px] text-slate-400"><strong>{records.length}</strong> record{records.length !== 1 ? 's' : ''}</span>
                    {latestSync && (() => {
                      const meta = SYNC_META[latestSync.status] ?? SYNC_META.pending!;
                      return (
                        <>
                          <span className="text-slate-200">|</span>
                          <button
                            onClick={() => setShowHistory((s) => !s)}
                            className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-bold ${meta.cls}`}
                            title="View sync history"
                          >
                            {meta.icon}
                            {meta.label}
                            <span className="font-normal opacity-70">· {timeAgo(latestSync.updated_at)}</span>
                          </button>
                        </>
                      );
                    })()}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setIsTemplateModalOpen(true)}
                    className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-xl font-bold text-sm flex items-center gap-2 transition-all"
                  >
                    <Layers size={14} className="text-indigo-500" />
                    Templates
                  </button>
                  <button
                    onClick={() => { closeRecordModal(); setIsRecordModalOpen(true); }}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl font-bold text-sm flex items-center gap-2 transition-all shadow-sm"
                  >
                    <Plus size={14} />
                    Add Record
                  </button>
                  <button
                    onClick={() => {
                      if (window.confirm(`Permanently delete zone "${selectedZone.domain_name}" and all its records?`)) {
                        deleteZoneMutation.mutate(selectedZone.id);
                      }
                    }}
                    disabled={deleteZoneMutation.isPending}
                    className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all border border-slate-200"
                    title="Delete zone"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>

              {/* Persistent error banner when the most recent sync failed */}
              {latestSync?.status === 'failed' && (
                <div className="bg-red-50 border border-red-200 rounded-2xl px-5 py-3 flex items-start gap-3">
                  <XCircle size={16} className="text-red-500 mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-red-700">Last DNS sync failed</p>
                    <p className="text-xs text-red-600 font-mono break-words mt-0.5">
                      {latestSync.error_message || 'No error detail reported.'}
                    </p>
                    <p className="text-[11px] text-red-400 mt-1">
                      The zone file on the server may not reflect these records until a sync succeeds. Fix the offending record and save again to retry.
                    </p>
                  </div>
                </div>
              )}

              {/* Sync history panel */}
              {showHistory && (
                <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                  <div className="px-5 py-3 bg-slate-50/70 border-b border-slate-100 flex items-center gap-2">
                    <History size={13} className="text-slate-400" />
                    <span className="text-xs font-bold text-slate-600 uppercase tracking-widest">Sync History</span>
                    <button onClick={() => setShowHistory(false)} className="ml-auto text-slate-300 hover:text-slate-500">
                      <ChevronDown size={15} />
                    </button>
                  </div>
                  {syncTasks.length === 0 ? (
                    <div className="px-5 py-4 text-xs text-slate-400 italic">No sync activity recorded yet.</div>
                  ) : (
                    <ul className="divide-y divide-slate-50">
                      {syncTasks.map((t) => {
                        const meta = SYNC_META[t.status] ?? SYNC_META.pending!;
                        return (
                          <li key={t.id} className="px-5 py-2.5 flex items-center gap-3">
                            <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-bold ${meta.cls}`}>
                              {meta.icon}{meta.label}
                            </span>
                            <span className="text-[11px] text-slate-400">{timeAgo(t.updated_at)}</span>
                            {t.status === 'failed' && t.error_message && (
                              <span className="text-[11px] text-red-500 font-mono truncate" title={t.error_message}>{t.error_message}</span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              )}

              {/* Records */}
              {isLoadingRecords ? (
                <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-slate-400 italic">Loading records…</div>
              ) : records.length === 0 ? (
                <div className="bg-white border-2 border-dashed border-slate-200 rounded-2xl p-12 text-center">
                  <Server size={28} className="text-slate-300 mx-auto mb-3" />
                  <p className="text-slate-400 text-sm italic">No records yet. Click <strong>Add Record</strong> to get started.</p>
                </div>
              ) : (
                Object.entries(grouped).map(([recordType, recs]) => {
                  const meta = TYPE_META[recordType as RecordType];
                  return (
                    <div key={recordType} className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                      <div className="px-5 py-3 bg-slate-50/70 border-b border-slate-100 flex items-center gap-2.5">
                        <span className={`w-2 h-2 rounded-full ${meta?.badge ?? 'bg-slate-400'}`} />
                        <span className="text-xs font-bold text-slate-600 uppercase tracking-widest">{recordType}</span>
                        <span className="text-[10px] text-slate-400">{meta?.hint}</span>
                        <span className="ml-auto text-[10px] font-bold text-slate-400">{recs.length}</span>
                      </div>
                      <table className="w-full text-left text-sm">
                        <thead className="border-b border-slate-100 bg-slate-50/30">
                          <tr className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                            <th className="px-5 py-2.5">Name</th>
                            {(recordType === 'MX' || recordType === 'SRV') && <th className="px-5 py-2.5">Prio</th>}
                            <th className="px-5 py-2.5">Value</th>
                            <th className="px-5 py-2.5">TTL</th>
                            <th className="px-5 py-2.5 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {recs.map(record => (
                            <tr key={record.id} className="group hover:bg-slate-50/50 transition-colors">
                              <td className="px-5 py-3 font-mono text-xs font-semibold text-slate-700">{record.name}</td>
                              {(recordType === 'MX' || recordType === 'SRV') && (
                                <td className="px-5 py-3 text-xs font-bold text-amber-600">{record.priority ?? '—'}</td>
                              )}
                              <td className="px-5 py-3 font-mono text-xs text-slate-600 max-w-xs">
                                <div className="flex items-center gap-1">
                                  <span className="truncate">{record.content}</span>
                                  <CopyButton value={record.content} />
                                </div>
                              </td>
                              <td className="px-5 py-3 text-[11px] text-slate-400">{record.ttl ? `${record.ttl}s` : 'Default'}</td>
                              <td className="px-5 py-3 text-right">
                                <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button onClick={() => openEditRecord(record)} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all">
                                    <Edit2 size={13} />
                                  </button>
                                  <button
                                    onClick={() => { if (window.confirm(`Delete ${record.type} record "${record.name}"?`)) deleteRecordMutation.mutate(record.id); }}
                                    className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Modal: Add Zone ───────────────────────────────────────────────── */}
      {isZoneModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
                <Globe size={16} className="text-indigo-600" /> Add DNS Zone
              </h2>
              <button onClick={() => setIsZoneModalOpen(false)} className="text-slate-400 hover:text-slate-600 text-xl leading-none">✕</button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); addZoneMutation.mutate(); }} className="p-6 space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Owner</label>
                <select className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-sm" value={newUserId} onChange={(e) => setNewUserId(e.target.value)}>
                  <option value="">System (No Owner)</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.username}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Domain Name</label>
                <div className="relative">
                  <Globe className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                  <input type="text" className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pl-10 pr-4 text-sm font-mono" value={newDomain} onChange={(e) => setNewDomain(e.target.value)} placeholder="example.com" required />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Default TTL</label>
                <select className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-sm" value={newTtl} onChange={(e) => setNewTtl(e.target.value)}>
                  <option value="300">300s (5 min)</option>
                  <option value="3600">3600s (1 hr)</option>
                  <option value="86400">86400s (1 day)</option>
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setIsZoneModalOpen(false)} className="flex-1 py-3 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 text-sm transition-all">Cancel</button>
                <button type="submit" disabled={addZoneMutation.isPending} className="flex-1 py-3 rounded-xl font-bold text-white bg-indigo-600 hover:bg-indigo-700 text-sm transition-all shadow-md disabled:opacity-50">
                  {addZoneMutation.isPending ? 'Creating…' : 'Add Zone'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal: Add / Edit Record ─────────────────────────────────────── */}
      {isRecordModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
                {editingRecord ? <Edit2 size={15} className="text-indigo-600" /> : <Plus size={15} className="text-indigo-600" />}
                {editingRecord ? 'Edit Record' : 'Add Record'} — {selectedZone?.domain_name}
              </h2>
              <button onClick={closeRecordModal} className="text-slate-400 hover:text-slate-600 text-xl leading-none">✕</button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); submitRecord(); }} className="p-6 space-y-4">
              {/* Type */}
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Record Type</label>
                <div className="flex flex-wrap gap-2">
                  {RECORD_TYPES.map(t => {
                    const meta = TYPE_META[t];
                    return (
                      <button key={t} type="button" onClick={() => setRType(t)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${rType === t ? meta.color + ' shadow-sm' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
                        {t}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11px] text-slate-400 ml-1">{TYPE_META[rType].hint}</p>
              </div>

              {/* Name + TTL */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Name / Host</label>
                  <input type="text" className={`w-full bg-slate-50 border rounded-xl py-3 px-4 text-sm font-mono focus:ring-2 focus:ring-indigo-500/30 outline-none ${showErrors && recordErrors.name ? 'border-red-300' : 'border-slate-200'}`}
                    value={rName} onChange={(e) => setRName(e.target.value)} placeholder="@ or www" />
                  {showErrors && recordErrors.name && (
                    <p className="text-[11px] text-red-500 flex items-center gap-1 ml-1"><AlertCircle size={11} />{recordErrors.name}</p>
                  )}
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">TTL</label>
                  <select className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-sm focus:ring-2 focus:ring-indigo-500/30 outline-none"
                    value={rTtl} onChange={(e) => setRTtl(e.target.value)}>
                    <option value="300">300s (5 min)</option>
                    <option value="900">900s (15 min)</option>
                    <option value="3600">3600s (1 hr)</option>
                    <option value="86400">86400s (1 day)</option>
                  </select>
                </div>
              </div>

              {/* Content */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Value / Content</label>
                <input type="text" className={`w-full bg-slate-50 border rounded-xl py-3 px-4 text-sm font-mono focus:ring-2 focus:ring-indigo-500/30 outline-none ${showErrors && recordErrors.content ? 'border-red-300' : 'border-slate-200'}`}
                  value={rContent} onChange={(e) => setRContent(e.target.value)} placeholder={TYPE_META[rType].placeholder} />
                {showErrors && recordErrors.content && (
                  <p className="text-[11px] text-red-500 flex items-center gap-1 ml-1"><AlertCircle size={11} />{recordErrors.content}</p>
                )}
              </div>

              {/* Priority */}
              {needsPriority && (
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Priority</label>
                  <input type="number" min="0" className={`w-full bg-slate-50 border rounded-xl py-3 px-4 text-sm focus:ring-2 focus:ring-indigo-500/30 outline-none ${showErrors && recordErrors.priority ? 'border-red-300' : 'border-slate-200'}`}
                    value={rPriority} onChange={(e) => setRPriority(e.target.value)} placeholder="10" />
                  {showErrors && recordErrors.priority && (
                    <p className="text-[11px] text-red-500 flex items-center gap-1 ml-1"><AlertCircle size={11} />{recordErrors.priority}</p>
                  )}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={closeRecordModal} className="flex-1 py-3 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 text-sm transition-all">Cancel</button>
                <button type="submit" disabled={saveRecordMutation.isPending} className="flex-1 py-3 rounded-xl font-bold text-white bg-indigo-600 hover:bg-indigo-700 text-sm transition-all shadow-md disabled:opacity-50">
                  {saveRecordMutation.isPending ? 'Saving…' : editingRecord ? 'Update Record' : 'Add Record'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal: Templates / Presets ───────────────────────────────────── */}
      {isTemplateModalOpen && selectedZone && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between shrink-0">
              <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
                <Layers size={16} className="text-indigo-600" />
                {activeTemplate ? activeTemplate.name : 'Record Templates'} — {selectedZone.domain_name}
              </h2>
              <button onClick={closeTemplateModal} className="text-slate-400 hover:text-slate-600 text-xl leading-none">✕</button>
            </div>

            {!activeTemplate ? (
              // Template picker
              <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-3 overflow-y-auto">
                {DNS_TEMPLATES.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => openTemplate(t)}
                    className="text-left p-4 rounded-xl border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/40 transition-all group"
                  >
                    <div className="flex items-center gap-2">
                      <Layers size={14} className="text-indigo-500" />
                      <span className="text-sm font-bold text-slate-700 group-hover:text-indigo-700">{t.name}</span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1.5 leading-relaxed">{t.description}</p>
                  </button>
                ))}
              </div>
            ) : (
              // Template detail: fields + preview
              <div className="p-6 space-y-5 overflow-y-auto">
                {activeTemplate.fields.length > 0 && (
                  <div className="space-y-3">
                    {activeTemplate.fields.map((f) => (
                      <div key={f.key} className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">
                          {f.label}{f.optional && <span className="text-slate-300 normal-case font-normal"> (optional)</span>}
                        </label>
                        <input
                          type="text"
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-4 text-sm font-mono focus:ring-2 focus:ring-indigo-500/30 outline-none"
                          value={templateVals[f.key] ?? ''}
                          onChange={(e) => setTemplateVals((v) => ({ ...v, [f.key]: e.target.value }))}
                          placeholder={f.placeholder}
                        />
                        {f.hint && <p className="text-[11px] text-slate-400 ml-1">{f.hint}</p>}
                      </div>
                    ))}
                  </div>
                )}

                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">
                    Will add {templatePreview.length} record{templatePreview.length !== 1 ? 's' : ''}
                  </p>
                  <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-50">
                    {templatePreview.map((r, i) => (
                      <div key={i} className="px-4 py-2 flex items-center gap-3 text-xs">
                        <span className="font-mono font-bold text-slate-600 w-10 shrink-0">{r.type}</span>
                        <span className="font-mono text-slate-500 w-28 truncate shrink-0">{r.name}</span>
                        {(r.type === 'MX' || r.type === 'SRV') && (
                          <span className="text-amber-600 font-bold w-6 shrink-0">{r.priority}</span>
                        )}
                        <span className="font-mono text-slate-600 truncate flex-1">{r.content || <em className="text-slate-300 not-italic">— fill fields above —</em>}</span>
                        {r.error && <span title={r.error}><AlertCircle size={13} className="text-red-400 shrink-0" /></span>}
                      </div>
                    ))}
                  </div>
                  {templatePreview.some((r) => r.error) && (
                    <p className="text-[11px] text-red-500 flex items-center gap-1 ml-1"><AlertCircle size={11} />Fill in the fields above to produce valid records.</p>
                  )}
                  <p className="text-[11px] text-slate-400 ml-1">These are added to existing records — they don't replace anything. Duplicates may need manual cleanup.</p>
                </div>

                <div className="flex gap-3 pt-1">
                  <button type="button" onClick={() => setActiveTemplate(null)} className="flex-1 py-3 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 text-sm transition-all">
                    Back
                  </button>
                  <button
                    type="button"
                    disabled={templateHasErrors || applyTemplateMutation.isPending}
                    onClick={() => applyTemplateMutation.mutate(templatePreview.map((r) => ({ name: r.name, type: r.type, content: r.content, priority: r.priority, ttl: r.ttl })))}
                    className="flex-1 py-3 rounded-xl font-bold text-white bg-indigo-600 hover:bg-indigo-700 text-sm transition-all shadow-md disabled:opacity-50"
                  >
                    {applyTemplateMutation.isPending ? 'Applying…' : `Apply ${templatePreview.length} Record${templatePreview.length !== 1 ? 's' : ''}`}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDnsManager;
