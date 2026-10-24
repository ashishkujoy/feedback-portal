import { and, desc, eq, ne, or, sql } from 'drizzle-orm';
import type { DbExecutor } from '../../../shared/db/client.ts';
import { users } from '../../identity/infrastructure/schema.ts';
import type { FeedbackEntryView, FeedbackQueries } from '../application/feedback-queries.ts';
import { feedback } from './schema.ts';

const columns = {
  id: feedback.id,
  internId: feedback.internId,
  period: feedback.period,
  body: feedback.body,
  colorCode: feedback.colorCode,
  previousColorCode: feedback.previousColorCode,
  givesNotice: feedback.givesNotice,
  state: feedback.state,
  conversationId: feedback.conversationId,
  submittedAt: feedback.submittedAt,
  createdAt: feedback.createdAt,
  updatedAt: feedback.updatedAt,
  authorId: users.id,
  authorName: users.name,
  authorAvatarUrl: users.avatarUrl,
};

type Row = Readonly<{ authorId: string; authorName: string; authorAvatarUrl: string | null }> &
  Omit<FeedbackEntryView, 'author'>;

const toView = ({ authorId, authorName, authorAvatarUrl, ...entry }: Row): FeedbackEntryView => ({
  ...entry,
  author: { id: authorId, name: authorName, avatarUrl: authorAvatarUrl },
});

export const createFeedbackQueries = (db: DbExecutor): FeedbackQueries => {
  const select = () =>
    db.select(columns).from(feedback).innerJoin(users, eq(users.id, feedback.authorId));

  return {
    listForIntern: async (internId, viewerId) => {
      const rows = await select()
        .where(
          and(
            eq(feedback.internId, internId),
            // Drafts are their author's alone (9.3).
            or(ne(feedback.state, 'draft'), eq(feedback.authorId, viewerId)),
          ),
        )
        .orderBy(
          desc(sql`${feedback.state} = 'draft'`),
          desc(sql`coalesce(${feedback.submittedAt}, ${feedback.updatedAt})`),
          desc(feedback.id),
        );
      return rows.map(toView);
    },

    view: async (id) => {
      const [row] = await select().where(eq(feedback.id, id));
      return row ? toView(row) : null;
    },
  };
};
