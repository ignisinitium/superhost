import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import { BRAND } from '../brand';
import BrandMark from '../components/BrandMark';
import {
  Server, ShieldCheck, Mail, Zap, HardDrive, Globe, ArrowRight, Database, Clock,
  Code, ShoppingCart, FileText, Layout, Sparkles, X, ExternalLink,
} from 'lucide-react';

interface Plan {
  id: number;
  name: string;
  description: string;
  price_cents: number;
  annual_price_cents: number;
  type: string;
  disk_quota_mb: number;
  bandwidth_gb: number;
  domains_allowed: number;
  email_accounts: number;
  databases_allowed: number;
  daily_backups: boolean;
  ssh_access: boolean;
  ssl_included: boolean;
  reseller_enabled: boolean;
  reseller_accounts: number;
}

const fmtCap = (n: number, unit = '') => (n === -1 ? 'Unlimited' : `${n.toLocaleString()}${unit}`);
const fmtDisk = (mb: number) => (mb === -1 ? 'Unlimited' : mb >= 1024 ? `${Math.round(mb / 1024)} GB` : `${mb} MB`);
const fmtBw = (gb: number) => (gb === -1 ? 'Unlimited' : gb >= 1000 ? `${gb / 1000} TB` : `${gb} GB`);

interface Service {
  id: number;
  name: string;
  description: string;
  price_cents: number;
  onetime_price_cents: number;
  is_custom: boolean;
  billing_unit?: string;
}

interface PortfolioItem {
  id: number;
  title: string;
  url: string;
  description: string;
  category: string;
  image_url: string;
}

// WordPress mShots fallback if an item has no stored image.
const shot = (url: string) => `https://s.wordpress.com/mshots/v1/${encodeURIComponent(url)}?w=1024&h=720`;

const SERVICE_ICONS: Record<string, React.ElementType> = {
  'Single-Page Website': FileText,
  'Basic 5-Page Website': Layout,
  'E-Commerce Store': ShoppingCart,
  'Full-Stack Website': Code,
  'AI Services': Sparkles,
  'Email Spam Filter': ShieldCheck,
};

const MarketingHome: React.FC = () => {
  const navigate = useNavigate();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [portfolio, setPortfolio] = useState<PortfolioItem[]>([]);
  const [cycle, setCycle] = useState<'monthly' | 'annual'>('monthly');
  const [loading, setLoading] = useState(true);
  const [quoteFor, setQuoteFor] = useState<Service | null>(null);

  useEffect(() => {
    Promise.all([
      api.get('/public/plans').then(r => setPlans(r.data)).catch(() => {}),
      api.get('/public/services').then(r => setServices(r.data)).catch(() => {}),
      api.get('/public/portfolio').then(r => setPortfolio(r.data)).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);

  const startOrder = (planId: number) => navigate(`/order?plan=${planId}&cycle=${cycle}`);

  return (
    <div className="min-h-screen bg-white text-slate-800">
      {/* Nav */}
      <header className="sticky top-0 z-30 bg-white/80 backdrop-blur border-b border-slate-100">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <BrandMark size="lg" />
          <nav className="flex items-center gap-6 text-sm font-medium">
            <a href="#services" className="text-slate-600 hover:text-slate-900 hidden sm:block">Services</a>
            <a href="#work" className="text-slate-600 hover:text-slate-900 hidden sm:block">Our work</a>
            <a href="#pricing" className="text-slate-600 hover:text-slate-900 hidden sm:block">Hosting</a>
            <button onClick={() => navigate('/client/login')} className="text-slate-600 hover:text-slate-900">Sign in</button>
            <button onClick={() => document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' })}
              className="bg-violet-600 hover:bg-violet-700 text-white px-4 py-2 rounded-lg">Get started</button>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="bg-[#161325] text-white">
        <div className="max-w-6xl mx-auto px-6 py-24 text-center">
          <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight">Quality websites,<br />built & hosted.</h1>
          <p className="mt-6 text-lg md:text-xl text-slate-300 max-w-2xl mx-auto">
            {BRAND.name} designs, builds, and hosts your website and email — with free SSL, daily backups, AI solutions, and a powerful control panel. Set up in minutes.
          </p>
          <div className="mt-10 flex flex-wrap gap-4 justify-center">
            <button onClick={() => document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' })}
              className="bg-violet-600 hover:bg-violet-500 text-white font-bold px-7 py-3.5 rounded-xl flex items-center gap-2">
              View plans <ArrowRight size={18} />
            </button>
            <button onClick={() => navigate('/client/login')}
              className="bg-white/10 hover:bg-white/20 text-white font-bold px-7 py-3.5 rounded-xl">Customer login</button>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-6xl mx-auto px-6 py-20 grid grid-cols-1 md:grid-cols-3 gap-8">
        {[
          { icon: ShieldCheck, t: 'Free SSL & security', d: 'Automatic HTTPS, a built-in spam filter, malware scanning, and a firewall on every plan.' },
          { icon: Mail, t: 'Professional email', d: 'Create mailboxes on your own domain with webmail, forwarders, and spam protection.' },
          { icon: Zap, t: 'Blazing performance', d: 'NVMe storage, OPcache, and Redis on higher tiers keep your sites fast under load.' },
          { icon: HardDrive, t: 'Daily backups', d: 'Automatic backups with retention so your data is always recoverable.' },
          { icon: Globe, t: 'Full DNS control', d: 'Manage your domains, DNS records, and subdomains from one dashboard.' },
          { icon: Server, t: 'Developer friendly', d: 'SSH, Git deploy, Node.js & Python runtimes, cron jobs, and one-click WordPress.' },
        ].map((f, i) => (
          <div key={i} className="p-6 rounded-2xl border border-slate-100 hover:border-violet-200 hover:shadow-sm transition-all">
            <div className="w-11 h-11 rounded-xl bg-violet-50 flex items-center justify-center mb-4"><f.icon className="text-violet-600" size={22} /></div>
            <h3 className="font-bold text-lg">{f.t}</h3>
            <p className="text-slate-500 text-sm mt-2">{f.d}</p>
          </div>
        ))}
      </section>

      {/* Web design & development services */}
      <section id="services" className="max-w-6xl mx-auto px-6 py-20">
        <div className="text-center">
          <h2 className="text-3xl md:text-4xl font-extrabold">Web design & development</h2>
          <p className="text-slate-500 mt-3 max-w-2xl mx-auto">From a single landing page to a full custom application — we build it and host it. Pay once or spread it over monthly payments.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-12">
          {services.map(s => {
            const Icon = SERVICE_ICONS[s.name] ?? Code;
            return (
              <div key={s.id} className="flex flex-col rounded-2xl border border-slate-200 p-6 hover:border-violet-200 hover:shadow-sm transition-all">
                <div className="w-11 h-11 rounded-xl bg-violet-50 flex items-center justify-center mb-4"><Icon className="text-violet-600" size={22} /></div>
                <h3 className="text-lg font-bold">{s.name}</h3>
                <p className="text-slate-500 text-sm mt-2 flex-1">{s.description}</p>
                <div className="mt-5">
                  {s.is_custom ? (
                    <>
                      <p className="text-lg font-bold text-slate-800 mb-3">Custom pricing</p>
                      <button onClick={() => setQuoteFor(s)} className="w-full bg-slate-800 hover:bg-slate-900 text-white font-bold py-2.5 rounded-xl">Request a quote</button>
                    </>
                  ) : s.billing_unit === 'mailbox' ? (
                    <>
                      <p className="text-slate-800"><span className="text-2xl font-extrabold">${(s.price_cents / 100).toFixed(2)}</span><span className="text-slate-400 text-sm">/mailbox/mo</span></p>
                      <p className="text-sm text-slate-500 mt-0.5">Protect email hosted anywhere.</p>
                      <button onClick={() => navigate(`/order/filter?plan=${s.id}`)} className="mt-3 w-full bg-violet-600 hover:bg-violet-700 text-white font-bold py-2.5 rounded-xl">Get started</button>
                    </>
                  ) : (
                    <>
                      <p className="text-slate-800">
                        {s.onetime_price_cents > 0 && <span className="text-2xl font-extrabold">${(s.onetime_price_cents / 100).toLocaleString()}</span>}
                        {s.onetime_price_cents > 0 && <span className="text-slate-400 text-sm"> one-time</span>}
                      </p>
                      {s.price_cents > 0 && <p className="text-sm text-emerald-600 font-medium mt-0.5">or ${(s.price_cents / 100).toFixed(0)}/mo + hosting</p>}
                      <button onClick={() => navigate(`/order?plan=${s.id}&cycle=onetime`)} className="mt-3 w-full bg-violet-600 hover:bg-violet-700 text-white font-bold py-2.5 rounded-xl">Get started</button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Portfolio — our work */}
      {portfolio.length > 0 && (
        <section id="work" className="bg-slate-50 border-y border-slate-100 py-20">
          <div className="max-w-6xl mx-auto px-6">
            <div className="text-center">
              <h2 className="text-3xl md:text-4xl font-extrabold">Our work</h2>
              <p className="text-slate-500 mt-3 max-w-2xl mx-auto">A few of the websites we've designed, built, and host.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mt-12">
              {portfolio.map(item => (
                <a key={item.id} href={item.url} target="_blank" rel="noopener noreferrer"
                  className="group bg-white rounded-2xl border border-slate-200 overflow-hidden hover:shadow-lg hover:border-violet-200 transition-all">
                  <div className="aspect-[4/3] bg-slate-100 overflow-hidden">
                    <img
                      src={item.image_url || shot(item.url)}
                      alt={item.title}
                      loading="lazy"
                      onError={(e) => { (e.currentTarget as HTMLImageElement).src = shot(item.url); }}
                      className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-300"
                    />
                  </div>
                  <div className="p-5">
                    <div className="flex items-center justify-between">
                      <h3 className="font-bold text-slate-800">{item.title}</h3>
                      {item.category && <span className="text-[11px] font-bold text-violet-600 bg-violet-50 px-2 py-0.5 rounded">{item.category}</span>}
                    </div>
                    {item.description && <p className="text-slate-500 text-sm mt-1.5 line-clamp-2">{item.description}</p>}
                    <span className="inline-flex items-center gap-1.5 text-sm text-violet-600 font-medium mt-3 group-hover:gap-2.5 transition-all">
                      Visit site <ExternalLink size={14} />
                    </span>
                  </div>
                </a>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Pricing */}
      <section id="pricing" className="bg-slate-50 border-y border-slate-100 py-20">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center">
            <h2 className="text-3xl md:text-4xl font-extrabold">Simple, honest pricing</h2>
            <p className="text-slate-500 mt-3">No hidden fees. Cancel anytime. Free SSL on every plan.</p>
            <div className="inline-flex bg-white border border-slate-200 rounded-xl p-1 mt-6 text-sm font-bold shadow-sm">
              <button onClick={() => setCycle('monthly')}
                className={`px-5 py-2 rounded-lg transition-colors ${cycle === 'monthly' ? 'bg-violet-600 text-white' : 'text-slate-500'}`}>Monthly</button>
              <button onClick={() => setCycle('annual')}
                className={`px-5 py-2 rounded-lg transition-colors flex items-center gap-1.5 ${cycle === 'annual' ? 'bg-violet-600 text-white' : 'text-slate-500'}`}>
                Annual <span className={`text-[10px] px-1.5 py-0.5 rounded ${cycle === 'annual' ? 'bg-white/20' : 'bg-emerald-50 text-emerald-600'}`}>Save ~17%</span>
              </button>
            </div>
          </div>

          {loading ? (
            <p className="text-center text-slate-400 mt-12">Loading plans…</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mt-12 items-stretch">
              {plans.map((p, idx) => {
                const annual = cycle === 'annual' && p.annual_price_cents > 0;
                const monthly = annual ? p.annual_price_cents / 12 / 100 : p.price_cents / 100;
                const featured = idx === 1; // highlight the Business tier
                return (
                  <div key={p.id} className={`flex flex-col rounded-2xl bg-white p-6 border ${featured ? 'border-violet-500 shadow-lg ring-1 ring-violet-500' : 'border-slate-200'}`}>
                    {featured && <div className="text-[11px] font-bold text-violet-600 uppercase tracking-wider mb-2">Most popular</div>}
                    <h3 className="text-xl font-bold">{p.name}</h3>
                    <p className="text-slate-500 text-sm mt-1 min-h-[40px]">{p.description}</p>
                    <div className="mt-4">
                      <span className="text-3xl font-extrabold">${monthly.toFixed(2)}</span>
                      <span className="text-slate-400 text-sm">/mo</span>
                      {annual && <p className="text-xs text-emerald-600 font-medium mt-1">${(p.annual_price_cents / 100).toFixed(2)} billed yearly</p>}
                    </div>
                    <button onClick={() => startOrder(p.id)}
                      className={`mt-5 w-full font-bold py-2.5 rounded-xl transition-colors ${featured ? 'bg-violet-600 hover:bg-violet-700 text-white' : 'bg-slate-800 hover:bg-slate-900 text-white'}`}>
                      Get {p.name}
                    </button>
                    <ul className="mt-6 space-y-2.5 text-sm">
                      <Feature icon={HardDrive}>{fmtDisk(p.disk_quota_mb)} NVMe storage</Feature>
                      <Feature icon={Zap}>{fmtBw(p.bandwidth_gb)} bandwidth</Feature>
                      <Feature icon={Globe}>{fmtCap(p.domains_allowed)} website{p.domains_allowed === 1 ? '' : 's'}</Feature>
                      <Feature icon={Mail}>{fmtCap(p.email_accounts)} email accounts</Feature>
                      <Feature icon={Database}>{fmtCap(p.databases_allowed)} databases</Feature>
                      {p.ssl_included && <Feature icon={ShieldCheck}>Free SSL certificate</Feature>}
                      {p.daily_backups && <Feature icon={Clock}>Daily backups</Feature>}
                      {p.ssh_access && <Feature icon={Server}>SSH access</Feature>}
                      {p.reseller_enabled && <Feature icon={Server}>{fmtCap(p.reseller_accounts)} reseller accounts</Feature>}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <footer className="max-w-6xl mx-auto px-6 py-10 text-center text-sm text-slate-400">
        © {new Date().getFullYear()} {BRAND.name}. All rights reserved.
      </footer>

      {quoteFor && <QuoteModal service={quoteFor} onClose={() => setQuoteFor(null)} />}
    </div>
  );
};

// ── Quote request modal ─────────────────────────────────────────────────────
const QuoteModal: React.FC<{ service: Service; onClose: () => void }> = ({ service, onClose }) => {
  const [form, setForm] = useState({ name: '', email: '', company: '', budget: '', message: '' });
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setSending(true);
    try {
      await api.post('/public/inquiry', { ...form, productId: service.id });
      setSent(true);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Could not send your request.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-bold text-slate-800">Request a quote — {service.name}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>
        {sent ? (
          <div className="p-8 text-center">
            <Sparkles className="text-violet-600 mx-auto" size={40} />
            <p className="mt-4 font-bold text-slate-800">Thanks — we'll be in touch shortly!</p>
            <button onClick={onClose} className="mt-6 bg-slate-800 text-white font-bold px-6 py-2.5 rounded-xl">Close</button>
          </div>
        ) : (
          <form onSubmit={submit} className="p-6 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <input required placeholder="Your name" value={form.name} onChange={e => set('name', e.target.value)} className="bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/40" />
              <input required type="email" placeholder="Email" value={form.email} onChange={e => set('email', e.target.value)} className="bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/40" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input placeholder="Company (optional)" value={form.company} onChange={e => set('company', e.target.value)} className="bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/40" />
              <input placeholder="Budget (optional)" value={form.budget} onChange={e => set('budget', e.target.value)} className="bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/40" />
            </div>
            <textarea required placeholder="Tell us about your project…" value={form.message} onChange={e => set('message', e.target.value)} rows={4} className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/40" />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button type="submit" disabled={sending} className="w-full bg-violet-600 hover:bg-violet-700 text-white font-bold py-3 rounded-xl disabled:opacity-50">{sending ? 'Sending…' : 'Send request'}</button>
          </form>
        )}
      </div>
    </div>
  );
};

const Feature: React.FC<{ icon: React.ElementType; children: React.ReactNode }> = ({ icon: Icon, children }) => (
  <li className="flex items-center gap-2 text-slate-600">
    <Icon size={15} className="text-violet-500 shrink-0" /> {children}
  </li>
);

export default MarketingHome;
