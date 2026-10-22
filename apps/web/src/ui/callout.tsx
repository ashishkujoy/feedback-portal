import { CircleCheck, CircleX, Info, TriangleAlert, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

type CalloutType = 'info' | 'positive' | 'warning' | 'issue';

const tones: Readonly<Record<CalloutType, { box: string; accent: string; icon: LucideIcon }>> = {
  info: {
    box: 'bg-callout-info border-callout-info-foreground',
    accent: 'text-callout-info-foreground',
    icon: Info,
  },
  positive: {
    box: 'bg-callout-positive border-callout-positive-foreground',
    accent: 'text-callout-positive-foreground',
    icon: CircleCheck,
  },
  warning: {
    box: 'bg-callout-warning border-callout-warning-foreground',
    accent: 'text-callout-warning-foreground',
    icon: TriangleAlert,
  },
  issue: {
    box: 'bg-callout-issue border-callout-issue-foreground',
    accent: 'text-callout-issue-foreground',
    icon: CircleX,
  },
};

type CalloutProps = Readonly<{ type?: CalloutType; title: string; children?: ReactNode }>;

/**
 * Kuat Callout: a tinted, flat banner with a 4px left accent, an icon, a title and a description.
 * Static (no live region): it renders with the page. Add one when a callout can appear later.
 */
export const Callout = ({ type = 'info', title, children }: CalloutProps) => {
  const { box, accent, icon: Icon } = tones[type];
  return (
    <div data-type={type} className={`flex items-start gap-3 border-l-4 p-4 ${box}`}>
      <Icon aria-hidden size={24} strokeWidth={2} className={`mt-px shrink-0 ${accent}`} />
      <div className="flex min-w-0 flex-col gap-1 text-foreground">
        <p className="text-base leading-6 font-semibold">{title}</p>
        {children ? <p className="text-sm leading-[21px]">{children}</p> : null}
      </div>
    </div>
  );
};
