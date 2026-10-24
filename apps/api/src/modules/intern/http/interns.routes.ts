import {
  ChangeStatusRequest,
  CreateInternRequest,
  PhotoUploadTicket,
  SetPhotoRequest,
  UpdateInternDetailsRequest,
} from '@feedback-portal/contracts';
import { getLogger } from '@logtape/logtape';
import { type Context, Hono } from 'hono';
import { z } from 'zod';
import { validate } from '../../../shared/http/validate.ts';
import { rootCategory } from '../../../shared/logging/logging.ts';
import { BatchId } from '../../cohort/domain/batch-id.ts';
import { InternId } from '../domain/intern-id.ts';
import { hasRole } from '../../identity/domain/user.ts';
import type { AuthEnv } from '../../identity/http/auth-env.ts';
import { type AuthenticateDeps, authenticate } from '../../identity/http/authenticate.ts';
import { requireRole } from '../../identity/http/require-role.ts';
import {
  type Actor,
  addIntern,
  changeStatus,
  getIntern,
  listInterns,
  type ManageInternsDeps,
  photoUploadTicket,
  setInternPhoto,
  updateInternDetails,
} from '../application/manage-interns.ts';
import { type PhotoUrl, toInternDetail, toInternSummary } from './intern-views.ts';

export type InternsRoutesDeps = AuthenticateDeps & Readonly<{ manageInterns: ManageInternsDeps }>;

const BatchParams = z.object({ batchId: BatchId });
const InternParams = BatchParams.extend({ internId: InternId });

const logger = getLogger([rootCategory, 'interns']);

const actorOf = (c: Context<AuthEnv>): Actor => {
  const user = c.var.currentUser;
  return { id: user.id, isAdmin: hasRole(user, 'admin') };
};

/**
 * A batch's interns, mounted at `/batches/:batchId/interns`. Anyone who can see the batch reads
 * its roster and each intern's profile; admins and the batch's current PM add interns, and only
 * that PM changes a status (both checked by the use case). A batch
 * the user can't see is a 404. Logs carry ids, never names.
 */
export const internsRoutes = ({ manageInterns, ...auth }: InternsRoutesDeps) => {
  const { photos } = manageInterns;
  const photoUrl: PhotoUrl = (publicId) =>
    publicId !== null && photos ? photos.urlFor(publicId) : null;
  const managers = requireRole('admin', 'program_manager');

  return new Hono<AuthEnv>()
    .use(authenticate(auth))
    .get('/', validate('param', BatchParams), async (c) => {
      const interns = await listInterns(manageInterns, {
        actor: actorOf(c),
        batchId: c.req.valid('param').batchId,
      });
      return c.json(interns.map((intern) => toInternSummary(intern, photoUrl)));
    })
    .get('/:internId', validate('param', InternParams), async (c) => {
      const { batchId, internId } = c.req.valid('param');
      const intern = await getIntern(manageInterns, { actor: actorOf(c), batchId, internId });
      return c.json(toInternDetail(intern, photoUrl));
    })
    .put(
      '/:internId/details',
      managers,
      validate('param', InternParams),
      validate('json', UpdateInternDetailsRequest),
      async (c) => {
        const actor = actorOf(c);
        const { batchId, internId } = c.req.valid('param');
        const intern = await updateInternDetails(manageInterns, {
          actor,
          batchId,
          internId,
          details: c.req.valid('json'),
        });
        logger.info('intern details updated', { actorId: actor.id, batchId, internId });
        return c.json(toInternDetail(intern, photoUrl));
      },
    )
    .post('/:internId/photo-upload', managers, validate('param', InternParams), async (c) => {
      const { batchId, internId } = c.req.valid('param');
      const ticket = await photoUploadTicket(manageInterns, {
        actor: actorOf(c),
        batchId,
        internId,
      });
      return c.json(PhotoUploadTicket.parse(ticket));
    })
    .put(
      '/:internId/photo',
      managers,
      validate('param', InternParams),
      validate('json', SetPhotoRequest),
      async (c) => {
        const actor = actorOf(c);
        const { batchId, internId } = c.req.valid('param');
        const { bytes, ...upload } = c.req.valid('json');
        const { intern, previousRemovalFailed } = await setInternPhoto(manageInterns, {
          actor,
          batchId,
          internId,
          upload,
          bytes,
        });
        logger.info('intern photo set', { actorId: actor.id, batchId, internId });
        if (previousRemovalFailed) {
          logger.warning('replaced intern photo could not be deleted', { batchId, internId });
        }
        return c.json(toInternDetail(intern, photoUrl));
      },
    )
    .post(
      '/:internId/status-changes',
      requireRole('program_manager'),
      validate('param', InternParams),
      validate('json', ChangeStatusRequest),
      async (c) => {
        const actor = actorOf(c);
        const { batchId, internId } = c.req.valid('param');
        const { action, reason } = c.req.valid('json');
        const intern = await changeStatus(manageInterns, {
          actor,
          batchId,
          internId,
          action,
          reason,
        });
        // The reason can hold personal detail, so only ids and the action are logged.
        logger.info('intern status changed', { actorId: actor.id, batchId, internId, action });
        return c.json(toInternDetail(intern, photoUrl));
      },
    )
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
        return c.json(toInternSummary(intern, photoUrl), 201);
      },
    );
};
