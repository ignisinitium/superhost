import React, { useEffect, useState } from 'react';
import {
  X, Send, Ban, Trash2, ShieldCheck, Mail, Paperclip,
  Loader2, AlertTriangle, Code2, FileText, List,
} from 'lucide-react';
import type { QuarantineMessage } from '../../../shared/types';

export interface QuarantineMeta {
  id: number;
  sender: string;
  subject?: string | null;
  spam_score?: number | null;
  virus_name?: string | null;
  created_at?: string;
  mailbox_email?: string;
}

type ViewTab = 'rendered' | 'text' | 'source' | 'headers';

interface Props {
  open: boolean;
  meta: QuarantineMeta | null;
  /** Loads the parsed message + raw source (bound to the current row by the parent). */
  load: (id: number) => Promise<QuarantineMessage>;
  /** Action callbacks — the parent wires these to its mutations. */
  onDeliver: (id: number) => void;
  onDeliverAllow: (id: number) => void;
  onBlock: (id: number) => void;
  onDelete: (id: number) => void;
  busy?: boolean;
  onClose: () => void;
}

const fmtBytes = (n: number) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`);

const QuarantinePreviewModal: React.FC<Props> = ({
  open, meta, load, onDeliver, onDeliverAllow, onBlock, onDelete, busy, onClose,
}) => {
  const [msg, setMsg] = useState<QuarantineMessage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<ViewTab>('text');

  useEffect(() => {
    if (!open || !meta) return;
    let cancelled = false;
    setMsg(null); setError(null); setLoading(true); setTab('text');
    load(meta.id)
      .then(m => { if (!cancelled) { setMsg(m); setTab(m.html ? 'rendered' : 'text'); } })
      .catch(e => { if (!cancelled) setError(e?.response?.data?.message || e?.message || 'Failed to load message'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, meta, load]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);

  if (!open || !meta) return null;

  const TABS: { id: ViewTab; label: string; icon: React.ElementType; show: boolean }[] = [
    { id: 'rendered', label: 'Rendered', icon: Mail, show: !!msg?.html },
    { id: 'text', label: 'Plain text', icon: FileText, show: true },
    { id: 'source', label: 'Source', icon: Code2, show: true },
    { id: 'headers', label: 'Headers', icon: List, show: true },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 sm:p-8 bg-slate-900/60 backdrop-blur-sm overflow-y-auto" onMouseDown={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl my-auto flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200"
        onMouseDown={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start gap-3 p-5 border-b border-slate-200">
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold text-slate-800 truncate">{meta.subject || '(no subject)'}</h2>
            <p className="text-sm text-slate-500 truncate mt-0.5">
              <span className="font-semibold text-slate-600">{meta.sender}</span>
              {meta.mailbox_email && <span className="text-slate-400"> → {meta.mailbox_email}</span>}
            </p>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              {meta.spam_score != null && (
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                  Score {Number(meta.spam_score).toFixed(1)}
                </span>
              )}
              {meta.virus_name && (
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700 flex items-center gap-1">
                  <AlertTriangle size={11} /> {meta.virus_name}
                </span>
              )}
              {msg?.date && (
                <span className="text-[11px] text-slate-400">{new Date(msg.date).toLocaleString()}</span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 flex-shrink-0">
            <X size={20} />
          </button>
        </div>

        {/* Action bar */}
        <div className="flex flex-wrap gap-2 px-5 py-3 bg-slate-50 border-b border-slate-200">
          <button
            onClick={() => onDeliver(meta.id)} disabled={busy}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg disabled:opacity-50"
          >
            <Send size={13} /> Deliver
          </button>
          <button
            onClick={() => onDeliverAllow(meta.id)} disabled={busy}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs font-bold rounded-lg disabled:opacity-50"
          >
            <ShieldCheck size={13} /> Deliver &amp; Whitelist
          </button>
          <div className="flex-1" />
          <button
            onClick={() => onBlock(meta.id)} disabled={busy}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-50 hover:bg-orange-100 text-orange-700 border border-orange-200 text-xs font-bold rounded-lg disabled:opacity-50"
          >
            <Ban size={13} /> Block sender
          </button>
          <button
            onClick={() => onDelete(meta.id)} disabled={busy}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-lg disabled:opacity-50"
          >
            <Trash2 size={13} /> Delete
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-5 pt-3">
          {TABS.filter(t => t.show).map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-t-lg text-xs font-bold transition-colors ${
                tab === t.id ? 'bg-slate-100 text-slate-800' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              <t.icon size={13} /> {t.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto bg-slate-100 p-3">
          {loading && (
            <div className="h-64 flex items-center justify-center text-slate-400 gap-2">
              <Loader2 className="animate-spin" size={18} /> Reading message from server…
            </div>
          )}
          {error && (
            <div className="h-64 flex flex-col items-center justify-center text-red-500 gap-2">
              <AlertTriangle size={28} /> <span className="text-sm">{error}</span>
            </div>
          )}
          {msg && !loading && !error && (
            <>
              {msg.truncated && (
                <div className="mb-3 text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  Source truncated to 1 MB (message is {fmtBytes(msg.size)}).
                </div>
              )}
              {tab === 'rendered' && (
                // Sandboxed iframe with NO allow-scripts → any JS in the spam is inert.
                <iframe
                  title="message"
                  sandbox=""
                  srcDoc={msg.html}
                  className="w-full h-[55vh] bg-white rounded-lg border border-slate-200"
                />
              )}
              {tab === 'text' && (
                <pre className="whitespace-pre-wrap break-words text-sm text-slate-700 bg-white rounded-lg border border-slate-200 p-4 font-sans">
                  {msg.text || '(no plain-text body)'}
                </pre>
              )}
              {tab === 'source' && (
                <pre className="whitespace-pre-wrap break-words text-xs text-slate-600 bg-white rounded-lg border border-slate-200 p-4 font-mono leading-relaxed">
                  {msg.raw}
                </pre>
              )}
              {tab === 'headers' && (
                <pre className="whitespace-pre-wrap break-words text-xs text-slate-600 bg-white rounded-lg border border-slate-200 p-4 font-mono leading-relaxed">
                  {msg.headers.join('\n')}
                </pre>
              )}

              {msg.attachments.length > 0 && (
                <div className="mt-3 bg-white rounded-lg border border-slate-200 p-3">
                  <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Paperclip size={12} /> {msg.attachments.length} attachment{msg.attachments.length > 1 ? 's' : ''}
                  </div>
                  <ul className="space-y-1">
                    {msg.attachments.map((a, i) => (
                      <li key={i} className="text-xs text-slate-600 flex items-center justify-between gap-2">
                        <span className="truncate font-medium">{a.filename}</span>
                        <span className="text-slate-400 flex-shrink-0">{a.contentType} · {fmtBytes(a.size)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default QuarantinePreviewModal;
