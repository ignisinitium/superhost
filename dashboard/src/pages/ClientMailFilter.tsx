import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import toast from 'react-hot-toast';
import { ShieldCheck, Plus, Trash2, Mail, Server, Globe, Send, AlertTriangle, Info } from 'lucide-react';

// Where customers point their MX. (The gateway host on this server.)
const MX_TARGET = 'web02.qc.fyi';

interface Recipient { id: number; address: string; }
interface RelayDomain {
  id: number; domain_name: string; destination_host: string; destination_port: number;
  spam_threshold: number; enabled: boolean; recipients: Recipient[];
}
interface QuarantineItem {
  id: number; recipient: string; sender: string; subject: string; spam_score: number;
  created_at: string; domain_name: string;
}

const ClientMailFilter: React.FC = () => {
  const qc = useQueryClient();
  const [dom, setDom] = useState('');
  const [host, setHost] = useState('');
  const [port, setPort] = useState('25');
  const [newAddr, setNewAddr] = useState<Record<number, string>>({});

  const { data: domains = [] } = useQuery<RelayDomain[]>({
    queryKey: ['relayDomains'], queryFn: async () => (await api.get('/client/relay')).data,
  });
  const { data: quarantine = [] } = useQuery<QuarantineItem[]>({
    queryKey: ['relayQuarantine'], queryFn: async () => (await api.get('/client/relay/quarantine')).data,
    refetchInterval: 30000,
  });

  const refetch = () => { qc.invalidateQueries({ queryKey: ['relayDomains'] }); qc.invalidateQueries({ queryKey: ['relayQuarantine'] }); };

  const addDomain = useMutation({
    mutationFn: async () => (await api.post('/client/relay', { domainName: dom, destinationHost: host, destinationPort: Number(port) })).data,
    onSuccess: () => { toast.success('Domain added — point your MX to get started'); setDom(''); setHost(''); setPort('25'); refetch(); },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed to add domain'),
  });
  const delDomain = useMutation({ mutationFn: async (id: number) => api.delete(`/client/relay/${id}`), onSuccess: () => { toast.success('Removed'); refetch(); } });
  const addAddr = useMutation({
    mutationFn: async ({ id, address }: { id: number; address: string }) => api.post(`/client/relay/${id}/recipients`, { address }),
    onSuccess: () => { toast.success('Address added'); refetch(); }, onError: (e: any) => toast.error(e.response?.data?.message || 'Failed'),
  });
  const delAddr = useMutation({ mutationFn: async ({ id, rid }: { id: number; rid: number }) => api.delete(`/client/relay/${id}/recipients/${rid}`), onSuccess: refetch });
  const release = useMutation({ mutationFn: async (qid: number) => api.post(`/client/relay/quarantine/${qid}/release`), onSuccess: () => { toast.success('Delivering to your server'); refetch(); } });
  const del = useMutation({ mutationFn: async (qid: number) => api.delete(`/client/relay/quarantine/${qid}`), onSuccess: () => { toast.success('Deleted'); refetch(); } });

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center gap-3">
        <ShieldCheck className="text-violet-600" size={26} />
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Email Spam Filter</h1>
          <p className="text-slate-500 text-sm">Filter spam &amp; malware for email you host anywhere. We scan inbound mail and deliver the clean messages to your server.</p>
        </div>
      </div>

      {/* Add domain */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
        <h2 className="font-bold text-slate-800 mb-4">Add a domain to protect</h2>
        <form onSubmit={(e) => { e.preventDefault(); addDomain.mutate(); }} className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="relative md:col-span-2">
            <Globe className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input required value={dom} onChange={e => setDom(e.target.value.toLowerCase())} placeholder="yourdomain.com"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/40" />
          </div>
          <div className="relative">
            <Server className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input required value={host} onChange={e => setHost(e.target.value)} placeholder="your mail server"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/40" />
          </div>
          <input value={port} onChange={e => setPort(e.target.value.replace(/\D/g, ''))} placeholder="25"
            className="bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/40" />
          <button type="submit" disabled={addDomain.isPending}
            className="md:col-span-4 bg-violet-600 hover:bg-violet-700 text-white font-bold py-2.5 rounded-xl text-sm flex items-center justify-center gap-2 disabled:opacity-50">
            <Plus size={16} /> Add domain
          </button>
        </form>
        <p className="text-xs text-slate-400 mt-2">Destination = where your mailboxes actually live (e.g. <code>aspmx.l.google.com</code> or <code>mail.yourhost.com</code>).</p>
      </div>

      {/* Domains */}
      {domains.map(d => (
        <div key={d.id} className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="font-bold text-slate-800 text-lg">{d.domain_name}</h3>
              <p className="text-sm text-slate-500">Clean mail → <span className="font-mono">{d.destination_host}:{d.destination_port}</span></p>
            </div>
            <button onClick={() => { if (confirm(`Stop filtering ${d.domain_name}?`)) delDomain.mutate(d.id); }}
              className="text-slate-400 hover:text-red-600 p-2 rounded-lg hover:bg-red-50"><Trash2 size={16} /></button>
          </div>

          <div className="mt-3 bg-violet-50 border border-violet-100 rounded-xl px-4 py-3 text-sm text-violet-900 flex gap-2">
            <Info size={16} className="shrink-0 mt-0.5 text-violet-600" />
            <span>Point your domain's <strong>MX record</strong> to <strong className="font-mono">{MX_TARGET}</strong> (priority 10) so mail flows through the filter.</span>
          </div>

          {/* Protected addresses */}
          <div className="mt-4">
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Protected addresses ({d.recipients.length})</div>
            <div className="flex flex-wrap gap-2 mb-3">
              {d.recipients.map(r => (
                <span key={r.id} className="inline-flex items-center gap-1.5 bg-slate-100 text-slate-700 text-xs px-2.5 py-1 rounded-full">
                  <Mail size={12} /> {r.address}
                  <button onClick={() => delAddr.mutate({ id: d.id, rid: r.id })} className="text-slate-400 hover:text-red-600">×</button>
                </span>
              ))}
              {d.recipients.length === 0 && <span className="text-xs text-slate-400">Add the addresses you want protected — only these will be accepted.</span>}
            </div>
            <div className="flex gap-2">
              <input value={newAddr[d.id] ?? ''} onChange={e => setNewAddr({ ...newAddr, [d.id]: e.target.value.toLowerCase() })}
                placeholder={`user@${d.domain_name}`} className="flex-1 bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/40" />
              <button onClick={() => { addAddr.mutate({ id: d.id, address: newAddr[d.id] ?? '' }); setNewAddr({ ...newAddr, [d.id]: '' }); }}
                className="bg-slate-800 hover:bg-slate-900 text-white text-sm font-bold px-4 rounded-xl">Add</button>
            </div>
          </div>
        </div>
      ))}

      {/* Quarantine */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex items-center gap-3">
          <AlertTriangle className="text-amber-500" size={20} />
          <h2 className="font-bold text-slate-800">Quarantine</h2>
          <span className="text-xs text-slate-400">({quarantine.length} held)</span>
        </div>
        {quarantine.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm">No quarantined messages.</div>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider bg-slate-50/70">
              <th className="px-5 py-3">From</th><th className="px-5 py-3">To</th><th className="px-5 py-3">Subject</th>
              <th className="px-5 py-3">Score</th><th className="px-5 py-3 text-right">Actions</th>
            </tr></thead>
            <tbody>
              {quarantine.map(q => (
                <tr key={q.id} className="border-t border-slate-100 hover:bg-slate-50/50">
                  <td className="px-5 py-3 font-mono text-xs text-slate-600">{q.sender || '—'}</td>
                  <td className="px-5 py-3 text-xs text-slate-600">{q.recipient}</td>
                  <td className="px-5 py-3 text-slate-700">{q.subject || <em className="text-slate-400">no subject</em>}</td>
                  <td className="px-5 py-3"><span className="text-xs font-bold text-orange-600 bg-orange-50 border border-orange-200 rounded px-1.5 py-0.5">{Number(q.spam_score).toFixed(1)}</span></td>
                  <td className="px-5 py-3 text-right whitespace-nowrap">
                    <button onClick={() => release.mutate(q.id)} className="inline-flex items-center gap-1 bg-green-600 hover:bg-green-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg mr-1.5"><Send size={12} /> Release</button>
                    <button onClick={() => del.mutate(q.id)} className="inline-flex items-center gap-1 bg-red-600 hover:bg-red-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg"><Trash2 size={12} /> Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default ClientMailFilter;
