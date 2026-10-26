import { notFound } from '../../../shared/errors/app-error.ts';
import type { BatchAccessGrant } from '../../intern/application/batch-access.ts';
import {
  type BatchRole,
  type ConversationContent,
  editConversation as edit,
  recordConversation as record,
} from '../domain/conversation.ts';
import { type ConversationId, newConversationId } from '../domain/conversation-id.ts';
import type { FeedbackId } from '../domain/feedback-id.ts';
import type { ConversationEntryView } from './conversation-queries.ts';
import type { FeedbackScope } from './feedback-admin.ts';
import {
  ensureCanSee,
  type InternTarget,
  internIn,
  type ManageFeedbackDeps,
} from './manage-feedback.ts';

const roleOf = (access: BatchAccessGrant): BatchRole => ({
  isProgramManager: access.isProgramManager,
  isArchived: access.isArchived,
});

const viewOf = async (
  { conversationQueries }: FeedbackScope,
  id: string,
): Promise<ConversationEntryView> => {
  const view = await conversationQueries.view(id);
  if (!view) throw new Error('Saved conversation could not be read back');
  return view;
};

/** The intern's conversations, for anyone who can see the batch. */
export const listConversations = (
  { transaction }: ManageFeedbackDeps,
  target: InternTarget,
): Promise<readonly ConversationEntryView[]> =>
  transaction(async (scope) => {
    await ensureCanSee(scope, target.actor, target.batchId);
    await internIn(scope, target, false);
    return scope.conversationQueries.listForIntern(target.internId);
  });

/**
 * The batch's PM records the conversation that delivers one submitted feedback (10.2). The
 * feedback row is locked, so two attempts can't both deliver it: the second finds it delivered.
 * The conversation is saved first, as the feedback then points at it.
 */
export const recordConversation = (
  { transaction, now }: ManageFeedbackDeps,
  {
    feedbackId,
    content,
    ...target
  }: InternTarget & Readonly<{ feedbackId: FeedbackId; content: ConversationContent }>,
): Promise<ConversationEntryView> =>
  transaction(async (scope) => {
    const access = await ensureCanSee(scope, target.actor, target.batchId);
    const intern = await internIn(scope, target, false);
    const feedback = await scope.feedback.findByIdForUpdate(feedbackId);
    // Someone else's draft is a 404, as everywhere else.
    if (
      !feedback ||
      feedback.internId !== intern.id ||
      (feedback.state === 'draft' && feedback.authorId !== target.actor.id)
    ) {
      throw notFound('Feedback not found');
    }
    const recorded = record({
      id: newConversationId(),
      feedback,
      intern,
      actor: target.actor.id,
      batch: roleOf(access),
      content,
      now: now(),
    });
    await scope.conversations.save(recorded.conversation);
    await scope.feedback.save(recorded.feedback);
    return viewOf(scope, recorded.conversation.id);
  });

/** The batch's current PM changes a conversation's notes and date (10.2 decision 3). */
export const editConversation = (
  { transaction, now }: ManageFeedbackDeps,
  {
    conversationId,
    content,
    ...target
  }: InternTarget & Readonly<{ conversationId: ConversationId; content: ConversationContent }>,
): Promise<ConversationEntryView> =>
  transaction(async (scope) => {
    const access = await ensureCanSee(scope, target.actor, target.batchId);
    const intern = await internIn(scope, target, false);
    const conversation = await scope.conversations.findById(conversationId);
    const current = await scope.conversationQueries.view(conversationId);
    if (!conversation || !current || conversation.internId !== intern.id) {
      throw notFound('Conversation not found');
    }
    const edited = edit(conversation, {
      intern,
      batch: roleOf(access),
      delivered: { submittedAt: current.feedback.submittedAt },
      content,
      now: now(),
    });
    if (edited !== conversation) await scope.conversations.save(edited);
    return viewOf(scope, conversation.id);
  });
