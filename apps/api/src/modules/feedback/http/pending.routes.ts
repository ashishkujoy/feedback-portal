import { MyPending } from '@feedback-portal/contracts';
import { Hono } from 'hono';
import { hasRole } from '../../identity/domain/user.ts';
import type { AuthEnv } from '../../identity/http/auth-env.ts';
import { type AuthenticateDeps, authenticate } from '../../identity/http/authenticate.ts';
import type { PhotoStorage } from '../../intern/application/photo-storage.ts';
import type { PhotoUrl } from '../../intern/http/intern-views.ts';
import { type ManageFeedbackDeps, myPending } from '../application/manage-feedback.ts';
import type { PendingView } from '../application/pending-queries.ts';

export type PendingRoutesDeps = AuthenticateDeps &
  Readonly<{ manageFeedback: ManageFeedbackDeps; photos: PhotoStorage | null }>;

type InternRef = PendingView['drafts'][number]['intern'];

const toMyPending = (
  { month, needsFeedback, drafts, toDeliver }: PendingView & Readonly<{ month: string }>,
  photoUrl: PhotoUrl,
): MyPending => {
  const internOf = ({ photoPublicId, ...intern }: InternRef) => ({
    ...intern,
    photoUrl: photoUrl(photoPublicId),
  });
  return MyPending.parse({
    month,
    needsFeedback: needsFeedback.map((row) => ({
      intern: internOf(row.intern),
      batch: row.batch,
      colorCode: row.colorCode,
      lastFeedback: row.lastFeedback
        ? {
            submittedAt: row.lastFeedback.submittedAt.toISOString(),
            author: row.lastFeedback.author,
          }
        : null,
    })),
    drafts: drafts.map((row) => ({
      ...row,
      intern: internOf(row.intern),
      updatedAt: row.updatedAt.toISOString(),
    })),
    toDeliver: toDeliver.map((row) => ({
      ...row,
      intern: internOf(row.intern),
      submittedAt: row.submittedAt.toISOString(),
    })),
  });
};

/**
 * `GET /me/pending` (v2 M26 / P26, 11.2): the signed-in user's open work. It changes with every
 * feedback and conversation, so it's never cached.
 */
export const pendingRoutes = ({ manageFeedback, photos, ...auth }: PendingRoutesDeps) => {
  const photoUrl: PhotoUrl = (publicId) =>
    publicId !== null && photos ? photos.urlFor(publicId) : null;
  return new Hono<AuthEnv>().use(authenticate(auth)).get('/', async (c) => {
    const user = c.var.currentUser;
    const view = await myPending(manageFeedback, {
      id: user.id,
      isAdmin: hasRole(user, 'admin'),
    });
    c.header('Cache-Control', 'no-store');
    return c.json(toMyPending(view, photoUrl));
  });
};
