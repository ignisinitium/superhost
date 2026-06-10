import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import type { HostingPackage } from '../../../shared/types';
import {
  Box, Plus, Trash2, Edit2, X, Check, ChevronDown, ChevronUp,
  HardDrive, Globe, Mail, Database, Terminal, Lock,
  Archive, Users, Zap, Server, Puzzle,
} from 'lucide-react';
import toast from 'react-hot-toast';

// ─── helpers ─────────────────────────────────────────────────────────────────

const fmtDisk = (mb: number) => mb === -1 ? 'Unlimited' : mb >= 1024 ? `${(mb / 1024).toFixed(0)} GB` : `${mb} MB`;
const fmtNum  = (n: number)  => n === -1 ? '∞' : String(n);

const TYPE_COLORS: Record<string, string> = {
  hosting: 'bg-blue-100 text-blue-700',
  addon:   'bg-purple-100 text-purple-700',
  domain:  'bg-green-100 text-green-700',
  vps:     'bg-orange-100 text-orange-700',
  reseller:'bg-rose-100 text-rose-700',
};

// ─── default form states ──────────────────────────────────────────────────────

const defaultPlanForm = (): Omit<HostingPackage, 'id' | 'created_at' | 'updated_at'> => ({
  name: '',
  description: '',
  price_cents: 0,
  annual_price_cents: 0,
  onetime_price_cents: 0,
  is_custom: false,
  setup_fee_cents: 0,
  billing_cycle: 'monthly',
  type: 'hosting',
  is_active: true,
  sort_order: 0,

  disk_quota_mb: 5120,
  bandwidth_gb: 100,
  inodes_limit: 250000,

  domains_allowed: 1,
  subdomains_allowed: 10,
  addon_domains: 0,
  parked_domains: 5,

  email_accounts: 10,
  email_quota_mb: 500,
  email_forwarders: 10,
  email_autoresponders: 5,
  mailing_lists: 1,
  spam_filter: true,
  catchall_email: true,

  databases_allowed: 5,
  database_users: 5,

  ftp_accounts: 3,
  ssh_access: false,
  sftp_access: true,

  ssl_included: true,
  cron_jobs: 5,
  php_versions: '8.1,8.2,8.3',
  nodejs_support: false,
  python_support: false,
  ruby_support: false,

  opcache_enabled: true,
  redis_access: false,
  memcached_access: false,

  daily_backups: false,
  backup_retention_days: 7,

  reseller_enabled: false,
  reseller_accounts: 0,

  static_ip: false,
  stripe_price_id: '',
});

const defaultAddonForm = (): Omit<HostingPackage, 'id' | 'created_at' | 'updated_at'> => ({
  name: '',
  description: '',
  price_cents: 0,
  annual_price_cents: 0,
  onetime_price_cents: 0,
  is_custom: false,
  setup_fee_cents: 0,
  billing_cycle: 'monthly',
  type: 'addon',
  is_active: true,
  sort_order: 0,

  // Resource bumps (0 = doesn't add anything for this resource)
  disk_quota_mb: 0,
  bandwidth_gb: 0,
  inodes_limit: 0,
  domains_allowed: 0,
  subdomains_allowed: 0,
  addon_domains: 0,
  parked_domains: 0,
  email_accounts: 0,
  email_quota_mb: 0,
  email_forwarders: 0,
  email_autoresponders: 0,
  mailing_lists: 0,
  spam_filter: false,
  catchall_email: false,
  databases_allowed: 0,
  database_users: 0,
  ftp_accounts: 0,
  ssh_access: false,
  sftp_access: false,
  ssl_included: false,
  cron_jobs: 0,
  php_versions: '',
  nodejs_support: false,
  python_support: false,
  ruby_support: false,
  opcache_enabled: false,
  redis_access: false,
  memcached_access: false,
  daily_backups: false,
  backup_retention_days: 0,
  reseller_enabled: false,
  reseller_accounts: 0,

  static_ip: false,
  stripe_price_id: '',
});

// ─── sub-components ───────────────────────────────────────────────────────────

const SectionHeader: React.FC<{ icon: React.ReactNode; title: string }> = ({ icon, title }) => (
  <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-100">
    <span className="text-orange-500">{icon}</span>
    <span className="text-xs font-bold text-slate-600 uppercase tracking-widest">{title}</span>
  </div>
);

interface FieldProps {
  label: string;
  hint?: string;
  children: React.ReactNode;
}
const Field: React.FC<FieldProps> = ({ label, hint, children }) => (
  <div className="space-y-1">
    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-0.5 flex items-center gap-1">
      {label}
      {hint && <span className="normal-case font-normal text-slate-400">({hint})</span>}
    </label>
    {children}
  </div>
);

const NumInput: React.FC<{
  value: number;
  onChange: (v: number) => void;
  placeholder?: string;
}> = ({ value, onChange, placeholder }) => (
  <input
    type="number"
    className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
    value={value}
    onChange={(e) => onChange(parseInt(e.target.value) || 0)}
    placeholder={placeholder}
  />
);

const Toggle: React.FC<{ checked: boolean; onChange: (v: boolean) => void; label: string }> = ({
  checked, onChange, label,
}) => (
  <button
    type="button"
    onClick={() => onChange(!checked)}
    className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-semibold transition-all ${
      checked
        ? 'bg-green-50 border-green-300 text-green-700'
        : 'bg-slate-50 border-slate-200 text-slate-400'
    }`}
  >
    <div className={`w-8 h-4 rounded-full transition-colors relative ${checked ? 'bg-green-400' : 'bg-slate-200'}`}>
      <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-all ${checked ? 'left-4' : 'left-0.5'}`} />
    </div>
    {label}
  </button>
);

// Tag icon (Lucide doesn't always export this standalone)
const Tag = ({ size }: { size: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/>
    <line x1="7" y1="7" x2="7.01" y2="7"/>
  </svg>
);

// ─── main component ───────────────────────────────────────────────────────────

const PackagesPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'plans' | 'addons'>('plans');
  const [isModalOpen, setIsModalOpen]   = useState(false);
  const [editingPkg, setEditingPkg]     = useState<HostingPackage | null>(null);
  const [form, setForm]                 = useState(defaultPlanForm());
  const [expandedId, setExpandedId]     = useState<number | null>(null);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  // ── queries ──
  const { data: packages, isLoading } = useQuery<HostingPackage[]>({
    queryKey: ['packages-admin'],
    queryFn: async () => (await api.get('/billing/products/admin')).data,
  });

  // Filter by tab
  const planPackages  = packages?.filter((p) => p.type !== 'addon') ?? [];
  const addonPackages = packages?.filter((p) => p.type === 'addon') ?? [];

  // ── mutations ──
  const createMutation = useMutation({
    mutationFn: async () => (await api.post('/billing/products', form)).data,
    onSuccess: () => {
      toast.success(activeTab === 'addons' ? 'Add-on created!' : 'Package created!');
      closeModal();
      queryClient.invalidateQueries({ queryKey: ['packages-admin'] });
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to create'),
  });

  const updateMutation = useMutation({
    mutationFn: async () => (await api.put(`/billing/products/${editingPkg!.id}`, form)).data,
    onSuccess: () => {
      toast.success('Saved!');
      closeModal();
      queryClient.invalidateQueries({ queryKey: ['packages-admin'] });
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to update'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => (await api.delete(`/billing/products/${id}`)).data,
    onSuccess: () => {
      toast.success('Deleted');
      queryClient.invalidateQueries({ queryKey: ['packages-admin'] });
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to delete'),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, pkg }: { id: number; pkg: HostingPackage }) =>
      (await api.put(`/billing/products/${id}`, { ...pkg, is_active: !pkg.is_active })).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['packages-admin'] }),
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to update'),
  });

  // ── modal helpers ──
  const openCreate = () => {
    setEditingPkg(null);
    setForm(activeTab === 'addons' ? defaultAddonForm() : defaultPlanForm());
    setIsModalOpen(true);
  };

  const openEdit = (pkg: HostingPackage) => {
    setEditingPkg(pkg);
    const { id: _id, created_at: _c, updated_at: _u, ...rest } = pkg;
    setForm({ ...rest, stripe_price_id: rest.stripe_price_id ?? '' });
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingPkg(null);
    setForm(activeTab === 'addons' ? defaultAddonForm() : defaultPlanForm());
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    editingPkg ? updateMutation.mutate() : createMutation.mutate();
  };

  const isPending = createMutation.isPending || updateMutation.isPending;
  const isAddonModal = form.type === 'addon';

  // ─── render ───────────────────────────────────────────────────────────────

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in duration-500">

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Hosting Packages & Add-ons</h1>
          <p className="text-slate-500 mt-1">Manage hosting plans and supplemental add-ons for your clients.</p>
        </div>
        <button
          onClick={openCreate}
          className="bg-orange-600 hover:bg-orange-700 text-white px-5 py-2.5 rounded-xl font-bold transition-all shadow-md shadow-orange-900/10 flex items-center gap-2 text-sm"
        >
          <Plus size={18} />
          {activeTab === 'addons' ? 'New Add-on' : 'New Package'}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
        <button
          onClick={() => { setActiveTab('plans'); setExpandedId(null); }}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
            activeTab === 'plans'
              ? 'bg-white text-slate-800 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <Server size={15} />
          Hosting Plans
          <span className="text-[10px] font-bold bg-slate-200 text-slate-500 px-1.5 py-0.5 rounded-full">
            {planPackages.length}
          </span>
        </button>
        <button
          onClick={() => { setActiveTab('addons'); setExpandedId(null); }}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
            activeTab === 'addons'
              ? 'bg-white text-slate-800 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <Puzzle size={15} />
          Add-ons
          <span className="text-[10px] font-bold bg-slate-200 text-slate-500 px-1.5 py-0.5 rounded-full">
            {addonPackages.length}
          </span>
        </button>
      </div>

      {/* ── Hosting Plans Table ── */}
      {activeTab === 'plans' && (
        <PackageTable
          packages={planPackages}
          isLoading={isLoading}
          expandedId={expandedId}
          setExpandedId={setExpandedId}
          onEdit={openEdit}
          onDelete={(pkg) => {
            if (window.confirm(`Delete package "${pkg.name}"?`)) deleteMutation.mutate(pkg.id);
          }}
          onToggleActive={(pkg) => toggleActiveMutation.mutate({ id: pkg.id, pkg })}
          emptyLabel="No hosting plans yet. Click New Package to get started."
        />
      )}

      {/* ── Add-ons Table ── */}
      {activeTab === 'addons' && (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex items-center gap-3">
            <Puzzle className="text-purple-500" size={20} />
            <div>
              <h2 className="text-lg font-bold text-slate-800">Add-on Inventory</h2>
              <p className="text-xs text-slate-400 mt-0.5">Add-ons supplement a base hosting plan — clients select them after choosing a plan.</p>
            </div>
            <span className="ml-auto text-xs text-slate-400 font-medium">{addonPackages.length} add-ons</span>
          </div>

          {isLoading ? (
            <div className="py-12 text-center text-slate-400">Loading…</div>
          ) : addonPackages.length === 0 ? (
            <div className="py-14 text-center text-slate-400 italic">
              No add-ons yet. Click <b>New Add-on</b> to create one.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {addonPackages.map((pkg) => (
                <div key={pkg.id} className="flex items-center gap-4 px-5 py-4 hover:bg-slate-50/60 transition-colors">
                  {/* Icon */}
                  <div className="w-10 h-10 bg-purple-50 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Puzzle size={18} className="text-purple-500" />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-slate-800 text-sm">{pkg.name}</span>
                      {pkg.static_ip && (
                        <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Static IP</span>
                      )}
                      {pkg.ssh_access && (
                        <span className="text-[10px] font-bold bg-green-100 text-green-700 px-2 py-0.5 rounded-full">SSH</span>
                      )}
                      {pkg.daily_backups && (
                        <span className="text-[10px] font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Backups</span>
                      )}
                      {pkg.redis_access && (
                        <span className="text-[10px] font-bold bg-red-100 text-red-700 px-2 py-0.5 rounded-full">Redis</span>
                      )}
                      {pkg.disk_quota_mb > 0 && (
                        <span className="text-[10px] font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">+{fmtDisk(pkg.disk_quota_mb)} disk</span>
                      )}
                      {pkg.email_accounts > 0 && (
                        <span className="text-[10px] font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">+{pkg.email_accounts} email</span>
                      )}
                      {pkg.databases_allowed > 0 && (
                        <span className="text-[10px] font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">+{pkg.databases_allowed} DB</span>
                      )}
                    </div>
                    {pkg.description && (
                      <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">{pkg.description}</p>
                    )}
                  </div>

                  {/* Price */}
                  <div className="text-right flex-shrink-0">
                    <p className="font-bold text-slate-800 text-sm">
                      ${(pkg.price_cents / 100).toFixed(2)}
                      <span className="text-xs font-normal text-slate-400 ml-1">/mo</span>
                    </p>
                    {pkg.annual_price_cents > 0 && (
                      <p className="text-[11px] text-emerald-600 font-medium">
                        ${(pkg.annual_price_cents / 100).toFixed(2)}/yr
                      </p>
                    )}
                  </div>

                  {/* Status */}
                  <button
                    onClick={() => toggleActiveMutation.mutate({ id: pkg.id, pkg })}
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full transition-colors flex-shrink-0 ${
                      pkg.is_active
                        ? 'bg-green-100 text-green-700 hover:bg-green-200'
                        : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                    }`}
                  >
                    {pkg.is_active ? 'Active' : 'Inactive'}
                  </button>

                  {/* Actions */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => openEdit(pkg)}
                      className="text-blue-400 hover:text-blue-600 p-1.5 rounded-lg hover:bg-blue-50 transition-colors"
                      title="Edit"
                    >
                      <Edit2 size={15} />
                    </button>
                    <button
                      onClick={() => {
                        if (window.confirm(`Delete add-on "${pkg.name}"?`)) deleteMutation.mutate(pkg.id);
                      }}
                      className="text-red-400 hover:text-red-600 p-1.5 rounded-lg hover:bg-red-50 transition-colors"
                      title="Delete"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Create / Edit Modal ── */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl border border-slate-200 my-6 animate-in zoom-in-95 duration-200">

            {/* Modal header */}
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between sticky top-0 rounded-t-2xl z-10">
              <div className="flex items-center gap-2">
                {isAddonModal ? <Puzzle className="text-purple-500" size={18} /> : <Server className="text-orange-500" size={18} />}
                <h2 className="text-base font-bold text-slate-800">
                  {editingPkg
                    ? `Edit: ${editingPkg.name}`
                    : isAddonModal ? 'Create New Add-on' : 'Create New Package'}
                </h2>
              </div>
              <button onClick={closeModal} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-8">

              {/* ── 1. Identity ── */}
              <section>
                <SectionHeader icon={<Tag size={15} />} title={isAddonModal ? 'Add-on Identity' : 'Package Identity'} />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label={isAddonModal ? 'Add-on Name' : 'Package Name'}>
                    <input
                      type="text"
                      required
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                      value={form.name}
                      onChange={(e) => set('name', e.target.value)}
                      placeholder={isAddonModal ? 'e.g. Static IP Address' : 'e.g. Business Pro'}
                    />
                  </Field>
                  {!isAddonModal && (
                    <Field label="Type">
                      <select
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                        value={form.type}
                        onChange={(e) => set('type', e.target.value as any)}
                      >
                        <option value="hosting">Shared Hosting</option>
                        <option value="vps">VPS / Cloud</option>
                        <option value="reseller">Reseller</option>
                        <option value="domain">Domain Service</option>
                      </select>
                    </Field>
                  )}
                  <Field label="Description" hint="shown to clients">
                    <textarea
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 px-3 text-sm h-20 resize-none focus:outline-none focus:ring-2 focus:ring-orange-300"
                      value={form.description}
                      onChange={(e) => set('description', e.target.value)}
                      placeholder={isAddonModal ? 'Dedicated IPv4 address for your hosting account…' : 'Perfect for growing businesses…'}
                    />
                  </Field>
                  <div className="space-y-4">
                    <Field label="Billing Cycle">
                      <select
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                        value={form.billing_cycle}
                        onChange={(e) => set('billing_cycle', e.target.value as any)}
                      >
                        <option value="monthly">Monthly</option>
                        <option value="quarterly">Quarterly</option>
                        <option value="annually">Annually</option>
                        <option value="onetime">One-time</option>
                      </select>
                    </Field>
                    <div className="grid grid-cols-3 gap-3">
                      <Field label="Monthly" hint="cents">
                        <NumInput value={form.price_cents} onChange={(v) => set('price_cents', v)} placeholder="995" />
                      </Field>
                      <Field label="Annual" hint="cents/yr">
                        <NumInput value={form.annual_price_cents} onChange={(v) => set('annual_price_cents', v)} placeholder="9950" />
                      </Field>
                      <Field label="Setup Fee" hint="cents">
                        <NumInput value={form.setup_fee_cents} onChange={(v) => set('setup_fee_cents', v)} placeholder="0" />
                      </Field>
                    </div>
                  </div>
                  <Field label="Stripe Price ID" hint="optional">
                    <input
                      type="text"
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 px-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-orange-300"
                      value={form.stripe_price_id ?? ''}
                      onChange={(e) => set('stripe_price_id', e.target.value)}
                      placeholder="price_H5v…"
                    />
                  </Field>
                  <div className="flex items-end gap-3">
                    <Field label="Sort Order">
                      <NumInput value={form.sort_order} onChange={(v) => set('sort_order', v)} placeholder="0" />
                    </Field>
                    <div className="pb-0.5">
                      <Toggle checked={form.is_active} onChange={(v) => set('is_active', v)} label="Active" />
                    </div>
                  </div>
                </div>
              </section>

              {/* ── ADD-ON SPECIFIC: Features ── */}
              {isAddonModal && (
                <section>
                  <SectionHeader icon={<Puzzle size={15} />} title="Add-on Features" />
                  <p className="text-[10px] text-slate-400 mb-4">Enable the features this add-on provides. Resource bumps are cumulative with the base plan.</p>
                  <div className="space-y-4">
                    {/* Toggleable features */}
                    <div className="flex flex-wrap gap-3">
                      <Toggle checked={form.static_ip}       onChange={(v) => set('static_ip', v)}       label="Static IP Address" />
                      <Toggle checked={form.ssh_access}      onChange={(v) => set('ssh_access', v)}       label="SSH Access" />
                      <Toggle checked={form.daily_backups}   onChange={(v) => set('daily_backups', v)}    label="Daily Backups" />
                      <Toggle checked={form.redis_access}    onChange={(v) => set('redis_access', v)}     label="Redis" />
                      <Toggle checked={form.memcached_access} onChange={(v) => set('memcached_access', v)} label="Memcached" />
                      <Toggle checked={form.ssl_included}    onChange={(v) => set('ssl_included', v)}     label="SSL Certificate" />
                    </div>

                    {/* Resource bump fields */}
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-4">
                      <Field label="Extra Disk" hint="MB, 0 = none">
                        <NumInput value={form.disk_quota_mb} onChange={(v) => set('disk_quota_mb', v)} placeholder="0" />
                      </Field>
                      <Field label="Extra Bandwidth" hint="GB, 0 = none">
                        <NumInput value={form.bandwidth_gb} onChange={(v) => set('bandwidth_gb', v)} placeholder="0" />
                      </Field>
                      <Field label="Extra Domains" hint="0 = none">
                        <NumInput value={form.domains_allowed} onChange={(v) => set('domains_allowed', v)} placeholder="0" />
                      </Field>
                      <Field label="Extra Email Accounts" hint="0 = none">
                        <NumInput value={form.email_accounts} onChange={(v) => set('email_accounts', v)} placeholder="0" />
                      </Field>
                      <Field label="Extra Databases" hint="0 = none">
                        <NumInput value={form.databases_allowed} onChange={(v) => set('databases_allowed', v)} placeholder="0" />
                      </Field>
                      <Field label="Backup Retention" hint="days, 0 = none">
                        <NumInput value={form.backup_retention_days} onChange={(v) => set('backup_retention_days', v)} placeholder="0" />
                      </Field>
                    </div>
                  </div>
                </section>
              )}

              {/* ── PLAN-ONLY sections ── */}
              {!isAddonModal && (
                <>
                  {/* ── 2. Storage & Bandwidth ── */}
                  <section>
                    <SectionHeader icon={<HardDrive size={15} />} title="Storage & Bandwidth" />
                    <p className="text-[10px] text-slate-400 mb-3">Use <code className="bg-slate-100 px-1 rounded">-1</code> for unlimited on any numeric field.</p>
                    <div className="grid grid-cols-3 gap-4">
                      <Field label="Disk Quota" hint="MB">
                        <NumInput value={form.disk_quota_mb} onChange={(v) => set('disk_quota_mb', v)} />
                      </Field>
                      <Field label="Bandwidth" hint="GB/mo">
                        <NumInput value={form.bandwidth_gb} onChange={(v) => set('bandwidth_gb', v)} />
                      </Field>
                      <Field label="Inodes Limit">
                        <NumInput value={form.inodes_limit} onChange={(v) => set('inodes_limit', v)} />
                      </Field>
                    </div>
                  </section>

                  {/* ── 3. Domains ── */}
                  <section>
                    <SectionHeader icon={<Globe size={15} />} title="Domains" />
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <Field label="Domains">
                        <NumInput value={form.domains_allowed} onChange={(v) => set('domains_allowed', v)} />
                      </Field>
                      <Field label="Subdomains">
                        <NumInput value={form.subdomains_allowed} onChange={(v) => set('subdomains_allowed', v)} />
                      </Field>
                      <Field label="Addon Domains">
                        <NumInput value={form.addon_domains} onChange={(v) => set('addon_domains', v)} />
                      </Field>
                      <Field label="Parked Domains">
                        <NumInput value={form.parked_domains} onChange={(v) => set('parked_domains', v)} />
                      </Field>
                    </div>
                  </section>

                  {/* ── 4. Email ── */}
                  <section>
                    <SectionHeader icon={<Mail size={15} />} title="Email" />
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
                      <Field label="Email Accounts">
                        <NumInput value={form.email_accounts} onChange={(v) => set('email_accounts', v)} />
                      </Field>
                      <Field label="Quota per Account" hint="MB">
                        <NumInput value={form.email_quota_mb} onChange={(v) => set('email_quota_mb', v)} />
                      </Field>
                      <Field label="Forwarders">
                        <NumInput value={form.email_forwarders} onChange={(v) => set('email_forwarders', v)} />
                      </Field>
                      <Field label="Autoresponders">
                        <NumInput value={form.email_autoresponders} onChange={(v) => set('email_autoresponders', v)} />
                      </Field>
                      <Field label="Mailing Lists">
                        <NumInput value={form.mailing_lists} onChange={(v) => set('mailing_lists', v)} />
                      </Field>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      <Toggle checked={form.spam_filter}    onChange={(v) => set('spam_filter', v)}    label="Spam Filter" />
                      <Toggle checked={form.catchall_email} onChange={(v) => set('catchall_email', v)} label="Catch-all Email" />
                    </div>
                  </section>

                  {/* ── 5. Databases ── */}
                  <section>
                    <SectionHeader icon={<Database size={15} />} title="Databases" />
                    <div className="grid grid-cols-2 gap-4">
                      <Field label="MySQL/MariaDB Databases">
                        <NumInput value={form.databases_allowed} onChange={(v) => set('databases_allowed', v)} />
                      </Field>
                      <Field label="Database Users">
                        <NumInput value={form.database_users} onChange={(v) => set('database_users', v)} />
                      </Field>
                    </div>
                  </section>

                  {/* ── 6. Access ── */}
                  <section>
                    <SectionHeader icon={<Terminal size={15} />} title="Access & Shell" />
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
                      <Field label="FTP Accounts">
                        <NumInput value={form.ftp_accounts} onChange={(v) => set('ftp_accounts', v)} />
                      </Field>
                      <Field label="Cron Jobs">
                        <NumInput value={form.cron_jobs} onChange={(v) => set('cron_jobs', v)} />
                      </Field>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      <Toggle checked={form.ssh_access}  onChange={(v) => set('ssh_access', v)}  label="SSH Access" />
                      <Toggle checked={form.sftp_access} onChange={(v) => set('sftp_access', v)} label="SFTP Access" />
                    </div>
                  </section>

                  {/* ── 7. Web & SSL ── */}
                  <section>
                    <SectionHeader icon={<Lock size={15} />} title="Web, SSL & Language Runtimes" />
                    <div className="grid grid-cols-1 gap-4 mb-4">
                      <Field label="PHP Versions" hint="comma-separated, e.g. 8.1,8.2,8.3">
                        <input
                          type="text"
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 px-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-orange-300"
                          value={form.php_versions}
                          onChange={(e) => set('php_versions', e.target.value)}
                          placeholder="8.1,8.2,8.3"
                        />
                      </Field>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      <Toggle checked={form.ssl_included}    onChange={(v) => set('ssl_included', v)}    label="Free SSL (Let's Encrypt)" />
                      <Toggle checked={form.nodejs_support}  onChange={(v) => set('nodejs_support', v)}  label="Node.js" />
                      <Toggle checked={form.python_support}  onChange={(v) => set('python_support', v)}  label="Python" />
                      <Toggle checked={form.ruby_support}    onChange={(v) => set('ruby_support', v)}    label="Ruby" />
                    </div>
                  </section>

                  {/* ── 8. Performance ── */}
                  <section>
                    <SectionHeader icon={<Zap size={15} />} title="Performance & Caching" />
                    <div className="flex flex-wrap gap-3">
                      <Toggle checked={form.opcache_enabled}    onChange={(v) => set('opcache_enabled', v)}    label="PHP OPcache" />
                      <Toggle checked={form.redis_access}       onChange={(v) => set('redis_access', v)}       label="Redis" />
                      <Toggle checked={form.memcached_access}   onChange={(v) => set('memcached_access', v)}   label="Memcached" />
                    </div>
                  </section>

                  {/* ── 9. Backups ── */}
                  <section>
                    <SectionHeader icon={<Archive size={15} />} title="Backups" />
                    <div className="flex flex-wrap items-center gap-4 mb-3">
                      <Toggle checked={form.daily_backups} onChange={(v) => set('daily_backups', v)} label="Daily Automated Backups" />
                    </div>
                    <div className="w-40">
                      <Field label="Retention" hint="days">
                        <NumInput value={form.backup_retention_days} onChange={(v) => set('backup_retention_days', v)} placeholder="7" />
                      </Field>
                    </div>
                  </section>

                  {/* ── 10. Reseller ── */}
                  <section>
                    <SectionHeader icon={<Users size={15} />} title="Reseller" />
                    <div className="flex flex-wrap items-center gap-4 mb-3">
                      <Toggle checked={form.reseller_enabled} onChange={(v) => set('reseller_enabled', v)} label="Reseller Capabilities" />
                    </div>
                    {form.reseller_enabled && (
                      <div className="w-40">
                        <Field label="Sub-accounts">
                          <NumInput value={form.reseller_accounts} onChange={(v) => set('reseller_accounts', v)} placeholder="-1 = unlimited" />
                        </Field>
                      </div>
                    )}
                  </section>
                </>
              )}

              {/* ── Footer buttons ── */}
              <div className="flex gap-3 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex-1 px-4 py-3 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 text-sm transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="flex-1 px-4 py-3 rounded-xl font-bold text-white bg-orange-600 hover:bg-orange-700 shadow-md shadow-orange-900/10 text-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isPending ? (
                    'Saving…'
                  ) : (
                    <>
                      <Check size={16} />
                      {editingPkg ? 'Save Changes' : isAddonModal ? 'Create Add-on' : 'Create Package'}
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── PackageTable sub-component ───────────────────────────────────────────────

interface PackageTableProps {
  packages: HostingPackage[];
  isLoading: boolean;
  expandedId: number | null;
  setExpandedId: (id: number | null) => void;
  onEdit: (pkg: HostingPackage) => void;
  onDelete: (pkg: HostingPackage) => void;
  onToggleActive: (pkg: HostingPackage) => void;
  emptyLabel: string;
}

const PackageTable: React.FC<PackageTableProps> = ({
  packages, isLoading, expandedId, setExpandedId, onEdit, onDelete, onToggleActive, emptyLabel,
}) => (
  <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
    <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex items-center gap-3">
      <Box className="text-orange-600" size={20} />
      <h2 className="text-lg font-bold text-slate-800">Package Inventory</h2>
      <span className="ml-auto text-xs text-slate-400 font-medium">{packages.length} packages</span>
    </div>

    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
          <tr>
            <th className="px-5 py-3.5 text-[10px] font-bold uppercase tracking-wider">Package</th>
            <th className="px-5 py-3.5 text-[10px] font-bold uppercase tracking-wider">Type</th>
            <th className="px-5 py-3.5 text-[10px] font-bold uppercase tracking-wider">Price</th>
            <th className="px-5 py-3.5 text-[10px] font-bold uppercase tracking-wider">Storage</th>
            <th className="px-5 py-3.5 text-[10px] font-bold uppercase tracking-wider">Domains</th>
            <th className="px-5 py-3.5 text-[10px] font-bold uppercase tracking-wider">Email</th>
            <th className="px-5 py-3.5 text-[10px] font-bold uppercase tracking-wider">DB</th>
            <th className="px-5 py-3.5 text-[10px] font-bold uppercase tracking-wider">Status</th>
            <th className="px-5 py-3.5 text-[10px] font-bold uppercase tracking-wider text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {isLoading ? (
            <tr>
              <td colSpan={9} className="px-6 py-10 text-center text-slate-400">Loading packages…</td>
            </tr>
          ) : packages.length > 0 ? (
            packages.map((pkg) => (
              <React.Fragment key={pkg.id}>
                <tr className="hover:bg-slate-50/60 transition-colors">
                  <td className="px-5 py-4">
                    <div className="font-bold text-slate-800">{pkg.name}</div>
                    <div className="text-xs text-slate-400 line-clamp-1 max-w-[180px]">{pkg.description}</div>
                  </td>
                  <td className="px-5 py-4">
                    <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded ${TYPE_COLORS[pkg.type] ?? 'bg-slate-100 text-slate-600'}`}>
                      {pkg.type}
                    </span>
                  </td>
                  <td className="px-5 py-4 font-bold text-slate-800">
                    ${(pkg.price_cents / 100).toFixed(2)}
                    <span className="text-xs text-slate-400 font-normal ml-1">/mo</span>
                    {pkg.annual_price_cents > 0 && (
                      <div className="text-[10px] text-emerald-600 font-medium">${(pkg.annual_price_cents / 100).toFixed(2)}/yr</div>
                    )}
                    {pkg.setup_fee_cents > 0 && (
                      <div className="text-[10px] text-slate-400">+${(pkg.setup_fee_cents / 100).toFixed(2)} setup</div>
                    )}
                  </td>
                  <td className="px-5 py-4 text-slate-600 text-xs">{fmtDisk(pkg.disk_quota_mb)}</td>
                  <td className="px-5 py-4 text-slate-600 text-xs">{fmtNum(pkg.domains_allowed)}</td>
                  <td className="px-5 py-4 text-slate-600 text-xs">{fmtNum(pkg.email_accounts)}</td>
                  <td className="px-5 py-4 text-slate-600 text-xs">{fmtNum(pkg.databases_allowed)}</td>
                  <td className="px-5 py-4">
                    <button
                      onClick={() => onToggleActive(pkg)}
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full transition-colors ${
                        pkg.is_active
                          ? 'bg-green-100 text-green-700 hover:bg-green-200'
                          : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                      }`}
                    >
                      {pkg.is_active ? 'Active' : 'Inactive'}
                    </button>
                  </td>
                  <td className="px-5 py-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => setExpandedId(expandedId === pkg.id ? null : pkg.id)}
                        className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
                        title="Show details"
                      >
                        {expandedId === pkg.id ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                      </button>
                      <button
                        onClick={() => onEdit(pkg)}
                        className="text-blue-400 hover:text-blue-600 p-1.5 rounded-lg hover:bg-blue-50 transition-colors"
                        title="Edit"
                      >
                        <Edit2 size={15} />
                      </button>
                      <button
                        onClick={() => onDelete(pkg)}
                        className="text-red-400 hover:text-red-600 p-1.5 rounded-lg hover:bg-red-50 transition-colors"
                        title="Delete"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>

                {/* Expanded details row */}
                {expandedId === pkg.id && (
                  <tr className="bg-slate-50/80">
                    <td colSpan={9} className="px-5 py-5">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                        <div className="space-y-1">
                          <p className="font-bold text-slate-500 uppercase tracking-wider text-[10px] flex items-center gap-1"><HardDrive size={11}/> Storage</p>
                          <p className="text-slate-700">Disk: <b>{fmtDisk(pkg.disk_quota_mb)}</b></p>
                          <p className="text-slate-700">Bandwidth: <b>{pkg.bandwidth_gb === -1 ? 'Unlimited' : `${pkg.bandwidth_gb} GB`}</b></p>
                          <p className="text-slate-700">Inodes: <b>{fmtNum(pkg.inodes_limit)}</b></p>
                        </div>
                        <div className="space-y-1">
                          <p className="font-bold text-slate-500 uppercase tracking-wider text-[10px] flex items-center gap-1"><Globe size={11}/> Domains</p>
                          <p className="text-slate-700">Domains: <b>{fmtNum(pkg.domains_allowed)}</b></p>
                          <p className="text-slate-700">Subdomains: <b>{fmtNum(pkg.subdomains_allowed)}</b></p>
                          <p className="text-slate-700">Addon: <b>{fmtNum(pkg.addon_domains)}</b></p>
                          <p className="text-slate-700">Parked: <b>{fmtNum(pkg.parked_domains)}</b></p>
                        </div>
                        <div className="space-y-1">
                          <p className="font-bold text-slate-500 uppercase tracking-wider text-[10px] flex items-center gap-1"><Mail size={11}/> Email</p>
                          <p className="text-slate-700">Accounts: <b>{fmtNum(pkg.email_accounts)}</b></p>
                          <p className="text-slate-700">Quota/acct: <b>{fmtDisk(pkg.email_quota_mb)}</b></p>
                          <p className="text-slate-700">Forwarders: <b>{fmtNum(pkg.email_forwarders)}</b></p>
                          <p className="text-slate-700">Spam Filter: <b>{pkg.spam_filter ? '✓' : '✗'}</b></p>
                          <p className="text-slate-700">Catch-all: <b>{pkg.catchall_email ? '✓' : '✗'}</b></p>
                        </div>
                        <div className="space-y-1">
                          <p className="font-bold text-slate-500 uppercase tracking-wider text-[10px] flex items-center gap-1"><Database size={11}/> Databases</p>
                          <p className="text-slate-700">Databases: <b>{fmtNum(pkg.databases_allowed)}</b></p>
                          <p className="text-slate-700">DB Users: <b>{fmtNum(pkg.database_users)}</b></p>
                        </div>
                        <div className="space-y-1">
                          <p className="font-bold text-slate-500 uppercase tracking-wider text-[10px] flex items-center gap-1"><Terminal size={11}/> Access</p>
                          <p className="text-slate-700">SSH: <b>{pkg.ssh_access ? '✓' : '✗'}</b></p>
                          <p className="text-slate-700">SFTP: <b>{pkg.sftp_access ? '✓' : '✗'}</b></p>
                          <p className="text-slate-700">FTP Accounts: <b>{fmtNum(pkg.ftp_accounts)}</b></p>
                          <p className="text-slate-700">Cron Jobs: <b>{fmtNum(pkg.cron_jobs)}</b></p>
                        </div>
                        <div className="space-y-1">
                          <p className="font-bold text-slate-500 uppercase tracking-wider text-[10px] flex items-center gap-1"><Lock size={11}/> Web / SSL</p>
                          <p className="text-slate-700">SSL: <b>{pkg.ssl_included ? '✓' : '✗'}</b></p>
                          <p className="text-slate-700">PHP: <b>{pkg.php_versions}</b></p>
                          <p className="text-slate-700">Node.js: <b>{pkg.nodejs_support ? '✓' : '✗'}</b></p>
                          <p className="text-slate-700">Python: <b>{pkg.python_support ? '✓' : '✗'}</b></p>
                          <p className="text-slate-700">Ruby: <b>{pkg.ruby_support ? '✓' : '✗'}</b></p>
                        </div>
                        <div className="space-y-1">
                          <p className="font-bold text-slate-500 uppercase tracking-wider text-[10px] flex items-center gap-1"><Zap size={11}/> Performance</p>
                          <p className="text-slate-700">OPcache: <b>{pkg.opcache_enabled ? '✓' : '✗'}</b></p>
                          <p className="text-slate-700">Redis: <b>{pkg.redis_access ? '✓' : '✗'}</b></p>
                          <p className="text-slate-700">Memcached: <b>{pkg.memcached_access ? '✓' : '✗'}</b></p>
                        </div>
                        <div className="space-y-1">
                          <p className="font-bold text-slate-500 uppercase tracking-wider text-[10px] flex items-center gap-1"><Archive size={11}/> Backups</p>
                          <p className="text-slate-700">Daily Backups: <b>{pkg.daily_backups ? '✓' : '✗'}</b></p>
                          <p className="text-slate-700">Retention: <b>{pkg.backup_retention_days} days</b></p>
                          {pkg.reseller_enabled && (
                            <>
                              <p className="font-bold text-slate-500 uppercase tracking-wider text-[10px] flex items-center gap-1 mt-2"><Users size={11}/> Reseller</p>
                              <p className="text-slate-700">Sub-accounts: <b>{fmtNum(pkg.reseller_accounts)}</b></p>
                            </>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))
          ) : (
            <tr>
              <td colSpan={9} className="px-6 py-14 text-center text-slate-400 italic">
                {emptyLabel}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  </div>
);

export default PackagesPage;
