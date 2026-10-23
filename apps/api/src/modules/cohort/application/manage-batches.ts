import { forbidden, notFound } from '../../../shared/errors/app-error.ts';
import type { UserId } from '../../identity/domain/user-id.ts';
import {
  archiveBatch as archive,
  assignMember,
  type Batch,
  createBatch as create,
  currentProgramManager,
  unassignMember,
} from '../domain/batch.ts';
import { type BatchId, newBatchId } from '../domain/batch-id.ts';
import { newBatchMemberId } from '../domain/batch-member-id.ts';
import type { Candidate } from '../domain/candidate.ts';
import type { BatchAdminScope, BatchAdminTransaction } from './batch-admin.ts';
import type { BatchDetailView, BatchQueries, BatchSummaryView } from './batch-queries.ts';

export type ManageBatchesDeps = Readonly<{
  transaction: BatchAdminTransaction;
  queries: BatchQueries;
  now: () => Date;
}>;

/** Who is making the change. Routes let admins do everything; PMs only reach the mentor cases. */
export type Actor = Readonly<{ id: UserId; isAdmin: boolean }>;

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
const commit = async (scope: BatchAdminScope, batch: Batch, next: Batch) => {
  if (next !== batch) await scope.batches.save(next);
  const detail = await scope.queries.detail(next.id);
  if (!detail) throw new Error(`batch ${next.id} vanished inside its transaction`);
  return detail;
};

/** An admin, or the batch's current PM, may change its mentors. */
const ensureCanManageMentors = (actor: Actor, batch: Batch): void => {
  if (actor.isAdmin || currentProgramManager(batch)?.userId === actor.id) return;
  throw forbidden("Only an admin or this batch's programme manager can change its mentors");
};

export const listBatches = ({ queries }: ManageBatchesDeps): Promise<readonly BatchSummaryView[]> =>
  queries.listSummaries();

export const getBatch = async (
  { queries }: ManageBatchesDeps,
  id: BatchId,
): Promise<BatchDetailView> => {
  const detail = await queries.detail(id);
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
    return commit(scope, batch, batch);
  });

type BatchChange = Readonly<{ actor: Actor; batchId: BatchId }>;
type UserChange = BatchChange & Readonly<{ userId: UserId }>;

export const archiveBatch = (
  { transaction, now }: ManageBatchesDeps,
  { batchId }: BatchChange,
): Promise<BatchDetailView> =>
  transaction(async (scope) => {
    const batch = await loadBatch(scope, batchId);
    return commit(scope, batch, archive(batch, { now: now() }));
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
    return commit(scope, batch, next);
  });

export const assignMentor = (
  { transaction, now }: ManageBatchesDeps,
  { actor, batchId, userId }: UserChange,
): Promise<BatchDetailView> =>
  transaction(async (scope) => {
    const batch = await loadBatch(scope, batchId);
    ensureCanManageMentors(actor, batch);
    const candidate = await loadCandidate(scope, userId);
    const next = assignMember(batch, {
      candidate,
      role: 'mentor',
      memberId: newBatchMemberId(),
      by: actor.id,
      now: now(),
    });
    return commit(scope, batch, next);
  });

/** A no-op for someone who isn't a current mentor; the row stays as history. */
export const unassignMentor = (
  { transaction, now }: ManageBatchesDeps,
  { actor, batchId, userId }: UserChange,
): Promise<BatchDetailView> =>
  transaction(async (scope) => {
    const batch = await loadBatch(scope, batchId);
    ensureCanManageMentors(actor, batch);
    return commit(
      scope,
      batch,
      unassignMember(batch, { userId, role: 'mentor', by: actor.id, now: now() }),
    );
  });
