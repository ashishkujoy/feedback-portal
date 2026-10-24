import type { ReactNode } from 'react';

/** P22's card: a bordered box headed by an 18px/600 title, padding 14px 20px over a border. */
export const SectionCard = ({
  title,
  children,
}: Readonly<{ title: string; children: ReactNode }>) => (
  <section aria-label={title} className="border border-border bg-background">
    <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
      <h2 className="text-lg font-semibold tracking-[-0.2px]">{title}</h2>
    </div>
    {children}
  </section>
);

/** The side panel's card: padding 18px, gap 12, a 12px/600 uppercase label. */
export const PanelCard = ({
  label,
  children,
}: Readonly<{ label: string; children: ReactNode }>) => (
  <section
    aria-label={label}
    className="flex flex-col gap-3 border border-border bg-background p-[18px]"
  >
    <h2 className="text-xs font-semibold tracking-[0.06em] text-muted-foreground uppercase">
      {label}
    </h2>
    {children}
  </section>
);
