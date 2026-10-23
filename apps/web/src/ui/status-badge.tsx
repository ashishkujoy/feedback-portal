import type { ReactNode } from 'react';

/** Kuat StatusBadge, `neutral` (no icon): a flat, solid label. Other types come when needed. */
export const StatusBadge = ({ children }: Readonly<{ children: ReactNode }>) => (
  <span className="inline-flex items-center bg-server-slate-200 px-2 py-[3px] text-xs leading-4 font-semibold tracking-[0.18px] whitespace-nowrap text-neutral-950">
    {children}
  </span>
);
