import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import { Database, Trash2, User, Calendar, ExternalLink } from 'lucide-react';
import toast from 'react-hot-toast';

interface DBItem {
  id: number;
  user_id: number;
  db_name: string;
  db_user: string;
  owner_name: string;
  created_at: string;
}

const DatabasesPage: React.FC = () => {
  const queryClient = useQueryClient();

  const { data: databases, isLoading } = useQuery<DBItem[]>({
    queryKey: ['adminDatabases'],
    queryFn: async () => {
      const res = await api.get('/admin/databases');
      return res.data;
    }
  });

  const deleteDbMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await api.delete(`/admin/databases/${id}`);
      return res.data;
    },
    onSuccess: () => {
      toast.success('Database deletion queued!');
      queryClient.invalidateQueries({ queryKey: ['adminDatabases'] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Failed to delete database');
    }
  });

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Global Database Manager</h1>
          <p className="text-slate-500 mt-1">Monitor all MariaDB databases across all client accounts.</p>
        </div>
        <div className="flex items-center gap-3">
           <a 
             href="/phpmyadmin" 
             target="_blank" 
             className="bg-blue-50 text-blue-600 px-4 py-2 rounded-xl font-bold border border-blue-100 flex items-center gap-2 text-sm hover:bg-blue-100 transition-colors"
           >
             <ExternalLink size={16} />
             Root phpMyAdmin
           </a>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex items-center gap-3">
          <Database className="text-orange-600" size={20} />
          <h2 className="text-lg font-bold text-slate-800">Server Database Inventory</h2>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 uppercase tracking-wider text-[10px] font-bold">Database Name</th>
                <th className="px-6 py-4 uppercase tracking-wider text-[10px] font-bold">Owner / Client</th>
                <th className="px-6 py-4 uppercase tracking-wider text-[10px] font-bold">Created At</th>
                <th className="px-6 py-4 uppercase tracking-wider text-[10px] font-bold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-slate-400">Loading inventory...</td>
                </tr>
              ) : databases && databases.length > 0 ? (
                databases.map((db) => (
                  <tr key={db.id} className="hover:bg-slate-50/50 transition-colors group">
                    <td className="px-6 py-4">
                       <div className="font-bold text-slate-800 font-mono text-xs">{db.db_name}</div>
                       <div className="text-[10px] text-slate-400 font-mono">User: {db.db_user}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-slate-500">
                          <User size={12} />
                        </div>
                        <span className="font-semibold text-slate-700">{db.owner_name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-500 text-xs">
                      <div className="flex items-center gap-1">
                        <Calendar size={12} />
                        {new Date(db.created_at).toLocaleDateString()}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => {
                          if (window.confirm(`ADMIN WARNING: Delete database ${db.db_name}? This cannot be undone.`)) {
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
                  <td colSpan={4} className="px-6 py-12 text-center text-slate-400 italic">No databases found on the server.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default DatabasesPage;
