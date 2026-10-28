import { CommentRequest } from '@feedback-portal/contracts';
import { conflict, forbidden, validationFailed } from '../../../shared/errors/app-error.ts';
import { fieldIssues } from '../../../shared/errors/field-issues.ts';
import type { UserId } from '../../identity/domain/user-id.ts';
import { ensureEditable, type Intern } from '../../intern/domain/intern.ts';
import type { CommentId } from './comment-id.ts';
import type { Conversation } from './conversation.ts';
import type { ConversationId } from './conversation-id.ts';
import type { Feedback } from './feedback.ts';
import type { FeedbackId } from './feedback-id.ts';

/** What a comment is on (10.1 decision 4). */
export type CommentParent =
  | Readonly<{ kind: 'feedback'; id: FeedbackId }>
  | Readonly<{ kind: 'conversation'; id: ConversationId }>;

/**
 * A plain-text comment on a feedback entry or a conversation (10.4). Deleting it clears the body
 * and keeps the row, so the thread shows "This comment was deleted." (10.1 decision 3).
 */
export type Comment = Readonly<{
  id: CommentId;
  parent: CommentParent;
  authorId: UserId;
  /** `''` once deleted. */
  body: string;
  createdAt: Date;
  updatedAt: Date;
  /** When the body was changed; `null` if never. */
  editedAt: Date | null;
  deletedAt: Date | null;
}>;

/** Where the actor stands in the intern's batch, as the use case found it. */
export type Membership = Readonly<{ isMember: boolean; isArchived: boolean }>;

/** The parent as loaded, so its state and intern can be checked. */
export type ParentEntry =
  | Readonly<{ kind: 'feedback'; feedback: Feedback }>
  | Readonly<{ kind: 'conversation'; conversation: Conversation }>;

/**
 * The batch's current mentors and PM comment (DATA_MODEL §5; admins only when assigned), never in
 * an archived batch or on a read-only intern's record (v2: "Nothing can be added or changed.").
 */
const ensureCanWrite = (batch: Membership, intern: Intern) => {
  if (!batch.isMember) {
    throw forbidden("Only this batch's mentors and programme manager comment.");
  }
  if (batch.isArchived) throw conflict('This batch is archived', 'batch_archived');
  ensureEditable(intern);
};

/** Only its author changes or deletes a comment (decision 1). */
const ensureAuthor = (comment: Comment, actor: UserId) => {
  if (comment.authorId !== actor) throw forbidden('Only its author can change a comment.');
};

const parseBody = (body: string): string => {
  const result = CommentRequest.safeParse({ body });
  if (!result.success) throw validationFailed(fieldIssues(result.error));
  return result.data.body;
};

const parentOf = (entry: ParentEntry): Readonly<{ parent: CommentParent; internId: string }> => {
  if (entry.kind === 'conversation') {
    const { id, internId } = entry.conversation;
    return { parent: { kind: 'conversation', id }, internId };
  }
  // Comments wait until feedback is shared (DATA_MODEL §4), and stay open after delivery.
  if (entry.feedback.state === 'draft') throw conflict("Drafts can't be commented on.");
  const { id, internId } = entry.feedback;
  return { parent: { kind: 'feedback', id }, internId };
};

export type AddCommentInput = Readonly<{
  id: CommentId;
  on: ParentEntry;
  intern: Intern;
  actor: UserId;
  batch: Membership;
  body: string;
  now: Date;
}>;

/** A new comment on submitted or delivered feedback, or on a conversation, of `intern`. */
export const addComment = ({
  id,
  on,
  intern,
  actor,
  batch,
  body,
  now,
}: AddCommentInput): Comment => {
  ensureCanWrite(batch, intern);
  const { parent, internId } = parentOf(on);
  // A caller bug, not something a person can do: the use case loads the parent's own intern.
  if (internId !== intern.id) throw new Error('Comment parent and intern do not match');
  return {
    id,
    parent,
    authorId: actor,
    body: parseBody(body),
    createdAt: now,
    updatedAt: now,
    editedAt: null,
    deletedAt: null,
  };
};

export type ChangeCommentInput = Readonly<{
  intern: Intern;
  actor: UserId;
  batch: Membership;
  now: Date;
}>;

/** Its author changes the body, marking it edited; nothing changed, nothing is marked. */
export const editComment = (
  comment: Comment,
  { body, ...context }: ChangeCommentInput & Readonly<{ body: string }>,
): Comment => {
  ensureCanWrite(context.batch, context.intern);
  ensureAuthor(comment, context.actor);
  if (comment.deletedAt) throw conflict('This comment was deleted.', 'comment_deleted');
  const parsed = parseBody(body);
  if (parsed === comment.body) return comment;
  return { ...comment, body: parsed, updatedAt: context.now, editedAt: context.now };
};

/**
 * Its author deletes it: the body is cleared and the row stays (10.1 decision 3). Deleting it
 * again changes nothing (decision 4).
 */
export const deleteComment = (comment: Comment, context: ChangeCommentInput): Comment => {
  ensureCanWrite(context.batch, context.intern);
  ensureAuthor(comment, context.actor);
  if (comment.deletedAt) return comment;
  return { ...comment, body: '', updatedAt: context.now, deletedAt: context.now };
};
