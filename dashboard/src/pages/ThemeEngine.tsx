import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import { Paintbrush, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';

interface Theme {
  id: number;
  name: string;
  is_active: boolean;
  primary_color: string;
  secondary_color: string;
  background_color: string;
  text_color: string;
  sidebar_bg: string;
}

const ThemeEnginePage: React.FC = () => {
  const queryClient = useQueryClient();

  const { data: themes, isLoading } = useQuery<Theme[]>({
    queryKey: ['themes'],
    queryFn: async () => {
      const res = await api.get('/themes');
      return res.data;
    }
  });

  const activateThemeMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await api.post(`/themes/${id}/activate`);
      return res.data;
    },
    onSuccess: () => {
      toast.success('Theme activated successfully! Reloading...');
      queryClient.invalidateQueries({ queryKey: ['themes'] });
      setTimeout(() => window.location.reload(), 1000);
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Failed to activate theme');
    }
  });

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Theme Engine</h1>
          <p className="text-slate-500 mt-1">Customize the global look and feel of the control panel.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {isLoading ? (
          <div className="col-span-3 text-center py-12 text-slate-400">Loading available themes...</div>
        ) : themes?.map(theme => (
          <div 
            key={theme.id} 
            className={`bg-white rounded-2xl overflow-hidden transition-all duration-300 ${
              theme.is_active 
                ? 'border-2 border-slate-800 shadow-xl shadow-slate-900/10 scale-[1.02]' 
                : 'border border-slate-200 shadow-sm hover:shadow-md'
            }`}
          >
            {/* Theme Preview Card */}
            <div className="h-40 w-full p-4 flex gap-4" style={{ backgroundColor: theme.background_color }}>
              {/* Fake Sidebar */}
              <div className="w-16 h-full rounded-xl shadow-inner flex flex-col gap-2 p-2" style={{ backgroundColor: theme.sidebar_bg }}>
                <div className="w-full h-4 rounded" style={{ backgroundColor: theme.primary_color, opacity: 0.8 }}></div>
                <div className="w-full h-4 rounded" style={{ backgroundColor: theme.secondary_color, opacity: 0.5 }}></div>
                <div className="w-full h-4 rounded" style={{ backgroundColor: theme.text_color, opacity: 0.2 }}></div>
              </div>
              {/* Fake Content */}
              <div className="flex-1 flex flex-col gap-3 pt-2">
                <div className="w-3/4 h-6 rounded" style={{ backgroundColor: theme.text_color }}></div>
                <div className="w-full h-full rounded-xl shadow-sm border border-black/5 flex items-center justify-center" style={{ backgroundColor: '#ffffff' }}>
                  <div className="w-24 h-8 rounded-lg shadow" style={{ backgroundColor: theme.primary_color }}></div>
                </div>
              </div>
            </div>
            
            <div className="p-6">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-xl font-bold text-slate-800">{theme.name}</h3>
                  <p className="text-sm text-slate-500 font-mono mt-1 flex gap-1">
                     <span className="w-3 h-3 rounded-full inline-block" style={{ backgroundColor: theme.primary_color }}></span>
                     <span className="w-3 h-3 rounded-full inline-block" style={{ backgroundColor: theme.secondary_color }}></span>
                     <span className="w-3 h-3 rounded-full inline-block border border-slate-300" style={{ backgroundColor: theme.background_color }}></span>
                  </p>
                </div>
                {theme.is_active && (
                  <span className="bg-slate-800 text-white text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-widest flex items-center gap-1 shadow-md">
                    <CheckCircle2 size={12} /> Active
                  </span>
                )}
              </div>
              
              {!theme.is_active && (
                <button 
                  onClick={() => activateThemeMutation.mutate(theme.id)}
                  disabled={activateThemeMutation.isPending}
                  className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
                >
                  <Paintbrush size={18} />
                  Activate Theme
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ThemeEnginePage;
