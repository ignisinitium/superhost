import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import { Mail, Plus, Trash2, Key, ShieldCheck, Copy } from 'lucide-react';
import toast from 'react-hot-toast';

interface EmailAccount {
  id: number;
  email: string;
  domain_name: string;
  quota: number;
}

interface Domain {
  id: number;
  domain_name: string;
}

interface DnsRecord {
  id: number;
  type: string;
  name: string;
  content: string;
}

const ClientEmailPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'mailboxes' | 'security'>('mailboxes');
  const [selectedDomain, setSelectedDomain] = useState<string>('');
  
  const [localPart, setLocalPart] = useState('');
  const [domainId, setDomainId] = useState('');
  const [password, setPassword] = useState('');
  const [quota, setQuota] = useState('1024');

  const { data: emails, isLoading: isEmailsLoading } = useQuery<EmailAccount[]>({
    queryKey: ['clientEmails'],
    queryFn: async () => {
      const res = await api.get('/client/email');
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

  const { data: dnsRecords, isLoading: isDnsLoading } = useQuery<DnsRecord[]>({
    queryKey: ['clientDns', selectedDomain],
    queryFn: async () => {
      if (!selectedDomain) return [];
      const res = await api.get(`/client/domains/${selectedDomain}/dns`);
      return res.data;
    },
    enabled: !!selectedDomain && activeTab === 'security'
  });

  const createEmailMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/client/email', { 
        localPart, 
        domainId: parseInt(domainId), 
        password,
        quota: parseInt(quota)
      });
      return res.data;
    },
    onSuccess: () => {
      toast.success('Email account created! Security records are generating.');
      setIsModalOpen(false);
      setLocalPart('');
      setPassword('');
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
      toast.success('Email account deleted successfully!');
      queryClient.invalidateQueries({ queryKey: ['clientEmails'] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Failed to delete email account');
    }
  });

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Email Accounts & Security</h1>
          <p className="text-slate-500 mt-1">Manage mailboxes and DNS security records (SPF, DKIM, DMARC).</p>
        </div>
        {activeTab === 'mailboxes' && (
          <button
            onClick={() => setIsModalOpen(true)}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl font-bold transition-all shadow-md shadow-emerald-900/10 flex items-center gap-2 text-sm"
          >
            <Plus size={18} />
            Create Mailbox
          </button>
        )}
      </div>

      <div className="flex space-x-1 bg-slate-200/50 p-1 rounded-xl w-fit">
        <button
          onClick={() => setActiveTab('mailboxes')}
          className={`px-6 py-2.5 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${
            activeTab === 'mailboxes' 
            ? 'bg-white text-emerald-600 shadow-sm' 
            : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <Mail size={16} />
          Mailboxes
        </button>
        <button
          onClick={() => setActiveTab('security')}
          className={`px-6 py-2.5 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${
            activeTab === 'security' 
            ? 'bg-white text-emerald-600 shadow-sm' 
            : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <ShieldCheck size={16} />
          DNS Security
        </button>
      </div>

      {activeTab === 'mailboxes' ? (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Mail className="text-emerald-600" size={20} />
              <h2 className="text-lg font-bold text-slate-800">Active Mailboxes</h2>
            </div>
            <a href="/webmail" target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-emerald-600 hover:text-emerald-700 uppercase tracking-widest bg-emerald-50 px-3 py-1.5 rounded-full border border-emerald-100 transition-colors">
              Open Webmail
            </a>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-200">
                <tr>
                  <th className="px-6 py-4 uppercase tracking-wider text-[10px] font-bold">Email Address</th>
                  <th className="px-6 py-4 uppercase tracking-wider text-[10px] font-bold">Domain</th>
                  <th className="px-6 py-4 uppercase tracking-wider text-[10px] font-bold">Quota (MB)</th>
                  <th className="px-6 py-4 uppercase tracking-wider text-[10px] font-bold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isEmailsLoading ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-8 text-center text-slate-400">Loading mailboxes...</td>
                  </tr>
                ) : emails && emails.length > 0 ? (
                  emails.map((account) => (
                    <tr key={account.id} className="hover:bg-slate-50/50 transition-colors group">
                      <td className="px-6 py-4 font-bold text-slate-800 text-xs">{account.email}</td>
                      <td className="px-6 py-4 text-slate-500 text-xs">{account.domain_name}</td>
                      <td className="px-6 py-4 font-mono text-slate-600 text-xs">{account.quota}</td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => {
                            if (window.confirm(`Are you sure you want to delete ${account.email}? All stored mail will be lost.`)) {
                              deleteEmailMutation.mutate(account.id);
                            }
                          }}
                          className="text-red-400 hover:text-red-600 p-2 rounded-lg hover:bg-red-50 transition-colors inline-block"
                          title="Delete Mailbox"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="px-6 py-12 text-center text-slate-400 italic">No mailboxes found. Create one to get started.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <ShieldCheck className="text-emerald-600" size={20} />
              <h2 className="text-lg font-bold text-slate-800">Email DNS Records</h2>
            </div>
            <select
              className="bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-emerald-500/20"
              value={selectedDomain}
              onChange={(e) => setSelectedDomain(e.target.value)}
            >
              <option value="" disabled>Select a Domain</option>
              {domains?.map(d => (
                <option key={d.id} value={d.id}>{d.domain_name}</option>
              ))}
            </select>
          </div>

          <div className="p-6">
            {!selectedDomain ? (
              <div className="text-center py-12 text-slate-400">Select a domain from the dropdown to view its security records.</div>
            ) : isDnsLoading ? (
              <div className="text-center py-12 text-slate-400 animate-pulse">Loading DNS records...</div>
            ) : dnsRecords && dnsRecords.length > 0 ? (
              <div className="space-y-6">
                <div className="bg-blue-50 border border-blue-100 p-4 rounded-xl text-sm text-blue-800 flex items-start gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 shrink-0" />
                  <p>Add these TXT records to your domain's DNS provider (e.g., Cloudflare, GoDaddy) to ensure high deliverability and prevent your emails from going to spam.</p>
                </div>
                {dnsRecords.map((record) => (
                  <div key={record.id} className="border border-slate-200 rounded-xl overflow-hidden">
                    <div className="bg-slate-50 border-b border-slate-200 px-4 py-2 flex items-center justify-between">
                      <span className="font-bold text-slate-700 text-sm">Type: {record.type}</span>
                      <span className="text-xs text-slate-500 font-mono">Name: {record.name}</span>
                    </div>
                    <div className="p-4 flex items-center justify-between gap-4">
                      <code className="text-xs font-mono text-slate-600 break-all bg-slate-50 px-3 py-2 rounded-lg flex-1">
                        {record.content}
                      </code>
                      <button 
                        onClick={() => copyToClipboard(record.content)}
                        className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors shrink-0"
                        title="Copy to clipboard"
                      >
                        <Copy size={18} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <div className="text-slate-400 mb-2">No security records generated yet.</div>
                <div className="text-xs text-slate-500">Records are automatically generated when you create your first mailbox for this domain.</div>
              </div>
            )}
          </div>
        </div>
      )}
{isModalOpen && (
  <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-200">
      <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-800">Create New Mailbox</h2>
        <button 
          onClick={() => setIsModalOpen(false)}
          className="text-slate-400 hover:text-slate-600"
        >
          ✕
        </button>
      </div>

      <form 
        onSubmit={(e) => { e.preventDefault(); createEmailMutation.mutate(); }}
        className="p-6 space-y-5"
      >
        <div className="space-y-2">
          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Email Address</label>
          <div className="flex items-center">
            <input
              type="text"
              className="w-1/2 bg-white border border-slate-200 border-r-0 rounded-l-xl py-3 px-4 text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all font-mono text-sm"
              value={localPart}
              onChange={(e) => setLocalPart(e.target.value)}
              placeholder="contact"
              pattern="[a-zA-Z0-9._-]+"
              required
            />
            <span className="bg-slate-50 border-t border-b border-slate-200 py-3 px-2 text-slate-400 font-mono text-sm">@</span>
            <select
              className="flex-1 bg-white border border-slate-200 border-l-0 rounded-r-xl py-3 px-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all font-mono text-sm outline-none"
              value={domainId}
              onChange={(e) => setDomainId(e.target.value)}
              required
            >
              <option value="" disabled>Select Domain</option>
              {domains?.map(d => (
                <option key={d.id} value={d.id}>{d.domain_name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-2">
          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Mailbox Password</label>
          <div className="relative">
            <Key className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="password"
              className="w-full bg-white border border-slate-200 rounded-xl py-3 pl-10 pr-4 text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all font-mono text-sm"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Quota (MB)</label>
          <input
            type="number"
            className="w-full bg-white border border-slate-200 rounded-xl py-3 px-4 text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all font-mono text-sm"
            value={quota}
            onChange={(e) => setQuota(e.target.value)}
            min="1"
            required
          />
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
            disabled={createEmailMutation.isPending}
            className="flex-1 px-4 py-3 rounded-xl font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-md shadow-emerald-900/10 transition-colors text-sm disabled:opacity-50"
          >
            {createEmailMutation.isPending ? 'Creating...' : 'Create Mailbox'}
          </button>
        </div>
      </form>
    </div>
  </div>
)}
</div>
);
};

export default ClientEmailPage;
