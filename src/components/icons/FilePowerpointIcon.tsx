// src/components/icons/FilePowerpointIcon.tsx
import React from 'react';

export function FilePowerpointIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="12" y1="18" x2="12" y2="12" />
      <line x1="12" y1="12" x2="10" y2="12" />
      <path d="M10 15h4" />
      <path d="M10 12a2 2 0 1 0 4 0v3a2 2 0 1 1-4 0Z" />
    </svg>
  );
}