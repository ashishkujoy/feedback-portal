import type { BatchSummary, MeResponse } from '@feedback-portal/contracts';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { batchesQuery } from '../api/batches.ts';
import { isApiError } from '../api/errors.ts';
import { today as todayIso } from '../batches/batch-dates.ts';
import { BatchCard } from '../batches/batch-card.tsx';
import { batchStatus, inListOrder } from '../batches/batch-status.ts';
import { CreateBatchDialog } from '../batches/create-batch-dialog.tsx';
import { batchesLabel, isAdmin, primaryRole } from '../identity/roles.ts';
import { useMe } from '../shell/use-me.ts';
import { Button } from '../ui/button.tsx';
import { Callout } from '../ui/callout.tsx';
import { PageTitle } from '../ui/page-title.tsx';

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** "4 batches · 1 active, 1 upcoming", or for a mentor "2 batches assigned to you". */
const subtitle = (me: MeResponse, batches: readonly BatchSummary[], today: string) => {
  const total = plural(batches.length, 'batch', 'batches');
  if (primaryRole(me.roles) === 'mentor') return `${total} assigned to you`;
  const statuses = batches.map((batch) => batchStatus(batch, today));
  const active = statuses.filter((status) => status === 'active').length;
  const upcoming = statuses.filter((status) => status === 'upcoming').length;
  return `${total} · ${active} active, ${upcoming} upcoming`;
};

/** A1 / P1 / M1 · Batches: the batches the user can see (6.4); admins can create one. */
export const BatchesPage = () => {
  const me = useMe();
  const { data: batches, error } = useQuery(batchesQuery);
  const [creating, setCreating] = useState(false);
  const today = todayIso();
  const canCreate = me ? isAdmin(me) : false;

  return (
    <>
      <div className="flex items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <PageTitle>{me ? batchesLabel(me) : 'Batches'}</PageTitle>
          {me && batches ? (
            <p className="text-sm text-muted-foreground">{subtitle(me, batches, today)}</p>
          ) : null}
        </div>
        {canCreate ? (
          <Button onClick={() => setCreating(true)}>
            <Plus aria-hidden size={16} strokeWidth={2} />
            Create batch
          </Button>
        ) : null}
      </div>
      {canCreate ? <CreateBatchDialog open={creating} onClose={() => setCreating(false)} /> : null}
      {error ? (
        <Callout type="issue" title="We couldn't load batches">
          {isApiError(error) ? error.detail : undefined}
        </Callout>
      ) : null}
      {batches?.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {canCreate ? 'No batches yet.' : "You aren't assigned to any batches yet."}
        </p>
      ) : null}
      {batches && batches.length > 0 ? (
        <ul aria-label={me ? batchesLabel(me) : 'Batches'} className="grid grid-cols-2 gap-5">
          {inListOrder(batches, today).map((batch) => (
            <li key={batch.id} className="flex">
              <BatchCard batch={batch} today={today} />
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
};
