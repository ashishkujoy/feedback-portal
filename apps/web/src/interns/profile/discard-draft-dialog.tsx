import type { FeedbackView, InternDetail } from '@feedback-portal/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { isApiError } from '../../api/errors.ts';
import { discardFeedback, feedbackQuery } from '../../api/feedback.ts';
import { pendingQuery } from '../../api/pending.ts';
import { Button } from '../../ui/button.tsx';
import { Callout } from '../../ui/callout.tsx';
import { Dialog } from '../../ui/dialog.tsx';
import { monthLabel } from '../feedback-form.ts';

type ConfirmProps = Readonly<{ intern: InternDetail; draft: FeedbackView; onClose: () => void }>;

const ConfirmDiscard = ({ intern, draft, onClose }: ConfirmProps) => {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => discardFeedback(intern.batchId, intern.id, draft.id),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: feedbackQuery(intern.batchId, intern.id).queryKey,
          exact: true,
        }),
        // My pending's Drafts (11.2).
        queryClient.invalidateQueries({ queryKey: pendingQuery.queryKey, exact: true }),
      ]);
      onClose();
    },
  });
  return (
    <div className="flex flex-col gap-4">
      {mutation.error ? (
        <Callout type="issue" title="We couldn't discard the draft">
          {isApiError(mutation.error) ? mutation.error.detail : undefined}
        </Callout>
      ) : null}
      <div className="flex justify-end gap-2 pt-1">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="destructive"
          disabled={mutation.isPending}
          // Errors are shown from `mutation.error`.
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending ? 'Discarding…' : 'Discard draft'}
        </Button>
      </div>
    </div>
  );
};

type DiscardDraftDialogProps = Readonly<{
  intern: InternDetail;
  /** The draft to discard; `null` while closed. */
  draft: FeedbackView | null;
  onClose: () => void;
}>;

/** A26 · Discard this draft? (9.6). Only drafts can be deleted; the API refuses anything else. */
export const DiscardDraftDialog = ({ intern, draft, onClose }: DiscardDraftDialogProps) => (
  <Dialog
    open={draft !== null}
    onClose={onClose}
    title="Discard this draft?"
    description={
      draft
        ? `Your draft feedback for ${intern.name} (${monthLabel(draft.period)}) is deleted. Only you could see it.`
        : undefined
    }
  >
    {draft ? <ConfirmDiscard intern={intern} draft={draft} onClose={onClose} /> : null}
  </Dialog>
);
