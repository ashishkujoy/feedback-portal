import { describe, expect, it } from 'vitest';
import { useTestDb } from '../../../../test/test-db.ts';
import { noInterns } from '../../cohort/application/intern-counts.ts';
import { createBatch } from '../../cohort/domain/batch.ts';
import { type BatchId, newBatchId } from '../../cohort/domain/batch-id.ts';
import { newBatchMemberId } from '../../cohort/domain/batch-member-id.ts';
import { createBatchRepository } from '../../cohort/infrastructure/drizzle-batch-repository.ts';
import { createUser } from '../../identity/domain/user.ts';
import { newUserId, type UserId } from '../../identity/domain/user-id.ts';
import { createUserRepository } from '../../identity/infrastructure/drizzle-user-repository.ts';
import { type Intern, onboardIntern } from '../domain/intern.ts';
import { newInternId } from '../domain/intern-id.ts';
import { newStatusEventId } from '../domain/status-event-id.ts';
import { createInternCounts } from './drizzle-intern-counts.ts';
import { createInternRepository } from './drizzle-intern-repository.ts';

const testDb = useTestDb();
const db = () => testDb.handle.db;
const t0 = new Date('2027-01-11T09:00:00.000Z');

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

let n = 0;
/** An intern with a colour and status as later tasks will set them; the counts only read them. */
const saved = async (batchId: BatchId, pm: UserId, overrides: Partial<Intern> = {}) => {
  n += 1;
  const intern = onboardIntern({
    id: newInternId(),
    eventId: newStatusEventId(),
    batchId,
    details: { username: `intern.${n}`, name: `Intern ${n}`, email: `intern${n}@example.com` },
    actor: pm,
    now: t0,
  });
  await createInternRepository(db()).save({ ...intern, ...overrides });
};

describe('InternCounts', () => {
  it('counts every intern of each batch, by status and colour', async () => {
    const pm = await savedPm();
    const main = await savedBatch('Batch 1', pm);
    const other = await savedBatch('Batch 2', pm);
    const empty = await savedBatch('Batch 3', pm);
    await saved(main, pm, { colorCode: 'green' });
    await saved(main, pm, { colorCode: 'green', status: 'graduated' });
    await saved(main, pm, { colorCode: 'red', status: 'on_notice', noticeEndsOn: '2027-05-01' });
    await saved(main, pm, { colorCode: 'red', status: 'terminated' });
    await saved(main, pm, { colorCode: 'borderline_yellow' });
    await saved(main, pm);
    await saved(other, pm, { colorCode: 'orange', status: 'terminated' });

    const counts = await createInternCounts(db())([main, other, empty]);

    expect(counts.get(main)).toEqual({
      total: 6,
      onNotice: 1,
      terminated: 1,
      colours: {
        green: 2,
        yellow: 0,
        borderline_yellow: 1,
        orange: 0,
        borderline_red: 0,
        red: 2,
        none: 1,
      },
    });
    expect(counts.get(other)).toEqual({
      ...noInterns,
      total: 1,
      terminated: 1,
      colours: { ...noInterns.colours, orange: 1 },
    });
    expect(counts.has(empty)).toBe(false);
  });

  it('asks nothing for no batches', async () => {
    expect((await createInternCounts(db())([])).size).toBe(0);
  });
});
