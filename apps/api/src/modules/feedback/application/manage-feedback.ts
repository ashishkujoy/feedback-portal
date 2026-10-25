import { conflict, forbidden, notFound } from '../../../shared/errors/app-error.ts';
import { utcToday } from '../../../shared/calendar-date.ts';
import type { Viewer } from '../../cohort/application/batch-scope.ts';
import type { BatchId } from '../../cohort/domain/batch-id.ts';
import type { BatchAccessGrant } from '../../intern/application/batch-access.ts';
import { followColour, type Intern } from '../../intern/domain/intern.ts';
import type { InternId } from '../../intern/domain/intern-id.ts';
import { newStatusEventId } from '../../intern/domain/status-event-id.ts';
import {
  type ContentInput,
  discardDraft,
  draftFeedback,
  editDraft,
  editSubmitted,
  type Feedback,
  type MonthRange,
  submitFeedback,
} from '../domain/feedback.ts';
import { type FeedbackId, newFeedbackId } from '../domain/feedback-id.ts';
import type { FeedbackScope, FeedbackTransaction } from './feedback-admin.ts';
import type { FeedbackEntryView } from './feedback-queries.ts';

export type ManageFeedbackDeps = Readonly<{ transaction: FeedbackTransaction; now: () => Date }>;

/** Who is acting. */
export type Actor = Viewer;

type InternTarget = Readonly<{ actor: Actor; batchId: BatchId; internId: InternId }>;
type EntryTarget = InternTarget & Readonly<{ feedbackId: FeedbackId }>;

/** A batch the actor can't see is a 404, as everywhere else. */
const ensureCanSee = async (
  { batchAccess }: FeedbackScope,
  actor: Actor,
  batchId: BatchId,
): Promise<BatchAccessGrant> => {
  const access = await batchAccess(actor, batchId);
  if (!access) throw notFound('Batch not found');
  return access;
};

/**
 * Feedback is written by the batch's current mentors and programme manager (9.3 decision 2):
 * admins read every batch but write only where they're assigned. Never in an archived batch.
 */
const ensureCanWrite = (access: BatchAccessGrant): void => {
  if (!access.isMember) {
    throw forbidden("Only this batch's mentors and programme manager write feedback.");
  }
  if (access.isArchived) throw conflict('This batch is archived', 'batch_archived');
};

/** The intern, if they're in this batch (an intern of another batch is a 404). */
const internIn = async (
  { interns }: FeedbackScope,
  { batchId, internId }: InternTarget,
  lock: boolean,
): Promise<Intern> => {
  const intern = await (lock ? interns.findByIdForUpdate(internId) : interns.findById(internId));
  if (!intern || intern.batchId !== batchId) throw notFound('Intern not found');
  return intern;
};

/** An entry on this intern that the actor may see: someone else's draft is a 404, not a 403. */
const entryFor = async (
  { feedback }: FeedbackScope,
  { actor, internId, feedbackId }: EntryTarget,
): Promise<Feedback> => {
  const entry = await feedback.findById(feedbackId);
  if (
    !entry ||
    entry.internId !== internId ||
    (entry.state === 'draft' && entry.authorId !== actor.id)
  ) {
    throw notFound('Feedback not found');
  }
  return entry;
};

const viewOf = async ({ queries }: FeedbackScope, id: FeedbackId): Promise<FeedbackEntryView> => {
  const view = await queries.view(id);
  if (!view) throw new Error('Saved feedback could not be read back');
  return view;
};

const rangeOf = (access: BatchAccessGrant, now: Date): MonthRange => ({
  batchStartsOn: access.startDate,
  today: utcToday(now),
});

/**
 * Submits `draft` and saves it with the intern's new colour and status, or just saves the
 * draft. The intern was locked by the caller when submitting, so two submissions for the same
 * intern go one after the other.
 */
const saveOrSubmit = async (
  scope: FeedbackScope,
  draft: Feedback,
  submit: boolean,
  context: Readonly<{ intern: Intern; actor: Actor; range: MonthRange; now: Date }>,
): Promise<void> => {
  if (!submit) {
    await scope.feedback.save(draft);
    return;
  }
  const submitted = submitFeedback(draft, {
    intern: context.intern,
    actor: context.actor.id,
    range: context.range,
    eventId: newStatusEventId(),
    now: context.now,
  });
  await scope.feedback.save(submitted.feedback, submitted.intern);
};

/** An intern's feedback for anyone who can see the batch, with only the viewer's own drafts. */
export const listFeedback = (
  { transaction }: ManageFeedbackDeps,
  target: InternTarget,
): Promise<readonly FeedbackEntryView[]> =>
  transaction(async (scope) => {
    await ensureCanSee(scope, target.actor, target.batchId);
    await internIn(scope, target, false);
    return scope.queries.listForIntern(target.internId, target.actor.id);
  });

export type ContentChange = Readonly<{ content: ContentInput; submit: boolean }>;

/**
 * A new draft, or (with `submit`) a new entry submitted in the same transaction (9.3 decision
 * 1): a refused submission leaves nothing behind.
 */
export const createFeedback = (
  { transaction, now }: ManageFeedbackDeps,
  { content, submit, ...target }: InternTarget & ContentChange,
): Promise<FeedbackEntryView> =>
  transaction(async (scope) => {
    const access = await ensureCanSee(scope, target.actor, target.batchId);
    ensureCanWrite(access);
    const intern = await internIn(scope, target, submit);
    const at = now();
    const range = rangeOf(access, at);
    const draft = draftFeedback({
      id: newFeedbackId(),
      intern,
      author: target.actor.id,
      content,
      range,
      now: at,
    });
    await saveOrSubmit(scope, draft, submit, { intern, actor: target.actor, range, now: at });
    return viewOf(scope, draft.id);
  });

/** Replaces a draft's content, and submits it in the same transaction with `submit`. */
export const updateDraft = (
  { transaction, now }: ManageFeedbackDeps,
  { content, submit, ...target }: EntryTarget & ContentChange,
): Promise<FeedbackEntryView> =>
  transaction(async (scope) => {
    const access = await ensureCanSee(scope, target.actor, target.batchId);
    ensureCanWrite(access);
    const intern = await internIn(scope, target, submit);
    const entry = await entryFor(scope, target);
    const at = now();
    const range = rangeOf(access, at);
    const edited = editDraft(entry, { intern, actor: target.actor.id, content, range, now: at });
    await saveOrSubmit(scope, edited, submit, { intern, actor: target.actor, range, now: at });
    return viewOf(scope, entry.id);
  });

/**
 * The author's change to submitted feedback until it's delivered (9.8). The intern is locked, as
 * on submit; the feedback is saved first (with any notice change), then the intern's colour
 * follows the newest coloured feedback, which may be this one or another.
 */
export const editSubmittedFeedback = (
  { transaction, now }: ManageFeedbackDeps,
  { content, ...target }: EntryTarget & Readonly<{ content: ContentInput }>,
): Promise<FeedbackEntryView> =>
  transaction(async (scope) => {
    const access = await ensureCanSee(scope, target.actor, target.batchId);
    ensureCanWrite(access);
    const intern = await internIn(scope, target, true);
    const entry = await entryFor(scope, target);
    const at = now();
    const edited = editSubmitted(entry, {
      intern,
      actor: target.actor.id,
      content,
      range: rangeOf(access, at),
      eventId: newStatusEventId(),
      now: at,
    });
    await scope.feedback.save(edited.feedback, edited.intern);
    const colour = await scope.feedback.newestColour(intern.id);
    const followed = followColour(edited.intern, { colorCode: colour, now: at });
    if (followed !== edited.intern) await scope.interns.save(followed);
    return viewOf(scope, entry.id);
  });

/** Discards the author's own draft (v2 A26), even for a read-only intern. */
export const discardFeedback = (
  { transaction }: ManageFeedbackDeps,
  target: EntryTarget,
): Promise<void> =>
  transaction(async (scope) => {
    ensureCanWrite(await ensureCanSee(scope, target.actor, target.batchId));
    await internIn(scope, target, false);
    const entry = await entryFor(scope, target);
    await scope.feedback.deleteDraft(discardDraft(entry, target.actor.id));
  });
