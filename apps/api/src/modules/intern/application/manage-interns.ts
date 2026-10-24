import { conflict, forbidden, notFound } from '../../../shared/errors/app-error.ts';
import type { Viewer } from '../../cohort/application/batch-scope.ts';
import type { BatchId } from '../../cohort/domain/batch-id.ts';
import { type DetailsInput, type Intern, onboardIntern } from '../domain/intern.ts';
import { newInternId } from '../domain/intern-id.ts';
import { newStatusEventId } from '../domain/status-event-id.ts';
import type { InternAdminScope, InternAdminTransaction } from './intern-admin.ts';
import type { InternSummaryView } from './intern-queries.ts';

export type ManageInternsDeps = Readonly<{
  transaction: InternAdminTransaction;
  now: () => Date;
}>;

/** Who is acting. */
export type Actor = Viewer;

const ensureCanSee = async ({ batchAccess }: InternAdminScope, actor: Actor, batchId: BatchId) => {
  const access = await batchAccess(actor, batchId);
  if (!access) throw notFound('Batch not found');
  return access;
};

/**
 * A batch the actor can't see is a 404 (as if it didn't exist); one they can see but don't run
 * is a 403. Admins, and the batch's current PM, manage its interns while it isn't archived.
 */
const ensureCanManage = async (
  scope: InternAdminScope,
  actor: Actor,
  batchId: BatchId,
): Promise<void> => {
  const access = await ensureCanSee(scope, actor, batchId);
  if (!access.canManage) {
    throw forbidden("Only an admin or this batch's programme manager can manage its interns");
  }
  if (access.isArchived) throw conflict('This batch is archived', 'batch_archived');
};

/** Adds an intern by hand (when they aren't in Airtable): Active, with the onboarding event. */
export const addIntern = (
  { transaction, now }: ManageInternsDeps,
  { actor, batchId, details }: Readonly<{ actor: Actor; batchId: BatchId; details: DetailsInput }>,
): Promise<Intern> =>
  transaction(async (scope) => {
    await ensureCanManage(scope, actor, batchId);
    const intern = onboardIntern({
      id: newInternId(),
      eventId: newStatusEventId(),
      batchId,
      details,
      actor: actor.id,
      now: now(),
    });
    await scope.interns.save(intern);
    return intern;
  });

/** The roster: anyone who can see the batch, archived or not; otherwise a 404. */
export const listInterns = (
  { transaction }: ManageInternsDeps,
  { actor, batchId }: Readonly<{ actor: Actor; batchId: BatchId }>,
): Promise<readonly InternSummaryView[]> =>
  transaction(async (scope) => {
    await ensureCanSee(scope, actor, batchId);
    return scope.queries.listForBatch(batchId);
  });
