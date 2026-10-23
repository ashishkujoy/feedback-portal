import { useQuery } from '@tanstack/react-query';
import { getRouteApi } from '@tanstack/react-router';
import { batchQuery } from '../api/batches.ts';
import { isApiError } from '../api/errors.ts';
import { today } from '../batches/batch-dates.ts';
import { batchDates, batchStatus, statusBadges } from '../batches/batch-status.ts';
import { hasPastMembers, MentorsTable, PastMembersTable } from '../batches/members-table.tsx';
import { Callout } from '../ui/callout.tsx';
import { PageTitle } from '../ui/page-title.tsx';
import { StatusBadge } from '../ui/status-badge.tsx';

const route = getRouteApi('/app/batches/$batchId');

/** A5's section heading: 18px/600, -0.2px. */
const SectionTitle = ({ id, children }: Readonly<{ id: string; children: string }>) => (
  <h2 id={id} className="text-lg font-semibold tracking-[-0.2px]">
    {children}
  </h2>
);

/**
 * A2 / P2 / M2 · a batch, before interns exist (6.5 decision 2): the header, its current mentors
 * and its past members. Tabs, the summary strip and the managers' buttons come later.
 */
export const BatchPage = () => {
  const { batchId } = route.useParams();
  const { data: batch, error } = useQuery(batchQuery(batchId));

  if (error) {
    return (
      <Callout type="issue" title="We couldn't load this batch">
        {isApiError(error) ? error.detail : undefined}
      </Callout>
    );
  }
  if (!batch) return null;

  const status = batchStatus(batch, today());
  const badge = statusBadges[status];

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-3">
          <PageTitle>{batch.name}</PageTitle>
          <StatusBadge type={badge.type}>{badge.label}</StatusBadge>
        </div>
        <p className="text-sm text-muted-foreground">
          {batchDates(batch, status)} · Programme manager: {batch.programManager.name}
        </p>
      </div>
      <section aria-labelledby="batch-mentors" className="flex flex-col gap-3">
        <SectionTitle id="batch-mentors">Mentors</SectionTitle>
        <MentorsTable members={batch.members} />
      </section>
      {hasPastMembers(batch.members) ? (
        <section aria-labelledby="batch-past-members" className="flex flex-col gap-3">
          <SectionTitle id="batch-past-members">Past members</SectionTitle>
          <PastMembersTable members={batch.members} />
        </section>
      ) : null}
    </>
  );
};
