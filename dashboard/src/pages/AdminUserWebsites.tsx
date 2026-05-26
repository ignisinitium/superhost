import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import {
  Globe, Plus, ArrowLeft, Shield, ShieldCheck,
  Settings2, Trash2, ExternalLink, Loader2,
  CheckCircle, XCircle, AlertTriangle, RefreshCw, FolderOpen,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useTaskMonitor } from '../hooks/useTaskMonitor';
import type { Domain, User } from '../../../shared/types';

const PHP_VERSIONS = ['8.4', '8.3', '8.2', '8.1'];

// ── Main Page ─────────────────────────────────────────────────────────────────
const AdminUserWebsitesPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { monitorTask } = useTaskMonitor();

  const [showAddModal, setShowAddModal]       = useState(false);
  const [configuringDomain, setConfiguringDomain] = useState<Domain | null>(null);
  const [deletingDomain, setDeletingDomain]   = useState<Domain | null>(null);

  // ── Data fetching ────────────────────────────────────────────────────────────
  const { data: user } = useQuery<User>({
    queryKey: ['user', id],
    queryFn: async () => (await api.get(`/users/${id}`)).data,
  });

  const { data: domains = [], isLoading, refetch } = useQuery<Domain[]>({
    queryKey: ['domains', 'user', id],
    queryFn: async () => (await api.get(`/domains?userId=${id}`)).data,
    enabled: !!id,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['domains', 'user', id] });

  // ── Delete ───────────────────────────────────────────────────────────────────
  const deleteMutation = useMutation({
    mutationFn: async (domainId: number) => (await api.delete(`/domains/${domainId}`)).data,
    onSuccess: (data) => {
      invalidate();
      setDeletingDomain(null);
      if (data.taskId) monitorTask(data.taskId, 'Website removed successfully.');
    },
    onError: (err: any) => toast.error(err.response?.data?.message ?? 'Delete failed'),
  });

  // ── SSL ──────────────────────────────────────────────────────────────────────
  const sslMutation = useMutation({
    mutationFn: async (domainId: number) => (await api.post(`/domains/${domainId}/install-ssl`)).data,
    onSuccess: (data) => {
      invalidate();
      if (data.taskId) monitorTask(data.taskId, 'SSL certificate installed!');
    },
    onError: (err: any) => toast.error(err.response?.data?.message ?? 'SSL install failed'),
  });

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in duration-500">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(`/users/${id}/settings`)}
            className="p-2 hover:bg-slate-100 rounded-xl transition-colors text-slate-500"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">
              Websites
              {user && <span className="text-orange-500 ml-2">— {user.username}</span>}
            </h1>
            <p className="text-slate-500 text-sm mt-0.5">
              {domains.length} hosted website{domains.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            disabled={isLoading}
            className="p-2.5 border border-slate-200 bg-white rounded-xl text-slate-500 hover:bg-slate-50 transition-colors"
          >
            <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white px-5 py-2.5 rounded-xl font-bold text-sm transition-all shadow-sm shadow-orange-900/10"
          >
            <Plus size={16} /> Add Website
          </button>
        </div>
      </div>

      {/* ── Content ─────────────────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="flex items-center justify-center py-24 gap-3 text-slate-400">
          <Loader2 size={20} className="animate-spin" />
          <span className="text-sm font-medium">Loading websites…</span>
        </div>
      ) : domains.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 bg-white border border-slate-200 rounded-2xl text-center">
          <div className="w-14 h-14 rounded-2xl bg-orange-50 flex items-center justify-center mb-4">
            <Globe size={28} className="text-orange-400" />
          </div>
          <h3 className="font-bold text-slate-700 mb-1">No websites yet</h3>
          <p className="text-slate-400 text-sm mb-5">Add a domain to get started.</p>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white px-5 py-2.5 rounded-xl font-bold text-sm transition-all"
          >
            <Plus size={16} /> Add Website
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {domains.map(domain => (
            <DomainCard
              key={domain.id}
              domain={domain}
              onConfigure={() => setConfiguringDomain(domain)}
              onDelete={() => setDeletingDomain(domain)}
              onInstallSSL={() => sslMutation.mutate(domain.id)}
              sslPending={sslMutation.isPending}
            />
          ))}
        </div>
      )}

      {/* ── Modals ──────────────────────────────────────────────────────────── */}
      {showAddModal && (
        <AddDomainModal
          userId={parseInt(id!)}
          username={user?.username ?? ''}
          onClose={() => setShowAddModal(false)}
          onSuccess={(taskId) => {
            invalidate();
            setShowAddModal(false);
            if (taskId) monitorTask(taskId, 'Website provisioned successfully!');
          }}
        />
      )}

      {configuringDomain && (
        <ConfigureModal
          domain={configuringDomain}
          onClose={() => setConfiguringDomain(null)}
          onSuccess={(taskId) => {
            invalidate();
            setConfiguringDomain(null);
            if (taskId) monitorTask(taskId, 'Domain configuration updated!');
          }}
        />
      )}

      {deletingDomain && (
        <ConfirmDeleteModal
          domain={deletingDomain}
          isPending={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate(deletingDomain.id)}
          onCancel={() => setDeletingDomain(null)}
        />
      )}
    </div>
  );
};

// ── Domain Card ───────────────────────────────────────────────────────────────
const DomainCard: React.FC<{
  domain: Domain;
  onConfigure: () => void;
  onDelete: () => void;
  onInstallSSL: () => void;
  sslPending: boolean;
}> = ({ domain, onConfigure, onDelete, onInstallSSL, sslPending }) => {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm hover:border-slate-300 transition-all">

      {/* Header */}
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`p-2 rounded-xl flex-shrink-0 ${domain.is_ssl ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
            {domain.is_ssl ? <ShieldCheck size={18} /> : <Globe size={18} />}
          </div>
          <div className="min-w-0">
            <div className="font-bold text-slate-800 truncate">{domain.domain_name}</div>
            <div className="text-[11px] text-slate-400 font-mono truncate mt-0.5">{domain.document_root}</div>
          </div>
        </div>
        <a
          href={`http${domain.is_ssl ? 's' : ''}://${domain.domain_name}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-shrink-0 p-2 text-slate-400 hover:text-orange-500 hover:bg-orange-50 rounded-lg transition-colors"
          title="Visit site"
        >
          <ExternalLink size={15} />
        </a>
      </div>

      {/* Stats row */}
      <div className="px-5 py-3 grid grid-cols-3 gap-2 border-b border-slate-50">
        <Stat label="PHP" value={domain.php_version} />
        <Stat
          label="SSL"
          value={domain.is_ssl ? 'Active' : 'None'}
          valueClass={domain.is_ssl ? 'text-emerald-600' : 'text-slate-400'}
          icon={domain.is_ssl ? <CheckCircle size={11} className="text-emerald-500" /> : <XCircle size={11} className="text-slate-300" />}
        />
        <Stat
          label="Added"
          value={new Date(domain.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}
        />
      </div>

      {/* Actions */}
      <div className="px-5 py-3 flex items-center gap-2">
        <button
          onClick={onConfigure}
          className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl bg-slate-100 hover:bg-orange-50 hover:text-orange-600 text-slate-600 transition-all"
        >
          <Settings2 size={13} /> Configure
        </button>

        {!domain.is_ssl && (
          <button
            onClick={onInstallSSL}
            disabled={sslPending}
            className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 transition-all disabled:opacity-50"
          >
            {sslPending
              ? <Loader2 size={13} className="animate-spin" />
              : <Shield size={13} />
            }
            Install SSL
          </button>
        )}

        {domain.is_ssl && (
          <span className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl bg-emerald-50 text-emerald-700">
            <ShieldCheck size={13} /> SSL Active
          </span>
        )}

        <button
          onClick={onDelete}
          className="ml-auto flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl bg-slate-100 hover:bg-red-50 hover:text-red-600 text-slate-400 transition-all"
        >
          <Trash2 size={13} /> Delete
        </button>
      </div>
    </div>
  );
};

const Stat: React.FC<{ label: string; value: string; valueClass?: string; icon?: React.ReactNode }> = ({
  label, value, valueClass = 'text-slate-700', icon
}) => (
  <div className="text-center">
    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">{label}</div>
    <div className={`text-xs font-bold flex items-center justify-center gap-1 ${valueClass}`}>
      {icon}{value}
    </div>
  </div>
);

// ── Add Domain Modal ──────────────────────────────────────────────────────────
const AddDomainModal: React.FC<{
  userId: number;
  username: string;
  onClose: () => void;
  onSuccess: (taskId?: number) => void;
}> = ({ userId, username, onClose, onSuccess }) => {
  const [domainName, setDomainName] = useState('');
  const [phpVersion, setPhpVersion] = useState('8.3');
  const [isPending, setIsPending] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsPending(true);
    try {
      const res = await api.post('/domains', { userId, domainName, phpVersion });
      onSuccess(res.data.taskId);
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? 'Failed to create domain');
    } finally {
      setIsPending(false);
    }
  };

  return (
    <Modal title="Add Website" subtitle={`Creating domain for ${username}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Domain Name">
          <input
            autoFocus
            value={domainName}
            onChange={e => setDomainName(e.target.value.toLowerCase().trim())}
            placeholder="example.com"
            required
            className={inputCls}
          />
          <p className="text-[11px] text-slate-400 mt-1">
            Document root will be <span className="font-mono">/home/{username}/public_html/{domainName || 'example.com'}</span>
          </p>
        </Field>

        <Field label="PHP Version">
          <select value={phpVersion} onChange={e => setPhpVersion(e.target.value)} className={inputCls}>
            {PHP_VERSIONS.map(v => <option key={v} value={v}>PHP {v}</option>)}
          </select>
        </Field>

        <ModalActions onCancel={onClose} submitLabel="Provision Website" isPending={isPending} />
      </form>
    </Modal>
  );
};

// ── Configure Modal ───────────────────────────────────────────────────────────
const ConfigureModal: React.FC<{
  domain: Domain;
  onClose: () => void;
  onSuccess: (taskId?: number) => void;
}> = ({ domain, onClose, onSuccess }) => {
  const [phpVersion, setPhpVersion]           = useState(domain.php_version);
  const [reverseProxyBlock, setReverseProxy]  = useState('');
  const [isPending, setIsPending]             = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsPending(true);
    try {
      const res = await api.patch(`/domains/${domain.id}`, { phpVersion, reverseProxyBlock });
      onSuccess(res.data.taskId);
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? 'Update failed');
    } finally {
      setIsPending(false);
    }
  };

  return (
    <Modal title={`Configure ${domain.domain_name}`} subtitle="Update PHP version and Nginx directives" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">

        {/* Document root — read-only info */}
        <div className="flex items-center gap-2.5 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
          <FolderOpen size={14} className="text-slate-400 flex-shrink-0" />
          <span className="font-mono text-xs text-slate-600 break-all">{domain.document_root}</span>
        </div>

        <Field label="PHP Version">
          <select value={phpVersion} onChange={e => setPhpVersion(e.target.value)} className={inputCls}>
            {PHP_VERSIONS.map(v => <option key={v} value={v}>PHP {v}</option>)}
          </select>
        </Field>

        <Field label="Custom Nginx Block" optional>
          <textarea
            value={reverseProxyBlock}
            onChange={e => setReverseProxy(e.target.value)}
            rows={5}
            placeholder={`location /api {\n  proxy_pass http://localhost:3000;\n  proxy_set_header Host $host;\n}`}
            className={`${inputCls} font-mono text-xs resize-y`}
          />
          <p className="text-[11px] text-slate-400 mt-1 flex items-center gap-1">
            <AlertTriangle size={10} className="text-amber-400" />
            Injected directly into the Nginx server block. Syntax errors will break the site.
          </p>
        </Field>

        <ModalActions onCancel={onClose} submitLabel="Save Configuration" isPending={isPending} />
      </form>
    </Modal>
  );
};

// ── Confirm Delete Modal ──────────────────────────────────────────────────────
const ConfirmDeleteModal: React.FC<{
  domain: Domain;
  isPending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}> = ({ domain, isPending, onConfirm, onCancel }) => (
  <Modal title="Delete Website" onClose={onCancel}>
    <div className="space-y-4">
      <div className="flex gap-3 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
        <AlertTriangle size={16} className="text-red-500 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-red-700">
          <p className="font-bold mb-1">This action cannot be undone.</p>
          <p>The following will be permanently deleted:</p>
          <ul className="mt-2 space-y-0.5 text-xs list-disc list-inside">
            <li>Nginx configuration for <strong>{domain.domain_name}</strong></li>
            <li>All files in <span className="font-mono">{domain.document_root}</span></li>
            <li>SSL certificate (if installed)</li>
            <li>DNS zone file (if present)</li>
          </ul>
        </div>
      </div>

      <p className="text-sm text-slate-600 text-center">
        Type the domain to confirm deletion.
      </p>
      <ConfirmInput expected={domain.domain_name} onConfirmed={onConfirm} isPending={isPending} onCancel={onCancel} />
    </div>
  </Modal>
);

const ConfirmInput: React.FC<{
  expected: string;
  onConfirmed: () => void;
  isPending: boolean;
  onCancel: () => void;
}> = ({ expected, onConfirmed, isPending, onCancel }) => {
  const [value, setValue] = useState('');
  const matches = value === expected;
  return (
    <div className="space-y-3">
      <input
        value={value}
        onChange={e => setValue(e.target.value)}
        placeholder={expected}
        className={`${inputCls} font-mono ${matches ? 'border-red-400 ring-1 ring-red-300' : ''}`}
      />
      <div className="flex gap-3">
        <button onClick={onCancel} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-bold hover:bg-slate-50 transition-colors">
          Cancel
        </button>
        <button
          onClick={onConfirmed}
          disabled={!matches || isPending}
          className="flex-1 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-bold transition-all disabled:opacity-40 flex items-center justify-center gap-2"
        >
          {isPending ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
          Delete Website
        </button>
      </div>
    </div>
  );
};

// ── Shared UI helpers ─────────────────────────────────────────────────────────
const inputCls = 'w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400/30 focus:border-orange-400 bg-white';

const Field: React.FC<{ label: string; optional?: boolean; children: React.ReactNode }> = ({ label, optional, children }) => (
  <div className="space-y-1.5">
    <label className="flex items-center gap-1.5 text-xs font-bold text-slate-600">
      {label}
      {optional && <span className="text-slate-400 font-normal">(optional)</span>}
    </label>
    {children}
  </div>
);

const Modal: React.FC<{ title: string; subtitle?: string; onClose?: () => void; children: React.ReactNode }> = ({
  title, subtitle, children
}) => (
  <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
    <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
      <div className="px-6 py-5 border-b border-slate-100">
        <h2 className="font-bold text-slate-800 text-lg">{title}</h2>
        {subtitle && <p className="text-slate-400 text-sm mt-0.5">{subtitle}</p>}
      </div>
      <div className="px-6 py-5">{children}</div>
    </div>
  </div>
);

const ModalActions: React.FC<{ onCancel: () => void; submitLabel: string; isPending: boolean }> = ({
  onCancel, submitLabel, isPending
}) => (
  <div className="flex gap-3 pt-2">
    <button type="button" onClick={onCancel} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-bold hover:bg-slate-50 transition-colors">
      Cancel
    </button>
    <button
      type="submit"
      disabled={isPending}
      className="flex-1 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-2"
    >
      {isPending && <Loader2 size={14} className="animate-spin" />}
      {submitLabel}
    </button>
  </div>
);

export default AdminUserWebsitesPage;
