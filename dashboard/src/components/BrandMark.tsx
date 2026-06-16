import React from 'react';
import { BRAND } from '../brand';
import Logo from './Logo';

// The Quantum Creations wordmark: the triangular-loop logo mark + name.
// Used across the customer-facing storefront (marketing, order, login).
const SIZES = {
  sm: { box: 'w-7 h-7', text: 'text-base' },
  md: { box: 'w-8 h-8', text: 'text-lg' },
  lg: { box: 'w-10 h-10', text: 'text-xl' },
};

const BrandMark: React.FC<{ size?: keyof typeof SIZES; light?: boolean; className?: string }> = ({
  size = 'md', light = false, className = '',
}) => {
  const s = SIZES[size];
  return (
    <div className={`flex items-center gap-2.5 font-bold ${className}`}>
      <Logo className={`${s.box} rounded-lg shadow-sm shrink-0`} />
      <span className={`${s.text} ${light ? 'text-white' : 'text-slate-900'}`}>{BRAND.name}</span>
    </div>
  );
};

export default BrandMark;
