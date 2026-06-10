import React from 'react';
import { Menu, Search, Bell, ChevronDown } from 'lucide-react';
import { BRAND } from '../../brand';

interface HeaderProps {
  toggleSidebar: () => void;
  userRole: 'admin' | 'client';
}

const Header: React.FC<HeaderProps> = ({ toggleSidebar, userRole }) => {
  const isClient = userRole === 'client';
  return (
    <header className="h-16 bg-white/80 backdrop-blur-md border-b border-slate-200 flex items-center justify-between px-4 lg:px-8 sticky top-0 z-30">
      <div className="flex items-center gap-4">
        <button 
          onClick={toggleSidebar}
          className="p-2 -ml-2 rounded-lg text-slate-500 hover:bg-slate-100 lg:hidden"
        >
          <Menu className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-semibold text-slate-800 hidden sm:block">
          {isClient ? BRAND.name : 'Root Administration'}
        </h1>
      </div>

      <div className="flex items-center gap-3 sm:gap-5">
        <div className="relative hidden md:block">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input 
            type="text" 
            placeholder="Quick search..."
            className={`w-64 pl-9 pr-4 py-2 bg-slate-100 border-transparent rounded-full text-sm focus:bg-white focus:ring-2 transition-all outline-none ${isClient ? 'focus:border-violet-400 focus:ring-violet-100' : 'focus:border-orange-400 focus:ring-orange-100'}`}
          />
        </div>
        
        <button className="relative p-2 rounded-full text-slate-500 hover:bg-slate-100 transition-colors">
          <Bell className="w-5 h-5" />
          <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full border-2 border-white"></span>
        </button>

        <div className="h-8 w-px bg-slate-200 mx-1 hidden sm:block"></div>

        <button className="flex items-center gap-2 p-1.5 pr-3 rounded-full border border-slate-200 hover:bg-slate-50 transition-colors">
          <div className="w-7 h-7 rounded-full bg-slate-800 flex items-center justify-center text-white text-xs font-bold">
            {userRole === 'admin' ? 'RT' : 'US'}
          </div>
          <ChevronDown className="w-4 h-4 text-slate-500" />
        </button>
      </div>
    </header>
  );
};

export default Header;
