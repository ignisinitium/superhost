import React from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, ArrowRight } from 'lucide-react';
import BrandMark from '../components/BrandMark';

const OrderSuccess: React.FC = () => {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-white border-b border-slate-100">
        <div className="max-w-3xl mx-auto px-6 h-16 flex items-center cursor-pointer" onClick={() => navigate('/')}>
          <BrandMark size="lg" />
        </div>
      </header>
      <div className="flex-1 flex items-center justify-center px-6">
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-10 max-w-md w-full text-center">
          <CheckCircle2 className="text-emerald-500 mx-auto" size={56} />
          <h1 className="text-2xl font-bold text-slate-800 mt-4">Payment received — welcome aboard!</h1>
          <p className="text-slate-500 mt-3">
            We're setting up your hosting account now. This usually takes a minute or two. You can sign in with the
            username and password you just chose.
          </p>
          <button onClick={() => navigate('/client/login')}
            className="mt-8 w-full bg-violet-600 hover:bg-violet-700 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2">
            Sign in to your dashboard <ArrowRight size={18} />
          </button>
          <p className="text-xs text-slate-400 mt-4">A receipt has been emailed to you.</p>
        </div>
      </div>
    </div>
  );
};

export default OrderSuccess;
