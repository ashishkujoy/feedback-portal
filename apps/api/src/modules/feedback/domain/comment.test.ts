import { describe, expect, it } from 'vitest';
import { AppError } from '../../../shared/errors/app-error.ts';
import { newBatchId } from '../../cohort/domain/batch-id.ts';
import { newUserId } from '../../identity/domain/user-id.ts';
import { giveNotice, type Intern, onboardIntern, terminate } from '../../intern/domain/intern.ts';
import { newInternId } from '../../intern/domain/intern-id.ts';
import { newStatusEventId } from '../../intern/domain/status-event-id.ts';
import {
  addComment,
  type Comment,
  deleteComment,
  editComment,
  type Membership,
  type ParentEntry,
} from './comment.ts';
import { newCommentId } from './comment-id.ts';
import { recordConversation } from './conversation.ts';
import { newConversationId } from './conversation-id.ts';
import { draftFeedback, type Feedback, submitFeedback } from './feedback.ts';
import { newFeedbackId } from './feedback-id.ts';

const t0 = new Date('2026-07-06T09:00:00Z');
const t1 = new Date('2026-10-12T15:00:00Z');
const t2 = new Date('2026-10-24T09:00:00Z');
const t3 = new Date('2026-10-25T09:00:00Z');
const pm = newUserId();
const mentor = newUserId();
const other = newUserId();

const member: Membership = { isMember: true, isArchived: false };
const outsider: Membership = { isMember: false, isArchived: false };
const archived: Membership = { isMember: true, isArchived: true };

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
    now: t1,
  });

const submittedOf = (intern: Intern): Feedback =>
  submitFeedback(draftOf(intern), {
    intern,
    actor: mentor,
    range,
    eventId: newStatusEventId(),
    now: t1,
  }).feedback;

const delivered = (intern: Intern) =>
  recordConversation({
    id: newConversationId(),
    feedback: submittedOf(intern),
    intern,
    actor: pm,
    batch: { isProgramManager: true, isArchived: false },
    content: { heldOn: '2026-10-20', notes: 'Delivered in the weekly 1:1.' },
    now: t2,
  });

const terminated = (intern: Intern) =>
  terminate(
    giveNotice(intern, {
      eventId: newStatusEventId(),
      reason: 'Missed every deadline.',
      actor: pm,
      now: t0,
      startsOn: '2026-09-10',
      feedbackId: null,
    }),
    { eventId: newStatusEventId(), reason: 'Notice period ended.', actor: pm, now: t0 },
  );

const add = (
  overrides: Partial<{ on: ParentEntry; intern: Intern; batch: Membership; body: string }> = {},
) => {
  const intern = overrides.intern ?? newIntern();
  return addComment({
    id: newCommentId(),
    on: overrides.on ?? { kind: 'feedback', feedback: submittedOf(intern) },
    intern,
    actor: mentor,
    batch: overrides.batch ?? member,
    body: overrides.body ?? 'Agree. She also helped two others with their test setup.',
    now: t2,
  });
};

describe('adding a comment', () => {
  it('goes on submitted feedback, by a member of the batch, stored as typed', () => {
    const intern = newIntern();
    const feedback = submittedOf(intern);

    const comment = add({ intern, on: { kind: 'feedback', feedback }, body: ' Agree.\n' });

    expect(comment).toMatchObject({
      parent: { kind: 'feedback', id: feedback.id },
      authorId: mentor,
      body: ' Agree.\n',
      createdAt: t2,
      updatedAt: t2,
      editedAt: null,
      deletedAt: null,
    });
  });

  it('goes on delivered feedback and on a conversation', () => {
    const intern = newIntern();
    const { conversation, feedback } = delivered(intern);

    expect(add({ intern, on: { kind: 'feedback', feedback } }).parent).toEqual({
      kind: 'feedback',
      id: feedback.id,
    });
    expect(add({ intern, on: { kind: 'conversation', conversation } }).parent).toEqual({
      kind: 'conversation',
      id: conversation.id,
    });
  });

  it('refuses a draft', () => {
    const intern = newIntern();
    const error = errorOf(() =>
      add({ intern, on: { kind: 'feedback', feedback: draftOf(intern) } }),
    );
    expect(error).toMatchObject({ kind: 'conflict', message: "Drafts can't be commented on." });
  });

  it('is for members only, never in an archived batch or on a read-only record', () => {
    expect(errorOf(() => add({ batch: outsider })).kind).toBe('forbidden');
    expect(errorOf(() => add({ batch: archived })).code).toBe('batch_archived');
    const intern = newIntern();
    const feedback = submittedOf(intern);
    expect(
      errorOf(() => add({ intern: terminated(intern), on: { kind: 'feedback', feedback } })).code,
    ).toBe('intern_read_only');
  });

  it('needs a body of at most 2,000 characters', () => {
    expect(errorOf(() => add({ body: ' \n' })).issues).toEqual([
      { path: 'body', message: 'Write a comment.' },
    ]);
    expect(errorOf(() => add({ body: 'x'.repeat(2_001) })).kind).toBe('validation');
  });

  it("refuses another intern's parent, a caller bug", () => {
    const feedback = submittedOf(newIntern());
    expect(() => add({ on: { kind: 'feedback', feedback } })).toThrow(
      'Comment parent and intern do not match',
    );
  });
});

const setup = () => {
  const intern = newIntern();
  const comment = add({ intern });
  return { intern, comment };
};
const context = (intern: Intern, actor = mentor, batch = member) => ({
  intern,
  actor,
  batch,
  now: t3,
});

describe('editing and deleting a comment', () => {
  it('changes the body and marks it edited', () => {
    const { intern, comment } = setup();
    expect(editComment(comment, { ...context(intern), body: 'Agree, and well done.' })).toEqual({
      ...comment,
      body: 'Agree, and well done.',
      updatedAt: t3,
      editedAt: t3,
    });
  });

  it("doesn't mark an unchanged body", () => {
    const { intern, comment } = setup();
    expect(editComment(comment, { ...context(intern), body: comment.body })).toBe(comment);
  });

  it('is for the author only, still a member, on a record that can change', () => {
    const { intern, comment } = setup();
    const body = 'Changed.';
    expect(errorOf(() => editComment(comment, { ...context(intern, other), body })).kind).toBe(
      'forbidden',
    );
    expect(errorOf(() => deleteComment(comment, context(intern, pm))).kind).toBe('forbidden');
    expect(
      errorOf(() => editComment(comment, { ...context(intern, mentor, outsider), body })).kind,
    ).toBe('forbidden');
    expect(errorOf(() => deleteComment(comment, context(intern, mentor, archived))).code).toBe(
      'batch_archived',
    );
    expect(errorOf(() => deleteComment(comment, context(terminated(intern)))).code).toBe(
      'intern_read_only',
    );
  });

  it('checks the new body', () => {
    const { intern, comment } = setup();
    expect(errorOf(() => editComment(comment, { ...context(intern), body: '' })).kind).toBe(
      'validation',
    );
  });

  it('deletes by clearing the body and keeping the comment', () => {
    const { intern, comment } = setup();
    expect(deleteComment(comment, context(intern))).toEqual({
      ...comment,
      body: '',
      updatedAt: t3,
      deletedAt: t3,
    });
  });

  it('changes nothing when deleted again, and refuses an edit after', () => {
    const { intern, comment } = setup();
    const deleted: Comment = deleteComment(comment, context(intern));
    expect(deleteComment(deleted, { ...context(intern), now: new Date() })).toBe(deleted);
    expect(
      errorOf(() => editComment(deleted, { ...context(intern), body: 'Back.' })),
    ).toMatchObject({ code: 'comment_deleted', message: 'This comment was deleted.' });
  });
});
