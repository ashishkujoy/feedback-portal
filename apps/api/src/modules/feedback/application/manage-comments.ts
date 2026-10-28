import { notFound } from '../../../shared/errors/app-error.ts';
import type { BatchAccessGrant } from '../../intern/application/batch-access.ts';
import {
  addComment as add,
  deleteComment as remove,
  editComment as edit,
  type Membership,
  type ParentEntry,
} from '../domain/comment.ts';
import { type CommentId, newCommentId } from '../domain/comment-id.ts';
import type { ConversationId } from '../domain/conversation-id.ts';
import type { FeedbackId } from '../domain/feedback-id.ts';
import type { CommentEntryView } from './comment-queries.ts';
import type { FeedbackScope } from './feedback-admin.ts';
import {
  ensureCanSee,
  type InternTarget,
  internIn,
  type ManageFeedbackDeps,
} from './manage-feedback.ts';

/** What a new comment goes on, as the path names it. */
export type CommentOn =
  | Readonly<{ kind: 'feedback'; id: FeedbackId }>
  | Readonly<{ kind: 'conversation'; id: ConversationId }>;

type CommentTarget = InternTarget & Readonly<{ commentId: CommentId }>;

const membershipOf = (access: BatchAccessGrant): Membership => ({
  isMember: access.isMember,
  isArchived: access.isArchived,
});

const viewOf = async ({ commentQueries }: FeedbackScope, id: string): Promise<CommentEntryView> => {
  const view = await commentQueries.view(id);
  if (!view) throw new Error('Saved comment could not be read back');
  return view;
};

/** The parent on this intern that the actor may see: someone else's draft is a 404. */
const parentFor = async (
  scope: FeedbackScope,
  { actor, internId }: InternTarget,
  on: CommentOn,
): Promise<ParentEntry> => {
  if (on.kind === 'conversation') {
    const conversation = await scope.conversations.findById(on.id);
    if (!conversation || conversation.internId !== internId) {
      throw notFound('Conversation not found');
    }
    return { kind: 'conversation', conversation };
  }
  const feedback = await scope.feedback.findById(on.id);
  if (
    !feedback ||
    feedback.internId !== internId ||
    (feedback.state === 'draft' && feedback.authorId !== actor.id)
  ) {
    throw notFound('Feedback not found');
  }
  return { kind: 'feedback', feedback };
};

/** Every comment on the intern's feedback and conversations, for anyone who can see the batch. */
export const listComments = (
  { transaction }: ManageFeedbackDeps,
  target: InternTarget,
): Promise<readonly CommentEntryView[]> =>
  transaction(async (scope) => {
    await ensureCanSee(scope, target.actor, target.batchId);
    await internIn(scope, target, false);
    return scope.commentQueries.listForIntern(target.internId);
  });

/** A member of the batch comments on submitted feedback or a conversation (10.4). */
export const addComment = (
  { transaction, now }: ManageFeedbackDeps,
  { on, body, ...target }: InternTarget & Readonly<{ on: CommentOn; body: string }>,
): Promise<CommentEntryView> =>
  transaction(async (scope) => {
    const access = await ensureCanSee(scope, target.actor, target.batchId);
    const intern = await internIn(scope, target, false);
    const comment = add({
      id: newCommentId(),
      on: await parentFor(scope, target, on),
      intern,
      actor: target.actor.id,
      batch: membershipOf(access),
      body,
      now: now(),
    });
    await scope.comments.save(comment);
    return viewOf(scope, comment.id);
  });

/**
 * The comment on this intern, locked, so an edit racing a delete waits for it and then finds it
 * deleted (a 409) rather than writing to it.
 */
const lockedComment = async (scope: FeedbackScope, { commentId, internId }: CommentTarget) => {
  const found = await scope.comments.findByIdForUpdate(commentId);
  if (!found || found.internId !== internId) throw notFound('Comment not found');
  return found.comment;
};

/** Its author changes a comment's body (decision 1). */
export const editComment = (
  { transaction, now }: ManageFeedbackDeps,
  { body, ...target }: CommentTarget & Readonly<{ body: string }>,
): Promise<CommentEntryView> =>
  transaction(async (scope) => {
    const access = await ensureCanSee(scope, target.actor, target.batchId);
    const intern = await internIn(scope, target, false);
    const comment = await lockedComment(scope, target);
    const edited = edit(comment, {
      intern,
      actor: target.actor.id,
      batch: membershipOf(access),
      body,
      now: now(),
    });
    if (edited !== comment) await scope.comments.save(edited);
    return viewOf(scope, comment.id);
  });

/** Its author deletes a comment: the body is cleared and the row stays (decisions 1 and 4). */
export const deleteComment = (
  { transaction, now }: ManageFeedbackDeps,
  target: CommentTarget,
): Promise<void> =>
  transaction(async (scope) => {
    const access = await ensureCanSee(scope, target.actor, target.batchId);
    const intern = await internIn(scope, target, false);
    const comment = await lockedComment(scope, target);
    const deleted = remove(comment, {
      intern,
      actor: target.actor.id,
      batch: membershipOf(access),
      now: now(),
    });
    if (deleted !== comment) await scope.comments.save(deleted);
  });
