import type { Role } from '@feedback-portal/contracts';
import { describe, expect, it } from 'vitest';
import { useTestDb } from '../../../../test/test-db.ts';
import { AppError } from '../../../shared/errors/app-error.ts';
import { createUser, deactivate } from '../../identity/domain/user.ts';
import { newUserId, type UserId } from '../../identity/domain/user-id.ts';
import { createUserRepository } from '../../identity/infrastructure/drizzle-user-repository.ts';
import { createInternCounts } from '../../intern/infrastructure/drizzle-intern-counts.ts';
import {
  archiveBatch,
  assignMember,
  type Batch,
  createBatch,
  unassignMember,
} from '../domain/batch.ts';
import { newBatchId } from '../domain/batch-id.ts';
import { newBatchMemberId } from '../domain/batch-member-id.ts';
import { createBatchQueries } from './drizzle-batch-queries.ts';
import { createBatchRepository } from './drizzle-batch-repository.ts';
import { createCandidates } from './drizzle-candidates.ts';
import { createRoleAssignments } from './drizzle-role-assignments.ts';

const testDb = useTestDb();
const db = () => testDb.handle.db;
const repo = () => createBatchRepository(db());
/** These tests are about the data; scoping has its own tests (batch-visibility). */
const asAdmin = { id: newUserId(), isAdmin: true };

const t0 = new Date('2027-01-11T09:00:00.000Z');
const t1 = new Date('2027-02-01T09:00:00.000Z');
const t2 = new Date('2027-03-01T09:00:00.000Z');

const savedUser = async (name: string, roles: Role[], active = true) => {
  const id = newUserId();
  let user = createUser({
    id,
    email: `${name.split(' ')[0]?.toLowerCase() ?? 'x'}.${id.slice(-6)}@example.com`,
    name,
    roles,
    grantedBy: null,
    now: t0,
  });
  if (!active) user = deactivate(user, { by: newUserId(), now: t0 });
  await createUserRepository(db()).save(user);
  return { id: user.id, roles, isActive: active };
};

const newBatch = (
  name: string,
  pm: { id: UserId; roles: Role[]; isActive: boolean },
  createdBy: UserId,
  startDate = '2027-01-11',
) =>
  createBatch({
    id: newBatchId(),
    name,
    startDate,
    endDate: '2028-06-25',
    programManager: pm,
    memberId: newBatchMemberId(),
    createdBy,
    now: t0,
  });

const assign = (
  batch: Batch,
  candidate: Parameters<typeof assignMember>[1]['candidate'],
  role: 'mentor' | 'program_manager',
  by: UserId,
  now = t1,
) => assignMember(batch, { candidate, role, memberId: newBatchMemberId(), by, now });

describe('BatchRepository', () => {
  it('round-trips a batch with its member history', async () => {
    const admin = await savedUser('Ada Admin', ['admin']);
    const pm = await savedUser('Pat Manager', ['program_manager']);
    const mentor = await savedUser('Mo Mentor', ['mentor']);
    const created = newBatch('Batch 1', pm, admin.id);
    await repo().save(created);

    const withMentor = assign(created, mentor, 'mentor', admin.id);
    await repo().save(withMentor);
    const ended = unassignMember(withMentor, {
      userId: mentor.id,
      role: 'mentor',
      by: admin.id,
      now: t2,
    });
    await repo().save(archiveBatch(ended, { now: t2 }));

    expect(await repo().findById(created.id)).toEqual(archiveBatch(ended, { now: t2 }));
  });

  it('returns null for an unknown batch', async () => {
    expect(await repo().findById(newBatchId())).toBeNull();
  });

  it('reports a name taken in any case as batch_name_taken', async () => {
    const admin = await savedUser('Ada Admin', ['admin']);
    const pm = await savedUser('Pat Manager', ['program_manager']);
    await repo().save(newBatch('Batch One', pm, admin.id));

    const error = await repo()
      .save(newBatch('BATCH one', pm, admin.id))
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ kind: 'conflict', code: 'batch_name_taken' });
  });
});

describe('BatchQueries', () => {
  it('lists active batches first, newest first, with the PM and mentor count', async () => {
    const admin = await savedUser('Ada Admin', ['admin']);
    const pm = await savedUser('Pat Manager', ['program_manager']);
    const mentor = await savedUser('Mo Mentor', ['mentor']);
    const older = newBatch('Older', pm, admin.id, '2026-01-12');
    const newer = assign(newBatch('Newer', pm, admin.id, '2027-01-11'), mentor, 'mentor', admin.id);
    const archived = archiveBatch(newBatch('Archived', pm, admin.id, '2027-06-01'), { now: t1 });
    await Promise.all([older, newer, archived].map((batch) => repo().save(batch)));

    const summaries = await createBatchQueries(db(), createInternCounts).listSummaries(asAdmin);

    expect(summaries.map((batch) => [batch.name, batch.isArchived, batch.mentorCount])).toEqual([
      ['Newer', false, 1],
      ['Older', false, 0],
      ['Archived', true, 0],
    ]);
    expect(summaries[0]?.mentors).toEqual([{ id: mentor.id, name: 'Mo Mentor', avatarUrl: null }]);
    expect(summaries[0]?.programManager).toEqual({
      id: pm.id,
      name: 'Pat Manager',
      avatarUrl: null,
    });
  });

  it('gives a batch with current and past members, with names, in assignment order', async () => {
    const admin = await savedUser('Ada Admin', ['admin']);
    const pm = await savedUser('Pat Manager', ['program_manager']);
    // Deactivated after being assigned: the stored user is inactive.
    const mentor = await savedUser('Mo Mentor', ['mentor'], false);
    const assigned = assign(
      newBatch('Batch 1', pm, admin.id),
      { ...mentor, isActive: true },
      'mentor',
      admin.id,
    );
    const batch = unassignMember(assigned, {
      userId: mentor.id,
      role: 'mentor',
      by: admin.id,
      now: t2,
    });
    await repo().save(batch);

    const detail = await createBatchQueries(db(), createInternCounts).detail(batch.id, asAdmin);

    expect(detail?.members[0]?.user.email).toMatch(/^pat\.\w+@example\.com$/);
    expect(
      detail?.members.map((member) => [
        member.user.name,
        member.role,
        member.user.isActive,
        member.unassignedAt,
      ]),
    ).toEqual([
      ['Pat Manager', 'program_manager', true, null],
      ['Mo Mentor', 'mentor', false, t2],
    ]);
    expect(detail?.mentorCount).toBe(0);
    expect(
      await createBatchQueries(db(), createInternCounts).detail(newBatchId(), asAdmin),
    ).toBeNull();
  });
});

describe('Candidates and RoleAssignments', () => {
  it('builds a candidate from the user, or null', async () => {
    const mentor = await savedUser('Mo Mentor', ['mentor', 'program_manager'], false);

    expect(await createCandidates(db())(mentor.id)).toEqual({
      id: mentor.id,
      roles: ['mentor', 'program_manager'],
      isActive: false,
    });
    expect(await createCandidates(db())(newUserId())).toBeNull();
  });

  it('names the batches where a user currently holds the role, and not past ones', async () => {
    const admin = await savedUser('Ada Admin', ['admin']);
    const pm = await savedUser('Pat Manager', ['program_manager', 'mentor']);
    const b = assign(newBatch('B batch', pm, admin.id), pm, 'mentor', admin.id);
    const a = newBatch('A batch', pm, admin.id);
    const left = unassignMember(assign(newBatch('C batch', pm, admin.id), pm, 'mentor', admin.id), {
      userId: pm.id,
      role: 'mentor',
      by: admin.id,
      now: t2,
    });
    await Promise.all([b, a, left].map((batch) => repo().save(batch)));
    const assignments = createRoleAssignments(db());

    expect(await assignments(pm.id, 'program_manager')).toEqual(['A batch', 'B batch', 'C batch']);
    expect(await assignments(pm.id, 'mentor')).toEqual(['B batch']);
    expect(await assignments(admin.id, 'mentor')).toEqual([]);
  });
});
