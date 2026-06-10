import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../api/client';
import BrandMark from '../components/BrandMark';
import { User, Lock, Mail, Globe, Server, Check, X, Plus, Trash2, ArrowRight, Loader2 } from 'lucide-react';

interface Product { id: number; name: string; price_cents: number; annual_price_cents: number; billing_unit: string; }

const OrderFilter: React.FC = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const planId = params.get('plan') ? Number(params.get('plan')) : null;
  const canceled = params.get('canceled') === '1';

  const [product, setProduct] = useState<Product | null>(null);
  const [cycle, setCycle] = useState<'monthly' | 'annual'>('monthly');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [domain, setDomain] = useState('');
  const [host, setHost] = useState('');
  const [port, setPort] = useState('25');
  const [addresses, setAddresses] = useState<string[]>(['']);
  const [unameState, setUnameState] = useState<'idle' | 'checking' | 'ok' | 'taken' | 'invalid'>('idle');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.get('/public/services').then(r => {
      const list: Product[] = r.data;
      setProduct(list.find(p => p.id === planId) || list.find(p => p.billing_unit === 'mailbox') || null);
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!username) { setUnameState('idle'); return; }
    setUnameState('checking');
    const t = setTimeout(() => {
      api.post('/public/check-username', { username })
        .then(res => setUnameState(res.data.available ? 'ok' : (res.data.reason === 'invalid' ? 'invalid' : 'taken')))
        .catch(() => setUnameState('idle'));
    }, 450);
    return () => clearTimeout(t);
  }, [username]);

  const validAddrs = addresses.map(a => a.trim().toLowerCase()).filter(Boolean);
  const qty = validAddrs.length || 1;
  const unitMo = product ? product.price_cents / 100 : 0;
  const unitYr = product ? product.annual_price_cents / 100 : 0;
  const total = cycle === 'annual' ? unitYr * qty : unitMo * qty;

  const setAddr = (i: number, v: string) => setAddresses(addresses.map((a, idx) => idx === i ? v : a));
  const addRow = () => setAddresses([...addresses, '']);
  const rmRow = (i: number) => setAddresses(addresses.filter((_, idx) => idx !== i));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (unameState === 'taken' || unameState === 'invalid') { setError('Choose a valid, available username.'); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    const addrs = validAddrs;
    if (addrs.length < 1) { setError('Add at least one mailbox to protect.'); return; }
    if (addrs.some(a => a.split('@')[1] !== domain.trim().toLowerCase())) { setError(`Every mailbox must be @${domain || 'yourdomain.com'}.`); return; }
    setSubmitting(true);
    try {
      const res = await api.post('/public/checkout-filter', {
        username, email, password, domain, destinationHost: host, destinationPort: Number(port),
        addresses: addrs, productId: product?.id, cycle,
      });
      window.location.href = res.data.url;
    } catch (err: any) {
      setError(err.response?.data?.message || 'Could not start checkout.');
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-100">
        <div className="max-w-3xl mx-auto px-6 h-16 flex items-center cursor-pointer" onClick={() => navigate('/')}>
          <BrandMark size="lg" />
        </div>
      </header>
      <div className="max-w-3xl mx-auto px-6 py-10">
        <h1 className="text-2xl font-bold text-slate-800">Set up your spam filter</h1>
        <p className="text-slate-500 mt-1">Protect email you host anywhere. Billed per protected mailbox.</p>
        {canceled && <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-4 py-3 mt-4 text-sm">Checkout was canceled — your details are below.</div>}

        <form onSubmit={submit} className="mt-6 space-y-6">
          {/* Cycle + price */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 flex items-center justify-between flex-wrap gap-3">
            <div>
              <div className="font-bold text-slate-800">{product?.name ?? 'Email Spam Filter'}</div>
              <div className="text-sm text-slate-500">${cycle === 'annual' ? unitYr.toFixed(2) + '/mailbox/yr' : unitMo.toFixed(2) + '/mailbox/mo'} · {qty} mailbox{qty === 1 ? '' : 'es'}</div>
            </div>
            <div className="flex items-center gap-3">
              <div className="inline-flex bg-slate-100 rounded-lg p-1 text-xs font-bold">
                <button type="button" onClick={() => setCycle('monthly')} className={`px-3 py-1.5 rounded-md ${cycle === 'monthly' ? 'bg-white text-violet-600 shadow-sm' : 'text-slate-500'}`}>Monthly</button>
                <button type="button" onClick={() => setCycle('annual')} className={`px-3 py-1.5 rounded-md ${cycle === 'annual' ? 'bg-white text-violet-600 shadow-sm' : 'text-slate-500'}`}>Annual</button>
              </div>
              <div className="text-right"><span className="text-2xl font-extrabold text-slate-800">${total.toFixed(2)}</span><span className="text-slate-400 text-sm">/{cycle === 'annual' ? 'yr' : 'mo'}</span></div>
            </div>
          </div>

          {/* Account */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">Username</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input value={username} onChange={e => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))} placeholder="yourname" required
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pl-10 pr-10 text-slate-800 focus:outline-none focus:ring-2 focus:ring-violet-500/40" />
                <span className="absolute right-3 top-1/2 -translate-y-1/2">
                  {unameState === 'checking' && <Loader2 size={16} className="text-slate-400 animate-spin" />}
                  {unameState === 'ok' && <Check size={16} className="text-emerald-500" />}
                  {(unameState === 'taken' || unameState === 'invalid') && <X size={16} className="text-red-500" />}
                </span>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div><label className="block text-sm font-medium text-slate-600 mb-1">Email</label>
                <div className="relative"><Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pl-10 pr-4 focus:outline-none focus:ring-2 focus:ring-violet-500/40" /></div></div>
              <div><label className="block text-sm font-medium text-slate-600 mb-1">Password</label>
                <div className="relative"><Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 8 chars" required className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pl-10 pr-4 focus:outline-none focus:ring-2 focus:ring-violet-500/40" /></div></div>
            </div>
          </div>

          {/* Domain + destination */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-1"><label className="block text-sm font-medium text-slate-600 mb-1">Your domain</label>
                <div className="relative"><Globe className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input value={domain} onChange={e => setDomain(e.target.value.toLowerCase())} placeholder="yourdomain.com" required className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pl-10 pr-4 focus:outline-none focus:ring-2 focus:ring-violet-500/40" /></div></div>
              <div className="md:col-span-1"><label className="block text-sm font-medium text-slate-600 mb-1">Your mail server</label>
                <div className="relative"><Server className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input value={host} onChange={e => setHost(e.target.value)} placeholder="mail.yourhost.com" required className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pl-10 pr-4 focus:outline-none focus:ring-2 focus:ring-violet-500/40" /></div></div>
              <div><label className="block text-sm font-medium text-slate-600 mb-1">Port</label>
                <input value={port} onChange={e => setPort(e.target.value.replace(/\D/g, ''))} placeholder="25" className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 focus:outline-none focus:ring-2 focus:ring-violet-500/40" /></div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">Mailboxes to protect (you're billed per mailbox)</label>
              <div className="space-y-2">
                {addresses.map((a, i) => (
                  <div key={i} className="flex gap-2">
                    <input value={a} onChange={e => setAddr(i, e.target.value.toLowerCase())} placeholder={`user@${domain || 'yourdomain.com'}`}
                      className="flex-1 bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/40" />
                    {addresses.length > 1 && <button type="button" onClick={() => rmRow(i)} className="text-slate-400 hover:text-red-600 px-2"><Trash2 size={16} /></button>}
                  </div>
                ))}
              </div>
              <button type="button" onClick={addRow} className="mt-2 text-sm text-violet-600 font-medium flex items-center gap-1"><Plus size={14} /> Add another mailbox</button>
            </div>
            <div className="bg-violet-50 border border-violet-100 rounded-xl px-4 py-2.5 text-xs text-violet-900">After checkout, point your domain's MX record to <strong className="font-mono">web02.qc.fyi</strong> to start filtering.</div>
          </div>

          {error && <div className="bg-red-50 border border-red-200 text-red-600 rounded-xl px-4 py-3 text-sm">{error}</div>}
          <button type="submit" disabled={submitting} className="w-full bg-violet-600 hover:bg-violet-700 text-white font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 disabled:opacity-50">
            {submitting ? 'Starting checkout…' : <>Continue to payment · ${total.toFixed(2)}/{cycle === 'annual' ? 'yr' : 'mo'} <ArrowRight size={18} /></>}
          </button>
        </form>
      </div>
    </div>
  );
};

export default OrderFilter;
