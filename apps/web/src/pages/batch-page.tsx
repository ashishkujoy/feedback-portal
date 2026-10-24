import type { BatchMemberView } from '@feedback-portal/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getRouteApi } from '@tanstack/react-router';
import { Plus, Users } from 'lucide-react';
import { useState } from 'react';
import { batchQuery, showUpdatedBatch, unassignMentor } from '../api/batches.ts';
import { isApiError } from '../api/errors.ts';
import { AssignMentorsDialog } from '../batches/assign-mentors-dialog.tsx';
import { today } from '../batches/batch-dates.ts';
import { batchDates, batchStatus, statusBadges } from '../batches/batch-status.ts';
import { canManageBatch } from '../batches/can-manage.ts';
import { hasPastMembers, MentorsTable, PastMembersTable } from '../batches/members-table.tsx';
import { AddInternDialog } from '../interns/add-intern-dialog.tsx';
import { useMe } from '../shell/use-me.ts';
import { Button } from '../ui/button.tsx';
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
 * A2 / P2 / M2 · a batch, before the roster (6.5 decision 2): the header, its current mentors and
 * its past members. Its managers (admins and its PM) get Add intern (7.3), Assign mentors and
 * Remove (6.6). The roster, tabs and summary strip come with 7.4; Import with Phase 8.
 */
export const BatchPage = () => {
  const { batchId } = route.useParams();
  const me = useMe();
  const queryClient = useQueryClient();
  const { data: batch, error } = useQuery(batchQuery(batchId));
  const [assigning, setAssigning] = useState(false);
  const [addingIntern, setAddingIntern] = useState(false);
  // Remove: unassigns at once (6.6 decision 3); the mentor moves to Past members.
  const remove = useMutation({
    mutationFn: (member: BatchMemberView) => unassignMentor(batchId, member.user.id),
    onSuccess: (updated) => showUpdatedBatch(queryClient, updated),
  });

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
  const manages = me ? canManageBatch(me, batch) : false;

  return (
    <>
      <div className="flex items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-3">
            <PageTitle>{batch.name}</PageTitle>
            <StatusBadge type={badge.type}>{badge.label}</StatusBadge>
          </div>
          <p className="text-sm text-muted-foreground">
            {batchDates(batch, status)} · Programme manager: {batch.programManager.name}
          </p>
        </div>
        {manages ? (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setAddingIntern(true)}>
              <Plus aria-hidden size={16} strokeWidth={2} />
              Add intern
            </Button>
            <Button variant="outline" onClick={() => setAssigning(true)}>
              <Users aria-hidden size={16} strokeWidth={2} />
              Assign mentors
            </Button>
          </div>
        ) : null}
      </div>
      {manages ? (
        <>
          <AddInternDialog
            batchId={batch.id}
            batchName={batch.name}
            open={addingIntern}
            onClose={() => setAddingIntern(false)}
          />
          <AssignMentorsDialog
            batchId={batch.id}
            open={assigning}
            onClose={() => setAssigning(false)}
          />
        </>
      ) : null}
      <section aria-labelledby="batch-mentors" className="flex flex-col gap-3">
        <SectionTitle id="batch-mentors">Mentors</SectionTitle>
        {remove.error ? (
          <div role="alert">
            <Callout
              type="issue"
              title={`We couldn't remove ${remove.variables?.user.name ?? 'this mentor'}`}
            >
              {isApiError(remove.error) ? remove.error.detail : undefined}
            </Callout>
          </div>
        ) : null}
        <MentorsTable
          members={batch.members}
          onRemove={manages ? (member) => remove.mutate(member) : undefined}
          busy={remove.isPending}
        />
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
