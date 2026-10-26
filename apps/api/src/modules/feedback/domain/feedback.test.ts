import { describe, expect, it } from 'vitest';
import { AppError } from '../../../shared/errors/app-error.ts';
import { newBatchId } from '../../cohort/domain/batch-id.ts';
import { newUserId } from '../../identity/domain/user-id.ts';
import {
  followColour,
  giveNotice,
  type Intern,
  liftNotice,
  onboardIntern,
  setColorCode,
  terminate,
} from '../../intern/domain/intern.ts';
import { newInternId } from '../../intern/domain/intern-id.ts';
import { newStatusEventId } from '../../intern/domain/status-event-id.ts';
import {
  type ContentInput,
  deliverFeedback,
  discardDraft,
  draftFeedback,
  editDraft,
  editSubmitted,
  type Feedback,
  type MonthRange,
  monthLabel,
  submitFeedback,
} from './feedback.ts';
import { newConversationId } from './conversation-id.ts';
import { newFeedbackId } from './feedback-id.ts';

const t0 = new Date('2026-07-06T09:00:00Z');
const t1 = new Date('2026-10-24T09:00:00Z');
const t2 = new Date('2026-10-25T09:00:00Z');
const pm = newUserId();
const mentor = newUserId();
const otherMentor = newUserId();
const conversationId = newConversationId();

const range: MonthRange = { batchStartsOn: '2026-07-06', today: '2026-10-24' };

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

const coloured = (intern: Intern, colorCode: Intern['colorCode'] & string) =>
  setColorCode(intern, { colorCode, now: t0 });

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

const content: ContentInput = {
  period: '2026-10-01',
  body: 'Closed `PAY-214` with tests first.',
  colorCode: 'orange',
};

const draft = (intern = newIntern(), input: ContentInput = content): Feedback =>
  draftFeedback({ id: newFeedbackId(), intern, author: mentor, content: input, range, now: t1 });

const submit = (feedback: Feedback, intern: Intern, actor = mentor) =>
  submitFeedback(feedback, { intern, actor, range, eventId: newStatusEventId(), now: t2 });

describe('drafts', () => {
  it('starts as a draft, with no conversation, submission or edit time', () => {
    const intern = newIntern();
    const feedback = draft(intern);

    expect(feedback).toMatchObject({
      internId: intern.id,
      authorId: mentor,
      period: '2026-10-01',
      body: 'Closed `PAY-214` with tests first.',
      colorCode: 'orange',
      givesNotice: false,
      state: 'draft',
      conversationId: null,
      submittedAt: null,
      createdAt: t1,
      updatedAt: t1,
      editedAt: null,
    });
  });

  it('may be blank, and defaults to no colour', () => {
    expect(draft(newIntern(), { period: '2026-10-01', body: '' })).toMatchObject({
      body: '',
      colorCode: null,
      givesNotice: false,
    });
  });

  it('covers a month from the batch start month to the current one (decision 4)', () => {
    expect(draft(newIntern(), { ...content, period: '2026-07-01' }).period).toBe('2026-07-01');

    for (const period of ['2026-06-01', '2026-11-01']) {
      const error = errorOf(() => draft(newIntern(), { ...content, period }));
      expect(error.kind).toBe('validation');
      expect(error.issues).toEqual([
        { path: 'period', message: 'Choose a month from July 2026 to October 2026.' },
      ]);
    }
    for (const period of ['', '2026-10-24', '2026-13-01', 'October']) {
      expect(errorOf(() => draft(newIntern(), { ...content, period })).issues).toEqual([
        { path: 'period', message: 'Choose the month this feedback covers.' },
      ]);
    }
  });

  it('caps the body at 20,000 characters', () => {
    expect(draft(newIntern(), { ...content, body: 'x'.repeat(20_000) }).body).toHaveLength(20_000);
    expect(
      errorOf(() => draft(newIntern(), { ...content, body: 'x'.repeat(20_001) })).issues,
    ).toEqual([{ path: 'body', message: 'Feedback must be at most 20000 characters' }]);
  });

  it("can't be written for a read-only intern", () => {
    expect(errorOf(() => draft(terminated(newIntern()))).code).toBe('intern_read_only');
  });

  it('can only mark notice for an Active intern (decision 2)', () => {
    const error = errorOf(() => draft(onNotice(newIntern()), { ...content, givesNotice: true }));

    expect([error.kind, error.code, error.message]).toEqual([
      'conflict',
      'intern_not_active',
      'This intern is already on notice.',
    ]);
    // Without notice, feedback for an intern on notice is fine.
    expect(draft(onNotice(newIntern())).state).toBe('draft');
  });

  it('is edited by its author: month, text, colour and notice', () => {
    const intern = newIntern();
    const edited = editDraft(draft(intern), {
      intern,
      actor: mentor,
      content: { period: '2026-09-01', body: 'Rewritten.', colorCode: null, givesNotice: true },
      range,
      now: t2,
    });

    expect(edited).toMatchObject({
      period: '2026-09-01',
      body: 'Rewritten.',
      colorCode: null,
      givesNotice: true,
      state: 'draft',
      createdAt: t1,
      updatedAt: t2,
    });
  });

  it("can't be edited or discarded by anyone else", () => {
    const intern = newIntern();
    const feedback = draft(intern);

    const edit = errorOf(() =>
      editDraft(feedback, { intern, actor: otherMentor, content, range, now: t2 }),
    );
    const discard = errorOf(() => discardDraft(feedback, otherMentor));

    expect([edit.kind, discard.kind]).toEqual(['forbidden', 'forbidden']);
  });

  it('is discarded by its author, with no intern needed (so a read-only one never blocks it)', () => {
    const feedback = draft();

    expect(discardDraft(feedback, mentor)).toBe(feedback.id);
  });
});

describe('submitting', () => {
  it('sets the colour', () => {
    const intern = coloured(newIntern(), 'yellow');

    const result = submit(draft(intern), intern);

    expect(result.feedback).toMatchObject({
      state: 'submitted',
      submittedAt: t2,
      updatedAt: t2,
      colorCode: 'orange',
      editedAt: null,
    });
    expect(result.intern).toMatchObject({ colorCode: 'orange', status: 'active', updatedAt: t2 });
    expect(result.intern.statusEvents).toEqual(intern.statusEvents);
  });

  it('gives a first colour', () => {
    const intern = newIntern();

    expect(submit(draft(intern), intern).intern.colorCode).toBe('orange');
  });

  it('leaves the colour alone when it sets none: never back to "no code"', () => {
    const intern = coloured(newIntern(), 'red');

    const result = submit(draft(intern, { ...content, colorCode: null }), intern);

    expect(result.intern).toBe(intern);
  });

  it('puts an Active intern on notice for one month from today, pointing at the feedback', () => {
    const intern = coloured(newIntern(), 'orange');
    const feedback = draft(intern, { ...content, colorCode: 'red', givesNotice: true });

    const result = submit(feedback, intern);

    expect(result.intern).toMatchObject({
      status: 'on_notice',
      colorCode: 'red',
      noticeEndsOn: '2026-11-24',
    });
    expect(result.intern.statusEvents.at(-1)).toMatchObject({
      fromStatus: 'active',
      toStatus: 'on_notice',
      reason: 'Notice given in the October 2026 feedback.',
      noticeStartsOn: '2026-10-24',
      noticeEndsOn: '2026-11-24',
      feedbackId: feedback.id,
      actorId: mentor,
      createdAt: t2,
    });
  });

  it('gives notice with any colour, or none (decision 1)', () => {
    for (const colorCode of [null, 'green', 'borderline_yellow'] as const) {
      const intern = newIntern();
      const result = submit(draft(intern, { ...content, colorCode, givesNotice: true }), intern);
      expect([result.intern.status, result.intern.colorCode]).toEqual(['on_notice', colorCode]);
    }
  });

  it('refuses notice once the intern went on notice after the draft was saved', () => {
    const intern = newIntern();
    const feedback = draft(intern, { ...content, givesNotice: true });

    expect(errorOf(() => submit(feedback, onNotice(intern))).code).toBe('intern_not_active');
  });

  it('needs written feedback, and a month still in range', () => {
    const intern = newIntern();
    const blank = errorOf(() => submit(draft(intern, { ...content, body: ' \n\t' }), intern));
    expect(blank.issues).toEqual([
      { path: 'body', message: 'Write your feedback before submitting.' },
    ]);

    const old = draft(intern, { ...content, period: '2026-07-01' });
    const later = errorOf(() =>
      submitFeedback(old, {
        intern,
        actor: mentor,
        range: { batchStartsOn: '2026-08-03', today: '2026-10-24' },
        eventId: newStatusEventId(),
        now: t2,
      }),
    );
    expect(later.issues?.[0]?.path).toBe('period');
  });

  it("is its author's alone, once, and not for a read-only intern", () => {
    const intern = newIntern();
    const feedback = draft(intern);
    const { feedback: sent } = submit(feedback, intern);

    expect(errorOf(() => submit(feedback, intern, otherMentor)).kind).toBe('forbidden');
    expect(errorOf(() => submit(sent, intern)).code).toBe('feedback_not_draft');
    expect(errorOf(() => submit(feedback, terminated(intern))).code).toBe('intern_read_only');
  });
});

/** A submitted entry and its intern. */
const sent = (input: ContentInput = content, before = newIntern()) => {
  const result = submit(draft(before, input), before);
  return { intern: result.intern, feedback: result.feedback };
};

const edit = (feedback: Feedback, intern: Intern, change: ContentInput, actor = mentor) =>
  editSubmitted(feedback, {
    intern,
    actor,
    content: change,
    range,
    eventId: newStatusEventId(),
    now: t2,
  });

const t3 = new Date('2026-10-26T09:00:00Z');

describe('editing submitted feedback (9.8)', () => {
  it('changes the month, text and colour, marking it edited; the colour is left to the caller', () => {
    const { intern, feedback } = sent();

    const result = edit(feedback, intern, {
      period: '2026-09-01',
      body: 'Clearer.',
      colorCode: 'red',
    });

    expect(result.feedback).toMatchObject({
      period: '2026-09-01',
      body: 'Clearer.',
      colorCode: 'red',
      givesNotice: false,
      state: 'submitted',
      submittedAt: t2,
      updatedAt: t2,
      editedAt: t2,
    });
    expect(result.intern).toBe(intern);
  });

  it("isn't marked edited when nothing changed", () => {
    const { intern, feedback } = sent();

    const result = edit(feedback, intern, content);

    expect(result.feedback).toBe(feedback);
    expect(result.feedback.editedAt).toBeNull();
  });

  it('follows the rules for submitting: its author, written text, a month in range', () => {
    const { intern, feedback } = sent();

    expect(errorOf(() => edit(feedback, intern, content, otherMentor)).kind).toBe('forbidden');
    expect(errorOf(() => edit(feedback, intern, { ...content, body: ' ' })).issues).toEqual([
      { path: 'body', message: 'Write your feedback before submitting.' },
    ]);
    expect(
      errorOf(() => edit(feedback, intern, { ...content, period: '2026-11-01' })).issues?.[0]
        ?.message,
    ).toBe('Choose a month from July 2026 to October 2026.');
    expect(errorOf(() => edit(draft(intern), intern, content)).message).toBe(
      'This feedback is still a draft.',
    );
  });

  it("can't change feedback on a read-only intern", () => {
    const { intern, feedback } = sent();
    const gone = terminate(onNotice(intern), {
      eventId: newStatusEventId(),
      reason: 'Notice period ended.',
      actor: pm,
      now: t2,
    });

    expect(errorOf(() => edit(feedback, gone, { ...content, body: 'Later.' })).code).toBe(
      'intern_read_only',
    );
  });

  it('gives notice from the day of the edit, recorded with the feedback', () => {
    const { intern, feedback } = sent();

    const result = edit(feedback, intern, { ...content, givesNotice: true });

    expect(result.feedback).toMatchObject({ givesNotice: true, editedAt: t2 });
    expect(result.intern).toMatchObject({ status: 'on_notice', noticeEndsOn: '2026-11-24' });
    expect(result.intern.statusEvents.at(-1)).toMatchObject({
      fromStatus: 'active',
      toStatus: 'on_notice',
      reason: 'Notice given by editing the October 2026 feedback.',
      noticeStartsOn: '2026-10-24',
      feedbackId: feedback.id,
      actorId: mentor,
    });
  });

  it("can't give notice to an intern already on notice", () => {
    const { feedback, intern } = sent();

    const error = errorOf(() =>
      edit(feedback, onNotice(intern), { ...content, givesNotice: true }),
    );

    expect([error.code, error.message]).toEqual([
      'intern_not_active',
      'This intern is already on notice.',
    ]);
  });

  it('withdraws the notice it gave while that notice runs, back to Active', () => {
    const { intern, feedback } = sent({ ...content, givesNotice: true });

    const result = edit(feedback, intern, { ...content, period: '2026-09-01' });

    expect(result.feedback.givesNotice).toBe(false);
    expect(result.intern).toMatchObject({ status: 'active', noticeEndsOn: null });
    expect(result.intern.statusEvents.at(-1)).toMatchObject({
      fromStatus: 'on_notice',
      toStatus: 'active',
      reason: 'Notice withdrawn by editing the September 2026 feedback.',
      feedbackId: null,
    });
  });

  it("can't withdraw a notice that was lifted or replaced", () => {
    const { intern, feedback } = sent({ ...content, givesNotice: true });
    const lifted = liftNotice(intern, {
      eventId: newStatusEventId(),
      reason: 'Improved.',
      actor: pm,
      now: t3,
    });
    const replaced = onNotice(lifted);

    for (const later of [lifted, replaced]) {
      const error = errorOf(() => edit(feedback, later, content));
      expect([error.code, error.message]).toEqual([
        'notice_not_running',
        "This feedback's notice is no longer running, so it can't be withdrawn here.",
      ]);
    }
    // Leaving notice on still lets the rest change.
    expect(
      edit(feedback, lifted, { ...content, givesNotice: true, body: 'Later.' }).feedback.body,
    ).toBe('Later.');
  });
});

describe("the intern's colour after an edit", () => {
  it('follows the newest coloured feedback, back to none when there is none', () => {
    const intern = coloured(newIntern(), 'red');

    expect(followColour(intern, { colorCode: 'red', now: t2 })).toBe(intern);
    expect(followColour(intern, { colorCode: null, now: t2 })).toMatchObject({
      colorCode: null,
      updatedAt: t2,
    });
  });
});

describe('after submission', () => {
  it('is no longer a draft to edit or discard', () => {
    const { intern, feedback } = sent();

    const error = errorOf(() =>
      editDraft(feedback, {
        intern,
        actor: mentor,
        content: { ...content, colorCode: 'red' },
        range,
        now: t2,
      }),
    );

    expect([error.code, error.message]).toEqual([
      'feedback_not_draft',
      'This feedback has already been submitted.',
    ]);
    expect(errorOf(() => discardDraft(feedback, mentor)).code).toBe('feedback_not_draft');
  });

  it('is delivered once, then never changes', () => {
    const { intern, feedback } = sent();

    const delivered = deliverFeedback(feedback, { conversationId, now: t2 });

    expect(delivered).toMatchObject({ state: 'delivered', conversationId });
    const attempts = [
      () => edit(delivered, intern, { ...content, body: 'Later.' }),
      () => editDraft(delivered, { intern, actor: mentor, content, range, now: t2 }),
      () => discardDraft(delivered, mentor),
      () => deliverFeedback(delivered, { conversationId, now: t2 }),
      () => submit(delivered, intern),
    ];
    for (const attempt of attempts) {
      const error = errorOf(attempt);
      expect([error.code, error.message]).toEqual([
        'feedback_delivered',
        "Delivered feedback can't be changed.",
      ]);
    }
  });

  it("can't deliver a draft", () => {
    expect(errorOf(() => deliverFeedback(draft(), { conversationId, now: t2 })).message).toBe(
      "A draft can't be delivered.",
    );
  });
});

describe('monthLabel', () => {
  it('names the month in English', () => {
    expect(monthLabel('2026-10-01')).toBe('October 2026');
    expect(monthLabel('2027-01-01')).toBe('January 2027');
  });
});
