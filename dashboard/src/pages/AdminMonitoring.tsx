import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import adminApi from '../api/admin';
import { 
  Bell, BarChart3, Settings, Save, 
  Hash, Send, Zap, HardDrive, Cpu, Activity, Clock, Globe
} from 'lucide-react';
import toast from 'react-hot-toast';

const AdminMonitoring: React.FC = () => {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'alerts' | 'traffic' | 'settings'>('alerts');

  // Queries
  const { data: settings } = useQuery({
    queryKey: ['notificationSettings'],
    queryFn: async () => {
      const res = await adminApi.get('/metrics/notifications');
      return res.data;
    }
  });

  const { data: alertLog, isLoading: isAlertsLoading } = useQuery<any[]>({
    queryKey: ['alertLog'],
    queryFn: async () => {
      const res = await adminApi.get('/metrics/alerts');
      return res.data;
    }
  });

  const { data: traffic, isLoading: isTrafficLoading } = useQuery<any[]>({
    queryKey: ['trafficStats'],
    queryFn: async () => {
      const res = await adminApi.get('/metrics/traffic');
      return res.data;
    }
  });

  // Form State (Internalized for better performance)
  const [formData, setFormData] = useState<any>(null);

  React.useEffect(() => {
    if (settings) setFormData(settings);
  }, [settings]);

  const updateSettingsMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await adminApi.put('/metrics/notifications', data);
      return res.data;
    },
    onSuccess: () => {
      toast.success('Monitoring settings updated');
      queryClient.invalidateQueries({ queryKey: ['notificationSettings'] });
    }
  });

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-3">
             <Activity className="text-indigo-600" size={28} />
             Enterprise Monitoring
          </h1>
          <p className="text-slate-500 mt-1 ml-1">Real-time server health, threshold alerting, and traffic analytics.</p>
        </div>
      </div>

      <div className="flex space-x-1 bg-slate-200/50 p-1 rounded-xl w-fit">
        <button onClick={() => setActiveTab('alerts')} className={`px-6 py-2.5 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${activeTab === 'alerts' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
          <Bell size={16} /> Recent Alerts
        </button>
        <button onClick={() => setActiveTab('traffic')} className={`px-6 py-2.5 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${activeTab === 'traffic' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
          <BarChart3 size={16} /> Traffic Stats
        </button>
        <button onClick={() => setActiveTab('settings')} className={`px-6 py-2.5 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${activeTab === 'settings' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
          <Settings size={16} /> Alert Settings
        </button>
      </div>

      {activeTab === 'alerts' && (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
           <div className="p-6 border-b border-slate-100 bg-slate-50/50">
              <h2 className="text-lg font-bold text-slate-800">System Alert History</h2>
           </div>
           <div className="overflow-x-auto">
             <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500 border-b border-slate-200 uppercase tracking-widest text-[10px] font-bold">
                  <tr>
                    <th className="px-6 py-4">Level</th>
                    <th className="px-6 py-4">Service</th>
                    <th className="px-6 py-4">Message</th>
                    <th className="px-6 py-4 text-right">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                   {isAlertsLoading ? (
                      <tr><td colSpan={4} className="px-6 py-8 text-center text-slate-400 animate-pulse">Loading alerts...</td></tr>
                   ) : alertLog && alertLog.length > 0 ? (
                      alertLog.map(alert => (
                        <tr key={alert.id} className="hover:bg-slate-50/50 transition-colors">
                           <td className="px-6 py-4">
                              <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase ${alert.level === 'critical' ? 'bg-red-50 text-red-600 border border-red-100' : 'bg-amber-50 text-amber-600 border border-amber-100'}`}>
                                 {alert.level}
                              </span>
                           </td>
                           <td className="px-6 py-4 font-bold text-slate-700">{alert.service}</td>
                           <td className="px-6 py-4 text-slate-500 text-xs">{alert.message}</td>
                           <td className="px-6 py-4 text-right text-slate-400 text-[10px] whitespace-nowrap">
                              <div className="flex items-center justify-end gap-1">
                                 <Clock size={12} />
                                 {new Date(alert.created_at).toLocaleString()}
                              </div>
                           </td>
                        </tr>
                      ))
                   ) : (
                      <tr><td colSpan={4} className="px-6 py-12 text-center text-slate-400 italic">No alerts logged in the system. Your server is healthy.</td></tr>
                   )}
                </tbody>
             </table>
           </div>
        </div>
      )}

      {activeTab === 'traffic' && (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
           <div className="p-6 border-b border-slate-100 bg-slate-50/50">
              <h2 className="text-lg font-bold text-slate-800 text-xs uppercase tracking-widest text-slate-500">Domain Bandwidth Usage (Last 30 Days)</h2>
           </div>
           <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                 <thead className="bg-slate-50 text-slate-500 border-b border-slate-200 uppercase tracking-widest text-[10px] font-bold">
                   <tr>
                     <th className="px-6 py-4">Domain</th>
                     <th className="px-6 py-4">Total Sent</th>
                     <th className="px-6 py-4">Total Received</th>
                     <th className="px-6 py-4">Usage Meter</th>
                   </tr>
                 </thead>
                 <tbody className="divide-y divide-slate-100">
                    {isTrafficLoading ? (
                       <tr><td colSpan={4} className="px-6 py-8 text-center">Loading stats...</td></tr>
                    ) : traffic && traffic.length > 0 ? (
                       traffic.map(stat => (
                          <tr key={stat.domain_name} className="hover:bg-slate-50/50 transition-colors">
                             <td className="px-6 py-4 font-bold text-slate-700 flex items-center gap-2">
                                <Globe size={14} className="text-indigo-400" />
                                {stat.domain_name}
                             </td>
                             <td className="px-6 py-4 font-mono text-emerald-600 font-bold">{formatBytes(parseInt(stat.sent))}</td>
                             <td className="px-6 py-4 font-mono text-indigo-600">{formatBytes(parseInt(stat.received))}</td>
                             <td className="px-6 py-4 w-48">
                                <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                                   <div className="h-full bg-indigo-500 rounded-full" style={{ width: '45%' }}></div>
                                </div>
                             </td>
                          </tr>
                       ))
                    ) : (
                       <tr><td colSpan={4} className="px-6 py-12 text-center text-slate-400 italic">No traffic data recorded yet.</td></tr>
                    )}
                 </tbody>
              </table>
           </div>
        </div>
      )}

      {activeTab === 'settings' && formData && (
         <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-6">
               <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                  <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                     <Hash className="text-[#4A154B]" />
                     Slack Notifications
                  </h3>
                  <div className="space-y-1">
                     <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Incoming Webhook URL</label>
                     <input 
                       type="text" 
                       className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-mono" 
                       value={formData.slack_webhook_url || ''} 
                       onChange={e => setFormData({...formData, slack_webhook_url: e.target.value})}
                       placeholder="https://hooks.slack.com/services/..."
                     />
                  </div>
               </div>

               <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                  <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                     <Send className="text-[#0088cc]" />
                     Telegram Notifications
                  </h3>
                  <div className="space-y-4">
                     <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Bot API Token</label>
                        <input 
                          type="password" 
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-mono" 
                          value={formData.telegram_bot_token || ''} 
                          onChange={e => setFormData({...formData, telegram_bot_token: e.target.value})}
                        />
                     </div>
                     <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Chat ID</label>
                        <input 
                          type="text" 
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-mono" 
                          value={formData.telegram_chat_id || ''} 
                          onChange={e => setFormData({...formData, telegram_chat_id: e.target.value})}
                        />
                     </div>
                  </div>
               </div>
            </div>

            <div className="space-y-6">
               <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                  <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                     <Zap className="text-amber-500" />
                     Alert Thresholds
                  </h3>
                  <div className="space-y-4">
                     <div className="space-y-2">
                        <div className="flex justify-between items-end">
                           <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                              <Cpu size={12} /> CPU Usage
                           </label>
                           <span className="text-sm font-bold text-indigo-600">{formData.cpu_threshold}%</span>
                        </div>
                        <input type="range" className="w-full accent-indigo-600" min="50" max="99" value={formData.cpu_threshold} onChange={e => setFormData({...formData, cpu_threshold: parseInt(e.target.value)})} />
                     </div>
                     <div className="space-y-2">
                        <div className="flex justify-between items-end">
                           <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                              <Activity size={12} /> RAM Usage
                           </label>
                           <span className="text-sm font-bold text-indigo-600">{formData.ram_threshold}%</span>
                        </div>
                        <input type="range" className="w-full accent-indigo-600" min="50" max="99" value={formData.ram_threshold} onChange={e => setFormData({...formData, ram_threshold: parseInt(e.target.value)})} />
                     </div>
                     <div className="space-y-2">
                        <div className="flex justify-between items-end">
                           <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                              <HardDrive size={12} /> Disk Usage
                           </label>
                           <span className="text-sm font-bold text-indigo-600">{formData.disk_threshold}%</span>
                        </div>
                        <input type="range" className="w-full accent-indigo-600" min="50" max="99" value={formData.disk_threshold} onChange={e => setFormData({...formData, disk_threshold: parseInt(e.target.value)})} />
                     </div>
                  </div>
               </div>

               <div className="bg-indigo-600 rounded-2xl p-6 shadow-lg shadow-indigo-900/20 text-white flex flex-col justify-between h-48">
                  <div>
                     <h4 className="font-bold text-lg">Save Settings</h4>
                     <p className="text-indigo-100 text-sm mt-1">Changes are applied immediately across the entire cluster.</p>
                  </div>
                  <div className="flex items-center justify-between">
                     <div className="flex items-center gap-2">
                        <input type="checkbox" id="mon_enabled" className="w-5 h-5 accent-white" checked={formData.is_enabled} onChange={e => setFormData({...formData, is_enabled: e.target.checked})} />
                        <label htmlFor="mon_enabled" className="text-sm font-bold">Monitoring Enabled</label>
                     </div>
                     <button 
                       onClick={() => updateSettingsMutation.mutate(formData)}
                       className="bg-white text-indigo-600 px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 hover:bg-indigo-50 transition-colors shadow-sm"
                     >
                        <Save size={18} /> Save Config
                     </button>
                  </div>
               </div>
            </div>
         </div>
      )}
    </div>
  );
};

export default AdminMonitoring;
