import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import type { HostingPackage, UserAddon } from '../../../shared/types';
import {
  Mail, Shield, Save, ArrowLeft, HardDrive, Zap, Lock,
  Globe, Database, Box, Check, RefreshCw, ChevronRight, Network,
  Puzzle, Plus, X, Terminal,
} from 'lucide-react';
import toast from 'react-hot-toast';

const fmtDisk = (mb: number) =>
  mb === -1 ? 'Unlimited' : mb >= 1024 ? `${(mb / 1024).toFixed(0)} GB` : `${mb} MB`;

const UserSettingsPage: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [email, setEmail]               = useState('');
  const [password, setPassword]         = useState('');
  const [diskLimit, setDiskLimit]       = useState(1024);
  const [bandwidthLimit, setBandwidthLimit] = useState(5120);
  const [packageId, setPackageId]       = useState<number | null>(null);

  // ── fetch user ──
  const { data: user, isLoading, refetch } = useQuery({
    queryKey: ['user', id],
    queryFn: async () => (await api.get(`/users/${id}`)).data,
  });

  // ── fetch packages list (admin endpoint returns all incl. inactive) ──
  const { data: packages } = useQuery<HostingPackage[]>({
    queryKey: ['packages-admin'],
    queryFn: async () => (await api.get('/billing/products/admin')).data,
  });

  // ── fetch user's current add-ons ──
  const { data: userAddons } = useQuery<UserAddon[]>({
    queryKey: ['user-addons', id],
    queryFn: async () => (await api.get(`/billing/users/${id}/addons`)).data,
    enabled: !!id,
  });

  useEffect(() => {
    if (user) {
      setEmail(user.email || '');
      setDiskLimit(user.disk_limit_mb || 1024);
      setBandwidthLimit(user.bandwidth_limit_mb || 5120);
      setPackageId(user.package_id ?? null);
    }
  }, [user]);

  // ── apply package limits to quota fields ──
  const applyPackageLimits = (pkg: HostingPackage) => {
    if (pkg.disk_quota_mb !== -1) setDiskLimit(pkg.disk_quota_mb);
    if (pkg.bandwidth_gb !== -1) setBandwidthLimit(pkg.bandwidth_gb * 1024); // GB → MB
    setPackageId(pkg.id);
    toast.success(`Limits set from "${pkg.name}" — save to apply`);
  };

  // ── save mutation ──
  const updateMutation = useMutation({
    mutationFn: async () =>
      (await api.put(`/users/${id}`, {
        email,
        password: password || undefined,
        disk_limit_mb: diskLimit,
        bandwidth_limit_mb: bandwidthLimit,
        package_id: packageId,
      })).data,
    onSuccess: () => {
      toast.success('User updated successfully');
      setPassword('');
      refetch();
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Update failed'),
  });

  // ── SSH toggle mutation ──
  const sshMutation = useMutation({
    mutationFn: async (enabled: boolean) =>
      (await api.put(`/users/${id}/ssh`, { enabled })).data,
    onSuccess: (_data, enabled) => {
      toast.success(`SSH access ${enabled ? 'enabled' : 'disabled'}`);
      refetch();
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to update SSH access'),
  });

  // ── add-on mutations ──
  const assignAddonMutation = useMutation({
    mutationFn: async (productId: number) =>
      (await api.post(`/billing/users/${id}/addons`, { productId })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-addons', id] });
      toast.success('Add-on assigned');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to assign add-on'),
  });

  const removeAddonMutation = useMutation({
    mutationFn: async (addonId: number) =>
      (await api.delete(`/billing/users/${id}/addons/${addonId}`)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-addons', id] });
      toast.success('Add-on removed');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to remove add-on'),
  });

  const selectedPackage  = packages?.find((p) => p.id === packageId) ?? null;
  const activePackages   = packages?.filter((p) => p.is_active && p.type !== 'addon') ?? [];
  const inactivePackages = packages?.filter((p) => !p.is_active && p.type !== 'addon') ?? [];
  const availableAddons  = packages?.filter((p) => p.type === 'addon' && p.is_active) ?? [];
  const assignedAddonIds = new Set(userAddons?.map((a) => a.product_id) ?? []);

  if (isLoading) return (
    <div className="p-8 text-center text-slate-400 font-medium">Loading user data…</div>
  );

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-500">

      {/* ── Page header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/users')}
            className="p-2 hover:bg-slate-100 rounded-xl transition-colors text-slate-500"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">
              User Settings: <span className="text-orange-600">{user?.username}</span>
            </h1>
            <p className="text-slate-500 mt-1">Adjust account details, package, and resource quotas.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate(`/users/${id}/websites`)}
            className="flex items-center gap-2 bg-white border border-slate-200 hover:border-orange-300 hover:bg-orange-50 text-slate-700 hover:text-orange-600 px-4 py-2.5 rounded-xl font-bold text-sm transition-all shadow-sm"
          >
            <Globe size={16} /> Websites
          </button>
          <button
            onClick={() => navigate(`/users/${id}/databases`)}
            className="flex items-center gap-2 bg-white border border-slate-200 hover:border-blue-300 hover:bg-blue-50 text-slate-700 hover:text-blue-600 px-4 py-2.5 rounded-xl font-bold text-sm transition-all shadow-sm"
          >
            <Database size={16} /> Databases
          </button>
          <button
            onClick={() => navigate(`/users/${id}/email`)}
            className="flex items-center gap-2 bg-white border border-slate-200 hover:border-violet-300 hover:bg-violet-50 text-slate-700 hover:text-violet-600 px-4 py-2.5 rounded-xl font-bold text-sm transition-all shadow-sm"
          >
            <Mail size={16} /> Email
          </button>
          <button
            onClick={() => navigate(`/dns?user=${encodeURIComponent(user?.username ?? '')}`)}
            className="flex items-center gap-2 bg-white border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50 text-slate-700 hover:text-indigo-600 px-4 py-2.5 rounded-xl font-bold text-sm transition-all shadow-sm"
          >
            <Network size={16} /> DNS
          </button>
        </div>
      </div>

      <form onSubmit={(e) => { e.preventDefault(); updateMutation.mutate(); }} className="space-y-6">

        {/* ── Profile & Security ── */}
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex items-center gap-3">
            <Shield className="text-orange-600" size={20} />
            <h2 className="text-lg font-bold text-slate-800">Profile & Security</h2>
          </div>
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-1.5">
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input
                  type="email" required
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pl-9 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400/40"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest">Change Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input
                  type="password"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pl-9 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400/40"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Leave blank to keep current"
                />
              </div>
            </div>
          </div>
        </div>

        {/* ── Package Assignment ── */}
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Box className="text-orange-600" size={20} />
              <h2 className="text-lg font-bold text-slate-800">Hosting Package</h2>
            </div>
            {selectedPackage && (
              <span className="text-xs text-slate-500 font-medium">
                Currently: <span className="font-bold text-orange-600">{selectedPackage.name}</span>
              </span>
            )}
          </div>

          <div className="p-6 space-y-4">

            {/* No-package option */}
            <label className={`flex items-center gap-4 p-4 rounded-xl border-2 cursor-pointer transition-all ${
              packageId === null
                ? 'border-slate-400 bg-slate-50'
                : 'border-slate-100 hover:border-slate-200'
            }`}>
              <input
                type="radio"
                name="package"
                className="sr-only"
                checked={packageId === null}
                onChange={() => setPackageId(null)}
              />
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                packageId === null ? 'border-slate-500 bg-slate-500' : 'border-slate-200'
              }`}>
                {packageId === null && <Check size={11} className="text-white" strokeWidth={3} />}
              </div>
              <div>
                <p className="font-bold text-slate-700 text-sm">No Package</p>
                <p className="text-xs text-slate-400">Manual quota controls only</p>
              </div>
            </label>

            {/* Active packages */}
            {activePackages.length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Active Plans</p>
                {activePackages.map((pkg) => (
                  <PackageRadioCard
                    key={pkg.id}
                    pkg={pkg}
                    selected={packageId === pkg.id}
                    onSelect={() => setPackageId(pkg.id)}
                    onApplyLimits={() => applyPackageLimits(pkg)}
                  />
                ))}
              </div>
            )}

            {/* Inactive packages (still assignable, shown dimmed) */}
            {inactivePackages.length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest px-1">Inactive / Legacy Plans</p>
                {inactivePackages.map((pkg) => (
                  <PackageRadioCard
                    key={pkg.id}
                    pkg={pkg}
                    selected={packageId === pkg.id}
                    onSelect={() => setPackageId(pkg.id)}
                    onApplyLimits={() => applyPackageLimits(pkg)}
                    dimmed
                  />
                ))}
              </div>
            )}

            {(!packages || packages.length === 0) && (
              <div className="text-center py-6 text-slate-400 text-sm">
                No packages defined yet.{' '}
                <button type="button" onClick={() => navigate('/packages')} className="text-orange-500 font-semibold hover:underline">
                  Create one →
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── Add-ons (only shown when a package is selected) ── */}
        {packageId !== null && (
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex items-center gap-3">
              <Puzzle className="text-purple-500" size={20} />
              <div>
                <h2 className="text-lg font-bold text-slate-800">Add-ons</h2>
                <p className="text-xs text-slate-400 mt-0.5">Supplemental features on top of the hosting plan.</p>
              </div>
            </div>

            <div className="p-6">
              {availableAddons.length === 0 ? (
                <div className="text-center py-6 text-slate-400 text-sm">
                  No add-ons defined yet.{' '}
                  <button type="button" onClick={() => navigate('/packages')} className="text-orange-500 font-semibold hover:underline">
                    Create one →
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {availableAddons.map((addon) => {
                    const assigned = assignedAddonIds.has(addon.id);
                    const userAddon = userAddons?.find((a) => a.product_id === addon.id);
                    return (
                      <div
                        key={addon.id}
                        className={`flex items-center gap-4 p-4 rounded-xl border-2 transition-all ${
                          assigned
                            ? 'border-purple-300 bg-purple-50/40'
                            : 'border-slate-100 hover:border-slate-200'
                        }`}
                      >
                        {/* Icon */}
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                          assigned ? 'bg-purple-100' : 'bg-slate-100'
                        }`}>
                          <Puzzle size={16} className={assigned ? 'text-purple-500' : 'text-slate-400'} />
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-slate-800 text-sm">{addon.name}</span>
                            {addon.static_ip && (
                              <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">Static IP</span>
                            )}
                            {addon.ssh_access && (
                              <span className="text-[10px] font-bold bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">SSH</span>
                            )}
                            {addon.daily_backups && (
                              <span className="text-[10px] font-bold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">Backups</span>
                            )}
                            {addon.disk_quota_mb > 0 && (
                              <span className="text-[10px] font-bold bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full">
                                +{addon.disk_quota_mb >= 1024 ? `${(addon.disk_quota_mb / 1024).toFixed(0)} GB` : `${addon.disk_quota_mb} MB`} disk
                              </span>
                            )}
                            {addon.email_accounts > 0 && (
                              <span className="text-[10px] font-bold bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full">+{addon.email_accounts} email</span>
                            )}
                          </div>
                          {addon.description && (
                            <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">{addon.description}</p>
                          )}
                          <p className="text-xs font-semibold text-slate-500 mt-1">
                            ${(addon.price_cents / 100).toFixed(2)}/{addon.billing_cycle === 'monthly' ? 'mo' : addon.billing_cycle}
                          </p>
                        </div>

                        {/* Assign / Remove button */}
                        {assigned ? (
                          <button
                            type="button"
                            onClick={() => userAddon && removeAddonMutation.mutate(userAddon.id)}
                            disabled={removeAddonMutation.isPending}
                            className="flex items-center gap-1.5 text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 flex-shrink-0"
                          >
                            <X size={12} />
                            Remove
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => assignAddonMutation.mutate(addon.id)}
                            disabled={assignAddonMutation.isPending}
                            className="flex items-center gap-1.5 text-xs font-bold text-purple-600 bg-purple-50 hover:bg-purple-100 border border-purple-200 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 flex-shrink-0"
                          >
                            <Plus size={12} />
                            Assign
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── SSH Access ── */}
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex items-center gap-3">
            <Terminal className="text-orange-600" size={20} />
            <div>
              <h2 className="text-lg font-bold text-slate-800">SSH Access</h2>
              <p className="text-xs text-slate-400 mt-0.5">Allow this user to log in via SSH with their system shell.</p>
            </div>
          </div>
          <div className="p-6 flex items-center justify-between gap-6">
            <div className="space-y-1">
              <p className="text-sm font-semibold text-slate-700">
                {user?.ssh_enabled ? 'SSH is currently enabled' : 'SSH is currently disabled'}
              </p>
              <p className="text-xs text-slate-400">
                {user?.ssh_enabled
                  ? `${user.username} can log in via SSH with a full bash shell.`
                  : `${user?.username}'s shell is set to nologin — SSH login is blocked.`}
              </p>
            </div>
            <button
              type="button"
              disabled={sshMutation.isPending}
              onClick={() => sshMutation.mutate(!user?.ssh_enabled)}
              className={`relative inline-flex h-7 w-12 flex-shrink-0 cursor-pointer rounded-full border-2 transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-orange-400/40 disabled:opacity-50 ${
                user?.ssh_enabled ? 'bg-green-500 border-green-500' : 'bg-slate-200 border-slate-200'
              }`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform duration-200 ease-in-out mt-0.5 ${
                  user?.ssh_enabled ? 'translate-x-5' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>
        </div>

        {/* ── Resource Quotas ── */}
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Zap className="text-orange-600" size={20} />
              <h2 className="text-lg font-bold text-slate-800">Resource Quotas</h2>
            </div>
            {selectedPackage && (
              <button
                type="button"
                onClick={() => applyPackageLimits(selectedPackage)}
                className="flex items-center gap-1.5 text-xs font-bold text-orange-600 hover:text-orange-700 bg-orange-50 hover:bg-orange-100 px-3 py-1.5 rounded-lg transition-colors"
              >
                <RefreshCw size={12} />
                Reset from "{selectedPackage.name}"
              </button>
            )}
          </div>
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-1.5">
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1">
                <HardDrive size={11} /> Disk Limit (MB)
              </label>
              <input
                type="number" min="1" required
                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-orange-400/40"
                value={diskLimit}
                onChange={(e) => setDiskLimit(parseInt(e.target.value) || 1)}
              />
              {selectedPackage && selectedPackage.disk_quota_mb !== -1 && (
                <p className="text-[10px] text-slate-400 ml-1">
                  Package limit: {fmtDisk(selectedPackage.disk_quota_mb)}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1">
                <Zap size={11} /> Bandwidth Limit (MB)
              </label>
              <input
                type="number" min="1" required
                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-orange-400/40"
                value={bandwidthLimit}
                onChange={(e) => setBandwidthLimit(parseInt(e.target.value) || 1)}
              />
              {selectedPackage && selectedPackage.bandwidth_gb !== -1 && (
                <p className="text-[10px] text-slate-400 ml-1">
                  Package limit: {selectedPackage.bandwidth_gb} GB
                </p>
              )}
            </div>
          </div>
        </div>

        {/* ── Save button ── */}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={updateMutation.isPending}
            className="bg-slate-800 hover:bg-slate-900 text-white px-8 py-3 rounded-xl font-bold transition-all shadow-md shadow-slate-900/10 flex items-center gap-2 text-sm disabled:opacity-50"
          >
            <Save size={16} className="text-orange-400" />
            {updateMutation.isPending ? 'Saving…' : 'Save User Settings'}
          </button>
        </div>
      </form>
    </div>
  );
};

// ── Package radio card ────────────────────────────────────────────────────────

interface PackageRadioCardProps {
  pkg: HostingPackage;
  selected: boolean;
  onSelect: () => void;
  onApplyLimits: () => void;
  dimmed?: boolean;
}

const PackageRadioCard: React.FC<PackageRadioCardProps> = ({
  pkg, selected, onSelect, onApplyLimits, dimmed = false,
}) => {
  const CYCLE_SHORT: Record<string, string> = {
    monthly: '/mo', quarterly: '/qtr', annually: '/yr', onetime: '',
  };

  return (
    <div className={`flex items-center gap-4 p-4 rounded-xl border-2 transition-all ${
      selected
        ? 'border-orange-400 bg-orange-50/50'
        : `border-slate-100 hover:border-slate-200 ${dimmed ? 'opacity-50' : ''}`
    }`}>
      {/* Radio */}
      <button
        type="button"
        onClick={onSelect}
        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
          selected ? 'border-orange-500 bg-orange-500' : 'border-slate-200 hover:border-orange-300'
        }`}
      >
        {selected && <Check size={11} className="text-white" strokeWidth={3} />}
      </button>

      {/* Info */}
      <button type="button" onClick={onSelect} className="flex-1 text-left min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-bold text-slate-800 text-sm">{pkg.name}</span>
          <span className="text-[10px] font-bold uppercase tracking-widest bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">
            {pkg.type}
          </span>
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-xs text-slate-500">
          <span>{fmtDisk(pkg.disk_quota_mb)} disk</span>
          <span>·</span>
          <span>{pkg.bandwidth_gb === -1 ? 'Unlimited' : `${pkg.bandwidth_gb} GB`} bw</span>
          <span>·</span>
          <span>{pkg.email_accounts === -1 ? '∞' : pkg.email_accounts} emails</span>
          <span>·</span>
          <span>{pkg.databases_allowed === -1 ? '∞' : pkg.databases_allowed} DBs</span>
          <span>·</span>
          <span>{pkg.domains_allowed === -1 ? '∞' : pkg.domains_allowed} domains</span>
          {pkg.ssh_access && <><span>·</span><span className="text-green-600 font-medium">SSH</span></>}
          {pkg.ssl_included && <><span>·</span><span className="text-blue-600 font-medium">SSL</span></>}
          {pkg.spam_filter && <><span>·</span><span className="text-purple-600 font-medium">Spam filter</span></>}
        </div>
      </button>

      {/* Price */}
      <div className="text-right flex-shrink-0">
        <p className="font-bold text-slate-800 text-sm">
          ${(pkg.price_cents / 100).toFixed(2)}
          <span className="text-xs font-normal text-slate-400">{CYCLE_SHORT[pkg.billing_cycle]}</span>
        </p>
      </div>

      {/* Apply limits button */}
      {selected && (
        <button
          type="button"
          onClick={onApplyLimits}
          title="Apply package resource limits to quotas below"
          className="flex items-center gap-1 text-[11px] font-bold text-orange-600 bg-orange-100 hover:bg-orange-200 px-2.5 py-1.5 rounded-lg transition-colors flex-shrink-0"
        >
          <RefreshCw size={11} />
          Apply limits
          <ChevronRight size={11} />
        </button>
      )}
    </div>
  );
};

export default UserSettingsPage;
