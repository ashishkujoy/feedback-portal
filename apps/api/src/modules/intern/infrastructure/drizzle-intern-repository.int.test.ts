import { eq, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { useTestDb } from '../../../../test/test-db.ts';
import { pgErrorOf } from '../../../shared/db/pg-error.ts';
import { AppError } from '../../../shared/errors/app-error.ts';
import { createBatch } from '../../cohort/domain/batch.ts';
import { type BatchId, newBatchId } from '../../cohort/domain/batch-id.ts';
import { newBatchMemberId } from '../../cohort/domain/batch-member-id.ts';
import { createBatchRepository } from '../../cohort/infrastructure/drizzle-batch-repository.ts';
import { createUser } from '../../identity/domain/user.ts';
import { newUserId, type UserId } from '../../identity/domain/user-id.ts';
import { createUserRepository } from '../../identity/infrastructure/drizzle-user-repository.ts';
import { type DetailsInput, giveNotice, liftNotice, onboardIntern } from '../domain/intern.ts';
import { newInternId } from '../domain/intern-id.ts';
import { newStatusEventId } from '../domain/status-event-id.ts';
import { createInternRepository } from './drizzle-intern-repository.ts';
import { internStatusEvents } from './schema.ts';

const testDb = useTestDb();
const db = () => testDb.handle.db;
const repo = () => createInternRepository(db());

const t0 = new Date('2027-01-11T09:00:00.000Z');
const t1 = new Date('2027-04-01T09:00:00.000Z');
const t2 = new Date('2027-05-01T09:00:00.000Z');

const savedPm = async (): Promise<UserId> => {
  const id = newUserId();
  await createUserRepository(db()).save(
    createUser({
      id,
      email: `pm.${id.slice(-6)}@example.com`,
      name: 'Pat Manager',
      roles: ['program_manager'],
      grantedBy: null,
      now: t0,
    }),
  );
  return id;
};

const savedBatch = async (name: string, pm: UserId): Promise<BatchId> => {
  const batch = createBatch({
    id: newBatchId(),
    name,
    startDate: '2027-01-11',
    endDate: '2028-06-25',
    programManager: { id: pm, roles: ['program_manager'], isActive: true },
    memberId: newBatchMemberId(),
    createdBy: pm,
    now: t0,
  });
  await createBatchRepository(db()).save(batch);
  return batch.id;
};

const details: DetailsInput = {
  username: 'ishita.rao',
  name: 'Ishita Rao',
  email: 'ishita@example.com',
  phone: '+91 98765 43210',
  diplomaBranch: 'Mechanical',
  parentNames: 'Anil and Meera Rao',
  interviewNotes: '**Strong** in maths',
};

const onboard = (batchId: BatchId, actor: UserId, input: DetailsInput = details) =>
  onboardIntern({
    id: newInternId(),
    eventId: newStatusEventId(),
    batchId,
    details: input,
    actor,
    now: t0,
  });

const errorOf = async (action: Promise<unknown>): Promise<AppError> => {
  try {
    await action;
  } catch (error) {
    if (error instanceof AppError) return error;
    throw error;
  }
  throw new Error('expected an AppError');
};

describe('InternRepository', () => {
  it('round-trips an intern with its onboarding event', async () => {
    const pm = await savedPm();
    const intern = onboard(await savedBatch('Batch 1', pm), pm);

    await repo().save(intern);

    expect(await repo().findById(intern.id)).toEqual(intern);
  });

  it('adds only the new events when saved again', async () => {
    const pm = await savedPm();
    const active = onboard(await savedBatch('Batch 1', pm), pm);
    await repo().save(active);
    const onNotice = giveNotice(active, {
      eventId: newStatusEventId(),
      reason: 'Missed every deadline',
      actor: pm,
      now: t1,
      startsOn: '2027-04-01',
      feedbackId: null,
    });
    await repo().save(onNotice);
    const lifted = liftNotice(onNotice, {
      eventId: newStatusEventId(),
      reason: 'Improved',
      actor: pm,
      now: t2,
    });

    await repo().save(lifted);

    expect(await repo().findById(active.id)).toEqual(lifted);
    expect(
      await db()
        .select({ id: internStatusEvents.id })
        .from(internStatusEvents)
        .where(eq(internStatusEvents.internId, active.id)),
    ).toHaveLength(3);
  });

  it('rejects a username already in the batch, in any case', async () => {
    const pm = await savedPm();
    const batchId = await savedBatch('Batch 1', pm);
    await repo().save(onboard(batchId, pm));

    const error = await errorOf(
      repo().save(onboard(batchId, pm, { ...details, username: 'Ishita.RAO' })),
    );

    expect(error).toMatchObject({ kind: 'conflict', code: 'intern_username_taken' });
  });

  it('allows the same username in another batch', async () => {
    const pm = await savedPm();
    await repo().save(onboard(await savedBatch('Batch 1', pm), pm));
    const other = onboard(await savedBatch('Batch 2', pm), pm);

    await repo().save(other);

    expect(await repo().findById(other.id)).toEqual(other);
  });

  it('finds nothing for an unknown id', async () => {
    expect(await repo().findById(newInternId())).toBeNull();
  });
});

describe('findByIdForUpdate', () => {
  it('holds the row until the transaction ends', async () => {
    const pm = await savedPm();
    const intern = onboard(await savedBatch('Batch 1', pm), pm);
    await repo().save(intern);

    const blocked = await db().transaction(async (tx) => {
      expect(await createInternRepository(tx).findByIdForUpdate(intern.id)).toEqual(intern);
      // Another connection gives up quickly instead of waiting for this transaction.
      return db()
        .transaction(async (other) => {
          await other.execute(sql`set local lock_timeout = '200ms'`);
          await createInternRepository(other).findByIdForUpdate(intern.id);
          return null;
        })
        .catch((error: unknown) => pgErrorOf(error)?.code ?? 'unexpected');
    });

    expect(blocked).toBe('55P03');
    // Once it has ended, the row can be locked again.
    expect(
      await db().transaction((tx) => createInternRepository(tx).findByIdForUpdate(intern.id)),
    ).toEqual(intern);
  });
});
