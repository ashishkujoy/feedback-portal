import type { ReactNode } from 'react';

/** Kuat Tag, display mode, base colour: a pill label. Toggle and dismiss modes come with filters. */
export const Tag = ({ children }: Readonly<{ children: ReactNode }>) => (
  <span className="inline-flex items-center gap-1 rounded-full bg-tag-base-background px-2.5 py-2 text-sm leading-[21px] font-medium text-tag-base-foreground">
    {children}
  </span>
);
