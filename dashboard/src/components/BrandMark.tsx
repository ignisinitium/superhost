import React from 'react';
import { BRAND } from '../brand';

// The Quantum Creations wordmark: the triangular-loop logo mark + name.
// Used across the customer-facing storefront (marketing, order, login).
const SIZES = {
  sm: { box: 'w-7 h-7', text: 'text-base' },
  md: { box: 'w-8 h-8', text: 'text-lg' },
  lg: { box: 'w-10 h-10', text: 'text-xl' },
};

// The triangular-loop mark (matches the favicon + OG image): three white
// beam faces on a violet tile.
const LogoMark: React.FC<{ className?: string }> = ({ className = '' }) => (
  <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
    <rect width="64" height="64" rx="14" fill="#7c3aed" />
    <g stroke="#5b21b6" strokeWidth="1.5" strokeLinejoin="round">
      <polygon points="32,9 51.92,43.5 38.93,36 32,24" fill="#ffffff" />
      <polygon points="51.92,43.5 12.08,43.5 25.07,36 38.93,36" fill="#ffffff" fillOpacity="0.62" />
      <polygon points="12.08,43.5 32,9 32,24 25.07,36" fill="#ffffff" fillOpacity="0.82" />
    </g>
  </svg>
);

const BrandMark: React.FC<{ size?: keyof typeof SIZES; light?: boolean; className?: string }> = ({
  size = 'md', light = false, className = '',
}) => {
  const s = SIZES[size];
  return (
    <div className={`flex items-center gap-2.5 font-bold ${className}`}>
      <LogoMark className={`${s.box} rounded-lg shadow-sm shrink-0`} />
      <span className={`${s.text} ${light ? 'text-white' : 'text-slate-900'}`}>{BRAND.name}</span>
    </div>
  );
};

export default BrandMark;
