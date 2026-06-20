import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import { Globe, Plus, Trash2, Edit2, Copy, CheckCheck, ChevronRight, Server, Layers, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import type { DnsZone, DnsRecord } from '../../../shared/types';
import { validateRecord, hasErrors, type DnsFieldErrors } from '../lib/dnsValidation';
import { DNS_TEMPLATES, type DnsTemplate, type TemplateRecord } from '../lib/dnsTemplates';

// ── Record type metadata ──────────────────────────────────────────────────────
const RECORD_TYPES = ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'SRV', 'CAA'] as const;
type RecordType = typeof RECORD_TYPES[number];

const TYPE_META: Record<RecordType, { color: string; badge: string; placeholder: string; hint: string }> = {
  A:     { color: 'bg-blue-50 text-blue-700 border-blue-100',    badge: 'bg-blue-600',    placeholder: '203.0.113.10',              hint: 'IPv4 address' },
  AAAA:  { color: 'bg-violet-50 text-violet-700 border-violet-100', badge: 'bg-violet-600', placeholder: '2001:db8::1',              hint: 'IPv6 address' },
  CNAME: { color: 'bg-cyan-50 text-cyan-700 border-cyan-100',    badge: 'bg-cyan-600',    placeholder: 'target.example.com.',      hint: 'Canonical hostname (include trailing dot)' },
  MX:    { color: 'bg-orange-50 text-orange-700 border-orange-100', badge: 'bg-orange-500', placeholder: 'mail.example.com.',       hint: 'Mail server hostname — set Priority below' },
  TXT:   { color: 'bg-emerald-50 text-emerald-700 border-emerald-100', badge: 'bg-emerald-600', placeholder: 'v=spf1 include:... ~all', hint: 'Arbitrary text — SPF, DKIM, verification' },
  NS:    { color: 'bg-slate-100 text-slate-600 border-slate-200', badge: 'bg-slate-500',  placeholder: 'ns1.example.com.',         hint: 'Nameserver hostname (include trailing dot)' },
  SRV:   { color: 'bg-pink-50 text-pink-700 border-pink-100',    badge: 'bg-pink-600',    placeholder: '10 5060 sip.example.com.', hint: 'weight port target — set Priority below' },
  CAA:   { color: 'bg-amber-50 text-amber-700 border-amber-100', badge: 'bg-amber-600',   placeholder: '0 issue "letsencrypt.org"', hint: 'Certificate Authority Authorization' },
};


function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <button onClick={copy} className="p-1 text-slate-300 hover:text-slate-500 transition-colors" title="Copy value">
      {copied ? <CheckCheck size={12} className="text-emerald-500" /> : <Copy size={12} />}
    </button>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────
const ClientDnsManager: React.FC = () => {
  const queryClient = useQueryClient();
  const [selectedZone, setSelectedZone] = useState<DnsZone | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<DnsRecord | null>(null);

  const [name, setName]         = useState('@');
  const [type, setType]         = useState<RecordType>('A');
  const [content, setContent]   = useState('');
  const [priority, setPriority] = useState('10');
  const [ttl, setTtl]           = useState('3600');
  const [showErrors, setShowErrors] = useState(false);

  // Template modal
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [activeTemplate, setActiveTemplate] = useState<DnsTemplate | null>(null);
  const [templateVals, setTemplateVals] = useState<Record<string, string>>({});

  // ── Data ──────────────────────────────────────────────────────────────────
  const { data: zones = [], isLoading: isLoadingZones } = useQuery<DnsZone[]>({
    queryKey: ['userDnsZones'],
    queryFn: async () => (await api.get('/client/dns/zones')).data,
  });

  const { data: records = [], isLoading: isLoadingRecords } = useQuery<DnsRecord[]>({
    queryKey: ['dnsRecords', selectedZone?.id],
    queryFn: async () => {
      if (!selectedZone) return [];
      return (await api.get(`/client/dns/zones/${selectedZone.id}/records`)).data;
    },
    enabled: !!selectedZone,
    refetchInterval: false,
  });

  // ── Mutations ─────────────────────────────────────────────────────────────
  const saveRecordMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: name || '@',
        type,
        content,
        priority: (type === 'MX' || type === 'SRV') ? parseInt(priority) : null,
        ttl: parseInt(ttl) || 3600,
      };
      if (editingRecord) {
        return (await api.put(`/client/dns/zones/${selectedZone?.id}/records/${editingRecord.id}`, payload)).data;
      }
      return (await api.post(`/client/dns/zones/${selectedZone?.id}/records`, payload)).data;
    },
    onSuccess: () => {
      toast.success(editingRecord ? 'Record updated — syncing zone…' : 'Record added — syncing zone…');
      closeModal();
      queryClient.invalidateQueries({ queryKey: ['dnsRecords', selectedZone?.id] });
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to save record'),
  });

  const deleteRecordMutation = useMutation({
    mutationFn: async (id: number) =>
      (await api.delete(`/client/dns/zones/${selectedZone?.id}/records/${id}`)).data,
    onSuccess: () => {
      toast.success('Record deleted — syncing zone…');
      queryClient.invalidateQueries({ queryKey: ['dnsRecords', selectedZone?.id] });
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to delete record'),
  });

  const applyTemplateMutation = useMutation({
    mutationFn: async (recs: TemplateRecord[]) =>
      (await api.post(`/client/dns/zones/${selectedZone?.id}/records/bulk`, { records: recs })).data,
    onSuccess: (rows: DnsRecord[]) => {
      toast.success(`Added ${rows.length} record${rows.length !== 1 ? 's' : ''} — syncing zone…`);
      closeTemplateModal();
      queryClient.invalidateQueries({ queryKey: ['dnsRecords', selectedZone?.id] });
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to apply template'),
  });

  // ── Helpers ───────────────────────────────────────────────────────────────
  const closeModal = () => {
    setIsModalOpen(false);
    setEditingRecord(null);
    setShowErrors(false);
    setName('@'); setType('A'); setContent(''); setPriority('10'); setTtl('3600');
  };

  const openAdd = () => { closeModal(); setIsModalOpen(true); };

  const openEdit = (record: DnsRecord) => {
    setEditingRecord(record);
    setShowErrors(false);
    setName(record.name);
    setType((record.type as RecordType) || 'A');
    setContent(record.content);
    setPriority(record.priority?.toString() ?? '10');
    setTtl(record.ttl?.toString() ?? '3600');
    setIsModalOpen(true);
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
    const errs = validateRecord({ name, type, content, priority: (type === 'MX' || type === 'SRV') ? priority : null });
    if (hasErrors(errs)) { setShowErrors(true); return; }
    saveRecordMutation.mutate();
  };

  // Live validation for the record modal.
  const recordErrors: DnsFieldErrors = validateRecord({
    name, type, content,
    priority: (type === 'MX' || type === 'SRV') ? priority : null,
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

  const confirmDelete = (record: DnsRecord) => {
    if (window.confirm(`Delete ${record.type} record "${record.name}"?`)) {
      deleteRecordMutation.mutate(record.id);
    }
  };

  // Group records by type for display
  const grouped = RECORD_TYPES.reduce<Record<string, DnsRecord[]>>((acc, t) => {
    const recs = records.filter(r => r.type === t);
    if (recs.length) acc[t] = recs;
    return acc;
  }, {});

  const needsPriority = type === 'MX' || type === 'SRV';

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-3">
          <Globe className="text-cyan-600" size={26} />
          DNS Zone Manager
        </h1>
        <p className="text-slate-500 mt-1">Configure DNS records for your domains. Changes sync to BIND automatically.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sidebar — zone list */}
        <div className="lg:col-span-1">
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-100">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Your Domains</span>
            </div>
            <div className="p-2 space-y-0.5">
              {isLoadingZones ? (
                <div className="p-4 text-center text-slate-400 text-xs italic">Loading…</div>
              ) : zones.length === 0 ? (
                <div className="p-4 text-center text-slate-400 text-xs italic">No domains found.</div>
              ) : (
                zones.map(zone => {
                  const isActive = selectedZone?.id === zone.id;
                  return (
                    <button
                      key={zone.id}
                      onClick={() => setSelectedZone(zone)}
                      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm transition-all ${
                        isActive
                          ? 'bg-cyan-50 text-cyan-700 border border-cyan-100'
                          : 'hover:bg-slate-50 text-slate-600 border border-transparent'
                      }`}
                    >
                      <span className="font-medium truncate">{zone.domain_name}</span>
                      <ChevronRight size={14} className={isActive ? 'text-cyan-500' : 'text-slate-300'} />
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Main — records */}
        <div className="lg:col-span-3">
          {!selectedZone ? (
            <div className="h-full min-h-[400px] flex flex-col items-center justify-center bg-white border-2 border-dashed border-slate-200 rounded-2xl p-12 text-center">
              <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-300 mb-4">
                <Globe size={32} />
              </div>
              <h3 className="text-base font-bold text-slate-700">No Zone Selected</h3>
              <p className="text-sm text-slate-400 max-w-xs mt-2">
                Select a domain from the sidebar to manage its DNS records.
              </p>
            </div>
          ) : (
            <div className="space-y-4 animate-in fade-in duration-300">
              {/* Zone header */}
              <div className="bg-white border border-slate-200 rounded-2xl px-6 py-4 shadow-sm flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-slate-800">{selectedZone.domain_name}</h2>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-[11px] text-slate-400">Default TTL: <strong>{selectedZone.ttl}s</strong></span>
                    <span className="text-slate-200">|</span>
                    <span className="text-[11px] text-slate-400"><strong>{records.length}</strong> record{records.length !== 1 ? 's' : ''}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setIsTemplateModalOpen(true)}
                    className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-xl font-bold transition-all text-sm flex items-center gap-2"
                  >
                    <Layers size={15} className="text-cyan-500" />
                    Templates
                  </button>
                  <button
                    onClick={openAdd}
                    className="bg-cyan-600 hover:bg-cyan-700 text-white px-4 py-2 rounded-xl font-bold transition-all text-sm flex items-center gap-2 shadow-sm shadow-cyan-900/10"
                  >
                    <Plus size={15} />
                    Add Record
                  </button>
                </div>
              </div>

              {/* Records grouped by type */}
              {isLoadingRecords ? (
                <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-slate-400 italic">
                  Loading records…
                </div>
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
                        <span className="text-xs font-bold text-slate-600 uppercase tracking-widest">{recordType} Records</span>
                        <span className="text-[10px] text-slate-400 font-medium">{meta?.hint}</span>
                        <span className="ml-auto text-[10px] font-bold text-slate-400">{recs.length}</span>
                      </div>
                      <table className="w-full text-left text-sm">
                        <thead className="border-b border-slate-100 bg-slate-50/30">
                          <tr className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                            <th className="px-5 py-2.5">Name</th>
                            {(recordType === 'MX' || recordType === 'SRV') && <th className="px-5 py-2.5">Priority</th>}
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
                                  <button onClick={() => openEdit(record)} className="p-1.5 text-slate-400 hover:text-cyan-600 hover:bg-cyan-50 rounded-lg transition-all" title="Edit">
                                    <Edit2 size={13} />
                                  </button>
                                  <button onClick={() => confirmDelete(record)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all" title="Delete">
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

      {/* ── Modal: Add / Edit Record ─────────────────────────────────────── */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
                {editingRecord ? <Edit2 size={16} className="text-cyan-600" /> : <Plus size={16} className="text-cyan-600" />}
                {editingRecord ? 'Edit DNS Record' : 'Add DNS Record'}
              </h2>
              <button onClick={closeModal} className="text-slate-400 hover:text-slate-600 text-xl leading-none">✕</button>
            </div>

            <form onSubmit={(e) => { e.preventDefault(); submitRecord(); }} className="p-6 space-y-4">
              {/* Type selector */}
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Record Type</label>
                <div className="flex flex-wrap gap-2">
                  {RECORD_TYPES.map(t => {
                    const meta = TYPE_META[t];
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setType(t)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                          type === t ? meta.color + ' shadow-sm' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                        }`}
                      >
                        {t}
                      </button>
                    );
                  })}
                </div>
                {type && (
                  <p className="text-[11px] text-slate-400 ml-1">{TYPE_META[type].hint}</p>
                )}
              </div>

              {/* Name + TTL */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Name / Host</label>
                  <input
                    type="text"
                    className={`w-full bg-slate-50 border rounded-xl py-3 px-4 text-sm font-mono focus:ring-2 focus:ring-cyan-500/30 outline-none transition-all ${showErrors && recordErrors.name ? 'border-red-300' : 'border-slate-200'}`}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="@ or www"
                  />
                  {showErrors && recordErrors.name && (
                    <p className="text-[11px] text-red-500 flex items-center gap-1 ml-1"><AlertCircle size={11} />{recordErrors.name}</p>
                  )}
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">TTL (seconds)</label>
                  <select
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-sm focus:ring-2 focus:ring-cyan-500/30 outline-none transition-all"
                    value={ttl}
                    onChange={(e) => setTtl(e.target.value)}
                  >
                    <option value="300">300 (5 min)</option>
                    <option value="900">900 (15 min)</option>
                    <option value="3600">3600 (1 hr)</option>
                    <option value="86400">86400 (1 day)</option>
                  </select>
                </div>
              </div>

              {/* Content */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Value / Content</label>
                <input
                  type="text"
                  className={`w-full bg-slate-50 border rounded-xl py-3 px-4 text-sm font-mono focus:ring-2 focus:ring-cyan-500/30 outline-none transition-all ${showErrors && recordErrors.content ? 'border-red-300' : 'border-slate-200'}`}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder={TYPE_META[type].placeholder}
                />
                {showErrors && recordErrors.content && (
                  <p className="text-[11px] text-red-500 flex items-center gap-1 ml-1"><AlertCircle size={11} />{recordErrors.content}</p>
                )}
              </div>

              {/* Priority (MX / SRV only) */}
              {needsPriority && (
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Priority</label>
                  <input
                    type="number"
                    min="0"
                    className={`w-full bg-slate-50 border rounded-xl py-3 px-4 text-sm focus:ring-2 focus:ring-cyan-500/30 outline-none transition-all ${showErrors && recordErrors.priority ? 'border-red-300' : 'border-slate-200'}`}
                    value={priority}
                    onChange={(e) => setPriority(e.target.value)}
                    placeholder="10"
                  />
                  {showErrors && recordErrors.priority && (
                    <p className="text-[11px] text-red-500 flex items-center gap-1 ml-1"><AlertCircle size={11} />{recordErrors.priority}</p>
                  )}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={closeModal} className="flex-1 py-3 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 text-sm transition-all">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saveRecordMutation.isPending}
                  className="flex-1 py-3 rounded-xl font-bold text-white bg-cyan-600 hover:bg-cyan-700 text-sm transition-all shadow-md shadow-cyan-900/10 disabled:opacity-50"
                >
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
                <Layers size={16} className="text-cyan-600" />
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
                    className="text-left p-4 rounded-xl border border-slate-200 hover:border-cyan-300 hover:bg-cyan-50/40 transition-all group"
                  >
                    <div className="flex items-center gap-2">
                      <Layers size={14} className="text-cyan-500" />
                      <span className="text-sm font-bold text-slate-700 group-hover:text-cyan-700">{t.name}</span>
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
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-4 text-sm font-mono focus:ring-2 focus:ring-cyan-500/30 outline-none"
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
                    className="flex-1 py-3 rounded-xl font-bold text-white bg-cyan-600 hover:bg-cyan-700 text-sm transition-all shadow-md disabled:opacity-50"
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

export default ClientDnsManager;
