import type { InternSummary } from '@feedback-portal/contracts';
import { Lock } from 'lucide-react';
import { Avatar } from '../ui/avatar.tsx';
import { StatusBadge } from '../ui/status-badge.tsx';
import { ColourChip } from './colour-chip.tsx';
import { InternLink } from './intern-link.tsx';
import type { InternBadge } from './roster.ts';

/** "🔒 Read-only", 12px muted, for final statuses and archived batches. */
export const ReadOnlyMark = () => (
  <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
    <Lock aria-hidden size={12} strokeWidth={2} />
    Read-only
  </span>
);

type InternCardProps = Readonly<{
  intern: InternSummary;
  badge: InternBadge | null;
  readOnly: boolean;
}>;

/**
 * A2's intern card: avatar and colour chip, name over `@username`, the status badge row, and
 * (7.4 decision 2: no feedback yet) a footer only for Read-only. Read-only cards sit on slate 50.
 */
export const InternCard = ({ intern, badge, readOnly }: InternCardProps) => (
  <li
    aria-label={intern.name}
    className={`flex flex-col gap-3 border border-border p-4 ${readOnly ? 'bg-(--slate-50)' : 'bg-background'}`}
  >
    <div className="flex items-start justify-between gap-2">
      <Avatar name={intern.name} size="lg" />
      <ColourChip code={intern.colorCode} />
    </div>
    <div className="flex min-w-0 flex-col gap-0.5">
      <InternLink intern={intern} className="truncate text-[15px] font-semibold" />
      <span className="truncate font-mono text-[13px] text-muted-foreground">
        @{intern.username}
      </span>
    </div>
    <div className="flex min-h-[22px]">
      {badge ? <StatusBadge type={badge.type}>{badge.label}</StatusBadge> : null}
    </div>
    {readOnly ? (
      <div className="mt-auto flex min-h-8 items-center border-t border-border pt-2.5">
        <ReadOnlyMark />
      </div>
    ) : null}
  </li>
);
