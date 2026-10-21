import type { ReactNode } from 'react';

/** The design's page heading: 28/36, semibold, tight tracking. */
export const PageTitle = ({ children }: Readonly<{ children: ReactNode }>) => (
  <h1 className="text-[28px] leading-9 font-semibold tracking-[-0.6px]">{children}</h1>
);
