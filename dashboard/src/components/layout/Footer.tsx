import React from 'react';

const Footer: React.FC = () => {
  return (
    <footer className="bg-slate-900 border-t border-slate-800 py-6 px-8 mt-auto">
      <div className="flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="flex flex-col gap-1">
          <p className="text-sm text-slate-400">
            &copy; {new Date().getFullYear()} <span className="text-orange-500 font-semibold tracking-wide">SUPERHOST</span> Modular Control Panel.
          </p>
          <p className="text-[10px] text-slate-600 font-mono tracking-tighter">
            v1.2.0-modular-stable | system-mode: cluster-edge
          </p>
        </div>

        <nav className="flex items-center gap-6">
          <a href="#" className="text-xs font-medium text-slate-500 hover:text-orange-400 transition-colors uppercase tracking-widest">Documentation</a>
          <a href="#" className="text-xs font-medium text-slate-500 hover:text-orange-400 transition-colors uppercase tracking-widest">Support</a>
          <a href="#" className="text-xs font-medium text-slate-500 hover:text-orange-400 transition-colors uppercase tracking-widest">Security</a>
        </nav>
      </div>
    </footer>
  );
};

export default Footer;
