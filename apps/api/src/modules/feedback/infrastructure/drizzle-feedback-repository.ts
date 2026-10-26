import { and, desc, eq, isNotNull, ne } from 'drizzle-orm';
import type { DbExecutor } from '../../../shared/db/client.ts';
import { UserId } from '../../identity/domain/user-id.ts';
import { InternId } from '../../intern/domain/intern-id.ts';
import { createInternRepository } from '../../intern/infrastructure/drizzle-intern-repository.ts';
import type { FeedbackRepository } from '../application/feedback-repository.ts';
import type { Feedback } from '../domain/feedback.ts';
import { FeedbackId } from '../domain/feedback-id.ts';
import { feedback as feedbackTable } from './schema.ts';

type FeedbackRow = typeof feedbackTable.$inferSelect;

// Parsing (rather than casting) gives loaded values their brands.
const toFeedback = (row: FeedbackRow): Feedback => ({
  id: FeedbackId.parse(row.id),
  internId: InternId.parse(row.internId),
  authorId: UserId.parse(row.authorId),
  period: row.period,
  body: row.body,
  colorCode: row.colorCode,
  givesNotice: row.givesNotice,
  state: row.state,
  conversationId: row.conversationId,
  submittedAt: row.submittedAt,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
  editedAt: row.editedAt,
});

export const createFeedbackRepository = (db: DbExecutor): FeedbackRepository => ({
  findById: async (id) => {
    const [row] = await db.select().from(feedbackTable).where(eq(feedbackTable.id, id));
    return row ? toFeedback(row) : null;
  },

  findByIdForUpdate: async (id) => {
    const [row] = await db
      .select()
      .from(feedbackTable)
      .where(eq(feedbackTable.id, id))
      .for('update');
    return row ? toFeedback(row) : null;
  },

  // A savepoint when `db` is already a transaction. The feedback goes first: a notice's status
  // event refers to it.
  save: (feedback, intern) =>
    db.transaction(async (tx) => {
      const { id, internId, authorId, createdAt, ...changeable } = feedback;
      await tx
        .insert(feedbackTable)
        .values({ id, internId, authorId, createdAt, ...changeable })
        .onConflictDoUpdate({ target: feedbackTable.id, set: changeable });
      if (intern) await createInternRepository(tx).save(intern);
    }),

  newestColour: async (internId) => {
    const [row] = await db
      .select({ colorCode: feedbackTable.colorCode })
      .from(feedbackTable)
      .where(
        and(
          eq(feedbackTable.internId, internId),
          ne(feedbackTable.state, 'draft'),
          isNotNull(feedbackTable.colorCode),
        ),
      )
      .orderBy(desc(feedbackTable.submittedAt), desc(feedbackTable.id))
      .limit(1);
    return row?.colorCode ?? null;
  },

  // The database also refuses to delete anything but a draft (9.1's trigger).
  deleteDraft: async (id) => {
    await db
      .delete(feedbackTable)
      .where(and(eq(feedbackTable.id, id), eq(feedbackTable.state, 'draft')));
  },
});
