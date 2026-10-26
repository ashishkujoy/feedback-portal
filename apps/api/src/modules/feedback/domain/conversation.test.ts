import { describe, expect, it } from 'vitest';
import { AppError } from '../../../shared/errors/app-error.ts';
import { newBatchId } from '../../cohort/domain/batch-id.ts';
import { newUserId } from '../../identity/domain/user-id.ts';
import { giveNotice, type Intern, onboardIntern, terminate } from '../../intern/domain/intern.ts';
import { newInternId } from '../../intern/domain/intern-id.ts';
import { newStatusEventId } from '../../intern/domain/status-event-id.ts';
import {
  type BatchRole,
  type Conversation,
  type ConversationContent,
  editConversation,
  recordConversation,
} from './conversation.ts';
import { newConversationId } from './conversation-id.ts';
import { draftFeedback, type Feedback, submitFeedback } from './feedback.ts';
import { newFeedbackId } from './feedback-id.ts';

const t0 = new Date('2026-07-06T09:00:00Z');
// Submitted on 12 Oct; "today" is 24 Oct (UTC).
const submittedAt = new Date('2026-10-12T15:00:00Z');
const t1 = new Date('2026-10-24T09:00:00Z');
const t2 = new Date('2026-10-25T09:00:00Z');
const pm = newUserId();
const mentor = newUserId();

const asPm: BatchRole = { isProgramManager: true, isArchived: false };
const notPm: BatchRole = { isProgramManager: false, isArchived: false };
const archived: BatchRole = { isProgramManager: true, isArchived: true };

const errorOf = (action: () => unknown): AppError => {
  try {
    action();
  } catch (error) {
    if (error instanceof AppError) return error;
    throw error;
  }
  throw new Error('expected an AppError');
};

const newIntern = (): Intern =>
  onboardIntern({
    id: newInternId(),
    eventId: newStatusEventId(),
    batchId: newBatchId(),
    details: { username: 'ishita.rao', name: 'Ishita Rao', email: 'ishita@example.com' },
    actor: pm,
    now: t0,
  });

const range = { batchStartsOn: '2026-07-06', today: '2026-10-12' };

const draftOf = (intern: Intern): Feedback =>
  draftFeedback({
    id: newFeedbackId(),
    intern,
    author: mentor,
    content: { period: '2026-10-01', body: 'Closed `PAY-214` with tests first.', colorCode: null },
    range,
    now: submittedAt,
  });

const submittedOf = (intern: Intern): Feedback =>
  submitFeedback(draftOf(intern), {
    intern,
    actor: mentor,
    range,
    eventId: newStatusEventId(),
    now: submittedAt,
  }).feedback;

const content: ConversationContent = {
  heldOn: '2026-10-20',
  notes: 'Delivered in the weekly 1:1.\n\n- Pleased with the pairing feedback',
};

const record = (
  overrides: Partial<{
    feedback: Feedback;
    intern: Intern;
    batch: BatchRole;
    content: ConversationContent;
  }> = {},
) => {
  const intern = overrides.intern ?? newIntern();
  return recordConversation({
    id: newConversationId(),
    feedback: overrides.feedback ?? submittedOf(intern),
    intern,
    actor: pm,
    batch: overrides.batch ?? asPm,
    content: overrides.content ?? content,
    now: t1,
  });
};

const onNotice = (intern: Intern) =>
  giveNotice(intern, {
    eventId: newStatusEventId(),
    reason: 'Missed every deadline.',
    actor: pm,
    now: t0,
    startsOn: '2026-09-10',
    feedbackId: null,
  });

const terminated = (intern: Intern) =>
  terminate(onNotice(intern), {
    eventId: newStatusEventId(),
    reason: 'Notice period ended.',
    actor: pm,
    now: t0,
  });

describe('recording a conversation', () => {
  it('delivers the chosen submitted feedback, recorded by the PM', () => {
    const intern = newIntern();
    const feedback = submittedOf(intern);

    const result = record({ intern, feedback });

    expect(result.conversation).toMatchObject({
      internId: intern.id,
      recordedBy: pm,
      heldOn: '2026-10-20',
      notes: content.notes,
      createdAt: t1,
      updatedAt: t1,
      editedAt: null,
    });
    expect(result.feedback).toMatchObject({
      id: feedback.id,
      state: 'delivered',
      conversationId: result.conversation.id,
      updatedAt: t1,
    });
  });

  it("is the batch's current PM's alone, and not in an archived batch (decisions 1 and 4)", () => {
    const refused = errorOf(() => record({ batch: notPm }));
    expect([refused.kind, refused.message]).toEqual([
      'forbidden',
      "Only this batch's programme manager records conversations.",
    ]);
    expect(errorOf(() => record({ batch: archived })).code).toBe('batch_archived');
  });

  it('is refused for a read-only intern (decision 4)', () => {
    const intern = newIntern();
    const feedback = submittedOf(intern);

    expect(errorOf(() => record({ intern: terminated(intern), feedback })).code).toBe(
      'intern_read_only',
    );
  });

  it('delivers submitted feedback only: not a draft, not feedback already delivered', () => {
    const intern = newIntern();
    const once = record({ intern });

    expect(errorOf(() => record({ intern, feedback: draftOf(intern) })).message).toBe(
      "A draft can't be delivered.",
    );
    const again = errorOf(() => record({ intern, feedback: once.feedback }));
    expect([again.code, again.message]).toEqual([
      'feedback_delivered',
      'This feedback has already been delivered.',
    ]);
  });

  it("refuses another intern's feedback as a caller bug", () => {
    expect(() => record({ intern: newIntern(), feedback: submittedOf(newIntern()) })).toThrow(
      'Feedback and intern do not match',
    );
  });

  it('needs written notes, up to 20,000 characters', () => {
    expect(errorOf(() => record({ content: { ...content, notes: ' \n\t' } })).issues).toEqual([
      { path: 'notes', message: 'Write how the conversation went.' },
    ]);
    expect(
      errorOf(() => record({ content: { ...content, notes: 'x'.repeat(20_001) } })).issues,
    ).toEqual([{ path: 'notes', message: 'Notes must be at most 20000 characters' }]);
  });

  it('is dated from the day the feedback was submitted to today (decision 2)', () => {
    for (const heldOn of ['2026-10-12', '2026-10-24']) {
      expect(record({ content: { ...content, heldOn } }).conversation.heldOn).toBe(heldOn);
    }
    for (const heldOn of ['2026-10-11', '2026-10-25']) {
      expect(errorOf(() => record({ content: { ...content, heldOn } })).issues).toEqual([
        { path: 'heldOn', message: 'Choose a date from 12 Oct 2026 to today.' },
      ]);
    }
    expect(errorOf(() => record({ content: { ...content, heldOn: '20 Oct' } })).issues).toEqual([
      { path: 'heldOn', message: 'Choose the date it was delivered.' },
    ]);
  });
});

const recorded = () => {
  const intern = newIntern();
  const feedback = submittedOf(intern);
  const { conversation } = record({ intern, feedback });
  return { intern, feedback, conversation };
};

const edit = (
  conversation: Conversation,
  intern: Intern,
  change: ConversationContent,
  batch: BatchRole = asPm,
) =>
  editConversation(conversation, {
    intern,
    batch,
    delivered: { submittedAt },
    content: change,
    now: t2,
  });

describe('editing a conversation', () => {
  it('changes the notes and date, marking it edited (10.1 decision 2)', () => {
    const { intern, conversation } = recorded();

    const edited = edit(conversation, intern, { heldOn: '2026-10-21', notes: 'Rescheduled.' });

    expect(edited).toMatchObject({
      id: conversation.id,
      recordedBy: pm,
      heldOn: '2026-10-21',
      notes: 'Rescheduled.',
      createdAt: t1,
      updatedAt: t2,
      editedAt: t2,
    });
  });

  it("isn't marked edited when nothing changed", () => {
    const { intern, conversation } = recorded();

    expect(edit(conversation, intern, content)).toBe(conversation);
  });

  it("is for the batch's current PM, whoever recorded it (decision 3)", () => {
    const { intern, conversation } = recorded();

    // Someone else recorded it; the current PM can still change it.
    expect(
      edit({ ...conversation, recordedBy: newUserId() }, intern, { ...content, notes: 'Fixed.' })
        .notes,
    ).toBe('Fixed.');
    const refused = errorOf(() => edit(conversation, intern, content, notPm));
    expect([refused.kind, refused.message]).toEqual([
      'forbidden',
      "Only this batch's programme manager changes conversations.",
    ]);
  });

  it('is refused for a read-only intern or an archived batch, and keeps the date rules', () => {
    const { intern, conversation } = recorded();

    expect(errorOf(() => edit(conversation, terminated(intern), content)).code).toBe(
      'intern_read_only',
    );
    expect(errorOf(() => edit(conversation, intern, content, archived)).code).toBe(
      'batch_archived',
    );
    expect(
      errorOf(() => edit(conversation, intern, { ...content, heldOn: '2026-10-26' })).issues,
    ).toEqual([{ path: 'heldOn', message: 'Choose a date from 12 Oct 2026 to today.' }]);
  });
});
