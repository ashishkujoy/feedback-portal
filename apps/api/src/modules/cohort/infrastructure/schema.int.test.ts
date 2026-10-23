import { eq, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { useTestDb } from '../../../../test/test-db.ts';
import { pgErrorCodes, pgErrorOf, type PgErrorInfo } from '../../../shared/db/pg-error.ts';
import { users } from '../../identity/infrastructure/schema.ts';
import { batches, batchMembers } from './schema.ts';

const testDb = useTestDb();
const db = () => testDb.handle.db;

const uuidV7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const { uniqueViolation, foreignKeyViolation, invalidTextRepresentation, checkViolation } =
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

let userCount = 0;
const insertUser = async () => {
  userCount += 1;
  const [user] = await db()
    .insert(users)
    .values({ email: `user${userCount}@example.com`, name: `User ${userCount}` })
    .returning();
  if (!user) throw new Error('insert returned no row');
  return user.id;
};

const insertBatch = async (values: Partial<typeof batches.$inferInsert> = {}) => {
  const createdBy = values.createdBy ?? (await insertUser());
  const [batch] = await db()
    .insert(batches)
    .values({
      name: `Batch ${userCount}`,
      startDate: '2027-01-11',
      endDate: '2028-06-25',
      createdBy,
      ...values,
    })
    .returning();
  if (!batch) throw new Error('insert returned no row');
  return batch;
};

type Assignment = Pick<typeof batchMembers.$inferInsert, 'batchId' | 'userId' | 'role'> &
  Partial<typeof batchMembers.$inferInsert>;

const assign = async (values: Assignment) => {
  const assignedBy = values.assignedBy ?? (await insertUser());
  const [member] = await db()
    .insert(batchMembers)
    .values({ assignedBy, ...values })
    .returning();
  if (!member) throw new Error('insert returned no row');
  return member;
};

const unassign = async (id: string) => {
  const by = await insertUser();
  await db()
    .update(batchMembers)
    // The database's clock, like assigned_at's default, so the order can't depend on clock skew.
    .set({ unassignedAt: sql`now()`, unassignedBy: by })
    .where(eq(batchMembers.id, id));
};

describe('batches', () => {
  it('fills id (uuid v7), is_archived and timestamps from defaults', async () => {
    const batch = await insertBatch();

    expect(batch.id).toMatch(uuidV7);
    expect(batch.isArchived).toBe(false);
    expect(batch.startDate).toBe('2027-01-11');
    expect(batch.createdAt).toBeInstanceOf(Date);
    expect(batch.updatedAt).toBeInstanceOf(Date);
  });

  it('rejects a name that differs only in case', async () => {
    await insertBatch({ name: 'Batch One' });

    expect(await failure(insertBatch({ name: 'batch ONE' }))).toEqual({
      code: uniqueViolation,
      constraint: 'batches_name_unique',
    });
  });

  it('rejects an end date on or before the start', async () => {
    const constraint = { code: checkViolation, constraint: 'batches_dates_check' };

    expect(await failure(insertBatch({ endDate: '2027-01-11' }))).toEqual(constraint);
    expect(await failure(insertBatch({ endDate: '2026-12-31' }))).toEqual(constraint);
  });

  it('rejects an unknown creator', async () => {
    expect(
      (await failure(insertBatch({ createdBy: '01890a5d-ac96-774b-bcce-b302099a8057' })))?.code,
    ).toBe(foreignKeyViolation);
  });
});

describe('one programme manager per batch', () => {
  it('rejects a second current PM', async () => {
    const batch = await insertBatch();
    await assign({ batchId: batch.id, userId: await insertUser(), role: 'program_manager' });

    expect(
      await failure(
        assign({ batchId: batch.id, userId: await insertUser(), role: 'program_manager' }),
      ),
    ).toEqual({ code: uniqueViolation, constraint: 'batch_members_one_pm_unique' });
  });

  it('accepts a new PM once the previous one is unassigned', async () => {
    const batch = await insertBatch();
    const first = await assign({
      batchId: batch.id,
      userId: await insertUser(),
      role: 'program_manager',
    });
    await unassign(first.id);

    await assign({ batchId: batch.id, userId: await insertUser(), role: 'program_manager' });

    const pms = await db()
      .select()
      .from(batchMembers)
      .where(eq(batchMembers.batchId, batch.id))
      .orderBy(batchMembers.id); // uuid v7: creation order
    expect(pms.map((pm) => pm.unassignedAt === null)).toEqual([false, true]);
  });

  it('lets one person be the current PM of several batches', async () => {
    const pm = await insertUser();

    await assign({ batchId: (await insertBatch()).id, userId: pm, role: 'program_manager' });
    await expect(
      assign({ batchId: (await insertBatch()).id, userId: pm, role: 'program_manager' }),
    ).resolves.toMatchObject({ userId: pm, unassignedAt: null });
  });

  it('allows any number of current mentors', async () => {
    const batch = await insertBatch();

    await assign({ batchId: batch.id, userId: await insertUser(), role: 'mentor' });
    await expect(
      assign({ batchId: batch.id, userId: await insertUser(), role: 'mentor' }),
    ).resolves.toMatchObject({ role: 'mentor', unassignedAt: null });
  });
});

describe('current assignments', () => {
  it('rejects the same mentor twice on a batch', async () => {
    const batch = await insertBatch();
    const mentor = await insertUser();
    await assign({ batchId: batch.id, userId: mentor, role: 'mentor' });

    expect(await failure(assign({ batchId: batch.id, userId: mentor, role: 'mentor' }))).toEqual({
      code: uniqueViolation,
      constraint: 'batch_members_current_unique',
    });
  });

  it('keeps history: a mentor can be assigned again after being unassigned', async () => {
    const batch = await insertBatch();
    const mentor = await insertUser();
    const first = await assign({ batchId: batch.id, userId: mentor, role: 'mentor' });
    await unassign(first.id);

    await assign({ batchId: batch.id, userId: mentor, role: 'mentor' });

    expect(
      await db().select().from(batchMembers).where(eq(batchMembers.userId, mentor)),
    ).toHaveLength(2);
  });

  it('lets one person be both mentor and PM of a batch', async () => {
    const batch = await insertBatch();
    const person = await insertUser();

    await assign({ batchId: batch.id, userId: person, role: 'program_manager' });
    await expect(
      assign({ batchId: batch.id, userId: person, role: 'mentor' }),
    ).resolves.toMatchObject({ userId: person, role: 'mentor' });
  });

  it('rejects a role that is not a batch role', async () => {
    const batch = await insertBatch();
    const by = await insertUser();
    const user = await insertUser();

    expect(
      (
        await failure(
          db().execute(
            sql`insert into batch_members (batch_id, user_id, role, assigned_by)
                values (${batch.id}, ${user}, 'admin', ${by})`,
          ),
        )
      )?.code,
    ).toBe(invalidTextRepresentation);
  });
});

describe('unassignment checks', () => {
  it('needs both who and when', async () => {
    const batch = await insertBatch();
    const constraint = { code: checkViolation, constraint: 'batch_members_unassigned_check' };

    expect(
      await failure(
        assign({
          batchId: batch.id,
          userId: await insertUser(),
          role: 'mentor',
          // Both fixed, so only this check can fail: the database's now() may run ahead of ours.
          assignedAt: new Date('2027-01-11T09:00:00Z'),
          unassignedAt: new Date('2027-02-01T09:00:00Z'),
        }),
      ),
    ).toEqual(constraint);
    expect(
      await failure(
        assign({
          batchId: batch.id,
          userId: await insertUser(),
          role: 'mentor',
          unassignedBy: await insertUser(),
        }),
      ),
    ).toEqual(constraint);
  });

  it('rejects an unassignment before the assignment', async () => {
    const batch = await insertBatch();

    expect(
      await failure(
        assign({
          batchId: batch.id,
          userId: await insertUser(),
          role: 'mentor',
          assignedAt: new Date('2027-02-01T00:00:00Z'),
          unassignedAt: new Date('2027-01-31T00:00:00Z'),
          unassignedBy: await insertUser(),
        }),
      ),
    ).toEqual({ code: checkViolation, constraint: 'batch_members_unassigned_after_check' });
  });
});

describe('deletes', () => {
  it("won't delete a batch that has members, or a user who created a batch", async () => {
    const creator = await insertUser();
    const batch = await insertBatch({ createdBy: creator });
    await assign({ batchId: batch.id, userId: await insertUser(), role: 'mentor' });

    expect((await failure(db().delete(batches).where(eq(batches.id, batch.id))))?.code).toBe(
      foreignKeyViolation,
    );
    expect((await failure(db().delete(users).where(eq(users.id, creator))))?.code).toBe(
      foreignKeyViolation,
    );
  });
});
