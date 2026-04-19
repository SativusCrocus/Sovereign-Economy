// frontend/components/Logo.tsx
import * as React from "react";

export function Logo({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden
      className={className}
    >
      <defs>
        <linearGradient id="daes-logo-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#7dd3fc" />
          <stop offset="100%" stopColor="#38bdf8" />
        </linearGradient>
      </defs>
      <path d="M32 4 L60 32 L32 60 L4 32 Z" stroke="url(#daes-logo-g)" strokeWidth="2.25" strokeLinejoin="round" />
      <path d="M32 18 L46 32 L32 46 L18 32 Z" stroke="url(#daes-logo-g)" strokeWidth="1.75" fill="#7dd3fc" fillOpacity="0.1" strokeLinejoin="round" />
      <line x1="32" y1="18" x2="32" y2="8"  stroke="url(#daes-logo-g)" strokeWidth="1.25" strokeLinecap="round" />
      <line x1="46" y1="32" x2="56" y2="32" stroke="url(#daes-logo-g)" strokeWidth="1.25" strokeLinecap="round" />
      <line x1="32" y1="46" x2="32" y2="56" stroke="url(#daes-logo-g)" strokeWidth="1.25" strokeLinecap="round" />
      <line x1="18" y1="32" x2="8"  y2="32" stroke="url(#daes-logo-g)" strokeWidth="1.25" strokeLinecap="round" />
      <circle cx="32" cy="6"  r="2.5" fill="#e6edf3" />
      <circle cx="58" cy="32" r="2.5" fill="#e6edf3" />
      <circle cx="32" cy="58" r="2.5" fill="#e6edf3" />
      <circle cx="6"  cy="32" r="2.5" fill="#e6edf3" />
      <circle cx="32" cy="32" r="3.25" fill="url(#daes-logo-g)" />
    </svg>
  );
}
