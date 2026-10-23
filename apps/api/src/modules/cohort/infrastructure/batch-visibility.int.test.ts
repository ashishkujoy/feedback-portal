import type { Role } from '@feedback-portal/contracts';
import { describe, expect, it } from 'vitest';
import { useTestDb } from '../../../../test/test-db.ts';
import { createUser } from '../../identity/domain/user.ts';
import { newUserId, type UserId } from '../../identity/domain/user-id.ts';
import { createUserRepository } from '../../identity/infrastructure/drizzle-user-repository.ts';
import type { Viewer } from '../application/batch-scope.ts';
import { assignMember, type Batch, createBatch, unassignMember } from '../domain/batch.ts';
import { newBatchId } from '../domain/batch-id.ts';
import { newBatchMemberId } from '../domain/batch-member-id.ts';
import type { Candidate } from '../domain/candidate.ts';
import { createBatchScope, visibleBatchCondition } from './batch-visibility.ts';
import { createBatchRepository } from './drizzle-batch-repository.ts';
import { batchMembers } from './schema.ts';

const testDb = useTestDb();
const db = () => testDb.handle.db;
const save = (batch: Batch) => createBatchRepository(db()).save(batch);
const canSee = (viewer: Viewer, batch: Batch) => createBatchScope(db()).canSee(viewer, batch.id);

const t0 = new Date('2027-01-11T09:00:00.000Z');
const t1 = new Date('2027-02-01T09:00:00.000Z');
const t2 = new Date('2027-03-01T09:00:00.000Z');
const t3 = new Date('2027-04-01T09:00:00.000Z');

const savedPerson = async (roles: Role[]): Promise<Candidate> => {
  const id = newUserId();
  await createUserRepository(db()).save(
    createUser({
      id,
      email: `${id}@example.com`,
      name: 'Someone',
      roles,
      grantedBy: null,
      now: t0,
    }),
  );
  return { id, roles, isActive: true };
};

const member = (candidate: Candidate): Viewer => ({ id: candidate.id, isAdmin: false });

/** Batch changes made by `by`. */
const changesBy = (by: UserId) => ({
  assign: (on: Batch, who: Candidate, role: 'mentor' | 'program_manager', now: Date) =>
    assignMember(on, { candidate: who, role, memberId: newBatchMemberId(), by, now }),
  unassign: (on: Batch, who: Candidate, now: Date) =>
    unassignMember(on, { userId: who.id, role: 'mentor', by, now }),
});

/** An admin, two saved batches with different PMs, and a mentor on neither yet. */
const setUp = async () => {
  const admin = await savedPerson(['admin']);
  const pmA = await savedPerson(['program_manager']);
  const pmB = await savedPerson(['program_manager']);
  const mentor = await savedPerson(['mentor']);
  const batch = (name: string, pm: Candidate) =>
    createBatch({
      id: newBatchId(),
      name,
      startDate: '2027-01-11',
      endDate: '2028-06-25',
      programManager: pm,
      memberId: newBatchMemberId(),
      createdBy: admin.id,
      now: t0,
    });
  const a = batch('A', pmA);
  const b = batch('B', pmB);
  await save(a);
  await save(b);
  return { admin, pmA, pmB, mentor, a, b, ...changesBy(admin.id) };
};

describe('visibleBatchCondition / BatchScope', () => {
  it('lets an admin see every batch, but not one that does not exist', async () => {
    const { admin, a, b } = await setUp();
    const asAdmin = { id: admin.id, isAdmin: true };

    expect([await canSee(asAdmin, a), await canSee(asAdmin, b)]).toEqual([true, true]);
    expect(await createBatchScope(db()).canSee(asAdmin, newBatchId())).toBe(false);
  });

  it("lets a PM see the batch they run, and not another PM's", async () => {
    const { pmA, a, b } = await setUp();

    expect([await canSee(member(pmA), a), await canSee(member(pmA), b)]).toEqual([true, false]);
  });

  it('follows a mentor through assignment, unassignment and re-assignment', async () => {
    const { mentor, a, b, assign, unassign } = await setUp();
    expect(await canSee(member(mentor), a)).toBe(false);

    const assigned = assign(a, mentor, 'mentor', t1);
    await save(assigned);
    expect([await canSee(member(mentor), a), await canSee(member(mentor), b)]).toEqual([
      true,
      false,
    ]);

    const left = unassign(assigned, mentor, t2);
    await save(left);
    expect(await canSee(member(mentor), a)).toBe(false);

    await save(assign(left, mentor, 'mentor', t3));
    expect(await canSee(member(mentor), a)).toBe(true);
  });

  it('drops a PM once they are replaced', async () => {
    const { pmA, pmB, a, assign } = await setUp();

    await save(assign(a, pmB, 'program_manager', t1));

    expect(await canSee(member(pmA), a)).toBe(false);
    expect(await canSee(member(pmB), a)).toBe(true);
  });

  it('works in a query over batch_members itself (it is aliased)', async () => {
    const { pmA, a } = await setUp();

    const rows = await db()
      .select({ batchId: batchMembers.batchId })
      .from(batchMembers)
      .where(visibleBatchCondition(member(pmA), batchMembers.batchId));

    expect(rows).toEqual([{ batchId: a.id }]);
  });
});
