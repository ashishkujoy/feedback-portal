import { eq, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { useTestDb } from '../../../../test/test-db.ts';
import { pgErrorCodes, pgErrorOf, type PgErrorInfo } from '../../../shared/db/pg-error.ts';
import { batches } from '../../cohort/infrastructure/schema.ts';
import { users } from '../../identity/infrastructure/schema.ts';
import { internStatusEvents, interns } from './schema.ts';

const testDb = useTestDb();
const db = () => testDb.handle.db;

const uuidV7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const {
  uniqueViolation,
  foreignKeyViolation,
  invalidTextRepresentation,
  checkViolation,
  restrictViolation,
} = pgErrorCodes;

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

const insertBatch = async () => {
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
  return batch.id;
};

const insertIntern = async (values: Partial<typeof interns.$inferInsert> = {}) => {
  count += 1;
  const [intern] = await db()
    .insert(interns)
    .values({
      batchId: values.batchId ?? (await insertBatch()),
      username: `intern${count}`,
      name: `Intern ${count}`,
      email: `intern${count}@example.com`,
      ...values,
    })
    .returning();
  if (!intern) throw new Error('insert returned no row');
  return intern;
};

type EventValues = Partial<typeof internStatusEvents.$inferInsert> &
  Pick<typeof internStatusEvents.$inferInsert, 'toStatus'>;

const insertEvent = async (values: EventValues) => {
  const [event] = await db()
    .insert(internStatusEvents)
    .values({
      internId: values.internId ?? (await insertIntern()).id,
      actorId: values.actorId ?? (await insertUser()),
      ...values,
    })
    .returning();
  if (!event) throw new Error('insert returned no row');
  return event;
};

const notice = {
  fromStatus: 'active',
  toStatus: 'on_notice',
  reason: 'Missed every deadline in March',
  noticeStartsOn: '2027-04-01',
  noticeEndsOn: '2027-05-01',
} as const;

describe('interns', () => {
  it('fills id (uuid v7), status, colour code and timestamps from defaults', async () => {
    const intern = await insertIntern();

    expect(intern.id).toMatch(uuidV7);
    expect(intern).toMatchObject({ status: 'active', colorCode: null, noticeEndsOn: null });
    expect(intern.createdAt).toBeInstanceOf(Date);
  });

  it('keeps a username unique within a batch, ignoring case, but not across batches', async () => {
    const batchId = await insertBatch();
    await insertIntern({ batchId, username: 'ishita.rao' });

    expect(await failure(insertIntern({ batchId, username: 'Ishita.Rao' }))).toEqual({
      code: uniqueViolation,
      constraint: 'interns_batch_username_unique',
    });
    await expect(insertIntern({ username: 'ishita.rao' })).resolves.toMatchObject({
      username: 'ishita.rao',
    });
  });

  it('has a notice end date exactly while on notice', async () => {
    const constraint = checkFailure('interns_notice_check');

    expect(await failure(insertIntern({ status: 'on_notice' }))).toEqual(constraint);
    expect(await failure(insertIntern({ noticeEndsOn: '2027-05-01' }))).toEqual(constraint);
    await expect(
      insertIntern({ status: 'on_notice', noticeEndsOn: '2027-05-01' }),
    ).resolves.toMatchObject({ status: 'on_notice' });
  });

  it('stores emails lower-cased, and needs a username and a name', async () => {
    expect(await failure(insertIntern({ email: 'Ishita@Example.com' }))).toEqual(
      checkFailure('interns_email_lower_check'),
    );
    expect(await failure(insertIntern({ username: '  ' }))).toEqual(
      checkFailure('interns_names_check'),
    );
    expect(await failure(insertIntern({ name: '' }))).toEqual(checkFailure('interns_names_check'));
  });

  it('rejects an unknown batch, status or colour', async () => {
    expect(
      (await failure(insertIntern({ batchId: '01890a5d-ac96-774b-bcce-b302099a8057' })))?.code,
    ).toBe(foreignKeyViolation);
    const batchId = await insertBatch();
    expect(
      (
        await failure(
          db().execute(
            sql`insert into interns (batch_id, username, name, email, status)
                values (${batchId}, 'u', 'U', 'u@example.com', 'expelled')`,
          ),
        )
      )?.code,
    ).toBe(invalidTextRepresentation);
    expect(
      (
        await failure(
          db().execute(
            sql`insert into interns (batch_id, username, name, email, color_code)
                values (${batchId}, 'u', 'U', 'u@example.com', 'purple')`,
          ),
        )
      )?.code,
    ).toBe(invalidTextRepresentation);
  });
});

describe('intern_status_events', () => {
  it('accepts the onboarding event without a reason, and a later change with one', async () => {
    const onboarding = await insertEvent({ toStatus: 'active' });
    expect(onboarding).toMatchObject({ fromStatus: null, reason: null });

    await expect(insertEvent({ internId: onboarding.internId, ...notice })).resolves.toMatchObject({
      toStatus: 'on_notice',
      noticeEndsOn: '2027-05-01',
    });
  });

  it('only onboards to active, and a change must change the status', async () => {
    expect(await failure(insertEvent({ toStatus: 'graduated' }))).toEqual(
      checkFailure('intern_status_events_onboarding_check'),
    );
    expect(
      await failure(insertEvent({ fromStatus: 'active', toStatus: 'active', reason: 'Again' })),
    ).toEqual(checkFailure('intern_status_events_change_check'));
  });

  it('needs a reason for every change after onboarding', async () => {
    const constraint = checkFailure('intern_status_events_reason_check');

    expect(await failure(insertEvent({ fromStatus: 'active', toStatus: 'graduated' }))).toEqual(
      constraint,
    );
    expect(
      await failure(insertEvent({ fromStatus: 'active', toStatus: 'graduated', reason: ' \n ' })),
    ).toEqual(constraint);
  });

  it('has notice dates exactly when going on notice, ending after they start', async () => {
    const constraint = checkFailure('intern_status_events_notice_check');

    expect(await failure(insertEvent({ ...notice, noticeStartsOn: null }))).toEqual(constraint);
    // A missing end date must fail too: comparing with NULL would otherwise pass the check.
    expect(await failure(insertEvent({ ...notice, noticeEndsOn: null }))).toEqual(constraint);
    expect(await failure(insertEvent({ ...notice, noticeEndsOn: '2027-04-01' }))).toEqual(
      constraint,
    );
    expect(
      await failure(
        insertEvent({
          fromStatus: 'on_notice',
          toStatus: 'active',
          reason: 'Improved a lot',
          noticeStartsOn: '2027-04-01',
        }),
      ),
    ).toEqual(constraint);
  });

  it('is append-only: updates and deletes are rejected', async () => {
    const event = await insertEvent({ toStatus: 'active' });

    const update = await failure(
      db()
        .update(internStatusEvents)
        .set({ reason: 'Rewritten history' })
        .where(eq(internStatusEvents.id, event.id)),
    );
    const remove = await failure(
      db().delete(internStatusEvents).where(eq(internStatusEvents.id, event.id)),
    );

    expect([update?.code, remove?.code]).toEqual([restrictViolation, restrictViolation]);
    expect(await db().select().from(internStatusEvents)).toHaveLength(1);
  });

  it("rejects an unknown actor, and won't delete an intern with history or a batch with interns", async () => {
    const intern = await insertIntern();
    expect(
      (
        await failure(
          insertEvent({
            internId: intern.id,
            toStatus: 'active',
            actorId: '01890a5d-ac96-774b-bcce-b302099a8057',
          }),
        )
      )?.code,
    ).toBe(foreignKeyViolation);
    await insertEvent({ internId: intern.id, toStatus: 'active' });

    expect((await failure(db().delete(interns).where(eq(interns.id, intern.id))))?.code).toBe(
      foreignKeyViolation,
    );
    expect((await failure(db().delete(batches).where(eq(batches.id, intern.batchId))))?.code).toBe(
      foreignKeyViolation,
    );
  });
});
