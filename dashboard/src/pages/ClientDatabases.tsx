import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import { Database, Plus, Trash2, Key } from 'lucide-react';
import toast from 'react-hot-toast';

interface DBItem {
  id: number;
  db_name: string;
  db_user: string;
  created_at: string;
}

const ClientDatabasesPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [dbName, setDbName] = useState('');
  const [dbPassword, setDbPassword] = useState('');

  const { data: databases, isLoading } = useQuery<DBItem[]>({
    queryKey: ['clientDatabases'],
    queryFn: async () => {
      const res = await api.get('/client/databases');
      return res.data;
    }
  });

  const createDbMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/client/databases', { dbName, dbPassword });
      return res.data;
    },
    onSuccess: () => {
      toast.success('Database creation queued!');
      setIsModalOpen(false);
      setDbName('');
      setDbPassword('');
      queryClient.invalidateQueries({ queryKey: ['clientDatabases'] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Failed to create database');
    }
  });

  const deleteDbMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await api.delete(`/client/databases/${id}`);
      return res.data;
    },
    onSuccess: () => {
      toast.success('Database deletion queued!');
      queryClient.invalidateQueries({ queryKey: ['clientDatabases'] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Failed to delete database');
    }
  });

  const handleOpenPhpMyAdmin = async (e: React.MouseEvent) => {
    e.preventDefault();
    try {
      const res = await api.get('/client/databases/sso');
      window.open(res.data.url, '_blank');
    } catch (err) {
      toast.error('Failed to generate SSO token');
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">MySQL Databases</h1>
          <p className="text-slate-500 mt-1">Create and manage your databases and database users.</p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-bold transition-all shadow-md shadow-blue-900/10 flex items-center gap-2 text-sm"
        >
          <Plus size={18} />
          Create Database
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Database className="text-blue-600" size={20} />
            <h2 className="text-lg font-bold text-slate-800">Your Databases</h2>
          </div>
          <button 
            onClick={handleOpenPhpMyAdmin}
            className="text-xs font-bold text-blue-600 hover:text-blue-700 uppercase tracking-widest bg-blue-50 px-3 py-1.5 rounded-full border border-blue-100 transition-colors"
          >
            Open phpMyAdmin
          </button>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 uppercase tracking-wider text-[10px] font-bold">Database Name</th>
                <th className="px-6 py-4 uppercase tracking-wider text-[10px] font-bold">Database User</th>
                <th className="px-6 py-4 uppercase tracking-wider text-[10px] font-bold">Size</th>
                <th className="px-6 py-4 uppercase tracking-wider text-[10px] font-bold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-slate-400">Loading databases...</td>
                </tr>
              ) : databases && databases.length > 0 ? (
                databases.map((db) => (
                  <tr key={db.id} className="hover:bg-slate-50/50 transition-colors group">
                    <td className="px-6 py-4 font-bold text-slate-800 font-mono text-xs">{db.db_name}</td>
                    <td className="px-6 py-4 font-mono text-slate-600 text-xs">{db.db_user}</td>
                    <td className="px-6 py-4 text-slate-500 text-xs">—</td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => {
                          if (window.confirm(`Are you sure you want to delete database ${db.db_name}? This cannot be undone.`)) {
                            deleteDbMutation.mutate(db.id);
                          }
                        }}
                        className="text-red-400 hover:text-red-600 p-2 rounded-lg hover:bg-red-50 transition-colors inline-block"
                        title="Delete Database"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-slate-400 italic">No databases found. Create one to get started.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-800">Create New Database</h2>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>
            
            <form 
              onSubmit={(e) => { e.preventDefault(); createDbMutation.mutate(); }}
              className="p-6 space-y-5"
            >
              <div className="space-y-2">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Database Name Suffix</label>
                <div className="flex items-center">
                  <span className="bg-slate-100 border border-slate-200 border-r-0 rounded-l-xl py-3 px-4 text-slate-500 font-mono text-sm">
                    {JSON.parse(localStorage.getItem('user') || '{}').username}_
                  </span>
                  <input
                    type="text"
                    className="flex-1 bg-white border border-slate-200 rounded-r-xl py-3 px-4 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all font-mono text-sm"
                    value={dbName}
                    onChange={(e) => setDbName(e.target.value)}
                    placeholder="wp1"
                    pattern="[a-zA-Z0-9_]+"
                    required
                  />
                </div>
                <p className="text-xs text-slate-400 ml-1">Only alphanumeric characters and underscores.</p>
              </div>

              <div className="space-y-2">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Database Password</label>
                <div className="relative">
                  <Key className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <input
                    type="password"
                    className="w-full bg-white border border-slate-200 rounded-xl py-3 pl-10 pr-4 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all font-mono text-sm"
                    value={dbPassword}
                    onChange={(e) => setDbPassword(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="pt-4 flex gap-3">
                <button 
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 px-4 py-3 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors text-sm"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={createDbMutation.isPending}
                  className="flex-1 px-4 py-3 rounded-xl font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-md shadow-blue-900/10 transition-colors text-sm disabled:opacity-50"
                >
                  {createDbMutation.isPending ? 'Creating...' : 'Create Database'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ClientDatabasesPage;
