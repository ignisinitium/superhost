import React, { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import api from '../api/client';
import { Save, User as UserIcon, ShieldCheck, ShieldOff } from 'lucide-react';
import toast from 'react-hot-toast';

const ClientSettingsPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [setup2FA, setSetup2FA] = useState<{ qrCode: string; secret: string } | null>(null);
  const [verifyCode, setVerifyCode] = useState('');
  const [disablePassword, setDisablePassword] = useState('');

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

  const startSetupMutation = useMutation({
    mutationFn: async () => (await api.post('/client/auth/setup-2fa')).data,
    onSuccess: (data) => setSetup2FA(data),
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to start 2FA setup'),
  });

  const enable2FAMutation = useMutation({
    mutationFn: async () => (await api.post('/client/auth/enable-2fa', { token: verifyCode })).data,
    onSuccess: () => {
      toast.success('Two-factor authentication enabled');
      setSetup2FA(null);
      setVerifyCode('');
      refetchProfile();
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Invalid code'),
  });

  const disable2FAMutation = useMutation({
    mutationFn: async () => (await api.post('/client/auth/disable-2fa', { password: disablePassword })).data,
    onSuccess: () => {
      toast.success('Two-factor authentication disabled');
      setDisablePassword('');
      refetchProfile();
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to disable 2FA'),
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

      {/* Two-Factor Authentication */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex items-center gap-3">
          <ShieldCheck className="text-blue-600" size={24} />
          <h2 className="text-lg font-bold text-slate-800">Two-Factor Authentication</h2>
          {profile?.totp_enabled && (
            <span className="ml-auto text-xs font-bold text-green-700 bg-green-100 px-2.5 py-1 rounded-full">Enabled</span>
          )}
        </div>
        <div className="p-8 max-w-xl">
          {profile?.totp_enabled ? (
            <div className="space-y-4">
              <p className="text-slate-600 text-sm">Two-factor authentication is protecting your account. To turn it off, confirm your password.</p>
              <div className="flex gap-3">
                <input
                  type="password"
                  className="flex-1 bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-500/40"
                  value={disablePassword}
                  onChange={(e) => setDisablePassword(e.target.value)}
                  placeholder="Current password"
                />
                <button
                  onClick={() => disable2FAMutation.mutate()}
                  disabled={disable2FAMutation.isPending || !disablePassword}
                  className="bg-red-600 hover:bg-red-700 text-white px-5 py-3 rounded-xl font-bold text-sm flex items-center gap-2 disabled:opacity-50"
                >
                  <ShieldOff size={18} /> Disable
                </button>
              </div>
            </div>
          ) : setup2FA ? (
            <div className="space-y-4">
              <p className="text-slate-600 text-sm">Scan this QR code with your authenticator app, then enter the 6-digit code to finish.</p>
              <img src={setup2FA.qrCode} alt="2FA QR code" className="w-44 h-44 border border-slate-200 rounded-xl" />
              <p className="text-xs text-slate-500 break-all">Manual key: <code className="bg-slate-100 px-1.5 py-0.5 rounded">{setup2FA.secret}</code></p>
              <div className="flex gap-3">
                <input
                  type="text"
                  inputMode="numeric"
                  className="flex-1 bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-slate-800 tracking-[0.3em] focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                  value={verifyCode}
                  onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="123456"
                />
                <button
                  onClick={() => enable2FAMutation.mutate()}
                  disabled={enable2FAMutation.isPending || verifyCode.length !== 6}
                  className="bg-slate-800 hover:bg-slate-900 text-white px-5 py-3 rounded-xl font-bold text-sm disabled:opacity-50"
                >
                  Verify & Enable
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-slate-600 text-sm">Add a second layer of security. You'll enter a code from your authenticator app each time you sign in.</p>
              <button
                onClick={() => startSetupMutation.mutate()}
                disabled={startSetupMutation.isPending || isProfileLoading}
                className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-3 rounded-xl font-bold text-sm flex items-center gap-2 disabled:opacity-50"
              >
                <ShieldCheck size={18} /> {startSetupMutation.isPending ? 'Loading...' : 'Enable 2FA'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ClientSettingsPage;
