import React, { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import api from '../api/client';
import { Save, User as UserIcon } from 'lucide-react';
import toast from 'react-hot-toast';

const ClientSettingsPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const { data: profile, isLoading: isProfileLoading, refetch: refetchProfile } = useQuery({
    queryKey: ['clientProfile'],
    queryFn: async () => {
      const res = await api.get('/client/auth/profile');
      return res.data;
    }
  });

  useEffect(() => {
    if (profile) {
      setEmail(profile.email || '');
      localStorage.setItem('user', JSON.stringify(profile));
    }
  }, [profile]);

  const updateProfileMutation = useMutation({
    mutationFn: async () => {
      if (password && password !== confirmPassword) {
        throw new Error("Passwords do not match");
      }
      const res = await api.put('/client/auth/profile', { email, password: password || undefined });
      return res.data;
    },
    onSuccess: () => {
      toast.success('Profile updated successfully!');
      setPassword('');
      setConfirmPassword('');
      refetchProfile();
    },
    onError: (err: any) => {
      toast.error(err.message || err.response?.data?.message || 'Failed to update profile');
    }
  });

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-500">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Account Settings</h1>
        <p className="text-slate-500 mt-1">Manage your personal profile and security.</p>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex items-center gap-3">
          <UserIcon className="text-blue-600" size={24} />
          <h2 className="text-lg font-bold text-slate-800">Profile Details</h2>
        </div>
        <div className="p-8">
          <form 
            onSubmit={(e) => { e.preventDefault(); updateProfileMutation.mutate(); }}
            className="space-y-6 max-w-xl"
          >
            <div className="space-y-2">
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Email Address</label>
              <input
                type="email"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
              />
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">New Password</label>
                <input
                  type="password"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all placeholder:text-slate-300"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Leave blank to keep"
                />
              </div>
              <div className="space-y-2">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Confirm Password</label>
                <input
                  type="password"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all placeholder:text-slate-300"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm new password"
                />
              </div>
            </div>

            <button 
              type="submit"
              disabled={updateProfileMutation.isPending || isProfileLoading}
              className="bg-slate-800 hover:bg-slate-900 text-white px-6 py-3 rounded-xl font-bold transition-all shadow-md shadow-slate-900/10 flex items-center gap-2 text-sm disabled:opacity-50"
            >
              <Save size={18} className="text-blue-500" />
              {updateProfileMutation.isPending ? 'Saving...' : 'Save Profile'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ClientSettingsPage;
