import {
  FeedbackBodyRequest,
  FeedbackContentRequest,
  FeedbackView,
} from '@feedback-portal/contracts';
import { getLogger } from '@logtape/logtape';
import { type Context, Hono } from 'hono';
import { z } from 'zod';
import { validate } from '../../../shared/http/validate.ts';
import { rootCategory } from '../../../shared/logging/logging.ts';
import { BatchId } from '../../cohort/domain/batch-id.ts';
import { hasRole } from '../../identity/domain/user.ts';
import type { AuthEnv } from '../../identity/http/auth-env.ts';
import { type AuthenticateDeps, authenticate } from '../../identity/http/authenticate.ts';
import { InternId } from '../../intern/domain/intern-id.ts';
import type { FeedbackEntryView } from '../application/feedback-queries.ts';
import {
  type Actor,
  createFeedback,
  discardFeedback,
  editSubmittedFeedback,
  listFeedback,
  type ManageFeedbackDeps,
  updateDraft,
} from '../application/manage-feedback.ts';
import { FeedbackId } from '../domain/feedback-id.ts';

export type FeedbackRoutesDeps = AuthenticateDeps &
  Readonly<{ manageFeedback: ManageFeedbackDeps }>;

const InternParams = z.object({ batchId: BatchId, internId: InternId });
const EntryParams = InternParams.extend({ feedbackId: FeedbackId });

const logger = getLogger([rootCategory, 'feedback']);

const actorOf = (c: Context<AuthEnv>): Actor => {
  const user = c.var.currentUser;
  return { id: user.id, isAdmin: hasRole(user, 'admin') };
};

/** Times go out as UTC ISO strings; the browser shows them in the viewer's zone (9.3). */
const toFeedbackView = (entry: FeedbackEntryView): FeedbackView =>
  FeedbackView.parse({
    ...entry,
    submittedAt: entry.submittedAt?.toISOString() ?? null,
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
  });

/**
 * An intern's feedback, mounted at `/batches/:batchId/interns/:internId/feedback`. Anyone who can
 * see the batch reads submitted and delivered feedback and their own drafts; its current mentors
 * and PM write (checked by the use cases). Logs carry ids, never the text.
 */
export const feedbackRoutes = ({ manageFeedback, ...auth }: FeedbackRoutesDeps) =>
  new Hono<AuthEnv>()
    .use(authenticate(auth))
    .get('/', validate('param', InternParams), async (c) => {
      const entries = await listFeedback(manageFeedback, {
        actor: actorOf(c),
        ...c.req.valid('param'),
      });
      return c.json(entries.map(toFeedbackView));
    })
    .post(
      '/',
      validate('param', InternParams),
      validate('json', FeedbackContentRequest),
      async (c) => {
        const actor = actorOf(c);
        const params = c.req.valid('param');
        const { submit = false, ...content } = c.req.valid('json');
        const entry = await createFeedback(manageFeedback, { actor, ...params, content, submit });
        logger.info('feedback created', {
          actorId: actor.id,
          internId: params.internId,
          feedbackId: entry.id,
          state: entry.state,
        });
        c.header(
          'Location',
          `/batches/${params.batchId}/interns/${params.internId}/feedback/${entry.id}`,
        );
        return c.json(toFeedbackView(entry), 201);
      },
    )
    .put(
      '/:feedbackId',
      validate('param', EntryParams),
      validate('json', FeedbackContentRequest),
      async (c) => {
        const actor = actorOf(c);
        const params = c.req.valid('param');
        const { submit = false, ...content } = c.req.valid('json');
        const entry = await updateDraft(manageFeedback, { actor, ...params, content, submit });
        logger.info('feedback draft updated', {
          actorId: actor.id,
          feedbackId: entry.id,
          state: entry.state,
        });
        return c.json(toFeedbackView(entry));
      },
    )
    .patch(
      '/:feedbackId',
      validate('param', EntryParams),
      validate('json', FeedbackBodyRequest),
      async (c) => {
        const actor = actorOf(c);
        const entry = await editSubmittedFeedback(manageFeedback, {
          actor,
          ...c.req.valid('param'),
          body: c.req.valid('json').body,
        });
        logger.info('feedback text edited', { actorId: actor.id, feedbackId: entry.id });
        return c.json(toFeedbackView(entry));
      },
    )
    .delete('/:feedbackId', validate('param', EntryParams), async (c) => {
      const actor = actorOf(c);
      const params = c.req.valid('param');
      await discardFeedback(manageFeedback, { actor, ...params });
      logger.info('feedback draft discarded', { actorId: actor.id, feedbackId: params.feedbackId });
      return c.body(null, 204);
    });
