import type { BatchMemberRole } from '@feedback-portal/contracts';
import { z } from 'zod';
import { conflict, validationFailed } from '../../../shared/errors/app-error.ts';
import { fieldIssues } from '../../../shared/errors/field-issues.ts';
import type { UserId } from '../../identity/domain/user-id.ts';
import type { BatchId } from './batch-id.ts';
import type { BatchMemberId } from './batch-member-id.ts';
import type { Candidate } from './candidate.ts';

/** One assignment. `unassignedAt: null` means it is current; ended ones stay as history. */
export type BatchMember = Readonly<{
  id: BatchMemberId;
  userId: UserId;
  role: BatchMemberRole;
  assignedBy: UserId;
  assignedAt: Date;
  unassignedAt: Date | null;
  unassignedBy: UserId | null;
}>;

export type Batch = Readonly<{
  id: BatchId;
  name: string;
  /** `YYYY-MM-DD`: a calendar date, with no time zone to shift it. */
  startDate: string;
  endDate: string;
  /** Read-only once archived; there is no unarchiving. */
  isArchived: boolean;
  createdBy: UserId;
  createdAt: Date;
  updatedAt: Date;
  /** Part of the aggregate: `batch_members` rows are owned by their batch. Never deleted. */
  members: readonly BatchMember[];
}>;

const NewBatch = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, { error: 'Name is required' })
      .max(100, { error: 'Name must be at most 100 characters' }),
    startDate: z.iso.date({ error: 'Start date must be a valid date' }),
    endDate: z.iso.date({ error: 'End date must be a valid date' }),
  })
  // ISO dates compare correctly as strings.
  .refine((batch) => batch.endDate > batch.startDate, {
    error: 'End date must be after the start date',
    path: ['endDate'],
    // Only once both dates are valid; an invalid one already has its own message.
    when: ({ issues }) =>
      !issues.some((issue) => issue.path?.[0] === 'startDate' || issue.path?.[0] === 'endDate'),
  });

/** The global role a batch role needs: a batch mentor must be a Mentor, a batch PM a PM. */
const requiredRole = {
  mentor: 'mentor',
  program_manager: 'program_manager',
} as const satisfies Record<BatchMemberRole, BatchMemberRole>;

const isCurrent = (member: BatchMember): boolean => member.unassignedAt === null;

export const currentMembers = (batch: Batch): BatchMember[] => batch.members.filter(isCurrent);

export const currentProgramManager = (batch: Batch): BatchMember | undefined =>
  batch.members.find((member) => isCurrent(member) && member.role === 'program_manager');

/** In any role: what visibility (6.4) checks. */
export const isCurrentMember = (batch: Batch, userId: UserId): boolean =>
  batch.members.some((member) => isCurrent(member) && member.userId === userId);

const ensureEditable = (batch: Batch): void => {
  if (batch.isArchived) throw conflict('This batch is archived', 'batch_archived');
};

const ensureEligible = (candidate: Candidate, role: BatchMemberRole): void => {
  if (!candidate.roles.includes(requiredRole[role])) {
    throw conflict(
      role === 'mentor'
        ? 'Only users with the Mentor role can be a batch mentor'
        : 'Only users with the Programme manager role can be a batch PM',
      'member_role_mismatch',
    );
  }
  if (!candidate.isActive) throw conflict('This user is inactive', 'member_inactive');
};

const endAssignment = (member: BatchMember, by: UserId, now: Date): BatchMember => ({
  ...member,
  unassignedAt: now,
  unassignedBy: by,
});

export type CreateBatchInput = Readonly<{
  id: BatchId;
  name: string;
  startDate: string;
  endDate: string;
  /** A batch always has exactly one PM, so it starts with one. */
  programManager: Candidate;
  memberId: BatchMemberId;
  createdBy: UserId;
  now: Date;
}>;

/**
 * Every operation returns a new `Batch`, or the same object when nothing changes, so callers can
 * skip the write with `next === batch`. Time, ids and the actor come from the caller.
 */
export const createBatch = ({
  id,
  name,
  startDate,
  endDate,
  programManager,
  memberId,
  createdBy,
  now,
}: CreateBatchInput): Batch => {
  const result = NewBatch.safeParse({ name, startDate, endDate });
  if (!result.success) throw validationFailed(fieldIssues(result.error));
  ensureEligible(programManager, 'program_manager');
  return {
    id,
    ...result.data,
    isArchived: false,
    createdBy,
    createdAt: now,
    updatedAt: now,
    members: [
      {
        id: memberId,
        userId: programManager.id,
        role: 'program_manager',
        assignedBy: createdBy,
        assignedAt: now,
        unassignedAt: null,
        unassignedBy: null,
      },
    ],
  };
};

export type AssignMemberInput = Readonly<{
  candidate: Candidate;
  role: BatchMemberRole;
  /** The id for the new assignment, if one is made. */
  memberId: BatchMemberId;
  by: UserId;
  now: Date;
}>;

/**
 * Assigning someone already assigned in that role is a no-op. Assigning a PM **replaces** the
 * current one in the same step, so a batch never has none or two.
 */
export const assignMember = (
  batch: Batch,
  { candidate, role, memberId, by, now }: AssignMemberInput,
): Batch => {
  ensureEditable(batch);
  ensureEligible(candidate, role);
  const already = batch.members.some(
    (member) => isCurrent(member) && member.userId === candidate.id && member.role === role,
  );
  if (already) return batch;
  const members = batch.members.map((member) =>
    role === 'program_manager' && isCurrent(member) && member.role === 'program_manager'
      ? endAssignment(member, by, now)
      : member,
  );
  const added: BatchMember = {
    id: memberId,
    userId: candidate.id,
    role,
    assignedBy: by,
    assignedAt: now,
    unassignedAt: null,
    unassignedBy: null,
  };
  return { ...batch, members: [...members, added], updatedAt: now };
};

export type UnassignMemberInput = Readonly<{
  userId: UserId;
  role: BatchMemberRole;
  by: UserId;
  now: Date;
}>;

/**
 * Ends a current assignment (the row stays as history); a no-op if there is none. The PM can't
 * be unassigned on their own: assign a new one, which replaces them.
 */
export const unassignMember = (
  batch: Batch,
  { userId, role, by, now }: UnassignMemberInput,
): Batch => {
  ensureEditable(batch);
  const target = batch.members.find(
    (member) => isCurrent(member) && member.userId === userId && member.role === role,
  );
  if (!target) return batch;
  if (role === 'program_manager') {
    throw conflict(
      'A batch needs a programme manager; assign a new one instead',
      'batch_requires_pm',
    );
  }
  const members = batch.members.map((member) =>
    member === target ? endAssignment(member, by, now) : member,
  );
  return { ...batch, members, updatedAt: now };
};

/** Members are kept as they were, so the history shows who was on the batch when it ended. */
export const archiveBatch = (batch: Batch, { now }: Readonly<{ now: Date }>): Batch =>
  batch.isArchived ? batch : { ...batch, isArchived: true, updatedAt: now };
