import type { MentorCandidate } from '@feedback-portal/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { mentorCandidatesQuery, setMentors, showUpdatedBatch } from '../api/batches.ts';
import { isApiError } from '../api/errors.ts';
import { Avatar } from '../ui/avatar.tsx';
import { Button } from '../ui/button.tsx';
import { Callout } from '../ui/callout.tsx';
import { CheckboxMark } from '../ui/checkbox.tsx';
import { Dialog } from '../ui/dialog.tsx';
import { SearchInput } from '../ui/search-input.tsx';
import { StatusBadge } from '../ui/status-badge.tsx';
import { today } from './batch-dates.ts';
import { mentorLoad } from './mentor-load.ts';

const collator = new Intl.Collator(undefined, { sensitivity: 'base' });

/** The batch's mentors first, then the others, each by name. Fixed while the dialog is open. */
const inDialogOrder = (candidates: readonly MentorCandidate[]) =>
  candidates.toSorted(
    (a, b) => Number(b.isAssigned) - Number(a.isAssigned) || collator.compare(a.name, b.name),
  );

const matches = (candidate: MentorCandidate, search: string) => {
  const term = search.trim().toLowerCase();
  return (
    term === '' ||
    candidate.name.toLowerCase().includes(term) ||
    candidate.email.toLowerCase().includes(term)
  );
};

const sameSet = (a: ReadonlySet<string>, b: ReadonlySet<string>) =>
  a.size === b.size && [...a].every((id) => b.has(id));

type FormProps = Readonly<{
  batchId: string;
  candidates: readonly MentorCandidate[];
  onClose: () => void;
}>;

const AssignMentorsForm = ({ batchId, candidates, onClose }: FormProps) => {
  const queryClient = useQueryClient();
  const ordered = useMemo(() => inDialogOrder(candidates), [candidates]);
  const initial = useMemo(
    () => new Set(candidates.filter((c) => c.isAssigned).map((c) => c.id)),
    [candidates],
  );
  const [selected, setSelected] = useState<ReadonlySet<string>>(initial);
  const [search, setSearch] = useState('');
  const todayIso = today();
  const save = useMutation({
    mutationFn: () =>
      setMentors(
        batchId,
        ordered.filter((candidate) => selected.has(candidate.id)).map((candidate) => candidate.id),
      ),
    onSuccess: async (batch) => {
      await showUpdatedBatch(queryClient, batch);
      onClose();
    },
  });
  const toggle = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  };
  const shown = ordered.filter((candidate) => matches(candidate, search));
  const unchanged = sameSet(selected, initial);

  return (
    <div className="flex flex-col gap-3">
      <SearchInput
        label="Search mentors"
        placeholder="Search mentors"
        value={search}
        onChange={setSearch}
        className="w-full"
      />
      <ul aria-label="Mentors" className="max-h-[360px] overflow-y-auto border border-border">
        {shown.map((candidate) => (
          <li key={candidate.id} className="border-b border-border last:border-b-0">
            <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5">
              <input
                type="checkbox"
                className="peer sr-only"
                checked={selected.has(candidate.id)}
                aria-label={candidate.name}
                aria-describedby={`mentor-load-${candidate.id}`}
                onChange={() => toggle(candidate.id)}
              />
              <CheckboxMark />
              <Avatar name={candidate.name} src={candidate.avatarUrl} size="sm" />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-sm font-medium">{candidate.name}</span>
                  {candidate.isActive ? null : <StatusBadge>Inactive</StatusBadge>}
                </span>
                <span className="truncate text-xs text-muted-foreground">{candidate.email}</span>
              </span>
              <span
                id={`mentor-load-${candidate.id}`}
                className="shrink-0 text-xs text-muted-foreground"
              >
                {mentorLoad(candidate.otherBatches, todayIso)}
              </span>
            </label>
          </li>
        ))}
        {shown.length === 0 ? (
          <li className="px-3 py-2.5 text-sm text-muted-foreground">
            {candidates.length === 0 ? 'No one has the Mentor role yet.' : 'No mentors match.'}
          </li>
        ) : null}
      </ul>
      {save.error ? (
        <div role="alert">
          <Callout type="issue" title="We couldn't save the mentors">
            {isApiError(save.error) ? save.error.detail : undefined}
          </Callout>
        </div>
      ) : null}
      <div className="flex items-center justify-between gap-2 border-t border-border pt-4">
        <span className="text-[13px] text-muted-foreground">{selected.size} selected</span>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={unchanged || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? 'Saving…' : 'Save mentors'}
          </Button>
        </div>
      </div>
    </div>
  );
};

/** Loads the candidates fresh each time the dialog opens, then shows the form. */
const AssignMentorsContent = ({
  batchId,
  onClose,
}: Readonly<{ batchId: string; onClose: () => void }>) => {
  const { data, error } = useQuery({ ...mentorCandidatesQuery(batchId), staleTime: 0 });
  if (error) {
    return (
      <Callout type="issue" title="We couldn't load the mentors">
        {isApiError(error) ? error.detail : undefined}
      </Callout>
    );
  }
  return data ? <AssignMentorsForm batchId={batchId} candidates={data} onClose={onClose} /> : null;
};

type AssignMentorsDialogProps = Readonly<{ batchId: string; open: boolean; onClose: () => void }>;

/** A11 · Assign mentors, for the batch's managers: tick the batch's whole mentor set. */
export const AssignMentorsDialog = ({ batchId, open, onClose }: AssignMentorsDialogProps) => (
  <Dialog
    open={open}
    onClose={onClose}
    title="Assign mentors"
    description="Mentors see only the batches they are assigned to."
    widthClass="max-w-[560px]"
  >
    <AssignMentorsContent batchId={batchId} onClose={onClose} />
  </Dialog>
);
