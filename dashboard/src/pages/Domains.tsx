import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import { Globe, Plus, User as UserIcon, Server } from 'lucide-react';
import { useTaskMonitor } from '../hooks/useTaskMonitor';
import type { Domain, User } from '../../../shared/types';

const DomainsPage: React.FC = () => {
  const queryClient = useQueryClient();
  const { monitorTask } = useTaskMonitor();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [domainName, setDomainName] = useState('');
  const [phpVersion, setPhpVersion] = useState('8.3');

  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [configuringDomain, setConfiguringDomain] = useState<Domain | null>(null);
  const [configPhpVersion, setConfigPhpVersion] = useState('8.3');
  const [reverseProxyBlock, setReverseProxyBlock] = useState('');

  const { data: domains, isLoading: domainsLoading } = useQuery<Domain[]>({
    queryKey: ['domains'],
    queryFn: async () => {
      const res = await api.get('/domains');
      return res.data;
    },
  });

  const { data: users } = useQuery<User[]>({
    queryKey: ['users'],
    queryFn: async () => {
      const res = await api.get('/users');
      return res.data;
    },
  });

  const createDomainMutation = useMutation({
    mutationFn: async (newDomain: { userId: number, domainName: string, phpVersion: string }) => {
      const res = await api.post('/domains', newDomain);
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['domains'] });
      setIsModalOpen(false);
      setDomainName('');
      if (data.taskId) {
        monitorTask(data.taskId, 'Website provisioned and Nginx configured!');
      }
    },
  });

  const installSSLMutation = useMutation({
    mutationFn: async (domainId: number) => {
      const res = await api.post(`/domains/${domainId}/install-ssl`);
      return res.data;
    },
    onSuccess: (data) => {
      if (data.taskId) {
        monitorTask(data.taskId, 'SSL Certificate installed and Nginx reloaded!');
      }
    },
  });

  const updateDomainMutation = useMutation({
    mutationFn: async (update: { id: number, phpVersion: string, reverseProxyBlock: string }) => {
      const res = await api.patch(`/domains/${update.id}`, update);
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['domains'] });
      setIsConfigModalOpen(false);
      if (data.taskId) {
        monitorTask(data.taskId, 'Domain configuration updated successfully!');
      }
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createDomainMutation.mutate({ 
      userId: parseInt(selectedUserId), 
      domainName, 
      phpVersion 
    });
  };

  const handleConfigSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (configuringDomain) {
      updateDomainMutation.mutate({
        id: configuringDomain.id,
        phpVersion: configPhpVersion,
        reverseProxyBlock
      });
    }
  };

  const openConfigModal = (domain: Domain) => {
    setConfiguringDomain(domain);
    setConfigPhpVersion(domain.php_version);
    setReverseProxyBlock(''); // We don't store this in DB yet, so reset or keep as placeholder
    setIsConfigModalOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Domains & Websites</h1>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
        >
          <Plus size={20} />
          Host Website
        </button>
      </div>

      {domainsLoading ? (
        <div className="text-slate-400">Loading domains...</div>
      ) : (
        <div className="overflow-hidden bg-slate-800 border border-slate-700 rounded-xl shadow-lg">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-700/50 text-slate-300 text-sm font-medium uppercase tracking-wider">
                <th className="px-6 py-4">Domain</th>
                <th className="px-6 py-4">Client</th>
                <th className="px-6 py-4">PHP</th>
                <th className="px-6 py-4">SSL</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {domains?.map((domain) => (
                <tr key={domain.id} className="hover:bg-slate-700/30 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-blue-500/10 text-blue-500 rounded flex items-center justify-center">
                        <Globe size={16} />
                      </div>
                      <span className="font-medium text-white">{domain.domain_name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-slate-400 flex items-center gap-2">
                    <UserIcon size={14} />
                    {domain.username}
                  </td>
                  <td className="px-6 py-4">
                    <span className="bg-slate-700 text-slate-300 px-2 py-1 rounded text-xs border border-slate-600">
                      {domain.php_version}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    {domain.is_ssl ? (
                      <span className="text-green-500 text-xs flex items-center gap-1">
                        <Server size={12} /> Active
                      </span>
                    ) : (
                      <button 
                        onClick={() => installSSLMutation.mutate(domain.id)}
                        disabled={installSSLMutation.isPending}
                        className="text-blue-500 hover:text-blue-400 text-xs font-semibold disabled:opacity-50"
                      >
                        {installSSLMutation.isPending ? 'Installing...' : 'Install SSL'}
                      </button>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button 
                      onClick={() => openConfigModal(domain)}
                      className="text-slate-400 hover:text-white transition-colors text-sm font-medium"
                    >
                      Configure
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Domain Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-md p-8 shadow-2xl text-white">
            <h2 className="text-xl font-bold mb-6">Host New Website</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm text-slate-400 mb-1">Select Client</label>
                <select
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white outline-none focus:ring-2 focus:ring-blue-500"
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                  required
                >
                  <option value="">Choose a client...</option>
                  {users?.map(u => (
                    <option key={u.id} value={u.id}>{u.username}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Domain Name</label>
                <input
                  type="text"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white outline-none focus:ring-2 focus:ring-blue-500"
                  value={domainName}
                  onChange={(e) => setDomainName(e.target.value)}
                  placeholder="e.g. example.com"
                  required
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">PHP Version</label>
                <select
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white outline-none focus:ring-2 focus:ring-blue-500"
                  value={phpVersion}
                  onChange={(e) => setPhpVersion(e.target.value)}
                >
                  <option value="8.3">PHP 8.3</option>
                  <option value="8.2">PHP 8.2</option>
                  <option value="7.4">PHP 7.4</option>
                </select>
              </div>
              <div className="flex gap-3 mt-8">
                <button 
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 bg-slate-700 hover:bg-slate-600 py-3 rounded-lg font-semibold transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={createDomainMutation.isPending}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 py-3 rounded-lg font-semibold transition-colors disabled:opacity-50"
                >
                  {createDomainMutation.isPending ? 'Provisioning...' : 'Add Domain'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Configure Domain Modal */}
      {isConfigModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-lg p-8 shadow-2xl text-white">
            <h2 className="text-xl font-bold mb-2">Configure {configuringDomain?.domain_name}</h2>
            <p className="text-slate-400 text-sm mb-6">Update PHP version and Nginx directives.</p>
            
            <form onSubmit={handleConfigSubmit} className="space-y-4">
              <div>
                <label className="block text-sm text-slate-400 mb-1">PHP Version</label>
                <select
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white outline-none focus:ring-2 focus:ring-blue-500"
                  value={configPhpVersion}
                  onChange={(e) => setConfigPhpVersion(e.target.value)}
                >
                  <option value="8.3">PHP 8.3</option>
                  <option value="8.2">PHP 8.2</option>
                  <option value="7.4">PHP 7.4</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm text-slate-400 mb-1">Custom Reverse Proxy Block</label>
                <textarea
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white outline-none focus:ring-2 focus:ring-blue-500 font-mono text-xs h-32"
                  value={reverseProxyBlock}
                  onChange={(e) => setReverseProxyBlock(e.target.value)}
                  placeholder={`location /api {\n  proxy_pass http://localhost:3000;\n}`}
                />
                <p className="text-[10px] text-slate-500 mt-1">Directly injected into the server block. Use with caution.</p>
              </div>

              <div className="flex gap-3 mt-8">
                <button 
                  type="button"
                  onClick={() => setIsConfigModalOpen(false)}
                  className="flex-1 bg-slate-700 hover:bg-slate-600 py-3 rounded-lg font-semibold transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={updateDomainMutation.isPending}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 py-3 rounded-lg font-semibold transition-colors disabled:opacity-50"
                >
                  {updateDomainMutation.isPending ? 'Updating...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default DomainsPage;
