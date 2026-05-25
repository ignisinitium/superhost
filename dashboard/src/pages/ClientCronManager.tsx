import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import { 
  Clock, Plus, Trash2, Calendar, Terminal, AlertTriangle
} from 'lucide-react';
import toast from 'react-hot-toast';

interface CronJob {
  id: number;
  minute: string;
  hour: string;
  day: string;
  month: string;
  weekday: string;
  command: string;
  description: string;
  created_at: string;
}

const ClientCronManager: React.FC = () => {
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Form State
  const [minute, setMinute] = useState('*');
  const [hour, setHour] = useState('*');
  const [day, setDay] = useState('*');
  const [month, setMonth] = useState('*');
  const [weekday, setWeekday] = useState('*');
  const [command, setCommand] = useState('');
  const [description, setDescription] = useState('');

  const { data: jobs, isLoading } = useQuery<CronJob[]>({
    queryKey: ['userCronJobs'],
    queryFn: async () => {
      const res = await api.get('/client/cron');
      return res.data;
    }
  });

  const addJobMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/client/cron', {
        minute, hour, day, month, weekday, command, description
      });
      return res.data;
    },
    onSuccess: () => {
      toast.success('Cron job scheduled!');
      setIsModalOpen(false);
      setCommand('');
      setDescription('');
      queryClient.invalidateQueries({ queryKey: ['userCronJobs'] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Failed to schedule job');
    }
  });

  const deleteJobMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await api.delete(`/client/cron/${id}`);
      return res.data;
    },
    onSuccess: () => {
      toast.success('Cron job removed');
      queryClient.invalidateQueries({ queryKey: ['userCronJobs'] });
    }
  });

  const commonSchedules = [
    { label: 'Every Minute', min: '*', h: '*', d: '*', mon: '*', w: '*' },
    { label: 'Every Hour', min: '0', h: '*', d: '*', mon: '*', w: '*' },
    { label: 'Every Day (Midnight)', min: '0', h: '0', d: '*', mon: '*', w: '*' },
    { label: 'Every Week', min: '0', h: '0', d: '*', mon: '*', w: '0' },
    { label: 'Every Month', min: '0', h: '0', d: '1', mon: '*', w: '*' },
  ];

  const applyPreset = (preset: typeof commonSchedules[0]) => {
    setMinute(preset.min);
    setHour(preset.h);
    setDay(preset.d);
    setMonth(preset.mon);
    setWeekday(preset.w);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-3">
             <Clock className="text-orange-600" size={28} />
             Cron Job Manager
          </h1>
          <p className="text-slate-500 mt-1 ml-1">Schedule recurring scripts and system tasks for your account.</p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="bg-orange-600 hover:bg-orange-700 text-white px-5 py-2.5 rounded-xl font-bold transition-all shadow-md shadow-orange-900/10 flex items-center gap-2 text-sm"
        >
          <Plus size={18} />
          Create New Cron Job
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Calendar className="text-slate-700" size={20} />
            <h2 className="text-lg font-bold text-slate-800">Scheduled Tasks</h2>
          </div>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200 uppercase tracking-widest text-[10px]">
              <tr>
                <th className="px-6 py-4">Schedule</th>
                <th className="px-6 py-4">Command</th>
                <th className="px-6 py-4">Description</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr><td colSpan={4} className="px-6 py-8 text-center text-slate-400">Loading your schedules...</td></tr>
              ) : jobs && jobs.length > 0 ? (
                jobs.map((job) => (
                  <tr key={job.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4">
                       <div className="font-mono text-xs text-orange-600 bg-orange-50 px-2 py-1 rounded border border-orange-100 w-fit">
                          {job.minute} {job.hour} {job.day} {job.month} {job.weekday}
                       </div>
                    </td>
                    <td className="px-6 py-4">
                       <code className="text-xs text-slate-600 bg-slate-50 px-2 py-1 rounded border border-slate-200">
                          {job.command}
                       </code>
                    </td>
                    <td className="px-6 py-4 text-slate-500 text-xs italic">
                       {job.description || 'No description'}
                    </td>
                    <td className="px-6 py-4 text-right">
                       <button 
                         onClick={() => { if(window.confirm('Permanently remove this cron job?')) deleteJobMutation.mutate(job.id); }}
                         className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                       >
                          <Trash2 size={16} />
                       </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan={4} className="px-6 py-12 text-center text-slate-400 italic">No scheduled tasks found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Info Card */}
      <div className="bg-amber-50 border border-amber-100 rounded-2xl p-6 flex gap-4">
         <div className="p-3 bg-white rounded-xl text-amber-600 shadow-sm self-start">
            <AlertTriangle size={24} />
         </div>
         <div>
            <h3 className="font-bold text-amber-900 mb-1">Important System Notice</h3>
            <p className="text-sm text-amber-700 leading-relaxed max-w-3xl">
               Cron jobs run as your user account. Ensure your commands use absolute paths (e.g. <code>/usr/bin/php</code> instead of just <code>php</code>). 
               All output will be discarded unless you redirect it to a file. Example: <code>/path/to/script.sh &gt;&gt; /home/user/cron.log 2&gt;&amp;1</code>
            </p>
         </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-800">Schedule New Task</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>
            
            <form onSubmit={(e) => { e.preventDefault(); addJobMutation.mutate(); }} className="p-6 space-y-4">
              <div className="space-y-1">
                 <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Common Presets</label>
                 <div className="flex flex-wrap gap-2">
                    {commonSchedules.map(s => (
                       <button 
                         key={s.label} 
                         type="button" 
                         onClick={() => applyPreset(s)}
                         className="px-3 py-1.5 bg-slate-100 hover:bg-orange-100 hover:text-orange-600 rounded-lg text-[10px] font-bold text-slate-600 transition-all border border-slate-200 hover:border-orange-200"
                       >
                          {s.label}
                       </button>
                    ))}
                 </div>
              </div>

              <div className="grid grid-cols-5 gap-2">
                 <div className="space-y-1">
                   <label className="text-[9px] font-bold text-slate-400 uppercase text-center block">Min</label>
                   <input type="text" className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 text-center text-sm font-mono" value={minute} onChange={(e) => setMinute(e.target.value)} />
                 </div>
                 <div className="space-y-1">
                   <label className="text-[9px] font-bold text-slate-400 uppercase text-center block">Hour</label>
                   <input type="text" className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 text-center text-sm font-mono" value={hour} onChange={(e) => setHour(e.target.value)} />
                 </div>
                 <div className="space-y-1">
                   <label className="text-[9px] font-bold text-slate-400 uppercase text-center block">Day</label>
                   <input type="text" className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 text-center text-sm font-mono" value={day} onChange={(e) => setDay(e.target.value)} />
                 </div>
                 <div className="space-y-1">
                   <label className="text-[9px] font-bold text-slate-400 uppercase text-center block">Month</label>
                   <input type="text" className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 text-center text-sm font-mono" value={month} onChange={(e) => setMonth(e.target.value)} />
                 </div>
                 <div className="space-y-1">
                   <label className="text-[9px] font-bold text-slate-400 uppercase text-center block">Weekday</label>
                   <input type="text" className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 text-center text-sm font-mono" value={weekday} onChange={(e) => setWeekday(e.target.value)} />
                 </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Command to Execute</label>
                <div className="relative">
                   <Terminal className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                   <input 
                     type="text" 
                     className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pl-10 pr-4 text-sm font-mono" 
                     value={command} 
                     onChange={(e) => setCommand(e.target.value)} 
                     placeholder="/usr/bin/php /home/user/script.php" 
                     required 
                   />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Description (Optional)</label>
                <input type="text" className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-sm" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Nightly database backup" />
              </div>

              <div className="pt-4 flex gap-3">
                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 px-4 py-3 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 text-sm transition-all">Cancel</button>
                <button type="submit" disabled={addJobMutation.isPending} className="flex-1 px-4 py-3 rounded-xl font-bold text-white bg-orange-600 hover:bg-orange-700 shadow-md shadow-orange-900/10 text-sm transition-all disabled:opacity-50">
                  {addJobMutation.isPending ? 'Scheduling...' : 'Schedule Job'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ClientCronManager;
