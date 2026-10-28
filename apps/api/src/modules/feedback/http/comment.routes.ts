import { CommentRequest, CommentView } from '@feedback-portal/contracts';
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
import type { CommentEntryView } from '../application/comment-queries.ts';
import {
  addComment,
  type CommentOn,
  deleteComment,
  editComment,
  listComments,
} from '../application/manage-comments.ts';
import type { Actor, ManageFeedbackDeps } from '../application/manage-feedback.ts';
import { CommentId } from '../domain/comment-id.ts';

export type CommentRoutesDeps = AuthenticateDeps & Readonly<{ manageFeedback: ManageFeedbackDeps }>;

const InternParams = z.object({ batchId: BatchId, internId: InternId });
const EntryParams = InternParams.extend({ commentId: CommentId });

const logger = getLogger([rootCategory, 'comments']);

const actorOf = (c: Context<AuthEnv>): Actor => {
  const user = c.var.currentUser;
  return { id: user.id, isAdmin: hasRole(user, 'admin') };
};

const toCommentView = (entry: CommentEntryView): CommentView =>
  CommentView.parse({
    ...entry,
    createdAt: entry.createdAt.toISOString(),
    editedAt: entry.editedAt?.toISOString() ?? null,
    deletedAt: entry.deletedAt?.toISOString() ?? null,
  });

/**
 * `POST …/feedback/:feedbackId/comments` and `POST …/conversations/:conversationId/comments`
 * (decision 3): the parent's router validates the path and the body, then hands over here.
 */
export const postComment = async (
  c: Context<AuthEnv>,
  manageFeedback: ManageFeedbackDeps,
  {
    on,
    body,
    ...params
  }: z.infer<typeof InternParams> & Readonly<{ on: CommentOn } & CommentRequest>,
) => {
  const actor = actorOf(c);
  const entry = await addComment(manageFeedback, { actor, ...params, on, body });
  logger.info('comment added', { actorId: actor.id, commentId: entry.id, parentId: on.id });
  c.header(
    'Location',
    `/batches/${params.batchId}/interns/${params.internId}/comments/${entry.id}`,
  );
  return c.json(toCommentView(entry), 201);
};

/**
 * An intern's comments (10.4), mounted at `/batches/:batchId/interns/:internId/comments`. Anyone
 * who can see the batch reads them; their authors edit and delete them (checked by the domain).
 * Logs carry ids, never the text.
 */
export const commentRoutes = ({ manageFeedback, ...auth }: CommentRoutesDeps) =>
  new Hono<AuthEnv>()
    .use(authenticate(auth))
    .get('/', validate('param', InternParams), async (c) => {
      const entries = await listComments(manageFeedback, {
        actor: actorOf(c),
        ...c.req.valid('param'),
      });
      return c.json(entries.map(toCommentView));
    })
    .patch(
      '/:commentId',
      validate('param', EntryParams),
      validate('json', CommentRequest),
      async (c) => {
        const actor = actorOf(c);
        const entry = await editComment(manageFeedback, {
          actor,
          ...c.req.valid('param'),
          ...c.req.valid('json'),
        });
        logger.info('comment edited', { actorId: actor.id, commentId: entry.id });
        return c.json(toCommentView(entry));
      },
    )
    .delete('/:commentId', validate('param', EntryParams), async (c) => {
      const actor = actorOf(c);
      const params = c.req.valid('param');
      await deleteComment(manageFeedback, { actor, ...params });
      logger.info('comment deleted', { actorId: actor.id, commentId: params.commentId });
      return c.body(null, 204);
    });
