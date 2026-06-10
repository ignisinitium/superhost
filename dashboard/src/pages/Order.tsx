import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../api/client';
import BrandMark from '../components/BrandMark';
import { User, Lock, Mail, Globe, Check, X, ArrowRight, Loader2 } from 'lucide-react';

interface Product {
  id: number;
  name: string;
  price_cents: number;
  annual_price_cents?: number;
  onetime_price_cents?: number;
  type?: string;
  is_custom?: boolean;
}
type Cycle = 'monthly' | 'annual' | 'onetime';

const CYCLE_LABEL: Record<Cycle, string> = { monthly: 'Monthly', annual: 'Annual', onetime: 'One-time' };

// Which billing cycles a given product supports, in display order.
function cyclesFor(p?: Product): Cycle[] {
  if (!p) return ['monthly'];
  if (p.type === 'service') {
    const c: Cycle[] = [];
    if ((p.onetime_price_cents ?? 0) > 0) c.push('onetime');
    if (p.price_cents > 0) c.push('monthly');
    return c.length ? c : ['onetime'];
  }
  const c: Cycle[] = ['monthly'];
  if ((p.annual_price_cents ?? 0) > 0) c.push('annual');
  return c;
}

function priceLabel(p: Product, cycle: Cycle): string {
  if (cycle === 'onetime') return `$${((p.onetime_price_cents ?? 0) / 100).toLocaleString()} one-time`;
  if (cycle === 'annual') return `$${((p.annual_price_cents ?? 0) / 100).toFixed(2)}/yr`;
  return `$${(p.price_cents / 100).toFixed(2)}/mo`;
}

const Order: React.FC = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();

  const [products, setProducts] = useState<Product[]>([]);
  const [planId, setPlanId] = useState<number | null>(params.get('plan') ? Number(params.get('plan')) : null);
  const [cycle, setCycle] = useState<Cycle>((params.get('cycle') as Cycle) || 'monthly');

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [domain, setDomain] = useState('');
  const [hasDomain, setHasDomain] = useState(true);

  const [usernameState, setUsernameState] = useState<'idle' | 'checking' | 'ok' | 'taken' | 'invalid'>('idle');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const canceled = params.get('canceled') === '1';

  useEffect(() => {
    Promise.all([
      api.get('/public/plans').then(r => r.data as Product[]).catch(() => []),
      api.get('/public/services').then(r => (r.data as Product[]).filter(s => !s.is_custom)).catch(() => []),
    ]).then(([plans, services]) => {
      const merged = [...plans, ...services];
      setProducts(merged);
      if (!planId && merged.length) setPlanId(merged[0].id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selected = products.find(p => p.id === planId);
  const available = cyclesFor(selected);

  // Keep the chosen cycle valid for the selected product.
  useEffect(() => {
    if (selected && !available.includes(cycle)) setCycle(available[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planId, products]);

  useEffect(() => {
    if (!username) { setUsernameState('idle'); return; }
    setUsernameState('checking');
    const t = setTimeout(() => {
      api.post('/public/check-username', { username })
        .then(res => setUsernameState(res.data.available ? 'ok' : (res.data.reason === 'invalid' ? 'invalid' : 'taken')))
        .catch(() => setUsernameState('idle'));
    }, 450);
    return () => clearTimeout(t);
  }, [username]);

  const price = selected ? priceLabel(selected, cycle) : '';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!planId) { setError('Please choose a package.'); return; }
    if (usernameState === 'taken' || usernameState === 'invalid') { setError('Please choose a valid, available username.'); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    setSubmitting(true);
    try {
      const res = await api.post('/public/checkout', {
        username, email, password,
        domain: hasDomain ? domain : '',
        productId: planId, cycle,
      });
      window.location.href = res.data.url; // → Stripe Checkout
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
        <h1 className="text-2xl font-bold text-slate-800">Create your account</h1>
        <p className="text-slate-500 mt-1">You'll be redirected to secure checkout to complete payment.</p>

        {canceled && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-4 py-3 mt-4 text-sm">
            Checkout was canceled — your details are below, finish whenever you're ready.
          </div>
        )}

        <form onSubmit={submit} className="mt-6 space-y-6">
          {/* Package + cycle */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <label className="font-bold text-slate-700">Package</label>
              {available.length > 1 && (
                <div className="inline-flex bg-slate-100 rounded-lg p-1 text-xs font-bold">
                  {available.map(c => (
                    <button key={c} type="button" onClick={() => setCycle(c)}
                      className={`px-3 py-1.5 rounded-md ${cycle === c ? 'bg-white text-violet-600 shadow-sm' : 'text-slate-500'}`}>
                      {CYCLE_LABEL[c]}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <select value={planId ?? ''} onChange={e => setPlanId(Number(e.target.value))}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-slate-800 focus:outline-none focus:ring-2 focus:ring-violet-500/40">
              {products.map(p => (
                <option key={p.id} value={p.id}>{p.name} — {priceLabel(p, cyclesFor(p)[0])}</option>
              ))}
            </select>
          </div>

          {/* Account details */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">Username</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input value={username} onChange={e => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
                  placeholder="yourname" required
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pl-10 pr-10 text-slate-800 focus:outline-none focus:ring-2 focus:ring-violet-500/40" />
                <span className="absolute right-3 top-1/2 -translate-y-1/2">
                  {usernameState === 'checking' && <Loader2 size={16} className="text-slate-400 animate-spin" />}
                  {usernameState === 'ok' && <Check size={16} className="text-emerald-500" />}
                  {(usernameState === 'taken' || usernameState === 'invalid') && <X size={16} className="text-red-500" />}
                </span>
              </div>
              {usernameState === 'taken' && <p className="text-xs text-red-500 mt-1">That username is taken.</p>}
              {usernameState === 'invalid' && <p className="text-xs text-red-500 mt-1">3–32 chars, start with a letter, lowercase.</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pl-10 pr-4 text-slate-800 focus:outline-none focus:ring-2 focus:ring-violet-500/40" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 8 characters" required
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pl-10 pr-4 text-slate-800 focus:outline-none focus:ring-2 focus:ring-violet-500/40" />
              </div>
            </div>
          </div>

          {/* Domain */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-3">
            <label className="font-bold text-slate-700">Your domain</label>
            <div className="flex gap-2 text-sm">
              <button type="button" onClick={() => setHasDomain(true)} className={`px-3 py-1.5 rounded-lg border ${hasDomain ? 'border-violet-500 bg-violet-50 text-violet-700' : 'border-slate-200 text-slate-500'}`}>I have a domain</button>
              <button type="button" onClick={() => setHasDomain(false)} className={`px-3 py-1.5 rounded-lg border ${!hasDomain ? 'border-violet-500 bg-violet-50 text-violet-700' : 'border-slate-200 text-slate-500'}`}>I'll add one later</button>
            </div>
            {hasDomain && (
              <div className="relative">
                <Globe className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input value={domain} onChange={e => setDomain(e.target.value)} placeholder="example.com"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pl-10 pr-4 text-slate-800 focus:outline-none focus:ring-2 focus:ring-violet-500/40" />
                <p className="text-xs text-slate-400 mt-1">We'll set up your website and email for this domain automatically.</p>
              </div>
            )}
          </div>

          {error && <div className="bg-red-50 border border-red-200 text-red-600 rounded-xl px-4 py-3 text-sm">{error}</div>}

          <button type="submit" disabled={submitting}
            className="w-full bg-violet-600 hover:bg-violet-700 text-white font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 disabled:opacity-50">
            {submitting ? 'Starting checkout…' : <>Continue to payment{price && ` · ${price}`} <ArrowRight size={18} /></>}
          </button>
          <p className="text-center text-xs text-slate-400">
            Already a customer? <button type="button" onClick={() => navigate('/client/login')} className="text-violet-600 font-medium">Sign in</button>
          </p>
        </form>
      </div>
    </div>
  );
};

export default Order;
