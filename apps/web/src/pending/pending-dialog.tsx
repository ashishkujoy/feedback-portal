import type { FeedbackView } from '@feedback-portal/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { batchOverviewQuery } from '../api/batch-overview.ts';
import { batchQuery } from '../api/batches.ts';
import { feedbackQuery } from '../api/feedback.ts';
import { internQuery } from '../api/interns.ts';
import {
  type FeedbackTarget,
  GiveFeedbackDialog,
  newFeedback,
} from '../interns/give-feedback-dialog.tsx';
import { DiscardDraftDialog } from '../interns/profile/discard-draft-dialog.tsx';
import { RecordConversationDialog } from '../interns/profile/record-conversation-dialog.tsx';

/** What a row's button opens: A7 (new or on a draft), A26, or A8 with that feedback chosen. */
export type Opening = Readonly<{
  action: 'give' | 'continue' | 'discard' | 'record';
  batchId: string;
  internId: string;
  /** The draft, or the feedback to deliver; `null` for Give feedback. */
  feedbackId: string | null;
}>;

/**
 * Decision 5: Give feedback carries on with your draft for the intern, this month's first,
 * instead of starting a second one. The list holds only your own drafts.
 */
const giveTarget = (entries: readonly FeedbackView[], month: string): FeedbackTarget => {
  const drafts = entries.filter((entry) => entry.state === 'draft');
  const draft = drafts.find((entry) => entry.period === month) ?? drafts[0];
  return draft ? { kind: 'draft', entry: draft } : newFeedback;
};

const draftOf = (entries: readonly FeedbackView[], id: string | null): FeedbackView | undefined =>
  entries.find((entry) => entry.id === id && entry.state === 'draft');

/**
 * A row's dialog on the pending page: loads the batch, intern and their feedback, as the profile
 * has them, then opens. The dialogs refresh the pending list themselves.
 */
export const PendingDialog = ({
  opening,
  month,
  onClose,
}: Readonly<{ opening: Opening; month: string; onClose: () => void }>) => {
  const { action, batchId, internId, feedbackId } = opening;
  const queryClient = useQueryClient();
  const batch = useQuery(batchQuery(batchId));
  const intern = useQuery(internQuery(batchId, internId));
  const entries = useQuery(feedbackQuery(batchId, internId));
  const target = useMemo((): FeedbackTarget | null => {
    if (!entries.data) return null;
    if (action === 'give') return giveTarget(entries.data, month);
    const draft = draftOf(entries.data, feedbackId);
    return draft ? { kind: 'draft', entry: draft } : null;
  }, [action, entries.data, feedbackId, month]);
  const recording = useMemo(
    () => ({ kind: 'record' as const, feedbackId: feedbackId ?? '' }),
    [feedbackId],
  );
  if (!batch.data || !intern.data || !entries.data) return null;
  if (action === 'record') {
    return (
      <RecordConversationDialog
        intern={intern.data}
        batch={batch.data}
        entries={entries.data}
        target={recording}
        onClose={onClose}
        // The batch's overview lists the same feedback (11.1).
        onSaved={() =>
          queryClient.invalidateQueries({
            queryKey: batchOverviewQuery(batchId).queryKey,
            exact: true,
          })
        }
      />
    );
  }
  if (action === 'discard') {
    return (
      <DiscardDraftDialog
        intern={intern.data}
        draft={draftOf(entries.data, feedbackId) ?? null}
        onClose={onClose}
      />
    );
  }
  // A draft discarded elsewhere since the list loaded: nothing to carry on with.
  if (!target) return null;
  return (
    <GiveFeedbackDialog
      intern={intern.data}
      batch={batch.data}
      open
      onClose={onClose}
      target={target}
    />
  );
};
