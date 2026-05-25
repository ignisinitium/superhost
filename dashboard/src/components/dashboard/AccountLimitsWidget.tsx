import React from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../api/client';

const AccountLimitsWidget: React.FC = () => {
  const { data: profile } = useQuery({
    queryKey: ['clientProfile'],
    queryFn: async () => {
      const res = await api.get('/client/auth/profile');
      return res.data;
    }
  });

  const { data: domains } = useQuery({
    queryKey: ['clientDomains'],
    queryFn: async () => {
      const res = await api.get('/client/domains');
      return res.data;
    }
  });

  const diskUsed = profile?.disk_used_mb || 0;
  const diskLimit = profile?.disk_limit_mb || 1024;
  const diskPercent = Math.min(100, Math.round((diskUsed / diskLimit) * 100)) || 0;

  const bwUsed = profile?.bandwidth_used_mb || 0;
  const bwLimit = profile?.bandwidth_limit_mb || 5120;
  const bwPercent = Math.min(100, Math.round((bwUsed / bwLimit) * 100)) || 0;

  const domainsUsed = domains?.length || 0;
  const domainsLimit = 5; // Static for now, could be added to DB
  const domainsPercent = Math.min(100, Math.round((domainsUsed / domainsLimit) * 100)) || 0;

  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 h-full">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-lg font-bold text-slate-800">Account Limits</h2>
      </div>
      
      <div className="space-y-6">
        <div>
          <div className="flex justify-between text-sm mb-2">
            <span className="font-medium text-slate-600">Disk Space</span>
            <span className="text-slate-800 font-bold">{(diskUsed / 1024).toFixed(2)} GB / {(diskLimit / 1024).toFixed(2)} GB</span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-2.5">
            <div className="bg-amber-500 h-2.5 rounded-full transition-all duration-1000" style={{ width: `${diskPercent}%` }}></div>
          </div>
        </div>

        <div>
          <div className="flex justify-between text-sm mb-2">
            <span className="font-medium text-slate-600">Bandwidth</span>
            <span className="text-slate-800 font-bold">{(bwUsed / 1024).toFixed(2)} GB / {(bwLimit / 1024).toFixed(2)} GB</span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-2.5">
            <div className="bg-orange-500 h-2.5 rounded-full transition-all duration-1000" style={{ width: `${bwPercent}%` }}></div>
          </div>
        </div>

        <div>
          <div className="flex justify-between text-sm mb-2">
            <span className="font-medium text-slate-600">Addon Domains</span>
            <span className="text-slate-800 font-bold">{domainsUsed} / {domainsLimit}</span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-2.5">
            <div className="bg-orange-400 h-2.5 rounded-full transition-all duration-1000" style={{ width: `${domainsPercent}%` }}></div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AccountLimitsWidget;
