import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import api from '../api/client';
import adminApi from '../api/admin';
import { 
  ShieldAlert, Trash2, CheckCircle, Filter, 
  Mail, UserCheck, UserX
} from 'lucide-react';
import toast from 'react-hot-toast';
import type { MailUser, MailQuarantine, MailAccessControl } from '../../../shared/types';

interface SpamDashboardProps {
  mode?: 'admin' | 'client';
}

const SpamDashboard: React.FC<SpamDashboardProps> = ({ mode = 'client' }) => {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedMailboxId, setSelectedMailboxId] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'quarantine' | 'access'>('quarantine');
  
  const currentApi = mode === 'admin' ? adminApi : api;
  const apiPrefix = mode === 'admin' ? '' : '/client'; // adminApi already has /api/admin prefix

  // Handle actions from Daily Digest links
  useEffect(() => {
    const releaseId = searchParams.get('release');
    const deleteId = searchParams.get('delete');

    if (releaseId) {
      releaseMutation.mutate(parseInt(releaseId));
      searchParams.delete('release');
      setSearchParams(searchParams);
    }
    if (deleteId) {
      deleteQuarantineMutation.mutate(parseInt(deleteId));
      searchParams.delete('delete');
      setSearchParams(searchParams);
    }
  }, [searchParams]);
  
  // Access Control Form
  const [newPattern, setNewPattern] = useState('');
  const [newType, setNewType] = useState<'allow' | 'block'>('allow');

  const { data: mailboxes } = useQuery<MailUser[]>({
    queryKey: mode === 'admin' ? ['adminEmails'] : ['clientEmails'],
    queryFn: async () => {
      const res = await currentApi.get(`${apiPrefix}/email`);
      return res.data;
    }
  });

  const { data: quarantine, isLoading: isQLoading } = useQuery<MailQuarantine[]>({
    queryKey: ['quarantine', selectedMailboxId],
    queryFn: async () => {
      if (!selectedMailboxId) return [];
      const res = await currentApi.get(`${apiPrefix}/email/${selectedMailboxId}/quarantine`);
      return res.data;
    },
    enabled: !!selectedMailboxId
  });

  const { data: accessRules, isLoading: isALoading } = useQuery<MailAccessControl[]>({
    queryKey: ['access-control', selectedMailboxId],
    queryFn: async () => {
      if (!selectedMailboxId) return [];
      const res = await currentApi.get(`${apiPrefix}/email/${selectedMailboxId}/access-control`);
      return res.data;
    },
    enabled: !!selectedMailboxId
  });

  const releaseMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await currentApi.post(`${apiPrefix}/email/quarantine/${id}/release`);
      return res.data;
    },
    onSuccess: () => {
      toast.success('Email released to inbox');
      queryClient.invalidateQueries({ queryKey: ['quarantine', selectedMailboxId] });
    }
  });

  const deleteQuarantineMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await currentApi.delete(`${apiPrefix}/email/quarantine/${id}`);
      return res.data;
    },
    onSuccess: () => {
      toast.success('Spam email deleted');
      queryClient.invalidateQueries({ queryKey: ['quarantine', selectedMailboxId] });
    }
  });

  const addAccessRuleMutation = useMutation({
    mutationFn: async () => {
      const res = await currentApi.post(`${apiPrefix}/email/${selectedMailboxId}/access-control`, {
        senderPattern: newPattern,
        accessType: newType
      });
      return res.data;
    },
    onSuccess: () => {
      toast.success('Rule added');
      setNewPattern('');
      queryClient.invalidateQueries({ queryKey: ['access-control', selectedMailboxId] });
    }
  });

  const deleteAccessRuleMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await currentApi.delete(`${apiPrefix}/email/${selectedMailboxId}/access-control/${id}`);
      return res.data;
    },
    onSuccess: () => {
      toast.success('Rule removed');
      queryClient.invalidateQueries({ queryKey: ['access-control', selectedMailboxId] });
    }
  });

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-3">
             <ShieldAlert className="text-orange-600" size={28} />
             Spam Management
          </h1>
          <p className="text-slate-500 mt-1 ml-1">Quarantine, Whitelists, and Blacklists for your email accounts.</p>
        </div>
        <select 
          className="bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-700 outline-none shadow-sm focus:ring-2 focus:ring-orange-500/20"
          value={selectedMailboxId}
          onChange={(e) => setSelectedMailboxId(e.target.value)}
        >
          <option value="" disabled>Select Mailbox</option>
          {mailboxes?.map(m => <option key={m.id} value={m.id}>{m.email}</option>)}
        </select>
      </div>

      {!selectedMailboxId ? (
         <div className="h-96 flex flex-col items-center justify-center bg-slate-50/50 border-2 border-dashed border-slate-200 rounded-3xl p-12 text-center text-slate-400">
            <Mail className="mb-4 opacity-20" size={64} />
            <p>Please select an email account above to manage spam settings.</p>
         </div>
      ) : (
        <div className="space-y-6">
           <div className="flex space-x-1 bg-slate-200/50 p-1 rounded-xl w-fit">
              <button onClick={() => setActiveTab('quarantine')} className={`px-6 py-2.5 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${activeTab === 'quarantine' ? 'bg-white text-orange-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                <ShieldAlert size={16} /> Quarantine
              </button>
              <button onClick={() => setActiveTab('access')} className={`px-6 py-2.5 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${activeTab === 'access' ? 'bg-white text-orange-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                <Filter size={16} /> Access Control
              </button>
           </div>

           {activeTab === 'quarantine' ? (
              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                  <h2 className="text-lg font-bold text-slate-800">Quarantined Emails</h2>
                </div>
                <div className="overflow-x-auto">
                   <table className="w-full text-left text-sm">
                      <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                        <tr>
                          <th className="px-6 py-4 uppercase tracking-wider text-[10px] font-bold">Sender</th>
                          <th className="px-6 py-4 uppercase tracking-wider text-[10px] font-bold">Subject</th>
                          <th className="px-6 py-4 uppercase tracking-wider text-[10px] font-bold">Score</th>
                          <th className="px-6 py-4 uppercase tracking-wider text-[10px] font-bold text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                         {isQLoading ? (
                            <tr><td colSpan={4} className="px-6 py-8 text-center">Loading...</td></tr>
                         ) : quarantine && quarantine.length > 0 ? (
                            quarantine.map(q => (
                               <tr key={q.id} className="hover:bg-slate-50/50 transition-colors">
                                  <td className="px-6 py-4 font-bold text-slate-700 text-xs">{q.sender}</td>
                                  <td className="px-6 py-4 text-slate-500 text-xs truncate max-w-xs">{q.subject}</td>
                                  <td className="px-6 py-4">
                                     <span className={`px-2 py-1 rounded text-[10px] font-mono font-bold ${q.spam_score > 10 ? 'bg-red-50 text-red-600' : 'bg-orange-50 text-orange-600'}`}>
                                        {q.spam_score.toFixed(1)}
                                     </span>
                                  </td>
                                  <td className="px-6 py-4 text-right space-x-1">
                                     <button onClick={() => releaseMutation.mutate(q.id)} className="p-2 text-emerald-500 hover:bg-emerald-50 rounded-lg transition-colors" title="Release to Inbox">
                                        <CheckCircle size={18} />
                                     </button>
                                     <button onClick={() => deleteQuarantineMutation.mutate(q.id)} className="p-2 text-red-400 hover:bg-red-50 rounded-lg transition-colors" title="Delete Permanent">
                                        <Trash2 size={18} />
                                     </button>
                                  </td>
                               </tr>
                            ))
                         ) : (
                            <tr><td colSpan={4} className="px-6 py-12 text-center text-slate-400 italic">No quarantined emails for this mailbox.</td></tr>
                         )}
                      </tbody>
                   </table>
                </div>
              </div>
           ) : (
              <div className="space-y-6">
                 {/* Add Rule Form */}
                 <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                    <h3 className="text-sm font-bold text-slate-800 mb-4">Add Whitelist / Blacklist Rule</h3>
                    <div className="flex flex-col md:flex-row gap-4">
                       <div className="flex-1 space-y-1">
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Sender or Domain Pattern</label>
                          <input 
                            type="text" 
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-mono"
                            value={newPattern}
                            onChange={e => setNewPattern(e.target.value)}
                            placeholder="e.g. boss@corp.com or @trusted.com"
                          />
                       </div>
                       <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Access Type</label>
                          <select 
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-700 outline-none"
                            value={newType}
                            onChange={e => setNewType(e.target.value as 'allow' | 'block')}
                          >
                             <option value="allow">Allow (Whitelist)</option>
                             <option value="block">Block (Blacklist)</option>
                          </select>
                       </div>
                       <button 
                         onClick={() => addAccessRuleMutation.mutate()}
                         disabled={!newPattern}
                         className="self-end bg-orange-600 hover:bg-orange-700 text-white px-6 py-2.5 rounded-xl font-bold transition-all shadow-md shadow-orange-900/10 text-sm disabled:opacity-50"
                       >
                          Add Rule
                       </button>
                    </div>
                 </div>

                 {/* Rules List */}
                 <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                    <div className="p-6 border-b border-slate-100 bg-slate-50/50">
                       <h2 className="text-lg font-bold text-slate-800">Current Rules</h2>
                    </div>
                    <table className="w-full text-left text-sm">
                       <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                         <tr>
                           <th className="px-6 py-4 uppercase tracking-wider text-[10px] font-bold">Pattern</th>
                           <th className="px-6 py-4 uppercase tracking-wider text-[10px] font-bold">Action</th>
                           <th className="px-6 py-4 uppercase tracking-wider text-[10px] font-bold text-right"></th>
                         </tr>
                       </thead>
                       <tbody className="divide-y divide-slate-100">
                          {isALoading ? (
                             <tr><td colSpan={3} className="px-6 py-8 text-center">Loading...</td></tr>
                          ) : accessRules && accessRules.length > 0 ? (
                             accessRules.map(rule => (
                                <tr key={rule.id} className="hover:bg-slate-50/50 transition-colors">
                                   <td className="px-6 py-4 font-mono text-xs text-slate-700">{rule.sender_pattern}</td>
                                   <td className="px-6 py-4">
                                      <span className={`px-2 py-1 rounded-full text-[10px] font-bold flex items-center gap-1.5 w-fit ${rule.access_type === 'allow' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-red-50 text-red-700 border border-red-100'}`}>
                                         {rule.access_type === 'allow' ? <UserCheck size={12} /> : <UserX size={12} />}
                                         {rule.access_type.toUpperCase()}
                                      </span>
                                   </td>
                                   <td className="px-6 py-4 text-right">
                                      <button onClick={() => deleteAccessRuleMutation.mutate(rule.id)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                                         <Trash2 size={16} />
                                      </button>
                                   </td>
                                </tr>
                             ))
                          ) : (
                             <tr><td colSpan={3} className="px-6 py-12 text-center text-slate-400 italic">No whitelist or blacklist rules defined.</td></tr>
                          )}
                       </tbody>
                    </table>
                 </div>
              </div>
           )}
        </div>
      )}
    </div>
  );
};

export default SpamDashboard;
