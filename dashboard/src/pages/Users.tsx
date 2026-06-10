import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import { UserPlus, Mail, User as UserIcon, Calendar, Globe, Settings as SettingsIcon, AlertCircle, Database, LogIn, Box, Network, KeyRound, Copy, Check, Ban, Power } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { User } from '../../../shared/types';
import toast from 'react-hot-toast';

const UsersPage: React.FC = () => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [impersonating, setImpersonating] = useState<number | null>(null);
  const [setupLink, setSetupLink] = useState<{ username: string; url: string } | null>(null);
  const [generatingLink, setGeneratingLink] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  const suspendMutation = useMutation({
    mutationFn: async ({ id, suspend }: { id: number; suspend: boolean }) =>
      (await api.post(`/users/${id}/${suspend ? 'suspend' : 'reactivate'}`)).data,
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success(vars.suspend ? 'Account suspended — sites going offline' : 'Account reactivated — sites coming back online');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Action failed'),
  });

  const handleGenerateSetupLink = async (user: User) => {
    setGeneratingLink(user.id);
    try {
      const res = await api.post(`/users/${user.id}/setup-link`);
      const url = `${window.location.origin}${res.data.path}`;
      setSetupLink({ username: user.username, url });
      setCopied(false);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to generate link');
    } finally {
      setGeneratingLink(null);
    }
  };

  const { data: users, isLoading, error: queryError } = useQuery<User[]>({
    queryKey: ['users'],
    queryFn: async () => {
      const res = await api.get('/users');
      return res.data;
    },
  });

  const createUserMutation = useMutation({
    mutationFn: async (newUser: { username: string, email: string }) => {
      const res = await api.post('/users', newUser);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setIsModalOpen(false);
      setNewUsername('');
      setNewEmail('');
      toast.success('Client created successfully');
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Failed to create client');
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createUserMutation.mutate({ username: newUsername, email: newEmail });
  };

  const handleImpersonate = async (user: User) => {
    setImpersonating(user.id);
    try {
      const res = await api.post(`/auth/impersonate/${user.id}`);
      const { token: clientToken } = res.data as { token: string };
      // Stash the current admin token so the banner can restore it
      const currentToken = localStorage.getItem('token');
      if (currentToken) localStorage.setItem('adminToken', currentToken);
      localStorage.setItem('token', clientToken);
      localStorage.setItem('impersonatedUser', user.username);
      navigate('/client/');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg ?? 'Failed to impersonate user');
    } finally {
      setImpersonating(null);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Account Management</h1>
          <p className="text-slate-500 mt-1">Manage client accounts, limits, and view user metadata.</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="bg-orange-600 hover:bg-orange-700 text-white px-5 py-2.5 rounded-xl font-bold transition-all shadow-md shadow-orange-900/10 flex items-center gap-2 text-sm"
        >
          <UserPlus size={18} />
          Add Client
        </button>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-slate-400">Loading clients...</div>
      ) : queryError ? (
        <div className="text-center py-12 text-red-500 bg-red-50 rounded-2xl border border-red-100 mx-4">
           <AlertCircle className="mx-auto mb-2" size={32} />
           <p className="font-bold">Failed to load clients</p>
           <p className="text-sm opacity-80">{(queryError as any).message}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {users && users.length > 0 ? users.map((user) => (
            <div key={user.id} className="bg-white border border-slate-200 p-6 rounded-2xl hover:shadow-md hover:border-orange-300 transition-all group relative overflow-hidden mx-4 md:mx-0">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-orange-400 to-amber-500 opacity-0 group-hover:opacity-100 transition-opacity"></div>
              <div className="flex items-start justify-between mb-4">
                <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center text-slate-400 group-hover:bg-orange-50 group-hover:text-orange-600 transition-colors shadow-sm">
                  <UserIcon size={24} />
                </div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1 bg-slate-50 px-2 py-1 rounded border border-slate-100">
                  <Calendar size={12} />
                  {new Date(user.created_at).toLocaleDateString()}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <h3 className="text-xl font-bold text-slate-800">{user.username}</h3>
                {(user as any).status === 'suspended' && (
                  <span className="text-[10px] font-bold text-red-700 bg-red-100 border border-red-200 px-2 py-0.5 rounded-full uppercase tracking-wide">Suspended</span>
                )}
              </div>
              <p className="text-slate-500 text-sm flex items-center gap-2 mt-2">
                <Mail size={14} className="text-slate-400" />
                {user.email}
              </p>

              {/* Package badge */}
              <div className="mt-3">
                {(user as any).package_name ? (
                  <button
                    onClick={() => navigate(`/users/${user.id}/settings`)}
                    className="inline-flex items-center gap-1.5 bg-orange-50 hover:bg-orange-100 text-orange-700 border border-orange-200 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors"
                  >
                    <Box size={11} />
                    {(user as any).package_name}
                  </button>
                ) : (
                  <span className="inline-flex items-center gap-1.5 bg-slate-50 text-slate-400 border border-slate-100 px-2.5 py-1 rounded-lg text-[11px] font-medium">
                    <Box size={11} />
                    No package
                  </span>
                )}
              </div>

              <div className="mt-5 pt-4 border-t border-slate-100 grid grid-cols-2 gap-2">
                <button
                  onClick={() => navigate(`/users/${user.id}/websites`)}
                  className="bg-slate-50 hover:bg-orange-50 text-slate-600 hover:text-orange-600 font-semibold text-xs py-2.5 rounded-lg border border-slate-200 transition-colors flex items-center justify-center gap-1.5"
                >
                  <Globe size={13} />
                  Websites
                </button>
                <button
                  onClick={() => navigate(`/users/${user.id}/databases`)}
                  className="bg-slate-50 hover:bg-blue-50 text-slate-600 hover:text-blue-600 font-semibold text-xs py-2.5 rounded-lg border border-slate-200 transition-colors flex items-center justify-center gap-1.5"
                >
                  <Database size={13} />
                  Databases
                </button>
                <button
                  onClick={() => navigate(`/users/${user.id}/email`)}
                  className="bg-slate-50 hover:bg-violet-50 text-slate-600 hover:text-violet-600 font-semibold text-xs py-2.5 rounded-lg border border-slate-200 transition-colors flex items-center justify-center gap-1.5"
                >
                  <Mail size={13} />
                  Email
                </button>
                <button
                  onClick={() => navigate(`/dns?user=${encodeURIComponent(user.username)}`)}
                  className="bg-slate-50 hover:bg-indigo-50 text-slate-600 hover:text-indigo-600 font-semibold text-xs py-2.5 rounded-lg border border-slate-200 transition-colors flex items-center justify-center gap-1.5"
                >
                  <Network size={13} />
                  DNS
                </button>
                <button
                  onClick={() => navigate(`/users/${user.id}/settings`)}
                  className="col-span-2 bg-slate-50 hover:bg-slate-100 text-slate-600 font-semibold text-xs py-2.5 rounded-lg border border-slate-200 transition-colors flex items-center justify-center gap-1.5"
                >
                  <SettingsIcon size={13} />
                  Settings
                </button>
                <button
                  onClick={() => handleImpersonate(user)}
                  disabled={impersonating === user.id}
                  className="col-span-2 bg-amber-50 hover:bg-amber-100 text-amber-700 hover:text-amber-800 font-semibold text-xs py-2.5 rounded-lg border border-amber-200 hover:border-amber-300 transition-colors flex items-center justify-center gap-1.5 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <LogIn size={13} />
                  {impersonating === user.id ? 'Logging in…' : 'Impersonate'}
                </button>
                <button
                  onClick={() => handleGenerateSetupLink(user)}
                  disabled={generatingLink === user.id}
                  className="col-span-2 bg-blue-50 hover:bg-blue-100 text-blue-700 hover:text-blue-800 font-semibold text-xs py-2.5 rounded-lg border border-blue-200 hover:border-blue-300 transition-colors flex items-center justify-center gap-1.5 disabled:opacity-60"
                >
                  <KeyRound size={13} />
                  {generatingLink === user.id ? 'Generating…' : 'Set-password link'}
                </button>
                {(user as any).status === 'suspended' ? (
                  <button
                    onClick={() => suspendMutation.mutate({ id: user.id, suspend: false })}
                    disabled={suspendMutation.isPending}
                    className="col-span-2 bg-green-50 hover:bg-green-100 text-green-700 hover:text-green-800 font-semibold text-xs py-2.5 rounded-lg border border-green-200 hover:border-green-300 transition-colors flex items-center justify-center gap-1.5 disabled:opacity-60"
                  >
                    <Power size={13} /> Reactivate account
                  </button>
                ) : (
                  <button
                    onClick={() => { if (confirm(`Suspend ${user.username}? Their website(s) will go offline immediately.`)) suspendMutation.mutate({ id: user.id, suspend: true }); }}
                    disabled={suspendMutation.isPending}
                    className="col-span-2 bg-red-50 hover:bg-red-100 text-red-700 hover:text-red-800 font-semibold text-xs py-2.5 rounded-lg border border-red-200 hover:border-red-300 transition-colors flex items-center justify-center gap-1.5 disabled:opacity-60"
                  >
                    <Ban size={13} /> Suspend account
                  </button>
                )}
              </div>
            </div>
          )) : (
            <div className="col-span-3 text-center py-20 bg-white border border-dashed border-slate-300 rounded-3xl mx-4">
              <UserIcon className="mx-auto mb-4 text-slate-300" size={48} />
              <h3 className="text-lg font-bold text-slate-800">No Clients Found</h3>
              <p className="text-slate-500">Get started by adding your first hosting client.</p>
            </div>
          )}
        </div>
      )}

      {/* Set-password link modal */}
      {setupLink && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2"><KeyRound size={18} className="text-blue-600" /> Set-password link</h2>
              <button onClick={() => setSetupLink(null)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-slate-600">
                Send this one-time link to <span className="font-bold text-slate-800">{setupLink.username}</span> so they can set their dashboard password. It expires in 7 days and works once.
              </p>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={setupLink.url}
                  onFocus={(e) => e.target.select()}
                  className="flex-1 bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-xs font-mono text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                />
                <button
                  onClick={() => { navigator.clipboard.writeText(setupLink.url).then(() => { setCopied(true); toast.success('Copied'); }); }}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl text-sm font-bold flex items-center gap-1.5"
                >
                  {copied ? <Check size={15} /> : <Copy size={15} />} {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
              <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-xl px-3 py-2">
                This link is shown only once — copy it now. Generating a new link invalidates this one.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add User Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-800">Add New Client</h2>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              <div className="space-y-2">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Username</label>
                <div className="relative">
                  <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input
                    type="text"
                    className="w-full bg-white border border-slate-200 rounded-xl py-3 pl-10 pr-4 text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500/50 transition-all text-sm font-mono"
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
                    placeholder="john_doe"
                    pattern="[a-z_][a-z0-9_-]{0,31}"
                    title="Lowercase letters, numbers, hyphens, underscores only (max 32 chars)"
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input
                    type="email"
                    className="w-full bg-white border border-slate-200 rounded-xl py-3 pl-10 pr-4 text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500/50 transition-all text-sm"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="john@example.com"
                    required
                  />
                </div>
              </div>
              <div className="flex gap-3 pt-4">
                <button 
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 px-4 py-3 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors text-sm"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={createUserMutation.isPending}
                  className="flex-1 px-4 py-3 rounded-xl font-bold text-white bg-orange-600 hover:bg-orange-700 shadow-md shadow-orange-900/10 transition-colors text-sm disabled:opacity-50"
                >
                  {createUserMutation.isPending ? 'Creating...' : 'Create Client'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default UsersPage;
