import type { InternDetail } from '@feedback-portal/contracts';
import { ArrowRight } from 'lucide-react';
import { formatDay } from '../../batches/batch-dates.ts';
import { Markdown } from '../../ui/markdown.tsx';
import { StatusBadge } from '../../ui/status-badge.tsx';
import { eventReason, statusBadges } from '../profile.ts';

/** P23 · the Status history tab: every change, newest first, with who made it and why. */
export const StatusHistory = ({ intern }: Readonly<{ intern: InternDetail }>) => (
  <>
    <div className="flex items-baseline justify-between gap-4">
      <h2 className="text-lg font-semibold tracking-[-0.2px]">Status history</h2>
      <p className="text-[13px] text-muted-foreground">
        Every change is kept. Entries can't be edited.
      </p>
    </div>
    <ol aria-label="Status changes" className="border border-border bg-background">
      {intern.statusEvents.map((event) => (
        <li
          key={event.id}
          className="grid grid-cols-[120px_minmax(0,1fr)] gap-5 border-b border-border px-5 py-4 last:border-b-0"
        >
          <span className="text-[13px] text-muted-foreground">{formatDay(event.createdAt)}</span>
          <div className="flex min-w-0 flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {event.fromStatus ? (
                <>
                  <StatusBadge type={statusBadges[event.fromStatus].type}>
                    {statusBadges[event.fromStatus].label}
                  </StatusBadge>
                  <ArrowRight aria-hidden size={14} className="text-muted-foreground" />
                  <span className="sr-only">to</span>
                </>
              ) : null}
              <StatusBadge type={statusBadges[event.toStatus].type}>
                {statusBadges[event.toStatus].label}
              </StatusBadge>
              <span className="text-muted-foreground">by {event.actor.name}</span>
            </div>
            <Markdown>{eventReason(event, intern.source)}</Markdown>
          </div>
        </li>
      ))}
    </ol>
  </>
);
