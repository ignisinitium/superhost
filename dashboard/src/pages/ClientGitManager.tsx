import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import { 
  GitBranch, Trash2, Plus, 
  Globe, Terminal, Copy, Info, GitPullRequest
} from 'lucide-react';
import toast from 'react-hot-toast';

interface Domain {
  id: number;
  domain_name: string;
}

interface GitRepo {
  id: number;
  domain_name: string;
  repo_url: string;
  branch: string;
  deploy_path: string;
  webhook_token: string;
  last_deployed: string | null;
  created_at: string;
}

const ClientGitManager: React.FC = () => {
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  // Create Repo State
  const [domainId, setDomainId] = useState('');
  const [repoUrl, setRepoUrl] = useState('');
  const [branch, setBranch] = useState('main');
  const [deployPath, setDeployPath] = useState('');

  const { data: domains } = useQuery<Domain[]>({
    queryKey: ['clientDomains'],
    queryFn: async () => {
      const res = await api.get('/client/domains');
      return res.data;
    }
  });

  const { data: repos, isLoading } = useQuery<GitRepo[]>({
    queryKey: ['userGitRepos'],
    queryFn: async () => {
      const res = await api.get('/client/git');
      return res.data;
    }
  });

  const addRepoMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/client/git', {
        domainId: parseInt(domainId),
        repoUrl,
        branch,
        deployPath
      });
      return res.data;
    },
    onSuccess: () => {
      toast.success('Repository linked successfully!');
      setIsModalOpen(false);
      setRepoUrl('');
      setDeployPath('');
      queryClient.invalidateQueries({ queryKey: ['userGitRepos'] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Failed to link repository');
    }
  });

  const deleteRepoMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await api.delete(`/client/git/${id}`);
      return res.data;
    },
    onSuccess: () => {
      toast.success('Repository unlinked');
      queryClient.invalidateQueries({ queryKey: ['userGitRepos'] });
    }
  });

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Webhook URL copied!');
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-3">
             <GitPullRequest className="text-slate-900" size={28} />
             Git Auto-Deployment
          </h1>
          <p className="text-slate-500 mt-1 ml-1">Automate your deployments via GitHub/GitLab webhooks.</p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="bg-slate-900 hover:bg-slate-800 text-white px-5 py-2.5 rounded-xl font-bold transition-all shadow-md flex items-center gap-2 text-sm"
        >
          <Plus size={18} />
          Link Repository
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {isLoading ? (
          <div className="bg-white border border-slate-200 rounded-3xl py-20 text-center text-slate-400">Loading your repositories...</div>
        ) : repos && repos.length > 0 ? (
          repos.map((repo) => (
            <div key={repo.id} className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm hover:border-blue-200 transition-all group">
               <div className="p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                  <div className="flex items-start gap-4">
                     <div className="w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 border border-slate-100 group-hover:bg-blue-50 group-hover:text-blue-500 transition-colors">
                        <GitBranch size={24} />
                     </div>
                     <div>
                        <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                           {repo.repo_url.split('/').pop()?.replace('.git', '')}
                           <span className="text-[10px] font-bold uppercase tracking-widest bg-blue-50 text-blue-600 px-2 py-0.5 rounded border border-blue-100">
                             {repo.branch}
                           </span>
                        </h2>
                        <div className="text-xs font-mono text-slate-400 mt-1 flex items-center gap-2">
                           <Globe size={12} />
                           {repo.domain_name}{repo.deploy_path ? `/${repo.deploy_path}` : ''}
                        </div>
                     </div>
                  </div>

                  <div className="flex-1 max-w-md">
                     <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 relative group/webhook">
                        <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Webhook URL (POST)</label>
                        <div className="flex items-center gap-2">
                           <code className="text-[10px] font-mono text-slate-600 truncate flex-1">
                             {`https://${window.location.hostname}/api/client/git/webhook/${repo.webhook_token}`}
                           </code>
                           <button 
                             onClick={() => copyToClipboard(`https://${window.location.hostname}/api/client/git/webhook/${repo.webhook_token}`)}
                             className="p-1.5 hover:bg-white rounded-lg text-slate-400 hover:text-blue-600 transition-all border border-transparent hover:border-slate-200"
                           >
                              <Copy size={14} />
                           </button>
                        </div>
                     </div>
                  </div>

                  <div className="flex items-center gap-4">
                     <div className="text-right">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Last Deployed</p>
                        <p className="text-xs font-bold text-slate-700">
                           {repo.last_deployed ? new Date(repo.last_deployed).toLocaleString() : 'Never'}
                        </p>
                     </div>
                     <button 
                       onClick={() => { if(window.confirm('Stop auto-deploying and unlink this repository?')) deleteRepoMutation.mutate(repo.id); }}
                       className="p-3 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
                     >
                        <Trash2 size={20} />
                     </button>
                  </div>
               </div>
            </div>
          ))
        ) : (
          <div className="bg-white border-2 border-dashed border-slate-200 rounded-3xl py-20 text-center flex flex-col items-center gap-4">
             <div className="w-16 h-16 rounded-full bg-slate-50 flex items-center justify-center text-slate-300">
                <GitPullRequest size={32} />
             </div>
             <div>
                <p className="text-slate-500 font-bold text-lg">No Repositories Linked</p>
                <p className="text-slate-400 text-sm">Automate your site updates by linking a Git repository.</p>
             </div>
             <button onClick={() => setIsModalOpen(true)} className="mt-2 bg-slate-900 text-white px-6 py-2.5 rounded-xl font-bold text-sm">Link Your First Repo</button>
          </div>
        )}
      </div>

      <div className="bg-blue-50 border border-blue-100 rounded-2xl p-6 flex gap-4">
         <div className="p-3 bg-white rounded-xl text-blue-600 shadow-sm self-start">
            <Info size={24} />
         </div>
         <div>
            <h3 className="font-bold text-blue-900 mb-1">How it works</h3>
            <p className="text-sm text-blue-700 leading-relaxed max-w-3xl">
               Linking a repository allows Superhost to automatically update your website code whenever you push to a specific branch. 
               Copy the generated Webhook URL and paste it into your GitHub/GitLab repository settings under **Webhooks**. 
               Ensure the payload format is set to **JSON**.
            </p>
         </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-800">Link Git Repository</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>
            
            <form onSubmit={(e) => { e.preventDefault(); addRepoMutation.mutate(); }} className="p-6 space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Repository URL (Public)</label>
                <div className="relative">
                   <Terminal className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                   <input 
                     type="text" 
                     className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pl-10 pr-4 text-sm font-mono" 
                     value={repoUrl} 
                     onChange={(e) => setRepoUrl(e.target.value)} 
                     placeholder="https://github.com/user/repo.git" 
                     required 
                   />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Branch</label>
                  <input type="text" className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-sm" value={branch} onChange={(e) => setBranch(e.target.value)} placeholder="main" required />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Target Domain</label>
                  <select className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-sm appearance-none outline-none" value={domainId} onChange={(e) => setDomainId(e.target.value)} required>
                    <option value="" disabled>Select Domain</option>
                    {domains?.map(d => (<option key={d.id} value={d.id}>{d.domain_name}</option>))}
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Deploy Subpath (Optional)</label>
                <input type="text" className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-sm" value={deployPath} onChange={(e) => setDeployPath(e.target.value)} placeholder="e.g. subfolder (relative to public_html)" />
              </div>

              <div className="pt-4 flex gap-3">
                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 px-4 py-3 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 text-sm transition-all">Cancel</button>
                <button type="submit" disabled={addRepoMutation.isPending} className="flex-1 px-4 py-3 rounded-xl font-bold text-white bg-slate-900 hover:bg-slate-800 shadow-md shadow-slate-900/10 text-sm transition-all disabled:opacity-50">
                  {addRepoMutation.isPending ? 'Linking...' : 'Link Repository'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ClientGitManager;
