import type { Role } from '@feedback-portal/contracts';
import { describe, expect, it } from 'vitest';
import { AppError } from '../../../shared/errors/app-error.ts';
import { newUserId } from '../../identity/domain/user-id.ts';
import {
  archiveBatch,
  assignMember,
  type Batch,
  type CreateBatchInput,
  createBatch,
  currentMembers,
  currentProgramManager,
  isCurrentMember,
  unassignMember,
} from './batch.ts';
import { newBatchId } from './batch-id.ts';
import { newBatchMemberId } from './batch-member-id.ts';
import type { Candidate } from './candidate.ts';

const t0 = new Date('2027-01-11T09:00:00Z');
const t1 = new Date('2027-02-01T09:00:00Z');
const t2 = new Date('2027-03-01T09:00:00Z');
const admin = newUserId();

const person = (roles: readonly Role[], isActive = true): Candidate => ({
  id: newUserId(),
  roles,
  isActive,
});

const pm = person(['program_manager']);

const input = (overrides: Partial<CreateBatchInput> = {}): CreateBatchInput => ({
  id: newBatchId(),
  name: 'Batch 1',
  startDate: '2027-01-11',
  endDate: '2028-06-25',
  programManager: pm,
  memberId: newBatchMemberId(),
  createdBy: admin,
  now: t0,
  ...overrides,
});

const errorOf = (action: () => unknown): AppError => {
  try {
    action();
  } catch (error) {
    if (error instanceof AppError) return error;
    throw error;
  }
  throw new Error('expected an AppError');
};

const assign = (batch: Batch, candidate: Candidate, role: 'mentor' | 'program_manager', now = t1) =>
  assignMember(batch, { candidate, role, memberId: newBatchMemberId(), by: admin, now });

const unassign = (batch: Batch, userId: Candidate['id'], role: 'mentor' | 'program_manager') =>
  unassignMember(batch, { userId, role, by: admin, now: t2 });

const current = (batch: Batch) =>
  currentMembers(batch).map((member) => [member.userId, member.role]);

describe('createBatch', () => {
  it('trims the name and starts with the PM as the only current member', () => {
    const batch = createBatch(input({ name: '  Batch 1 ' }));

    expect(batch).toMatchObject({
      name: 'Batch 1',
      startDate: '2027-01-11',
      endDate: '2028-06-25',
      isArchived: false,
      createdBy: admin,
      createdAt: t0,
      updatedAt: t0,
    });
    expect(batch.members).toEqual([
      {
        id: expect.any(String),
        userId: pm.id,
        role: 'program_manager',
        assignedBy: admin,
        assignedAt: t0,
        unassignedAt: null,
        unassignedBy: null,
      },
    ]);
  });

  it('reports every invalid field together', () => {
    const error = errorOf(() =>
      createBatch(input({ name: '   ', startDate: '2027-02-30', endDate: 'soon' })),
    );

    expect(error.code).toBe('validation_failed');
    expect(error.issues?.map((issue) => issue.path)).toEqual(['name', 'startDate', 'endDate']);
  });

  it('rejects a name over 100 characters', () => {
    expect(errorOf(() => createBatch(input({ name: 'x'.repeat(101) }))).issues).toEqual([
      { path: 'name', message: 'Name must be at most 100 characters' },
    ]);
  });

  it('needs the end date after the start', () => {
    for (const endDate of ['2027-01-11', '2026-12-31']) {
      expect(errorOf(() => createBatch(input({ endDate }))).issues).toEqual([
        { path: 'endDate', message: 'End date must be after the start date' },
      ]);
    }
  });

  it('needs a PM who holds the Programme manager role and is active', () => {
    expect(errorOf(() => createBatch(input({ programManager: person(['mentor']) }))).code).toBe(
      'member_role_mismatch',
    );
    expect(
      errorOf(() => createBatch(input({ programManager: person(['program_manager'], false) })))
        .code,
    ).toBe('member_inactive');
  });
});

describe('assignMember', () => {
  it('adds a mentor as a current member', () => {
    const mentor = person(['mentor']);

    const batch = assign(createBatch(input()), mentor, 'mentor');

    expect(current(batch)).toEqual([
      [pm.id, 'program_manager'],
      [mentor.id, 'mentor'],
    ]);
    expect(batch.members.at(-1)).toMatchObject({ assignedBy: admin, assignedAt: t1 });
    expect(batch.updatedAt).toBe(t1);
  });

  it('is a no-op for someone already assigned in that role', () => {
    const mentor = person(['mentor']);
    const batch = assign(createBatch(input()), mentor, 'mentor');

    expect(assign(batch, mentor, 'mentor', t2)).toBe(batch);
    expect(assign(batch, pm, 'program_manager', t2)).toBe(batch);
  });

  it('needs the matching global role', () => {
    const batch = createBatch(input());

    const notMentor = errorOf(() => assign(batch, person(['program_manager', 'admin']), 'mentor'));
    expect(notMentor).toMatchObject({ kind: 'conflict', code: 'member_role_mismatch' });
    expect(errorOf(() => assign(batch, person(['mentor']), 'program_manager')).code).toBe(
      'member_role_mismatch',
    );
  });

  it('rejects an inactive person', () => {
    expect(
      errorOf(() => assign(createBatch(input()), person(['mentor'], false), 'mentor')).code,
    ).toBe('member_inactive');
  });

  it('rejects any change to an archived batch', () => {
    const archived = archiveBatch(createBatch(input()), { now: t1 });

    expect(errorOf(() => assign(archived, person(['mentor']), 'mentor')).code).toBe(
      'batch_archived',
    );
  });

  it('replaces the PM: the old assignment ends and the new one starts', () => {
    const next = person(['program_manager']);

    const batch = assign(createBatch(input()), next, 'program_manager');

    expect(currentProgramManager(batch)?.userId).toBe(next.id);
    expect(
      currentMembers(batch).filter((member) => member.role === 'program_manager'),
    ).toHaveLength(1);
    expect(batch.members.find((member) => member.userId === pm.id)).toMatchObject({
      unassignedAt: t1,
      unassignedBy: admin,
    });
  });

  it('lets one person be mentor and PM of the same batch', () => {
    const both = person(['program_manager', 'mentor']);

    const batch = assign(assign(createBatch(input()), both, 'program_manager'), both, 'mentor');

    expect(current(batch)).toEqual([
      [both.id, 'program_manager'],
      [both.id, 'mentor'],
    ]);
  });

  it('adds a new history row when someone is assigned again', () => {
    const mentor = person(['mentor']);
    const left = unassign(assign(createBatch(input()), mentor, 'mentor'), mentor.id, 'mentor');

    const back = assign(left, mentor, 'mentor', t2);

    const rows = back.members.filter((member) => member.userId === mentor.id);
    expect(rows.map((row) => row.unassignedAt)).toEqual([t2, null]);
    expect(new Set(rows.map((row) => row.id)).size).toBe(2);
  });
});

describe('unassignMember', () => {
  it("ends a mentor's assignment and keeps the row", () => {
    const mentor = person(['mentor']);
    const batch = assign(createBatch(input()), mentor, 'mentor');

    const after = unassign(batch, mentor.id, 'mentor');

    expect(current(after)).toEqual([[pm.id, 'program_manager']]);
    expect(after.members).toHaveLength(2);
    expect(after.members.at(-1)).toMatchObject({ unassignedAt: t2, unassignedBy: admin });
    expect(after.updatedAt).toBe(t2);
  });

  it('is a no-op for someone not currently assigned', () => {
    const batch = createBatch(input());

    expect(unassign(batch, newUserId(), 'mentor')).toBe(batch);
    expect(unassign(batch, pm.id, 'mentor')).toBe(batch);
  });

  it("won't leave a batch without a PM", () => {
    expect(errorOf(() => unassign(createBatch(input()), pm.id, 'program_manager'))).toMatchObject({
      kind: 'conflict',
      code: 'batch_requires_pm',
    });
  });

  it('rejects any change to an archived batch', () => {
    const mentor = person(['mentor']);
    const archived = archiveBatch(assign(createBatch(input()), mentor, 'mentor'), { now: t2 });

    expect(errorOf(() => unassign(archived, mentor.id, 'mentor')).code).toBe('batch_archived');
  });
});

describe('archiveBatch', () => {
  it('archives, keeps the members, and is a no-op the second time', () => {
    const mentor = person(['mentor']);
    const batch = assign(createBatch(input()), mentor, 'mentor');

    const archived = archiveBatch(batch, { now: t2 });

    expect(archived).toMatchObject({ isArchived: true, updatedAt: t2 });
    expect(current(archived)).toEqual(current(batch));
    expect(archiveBatch(archived, { now: t2 })).toBe(archived);
  });
});

describe('isCurrentMember', () => {
  it('is true for a current member in any role, and false once unassigned', () => {
    const mentor = person(['mentor']);
    const batch = assign(createBatch(input()), mentor, 'mentor');

    expect(isCurrentMember(batch, pm.id)).toBe(true);
    expect(isCurrentMember(batch, mentor.id)).toBe(true);
    expect(isCurrentMember(unassign(batch, mentor.id, 'mentor'), mentor.id)).toBe(false);
    expect(isCurrentMember(batch, newUserId())).toBe(false);
  });
});
