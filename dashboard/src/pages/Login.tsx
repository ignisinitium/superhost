import React, { useState } from 'react';
import api from '../api/client';
import { useNavigate } from 'react-router-dom';
import { Shield, Lock, ArrowRight, Server, Fingerprint } from 'lucide-react';
import { startAuthentication } from '@simplewebauthn/browser';

const Login: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [twoFACode, setTwoFACode] = useState('');
  const [require2FA, setRequire2FA] = useState(false);
  const [adminId, setAdminId] = useState<number | null>(null);
  const [pendingToken, setPendingToken] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    try {
      const res = await api.post('/auth/login', { username, password });
      if (res.data.require2FA) {
        setRequire2FA(true);
        setAdminId(res.data.adminId);
        setPendingToken(res.data.pendingToken);
      } else {
        localStorage.setItem('token', res.data.token);
        localStorage.setItem('admin', JSON.stringify(res.data.admin));
        localStorage.setItem('role', 'admin');
        navigate('/');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleFidoLogin = async () => {
    if (!username) {
      setError('Please enter your username first');
      return;
    }

    setError('');
    setIsLoading(true);
    try {
      // 1. Get options from server
      const optionsRes = await api.post('/fido2/login-options', { username });
      const { options, adminId: returnedAdminId } = optionsRes.data;

      // 2. Trigger browser WebAuthn ceremony
      const authResponse = await startAuthentication({ optionsJSON: options });

      // 3. Verify with server
      const verifyRes = await api.post('/fido2/login-verify', { body: authResponse, adminId: returnedAdminId });
      
      if (verifyRes.data.verified) {
        localStorage.setItem('token', verifyRes.data.token);
        localStorage.setItem('admin', JSON.stringify(verifyRes.data.admin));
        localStorage.setItem('role', 'admin');
        navigate('/');
      }
    } catch (err: any) {
      setError(err.message || 'Security Key authentication failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerify2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const res = await api.post('/auth/verify-2fa', { adminId, token: twoFACode, pendingToken });
      localStorage.setItem('token', res.data.token);
      localStorage.setItem('admin', JSON.stringify(res.data.admin));
      localStorage.setItem('role', 'admin');
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.message || '2FA verification failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 font-sans selection:bg-orange-500/30">
      {/* Background Decorative Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-orange-600/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-amber-600/10 rounded-full blur-[120px]" />
      </div>

      <div className="bg-slate-900 border border-slate-800 p-10 rounded-2xl shadow-2xl w-full max-w-md relative z-10">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-orange-500 to-amber-600 rounded-2xl shadow-xl shadow-orange-900/20 mb-6 group transition-transform hover:scale-105 duration-300">
            <Shield className="text-white" size={40} />
          </div>
          <h1 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-amber-500 mb-2 tracking-tight text-center uppercase">
            Superhost
          </h1>
          <p className="text-slate-500 font-medium">Root Administration Access</p>
        </div>
        
        {error && (
          <div className="bg-red-500/10 border border-red-500/50 text-red-400 p-4 rounded-xl mb-8 text-sm flex items-center gap-3 animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
            {error}
          </div>
        )}

        {!require2FA ? (
          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-2">
              <label className="block text-slate-400 text-xs font-bold uppercase tracking-widest ml-1">Username</label>
              <div className="relative">
                <Server className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                <input
                  type="text"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3.5 pl-10 pr-4 text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500/50 transition-all placeholder:text-slate-700 font-medium"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="admin"
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="block text-slate-400 text-xs font-bold uppercase tracking-widest ml-1">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                <input
                  type="password"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3.5 pl-10 pr-4 text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500/50 transition-all placeholder:text-slate-700"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                />
              </div>
            </div>
            
            <div className="flex flex-col gap-3 pt-2">
              <button 
                type="submit"
                disabled={isLoading}
                className="w-full bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white font-bold py-4 rounded-xl transition-all duration-300 flex items-center justify-center gap-2 group shadow-lg shadow-orange-900/40 disabled:opacity-50"
              >
                {isLoading ? 'Verifying...' : 'System Login'}
                {!isLoading && <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />}
              </button>

              <button 
                type="button"
                onClick={handleFidoLogin}
                disabled={isLoading}
                className="w-full bg-slate-800 hover:bg-slate-700 text-white font-bold py-4 rounded-xl transition-all duration-300 flex items-center justify-center gap-2 group border border-slate-700 disabled:opacity-50"
              >
                <Fingerprint size={20} className="text-orange-500 group-hover:scale-110 transition-transform" />
                Sign in with Key
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleVerify2FA} className="space-y-6">
            <div className="space-y-4">
              <label className="block text-slate-400 text-xs font-bold uppercase tracking-widest text-center">Security Token Required</label>
              <input
                type="text"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl py-4 text-white text-center text-3xl tracking-[0.4em] font-mono focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500/50 transition-all"
                value={twoFACode}
                onChange={(e) => setTwoFACode(e.target.value)}
                maxLength={6}
                placeholder="000000"
                required
                autoFocus
              />
              <p className="text-[11px] text-slate-500 text-center leading-relaxed italic px-4">
                Enter the 6-digit code from your configured authenticator app.
              </p>
            </div>
            <button 
              type="submit"
              disabled={isLoading}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-4 rounded-xl transition-all duration-300 flex items-center justify-center gap-2 group shadow-lg shadow-emerald-900/20"
            >
              {isLoading ? 'Authenticating...' : 'Secure Verification'}
              {!isLoading && <Shield size={20} />}
            </button>
          </form>
        )}

        <div className="mt-10 pt-8 border-t border-slate-800 text-center">
          <button 
            onClick={() => navigate('/client/login')}
            className="text-slate-500 hover:text-orange-500 text-xs font-semibold uppercase tracking-widest transition-colors"
          >
            Switch to Client Portal
          </button>
        </div>
      </div>
    </div>
  );
};

export default Login;
