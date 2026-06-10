import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../api/client';
import { ScrollText, Search, RefreshCw } from 'lucide-react';

interface AuditEntry {
  id: number;
  actor_id: number | null;
  actor_role: string;
  actor_name: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  ip_address: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

const roleColor: Record<string, string> = {
  admin: 'bg-purple-100 text-purple-700',
  client: 'bg-blue-100 text-blue-700',
  mail_user: 'bg-teal-100 text-teal-700',
  system: 'bg-slate-100 text-slate-600',
};

const AuditLogPage: React.FC = () => {
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['auditLog', search, role],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      if (role) params.set('role', role);
      const res = await api.get(`/admin/audit?${params.toString()}`);
      return res.data as { entries: AuditEntry[]; total: number };
    },
  });

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ScrollText className="text-blue-600" size={26} />
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Audit Log</h1>
            <p className="text-slate-500 text-sm">{data?.total ?? 0} recorded actions across the panel.</p>
          </div>
        </div>
        <button
          onClick={() => refetch()}
          className="flex items-center gap-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-xl text-sm font-medium"
        >
          <RefreshCw size={16} className={isFetching ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            className="w-full bg-white border border-slate-200 rounded-xl py-2.5 pl-9 pr-4 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
            placeholder="Search action, target, or actor..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="bg-white border border-slate-200 rounded-xl py-2.5 px-4 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
          value={role}
          onChange={(e) => setRole(e.target.value)}
        >
          <option value="">All roles</option>
          <option value="admin">Admin</option>
          <option value="client">Client</option>
          <option value="mail_user">Mail user</option>
          <option value="system">System</option>
        </select>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50/70 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              <th className="px-5 py-3">Time</th>
              <th className="px-5 py-3">Actor</th>
              <th className="px-5 py-3">Action</th>
              <th className="px-5 py-3">Target</th>
              <th className="px-5 py-3">IP</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={5} className="px-5 py-10 text-center text-slate-400">Loading...</td></tr>
            ) : (data?.entries.length ?? 0) === 0 ? (
              <tr><td colSpan={5} className="px-5 py-10 text-center text-slate-400">No audit entries yet.</td></tr>
            ) : (
              data!.entries.map((e) => (
                <tr key={e.id} className="border-t border-slate-100 hover:bg-slate-50/50">
                  <td className="px-5 py-3 text-slate-500 whitespace-nowrap">{new Date(e.created_at).toLocaleString()}</td>
                  <td className="px-5 py-3">
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${roleColor[e.actor_role] ?? 'bg-slate-100 text-slate-600'}`}>
                      {e.actor_role}
                    </span>
                    {e.actor_name && <span className="ml-2 text-slate-600">{e.actor_name}</span>}
                    {e.actor_id != null && <span className="ml-1 text-slate-400">#{e.actor_id}</span>}
                  </td>
                  <td className="px-5 py-3 font-mono text-slate-800">{e.action}</td>
                  <td className="px-5 py-3 text-slate-600">{e.target_type ? `${e.target_type}:${e.target_id}` : '—'}</td>
                  <td className="px-5 py-3 text-slate-500 font-mono">{e.ip_address ?? '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AuditLogPage;
