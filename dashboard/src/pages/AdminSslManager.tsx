import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import {
  ShieldCheck, ShieldAlert, ShieldX, RefreshCw, RotateCw, Search,
  Lock, Clock, User, AlertTriangle, CheckCircle2, Plus, Server
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useTaskMonitor } from '../hooks/useTaskMonitor';
import type { SslCertificate } from '../../../shared/types';

interface BareDomain {
  id: number;
  domain_name: string;
  is_ssl: boolean;
  is_subdomain: boolean;
  username: string;
}
interface SslOverview {
  certs: SslCertificate[];
  domainsWithoutSsl: BareDomain[];
}

// Derive cert health from its expiry.
type CertStatus = 'valid' | 'expiring' | 'expired' | 'unknown';
const EXPIRING_DAYS = 30;

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  return Math.floor((new Date(iso).getTime() - Date.now()) / 86_400_000);
}
function certStatus(c: SslCertificate): CertStatus {
  const d = daysUntil(c.not_after);
  if (d === null) return 'unknown';
  if (d < 0) return 'expired';
  if (d <= EXPIRING_DAYS) return 'expiring';
  return 'valid';
}

const STATUS_META: Record<CertStatus, { label: string; cls: string; icon: React.ReactNode }> = {
  valid:    { label: 'Valid',    cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: <ShieldCheck size={12} /> },
  expiring: { label: 'Expiring', cls: 'bg-amber-50 text-amber-700 border-amber-200',       icon: <ShieldAlert size={12} /> },
  expired:  { label: 'Expired',  cls: 'bg-red-50 text-red-700 border-red-200',             icon: <ShieldX size={12} /> },
  unknown:  { label: 'Unknown',  cls: 'bg-slate-100 text-slate-500 border-slate-200',      icon: <ShieldAlert size={12} /> },
};

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
function expiryLabel(c: SslCertificate): string {
  const d = daysUntil(c.not_after);
  if (d === null) return '—';
  if (d < 0) return `expired ${-d}d ago`;
  if (d === 0) return 'expires today';
  return `in ${d}d`;
}

const AdminSslManager: React.FC = () => {
  const queryClient = useQueryClient();
  const { monitorTask } = useTaskMonitor();
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery<SslOverview>({
    queryKey: ['adminSsl'],
    queryFn: async () => (await api.get('/admin/ssl')).data,
  });

  const certs = data?.certs ?? [];
  const domainsWithoutSsl = data?.domainsWithoutSsl ?? [];

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['adminSsl'] });

  // Each action queues a worker task; we monitor it then refresh the inventory.
  const action = (url: string, body: unknown, pending: string, done: string) =>
    api.post(url, body).then((r) => {
      toast.success(pending);
      if (r.data?.taskId) monitorTask(r.data.taskId, { successMessage: done, onSuccess: invalidate, onError: invalidate });
    }).catch((err: any) => toast.error(err.response?.data?.message ?? 'Action failed'));

  const refreshMutation = useMutation({ mutationFn: () => action('/admin/ssl/refresh', {}, 'Scanning certificates…', 'Certificate inventory refreshed') });
  const renewAllMutation = useMutation({ mutationFn: () => action('/admin/ssl/renew-all', {}, 'Renewing all certificates…', 'Renewal complete') });
  const issueMutation = useMutation({ mutationFn: (domainName: string) => action('/admin/ssl/issue', { domainName }, `Issuing certificate for ${domainName}…`, 'Certificate issued') });
  const reissueMutation = useMutation({ mutationFn: (domainName: string) => action('/admin/ssl/reissue', { domainName }, `Reissuing ${domainName}…`, 'Certificate reissued') });

  // Counts for the summary cards.
  const counts = certs.reduce(
    (acc, c) => { acc[certStatus(c)]++; return acc; },
    { valid: 0, expiring: 0, expired: 0, unknown: 0 } as Record<CertStatus, number>
  );

  const q = search.toLowerCase();
  const filteredCerts = certs.filter(c =>
    c.cert_name.toLowerCase().includes(q) ||
    (c.username ?? '').toLowerCase().includes(q) ||
    c.domains.some(d => d.toLowerCase().includes(q))
  );
  const filteredBare = domainsWithoutSsl.filter(d =>
    d.domain_name.toLowerCase().includes(q) || d.username.toLowerCase().includes(q)
  );

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-3">
            <Lock className="text-indigo-600" size={26} />
            SSL Certificates
          </h1>
          <p className="text-slate-500 mt-1">Issue, reissue and monitor Let's Encrypt certificates across all accounts.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refreshMutation.mutate()}
            disabled={refreshMutation.isPending}
            className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-4 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 transition-all disabled:opacity-50"
          >
            <RefreshCw size={15} className={refreshMutation.isPending ? 'animate-spin text-indigo-500' : 'text-indigo-500'} />
            Refresh
          </button>
          <button
            onClick={() => { if (window.confirm('Run certbot renew for every certificate within its renewal window?')) renewAllMutation.mutate(); }}
            disabled={renewAllMutation.isPending}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl font-bold transition-all shadow-md shadow-indigo-900/10 flex items-center gap-2 text-sm disabled:opacity-50"
          >
            <RotateCw size={16} />
            Renew All
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {([
          { key: 'valid',    label: 'Valid',           value: counts.valid,                 icon: <CheckCircle2 size={18} />, cls: 'text-emerald-600 bg-emerald-50' },
          { key: 'expiring', label: 'Expiring (≤30d)', value: counts.expiring,              icon: <Clock size={18} />,        cls: 'text-amber-600 bg-amber-50' },
          { key: 'expired',  label: 'Expired',         value: counts.expired,               icon: <ShieldX size={18} />,      cls: 'text-red-600 bg-red-50' },
          { key: 'missing',  label: 'Without SSL',     value: domainsWithoutSsl.length,     icon: <AlertTriangle size={18} />, cls: 'text-slate-600 bg-slate-100' },
        ] as const).map(card => (
          <div key={card.key} className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${card.cls}`}>{card.icon}</div>
            <div>
              <div className="text-2xl font-bold text-slate-800 leading-none">{card.value}</div>
              <div className="text-[11px] text-slate-400 mt-1">{card.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder="Search by domain or owner…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-3 py-2.5 text-sm bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/20"
        />
      </div>

      {/* Certificates table */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="px-5 py-3 bg-slate-50/70 border-b border-slate-100 flex items-center gap-2">
          <ShieldCheck size={14} className="text-indigo-500" />
          <span className="text-xs font-bold text-slate-600 uppercase tracking-widest">Certificates</span>
          <span className="ml-auto text-[10px] font-bold text-slate-400">{filteredCerts.length}</span>
        </div>
        {isLoading ? (
          <div className="p-12 text-center text-slate-400 italic text-sm">Loading certificates…</div>
        ) : filteredCerts.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-sm">
            No certificates found. Click <strong>Refresh</strong> to scan <code className="text-xs">/etc/letsencrypt</code>, or issue one below.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm min-w-[720px]">
              <thead className="border-b border-slate-100 bg-slate-50/30">
                <tr className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  <th className="px-5 py-2.5">Status</th>
                  <th className="px-5 py-2.5">Certificate / Domains</th>
                  <th className="px-5 py-2.5">Owner</th>
                  <th className="px-5 py-2.5">Issuer</th>
                  <th className="px-5 py-2.5">Expires</th>
                  <th className="px-5 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filteredCerts.map(cert => {
                  const st = certStatus(cert);
                  const meta = STATUS_META[st];
                  return (
                    <tr key={cert.id} className="group hover:bg-slate-50/50 transition-colors align-top">
                      <td className="px-5 py-3">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-bold ${meta.cls}`}>
                          {meta.icon}{meta.label}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <div className="font-mono text-xs font-semibold text-slate-700">{cert.cert_name}</div>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {cert.domains.map(d => (
                            <span key={d} className="text-[10px] font-mono text-slate-500 bg-slate-100 rounded px-1.5 py-0.5">{d}</span>
                          ))}
                        </div>
                      </td>
                      <td className="px-5 py-3 text-xs text-slate-500">
                        <span className="flex items-center gap-1"><User size={11} className="text-slate-300" />{cert.username ?? 'System'}</span>
                      </td>
                      <td className="px-5 py-3 text-xs text-slate-500">{cert.issuer ?? '—'}</td>
                      <td className="px-5 py-3">
                        <div className="text-xs text-slate-600">{fmtDate(cert.not_after)}</div>
                        <div className={`text-[10px] font-semibold ${st === 'expired' ? 'text-red-500' : st === 'expiring' ? 'text-amber-600' : 'text-slate-400'}`}>{expiryLabel(cert)}</div>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <button
                          onClick={() => { if (window.confirm(`Force-reissue the certificate for "${cert.cert_name}"?`)) reissueMutation.mutate(cert.cert_name); }}
                          disabled={reissueMutation.isPending}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-indigo-600 hover:bg-indigo-50 border border-slate-200 transition-all disabled:opacity-50"
                        >
                          <RotateCw size={12} /> Reissue
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Domains without a valid certificate */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="px-5 py-3 bg-slate-50/70 border-b border-slate-100 flex items-center gap-2">
          <AlertTriangle size={14} className="text-amber-500" />
          <span className="text-xs font-bold text-slate-600 uppercase tracking-widest">Domains Without a Valid Certificate</span>
          <span className="ml-auto text-[10px] font-bold text-slate-400">{filteredBare.length}</span>
        </div>
        {isLoading ? (
          <div className="p-8 text-center text-slate-400 italic text-sm">Loading…</div>
        ) : filteredBare.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm flex items-center justify-center gap-2">
            <CheckCircle2 size={16} className="text-emerald-500" /> Every domain is covered by a valid certificate.
          </div>
        ) : (
          <ul className="divide-y divide-slate-50">
            {filteredBare.map(d => (
              <li key={d.id} className="px-5 py-3 flex items-center gap-3 hover:bg-slate-50/50 transition-colors">
                <Server size={14} className="text-slate-300 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-xs font-semibold text-slate-700 truncate">{d.domain_name}</div>
                  <div className="text-[10px] text-slate-400">{d.username}{d.is_subdomain ? ' · subdomain' : ''}</div>
                </div>
                <button
                  onClick={() => issueMutation.mutate(d.domain_name)}
                  disabled={issueMutation.isPending}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 transition-all shadow-sm disabled:opacity-50"
                >
                  <Plus size={12} /> Issue SSL
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default AdminSslManager;
