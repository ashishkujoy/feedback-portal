import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { useTestDb } from '../../../../test/test-db.ts';
import { pgErrorCodes, pgErrorOf } from '../../../shared/db/pg-error.ts';
import { createBatch } from '../../cohort/domain/batch.ts';
import { newBatchId } from '../../cohort/domain/batch-id.ts';
import { newBatchMemberId } from '../../cohort/domain/batch-member-id.ts';
import { createBatchRepository } from '../../cohort/infrastructure/drizzle-batch-repository.ts';
import { createUser } from '../../identity/domain/user.ts';
import { newUserId, type UserId } from '../../identity/domain/user-id.ts';
import { createUserRepository } from '../../identity/infrastructure/drizzle-user-repository.ts';
import { type Intern, onboardIntern } from '../../intern/domain/intern.ts';
import { newInternId } from '../../intern/domain/intern-id.ts';
import { newStatusEventId } from '../../intern/domain/status-event-id.ts';
import { createInternRepository } from '../../intern/infrastructure/drizzle-intern-repository.ts';
import { internStatusEvents } from '../../intern/infrastructure/schema.ts';
import { draftFeedback, type Feedback, submitFeedback } from '../domain/feedback.ts';
import { newFeedbackId } from '../domain/feedback-id.ts';
import { createFeedbackRepository } from './drizzle-feedback-repository.ts';
import { feedback as feedbackTable } from './schema.ts';

const testDb = useTestDb();
const db = () => testDb.handle.db;
const repo = () => createFeedbackRepository(db());
const interns = () => createInternRepository(db());

const t0 = new Date('2026-07-06T09:00:00.000Z');
const t1 = new Date('2026-10-24T09:00:00.000Z');
const t2 = new Date('2026-10-25T09:00:00.000Z');
const range = { batchStartsOn: '2026-07-06', today: '2026-10-24' };

const savedUser = async (roles: ['program_manager'] | ['mentor']): Promise<UserId> => {
  const id = newUserId();
  await createUserRepository(db()).save(
    createUser({
      id,
      email: `user.${id.slice(-6)}@example.com`,
      name: 'Pat Person',
      roles,
      grantedBy: null,
      now: t0,
    }),
  );
  return id;
};

const savedIntern = async (): Promise<{ intern: Intern; author: UserId }> => {
  const pm = await savedUser(['program_manager']);
  const batch = createBatch({
    id: newBatchId(),
    name: 'Batch 2026',
    startDate: '2026-07-06',
    endDate: '2027-12-18',
    programManager: { id: pm, roles: ['program_manager'], isActive: true },
    memberId: newBatchMemberId(),
    createdBy: pm,
    now: t0,
  });
  await createBatchRepository(db()).save(batch);
  const intern = onboardIntern({
    id: newInternId(),
    eventId: newStatusEventId(),
    batchId: batch.id,
    details: { username: 'ishita.rao', name: 'Ishita Rao', email: 'ishita@example.com' },
    actor: pm,
    now: t0,
  });
  await interns().save(intern);
  return { intern, author: await savedUser(['mentor']) };
};

const newDraft = (intern: Intern, author: UserId, givesNotice = false): Feedback =>
  draftFeedback({
    id: newFeedbackId(),
    intern,
    author,
    content: { period: '2026-10-01', body: 'Closed `PAY-214`.', colorCode: 'red', givesNotice },
    range,
    now: t1,
  });

describe('the feedback repository', () => {
  it('saves a draft and loads it back as it was', async () => {
    const { intern, author } = await savedIntern();
    const draft = newDraft(intern, author);

    await repo().save(draft);

    expect(await repo().findById(draft.id)).toEqual(draft);
    expect(await repo().findById(newFeedbackId())).toBeNull();
  });

  it('saves a submission with notice: the feedback, the colour, the status and its event', async () => {
    const { intern, author } = await savedIntern();
    const draft = newDraft(intern, author, true);
    await repo().save(draft);

    const submitted = submitFeedback(draft, {
      intern,
      actor: author,
      range,
      eventId: newStatusEventId(),
      now: t2,
    });
    await repo().save(submitted.feedback, submitted.intern);

    expect(await repo().findById(draft.id)).toEqual(submitted.feedback);
    const stored = await interns().findById(intern.id);
    expect(stored).toMatchObject({
      colorCode: 'red',
      status: 'on_notice',
      noticeEndsOn: '2026-11-24',
    });
    expect(stored?.statusEvents.at(-1)).toMatchObject({
      toStatus: 'on_notice',
      feedbackId: draft.id,
      reason: 'Notice given in the October 2026 feedback.',
    });
  });

  it('saves nothing when part of a submission fails', async () => {
    const { intern, author } = await savedIntern();
    const draft = newDraft(intern, author, true);
    await repo().save(draft);
    const submitted = submitFeedback(draft, {
      intern,
      actor: author,
      range,
      eventId: newStatusEventId(),
      now: t2,
    });
    // The notice's event names an actor who doesn't exist, so the last write fails.
    const broken: Intern = {
      ...submitted.intern,
      statusEvents: submitted.intern.statusEvents.map((event, index, all) =>
        index === all.length - 1 ? { ...event, actorId: newUserId() } : event,
      ),
    };

    const error = await repo()
      .save(submitted.feedback, broken)
      .then(
        () => undefined,
        (failure: unknown) => failure,
      );

    expect(pgErrorOf(error)?.code).toBe(pgErrorCodes.foreignKeyViolation);
    expect(await repo().findById(draft.id)).toEqual(draft);
    expect(await interns().findById(intern.id)).toMatchObject({
      colorCode: null,
      status: 'active',
      noticeEndsOn: null,
    });
    expect(
      await db()
        .select()
        .from(internStatusEvents)
        .where(eq(internStatusEvents.internId, intern.id)),
    ).toHaveLength(1);
  });

  it('deletes a discarded draft, and never submitted feedback', async () => {
    const { intern, author } = await savedIntern();
    const draft = newDraft(intern, author);
    const other = newDraft(intern, author);
    await repo().save(draft);
    await repo().save(other);
    const submitted = submitFeedback(other, {
      intern,
      actor: author,
      range,
      eventId: newStatusEventId(),
      now: t2,
    });
    await repo().save(submitted.feedback, submitted.intern);

    await repo().deleteDraft(draft.id);
    await repo().deleteDraft(other.id);

    const left = await db().select({ id: feedbackTable.id }).from(feedbackTable);
    expect(left.map(({ id }) => id)).toEqual([other.id]);
  });
});
