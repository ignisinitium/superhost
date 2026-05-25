import React from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../api/client';
import { AlertCircle } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const ResourceChart: React.FC = () => {
  const { data, isLoading, error } = useQuery({
    queryKey: ['serverMetrics'],
    queryFn: async () => {
      try {
        const res = await api.get('/metrics/server');
        return res.data;
      } catch (err: any) {
        if (err.response?.status === 401) {
           throw new Error("Unauthorized. Please re-login.");
        }
        throw err;
      }
    },
    refetchInterval: 60000 // Refresh every minute
  });

  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 col-span-1 lg:col-span-2 flex flex-col min-h-[400px]">
      <div className="flex justify-between items-center mb-6 shrink-0">
        <div>
          <h2 className="text-lg font-bold text-slate-800">Resource Utilization</h2>
          <p className="text-sm text-slate-500">Historical CPU and RAM metrics (24h)</p>
        </div>
        {!error && (
          <div className="flex gap-4 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-orange-500"></div>
              <span className="text-slate-600">CPU (%)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-amber-500"></div>
              <span className="text-slate-600">RAM (MB)</span>
            </div>
          </div>
        )}
      </div>
      
      <div className="flex-1 w-full relative">
        {isLoading ? (
          <div className="absolute inset-0 flex items-center justify-center text-slate-400 font-medium">
            <div className="flex flex-col items-center gap-2">
              <div className="w-8 h-8 border-4 border-orange-500/20 border-t-orange-500 rounded-full animate-spin"></div>
              Gathering metrics...
            </div>
          </div>
        ) : error ? (
          <div className="absolute inset-0 flex items-center justify-center text-center p-8 bg-red-50/50 rounded-xl border border-red-100 border-dashed">
            <div className="max-w-xs">
              <AlertCircle className="mx-auto text-red-500 mb-2" size={32} />
              <p className="text-red-600 font-bold text-sm mb-1">Failed to load chart</p>
              <p className="text-red-500 text-xs italic">{(error as any).message}</p>
            </div>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="colorCpu" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f97316" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#f97316" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorRam" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} dy={10} minTickGap={30} />
              <YAxis yAxisId="left" orientation="left" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} domain={[0, 100]} />
              <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} />
              <Tooltip 
                contentStyle={{ borderRadius: '8px', border: '1px solid #fed7aa', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                labelStyle={{ color: '#0f172a', fontWeight: 'bold', marginBottom: '4px' }}
              />
              <Area yAxisId="left" type="monotone" dataKey="cpu" name="CPU Usage" stroke="#f97316" strokeWidth={2} fillOpacity={1} fill="url(#colorCpu)" />
              <Area yAxisId="right" type="monotone" dataKey="ram" name="RAM Usage" stroke="#f59e0b" strokeWidth={2} fillOpacity={1} fill="url(#colorRam)" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
};

export default ResourceChart;
