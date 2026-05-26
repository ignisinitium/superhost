import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import { Mail, Plus, Trash2, Key, ShieldCheck, Copy, ArrowRight, MessageSquare, ShieldAlert, Inbox } from 'lucide-react';
import toast from 'react-hot-toast';
import type { MailUser, MailForwarder, Domain } from '../../../shared/types';

interface DnsRecord {
  id: number;
  type: string;
  name: string;
  content: string;
}

const ClientEmailPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'mailboxes' | 'forwarders' | 'security'>('mailboxes');
  
  // Modals
  const [isMailboxModalOpen, setIsMailboxModalOpen] = useState(false);
  const [isForwarderModalOpen, setIsForwarderModalOpen] = useState(false);
  const [isAutoresponderModalOpen, setIsAutoresponderModalOpen] = useState(false);
  
  // State
  const [selectedMailUser, setSelectedMailUser] = useState<MailUser | null>(null);
  const [selectedDomain, setSelectedDomain] = useState<string>('');
  
  // Forms
  const [localPart, setLocalPart] = useState('');
  const [domainId, setDomainId] = useState('');
  const [password, setPassword] = useState('');
  const [quota, setQuota] = useState('1024');
  const [isCatchall, setIsCatchall] = useState(false);
  
  const [fwdSource, setFwdSource] = useState('');
  const [fwdDest, setFwdDest] = useState('');
  const [fwdDomainId, setFwdDomainId] = useState('');

  const [arMessage, setArMessage] = useState('');
  const [arEnabled, setArEnabled] = useState(false);

  // Queries
  const { data: emails, isLoading: isEmailsLoading } = useQuery<MailUser[]>({
    queryKey: ['clientEmails'],
    queryFn: async () => {
      const res = await api.get('/client/email');
      return res.data;
    }
  });

  const { data: forwarders, isLoading: isForwardersLoading } = useQuery<MailForwarder[]>({
    queryKey: ['clientForwarders'],
    queryFn: async () => {
      const res = await api.get('/client/email/forwarders');
      return res.data;
    }
  });

  const { data: domains } = useQuery<Domain[]>({
    queryKey: ['clientDomains'],
    queryFn: async () => {
      const res = await api.get('/client/domains');
      return res.data;
    }
  });

  const { data: dnsRecords } = useQuery<DnsRecord[]>({
    queryKey: ['clientDns', selectedDomain],
    queryFn: async () => {
      if (!selectedDomain) return [];
      const res = await api.get(`/client/domains/${selectedDomain}/dns`);
      return res.data;
    },
    enabled: !!selectedDomain && activeTab === 'security'
  });

  // Derived: does the currently-selected domain already have a catchall?
  const selectedDomainHasCatchall = useMemo(() => {
    if (!domainId || !emails) return false;
    return emails.some(e => String(e.domain_id) === String(domainId) && e.is_catchall);
  }, [emails, domainId]);

  // Mutations
  const createEmailMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/client/email', {
        localPart,
        domainId: parseInt(domainId),
        password,
        quota: parseInt(quota),
        isCatchall,
      });
      return res.data;
    },
    onSuccess: () => {
      toast.success('Email account created!');
      setIsMailboxModalOpen(false);
      setLocalPart('');
      setPassword('');
      setIsCatchall(false);
      queryClient.invalidateQueries({ queryKey: ['clientEmails'] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Failed to create email account');
    }
  });

  const deleteEmailMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await api.delete(`/client/email/${id}`);
      return res.data;
    },
    onSuccess: () => {
      toast.success('Email account deleted');
      queryClient.invalidateQueries({ queryKey: ['clientEmails'] });
    }
  });

  const updateMailAccountMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number, data: any }) => {
      const res = await api.patch(`/client/email/${id}`, data);
      return res.data;
    },
    onSuccess: () => {
      toast.success('Settings updated');
      queryClient.invalidateQueries({ queryKey: ['clientEmails'] });
    }
  });

  const createForwarderMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/client/email/forwarders', {
        source: fwdSource,
        destination: fwdDest,
        domainId: parseInt(fwdDomainId)
      });
      return res.data;
    },
    onSuccess: () => {
      toast.success('Forwarder added');
      setIsForwarderModalOpen(false);
      setFwdSource('');
      setFwdDest('');
      queryClient.invalidateQueries({ queryKey: ['clientForwarders'] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Failed to add forwarder');
    }
  });

  const deleteForwarderMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await api.delete(`/client/email/forwarders/${id}`);
      return res.data;
    },
    onSuccess: () => {
      toast.success('Forwarder deleted');
      queryClient.invalidateQueries({ queryKey: ['clientForwarders'] });
    }
  });

  const saveAutoresponderMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post(`/client/email/${selectedMailUser?.id}/autoresponder`, {
        message: arMessage,
        enabled: arEnabled
      });
      return res.data;
    },
    onSuccess: () => {
      toast.success('Auto-responder saved');
      setIsAutoresponderModalOpen(false);
    }
  });

  const fetchAutoresponder = async (mailUserId: number) => {
    const res = await api.get(`/client/email/${mailUserId}/autoresponder`);
    setArMessage(res.data.message);
    setArEnabled(res.data.enabled);
  };

  const openAutoresponderModal = (user: MailUser) => {
    setSelectedMailUser(user);
    fetchAutoresponder(user.id);
    setIsAutoresponderModalOpen(true);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Email & Advanced Features</h1>
          <p className="text-slate-500 mt-1">Manage mailboxes, forwarders, auto-responders and security.</p>
        </div>
        <div className="flex gap-2">
           {activeTab === 'mailboxes' && (
            <button onClick={() => { setIsCatchall(false); setDomainId(''); setLocalPart(''); setPassword(''); setIsMailboxModalOpen(true); }} className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl font-bold transition-all shadow-md shadow-emerald-900/10 flex items-center gap-2 text-sm">
              <Plus size={18} /> Create Mailbox
            </button>
           )}
           {activeTab === 'forwarders' && (
            <button onClick={() => setIsForwarderModalOpen(true)} className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-bold transition-all shadow-md shadow-blue-900/10 flex items-center gap-2 text-sm">
              <Plus size={18} /> Create Forwarder
            </button>
           )}
        </div>
      </div>

      <div className="flex space-x-1 bg-slate-200/50 p-1 rounded-xl w-fit">
        <button onClick={() => setActiveTab('mailboxes')} className={`px-6 py-2.5 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${activeTab === 'mailboxes' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
          <Mail size={16} /> Mailboxes
        </button>
        <button onClick={() => setActiveTab('forwarders')} className={`px-6 py-2.5 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${activeTab === 'forwarders' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
          <ArrowRight size={16} /> Forwarders
        </button>
        <button onClick={() => setActiveTab('security')} className={`px-6 py-2.5 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${activeTab === 'security' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
          <ShieldCheck size={16} /> DNS Security
        </button>
      </div>

      {activeTab === 'mailboxes' && (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-800">Active Mailboxes</h2>
            <a href="/webmail" target="_blank" className="text-xs font-bold text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-full border border-emerald-100">Open Webmail</a>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-4 uppercase tracking-wider text-[10px] font-bold">Email Address</th>
                  <th className="px-6 py-4 uppercase tracking-wider text-[10px] font-bold">Spam Filter</th>
                  <th className="px-6 py-4 uppercase tracking-wider text-[10px] font-bold">Quota (MB)</th>
                  <th className="px-6 py-4 uppercase tracking-wider text-[10px] font-bold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isEmailsLoading ? (
                  <tr><td colSpan={4} className="px-6 py-8 text-center text-slate-400">Loading...</td></tr>
                ) : emails?.map(acc => (
                  <tr key={acc.id} className="hover:bg-slate-50/50 transition-colors group">
                    <td className="px-6 py-4 text-xs">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-slate-800">{acc.email}</span>
                        {acc.is_catchall && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-violet-50 text-violet-700 border border-violet-200">
                            <Inbox size={10} />
                            Catchall
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <button 
                        onClick={() => updateMailAccountMutation.mutate({ id: acc.id, data: { spamFilterEnabled: !acc.spam_filter_enabled } })}
                        className={`px-3 py-1 rounded-full text-[10px] font-bold border transition-all flex items-center gap-1.5 ${acc.spam_filter_enabled ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-slate-50 text-slate-500 border-slate-200'}`}
                      >
                         <ShieldAlert size={12} />
                         {acc.spam_filter_enabled ? 'Spam Filter Active' : 'Spam Filter Disabled'}
                      </button>
                    </td>
                    <td className="px-6 py-4 font-mono text-slate-600 text-xs">{acc.quota}</td>
                    <td className="px-6 py-4 text-right space-x-1">
                      <button onClick={() => openAutoresponderModal(acc)} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Auto-responder">
                        <MessageSquare size={16} />
                      </button>
                      <button onClick={() => { if(window.confirm('Delete mailbox?')) deleteEmailMutation.mutate(acc.id); }} className="text-red-400 hover:text-red-600 p-2 rounded-lg hover:bg-red-50 transition-colors">
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'forwarders' && (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
           <div className="p-6 border-b border-slate-100 bg-slate-50/50">
              <h2 className="text-lg font-bold text-slate-800">Email Forwarders</h2>
           </div>
           <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 uppercase tracking-wider text-[10px] font-bold">Source Address</th>
                <th className="px-6 py-4 uppercase tracking-wider text-[10px] font-bold"></th>
                <th className="px-6 py-4 uppercase tracking-wider text-[10px] font-bold">Destination(s)</th>
                <th className="px-6 py-4 uppercase tracking-wider text-[10px] font-bold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isForwardersLoading ? (
                 <tr><td colSpan={4} className="px-6 py-8 text-center text-slate-400">Loading...</td></tr>
              ) : forwarders?.map(fwd => (
                <tr key={fwd.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-4 font-bold text-slate-800 text-xs">{fwd.source}</td>
                  <td className="px-6 py-4 text-slate-400"><ArrowRight size={14} /></td>
                  <td className="px-6 py-4 text-slate-600 text-xs font-mono">{fwd.destination}</td>
                  <td className="px-6 py-4 text-right">
                    <button onClick={() => deleteForwarderMutation.mutate(fwd.id)} className="text-red-400 hover:text-red-600 p-2 rounded-lg hover:bg-red-50 transition-colors">
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'security' && (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <ShieldCheck className="text-emerald-600" size={20} />
              <h2 className="text-lg font-bold text-slate-800">Email DNS Records</h2>
            </div>
            <select className="bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm font-medium text-slate-700 outline-none" value={selectedDomain} onChange={(e) => setSelectedDomain(e.target.value)}>
              <option value="" disabled>Select a Domain</option>
              {domains?.map(d => <option key={d.id} value={d.id}>{d.domain_name}</option>)}
            </select>
          </div>
          <div className="p-6">
             {selectedDomain ? (
                <div className="space-y-4">
                   {dnsRecords?.map(record => (
                      <div key={record.id} className="border border-slate-200 rounded-xl overflow-hidden">
                        <div className="bg-slate-50 border-b border-slate-200 px-4 py-2 flex items-center justify-between">
                          <span className="font-bold text-slate-700 text-sm">Type: {record.type}</span>
                          <span className="text-xs text-slate-500 font-mono">Name: {record.name}</span>
                        </div>
                        <div className="p-4 flex items-center justify-between gap-4">
                          <code className="text-xs font-mono text-slate-600 break-all bg-slate-50 px-3 py-2 rounded-lg flex-1">{record.content}</code>
                          <button onClick={() => copyToClipboard(record.content)} className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"><Copy size={18} /></button>
                        </div>
                      </div>
                   ))}
                </div>
             ) : <div className="text-center py-12 text-slate-400">Select a domain above to view security records.</div>}
          </div>
        </div>
      )}

      {/* Autoresponder Modal */}
      {isAutoresponderModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-200">
             <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                   <MessageSquare className="text-blue-600" size={20} />
                   Auto-responder for {selectedMailUser?.email}
                </h2>
                <button onClick={() => setIsAutoresponderModalOpen(false)} className="text-slate-400 hover:text-slate-600">✕</button>
             </div>
             <div className="p-6 space-y-4">
                <div className="flex items-center justify-between bg-slate-50 p-4 rounded-xl border border-slate-200">
                   <div>
                      <h4 className="font-bold text-slate-800 text-sm">Enable Auto-responder</h4>
                      <p className="text-xs text-slate-500">Automatically reply to incoming emails.</p>
                   </div>
                   <input type="checkbox" className="w-5 h-5 accent-blue-600" checked={arEnabled} onChange={e => setArEnabled(e.target.checked)} />
                </div>
                <div className="space-y-1">
                   <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Away Message</label>
                   <textarea 
                     className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm min-h-[150px] outline-none focus:ring-2 focus:ring-blue-500/20"
                     value={arMessage}
                     onChange={e => setArMessage(e.target.value)}
                     placeholder="Hello, I am currently away..."
                   />
                </div>
                <div className="pt-4 flex gap-3">
                   <button onClick={() => setIsAutoresponderModalOpen(false)} className="flex-1 px-4 py-3 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 text-sm">Cancel</button>
                   <button onClick={() => saveAutoresponderMutation.mutate()} disabled={saveAutoresponderMutation.isPending} className="flex-1 px-4 py-3 rounded-xl font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-md shadow-blue-900/10 text-sm">Save Changes</button>
                </div>
             </div>
          </div>
        </div>
      )}

      {/* Forwarder Modal */}
      {isForwarderModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-800">Add New Forwarder</h2>
              <button onClick={() => setIsForwarderModalOpen(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>
            <form onSubmit={e => { e.preventDefault(); createForwarderMutation.mutate(); }} className="p-6 space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Source Address</label>
                <div className="flex">
                   <input type="text" className="w-1/2 border border-slate-200 rounded-l-xl p-3 text-sm font-mono" value={fwdSource} onChange={e => setFwdSource(e.target.value)} placeholder="sales" required />
                   <span className="bg-slate-50 border-t border-b border-slate-200 p-3 text-slate-400 text-sm">@</span>
                   <select className="flex-1 border border-slate-200 rounded-r-xl p-3 text-sm" value={fwdDomainId} onChange={e => setFwdDomainId(e.target.value)} required>
                      <option value="">Domain</option>
                      {domains?.map(d => <option key={d.id} value={d.id}>{d.domain_name}</option>)}
                   </select>
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Destination Address(es)</label>
                <input type="text" className="w-full border border-slate-200 rounded-xl p-3 text-sm" value={fwdDest} onChange={e => setFwdDest(e.target.value)} placeholder="me@gmail.com, another@mail.com" required />
                <p className="text-[9px] text-slate-400 ml-1">Separate multiple addresses with commas.</p>
              </div>
              <div className="pt-4 flex gap-3">
                <button type="button" onClick={() => setIsForwarderModalOpen(false)} className="flex-1 px-4 py-3 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 text-sm">Cancel</button>
                <button type="submit" className="flex-1 px-4 py-3 rounded-xl font-bold text-white bg-blue-600 hover:bg-blue-700 text-sm">Add Forwarder</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Mailbox Modal */}
      {isMailboxModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-800">Create New Mailbox</h2>
              <button onClick={() => setIsMailboxModalOpen(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>
            <form onSubmit={e => { e.preventDefault(); createEmailMutation.mutate(); }} className="p-6 space-y-5">
              <div className="space-y-2">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Email Address</label>
                <div className="flex items-center">
                  <input type="text" className="w-1/2 border border-slate-200 rounded-l-xl py-3 px-4 font-mono text-sm" value={localPart} onChange={e => setLocalPart(e.target.value)} placeholder="contact" required />
                  <span className="bg-slate-50 border-t border-b border-slate-200 py-3 px-2 text-slate-400 font-mono text-sm">@</span>
                  <select className="flex-1 border border-slate-200 rounded-r-xl py-3 px-2 font-mono text-sm outline-none" value={domainId} onChange={e => setDomainId(e.target.value)} required>
                    <option value="">Select Domain</option>
                    {domains?.map(d => <option key={d.id} value={d.id}>{d.domain_name}</option>)}
                  </select>
                </div>
              </div>
              <div className="space-y-2">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Password</label>
                <div className="relative">
                  <Key className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <input type="password" title="password" className="w-full border border-slate-200 rounded-xl py-3 pl-10 pr-4 text-sm" value={password} onChange={e => setPassword(e.target.value)} required />
                </div>
              </div>
              <div className="space-y-2">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Quota (MB)</label>
                <input type="number" title="quota" className="w-full border border-slate-200 rounded-xl py-3 px-4 text-sm" value={quota} onChange={e => setQuota(e.target.value)} min="1" required />
              </div>

              {/* Catchall option */}
              <div className={`flex items-start gap-3 p-4 rounded-xl border transition-colors ${isCatchall ? 'bg-violet-50 border-violet-200' : 'bg-slate-50 border-slate-200'} ${selectedDomainHasCatchall ? 'opacity-60' : ''}`}>
                <input
                  id="catchall-checkbox"
                  type="checkbox"
                  className="mt-0.5 w-4 h-4 accent-violet-600 cursor-pointer disabled:cursor-not-allowed"
                  checked={isCatchall}
                  disabled={selectedDomainHasCatchall}
                  onChange={e => setIsCatchall(e.target.checked)}
                />
                <label htmlFor="catchall-checkbox" className={`flex-1 ${selectedDomainHasCatchall ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                  <span className="flex items-center gap-1.5 text-sm font-bold text-slate-700">
                    <Inbox size={14} className={isCatchall ? 'text-violet-600' : 'text-slate-400'} />
                    Catchall mailbox
                  </span>
                  <p className="mt-0.5 text-[11px] text-slate-500 leading-snug">
                    {selectedDomainHasCatchall
                      ? 'This domain already has a catchall mailbox.'
                      : 'All unmatched email sent to this domain will be delivered here. Only one catchall is allowed per domain.'}
                  </p>
                </label>
              </div>

              <div className="pt-2 flex gap-3">
                <button type="button" onClick={() => { setIsMailboxModalOpen(false); setIsCatchall(false); }} className="flex-1 px-4 py-3 rounded-xl font-bold text-slate-600 bg-slate-100 text-sm">Cancel</button>
                <button type="submit" className="flex-1 px-4 py-3 rounded-xl font-bold text-white bg-emerald-600 hover:bg-emerald-700 text-sm">Create Mailbox</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ClientEmailPage;
