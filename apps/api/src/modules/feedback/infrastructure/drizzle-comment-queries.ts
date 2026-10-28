import { asc, eq, or } from 'drizzle-orm';
import type { DbExecutor } from '../../../shared/db/client.ts';
import { users } from '../../identity/infrastructure/schema.ts';
import type { CommentEntryView, CommentQueries } from '../application/comment-queries.ts';
import { comments, conversations, feedback } from './schema.ts';

const columns = {
  id: comments.id,
  feedbackId: comments.feedbackId,
  conversationId: comments.conversationId,
  body: comments.body,
  createdAt: comments.createdAt,
  editedAt: comments.editedAt,
  deletedAt: comments.deletedAt,
  authorId: users.id,
  authorName: users.name,
  authorAvatarUrl: users.avatarUrl,
};

type Row = Readonly<{
  id: string;
  feedbackId: string | null;
  conversationId: string | null;
  body: string;
  createdAt: Date;
  editedAt: Date | null;
  deletedAt: Date | null;
  authorId: string;
  authorName: string;
  authorAvatarUrl: string | null;
}>;

const parentOf = (row: Row): CommentEntryView['parent'] => {
  if (row.feedbackId) return { kind: 'feedback', id: row.feedbackId };
  if (row.conversationId) return { kind: 'conversation', id: row.conversationId };
  throw new Error(`comment ${row.id} has no parent`);
};

const toView = (row: Row): CommentEntryView => ({
  id: row.id,
  parent: parentOf(row),
  author: { id: row.authorId, name: row.authorName, avatarUrl: row.authorAvatarUrl },
  body: row.body,
  createdAt: row.createdAt,
  editedAt: row.editedAt,
  deletedAt: row.deletedAt,
});

export const createCommentQueries = (db: DbExecutor): CommentQueries => {
  const select = () =>
    db
      .select(columns)
      .from(comments)
      .innerJoin(users, eq(users.id, comments.authorId))
      .leftJoin(feedback, eq(feedback.id, comments.feedbackId))
      .leftJoin(conversations, eq(conversations.id, comments.conversationId));

  return {
    listForIntern: async (internId) => {
      const rows = await select()
        .where(or(eq(feedback.internId, internId), eq(conversations.internId, internId)))
        .orderBy(asc(comments.createdAt), asc(comments.id));
      return rows.map(toView);
    },

    view: async (id) => {
      const [row] = await select().where(eq(comments.id, id));
      return row ? toView(row) : null;
    },
  };
};
