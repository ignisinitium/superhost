import React, { useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import api from '../api/client';
import { CreditCard, Download, CheckCircle, Clock, XCircle, Box, Server, Globe } from 'lucide-react';
import toast from 'react-hot-toast';
import { useLocation } from 'react-router-dom';

interface Product {
  id: number;
  name: string;
  description: string;
  price_cents: number;
  type: string;
}

interface Invoice {
  id: number;
  stripe_invoice_id: string;
  amount_cents: number;
  status: string;
  created_at: string;
  paid_at: string | null;
}

const ClientBillingPage: React.FC = () => {
  const location = useLocation();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('success')) {
      toast.success('Payment successful! Your service will be provisioned shortly.');
    }
    if (params.get('canceled')) {
      toast.error('Payment was canceled.');
    }
  }, [location]);

  const { data: products, isLoading: productsLoading } = useQuery<Product[]>({
    queryKey: ['products'],
    queryFn: async () => {
      const res = await api.get('/billing/products');
      return res.data;
    }
  });

  const { data: invoices, isLoading: invoicesLoading } = useQuery<Invoice[]>({
    queryKey: ['invoices'],
    queryFn: async () => {
      const res = await api.get('/billing/invoices');
      return res.data;
    }
  });

  const checkoutMutation = useMutation({
    mutationFn: async (productId: number) => {
      const res = await api.post('/billing/create-checkout-session', { productId });
      return res.data;
    },
    onSuccess: (data) => {
      if (data.url.startsWith('/client/billing')) {
        // Demo mode fallback routing
        window.location.href = data.url;
      } else {
        // Real Stripe redirect
        window.location.href = data.url;
      }
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Failed to initialize checkout');
    }
  });

  const getProductIcon = (type: string) => {
    switch (type) {
      case 'hosting': return <Server className="text-blue-500" size={24} />;
      case 'addon': return <Globe className="text-purple-500" size={24} />;
      default: return <Box className="text-slate-500" size={24} />;
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Billing & Storefront</h1>
          <p className="text-slate-500 mt-1">Order new services, view invoices, and manage subscriptions.</p>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex items-center gap-3">
          <Box className="text-blue-600" size={20} />
          <h2 className="text-lg font-bold text-slate-800">Available Services</h2>
        </div>
        
        <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
          {productsLoading ? (
            <div className="col-span-3 text-center py-8 text-slate-400">Loading products...</div>
          ) : products && products.length > 0 ? (
            products.map((product) => (
              <div key={product.id} className="border border-slate-200 rounded-xl p-6 flex flex-col justify-between hover:border-blue-300 hover:shadow-md transition-all group">
                <div>
                  <div className="w-12 h-12 rounded-lg bg-slate-50 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    {getProductIcon(product.type)}
                  </div>
                  <h3 className="font-bold text-slate-800 text-lg">{product.name}</h3>
                  <p className="text-slate-500 text-sm mt-2 line-clamp-2">{product.description}</p>
                </div>
                <div className="mt-6 pt-6 border-t border-slate-100">
                  <div className="flex items-end gap-1 mb-4">
                    <span className="text-2xl font-bold text-slate-800">${(product.price_cents / 100).toFixed(2)}</span>
                    <span className="text-slate-500 text-sm mb-1">/mo</span>
                  </div>
                  <button 
                    onClick={() => checkoutMutation.mutate(product.id)}
                    disabled={checkoutMutation.isPending}
                    className="w-full bg-slate-800 hover:bg-slate-900 text-white font-bold py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    Order Now
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="col-span-3 text-center py-8 text-slate-400">No products available at this time.</div>
          )}
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex items-center gap-3">
          <CreditCard className="text-slate-700" size={20} />
          <h2 className="text-lg font-bold text-slate-800">Invoice History</h2>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 uppercase tracking-wider text-[10px] font-bold">Invoice ID</th>
                <th className="px-6 py-4 uppercase tracking-wider text-[10px] font-bold">Date</th>
                <th className="px-6 py-4 uppercase tracking-wider text-[10px] font-bold">Amount</th>
                <th className="px-6 py-4 uppercase tracking-wider text-[10px] font-bold">Status</th>
                <th className="px-6 py-4 uppercase tracking-wider text-[10px] font-bold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {invoicesLoading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-slate-400">Loading invoices...</td>
                </tr>
              ) : invoices && invoices.length > 0 ? (
                invoices.map((invoice) => (
                  <tr key={invoice.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4 font-mono text-xs text-slate-600">{invoice.stripe_invoice_id}</td>
                    <td className="px-6 py-4 text-slate-500 text-xs">{new Date(invoice.created_at).toLocaleDateString()}</td>
                    <td className="px-6 py-4 font-bold text-slate-800">${(invoice.amount_cents / 100).toFixed(2)}</td>
                    <td className="px-6 py-4">
                      {invoice.status === 'paid' ? (
                         <span className="inline-flex items-center gap-1 py-1 px-2.5 rounded-full text-[10px] font-bold bg-green-50 text-green-700 border border-green-200">
                           <CheckCircle size={12} /> Paid
                         </span>
                      ) : invoice.status === 'open' ? (
                         <span className="inline-flex items-center gap-1 py-1 px-2.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                           <Clock size={12} /> Pending
                         </span>
                      ) : (
                         <span className="inline-flex items-center gap-1 py-1 px-2.5 rounded-full text-[10px] font-bold bg-red-50 text-red-700 border border-red-200">
                           <XCircle size={12} /> Failed
                         </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                       <button className="text-slate-400 hover:text-blue-600 p-2 rounded-lg hover:bg-blue-50 transition-colors inline-block" title="Download PDF">
                         <Download size={16} />
                       </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-400 italic">No invoices found on your account.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ClientBillingPage;
