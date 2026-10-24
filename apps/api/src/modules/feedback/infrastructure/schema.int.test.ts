import { eq, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { useTestDb } from '../../../../test/test-db.ts';
import { pgErrorCodes, pgErrorOf, type PgErrorInfo } from '../../../shared/db/pg-error.ts';
import { batches } from '../../cohort/infrastructure/schema.ts';
import { users } from '../../identity/infrastructure/schema.ts';
import { internStatusEvents, interns } from '../../intern/infrastructure/schema.ts';
import { feedback } from './schema.ts';

const testDb = useTestDb();
const db = () => testDb.handle.db;

const uuidV7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const missingId = '01890a5d-ac96-774b-bcce-b302099a8057';
const conversationId = '01890a5d-ac96-774b-bcce-b30209000c01';
const { foreignKeyViolation, invalidTextRepresentation, checkViolation, restrictViolation } =
  pgErrorCodes;

/** The SQLSTATE and constraint a query failed with, or `undefined` if it succeeded. */
const failure = async (query: Promise<unknown>): Promise<PgErrorInfo | undefined> => {
  try {
    await query;
  } catch (error) {
    const info = pgErrorOf(error);
    if (info) return info;
    throw error;
  }
  return undefined;
};

const checkFailure = (constraint: string) => ({ code: checkViolation, constraint });

let count = 0;
const insertUser = async () => {
  count += 1;
  const [user] = await db()
    .insert(users)
    .values({ email: `user${count}@example.com`, name: `User ${count}` })
    .returning();
  if (!user) throw new Error('insert returned no row');
  return user.id;
};

const insertIntern = async () => {
  count += 1;
  const [batch] = await db()
    .insert(batches)
    .values({
      name: `Batch ${count}`,
      startDate: '2027-01-11',
      endDate: '2028-06-25',
      createdBy: await insertUser(),
    })
    .returning();
  if (!batch) throw new Error('insert returned no row');
  const [intern] = await db()
    .insert(interns)
    .values({
      batchId: batch.id,
      username: `intern${count}`,
      name: `Intern ${count}`,
      email: `intern${count}@example.com`,
    })
    .returning();
  if (!intern) throw new Error('insert returned no row');
  return intern;
};

const insertFeedback = async (values: Partial<typeof feedback.$inferInsert> = {}) => {
  const [row] = await db()
    .insert(feedback)
    .values({
      internId: values.internId ?? (await insertIntern()).id,
      authorId: values.authorId ?? (await insertUser()),
      period: '2027-03-01',
      body: 'Closed `PAY-214` with tests.',
      ...values,
    })
    .returning();
  if (!row) throw new Error('insert returned no row');
  return row;
};

const submitted = { state: 'submitted', submittedAt: new Date('2027-03-28T10:00:00Z') } as const;
const delivered = { ...submitted, state: 'delivered', conversationId } as const;

describe('feedback', () => {
  it('fills id (uuid v7), state, notice and timestamps from defaults', async () => {
    const row = await insertFeedback();

    expect(row.id).toMatch(uuidV7);
    expect(row).toMatchObject({
      state: 'draft',
      givesNotice: false,
      colorCode: null,
      previousColorCode: null,
      conversationId: null,
      submittedAt: null,
    });
    expect(row.createdAt).toBeInstanceOf(Date);
    expect(row.updatedAt).toBeInstanceOf(Date);
  });

  it('covers a month: the period is its first day', async () => {
    await insertFeedback({ period: '2027-02-01' });

    expect(await failure(insertFeedback({ period: '2027-02-02' }))).toMatchObject(
      checkFailure('feedback_period_check'),
    );
  });

  it('has a submission time exactly when it is no longer a draft', async () => {
    await insertFeedback(submitted);

    expect(
      await failure(insertFeedback({ submittedAt: new Date('2027-03-28T10:00:00Z') })),
    ).toMatchObject(checkFailure('feedback_submitted_check'));
    expect(await failure(insertFeedback({ state: 'submitted' }))).toMatchObject(
      checkFailure('feedback_submitted_check'),
    );
  });

  it('has a conversation exactly when delivered', async () => {
    await insertFeedback(delivered);

    expect(await failure(insertFeedback({ ...submitted, state: 'delivered' }))).toMatchObject(
      checkFailure('feedback_delivered_check'),
    );
    expect(await failure(insertFeedback({ ...submitted, conversationId }))).toMatchObject(
      checkFailure('feedback_delivered_check'),
    );
  });

  it('only snapshots the previous colour on submission', async () => {
    await insertFeedback({ ...submitted, colorCode: 'red', previousColorCode: 'orange' });
    // An intern without a code yet: nothing to snapshot.
    await insertFeedback({ ...submitted, colorCode: 'green', previousColorCode: null });

    expect(await failure(insertFeedback({ previousColorCode: 'orange' }))).toMatchObject(
      checkFailure('feedback_previous_color_check'),
    );
  });

  it('lets a draft be blank, but not submitted feedback', async () => {
    await insertFeedback({ body: '' });
    await insertFeedback({ body: ' \n\t' });

    expect(await failure(insertFeedback({ ...submitted, body: ' \n\t' }))).toMatchObject(
      checkFailure('feedback_body_check'),
    );
  });

  it('rejects an unknown intern, author, state or colour', async () => {
    expect((await failure(insertFeedback({ internId: missingId })))?.code).toBe(
      foreignKeyViolation,
    );
    expect((await failure(insertFeedback({ authorId: missingId })))?.code).toBe(
      foreignKeyViolation,
    );
    const intern = await insertIntern();
    const author = await insertUser();
    const raw = (state: string, color: string | null) =>
      db().execute(
        sql`insert into feedback (intern_id, author_id, period, body, state, color_code)
          values (${intern.id}, ${author}, '2027-03-01', 'Text', ${state}, ${color})`,
      );
    expect((await failure(raw('archived', null)))?.code).toBe(invalidTextRepresentation);
    expect((await failure(raw('draft', 'purple')))?.code).toBe(invalidTextRepresentation);
  });

  it('lets a draft be discarded, but never deletes submitted or delivered feedback', async () => {
    const draft = await insertFeedback();
    const sent = await insertFeedback(submitted);
    const done = await insertFeedback(delivered);

    await db().delete(feedback).where(eq(feedback.id, draft.id));
    const removeSent = await failure(db().delete(feedback).where(eq(feedback.id, sent.id)));
    const removeDone = await failure(db().delete(feedback).where(eq(feedback.id, done.id)));

    expect([removeSent?.code, removeDone?.code]).toEqual([restrictViolation, restrictViolation]);
    const left = await db().select({ id: feedback.id }).from(feedback);
    expect(left.map(({ id }) => id).toSorted()).toEqual([sent.id, done.id].toSorted());
  });

  it('lets submitted feedback be edited and delivered, then never changes it', async () => {
    const row = await insertFeedback({ ...submitted, colorCode: 'orange' });
    const byId = eq(feedback.id, row.id);

    await db().update(feedback).set({ body: 'Closed `PAY-214`, with tests first.' }).where(byId);
    await db().update(feedback).set({ state: 'delivered', conversationId }).where(byId);

    const changes = [
      { body: 'Rewritten after delivery' },
      { colorCode: 'red' },
      { state: 'submitted', conversationId: null },
      { givesNotice: true },
    ] as const;
    const results = await Promise.all(
      changes.map(
        async (change) => (await failure(db().update(feedback).set(change).where(byId)))?.code,
      ),
    );

    expect(results).toEqual(changes.map(() => restrictViolation));
    const [stored] = await db().select().from(feedback).where(byId);
    expect(stored).toMatchObject({
      body: 'Closed `PAY-214`, with tests first.',
      colorCode: 'orange',
      state: 'delivered',
      conversationId,
      givesNotice: false,
    });
  });

  it("won't delete an intern or a user with feedback", async () => {
    const intern = await insertIntern();
    const author = await insertUser();
    await insertFeedback({ internId: intern.id, authorId: author, ...submitted });

    expect((await failure(db().delete(interns).where(eq(interns.id, intern.id))))?.code).toBe(
      foreignKeyViolation,
    );
    expect((await failure(db().delete(users).where(eq(users.id, author))))?.code).toBe(
      foreignKeyViolation,
    );
  });
});

const insertEvent = async (values: Partial<typeof internStatusEvents.$inferInsert>) => {
  const intern = await insertIntern();
  return db()
    .insert(internStatusEvents)
    .values({ internId: intern.id, actorId: await insertUser(), toStatus: 'active', ...values });
};

describe('intern_status_events.feedback_id', () => {
  const notice = {
    fromStatus: 'active',
    toStatus: 'on_notice',
    reason: 'No improvement since the February feedback.',
    noticeStartsOn: '2027-03-28',
    noticeEndsOn: '2027-04-28',
  } as const;

  it('points a notice at the feedback that started it', async () => {
    const row = await insertFeedback({ ...submitted, colorCode: 'red', givesNotice: true });

    await insertEvent({ ...notice, feedbackId: row.id });

    const [event] = await db().select().from(internStatusEvents);
    expect(event?.feedbackId).toBe(row.id);
  });

  it('rejects missing feedback, and feedback on anything but a notice', async () => {
    const row = await insertFeedback(submitted);

    expect((await failure(insertEvent({ ...notice, feedbackId: missingId })))?.code).toBe(
      foreignKeyViolation,
    );
    expect(
      await failure(
        insertEvent({
          fromStatus: 'active',
          toStatus: 'withdrawn',
          reason: 'Left the programme.',
          feedbackId: row.id,
        }),
      ),
    ).toMatchObject(checkFailure('intern_status_events_feedback_check'));
  });
});
