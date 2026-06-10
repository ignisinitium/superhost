import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import api from '../api/client';
import { Lock, ShieldCheck, CheckCircle2, ArrowRight } from 'lucide-react';

const SetClientPassword: React.FC = () => {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const navigate = useNavigate();

  const [status, setStatus] = useState<'checking' | 'valid' | 'invalid' | 'done'>('checking');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) { setStatus('invalid'); return; }
    api.get(`/client/auth/set-password/validate?token=${encodeURIComponent(token)}`)
      .then(res => {
        if (res.data.valid) { setStatus('valid'); setUsername(res.data.username || ''); }
        else setStatus('invalid');
      })
      .catch(() => setStatus('invalid'));
  }, [token]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    setSubmitting(true);
    try {
      await api.post('/client/auth/set-password', { token, password });
      setStatus('done');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Could not set password.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0f172a]">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] bg-blue-500/10 rounded-full blur-[120px]" />
        <div className="absolute -bottom-[10%] -right-[10%] w-[40%] h-[40%] bg-emerald-500/10 rounded-full blur-[120px]" />
      </div>

      <div className="bg-slate-800/50 backdrop-blur-xl p-8 rounded-2xl shadow-2xl w-full max-w-md border border-slate-700/50 relative z-10">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-2xl shadow-lg shadow-blue-600/20 mb-4">
            <ShieldCheck className="text-white" size={32} />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Set Your Password</h1>
          {status === 'valid' && username && (
            <p className="text-slate-400">Choose a password for <span className="text-blue-400 font-medium">{username}</span></p>
          )}
        </div>

        {status === 'checking' && <p className="text-slate-400 text-center">Verifying your link…</p>}

        {status === 'invalid' && (
          <div className="space-y-6">
            <div className="bg-red-500/10 border border-red-500/50 text-red-400 p-4 rounded-xl text-sm">
              This link is invalid or has expired. Please ask your administrator for a new set-password link.
            </div>
            <button onClick={() => navigate('/client/login')} className="w-full bg-slate-700 hover:bg-slate-600 text-white font-bold py-3 rounded-xl transition-all">
              Go to login
            </button>
          </div>
        )}

        {status === 'done' && (
          <div className="space-y-6 text-center">
            <CheckCircle2 className="text-emerald-400 mx-auto" size={48} />
            <p className="text-slate-300">Your password has been set. You can now sign in.</p>
            <button onClick={() => navigate('/client/login')} className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2">
              Sign in <ArrowRight size={18} />
            </button>
          </div>
        )}

        {status === 'valid' && (
          <form onSubmit={submit} className="space-y-6">
            {error && (
              <div className="bg-red-500/10 border border-red-500/50 text-red-400 p-3 rounded-xl text-sm">{error}</div>
            )}
            <div className="space-y-2">
              <label className="block text-slate-300 text-sm font-medium">New password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                <input
                  type="password" autoFocus
                  className="w-full bg-slate-900/50 border border-slate-700 rounded-xl py-3 pl-10 pr-4 text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 8 characters" required
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="block text-slate-300 text-sm font-medium">Confirm password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                <input
                  type="password"
                  className="w-full bg-slate-900/50 border border-slate-700 rounded-xl py-3 pl-10 pr-4 text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Re-enter password" required
                />
              </div>
            </div>
            <button
              type="submit" disabled={submitting}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {submitting ? 'Setting…' : 'Set password'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export default SetClientPassword;
