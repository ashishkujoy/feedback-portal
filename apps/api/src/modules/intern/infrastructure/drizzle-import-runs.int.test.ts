import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { useTestDb } from '../../../../test/test-db.ts';
import { pgErrorOf } from '../../../shared/db/pg-error.ts';
import { newId } from '../../../shared/ids.ts';
import { createBatch } from '../../cohort/domain/batch.ts';
import { newBatchId } from '../../cohort/domain/batch-id.ts';
import { newBatchMemberId } from '../../cohort/domain/batch-member-id.ts';
import { createBatchRepository } from '../../cohort/infrastructure/drizzle-batch-repository.ts';
import { createUser } from '../../identity/domain/user.ts';
import { newUserId } from '../../identity/domain/user-id.ts';
import { createUserRepository } from '../../identity/infrastructure/drizzle-user-repository.ts';
import { createImportRuns } from './drizzle-import-runs.ts';
import { airtableImports } from './schema.ts';

const testDb = useTestDb();
const db = () => testDb.handle.db;
const t0 = new Date('2027-01-11T09:00:00.000Z');
const t1 = new Date('2027-01-11T09:00:05.000Z');

const started = async () => {
  const pm = newUserId();
  await createUserRepository(db()).save(
    createUser({
      id: pm,
      email: 'pm@example.com',
      name: 'Pat Manager',
      roles: ['program_manager'],
      grantedBy: null,
      now: t0,
    }),
  );
  const batch = createBatch({
    id: newBatchId(),
    name: 'Batch 1',
    startDate: '2027-01-11',
    endDate: '2028-06-25',
    programManager: { id: pm, roles: ['program_manager'], isActive: true },
    memberId: newBatchMemberId(),
    createdBy: pm,
    now: t0,
  });
  await createBatchRepository(db()).save(batch);
  const id = newId();
  await createImportRuns(db()).start({
    id,
    batchId: batch.id,
    baseId: 'appAbCdEfGh123456',
    tableId: 'tblX9mQ2rLk4vP8zz',
    view: 'Batch 2',
    importedBy: pm,
    createdAt: t0,
  });
  return id;
};

const row = async (id: string) =>
  (await db().select().from(airtableImports).where(eq(airtableImports.id, id)))[0];

const codeOf = async (query: Promise<unknown>) => {
  try {
    await query;
  } catch (error) {
    return pgErrorOf(error)?.constraint;
  }
  return undefined;
};

describe('ImportRuns', () => {
  it('starts a run as pending', async () => {
    const id = await started();

    expect(await row(id)).toMatchObject({
      status: 'pending',
      view: 'Batch 2',
      recordCount: 0,
      errors: null,
      failureReason: null,
      completedAt: null,
    });
  });

  it('completes a run with its counts and invalid rows', async () => {
    const id = await started();
    const errors = [{ row: 4, username: null, reasons: ['Username is required.'] }];

    await createImportRuns(db()).complete(id, {
      recordCount: 6,
      createdCount: 3,
      updatedCount: 1,
      skippedCount: 2,
      errors,
      completedAt: t1,
    });

    expect(await row(id)).toMatchObject({
      status: 'completed',
      recordCount: 6,
      createdCount: 3,
      updatedCount: 1,
      skippedCount: 2,
      errors,
      completedAt: t1,
    });
  });

  it('fails a run with the reason', async () => {
    const id = await started();

    await createImportRuns(db()).fail(id, {
      reason: 'Airtable is busy; try again in 30 seconds.',
      completedAt: t1,
    });

    expect(await row(id)).toMatchObject({
      status: 'failed',
      failureReason: 'Airtable is busy; try again in 30 seconds.',
      completedAt: t1,
    });
  });

  it('refuses a finished run without its time, or a failure without a reason', async () => {
    const id = await started();

    expect(
      await codeOf(
        db().update(airtableImports).set({ status: 'completed' }).where(eq(airtableImports.id, id)),
      ),
    ).toBe('airtable_imports_completed_check');
    expect(
      await codeOf(
        db()
          .update(airtableImports)
          .set({ status: 'failed', completedAt: t1 })
          .where(eq(airtableImports.id, id)),
      ),
    ).toBe('airtable_imports_failure_check');
  });
});
