import {
  CommentRequest,
  ConversationContentRequest,
  ConversationView,
  RecordConversationRequest,
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
import type { ConversationEntryView } from '../application/conversation-queries.ts';
import {
  editConversation,
  listConversations,
  recordConversation,
} from '../application/manage-conversations.ts';
import type { Actor, ManageFeedbackDeps } from '../application/manage-feedback.ts';
import { ConversationId } from '../domain/conversation-id.ts';
import { FeedbackId } from '../domain/feedback-id.ts';
import { postComment } from './comment.routes.ts';

export type ConversationRoutesDeps = AuthenticateDeps &
  Readonly<{ manageFeedback: ManageFeedbackDeps }>;

const InternParams = z.object({ batchId: BatchId, internId: InternId });
const EntryParams = InternParams.extend({ conversationId: ConversationId });

const logger = getLogger([rootCategory, 'conversations']);

const actorOf = (c: Context<AuthEnv>): Actor => {
  const user = c.var.currentUser;
  return { id: user.id, isAdmin: hasRole(user, 'admin') };
};

const toConversationView = (entry: ConversationEntryView): ConversationView =>
  ConversationView.parse({
    ...entry,
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
    editedAt: entry.editedAt?.toISOString() ?? null,
    feedback: { ...entry.feedback, submittedAt: entry.feedback.submittedAt.toISOString() },
  });

/**
 * An intern's conversations (10.3), mounted at `/batches/:batchId/interns/:internId/conversations`.
 * Anyone who can see the batch reads them; its PM records and changes them (checked by the
 * domain). Logs carry ids, never the notes.
 */
export const conversationRoutes = ({ manageFeedback, ...auth }: ConversationRoutesDeps) =>
  new Hono<AuthEnv>()
    .use(authenticate(auth))
    .get('/', validate('param', InternParams), async (c) => {
      const entries = await listConversations(manageFeedback, {
        actor: actorOf(c),
        ...c.req.valid('param'),
      });
      return c.json(entries.map(toConversationView));
    })
    .post(
      '/',
      validate('param', InternParams),
      validate('json', RecordConversationRequest),
      async (c) => {
        const actor = actorOf(c);
        const params = c.req.valid('param');
        const { feedbackId, ...content } = c.req.valid('json');
        const entry = await recordConversation(manageFeedback, {
          actor,
          ...params,
          feedbackId: FeedbackId.parse(feedbackId),
          content,
        });
        logger.info('conversation recorded', {
          actorId: actor.id,
          conversationId: entry.id,
          feedbackId: entry.feedback.id,
        });
        c.header(
          'Location',
          `/batches/${params.batchId}/interns/${params.internId}/conversations/${entry.id}`,
        );
        return c.json(toConversationView(entry), 201);
      },
    )
    .patch(
      '/:conversationId',
      validate('param', EntryParams),
      validate('json', ConversationContentRequest),
      async (c) => {
        const actor = actorOf(c);
        const { conversationId, ...params } = c.req.valid('param');
        const entry = await editConversation(manageFeedback, {
          actor,
          ...params,
          conversationId,
          content: c.req.valid('json'),
        });
        logger.info('conversation edited', { actorId: actor.id, conversationId: entry.id });
        return c.json(toConversationView(entry));
      },
    )
    .post(
      '/:conversationId/comments',
      validate('param', EntryParams),
      validate('json', CommentRequest),
      async (c) => {
        const { conversationId, ...params } = c.req.valid('param');
        return postComment(c, manageFeedback, {
          ...params,
          on: { kind: 'conversation', id: conversationId },
          ...c.req.valid('json'),
        });
      },
    );
