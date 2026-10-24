import type { ReactNode } from 'react';
import { Button } from '../../ui/button.tsx';

/** P22's card: a bordered box headed by an 18px/600 title (and an action), padding 14px 20px. */
type SectionCardProps = Readonly<{
  title: string;
  /** An outline `sm` button at the right of the header (P22's Edit details), when given. */
  actionLabel?: string;
  onAction?: (() => void) | undefined;
  children: ReactNode;
}>;

export const SectionCard = ({ title, actionLabel, onAction, children }: SectionCardProps) => (
  <section aria-label={title} className="border border-border bg-background">
    <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
      <h2 className="text-lg font-semibold tracking-[-0.2px]">{title}</h2>
      {actionLabel && onAction ? (
        <Button variant="outline" size="sm" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
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
