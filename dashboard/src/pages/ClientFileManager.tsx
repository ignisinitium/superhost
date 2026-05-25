import React, { useState, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import api from '../api/client';
import { 
  Folder, FolderOpen, ChevronRight, Download, Trash2, 
  Edit3, FilePlus, FolderPlus, Upload, CornerUpLeft,
  Check, Search, FileCode, FileText, Image as ImageIcon, RefreshCw
} from 'lucide-react';
import toast from 'react-hot-toast';

interface FileItem {
  name: string;
  isDirectory: boolean;
  size: number;
  mtime: string;
  permissions: string;
}

const ClientFileManager: React.FC = () => {
  const [currentPath, setCurrentPath] = useState('');
  const [files, setFiles] = useState<FileItem[]>([]);
  const [isFetching, setIsFetching] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingFile, setEditingFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const fetchFiles = async () => {
    setIsFetching(true);
    try {
      const res = await api.get(`/client/files/list?path=${currentPath}`);
      const { taskId } = res.data;

      const interval = setInterval(async () => {
        try {
          const taskRes = await api.get(`/tasks/${taskId}`);
          const task = taskRes.data;
          if (task.status === 'completed') {
            setFiles(task.payload.result);
            setIsFetching(false);
            clearInterval(interval);
          } else if (task.status === 'failed') {
            toast.error('Failed to list files');
            setIsFetching(false);
            clearInterval(interval);
          }
        } catch (e) {
          clearInterval(interval);
        }
      }, 1000);
    } catch (err) {
      toast.error('Request failed');
      setIsFetching(false);
    }
  };

  useEffect(() => {
    fetchFiles();
  }, [currentPath]);

  const handleFolderClick = (dirName: string) => {
    setCurrentPath(prev => prev ? `${prev}/${dirName}` : dirName);
  };

  const handleBack = () => {
    setCurrentPath(prev => {
      const parts = prev.split('/');
      parts.pop();
      return parts.join('/');
    });
  };

  const deleteMutation = useMutation({
    mutationFn: async (fileName: string) => {
      const filePath = currentPath ? `${currentPath}/${fileName}` : fileName;
      const res = await api.delete(`/client/files/delete?filePath=${filePath}`);
      return res.data;
    },
    onSuccess: () => {
      toast.success('File deleted');
      fetchFiles();
    }
  });

  const saveFileMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/client/files/write', {
        filePath: currentPath ? `${currentPath}/${editingFile}` : editingFile,
        content: fileContent
      });
      return res.data;
    },
    onSuccess: () => {
      toast.success('File saved');
      setIsEditing(false);
      setEditingFile(null);
    }
  });

  const handleEdit = async (fileName: string) => {
    const filePath = currentPath ? `${currentPath}/${fileName}` : fileName;
    try {
      const res = await api.get(`/client/files/read?filePath=${filePath}`);
      const { taskId } = res.data;
      
      const interval = setInterval(async () => {
        const taskRes = await api.get(`/tasks/${taskId}`);
        if (taskRes.data.status === 'completed') {
          setFileContent(taskRes.data.payload.result);
          setEditingFile(fileName);
          setIsEditing(true);
          clearInterval(interval);
        }
      }, 1000);
    } catch (err) {
      toast.error('Failed to open file');
    }
  };

  const getFileIcon = (file: FileItem) => {
    if (file.isDirectory) return <Folder className="text-orange-400 fill-orange-400/10" size={20} />;
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (['html', 'php', 'js', 'css', 'ts', 'tsx'].includes(ext || '')) return <FileCode className="text-blue-500" size={20} />;
    if (['jpg', 'png', 'svg', 'gif'].includes(ext || '')) return <ImageIcon className="text-emerald-500" size={20} />;
    return <FileText className="text-slate-400" size={20} />;
  };

  const filteredFiles = files.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()));

  if (isEditing) {
    return (
      <div className="max-w-6xl mx-auto h-[calc(100vh-160px)] flex flex-col space-y-4 animate-in fade-in duration-300">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
             <button onClick={() => setIsEditing(false)} className="p-2 hover:bg-slate-100 rounded-full text-slate-500"><CornerUpLeft size={20}/></button>
             <h1 className="text-xl font-bold text-slate-800">Editing: <span className="text-orange-600">{editingFile}</span></h1>
          </div>
          <button 
            onClick={() => saveFileMutation.mutate()}
            disabled={saveFileMutation.isPending}
            className="bg-orange-600 hover:bg-orange-700 text-white px-6 py-2 rounded-xl font-bold shadow-md shadow-orange-900/20 flex items-center gap-2"
          >
            <Check size={18} />
            {saveFileMutation.isPending ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
        <textarea
          className="flex-1 w-full bg-slate-900 text-slate-300 font-mono text-xs p-6 rounded-2xl border border-slate-800 outline-none focus:ring-2 focus:ring-orange-500/20 resize-none shadow-2xl"
          value={fileContent}
          onChange={(e) => setFileContent(e.target.value)}
          spellCheck={false}
        />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 uppercase tracking-tight">Web File Manager</h1>
          <div className="flex items-center gap-2 text-xs font-mono text-slate-500 mt-1 bg-slate-100 px-3 py-1 rounded-full w-fit border border-slate-200">
            <span className="opacity-50">root@superhost:</span>
            <span className="text-orange-600 font-bold">~/public_html{currentPath ? `/${currentPath}` : ''}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
           <button className="p-2.5 bg-white border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 shadow-sm"><FolderPlus size={18}/></button>
           <button className="p-2.5 bg-white border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 shadow-sm"><FilePlus size={18}/></button>
           <div className="h-8 w-px bg-slate-200 mx-1"></div>
           <button className="bg-slate-800 hover:bg-slate-900 text-white px-5 py-2.5 rounded-xl font-bold shadow-lg shadow-slate-900/10 flex items-center gap-2 text-sm">
             <Upload size={18} className="text-orange-500" />
             Upload
           </button>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm flex flex-col min-h-[500px]">
        {/* Toolbar */}
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
           <div className="flex items-center gap-2">
              {currentPath && (
                <button onClick={handleBack} className="p-2 hover:bg-slate-200 rounded-lg text-slate-600 transition-colors mr-2">
                  <CornerUpLeft size={18} />
                </button>
              )}
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input 
                  type="text" 
                  placeholder="Filter files..." 
                  className="bg-white border border-slate-200 rounded-lg py-1.5 pl-9 pr-4 text-xs text-slate-800 outline-none focus:ring-2 focus:ring-orange-500/20 w-64"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
           </div>
           <div className="flex items-center gap-2">
              <button onClick={fetchFiles} disabled={isFetching} className="p-2 text-slate-400 hover:text-orange-600 transition-colors">
                <RefreshCw size={18} className={isFetching ? 'animate-spin' : ''} />
              </button>
           </div>
        </div>

        {/* Explorer Table */}
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200 uppercase tracking-widest text-[10px]">
              <tr>
                <th className="px-6 py-3 w-12"></th>
                <th className="px-6 py-3">Name</th>
                <th className="px-6 py-3">Size</th>
                <th className="px-6 py-3">Permissions</th>
                <th className="px-6 py-3">Last Modified</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isFetching && files.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-400 italic">Syncing with server file system...</td>
                </tr>
              ) : filteredFiles.length > 0 ? (
                filteredFiles.map((file) => (
                  <tr key={file.name} className="hover:bg-slate-50/50 transition-colors group">
                    <td className="px-6 py-4">
                      {getFileIcon(file)}
                    </td>
                    <td className="px-6 py-4">
                      {file.isDirectory ? (
                        <button 
                          onClick={() => handleFolderClick(file.name)}
                          className="font-bold text-slate-800 hover:text-orange-600 transition-colors flex items-center gap-2"
                        >
                          {file.name}
                          <ChevronRight size={14} className="opacity-0 group-hover:opacity-100 -translate-x-2 group-hover:translate-x-0 transition-all" />
                        </button>
                      ) : (
                        <span className="text-slate-700 font-medium">{file.name}</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-slate-400 font-mono text-xs">
                      {file.isDirectory ? '--' : `${(file.size / 1024).toFixed(1)} KB`}
                    </td>
                    <td className="px-6 py-4 text-slate-400 font-mono text-xs">
                      {file.permissions}
                    </td>
                    <td className="px-6 py-4 text-slate-400 text-xs">
                      {new Date(file.mtime).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-right">
                       <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {!file.isDirectory && (
                            <button onClick={() => handleEdit(file.name)} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all" title="Edit Code">
                              <Edit3 size={16} />
                            </button>
                          )}
                          <button className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all" title="Download">
                            <Download size={16} />
                          </button>
                          <button 
                            onClick={() => { if(window.confirm(`Delete ${file.name}?`)) deleteMutation.mutate(file.name); }}
                            className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all" 
                            title="Delete"
                          >
                            <Trash2 size={16} />
                          </button>
                       </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-6 py-20 text-center text-slate-400 italic flex flex-col items-center gap-2">
                    <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center mb-2">
                       <FolderOpen size={24} className="opacity-20" />
                    </div>
                    No files found in this directory.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ClientFileManager;
