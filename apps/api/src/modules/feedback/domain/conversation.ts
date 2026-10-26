import { ConversationContentRequest } from '@feedback-portal/contracts';
import { conflict, forbidden, validationFailed } from '../../../shared/errors/app-error.ts';
import { fieldIssues } from '../../../shared/errors/field-issues.ts';
import { dayLabel, utcToday } from '../../../shared/calendar-date.ts';
import type { UserId } from '../../identity/domain/user-id.ts';
import { ensureEditable, type Intern } from '../../intern/domain/intern.ts';
import type { InternId } from '../../intern/domain/intern-id.ts';
import type { ConversationId } from './conversation-id.ts';
import { deliverFeedback, type Feedback } from './feedback.ts';

/**
 * The one-on-one in which the batch's PM delivers one submitted feedback entry to the intern
 * (v2 A8). Its notes and date can be changed later by the batch's PM; the feedback it delivered
 * never changes.
 */
export type Conversation = Readonly<{
  id: ConversationId;
  internId: InternId;
  recordedBy: UserId;
  /** "Date delivered": `YYYY-MM-DD`. */
  heldOn: string;
  /** Markdown. */
  notes: string;
  createdAt: Date;
  updatedAt: Date;
  /** When the notes or date were changed after recording; `null` if never. */
  editedAt: Date | null;
}>;

/** What the PM writes: the day it was held and the notes. */
export type ConversationContent = Readonly<{ heldOn: string; notes: string }>;

/** Where the actor stands in the intern's batch, as the use case found it. */
export type BatchRole = Readonly<{ isProgramManager: boolean; isArchived: boolean }>;

/**
 * Only the batch's current PM records or changes a conversation (10.2 decision 1, as status
 * changes in 7.6); never in an archived batch or for a read-only intern (decision 4).
 */
const ensureCanRecord = (batch: BatchRole, intern: Intern, action: 'records' | 'changes') => {
  if (!batch.isProgramManager) {
    throw forbidden(`Only this batch's programme manager ${action} conversations.`);
  }
  if (batch.isArchived) throw conflict('This batch is archived', 'batch_archived');
  ensureEditable(intern);
};

/**
 * The content by the contract's rules, on a day from the feedback's submission to today, both as
 * UTC dates (decision 2; 9.3 decision 3).
 */
const parseContent = (
  content: ConversationContent,
  delivered: Pick<Feedback, 'submittedAt'>,
  now: Date,
): ConversationContent => {
  const result = ConversationContentRequest.safeParse(content);
  if (!result.success) throw validationFailed(fieldIssues(result.error));
  const earliest = delivered.submittedAt ? utcToday(delivered.submittedAt) : utcToday(now);
  const latest = utcToday(now);
  // `YYYY-MM-DD` strings sort as the days they name.
  if (result.data.heldOn < earliest || result.data.heldOn > latest) {
    throw validationFailed([
      { path: 'heldOn', message: `Choose a date from ${dayLabel(earliest)} to today.` },
    ]);
  }
  return result.data;
};

export type RecordInput = Readonly<{
  id: ConversationId;
  feedback: Feedback;
  intern: Intern;
  actor: UserId;
  batch: BatchRole;
  content: ConversationContent;
  now: Date;
}>;

/**
 * Records the conversation that delivers `feedback`: the feedback becomes delivered with this
 * conversation's id. The caller saves both in one transaction.
 */
export const recordConversation = ({
  id,
  feedback,
  intern,
  actor,
  batch,
  content,
  now,
}: RecordInput): Readonly<{ conversation: Conversation; feedback: Feedback }> => {
  ensureCanRecord(batch, intern, 'records');
  // A caller bug, not something a person can do: the use case loads the feedback's own intern.
  if (feedback.internId !== intern.id) throw new Error('Feedback and intern do not match');
  if (feedback.state === 'delivered') {
    throw conflict('This feedback has already been delivered.', 'feedback_delivered');
  }
  // Refuses a draft ("A draft can't be delivered."), before its missing date could matter.
  const delivered = deliverFeedback(feedback, { conversationId: id, now });
  const parsed = parseContent(content, feedback, now);
  return {
    conversation: {
      id,
      internId: intern.id,
      recordedBy: actor,
      ...parsed,
      createdAt: now,
      updatedAt: now,
      editedAt: null,
    },
    feedback: delivered,
  };
};

export type EditConversationInput = Readonly<{
  intern: Intern;
  batch: BatchRole;
  /** The feedback it delivered, for the earliest date. */
  delivered: Pick<Feedback, 'submittedAt'>;
  content: ConversationContent;
  now: Date;
}>;

/**
 * Changes the notes and date (10.1 decision 2), by the batch's current PM whoever recorded it
 * (10.2 decision 3). Nothing changed, nothing is marked edited.
 */
export const editConversation = (
  conversation: Conversation,
  { intern, batch, delivered, content, now }: EditConversationInput,
): Conversation => {
  ensureCanRecord(batch, intern, 'changes');
  if (conversation.internId !== intern.id) throw new Error('Conversation and intern do not match');
  const parsed = parseContent(content, delivered, now);
  if (parsed.heldOn === conversation.heldOn && parsed.notes === conversation.notes) {
    return conversation;
  }
  return { ...conversation, ...parsed, updatedAt: now, editedAt: now };
};
