import type { CommentView } from '@feedback-portal/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { commentsQuery, deleteComment, editComment } from '../../api/comments.ts';
import { isApiError } from '../../api/errors.ts';
import { formatDay } from '../../batches/batch-dates.ts';
import { Button } from '../../ui/button.tsx';
import { Callout } from '../../ui/callout.tsx';
import { Dialog } from '../../ui/dialog.tsx';
import { CommentForm } from './comment-form.tsx';
import type { InternRef } from './comment-row.tsx';

/** What a comment is on, as its link reads ("Vikram Shetty’s feedback (22 Oct)"). */
export type CommentTarget = Readonly<{ label: string; href: string }>;

const useRefreshComments = ({ batchId, internId }: InternRef) => {
  const queryClient = useQueryClient();
  return () =>
    queryClient.invalidateQueries({
      queryKey: commentsQuery(batchId, internId).queryKey,
      exact: true,
    });
};

type CommentEntryProps = Readonly<{
  intern: InternRef;
  comment: CommentView;
  /** `null` when what it's on isn't loaded (its conversations failed). */
  on: CommentTarget | null;
  /** The author's Edit and Delete, while they can still comment here (10.5 decision 3). */
  onDelete: (() => void) | undefined;
}>;

/**
 * v2 P6's comment entry: "<author> commented on <link> · 23 Oct 2026 · edited", the text (plain,
 * line breaks kept) or "This comment was deleted.", and the author's Edit and Delete. Edit puts
 * the text in an Input in place (decision 4).
 */
export const CommentEntry = ({ intern, comment, on, onDelete }: CommentEntryProps) => {
  const [editing, setEditing] = useState(false);
  const refresh = useRefreshComments(intern);
  const mutation = useMutation({
    mutationFn: (body: string) =>
      editComment(intern.batchId, intern.internId, comment.id, { body }),
    onSuccess: async () => {
      await refresh();
      setEditing(false);
    },
  });
  const deleted = comment.deletedAt !== null;
  return (
    <article
      aria-label={`Comment from ${comment.author.name}`}
      className="flex flex-col gap-1 pt-[5px]"
    >
      <p className="text-sm">
        <span className="font-semibold">{comment.author.name}</span>
        <span className="text-muted-foreground">
          {' commented on '}
          {on ? (
            <a href={on.href} className="text-primary underline-offset-2 hover:underline">
              {on.label}
            </a>
          ) : (
            'an entry'
          )}
          {` · ${formatDay(comment.createdAt)}${comment.editedAt && !deleted ? ' · edited' : ''}`}
        </span>
      </p>
      {deleted ? (
        <p className="text-sm leading-[21px] text-muted-foreground italic">
          This comment was deleted.
        </p>
      ) : null}
      {!deleted && editing ? (
        <CommentForm
          id={`comment-${comment.id}`}
          label="Edit comment"
          initial={comment.body}
          mode="edit"
          pending={mutation.isPending}
          error={mutation.error}
          onSave={async (body) => {
            // An unchanged text is left alone, so it isn't marked edited.
            if (body === comment.body) setEditing(false);
            else await mutation.mutateAsync(body);
          }}
          onCancel={() => {
            mutation.reset();
            setEditing(false);
          }}
        />
      ) : null}
      {!deleted && !editing ? (
        <p className="text-sm leading-[21px] whitespace-pre-wrap">{comment.body}</p>
      ) : null}
      {!deleted && !editing && onDelete ? (
        <div className="-ml-2.5 flex gap-1">
          <Button variant="ghost-muted" size="sm" onClick={() => setEditing(true)}>
            Edit
          </Button>
          <Button variant="ghost-muted" size="sm" onClick={onDelete}>
            Delete
          </Button>
        </div>
      ) : null}
    </article>
  );
};

type ConfirmProps = Readonly<{ intern: InternRef; comment: CommentView; onClose: () => void }>;

const ConfirmDelete = ({ intern, comment, onClose }: ConfirmProps) => {
  const refresh = useRefreshComments(intern);
  const mutation = useMutation({
    mutationFn: () => deleteComment(intern.batchId, intern.internId, comment.id),
    onSuccess: async () => {
      await refresh();
      onClose();
    },
  });
  return (
    <div className="flex flex-col gap-4">
      {mutation.error ? (
        <Callout type="issue" title="We couldn't delete the comment">
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
          {mutation.isPending ? 'Deleting…' : 'Delete'}
        </Button>
      </div>
    </div>
  );
};

type DeleteCommentDialogProps = Readonly<{
  intern: InternRef;
  /** The comment to delete; `null` while closed. */
  comment: CommentView | null;
  onClose: () => void;
}>;

/** Delete this comment? (10.5 decision 4, as A26 asks before discarding a draft.) */
export const DeleteCommentDialog = ({ intern, comment, onClose }: DeleteCommentDialogProps) => (
  <Dialog
    open={comment !== null}
    onClose={onClose}
    title="Delete this comment?"
    description="It will show as “This comment was deleted.” to everyone in the batch."
  >
    {comment ? <ConfirmDelete intern={intern} comment={comment} onClose={onClose} /> : null}
  </Dialog>
);
