import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import {
  Mail, Plus, ArrowLeft, RefreshCw, Loader2, KeyRound, Trash2,
  AlertTriangle, Eye, EyeOff, HardDrive, Shield, ShieldOff,
  ChevronDown, Copy, Check, ExternalLink,
} from 'lucide-react';
import toast from 'react-hot-toast';
import type { User } from '../../../shared/types';

interface Mailbox {
  id: number;
  email: string;
  domain_name: string;
  quota: number;
  spam_filter_enabled: boolean;
  created_at: string;
  owner?: string;
}

interface Domain { id: number; domain_name: string; }

// ── Page ──────────────────────────────────────────────────────────────────────
const AdminEmailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [showCreate,  setShowCreate]  = useState(false);
  const [changingPw,  setChangingPw]  = useState<Mailbox | null>(null);
  const [editQuota,   setEditQuota]   = useState<Mailbox | null>(null);
  const [deleting,    setDeleting]    = useState<Mailbox | null>(null);

  const { data: user } = useQuery<User>({
    queryKey: ['user', id],
    queryFn: async () => (await api.get(`/users/${id}`)).data,
    enabled: !!id,
  });

  const { data: mailboxes = [], isLoading, refetch } = useQuery<Mailbox[]>({
    queryKey: ['admin-email', id],
    queryFn: async () => (await api.get(`/admin/email?userId=${id}`)).data,
    enabled: !!id,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin-email', id] });

  const deleteMutation = useMutation({
    mutationFn: async (mbId: number) => (await api.delete(`/admin/email/${mbId}`)).data,
    onSuccess: () => { invalidate(); setDeleting(null); toast.success('Mailbox deleted'); },
    onError: (err: any) => toast.error(err.response?.data?.message ?? 'Delete failed'),
  });

  const spamMutation = useMutation({
    mutationFn: async ({ mbId, enabled }: { mbId: number; enabled: boolean }) =>
      (await api.patch(`/admin/email/${mbId}`, { spamFilterEnabled: enabled })).data,
    onSuccess: () => { invalidate(); toast.success('Spam filter updated'); },
    onError: (err: any) => toast.error(err.response?.data?.message ?? 'Update failed'),
  });

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-in fade-in duration-500">

      {/* Header */}
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
              Email Accounts
              {user && <span className="text-orange-500 ml-2">— {user.username}</span>}
            </h1>
            <p className="text-slate-500 text-sm mt-0.5">
              {mailboxes.length} mailbox{mailboxes.length !== 1 ? 'es' : ''}
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
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white px-5 py-2.5 rounded-xl font-bold text-sm transition-all shadow-sm shadow-orange-900/10"
          >
            <Plus size={16} /> Add Mailbox
          </button>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-24 gap-3 text-slate-400">
          <Loader2 size={20} className="animate-spin" />
          <span className="text-sm font-medium">Loading mailboxes…</span>
        </div>
      ) : mailboxes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 bg-white border border-slate-200 rounded-2xl text-center">
          <div className="w-14 h-14 rounded-2xl bg-orange-50 flex items-center justify-center mb-4">
            <Mail size={28} className="text-orange-400" />
          </div>
          <h3 className="font-bold text-slate-700 mb-1">No mailboxes yet</h3>
          <p className="text-slate-400 text-sm mb-5">
            Create an email account for one of this user's domains.
          </p>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white px-5 py-2.5 rounded-xl font-bold text-sm transition-all"
          >
            <Plus size={16} /> Add Mailbox
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {mailboxes.map(mb => (
            <MailboxCard
              key={mb.id}
              mb={mb}
              onChangePassword={() => setChangingPw(mb)}
              onEditQuota={() => setEditQuota(mb)}
              onToggleSpam={() => spamMutation.mutate({ mbId: mb.id, enabled: !mb.spam_filter_enabled })}
              onDelete={() => setDeleting(mb)}
              onOpenWebmail={() => window.open(`/webmail/?_user=${encodeURIComponent(mb.email)}`, '_blank', 'noopener')}
            />
          ))}
        </div>
      )}

      {/* Modals */}
      {showCreate && id && (
        <CreateMailboxModal
          userId={parseInt(id, 10)}
          username={user?.username ?? ''}
          onClose={() => setShowCreate(false)}
          onSuccess={() => { invalidate(); setShowCreate(false); toast.success('Mailbox created!'); }}
        />
      )}
      {changingPw && (
        <ChangePasswordModal
          mb={changingPw}
          onClose={() => setChangingPw(null)}
          onSuccess={() => { setChangingPw(null); toast.success('Password change queued'); }}
        />
      )}
      {editQuota && (
        <EditQuotaModal
          mb={editQuota}
          onClose={() => setEditQuota(null)}
          onSuccess={() => { invalidate(); setEditQuota(null); toast.success('Quota updated'); }}
        />
      )}
      {deleting && (
        <ConfirmDeleteModal
          mb={deleting}
          isPending={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate(deleting.id)}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  );
};

// ── Mailbox Card ──────────────────────────────────────────────────────────────
const MailboxCard: React.FC<{
  mb: Mailbox;
  onChangePassword: () => void;
  onEditQuota: () => void;
  onToggleSpam: () => void;
  onDelete: () => void;
  onOpenWebmail: () => void;
}> = ({ mb, onChangePassword, onEditQuota, onToggleSpam, onDelete, onOpenWebmail }) => {
  const [copied, setCopied] = useState(false);

  const copyEmail = async () => {
    await navigator.clipboard.writeText(mb.email);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const quotaLabel = mb.quota >= 1024
    ? `${(mb.quota / 1024).toFixed(mb.quota % 1024 === 0 ? 0 : 1)} GB`
    : `${mb.quota} MB`;

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm hover:border-slate-300 transition-all">

      {/* Header */}
      <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3">
        <div className="p-2 rounded-xl bg-orange-50 text-orange-500 flex-shrink-0">
          <Mail size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-bold text-slate-800 font-mono text-sm truncate">{mb.email}</div>
          <div className="text-[11px] text-slate-400 mt-0.5">{mb.domain_name}</div>
        </div>
        <button
          onClick={copyEmail}
          className="p-1.5 rounded-lg text-slate-300 hover:text-orange-500 transition-colors flex-shrink-0"
          title="Copy email"
        >
          {copied ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}
        </button>
      </div>

      {/* Stats row */}
      <div className="px-5 py-3 border-b border-slate-50 grid grid-cols-2 gap-3">
        <Stat label="Quota" value={quotaLabel} icon={<HardDrive size={12} />} />
        <Stat
          label="Spam Filter"
          value={mb.spam_filter_enabled ? 'Enabled' : 'Disabled'}
          icon={mb.spam_filter_enabled ? <Shield size={12} /> : <ShieldOff size={12} />}
          valueClass={mb.spam_filter_enabled ? 'text-emerald-600' : 'text-slate-400'}
        />
      </div>

      {/* Created */}
      <div className="px-5 py-2 border-b border-slate-50">
        <span className="text-[10px] text-slate-400">
          Created {new Date(mb.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
        </span>
      </div>

      {/* Actions */}
      <div className="px-5 py-3 flex flex-wrap items-center gap-2">
        <ActionBtn onClick={onChangePassword} icon={<KeyRound size={13} />} label="Password" />
        <ActionBtn onClick={onEditQuota}      icon={<HardDrive size={13} />} label="Quota" />
        <ActionBtn
          onClick={onToggleSpam}
          icon={mb.spam_filter_enabled ? <ShieldOff size={13} /> : <Shield size={13} />}
          label={mb.spam_filter_enabled ? 'Disable Spam' : 'Enable Spam'}
        />
        <button
          onClick={onOpenWebmail}
          title="Open in Roundcube webmail"
          className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl bg-sky-50 hover:bg-sky-100 text-sky-600 hover:text-sky-700 border border-sky-100 hover:border-sky-200 transition-all"
        >
          <ExternalLink size={13} /> Webmail
        </button>
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

const Stat: React.FC<{ label: string; value: string; icon: React.ReactNode; valueClass?: string }> = ({
  label, value, icon, valueClass = 'text-slate-700',
}) => (
  <div>
    <div className="flex items-center gap-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">
      {icon} {label}
    </div>
    <div className={`text-xs font-bold ${valueClass}`}>{value}</div>
  </div>
);

const ActionBtn: React.FC<{ onClick: () => void; icon: React.ReactNode; label: string }> = ({ onClick, icon, label }) => (
  <button
    onClick={onClick}
    className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-600 transition-all"
  >
    {icon} {label}
  </button>
);

// ── Create Mailbox Modal ───────────────────────────────────────────────────────
const CreateMailboxModal: React.FC<{
  userId: number;
  username: string;
  onClose: () => void;
  onSuccess: () => void;
}> = ({ userId, username, onClose, onSuccess }) => {
  const [localPart, setLocalPart] = useState('');
  const [domainId,  setDomainId]  = useState('');
  const [password,  setPassword]  = useState('');
  const [quota,     setQuota]     = useState('1024');
  const [showPw,    setShowPw]    = useState(false);
  const [isPending, setIsPending] = useState(false);

  const { data: domains = [] } = useQuery<Domain[]>({
    queryKey: ['admin-email-domains', userId],
    queryFn: async () => (await api.get(`/admin/email/domains?userId=${userId}`)).data,
  });

  const selectedDomain = domains.find(d => d.id === parseInt(domainId, 10));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!domainId) { toast.error('Please select a domain'); return; }
    setIsPending(true);
    try {
      await api.post('/admin/email', { userId, domainId: parseInt(domainId, 10), localPart, password, quota: parseInt(quota, 10) });
      onSuccess();
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? 'Failed to create mailbox');
    } finally {
      setIsPending(false);
    }
  };

  return (
    <Modal title="Add Mailbox" subtitle={`New email account for ${username}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">

        <Field label="Domain">
          <div className="relative">
            <select
              value={domainId}
              onChange={e => setDomainId(e.target.value)}
              required
              className={`${inputCls} appearance-none pr-8`}
            >
              <option value="">Select a domain…</option>
              {domains.map(d => (
                <option key={d.id} value={d.id}>{d.domain_name}</option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>
          {domains.length === 0 && (
            <p className="text-[11px] text-amber-600 mt-1">This user has no domains yet.</p>
          )}
        </Field>

        <Field label="Local Part">
          <div className="flex items-stretch gap-2">
            <input
              autoFocus
              value={localPart}
              onChange={e => setLocalPart(e.target.value.toLowerCase().replace(/[^a-z0-9._%+\-]/g, ''))}
              placeholder="info"
              required
              className={`${inputCls} flex-1`}
            />
            {selectedDomain && (
              <span className="flex items-center px-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-500 font-mono whitespace-nowrap">
                @{selectedDomain.domain_name}
              </span>
            )}
          </div>
        </Field>

        <Field label="Password">
          <div className="relative">
            <input
              type={showPw ? 'text' : 'password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Min. 8 characters"
              required
              className={`${inputCls} pr-10`}
            />
            <button type="button" onClick={() => setShowPw(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
        </Field>

        <Field label="Storage Quota">
          <div className="flex items-stretch gap-2">
            <input
              type="number"
              value={quota}
              onChange={e => setQuota(e.target.value)}
              min={100}
              max={102400}
              required
              className={`${inputCls} flex-1`}
            />
            <span className="flex items-center px-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-500 whitespace-nowrap">
              MB
            </span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            {parseInt(quota, 10) >= 1024
              ? `${(parseInt(quota, 10) / 1024).toFixed(1)} GB`
              : `${quota} MB`}
            {' '}— min 100 MB, max 100 GB
          </p>
        </Field>

        <ModalActions onCancel={onClose} submitLabel="Create Mailbox" isPending={isPending} />
      </form>
    </Modal>
  );
};

// ── Change Password Modal ─────────────────────────────────────────────────────
const ChangePasswordModal: React.FC<{
  mb: Mailbox;
  onClose: () => void;
  onSuccess: () => void;
}> = ({ mb, onClose, onSuccess }) => {
  const [password,  setPassword]  = useState('');
  const [confirm,   setConfirm]   = useState('');
  const [showPw,    setShowPw]    = useState(false);
  const [isPending, setIsPending] = useState(false);

  const mismatch = confirm.length > 0 && password !== confirm;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) { toast.error('Passwords do not match'); return; }
    if (password.length < 8)  { toast.error('Password must be at least 8 characters'); return; }
    setIsPending(true);
    try {
      await api.patch(`/admin/email/${mb.id}/password`, { password });
      onSuccess();
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? 'Failed to change password');
    } finally {
      setIsPending(false);
    }
  };

  return (
    <Modal title="Change Password" subtitle={mb.email} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex items-center gap-2.5 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
          <Mail size={14} className="text-slate-400 flex-shrink-0" />
          <span className="font-mono text-xs text-slate-600">{mb.email}</span>
        </div>

        <Field label="New Password">
          <div className="relative">
            <input
              autoFocus
              type={showPw ? 'text' : 'password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Min. 8 characters"
              required
              className={`${inputCls} pr-10`}
            />
            <button type="button" onClick={() => setShowPw(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
        </Field>

        <Field label="Confirm Password">
          <input
            type={showPw ? 'text' : 'password'}
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            placeholder="Repeat password"
            required
            className={`${inputCls} ${mismatch ? 'border-red-400 ring-1 ring-red-300' : ''}`}
          />
          {mismatch && (
            <p className="text-[11px] text-red-500 mt-1 flex items-center gap-1">
              <AlertTriangle size={10} /> Passwords do not match
            </p>
          )}
        </Field>

        <ModalActions onCancel={onClose} submitLabel="Update Password" isPending={isPending} />
      </form>
    </Modal>
  );
};

// ── Edit Quota Modal ───────────────────────────────────────────────────────────
const EditQuotaModal: React.FC<{
  mb: Mailbox;
  onClose: () => void;
  onSuccess: () => void;
}> = ({ mb, onClose, onSuccess }) => {
  const [quota,     setQuota]     = useState(String(mb.quota));
  const [isPending, setIsPending] = useState(false);

  const presets = [
    { label: '500 MB', value: 500 },
    { label: '1 GB',   value: 1024 },
    { label: '5 GB',   value: 5120 },
    { label: '10 GB',  value: 10240 },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = parseInt(quota, 10);
    if (!q || q < 100 || q > 102400) { toast.error('Quota must be 100 MB – 100 GB'); return; }
    setIsPending(true);
    try {
      await api.patch(`/admin/email/${mb.id}`, { quota: q });
      onSuccess();
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? 'Failed to update quota');
    } finally {
      setIsPending(false);
    }
  };

  return (
    <Modal title="Storage Quota" subtitle={mb.email} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex items-center gap-2.5 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
          <Mail size={14} className="text-slate-400 flex-shrink-0" />
          <span className="font-mono text-xs text-slate-600">{mb.email}</span>
          <span className="ml-auto text-xs text-slate-500 font-medium">
            Currently {mb.quota >= 1024 ? `${(mb.quota / 1024).toFixed(1)} GB` : `${mb.quota} MB`}
          </span>
        </div>

        {/* Quick presets */}
        <div className="grid grid-cols-4 gap-2">
          {presets.map(p => (
            <button
              key={p.value}
              type="button"
              onClick={() => setQuota(String(p.value))}
              className={`py-2 rounded-xl text-xs font-bold border transition-all ${
                parseInt(quota, 10) === p.value
                  ? 'bg-orange-500 text-white border-orange-500'
                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-orange-300'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <Field label="Custom (MB)">
          <div className="flex items-stretch gap-2">
            <input
              type="number"
              value={quota}
              onChange={e => setQuota(e.target.value)}
              min={100}
              max={102400}
              required
              className={`${inputCls} flex-1`}
            />
            <span className="flex items-center px-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-500">
              MB
            </span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            = {parseInt(quota, 10) >= 1024 ? `${(parseInt(quota, 10) / 1024).toFixed(2)} GB` : `${quota} MB`}
          </p>
        </Field>

        <ModalActions onCancel={onClose} submitLabel="Save Quota" isPending={isPending} />
      </form>
    </Modal>
  );
};

// ── Confirm Delete Modal ───────────────────────────────────────────────────────
const ConfirmDeleteModal: React.FC<{
  mb: Mailbox;
  isPending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}> = ({ mb, isPending, onConfirm, onCancel }) => {
  const [value, setValue] = useState('');
  const matches = value === mb.email;

  return (
    <Modal title="Delete Mailbox" onClose={onCancel}>
      <div className="space-y-4">
        <div className="flex gap-3 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
          <AlertTriangle size={16} className="text-red-500 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-red-700">
            <p className="font-bold mb-1">This action cannot be undone.</p>
            <ul className="text-xs space-y-0.5 list-disc list-inside">
              <li>Mailbox <span className="font-mono font-bold">{mb.email}</span></li>
              <li>All stored emails and settings</li>
              <li>Any configured auto-responders</li>
            </ul>
          </div>
        </div>
        <p className="text-sm text-slate-600 text-center">
          Type the email address to confirm deletion.
        </p>
        <input
          value={value}
          onChange={e => setValue(e.target.value)}
          placeholder={mb.email}
          className={`${inputCls} font-mono ${matches ? 'border-red-400 ring-1 ring-red-300' : ''}`}
        />
        <div className="flex gap-3">
          <button onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-bold hover:bg-slate-50 transition-colors">
            Cancel
          </button>
          <button onClick={onConfirm}
            disabled={!matches || isPending}
            className="flex-1 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-bold transition-all disabled:opacity-40 flex items-center justify-center gap-2">
            {isPending ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
            Delete Mailbox
          </button>
        </div>
      </div>
    </Modal>
  );
};

// ── Shared helpers ─────────────────────────────────────────────────────────────
const inputCls = 'w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400/30 focus:border-orange-400 bg-white';

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="space-y-1.5">
    <label className="block text-xs font-bold text-slate-600">{label}</label>
    {children}
  </div>
);

const Modal: React.FC<{ title: string; subtitle?: string; onClose?: () => void; children: React.ReactNode }> = ({
  title, subtitle, onClose, children,
}) => (
  <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
    <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
      <div className="px-6 py-5 border-b border-slate-100 flex items-start justify-between gap-4">
        <div>
          <h2 className="font-bold text-slate-800 text-lg">{title}</h2>
          {subtitle && <p className="text-slate-400 text-sm mt-0.5 font-mono">{subtitle}</p>}
        </div>
        {onClose && (
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 mt-0.5">✕</button>
        )}
      </div>
      <div className="px-6 py-5">{children}</div>
    </div>
  </div>
);

const ModalActions: React.FC<{ onCancel: () => void; submitLabel: string; isPending: boolean }> = ({
  onCancel, submitLabel, isPending,
}) => (
  <div className="flex gap-3 pt-2">
    <button type="button" onClick={onCancel}
      className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-bold hover:bg-slate-50 transition-colors">
      Cancel
    </button>
    <button type="submit" disabled={isPending}
      className="flex-1 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-2">
      {isPending && <Loader2 size={14} className="animate-spin" />}
      {submitLabel}
    </button>
  </div>
);

export default AdminEmailPage;
