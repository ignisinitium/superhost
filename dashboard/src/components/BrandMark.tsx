import React from 'react';
import { BRAND } from '../brand';

// The Quantum Creations wordmark: a "QC" monogram + name. Used across the
// customer-facing storefront (marketing, order, login).
const SIZES = {
  sm: { box: 'w-7 h-7 text-xs', text: 'text-base' },
  md: { box: 'w-8 h-8 text-sm', text: 'text-lg' },
  lg: { box: 'w-10 h-10 text-base', text: 'text-xl' },
};

const BrandMark: React.FC<{ size?: keyof typeof SIZES; light?: boolean; className?: string }> = ({
  size = 'md', light = false, className = '',
}) => {
  const s = SIZES[size];
  return (
    <div className={`flex items-center gap-2 font-bold ${className}`}>
      <div className={`${s.box} rounded-lg bg-violet-600 flex items-center justify-center text-white font-extrabold tracking-tight shadow-sm`}>
        {BRAND.short}
      </div>
      <span className={`${s.text} ${light ? 'text-white' : 'text-slate-900'}`}>{BRAND.name}</span>
    </div>
  );
};

export default BrandMark;
