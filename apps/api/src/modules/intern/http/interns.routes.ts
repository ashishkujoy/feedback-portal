import { CreateInternRequest } from '@feedback-portal/contracts';
import { getLogger } from '@logtape/logtape';
import { type Context, Hono } from 'hono';
import { z } from 'zod';
import { validate } from '../../../shared/http/validate.ts';
import { rootCategory } from '../../../shared/logging/logging.ts';
import { BatchId } from '../../cohort/domain/batch-id.ts';
import { hasRole } from '../../identity/domain/user.ts';
import type { AuthEnv } from '../../identity/http/auth-env.ts';
import { type AuthenticateDeps, authenticate } from '../../identity/http/authenticate.ts';
import { requireRole } from '../../identity/http/require-role.ts';
import { type Actor, addIntern, type ManageInternsDeps } from '../application/manage-interns.ts';
import { toInternSummary } from './intern-views.ts';

export type InternsRoutesDeps = AuthenticateDeps & Readonly<{ manageInterns: ManageInternsDeps }>;

const BatchParams = z.object({ batchId: BatchId });

const logger = getLogger([rootCategory, 'interns']);

const actorOf = (c: Context<AuthEnv>): Actor => {
  const user = c.var.currentUser;
  return { id: user.id, isAdmin: hasRole(user, 'admin') };
};

/**
 * A batch's interns, mounted at `/batches/:batchId/interns`. Admins and the batch's current PM
 * add interns (checked by the use case); a batch the user can't see is a 404. Logs carry ids,
 * never names.
 */
export const internsRoutes = ({ manageInterns, ...auth }: InternsRoutesDeps) =>
  new Hono<AuthEnv>()
    .use(authenticate(auth))
    .post(
      '/',
      requireRole('admin', 'program_manager'),
      validate('param', BatchParams),
      validate('json', CreateInternRequest),
      async (c) => {
        const actor = actorOf(c);
        const { batchId } = c.req.valid('param');
        const intern = await addIntern(manageInterns, {
          actor,
          batchId,
          details: c.req.valid('json'),
        });
        logger.info('intern added', { actorId: actor.id, batchId, internId: intern.id });
        c.header('Location', `/batches/${batchId}/interns/${intern.id}`);
        return c.json(toInternSummary(intern), 201);
      },
    );
