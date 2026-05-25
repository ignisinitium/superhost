import React from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../api/client';
import QuickActions from '../components/dashboard/QuickActions';
import ResourceChart from '../components/dashboard/ResourceChart';
import AccountLimitsWidget from '../components/dashboard/AccountLimitsWidget';
import type { Domain } from '../../../shared/types';

const ClientDashboard: React.FC = () => {
  const userData = JSON.parse(localStorage.getItem('user') || '{}');

  const { data: domains, isLoading } = useQuery<Domain[]>({
    queryKey: ['clientDomains'],
    queryFn: async () => {
      const res = await api.get('/client/domains');
      return res.data;
    }
  });

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">
            Welcome back, {userData.username || 'demo_user'}
          </h2>
          <p className="text-slate-500 mt-1">Here is what's happening with your hosting environment today.</p>
        </div>
      </div>

      <QuickActions userRole="client" />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <ResourceChart />
        <AccountLimitsWidget />
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-200 bg-slate-50/50 flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-800">Your Active Domains</h3>
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-widest bg-slate-200/50 px-2 py-1 rounded">
            Live Status
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 uppercase tracking-wider text-[10px]">Domain</th>
                <th className="px-6 py-4 uppercase tracking-wider text-[10px]">IP Address</th>
                <th className="px-6 py-4 uppercase tracking-wider text-[10px]">Status</th>
                <th className="px-6 py-4 uppercase tracking-wider text-[10px]">Last Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-slate-400">Loading domains...</td>
                </tr>
              ) : domains && domains.length > 0 ? (
                domains.map((domain) => (
                  <tr key={domain.id} className="hover:bg-slate-50/50 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="font-semibold text-slate-800 group-hover:text-orange-600 transition-colors">
                        {domain.domain_name}
                      </div>
                    </td>
                    <td className="px-6 py-4 font-mono text-slate-500">15.235.73.176</td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center gap-1.5 py-1 px-2.5 rounded-full text-xs font-bold bg-green-50 text-green-700 border border-green-200 shadow-sm">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                        Active
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-500 text-xs italic">System verified 2m ago</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-slate-400 italic">No domains found in this account.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ClientDashboard;
