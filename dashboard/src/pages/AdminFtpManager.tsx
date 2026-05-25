import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import adminApi from '../api/admin';
import { 
  Folder, Trash2, Shield, User
} from 'lucide-react';
import toast from 'react-hot-toast';

interface FtpAccount {
  id: number;
  user_id: number;
  ftp_username: string;
  homedir: string;
  created_at: string;
  owner_username: string;
}

const AdminFtpManager: React.FC = () => {
  const queryClient = useQueryClient();

  const { data: accounts, isLoading } = useQuery<FtpAccount[]>({
    queryKey: ['adminFtpAccounts'],
    queryFn: async () => {
      const res = await adminApi.get('/ftp');
      return res.data;
    }
  });

  const deleteAccountMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await adminApi.delete(`/ftp/${id}`);
      return res.data;
    },
    onSuccess: () => {
      toast.success('FTP account removed');
      queryClient.invalidateQueries({ queryKey: ['adminFtpAccounts'] });
    }
  });

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-3">
             <Folder className="text-indigo-600" size={28} />
             System FTP Manager
          </h1>
          <p className="text-slate-500 mt-1 ml-1">Monitor and manage all virtual FTP accounts across the server.</p>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield className="text-slate-700" size={20} />
            <h2 className="text-lg font-bold text-slate-800">All FTP Accounts</h2>
          </div>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200 uppercase tracking-widest text-[10px]">
              <tr>
                <th className="px-6 py-4">Owner</th>
                <th className="px-6 py-4">FTP Username</th>
                <th className="px-6 py-4">Home Directory</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr><td colSpan={4} className="px-6 py-8 text-center text-slate-400">Loading all FTP accounts...</td></tr>
              ) : accounts && accounts.length > 0 ? (
                accounts.map((acc) => (
                  <tr key={acc.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4">
                       <div className="flex items-center gap-2 font-bold text-slate-700">
                          <User size={14} className="text-slate-400" />
                          {acc.owner_username}
                       </div>
                    </td>
                    <td className="px-6 py-4">
                       <div className="text-indigo-600 font-medium">
                          {acc.ftp_username}
                       </div>
                    </td>
                    <td className="px-6 py-4 text-slate-500 text-xs font-mono">
                       {acc.homedir}
                    </td>
                    <td className="px-6 py-4 text-right">
                       <button 
                         onClick={() => { if(window.confirm('Permanently remove this FTP account?')) deleteAccountMutation.mutate(acc.id); }}
                         className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                       >
                          <Trash2 size={16} />
                       </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan={4} className="px-6 py-12 text-center text-slate-400 italic">No FTP accounts found on the system.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AdminFtpManager;
