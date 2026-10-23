import { AssignUserRequest, CreateBatchRequest } from '@feedback-portal/contracts';
import { getLogger } from '@logtape/logtape';
import { type Context, Hono } from 'hono';
import { z } from 'zod';
import { validate } from '../../../shared/http/validate.ts';
import { rootCategory } from '../../../shared/logging/logging.ts';
import { hasRole } from '../../identity/domain/user.ts';
import { UserId } from '../../identity/domain/user-id.ts';
import type { AuthEnv } from '../../identity/http/auth-env.ts';
import { type AuthenticateDeps, authenticate } from '../../identity/http/authenticate.ts';
import { requireRole } from '../../identity/http/require-role.ts';
import {
  type Actor,
  archiveBatch,
  assignMentor,
  createBatch,
  getBatch,
  listBatches,
  type ManageBatchesDeps,
  setProgramManager,
  unassignMentor,
} from '../application/manage-batches.ts';
import { BatchId } from '../domain/batch-id.ts';
import { toBatchDetail, toBatchSummary } from './batch-views.ts';

export type BatchesRoutesDeps = AuthenticateDeps & Readonly<{ manageBatches: ManageBatchesDeps }>;

const BatchParams = z.object({ id: BatchId });
const MentorParams = z.object({ id: BatchId, userId: UserId });
const AssignBody = AssignUserRequest.extend({ userId: UserId });
const CreateBody = CreateBatchRequest.safeExtend({ programManagerId: UserId });

const logger = getLogger([rootCategory, 'batches']);

const actorOf = (c: Context<AuthEnv>): Actor => {
  const user = c.var.currentUser;
  return { id: user.id, isAdmin: hasRole(user, 'admin') };
};

/**
 * Batches and their membership. Admins can do everything; a batch's current PM can change its
 * mentors (checked by the use case). Reads are admin-only until the visibility scope (6.4).
 * Changes are idempotent. Logs carry ids, never names.
 */
export const batchesRoutes = ({ manageBatches, ...auth }: BatchesRoutesDeps) => {
  const admin = requireRole('admin');
  const adminOrPm = requireRole('admin', 'program_manager');

  return new Hono<AuthEnv>()
    .use(authenticate(auth))
    .get('/', admin, async (c) => c.json((await listBatches(manageBatches)).map(toBatchSummary)))
    .post('/', admin, validate('json', CreateBody), async (c) => {
      const actor = actorOf(c);
      const batch = await createBatch(manageBatches, { actor, ...c.req.valid('json') });
      logger.info('batch created', {
        actorId: actor.id,
        batchId: batch.id,
        programManagerId: batch.programManager.id,
      });
      c.header('Location', `/batches/${batch.id}`);
      return c.json(toBatchDetail(batch), 201);
    })
    .get('/:id', admin, validate('param', BatchParams), async (c) =>
      c.json(toBatchDetail(await getBatch(manageBatches, c.req.valid('param').id))),
    )
    .post('/:id/archive', admin, validate('param', BatchParams), async (c) => {
      const actor = actorOf(c);
      const batchId = c.req.valid('param').id;
      const batch = await archiveBatch(manageBatches, { actor, batchId });
      logger.info('batch archived', { actorId: actor.id, batchId });
      return c.json(toBatchDetail(batch));
    })
    .put(
      '/:id/program-manager',
      admin,
      validate('param', BatchParams),
      validate('json', AssignBody),
      async (c) => {
        const actor = actorOf(c);
        const batchId = c.req.valid('param').id;
        const { userId } = c.req.valid('json');
        const batch = await setProgramManager(manageBatches, { actor, batchId, userId });
        logger.info('batch programme manager set', { actorId: actor.id, batchId, userId });
        return c.json(toBatchDetail(batch));
      },
    )
    .post(
      '/:id/mentors',
      adminOrPm,
      validate('param', BatchParams),
      validate('json', AssignBody),
      async (c) => {
        const actor = actorOf(c);
        const batchId = c.req.valid('param').id;
        const { userId } = c.req.valid('json');
        const batch = await assignMentor(manageBatches, { actor, batchId, userId });
        logger.info('batch mentor assigned', { actorId: actor.id, batchId, userId });
        return c.json(toBatchDetail(batch));
      },
    )
    .delete('/:id/mentors/:userId', adminOrPm, validate('param', MentorParams), async (c) => {
      const actor = actorOf(c);
      const { id: batchId, userId } = c.req.valid('param');
      const batch = await unassignMentor(manageBatches, { actor, batchId, userId });
      logger.info('batch mentor unassigned', { actorId: actor.id, batchId, userId });
      return c.json(toBatchDetail(batch));
    });
};
