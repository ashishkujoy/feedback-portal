import type { CommentParent } from '@feedback-portal/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';
import { addComment, commentsQuery } from '../../api/comments.ts';
import { Button } from '../../ui/button.tsx';
import { CommentForm } from './comment-form.tsx';
import { commentNote } from './feedback-entry.ts';

/** The intern whose timeline this is. */
export type InternRef = Readonly<{ batchId: string; internId: string }>;

type CommentRowProps = Readonly<{
  intern: InternRef;
  /** What it's on, as primitives so the card doesn't build a new object on every render. */
  parentKind: CommentParent['kind'];
  parentId: string;
  count: number;
  /** Absent when the viewer can't comment here (10.5 decision 3). */
  canComment: boolean;
  /** Padding to line up with the card it closes. */
  className: string;
  /** The card's own buttons (Edit, Record conversation), first in the row. */
  children?: ReactNode;
}>;

/**
 * v2 P6's comment row at the foot of a card: the card's own buttons, **Comment** (ghost, sm) and
 * the count; Comment opens the composer, "Add a comment" and a secondary **Comment**. Posting
 * closes it.
 */
export const CommentRow = ({
  intern,
  parentKind,
  parentId,
  count,
  canComment,
  className,
  children,
}: CommentRowProps) => {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (body: string) =>
      addComment(intern.batchId, intern.internId, { kind: parentKind, id: parentId }, { body }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: commentsQuery(intern.batchId, intern.internId).queryKey,
        exact: true,
      });
      setOpen(false);
    },
  });
  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <div className="flex flex-wrap items-center gap-2">
        {children}
        {canComment ? (
          <Button
            variant="ghost"
            size="sm"
            aria-expanded={open}
            onClick={() => {
              mutation.reset();
              setOpen(!open);
            }}
          >
            Comment
          </Button>
        ) : null}
        <span className="text-xs text-muted-foreground">{commentNote(count)}</span>
      </div>
      {open ? (
        <CommentForm
          id={`comment-on-${parentId}`}
          label="Add a comment"
          initial=""
          mode="compose"
          pending={mutation.isPending}
          error={mutation.error}
          onSave={(body) => mutation.mutateAsync(body)}
          onCancel={() => setOpen(false)}
        />
      ) : null}
    </div>
  );
};
