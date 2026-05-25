import React, { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import api from '../api/client';
import { Shield, Key, QrCode, CheckCircle2, AlertCircle, Fingerprint, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import { startRegistration } from '@simplewebauthn/browser';

const SettingsPage: React.FC = () => {
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [token, setToken] = useState('');
  const [isSettingUp, setIsSettingUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Fetch admin profile
  const { data: profile, isLoading: isProfileLoading, refetch: refetchProfile } = useQuery({
    queryKey: ['adminProfile'],
    queryFn: async () => {
      const res = await api.get('/auth/profile');
      return res.data;
    }
  });

  useEffect(() => {
    if (profile) {
      setEmail(profile.email || '');
      // Keep adminData in localStorage in sync
      localStorage.setItem('admin', JSON.stringify(profile));
    }
  }, [profile]);

  const adminData = profile || JSON.parse(localStorage.getItem('admin') || '{}');

  const updateProfileMutation = useMutation({
    mutationFn: async () => {
      if (password && password !== confirmPassword) {
        throw new Error("Passwords do not match");
      }
      const res = await api.put('/auth/profile', { email, password: password || undefined });
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

  const setupFido2Mutation = useMutation({
    mutationFn: async () => {
      const optionsRes = await api.post('/fido2/register-options');
      const regResponse = await startRegistration({ optionsJSON: optionsRes.data });
      const verifyRes = await api.post('/fido2/register-verify', regResponse);
      return verifyRes.data;
    },
    onSuccess: () => {
      toast.success('Security Key registered successfully!');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to register Security Key');
    }
  });

  const setup2FAMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/auth/setup-2fa');
      return res.data;
    },
    onSuccess: (data) => {
      setQrCode(data.qrCode);
      setSecret(data.secret);
      setIsSettingUp(true);
      toast.success('2FA Secret generated. Scan the QR code.');
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Failed to setup 2FA');
    }
  });

  const enable2FAMutation = useMutation({
    mutationFn: async (verificationToken: string) => {
      const res = await api.post('/auth/enable-2fa', { token: verificationToken });
      return res.data;
    },
    onSuccess: () => {
      toast.success('2FA enabled successfully!');
      setIsSettingUp(false);
      setQrCode(null);
      setSecret(null);
      setToken('');
      refetchProfile();
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Invalid 2FA token');
    }
  });

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-500">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Settings</h1>
        <p className="text-slate-500 mt-1">Manage your account and security preferences.</p>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex items-center gap-3">
          <Key className="text-slate-700" size={24} />
          <h2 className="text-lg font-bold text-slate-800">Profile & Credentials</h2>
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
                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500/50 transition-all"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@yourdomain.com"
                required
              />
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">New Password</label>
                <input
                  type="password"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500/50 transition-all placeholder:text-slate-300"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Leave blank to keep"
                />
              </div>
              <div className="space-y-2">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Confirm Password</label>
                <input
                  type="password"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500/50 transition-all placeholder:text-slate-300"
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
              <Save size={18} className="text-orange-500" />
              {updateProfileMutation.isPending ? 'Saving...' : 'Save Profile'}
            </button>
          </form>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex items-center gap-3">
          <Shield className="text-orange-600" size={24} />
          <h2 className="text-lg font-bold text-slate-800">Security & Authentication</h2>
        </div>
        
        <div className="p-8">
          {!isSettingUp ? (
            <div className="flex flex-col gap-8">
              {/* TOTP 2FA */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-8 border-b border-slate-100">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-slate-800">Authenticator App (TOTP)</h3>
                    {adminData.two_factor_enabled ? (
                      <span className="bg-green-50 text-green-700 text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border border-green-100 flex items-center gap-1">
                        <CheckCircle2 size={10} /> Active
                      </span>
                    ) : (
                      <span className="bg-slate-100 text-slate-500 text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border border-slate-200 flex items-center gap-1">
                        <AlertCircle size={10} /> Inactive
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-slate-500 max-w-md">
                    Receive a 6-digit verification code on your mobile device during sign-in.
                  </p>
                </div>
                
                {!adminData.two_factor_enabled && (
                  <button 
                    onClick={() => setup2FAMutation.mutate()}
                    disabled={setup2FAMutation.isPending}
                    className="bg-orange-600 hover:bg-orange-700 text-white px-6 py-2.5 rounded-xl font-bold transition-all shadow-md shadow-orange-900/10 flex items-center gap-2 text-sm"
                  >
                    <QrCode size={18} />
                    Enable 2FA
                  </button>
                )}
              </div>

              {/* FIDO2 / WebAuthn */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-slate-800">Hardware Security Keys (FIDO2)</h3>
                    <span className="bg-blue-50 text-blue-700 text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border border-blue-100">
                      Recommended
                    </span>
                  </div>
                  <p className="text-sm text-slate-500 max-w-md">
                    Secure your account with physical hardware keys like YubiKey or biometrics.
                  </p>
                </div>
                
                <button 
                  onClick={() => setupFido2Mutation.mutate()}
                  disabled={setupFido2Mutation.isPending}
                  className="bg-slate-800 hover:bg-slate-900 text-white px-6 py-2.5 rounded-xl font-bold transition-all shadow-md shadow-slate-900/10 flex items-center gap-2 text-sm"
                >
                  <Fingerprint size={18} className="text-orange-500" />
                  Register Key
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="grid md:grid-cols-2 gap-8 items-start">
                <div className="space-y-4">
                  <div className="bg-white p-4 rounded-2xl border border-slate-200 inline-block shadow-sm">
                    {qrCode && <img src={qrCode} alt="2FA QR Code" className="w-48 h-48" />}
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Manual Entry Key</p>
                    <code className="bg-slate-50 border border-slate-200 px-3 py-2 rounded-lg block text-orange-600 font-mono text-xs break-all">
                      {secret}
                    </code>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="space-y-2">
                    <h3 className="font-bold text-slate-800 text-lg">Scan QR Code</h3>
                    <p className="text-sm text-slate-500 leading-relaxed">
                      Use an authenticator app (Google Authenticator, Authy, etc) to scan the code. Enter the resulting 6-digit code below.
                    </p>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 ml-1">Verification Code</label>
                      <input
                        type="text"
                        maxLength={6}
                        placeholder="000000"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 text-slate-800 text-center text-3xl tracking-[0.4em] font-mono focus:ring-2 focus:ring-orange-500/50 outline-none transition-all"
                        value={token}
                        onChange={(e) => setToken(e.target.value.replace(/\D/g, ''))}
                      />
                    </div>
                    
                    <div className="flex gap-3">
                      <button 
                        onClick={() => setIsSettingUp(false)}
                        className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 py-3 rounded-xl font-bold transition-all text-sm"
                      >
                        Cancel
                      </button>
                      <button 
                        onClick={() => enable2FAMutation.mutate(token)}
                        disabled={token.length !== 6 || enable2FAMutation.isPending}
                        className="flex-1 bg-orange-600 hover:bg-orange-700 text-white py-3 rounded-xl font-bold transition-all text-sm disabled:opacity-50"
                      >
                        {enable2FAMutation.isPending ? 'Verifying...' : 'Enable 2FA'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm opacity-60">
        <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex items-center gap-3">
          <Key className="text-slate-400" size={24} />
          <h2 className="text-lg font-bold text-slate-400">Advanced Identity Control</h2>
        </div>
        <div className="p-12 text-center text-slate-400 italic text-sm">
          FIDO2 Role delegation and session management features coming soon.
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
