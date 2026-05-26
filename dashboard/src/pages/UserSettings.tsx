import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import api from '../api/client';
import { Mail, Shield, Save, ArrowLeft, HardDrive, Zap, Lock, Globe, Database } from 'lucide-react';
import toast from 'react-hot-toast';

const UserSettingsPage: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [diskLimit, setDiskLimit] = useState(1024);
  const [bandwidthLimit, setBandwidthLimit] = useState(5120);

  const { data: user, isLoading, refetch } = useQuery({
    queryKey: ['user', id],
    queryFn: async () => {
      const res = await api.get(`/users/${id}`);
      return res.data;
    }
  });

  useEffect(() => {
    if (user) {
      setEmail(user.email || '');
      setDiskLimit(user.disk_limit_mb || 1024);
      setBandwidthLimit(user.bandwidth_limit_mb || 5120);
    }
  }, [user]);

  const updateMutation = useMutation({
    mutationFn: async () => {
      const res = await api.put(`/users/${id}`, {
        email,
        password: password || undefined,
        disk_limit_mb: diskLimit,
        bandwidth_limit_mb: bandwidthLimit
      });
      return res.data;
    },
    onSuccess: () => {
      toast.success('User updated successfully');
      setPassword('');
      refetch();
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Update failed');
    }
  });

  if (isLoading) return <div className="p-8 text-center text-slate-400 font-medium">Loading user data...</div>;

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/users')}
            className="p-2 hover:bg-slate-100 rounded-xl transition-colors text-slate-500"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">User Settings: <span className="text-orange-600">{user?.username}</span></h1>
            <p className="text-slate-500 mt-1">Adjust account details and resource quotas.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate(`/users/${id}/websites`)}
            className="flex items-center gap-2 bg-white border border-slate-200 hover:border-orange-300 hover:bg-orange-50 text-slate-700 hover:text-orange-600 px-4 py-2.5 rounded-xl font-bold text-sm transition-all shadow-sm"
          >
            <Globe size={16} />
            Websites
          </button>
          <button
            onClick={() => navigate(`/users/${id}/databases`)}
            className="flex items-center gap-2 bg-white border border-slate-200 hover:border-blue-300 hover:bg-blue-50 text-slate-700 hover:text-blue-600 px-4 py-2.5 rounded-xl font-bold text-sm transition-all shadow-sm"
          >
            <Database size={16} />
            Databases
          </button>
          <button
            onClick={() => navigate(`/users/${id}/email`)}
            className="flex items-center gap-2 bg-white border border-slate-200 hover:border-violet-300 hover:bg-violet-50 text-slate-700 hover:text-violet-600 px-4 py-2.5 rounded-xl font-bold text-sm transition-all shadow-sm"
          >
            <Mail size={16} />
            Email
          </button>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex items-center gap-3">
          <Shield className="text-orange-600" size={24} />
          <h2 className="text-lg font-bold text-slate-800">Profile & Security</h2>
        </div>
        
        <div className="p-8">
          <form 
            onSubmit={(e) => { e.preventDefault(); updateMutation.mutate(); }}
            className="space-y-6"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input
                    type="email"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pl-10 pr-4 text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500/50 transition-all"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Change Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input
                    type="password"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pl-10 pr-4 text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500/50 transition-all"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Leave blank to keep current"
                  />
                </div>
              </div>
            </div>

            <div className="pt-6 border-t border-slate-100">
              <div className="flex items-center gap-3 mb-6">
                <Zap className="text-orange-600" size={20} />
                <h3 className="font-bold text-slate-800 uppercase tracking-wider text-xs">Resource Quotas</h3>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1 flex items-center gap-1">
                    <HardDrive size={12} /> Disk Limit (MB)
                  </label>
                  <input
                    type="number"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500/50 transition-all font-mono"
                    value={diskLimit}
                    onChange={(e) => setDiskLimit(parseInt(e.target.value))}
                    min="1"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1 flex items-center gap-1">
                    <Zap size={12} /> Bandwidth Limit (MB)
                  </label>
                  <input
                    type="number"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500/50 transition-all font-mono"
                    value={bandwidthLimit}
                    onChange={(e) => setBandwidthLimit(parseInt(e.target.value))}
                    min="1"
                    required
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-4">
              <button 
                type="submit"
                disabled={updateMutation.isPending}
                className="bg-slate-800 hover:bg-slate-900 text-white px-8 py-3 rounded-xl font-bold transition-all shadow-md shadow-slate-900/10 flex items-center gap-2 text-sm disabled:opacity-50"
              >
                <Save size={18} className="text-orange-500" />
                {updateMutation.isPending ? 'Applying Changes...' : 'Save User Settings'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default UserSettingsPage;
