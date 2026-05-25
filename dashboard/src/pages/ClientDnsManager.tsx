import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import { 
  Globe, Plus, Trash2, Search, Edit2
} from 'lucide-react';
import toast from 'react-hot-toast';
import type { DnsZone, DnsRecord } from '../../../shared/types';

const ClientDnsManager: React.FC = () => {
  const queryClient = useQueryClient();
  const [selectedZone, setSelectedZone] = useState<DnsZone | null>(null);
  const [isRecordModalOpen, setIsRecordModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<DnsRecord | null>(null);

  // Form State
  const [name, setName] = useState('');
  const [type, setType] = useState('A');
  const [content, setContent] = useState('');
  const [priority, setPriority] = useState('');
  const [ttl, setTtl] = useState('');

  const { data: zones, isLoading: isLoadingZones } = useQuery<DnsZone[]>({
    queryKey: ['userDnsZones'],
    queryFn: async () => {
      const res = await api.get('/client/dns/zones');
      return res.data;
    }
  });

  const { data: records, isLoading: isLoadingRecords } = useQuery<DnsRecord[]>({
    queryKey: ['dnsRecords', selectedZone?.id],
    queryFn: async () => {
      if (!selectedZone) return [];
      const res = await api.get(`/client/dns/zones/${selectedZone.id}/records`);
      return res.data;
    },
    enabled: !!selectedZone
  });

  const saveRecordMutation = useMutation({
    mutationFn: async () => {
      const payload = { 
        name, 
        type, 
        content, 
        priority: priority ? parseInt(priority) : null, 
        ttl: ttl ? parseInt(ttl) : null 
      };
      
      if (editingRecord) {
        const res = await api.put(`/client/dns/zones/${selectedZone?.id}/records/${editingRecord.id}`, payload);
        return res.data;
      } else {
        const res = await api.post(`/client/dns/zones/${selectedZone?.id}/records`, payload);
        return res.data;
      }
    },
    onSuccess: () => {
      toast.success(editingRecord ? 'Record updated!' : 'Record added!');
      setIsRecordModalOpen(false);
      resetForm();
      queryClient.invalidateQueries({ queryKey: ['dnsRecords', selectedZone?.id] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Failed to save record');
    }
  });

  const deleteRecordMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await api.delete(`/client/dns/zones/${selectedZone?.id}/records/${id}`);
      return res.data;
    },
    onSuccess: () => {
      toast.success('Record deleted');
      queryClient.invalidateQueries({ queryKey: ['dnsRecords', selectedZone?.id] });
    }
  });

  const resetForm = () => {
    setName('');
    setType('A');
    setContent('');
    setPriority('');
    setTtl('');
    setEditingRecord(null);
  };

  const openEditModal = (record: DnsRecord) => {
    setEditingRecord(record);
    setName(record.name);
    setType(record.type);
    setContent(record.content);
    setPriority(record.priority?.toString() || '');
    setTtl(record.ttl?.toString() || '');
    setIsRecordModalOpen(true);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-3">
             <Globe className="text-cyan-600" size={28} />
             DNS Zone Manager
          </h1>
          <p className="text-slate-500 mt-1 ml-1">Configure DNS records and routing for your domains.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Zones Sidebar */}
        <div className="lg:col-span-1 space-y-4">
           <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
              <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 px-2">Your Domains</h2>
              <div className="space-y-1">
                 {isLoadingZones ? (
                    <div className="p-4 text-center text-slate-400 text-xs italic">Loading zones...</div>
                 ) : zones && zones.length > 0 ? (
                    zones.map(zone => (
                       <button
                         key={zone.id}
                         onClick={() => setSelectedZone(zone)}
                         className={`w-full text-left px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                            selectedZone?.id === zone.id 
                            ? 'bg-cyan-50 text-cyan-700 border border-cyan-100' 
                            : 'hover:bg-slate-50 text-slate-600 border border-transparent'
                         }`}
                       >
                          {zone.domain_name}
                       </button>
                    ))
                 ) : (
                    <div className="p-4 text-center text-slate-400 text-xs italic">No domains found.</div>
                 )}
              </div>
           </div>
        </div>

        {/* Records View */}
        <div className="lg:col-span-3">
           {selectedZone ? (
              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm animate-in slide-in-from-right-4 duration-300">
                <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-slate-800">{selectedZone.domain_name}</h2>
                    <p className="text-xs text-slate-500">Default TTL: {selectedZone.ttl}s</p>
                  </div>
                  <button
                    onClick={() => { resetForm(); setIsRecordModalOpen(true); }}
                    className="bg-cyan-600 hover:bg-cyan-700 text-white px-4 py-2 rounded-xl font-bold transition-all text-xs flex items-center gap-2"
                  >
                    <Plus size={14} />
                    Add Record
                  </button>
                </div>
                
                <div className="overflow-x-auto">
                   <table className="w-full text-left text-sm">
                      <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200 uppercase tracking-widest text-[10px]">
                        <tr>
                          <th className="px-6 py-4">Name</th>
                          <th className="px-6 py-4">Type</th>
                          <th className="px-6 py-4">Content</th>
                          <th className="px-6 py-4">TTL</th>
                          <th className="px-6 py-4 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                         {isLoadingRecords ? (
                            <tr><td colSpan={5} className="px-6 py-8 text-center text-slate-400">Loading records...</td></tr>
                         ) : records && records.length > 0 ? (
                            records.map(record => (
                               <tr key={record.id} className="hover:bg-slate-50/50 transition-colors group">
                                  <td className="px-6 py-4 font-mono text-xs text-slate-700">
                                     {record.name}
                                  </td>
                                  <td className="px-6 py-4">
                                     <span className="px-2 py-1 rounded bg-slate-100 text-slate-600 font-bold text-[10px] border border-slate-200">
                                        {record.type}
                                     </span>
                                  </td>
                                  <td className="px-6 py-4 font-mono text-xs text-slate-600 break-all max-w-xs">
                                     {record.priority && <span className="text-amber-600 mr-2">[{record.priority}]</span>}
                                     {record.content}
                                  </td>
                                  <td className="px-6 py-4 text-slate-400 text-xs">
                                     {record.ttl || 'Default'}
                                  </td>
                                  <td className="px-6 py-4 text-right">
                                     <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button 
                                          onClick={() => openEditModal(record)}
                                          className="p-2 text-slate-400 hover:text-cyan-600 hover:bg-cyan-50 rounded-lg transition-all"
                                        >
                                           <Edit2 size={14} />
                                        </button>
                                        <button 
                                          onClick={() => { if(window.confirm('Delete this record?')) deleteRecordMutation.mutate(record.id); }}
                                          className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                                        >
                                           <Trash2 size={14} />
                                        </button>
                                     </div>
                                  </td>
                               </tr>
                            ))
                         ) : (
                            <tr><td colSpan={5} className="px-6 py-12 text-center text-slate-400 italic">No custom records found.</td></tr>
                         )}
                      </tbody>
                   </table>
                </div>
              </div>
           ) : (
              <div className="h-full min-h-[400px] flex flex-col items-center justify-center bg-slate-50/50 border-2 border-dashed border-slate-200 rounded-3xl p-12 text-center">
                 <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center text-slate-300 shadow-sm mb-4">
                    <Search size={32} />
                 </div>
                 <h3 className="text-lg font-bold text-slate-800">No Zone Selected</h3>
                 <p className="text-sm text-slate-500 max-w-xs mt-2">
                    Select a domain from the sidebar to manage its DNS records and global routing.
                 </p>
              </div>
           )}
        </div>
      </div>

      {isRecordModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-800">
                 {editingRecord ? 'Edit DNS Record' : 'Add New DNS Record'}
              </h2>
              <button onClick={() => setIsRecordModalOpen(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>
            
            <form onSubmit={(e) => { e.preventDefault(); saveRecordMutation.mutate(); }} className="p-6 space-y-4">
              <div className="grid grid-cols-3 gap-4">
                 <div className="col-span-2 space-y-1">
                   <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Name / Host</label>
                   <input 
                     type="text" 
                     className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-sm font-mono" 
                     value={name} 
                     onChange={(e) => setName(e.target.value)} 
                     placeholder="e.g. www or @" 
                     required 
                   />
                 </div>
                 <div className="space-y-1">
                   <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Type</label>
                   <select 
                     className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-sm font-bold text-cyan-700"
                     value={type}
                     onChange={(e) => setType(e.target.value)}
                   >
                      <option value="A">A</option>
                      <option value="AAAA">AAAA</option>
                      <option value="CNAME">CNAME</option>
                      <option value="MX">MX</option>
                      <option value="TXT">TXT</option>
                      <option value="NS">NS</option>
                      <option value="SRV">SRV</option>
                   </select>
                 </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Content / Value</label>
                <input 
                  type="text" 
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-sm font-mono" 
                  value={content} 
                  onChange={(e) => setContent(e.target.value)} 
                  placeholder={type === 'A' ? '1.2.3.4' : 'Target value'} 
                  required 
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                 <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Priority (MX/SRV)</label>
                    <input 
                      type="number" 
                      disabled={type !== 'MX' && type !== 'SRV'}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-sm disabled:opacity-30" 
                      value={priority} 
                      onChange={(e) => setPriority(e.target.value)} 
                      placeholder="10" 
                    />
                 </div>
                 <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">TTL (Seconds)</label>
                    <input 
                      type="number" 
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-sm" 
                      value={ttl} 
                      onChange={(e) => setTtl(e.target.value)} 
                      placeholder="3600" 
                    />
                 </div>
              </div>

              <div className="pt-4 flex gap-3">
                <button type="button" onClick={() => setIsRecordModalOpen(false)} className="flex-1 px-4 py-3 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 text-sm transition-all">Cancel</button>
                <button type="submit" disabled={saveRecordMutation.isPending} className="flex-1 px-4 py-3 rounded-xl font-bold text-white bg-cyan-600 hover:bg-cyan-700 shadow-md shadow-cyan-900/10 text-sm transition-all disabled:opacity-50">
                  {saveRecordMutation.isPending ? 'Saving...' : 'Save Record'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ClientDnsManager;
