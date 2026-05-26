import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Terminal as TerminalIcon, Play, Trash2, ChevronRight, AlertTriangle } from 'lucide-react';
import api from '../api/client';

interface HistoryEntry {
  id: number;
  command: string;
  output: string;
  exitCode: number;
  timestamp: Date;
  loading: boolean;
}

const POLL_INTERVAL_MS = 800;
const POLL_TIMEOUT_MS = 30_000;

async function pollTask(taskId: number): Promise<{ result?: string; exitCode?: number }> {
  const start = Date.now();
  while (Date.now() - start < POLL_TIMEOUT_MS) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
    const res = await api.get(`/tasks/${taskId}`);
    const task = res.data;
    if (task.status === 'completed') return task.payload ?? {};
    if (task.status === 'failed') throw new Error(task.error_message ?? 'Command failed');
  }
  throw new Error('Command timed out after 30 seconds');
}

const TerminalPage: React.FC = () => {
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [inputHistory, setInputHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const [running, setRunning] = useState(false);
  const nextId = useRef(0);
  const outputEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom when output grows
  useEffect(() => {
    outputEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history]);

  const runCommand = useCallback(async (cmd: string) => {
    const trimmed = cmd.trim();
    if (!trimmed) return;

    const id = nextId.current++;
    const entry: HistoryEntry = {
      id,
      command: trimmed,
      output: '',
      exitCode: 0,
      timestamp: new Date(),
      loading: true,
    };

    setHistory(prev => [...prev, entry]);
    setInputHistory(prev => [trimmed, ...prev.filter(c => c !== trimmed)].slice(0, 50));
    setHistoryIdx(-1);
    setInput('');
    setRunning(true);

    try {
      const res = await api.post('/admin/system/exec', { command: trimmed });
      const { taskId } = res.data as { taskId: number };
      const result = await pollTask(taskId);
      setHistory(prev =>
        prev.map(e =>
          e.id === id
            ? { ...e, output: result.result ?? '', exitCode: result.exitCode ?? 0, loading: false }
            : e
        )
      );
    } catch (err: any) {
      setHistory(prev =>
        prev.map(e =>
          e.id === id
            ? { ...e, output: err.message ?? 'Error', exitCode: 1, loading: false }
            : e
        )
      );
    } finally {
      setRunning(false);
      inputRef.current?.focus();
    }
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      if (!running) runCommand(input);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const next = Math.min(historyIdx + 1, inputHistory.length - 1);
      setHistoryIdx(next);
      setInput(inputHistory[next] ?? '');
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = historyIdx - 1;
      if (next < 0) { setHistoryIdx(-1); setInput(''); }
      else { setHistoryIdx(next); setInput(inputHistory[next] ?? ''); }
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-slate-800 rounded-lg">
            <TerminalIcon className="w-5 h-5 text-green-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Root Terminal</h1>
            <p className="text-sm text-slate-500">Command executor — runs as root via worker</p>
          </div>
        </div>
        <button
          onClick={() => setHistory([])}
          className="flex items-center gap-2 px-3 py-1.5 text-sm text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
        >
          <Trash2 className="w-4 h-4" />
          Clear
        </button>
      </div>

      {/* Security notice */}
      <div className="flex items-start gap-2 p-3 mb-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
        <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
        <span>Commands run as <strong>root</strong> on the live server. All commands are logged.</span>
      </div>

      {/* Terminal output */}
      <div
        className="flex-1 bg-slate-900 rounded-xl p-4 font-mono text-sm overflow-y-auto min-h-0 cursor-text"
        onClick={() => inputRef.current?.focus()}
      >
        {history.length === 0 && (
          <div className="text-slate-500 text-xs mb-4">
            Type a command and press Enter. Use ↑ ↓ to navigate history.
          </div>
        )}

        {history.map(entry => (
          <div key={entry.id} className="mb-4">
            {/* Command line */}
            <div className="flex items-center gap-2 text-green-400">
              <span className="text-slate-500 text-xs select-none">
                {entry.timestamp.toLocaleTimeString()}
              </span>
              <span className="text-purple-400">root@superhost</span>
              <span className="text-slate-400">~#</span>
              <span className="text-white">{entry.command}</span>
            </div>

            {/* Output */}
            {entry.loading ? (
              <div className="mt-1 ml-4 text-slate-400 animate-pulse">Running…</div>
            ) : entry.output ? (
              <pre
                className={`mt-1 ml-4 whitespace-pre-wrap break-all text-xs leading-relaxed ${
                  entry.exitCode !== 0 ? 'text-red-400' : 'text-slate-300'
                }`}
              >
                {entry.output}
              </pre>
            ) : null}

            {/* Exit code badge for errors */}
            {!entry.loading && entry.exitCode !== 0 && (
              <div className="mt-1 ml-4 text-xs text-red-500">
                exit code {entry.exitCode}
              </div>
            )}
          </div>
        ))}

        {/* Input line */}
        <div className="flex items-center gap-2">
          <span className="text-purple-400 whitespace-nowrap">root@superhost</span>
          <span className="text-slate-400">~#</span>
          <input
            ref={inputRef}
            value={input}
            onChange={e => { setInput(e.target.value); setHistoryIdx(-1); }}
            onKeyDown={handleKeyDown}
            disabled={running}
            className="flex-1 bg-transparent text-white outline-none caret-green-400 disabled:opacity-50"
            placeholder={running ? 'Running…' : ''}
            autoFocus
            spellCheck={false}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
          />
          <button
            onClick={() => runCommand(input)}
            disabled={running || !input.trim()}
            className="p-1 text-slate-500 hover:text-green-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="Run (Enter)"
          >
            <Play className="w-4 h-4" />
          </button>
        </div>

        <div ref={outputEndRef} />
      </div>

      {/* Quick commands */}
      <div className="mt-3">
        <p className="text-xs text-slate-400 mb-2">Quick commands</p>
        <div className="flex flex-wrap gap-2">
          {[
            'uptime',
            'df -h',
            'free -h',
            'systemctl status nginx',
            'top -bn1 | head -20',
            'journalctl -u superhost-api --no-pager -n 30',
          ].map(cmd => (
            <button
              key={cmd}
              onClick={() => runCommand(cmd)}
              disabled={running}
              className="flex items-center gap-1 px-2 py-1 text-xs bg-slate-100 hover:bg-slate-200 text-slate-600 rounded font-mono disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="w-3 h-3" />
              {cmd}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default TerminalPage;
