import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import { Trash2, RotateCcw, Archive, Globe, Database, Mail, Network, Loader2, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import { useTaskMonitor } from '../hooks/useTaskMonitor';

interface DeletedUser {
  id: number;
  username: string;
  email: string | null;
  archive_path: string;
  archive_size_bytes: number;
  deleted_at: string;
  domain_count: number;
  database_count: number;
  dns_zone_count: number;
  mail_user_count: number;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

const DeletedUsersPage: React.FC = () => {
  const queryClient = useQueryClient();
  const { monitorTask } = useTaskMonitor();

  const { data: deletedUsers = [], isLoading } = useQuery<DeletedUser[]>({
    queryKey: ['deleted-users'],
    queryFn: async () => (await api.get('/admin/deleted-users')).data,
  });

  const restoreMutation = useMutation({
    mutationFn: async (id: number) => (await api.post(`/admin/deleted-users/${id}/restore`)).data,
    onSuccess: (data, id) => {
      const user = deletedUsers.find(u => u.id === id);
      toast.success(`Restore of ${user?.username} queued`);
      queryClient.invalidateQueries({ queryKey: ['deleted-users'] });
      if (data.taskId) monitorTask(data.taskId, `${user?.username} restored successfully`);
    },
    onError: (err: any) => toast.error(err.response?.data?.message ?? 'Restore failed'),
  });

  const purgeMutation = useMutation({
    mutationFn: async (id: number) => (await api.delete(`/admin/deleted-users/${id}`)).data,
    onSuccess: (_, id) => {
      const user = deletedUsers.find(u => u.id === id);
      toast.success(`Archive for ${user?.username} purge queued`);
      queryClient.invalidateQueries({ queryKey: ['deleted-users'] });
    },
    onError: (err: any) => toast.error(err.response?.data?.message ?? 'Purge failed'),
  });

  const totalSize = deletedUsers.reduce((sum, u) => sum + (u.archive_size_bytes ?? 0), 0);

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in duration-500">

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Deleted Users</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            {deletedUsers.length} archived account{deletedUsers.length !== 1 ? 's' : ''} · {formatBytes(totalSize)} total
          </p>
        </div>
      </div>

      {deletedUsers.length > 0 && (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
          <AlertTriangle size={16} className="flex-shrink-0 mt-0.5 text-amber-500" />
          <span>Restoring a user re-provisions all their domains, databases, and DNS zones. This may take a minute.</span>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center gap-3">
          <Archive size={18} className="text-slate-500" />
          <h2 className="font-bold text-slate-800">Archives</h2>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16 gap-2 text-slate-400">
            <Loader2 size={18} className="animate-spin" />
            <span className="text-sm">Loading archives…</span>
          </div>
        ) : deletedUsers.length === 0 ? (
          <div className="py-16 text-center text-slate-400">
            <Archive size={32} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">No deleted users. Archives will appear here when accounts are removed.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {deletedUsers.map(user => (
              <div key={user.id} className="px-6 py-5 flex flex-col md:flex-row md:items-center gap-4 hover:bg-slate-50/40 transition-colors">

                {/* Identity */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-800">{user.username}</span>
                    {user.email && (
                      <span className="text-xs text-slate-400 font-mono">{user.email}</span>
                    )}
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    Deleted {new Date(user.deleted_at).toLocaleString()}
                  </div>
                  <div className="font-mono text-[10px] text-slate-300 mt-1 truncate">{user.archive_path}</div>
                </div>

                {/* Resource counts */}
                <div className="flex items-center gap-4 flex-shrink-0">
                  <Pill icon={<Globe size={11} />} label={`${user.domain_count ?? 0} domains`} />
                  <Pill icon={<Database size={11} />} label={`${user.database_count ?? 0} DBs`} />
                  <Pill icon={<Network size={11} />} label={`${user.dns_zone_count ?? 0} zones`} />
                  <Pill icon={<Mail size={11} />} label={`${user.mail_user_count ?? 0} mail`} />
                </div>

                {/* Archive size */}
                <div className="text-right flex-shrink-0 w-20">
                  <div className="font-bold text-slate-700 text-sm">{formatBytes(user.archive_size_bytes ?? 0)}</div>
                  <div className="text-[10px] text-slate-400 uppercase tracking-wider">archive</div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => {
                      if (window.confirm(`Restore ${user.username}? This will re-provision all their resources.`))
                        restoreMutation.mutate(user.id);
                    }}
                    disabled={restoreMutation.isPending}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-bold transition-all disabled:opacity-50"
                  >
                    {restoreMutation.isPending
                      ? <Loader2 size={13} className="animate-spin" />
                      : <RotateCcw size={13} />
                    }
                    Restore
                  </button>
                  <button
                    onClick={() => {
                      if (window.confirm(`Permanently delete archive for ${user.username}? This cannot be undone.`))
                        purgeMutation.mutate(user.id);
                    }}
                    disabled={purgeMutation.isPending}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-red-50 hover:text-red-600 text-slate-500 text-xs font-bold transition-all disabled:opacity-50"
                  >
                    <Trash2 size={13} />
                    Purge
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const Pill: React.FC<{ icon: React.ReactNode; label: string }> = ({ icon, label }) => (
  <div className="flex items-center gap-1 text-[11px] text-slate-500 font-medium">
    <span className="text-slate-400">{icon}</span>
    {label}
  </div>
);

export default DeletedUsersPage;
