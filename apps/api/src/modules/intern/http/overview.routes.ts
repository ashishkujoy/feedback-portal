import { BatchOverview } from '@feedback-portal/contracts';
import { Hono } from 'hono';
import { z } from 'zod';
import { validate } from '../../../shared/http/validate.ts';
import { BatchId } from '../../cohort/domain/batch-id.ts';
import { hasRole } from '../../identity/domain/user.ts';
import type { AuthEnv } from '../../identity/http/auth-env.ts';
import { type AuthenticateDeps, authenticate } from '../../identity/http/authenticate.ts';
import type { BatchOverviewView } from '../application/batch-overview.ts';
import { batchOverview, type ManageInternsDeps } from '../application/manage-interns.ts';
import type { PhotoUrl } from './intern-views.ts';

export type OverviewRoutesDeps = AuthenticateDeps & Readonly<{ manageInterns: ManageInternsDeps }>;

const BatchParams = z.object({ batchId: BatchId });

const toBatchOverview = (view: BatchOverviewView, photoUrl: PhotoUrl): BatchOverview => {
  const internOf = ({
    photoPublicId,
    ...intern
  }: BatchOverviewView['toDeliver'][number]['intern']) => ({
    ...intern,
    photoUrl: photoUrl(photoPublicId),
  });
  return BatchOverview.parse({
    ...view,
    onNotice: view.onNotice.map((row) => ({ ...row, intern: internOf(row.intern) })),
    toDeliver: view.toDeliver.map((row) => ({
      ...row,
      intern: internOf(row.intern),
      submittedAt: row.submittedAt.toISOString(),
    })),
  });
};

/**
 * v2 A24's batch overview (11.1), mounted at `/batches/:batchId/overview`: anyone who can see the
 * batch reads it (decision 5); a batch they can't see is a 404.
 */
export const overviewRoutes = ({ manageInterns, ...auth }: OverviewRoutesDeps) => {
  const { photos } = manageInterns;
  const photoUrl: PhotoUrl = (publicId) =>
    publicId !== null && photos ? photos.urlFor(publicId) : null;
  return new Hono<AuthEnv>()
    .use(authenticate(auth))
    .get('/', validate('param', BatchParams), async (c) => {
      const user = c.var.currentUser;
      const view = await batchOverview(manageInterns, {
        actor: { id: user.id, isAdmin: hasRole(user, 'admin') },
        batchId: c.req.valid('param').batchId,
      });
      return c.json(toBatchOverview(view, photoUrl));
    });
};
