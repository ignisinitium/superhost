import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import { Box, Plus, Trash2, DollarSign, Tag, TextCursor } from 'lucide-react';
import toast from 'react-hot-toast';

interface Product {
  id: number;
  name: string;
  description: string;
  price_cents: number;
  type: string;
  stripe_price_id: string;
}

const PackagesPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [priceCents, setPriceCents] = useState('');
  const [type, setType] = useState('hosting');
  const [stripePriceId, setStripePriceId] = useState('');

  const { data: products, isLoading } = useQuery<Product[]>({
    queryKey: ['products'],
    queryFn: async () => {
      const res = await api.get('/billing/products');
      return res.data;
    }
  });

  const createProductMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/billing/products', {
        name,
        description,
        price_cents: parseInt(priceCents),
        type,
        stripe_price_id: stripePriceId
      });
      return res.data;
    },
    onSuccess: () => {
      toast.success('Package created successfully!');
      setIsModalOpen(false);
      setName('');
      setDescription('');
      setPriceCents('');
      setStripePriceId('');
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Failed to create package');
    }
  });

  const deleteProductMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await api.delete(`/billing/products/${id}`);
      return res.data;
    },
    onSuccess: () => {
      toast.success('Package deleted');
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Failed to delete package');
    }
  });

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Packages & Features</h1>
          <p className="text-slate-500 mt-1">Define hosting plans and add-on services for your clients.</p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="bg-orange-600 hover:bg-orange-700 text-white px-5 py-2.5 rounded-xl font-bold transition-all shadow-md shadow-orange-900/10 flex items-center gap-2 text-sm"
        >
          <Plus size={18} />
          Create Package
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex items-center gap-3">
          <Box className="text-orange-600" size={20} />
          <h2 className="text-lg font-bold text-slate-800">Service Inventory</h2>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 uppercase tracking-wider text-[10px] font-bold">Package Name</th>
                <th className="px-6 py-4 uppercase tracking-wider text-[10px] font-bold">Type</th>
                <th className="px-6 py-4 uppercase tracking-wider text-[10px] font-bold">Price</th>
                <th className="px-6 py-4 uppercase tracking-wider text-[10px] font-bold">Stripe Price ID</th>
                <th className="px-6 py-4 uppercase tracking-wider text-[10px] font-bold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-slate-400">Loading packages...</td>
                </tr>
              ) : products && products.length > 0 ? (
                products.map((product) => (
                  <tr key={product.id} className="hover:bg-slate-50/50 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="font-bold text-slate-800">{product.name}</div>
                      <div className="text-xs text-slate-400 line-clamp-1">{product.description}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                        {product.type}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-bold text-slate-800">
                      ${(product.price_cents / 100).toFixed(2)}
                    </td>
                    <td className="px-6 py-4 font-mono text-xs text-slate-500 italic">
                      {product.stripe_price_id || 'none'}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => {
                          if (window.confirm(`Delete package ${product.name}?`)) {
                            deleteProductMutation.mutate(product.id);
                          }
                        }}
                        className="text-red-400 hover:text-red-600 p-2 rounded-lg hover:bg-red-50 transition-colors inline-block"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-400 italic">No packages defined.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-800">Create New Package</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>
            
            <form onSubmit={(e) => { e.preventDefault(); createProductMutation.mutate(); }} className="p-6 space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Package Name</label>
                <div className="relative">
                  <Tag className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <input type="text" className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pl-10 pr-4 text-sm" value={name} onChange={(e) => setName(e.target.value)} placeholder="Basic Hosting" required />
                </div>
              </div>
              
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Description</label>
                <div className="relative">
                  <TextCursor className="absolute left-3 top-4 text-slate-400" size={16} />
                  <textarea className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pl-10 pr-4 text-sm h-20 resize-none" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="10GB Storage, 1 Domain..." required />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Price (Cents)</label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input type="number" className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pl-10 pr-4 text-sm" value={priceCents} onChange={(e) => setPriceCents(e.target.value)} placeholder="500" required />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Service Type</label>
                  <select className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-sm appearance-none outline-none" value={type} onChange={(e) => setType(e.target.value)}>
                    <option value="hosting">Hosting Plan</option>
                    <option value="addon">Add-on Feature</option>
                    <option value="domain">Domain Service</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Stripe Price ID (Optional)</label>
                <input type="text" className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-sm font-mono" value={stripePriceId} onChange={(e) => setStripePriceId(e.target.value)} placeholder="price_H5v..." />
              </div>

              <div className="pt-4 flex gap-3">
                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 px-4 py-3 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 text-sm">Cancel</button>
                <button type="submit" disabled={createProductMutation.isPending} className="flex-1 px-4 py-3 rounded-xl font-bold text-white bg-orange-600 hover:bg-orange-700 shadow-md shadow-orange-900/10 text-sm disabled:opacity-50">
                  {createProductMutation.isPending ? 'Saving...' : 'Create Package'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default PackagesPage;
