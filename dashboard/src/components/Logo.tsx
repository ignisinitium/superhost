import React from 'react';

// The Quantum Creations logo mark: a triangular-loop ("impossible pyramid")
// in three white beam faces on the brand-violet tile. Matches the favicon and
// the qc.fyi OG image. Size it via className (e.g. "w-8 h-8 rounded-lg").
const Logo: React.FC<{ className?: string }> = ({ className = '' }) => (
  <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
    <rect width="64" height="64" rx="14" fill="#7c3aed" />
    <g stroke="#5b21b6" strokeWidth="1.5" strokeLinejoin="round">
      <polygon points="32,9 51.92,43.5 38.93,36 32,24" fill="#ffffff" />
      <polygon points="51.92,43.5 12.08,43.5 25.07,36 38.93,36" fill="#ffffff" fillOpacity="0.62" />
      <polygon points="12.08,43.5 32,9 32,24 25.07,36" fill="#ffffff" fillOpacity="0.82" />
    </g>
  </svg>
);

export default Logo;
