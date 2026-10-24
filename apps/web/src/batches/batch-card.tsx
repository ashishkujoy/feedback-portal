import type { BatchSummary } from '@feedback-portal/contracts';
import { Link } from '@tanstack/react-router';
import { ArrowRight } from 'lucide-react';
import { useMemo } from 'react';
import { ColourBar } from '../interns/colour-bar.tsx';
import { AvatarStack } from '../ui/avatar-stack.tsx';
import { buttonClasses } from '../ui/button.tsx';
import { StatusBadge } from '../ui/status-badge.tsx';
import { batchDates, batchStatus, statusBadges } from './batch-status.ts';

type BatchCardProps = Readonly<{ batch: BatchSummary; today: string }>;

const Stat = ({ label, value }: Readonly<{ label: string; value: number }>) => (
  <div className="flex flex-col gap-0.5">
    <dt className="text-xs text-muted-foreground">{label}</dt>
    <dd className="text-lg font-semibold">{value}</dd>
  </div>
);

/**
 * A1's batch card: status, dates, name, the stats (Interns, Mentors, On notice, Terminated; only
 * Mentors before anyone is added), the colour bar or "No interns yet.", and the mentors' avatars
 * with View batch.
 */
export const BatchCard = ({ batch, today }: BatchCardProps) => {
  const status = batchStatus(batch, today);
  const badge = statusBadges[status];
  const params = useMemo(() => ({ batchId: batch.id }), [batch.id]);
  const hasInterns = batch.interns.total > 0;
  return (
    <article
      aria-labelledby={`batch-${batch.id}`}
      className="flex w-full flex-col border border-border bg-background"
    >
      <div className="flex flex-col gap-3 px-5 pt-5 pb-4">
        <div className="flex items-center justify-between gap-3">
          <StatusBadge type={badge.type}>{badge.label}</StatusBadge>
          <span className="text-[13px] text-muted-foreground">{batchDates(batch, status)}</span>
        </div>
        <h2 id={`batch-${batch.id}`} className="text-xl leading-7 font-semibold tracking-[-0.3px]">
          {batch.name}
        </h2>
        <dl className="flex gap-7">
          {hasInterns ? <Stat label="Interns" value={batch.interns.total} /> : null}
          <Stat label="Mentors" value={batch.mentorCount} />
          {hasInterns ? (
            <>
              <Stat label="On notice" value={batch.interns.onNotice} />
              <Stat label="Terminated" value={batch.interns.terminated} />
            </>
          ) : null}
        </dl>
        {hasInterns ? (
          <ColourBar colours={batch.interns.colours} />
        ) : (
          <p className="text-[13px] text-muted-foreground">No interns yet.</p>
        )}
      </div>
      <div className="mt-auto flex items-center justify-between gap-3 border-t border-border px-5 py-3">
        <AvatarStack label="Mentors" people={batch.mentors} />
        <Link
          to="/batches/$batchId"
          params={params}
          aria-label={`View ${batch.name}`}
          className={`ml-auto ${buttonClasses({ variant: 'ghost', size: 'sm' })}`}
        >
          View batch
          <ArrowRight aria-hidden size={16} strokeWidth={2} />
        </Link>
      </div>
    </article>
  );
};
