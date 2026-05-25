import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import { 
  Folder, Plus, Trash2, Shield, Info, Key, HardDrive
} from 'lucide-react';
import toast from 'react-hot-toast';

interface FtpAccount {
  id: number;
  ftp_username: string;
  homedir: string;
  created_at: string;
}

const ClientFtpManager: React.FC = () => {
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Form State
  const [ftpUser, setFtpUser] = useState('');
  const [password, setPassword] = useState('');
  const [subPath, setSubPath] = useState('');

  const { data: accounts, isLoading } = useQuery<FtpAccount[]>({
    queryKey: ['userFtpAccounts'],
    queryFn: async () => {
      const res = await api.get('/client/ftp');
      return res.data;
    }
  });

  const addAccountMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/client/ftp', {
        ftp_user: ftpUser,
        password,
        sub_path: subPath
      });
      return res.data;
    },
    onSuccess: () => {
      toast.success('FTP account created!');
      setIsModalOpen(false);
      setFtpUser('');
      setPassword('');
      setSubPath('');
      queryClient.invalidateQueries({ queryKey: ['userFtpAccounts'] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Failed to create FTP account');
    }
  });

  const deleteAccountMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await api.delete(`/client/ftp/${id}`);
      return res.data;
    },
    onSuccess: () => {
      toast.success('FTP account removed');
      queryClient.invalidateQueries({ queryKey: ['userFtpAccounts'] });
    }
  });

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-3">
             <Folder className="text-blue-600" size={28} />
             FTP Account Manager
          </h1>
          <p className="text-slate-500 mt-1 ml-1">Create isolated file upload accounts for your developers or applications.</p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-bold transition-all shadow-md shadow-blue-900/10 flex items-center gap-2 text-sm"
        >
          <Plus size={18} />
          Create FTP Account
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield className="text-slate-700" size={20} />
            <h2 className="text-lg font-bold text-slate-800">Your FTP Accounts</h2>
          </div>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200 uppercase tracking-widest text-[10px]">
              <tr>
                <th className="px-6 py-4">FTP Username</th>
                <th className="px-6 py-4">Home Directory</th>
                <th className="px-6 py-4">Created</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr><td colSpan={4} className="px-6 py-8 text-center text-slate-400">Loading your FTP accounts...</td></tr>
              ) : accounts && accounts.length > 0 ? (
                accounts.map((acc) => (
                  <tr key={acc.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4">
                       <div className="font-bold text-slate-700">
                          {acc.ftp_username}
                       </div>
                    </td>
                    <td className="px-6 py-4 text-slate-500 text-xs font-mono">
                       {acc.homedir}
                    </td>
                    <td className="px-6 py-4 text-slate-400 text-xs">
                       {new Date(acc.created_at).toLocaleDateString()}
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
                <tr><td colSpan={4} className="px-6 py-12 text-center text-slate-400 italic">No FTP accounts found. Use the button above to create one.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Connection Info */}
      <div className="bg-blue-50 border border-blue-100 rounded-2xl p-6 flex gap-4 shadow-sm">
         <div className="p-3 bg-white rounded-xl text-blue-600 shadow-sm self-start">
            <Info size={24} />
         </div>
         <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full">
            <div>
               <h3 className="font-bold text-blue-900 mb-1">FTP Host</h3>
               <p className="text-sm text-blue-700 font-mono">ftp.{window.location.hostname}</p>
            </div>
            <div>
               <h3 className="font-bold text-blue-900 mb-1">Port</h3>
               <p className="text-sm text-blue-700 font-mono">21 (FTP) or 22 (SFTP)</p>
            </div>
            <div>
               <h3 className="font-bold text-blue-900 mb-1">Protocol</h3>
               <p className="text-sm text-blue-700 font-mono">FTP, FTPS, or SFTP</p>
            </div>
         </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-800">Create New FTP Account</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>
            
            <form onSubmit={(e) => { e.preventDefault(); addAccountMutation.mutate(); }} className="p-6 space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">FTP Username</label>
                <div className="relative">
                   <Folder className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                   <input 
                     type="text" 
                     className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pl-10 pr-4 text-sm" 
                     value={ftpUser} 
                     onChange={(e) => setFtpUser(e.target.value)} 
                     placeholder="e.g. dev" 
                     required 
                   />
                </div>
                <p className="text-[10px] text-slate-400 ml-1">The actual username will be prefixed with your account username.</p>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Password</label>
                <div className="relative">
                   <Key className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                   <input 
                     type="password" 
                     className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pl-10 pr-4 text-sm" 
                     value={password} 
                     onChange={(e) => setPassword(e.target.value)} 
                     placeholder="Strong password" 
                     required 
                   />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Home Directory (Optional)</label>
                <div className="relative">
                   <HardDrive className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                   <input 
                     type="text" 
                     className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pl-10 pr-4 text-sm font-mono" 
                     value={subPath} 
                     onChange={(e) => setSubPath(e.target.value)} 
                     placeholder="/dev_site (relative to public_html)" 
                   />
                </div>
                <p className="text-[10px] text-slate-400 ml-1">Leave blank to grant access to the entire public_html folder.</p>
              </div>

              <div className="pt-4 flex gap-3">
                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 px-4 py-3 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 text-sm transition-all">Cancel</button>
                <button type="submit" disabled={addAccountMutation.isPending} className="flex-1 px-4 py-3 rounded-xl font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-md shadow-blue-900/10 text-sm transition-all disabled:opacity-50">
                  {addAccountMutation.isPending ? 'Creating...' : 'Create Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ClientFtpManager;
