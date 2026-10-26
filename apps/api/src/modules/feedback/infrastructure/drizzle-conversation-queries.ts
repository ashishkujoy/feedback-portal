import { desc, eq } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { DbExecutor } from '../../../shared/db/client.ts';
import { users } from '../../identity/infrastructure/schema.ts';
import type {
  ConversationEntryView,
  ConversationQueries,
} from '../application/conversation-queries.ts';
import { conversations, feedback } from './schema.ts';

const recorder = alias(users, 'recorder');
const author = alias(users, 'author');

const columns = {
  id: conversations.id,
  internId: conversations.internId,
  heldOn: conversations.heldOn,
  notes: conversations.notes,
  createdAt: conversations.createdAt,
  updatedAt: conversations.updatedAt,
  editedAt: conversations.editedAt,
  recorderId: recorder.id,
  recorderName: recorder.name,
  recorderAvatarUrl: recorder.avatarUrl,
  feedbackId: feedback.id,
  feedbackSubmittedAt: feedback.submittedAt,
  authorId: author.id,
  authorName: author.name,
  authorAvatarUrl: author.avatarUrl,
};

type Row = Readonly<{
  id: string;
  internId: string;
  heldOn: string;
  notes: string;
  createdAt: Date;
  updatedAt: Date;
  editedAt: Date | null;
  recorderId: string;
  recorderName: string;
  recorderAvatarUrl: string | null;
  feedbackId: string;
  feedbackSubmittedAt: Date | null;
  authorId: string;
  authorName: string;
  authorAvatarUrl: string | null;
}>;

const toView = (row: Row): ConversationEntryView => {
  // Delivered feedback was always submitted first (the feedback table's check).
  if (!row.feedbackSubmittedAt) throw new Error(`feedback ${row.feedbackId} has no submission`);
  return {
    id: row.id,
    internId: row.internId,
    recordedBy: { id: row.recorderId, name: row.recorderName, avatarUrl: row.recorderAvatarUrl },
    heldOn: row.heldOn,
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    editedAt: row.editedAt,
    feedback: {
      id: row.feedbackId,
      author: { id: row.authorId, name: row.authorName, avatarUrl: row.authorAvatarUrl },
      submittedAt: row.feedbackSubmittedAt,
    },
  };
};

export const createConversationQueries = (db: DbExecutor): ConversationQueries => {
  const select = () =>
    db
      .select(columns)
      .from(conversations)
      .innerJoin(recorder, eq(recorder.id, conversations.recordedBy))
      .innerJoin(feedback, eq(feedback.conversationId, conversations.id))
      .innerJoin(author, eq(author.id, feedback.authorId));

  return {
    listForIntern: async (internId) => {
      const rows = await select()
        .where(eq(conversations.internId, internId))
        .orderBy(desc(conversations.heldOn), desc(conversations.createdAt), desc(conversations.id));
      return rows.map(toView);
    },

    view: async (id) => {
      const [row] = await select().where(eq(conversations.id, id));
      return row ? toView(row) : null;
    },
  };
};
