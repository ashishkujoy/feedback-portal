import { and, desc, eq, ne, or, sql } from 'drizzle-orm';
import type { ColorCode } from '@feedback-portal/contracts';
import type { DbExecutor } from '../../../shared/db/client.ts';
import { users } from '../../identity/infrastructure/schema.ts';
import type { FeedbackEntryView, FeedbackQueries } from '../application/feedback-queries.ts';
import { conversations, feedback } from './schema.ts';

/**
 * The colour of the coloured feedback submitted just before this one (9.8 decision 1), worked
 * out when read so that edits to older feedback keep the chain right. `null` for feedback
 * without a colour, and for drafts. Written out in full: the subquery needs its own alias, and
 * the outer row's columns qualified by table.
 */
const previousColorCode = sql<ColorCode | null>`case
  when "feedback"."state" <> 'draft' and "feedback"."color_code" is not null then (
    select "earlier"."color_code" from "feedback" as "earlier"
    where "earlier"."intern_id" = "feedback"."intern_id"
      and "earlier"."state" <> 'draft'
      and "earlier"."color_code" is not null
      and ("earlier"."submitted_at", "earlier"."id") < ("feedback"."submitted_at", "feedback"."id")
    order by "earlier"."submitted_at" desc, "earlier"."id" desc
    limit 1
  )
end`;

const columns = {
  id: feedback.id,
  internId: feedback.internId,
  period: feedback.period,
  body: feedback.body,
  colorCode: feedback.colorCode,
  previousColorCode,
  givesNotice: feedback.givesNotice,
  state: feedback.state,
  conversationId: feedback.conversationId,
  submittedAt: feedback.submittedAt,
  createdAt: feedback.createdAt,
  updatedAt: feedback.updatedAt,
  editedAt: feedback.editedAt,
  deliveredOn: conversations.heldOn,
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
    db
      .select(columns)
      .from(feedback)
      .innerJoin(users, eq(users.id, feedback.authorId))
      .leftJoin(conversations, eq(conversations.id, feedback.conversationId));

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
