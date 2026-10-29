import type { BatchMemberView } from '@feedback-portal/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getRouteApi } from '@tanstack/react-router';
import { Download, Plus, Users } from 'lucide-react';
import { useState } from 'react';
import { batchQuery, showUpdatedBatch, unassignMentor } from '../api/batches.ts';
import { isApiError } from '../api/errors.ts';
import { AssignMentorsDialog } from '../batches/assign-mentors-dialog.tsx';
import { OverviewPanel } from '../batches/overview/overview-panel.tsx';
import { today } from '../batches/batch-dates.ts';
import { batchDates, batchStatus, statusBadges } from '../batches/batch-status.ts';
import { canManageBatch } from '../batches/can-manage.ts';
import { isAdmin } from '../identity/roles.ts';
import { hasPastMembers, MentorsTable, PastMembersTable } from '../batches/members-table.tsx';
import { AddInternDialog } from '../interns/add-intern-dialog.tsx';
import { ImportDialog } from '../interns/import-dialog.tsx';
import { RosterPanel, type RosterState } from '../interns/roster-panel.tsx';
import { useMe } from '../shell/use-me.ts';
import { Button } from '../ui/button.tsx';
import { Callout } from '../ui/callout.tsx';
import { PageTitle } from '../ui/page-title.tsx';
import { StatusBadge } from '../ui/status-badge.tsx';
import { type TabItem, tabId, Tabs } from '../ui/tabs.tsx';

const route = getRouteApi('/app/batches/$batchId/');

/** A5's section heading: 18px/600, -0.2px. */
const SectionTitle = ({ id, children }: Readonly<{ id: string; children: string }>) => (
  <h2 id={id} className="text-lg font-semibold tracking-[-0.2px]">
    {children}
  </h2>
);

type Tab = 'overview' | 'interns' | 'mentors';

const panelId = 'batch-panel';

/** v2 lists Overview first, for the batch's managers only (11.1); Interns stays the default (decision 1). */
const tabItems = (internCount: number, mentorCount: number, overview: boolean): TabItem<Tab>[] => [
  ...(overview ? [{ value: 'overview' as const, label: 'Overview' }] : []),
  { value: 'interns', label: 'Interns', count: internCount },
  { value: 'mentors', label: 'Mentors', count: mentorCount },
];

/**
 * A2 / A3 / M2 / A4 / A24 · a batch: the header, then for its managers the Overview tab (11.1),
 * the Interns tab (the roster, 7.4) and the Mentors tab (its current mentors and past members).
 * Its managers (admins and its PM) get Add intern (7.3), Import from Airtable (8.5), Assign
 * mentors and Remove (6.6). v2's other tabs come with their tasks.
 */
export const BatchPage = () => {
  const { batchId } = route.useParams();
  const { tab: asked = 'interns', view = 'cards', filter = 'all', q = '' } = route.useSearch();
  const navigate = route.useNavigate();
  const me = useMe();
  const queryClient = useQueryClient();
  const { data: batch, error } = useQuery(batchQuery(batchId));
  const [assigning, setAssigning] = useState(false);
  const [addingIntern, setAddingIntern] = useState(false);
  const [importing, setImporting] = useState(false);
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

  const setSearch = (next: Partial<RosterState> & Readonly<{ tab?: Tab }>) => {
    // Defaults are left out of the URL; `replace` so typing a search doesn't fill the history.
    void navigate({
      search: (prev) => ({
        ...prev,
        ...next,
        ...('tab' in next ? { tab: next.tab === 'interns' ? undefined : next.tab } : {}),
        ...('view' in next ? { view: next.view === 'cards' ? undefined : next.view } : {}),
        ...('filter' in next ? { filter: next.filter === 'all' ? undefined : next.filter } : {}),
        ...('q' in next ? { q: next.q ? next.q : undefined } : {}),
      }),
      replace: 'q' in next,
    });
  };
  const status = batchStatus(batch, today());
  const badge = statusBadges[status];
  const manages = me ? canManageBatch(me, batch) : false;
  // The Overview is for the batch's admins and PM, archived or not (it only reads); mentors don't
  // get it, and a link to it opens the roster instead.
  const seesOverview = me ? isAdmin(me) || batch.programManager.id === me.id : false;
  const tab: Tab = asked === 'overview' && !seesOverview ? 'interns' : asked;
  // Record conversation is the batch's current PM's (10.2), not in an archived batch.
  const canRecord = me?.id === batch.programManager.id && !batch.isArchived;

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
            <Button variant="outline" onClick={() => setImporting(true)}>
              <Download aria-hidden size={16} strokeWidth={2} />
              Import from Airtable
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
          <ImportDialog
            batchId={batch.id}
            batchName={batch.name}
            open={importing}
            onClose={() => setImporting(false)}
          />
          <AssignMentorsDialog
            batchId={batch.id}
            open={assigning}
            onClose={() => setAssigning(false)}
          />
        </>
      ) : null}
      <Tabs
        label="Batch"
        items={tabItems(batch.interns.total, batch.mentorCount, seesOverview)}
        value={tab}
        controls={panelId}
        onChange={(next) => setSearch({ tab: next })}
      />
      <div
        id={panelId}
        role="tabpanel"
        aria-labelledby={tabId(panelId, tab)}
        className="flex flex-col gap-6"
      >
        {tab === 'overview' ? <OverviewPanel batch={batch} canRecord={canRecord} /> : null}
        {tab === 'interns' ? (
          <RosterPanel
            batch={batch}
            view={view}
            filter={filter}
            q={q}
            onStateChange={setSearch}
            onAddIntern={manages ? () => setAddingIntern(true) : undefined}
            onImport={manages ? () => setImporting(true) : undefined}
          />
        ) : null}
        {tab === 'mentors' ? (
          <>
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
        ) : null}
      </div>
    </>
  );
};
