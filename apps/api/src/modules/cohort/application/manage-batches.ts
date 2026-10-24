import { forbidden, notFound } from '../../../shared/errors/app-error.ts';
import type { UserId } from '../../identity/domain/user-id.ts';
import {
  archiveBatch as archive,
  assignMember,
  type Batch,
  createBatch as create,
  currentProgramManager,
  setMentors as setMentorSet,
  unassignMember,
} from '../domain/batch.ts';
import { type BatchId, newBatchId } from '../domain/batch-id.ts';
import { newBatchMemberId } from '../domain/batch-member-id.ts';
import type { Candidate } from '../domain/candidate.ts';
import type { BatchAdminScope, BatchAdminTransaction } from './batch-admin.ts';
import type {
  BatchDetailView,
  BatchQueries,
  BatchSummaryView,
  MentorCandidateView,
} from './batch-queries.ts';
import type { Viewer } from './batch-scope.ts';

export type ManageBatchesDeps = Readonly<{
  transaction: BatchAdminTransaction;
  queries: BatchQueries;
  now: () => Date;
}>;

/** Who is acting. Routes let admins do everything; others only reach reads and the mentor cases. */
export type Actor = Viewer;

const loadBatch = async ({ batches }: BatchAdminScope, id: BatchId): Promise<Batch> => {
  const batch = await batches.findById(id);
  if (!batch) throw notFound('Batch not found');
  return batch;
};

const loadCandidate = async ({ candidates }: BatchAdminScope, id: UserId): Promise<Candidate> => {
  const candidate = await candidates(id);
  if (!candidate) throw notFound('User not found');
  return candidate;
};

/** Saves `next` if it changed, then reads the batch back with names for the response. */
const commit = async (scope: BatchAdminScope, actor: Actor, batch: Batch, next: Batch) => {
  if (next !== batch) await scope.batches.save(next);
  const detail = await scope.queries.detail(next.id, actor);
  if (!detail) throw new Error(`batch ${next.id} vanished inside its transaction`);
  return detail;
};

/**
 * For the mentor routes: a batch the actor can't see is a 404 (as if it didn't exist); one they
 * can see but don't run is a 403. Admins, and the batch's current PM, may change its mentors.
 */
const loadForMentorChange = async (scope: BatchAdminScope, actor: Actor, id: BatchId) => {
  if (!(await scope.scope.canSee(actor, id))) throw notFound('Batch not found');
  const batch = await loadBatch(scope, id);
  if (actor.isAdmin || currentProgramManager(batch)?.userId === actor.id) return batch;
  throw forbidden("Only an admin or this batch's programme manager can change its mentors");
};

/** Only the batches `viewer` can see. */
export const listBatches = (
  { queries }: ManageBatchesDeps,
  viewer: Viewer,
): Promise<readonly BatchSummaryView[]> => queries.listSummaries(viewer);

/** 404 for a batch `viewer` can't see, as for one that doesn't exist. */
export const getBatch = async (
  { queries }: ManageBatchesDeps,
  { viewer, id }: Readonly<{ viewer: Viewer; id: BatchId }>,
): Promise<BatchDetailView> => {
  const detail = await queries.detail(id, viewer);
  if (!detail) throw notFound('Batch not found');
  return detail;
};

export const createBatch = (
  { transaction, now }: ManageBatchesDeps,
  {
    actor,
    name,
    startDate,
    endDate,
    programManagerId,
  }: Readonly<{
    actor: Actor;
    name: string;
    startDate: string;
    endDate: string;
    programManagerId: UserId;
  }>,
): Promise<BatchDetailView> =>
  transaction(async (scope) => {
    const batch = create({
      id: newBatchId(),
      name,
      startDate,
      endDate,
      programManager: await loadCandidate(scope, programManagerId),
      memberId: newBatchMemberId(),
      createdBy: actor.id,
      now: now(),
    });
    await scope.batches.save(batch);
    return commit(scope, actor, batch, batch);
  });

type BatchChange = Readonly<{ actor: Actor; batchId: BatchId }>;
type UserChange = BatchChange & Readonly<{ userId: UserId }>;

export const archiveBatch = (
  { transaction, now }: ManageBatchesDeps,
  { actor, batchId }: BatchChange,
): Promise<BatchDetailView> =>
  transaction(async (scope) => {
    const batch = await loadBatch(scope, batchId);
    return commit(scope, actor, batch, archive(batch, { now: now() }));
  });

/** Replaces the current PM (6.2): their assignment ends and the new one starts. */
export const setProgramManager = (
  { transaction, now }: ManageBatchesDeps,
  { actor, batchId, userId }: UserChange,
): Promise<BatchDetailView> =>
  transaction(async (scope) => {
    const batch = await loadBatch(scope, batchId);
    const candidate = await loadCandidate(scope, userId);
    const next = assignMember(batch, {
      candidate,
      role: 'program_manager',
      memberId: newBatchMemberId(),
      by: actor.id,
      now: now(),
    });
    return commit(scope, actor, batch, next);
  });

export const assignMentor = (
  { transaction, now }: ManageBatchesDeps,
  { actor, batchId, userId }: UserChange,
): Promise<BatchDetailView> =>
  transaction(async (scope) => {
    const batch = await loadForMentorChange(scope, actor, batchId);
    const candidate = await loadCandidate(scope, userId);
    const next = assignMember(batch, {
      candidate,
      role: 'mentor',
      memberId: newBatchMemberId(),
      by: actor.id,
      now: now(),
    });
    return commit(scope, actor, batch, next);
  });

/** A no-op for someone who isn't a current mentor; the row stays as history. */
export const unassignMentor = (
  { transaction, now }: ManageBatchesDeps,
  { actor, batchId, userId }: UserChange,
): Promise<BatchDetailView> =>
  transaction(async (scope) => {
    const batch = await loadForMentorChange(scope, actor, batchId);
    return commit(
      scope,
      actor,
      batch,
      unassignMember(batch, { userId, role: 'mentor', by: actor.id, now: now() }),
    );
  });

/** Makes `userIds` the batch's complete set of current mentors, all or nothing. */
export const setMentors = (
  { transaction, now }: ManageBatchesDeps,
  { actor, batchId, userIds }: BatchChange & Readonly<{ userIds: readonly UserId[] }>,
): Promise<BatchDetailView> =>
  transaction(async (scope) => {
    const batch = await loadForMentorChange(scope, actor, batchId);
    const candidates = await Promise.all(userIds.map((id) => loadCandidate(scope, id)));
    const next = setMentorSet(batch, {
      candidates,
      newMemberId: newBatchMemberId,
      by: actor.id,
      now: now(),
    });
    return commit(scope, actor, batch, next);
  });

/** Who Assign mentors lists, for the batch's managers (the same access as changing mentors). */
export const mentorCandidates = (
  { transaction }: ManageBatchesDeps,
  { actor, batchId }: BatchChange,
): Promise<readonly MentorCandidateView[]> =>
  transaction(async (scope) => {
    await loadForMentorChange(scope, actor, batchId);
    return scope.queries.mentorCandidates(batchId);
  });
