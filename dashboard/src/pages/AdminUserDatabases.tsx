import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import {
  Database, Plus, ArrowLeft, RefreshCw, Loader2,
  KeyRound, Trash2, AlertTriangle, Eye, EyeOff, Copy, Check,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useTaskMonitor } from '../hooks/useTaskMonitor';
import type { Database as DbRecord, User } from '../../../shared/types';

// ── Main Page ─────────────────────────────────────────────────────────────────
const AdminUserDatabasesPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { monitorTask } = useTaskMonitor();

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [changingPw, setChangingPw]           = useState<DbRecord | null>(null);
  const [deletingDb, setDeletingDb]           = useState<DbRecord | null>(null);

  // ── Data fetching ────────────────────────────────────────────────────────────
  const { data: user } = useQuery<User>({
    queryKey: ['user', id],
    queryFn: async () => (await api.get(`/users/${id}`)).data,
  });

  const { data: databases = [], isLoading, refetch } = useQuery<DbRecord[]>({
    queryKey: ['databases', 'user', id],
    queryFn: async () => (await api.get(`/admin/databases?userId=${id}`)).data,
    enabled: !!id,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['databases', 'user', id] });

  // ── Delete ───────────────────────────────────────────────────────────────────
  const deleteMutation = useMutation({
    mutationFn: async (dbId: number) => (await api.delete(`/admin/databases/${dbId}`)).data,
    onSuccess: (data) => {
      invalidate();
      setDeletingDb(null);
      if (data.taskId) monitorTask(data.taskId, 'Database removed successfully.');
    },
    onError: (err: any) => toast.error(err.response?.data?.message ?? 'Delete failed'),
  });

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-in fade-in duration-500">

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
              Databases
              {user && <span className="text-orange-500 ml-2">— {user.username}</span>}
            </h1>
            <p className="text-slate-500 text-sm mt-0.5">
              {databases.length} database{databases.length !== 1 ? 's' : ''}
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
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white px-5 py-2.5 rounded-xl font-bold text-sm transition-all shadow-sm shadow-orange-900/10"
          >
            <Plus size={16} /> Create Database
          </button>
        </div>
      </div>

      {/* ── Content ─────────────────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="flex items-center justify-center py-24 gap-3 text-slate-400">
          <Loader2 size={20} className="animate-spin" />
          <span className="text-sm font-medium">Loading databases…</span>
        </div>
      ) : databases.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 bg-white border border-slate-200 rounded-2xl text-center">
          <div className="w-14 h-14 rounded-2xl bg-orange-50 flex items-center justify-center mb-4">
            <Database size={28} className="text-orange-400" />
          </div>
          <h3 className="font-bold text-slate-700 mb-1">No databases yet</h3>
          <p className="text-slate-400 text-sm mb-5">Create a MariaDB database for this user.</p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white px-5 py-2.5 rounded-xl font-bold text-sm transition-all"
          >
            <Plus size={16} /> Create Database
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {databases.map(db => (
            <DatabaseCard
              key={db.id}
              db={db}
              onChangePassword={() => setChangingPw(db)}
              onDelete={() => setDeletingDb(db)}
            />
          ))}
        </div>
      )}

      {/* ── Modals ──────────────────────────────────────────────────────────── */}
      {showCreateModal && user && (
        <CreateDatabaseModal
          userId={parseInt(id!)}
          username={user.username}
          onClose={() => setShowCreateModal(false)}
          onSuccess={(taskId) => {
            invalidate();
            setShowCreateModal(false);
            if (taskId) monitorTask(taskId, 'Database created successfully!');
          }}
        />
      )}

      {changingPw && (
        <ChangePasswordModal
          db={changingPw}
          onClose={() => setChangingPw(null)}
          onSuccess={(taskId) => {
            setChangingPw(null);
            if (taskId) monitorTask(taskId, 'Database password updated!');
          }}
        />
      )}

      {deletingDb && (
        <ConfirmDeleteModal
          db={deletingDb}
          isPending={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate(deletingDb.id)}
          onCancel={() => setDeletingDb(null)}
        />
      )}
    </div>
  );
};

// ── Database Card ─────────────────────────────────────────────────────────────
const DatabaseCard: React.FC<{
  db: DbRecord;
  onChangePassword: () => void;
  onDelete: () => void;
}> = ({ db, onChangePassword, onDelete }) => {
  const [copied, setCopied] = useState(false);

  const copyUser = async () => {
    await navigator.clipboard.writeText(db.db_user);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm hover:border-slate-300 transition-all">

      {/* Header */}
      <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3">
        <div className="p-2 rounded-xl bg-blue-50 text-blue-600 flex-shrink-0">
          <Database size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-bold text-slate-800 font-mono truncate">{db.db_name}</div>
          <div className="text-[11px] text-slate-400 mt-0.5">MariaDB database</div>
        </div>
      </div>

      {/* Info row */}
      <div className="px-5 py-3 border-b border-slate-50 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">DB User</span>
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-xs text-slate-700">{db.db_user}</span>
            <button
              onClick={copyUser}
              className="p-1 rounded text-slate-300 hover:text-orange-500 transition-colors"
              title="Copy username"
            >
              {copied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
            </button>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Created</span>
          <span className="text-xs text-slate-500">
            {new Date(db.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="px-5 py-3 flex items-center gap-2">
        <button
          onClick={onChangePassword}
          className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-600 transition-all"
        >
          <KeyRound size={13} /> Change Password
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

// ── Create Database Modal ─────────────────────────────────────────────────────
const CreateDatabaseModal: React.FC<{
  userId: number;
  username: string;
  onClose: () => void;
  onSuccess: (taskId?: number) => void;
}> = ({ userId, username, onClose, onSuccess }) => {
  const [dbName, setDbName]       = useState('');
  const [password, setPassword]   = useState('');
  const [showPw, setShowPw]       = useState(false);
  const [isPending, setIsPending] = useState(false);

  const safeName = dbName.replace(/[^a-zA-Z0-9_]/g, '');
  const fullName = safeName ? `${username}_${safeName}` : `${username}_…`;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) { toast.error('Password is required'); return; }
    setIsPending(true);
    try {
      const res = await api.post('/admin/databases', { userId, dbName, dbPassword: password });
      onSuccess(res.data.taskId);
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? 'Failed to create database');
    } finally {
      setIsPending(false);
    }
  };

  return (
    <Modal title="Create Database" subtitle={`New MariaDB database for ${username}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">

        <Field label="Database Name">
          <input
            autoFocus
            value={dbName}
            onChange={e => setDbName(e.target.value)}
            placeholder="myapp"
            required
            className={inputCls}
          />
          <p className="text-[11px] text-slate-400 mt-1">
            Full name: <span className="font-mono font-medium text-slate-600">{fullName}</span>
          </p>
        </Field>

        <Field label="Database Password">
          <div className="relative">
            <input
              type={showPw ? 'text' : 'password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Strong password"
              required
              className={`${inputCls} pr-10`}
            />
            <button
              type="button"
              onClick={() => setShowPw(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            DB user <span className="font-mono font-medium text-slate-600">{username}_{safeName || '…'}</span> will be granted full access.
          </p>
        </Field>

        <ModalActions onCancel={onClose} submitLabel="Create Database" isPending={isPending} />
      </form>
    </Modal>
  );
};

// ── Change Password Modal ─────────────────────────────────────────────────────
const ChangePasswordModal: React.FC<{
  db: DbRecord;
  onClose: () => void;
  onSuccess: (taskId?: number) => void;
}> = ({ db, onClose, onSuccess }) => {
  const [newPassword, setNewPassword]   = useState('');
  const [confirmPw, setConfirmPw]       = useState('');
  const [showPw, setShowPw]             = useState(false);
  const [isPending, setIsPending]       = useState(false);

  const mismatch = confirmPw.length > 0 && newPassword !== confirmPw;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPw) { toast.error('Passwords do not match'); return; }
    if (newPassword.length < 8) { toast.error('Password must be at least 8 characters'); return; }
    setIsPending(true);
    try {
      const res = await api.put(`/admin/databases/${db.id}/password`, { newPassword });
      onSuccess(res.data.taskId);
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? 'Failed to change password');
    } finally {
      setIsPending(false);
    }
  };

  return (
    <Modal title="Change Password" subtitle={`DB user: ${db.db_user}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">

        {/* DB info chip */}
        <div className="flex items-center gap-2.5 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
          <Database size={14} className="text-slate-400 flex-shrink-0" />
          <span className="font-mono text-xs text-slate-600">{db.db_name}</span>
        </div>

        <Field label="New Password">
          <div className="relative">
            <input
              autoFocus
              type={showPw ? 'text' : 'password'}
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              placeholder="Min. 8 characters"
              required
              className={`${inputCls} pr-10`}
            />
            <button
              type="button"
              onClick={() => setShowPw(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
        </Field>

        <Field label="Confirm Password">
          <input
            type={showPw ? 'text' : 'password'}
            value={confirmPw}
            onChange={e => setConfirmPw(e.target.value)}
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

// ── Confirm Delete Modal ──────────────────────────────────────────────────────
const ConfirmDeleteModal: React.FC<{
  db: DbRecord;
  isPending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}> = ({ db, isPending, onConfirm, onCancel }) => {
  const [value, setValue] = useState('');
  const matches = value === db.db_name;

  return (
    <Modal title="Delete Database" onClose={onCancel}>
      <div className="space-y-4">
        <div className="flex gap-3 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
          <AlertTriangle size={16} className="text-red-500 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-red-700">
            <p className="font-bold mb-1">This action cannot be undone.</p>
            <p className="text-xs">The following will be permanently removed:</p>
            <ul className="mt-2 space-y-0.5 text-xs list-disc list-inside">
              <li>Database <span className="font-mono font-bold">{db.db_name}</span></li>
              <li>Database user <span className="font-mono font-bold">{db.db_user}</span></li>
              <li>All tables and data inside the database</li>
            </ul>
          </div>
        </div>

        <p className="text-sm text-slate-600 text-center">
          Type the database name to confirm.
        </p>

        <input
          value={value}
          onChange={e => setValue(e.target.value)}
          placeholder={db.db_name}
          className={`${inputCls} font-mono ${matches ? 'border-red-400 ring-1 ring-red-300' : ''}`}
        />

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-bold hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={!matches || isPending}
            className="flex-1 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-bold transition-all disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {isPending ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
            Delete Database
          </button>
        </div>
      </div>
    </Modal>
  );
};

// ── Shared UI helpers ─────────────────────────────────────────────────────────
const inputCls = 'w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400/30 focus:border-orange-400 bg-white';

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="space-y-1.5">
    <label className="block text-xs font-bold text-slate-600">{label}</label>
    {children}
  </div>
);

const Modal: React.FC<{ title: string; subtitle?: string; onClose?: () => void; children: React.ReactNode }> = ({
  title, subtitle, children,
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
  onCancel, submitLabel, isPending,
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

export default AdminUserDatabasesPage;
