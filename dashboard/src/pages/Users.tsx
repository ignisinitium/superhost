import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import { UserPlus, Mail, User as UserIcon, Calendar, Globe, Settings as SettingsIcon, AlertCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { User } from '../../../shared/types';
import toast from 'react-hot-toast';

const UsersPage: React.FC = () => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newEmail, setNewEmail] = useState('');

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
              <h3 className="text-xl font-bold text-slate-800">{user.username}</h3>
              <p className="text-slate-500 text-sm flex items-center gap-2 mt-2">
                <Mail size={14} className="text-slate-400" />
                {user.email}
              </p>
              
              <div className="mt-6 pt-6 border-t border-slate-100 flex gap-3">
                <button 
                  onClick={() => navigate(`/domains?user=${user.id}`)}
                  className="flex-1 bg-slate-50 hover:bg-orange-50 text-slate-600 hover:text-orange-600 font-semibold text-xs py-2.5 rounded-lg border border-slate-200 transition-colors flex items-center justify-center gap-2"
                >
                  <Globe size={14} />
                  Manage Websites
                </button>
                <button 
                  onClick={() => navigate(`/users/${user.id}/settings`)}
                  className="flex-1 bg-slate-50 hover:bg-slate-100 text-slate-600 font-semibold text-xs py-2.5 rounded-lg border border-slate-200 transition-colors flex items-center justify-center gap-2"
                >
                  <SettingsIcon size={14} />
                  Settings
                </button>
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
                    onChange={(e) => setNewUsername(e.target.value)}
                    placeholder="john_doe"
                    pattern="[a-zA-Z0-9_-]+"
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
