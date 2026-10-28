import { eq, sql } from 'drizzle-orm';
import type { DbExecutor } from '../../../shared/db/client.ts';
import { UserId } from '../../identity/domain/user-id.ts';
import { InternId } from '../../intern/domain/intern-id.ts';
import type { CommentRepository } from '../application/comment-repository.ts';
import type { Comment, CommentParent } from '../domain/comment.ts';
import { CommentId } from '../domain/comment-id.ts';
import { ConversationId } from '../domain/conversation-id.ts';
import { FeedbackId } from '../domain/feedback-id.ts';
import { comments, conversations, feedback } from './schema.ts';

type CommentRow = typeof comments.$inferSelect;

// The table's check gives every comment exactly one parent.
const parentOf = (row: CommentRow): CommentParent => {
  if (row.feedbackId) return { kind: 'feedback', id: FeedbackId.parse(row.feedbackId) };
  if (row.conversationId) {
    return { kind: 'conversation', id: ConversationId.parse(row.conversationId) };
  }
  throw new Error(`comment ${row.id} has no parent`);
};

// Parsing (rather than casting) gives loaded values their brands.
const toComment = (row: CommentRow): Comment => ({
  id: CommentId.parse(row.id),
  parent: parentOf(row),
  authorId: UserId.parse(row.authorId),
  body: row.body,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
  editedAt: row.editedAt,
  deletedAt: row.deletedAt,
});

export const createCommentRepository = (db: DbExecutor): CommentRepository => ({
  findByIdForUpdate: async (id) => {
    const [row] = await db
      .select({
        comment: comments,
        internId: sql<string>`coalesce(${feedback.internId}, ${conversations.internId})`,
      })
      .from(comments)
      .leftJoin(feedback, eq(feedback.id, comments.feedbackId))
      .leftJoin(conversations, eq(conversations.id, comments.conversationId))
      .where(eq(comments.id, id))
      // Only the comment is locked; its parent is read as it is.
      .for('update', { of: comments });
    return row ? { comment: toComment(row.comment), internId: InternId.parse(row.internId) } : null;
  },

  save: async ({ id, parent, authorId, createdAt, ...changeable }) => {
    await db
      .insert(comments)
      .values({
        id,
        feedbackId: parent.kind === 'feedback' ? parent.id : null,
        conversationId: parent.kind === 'conversation' ? parent.id : null,
        authorId,
        createdAt,
        ...changeable,
      })
      .onConflictDoUpdate({ target: comments.id, set: changeable });
  },
});
