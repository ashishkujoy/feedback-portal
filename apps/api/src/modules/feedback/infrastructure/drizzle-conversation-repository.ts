import { eq } from 'drizzle-orm';
import type { DbExecutor } from '../../../shared/db/client.ts';
import { UserId } from '../../identity/domain/user-id.ts';
import { InternId } from '../../intern/domain/intern-id.ts';
import type { ConversationRepository } from '../application/conversation-repository.ts';
import type { Conversation } from '../domain/conversation.ts';
import { ConversationId } from '../domain/conversation-id.ts';
import { conversations } from './schema.ts';

type ConversationRow = typeof conversations.$inferSelect;

// Parsing (rather than casting) gives loaded values their brands.
const toConversation = (row: ConversationRow): Conversation => ({
  id: ConversationId.parse(row.id),
  internId: InternId.parse(row.internId),
  recordedBy: UserId.parse(row.recordedBy),
  heldOn: row.heldOn,
  notes: row.notes,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
  editedAt: row.editedAt,
});

export const createConversationRepository = (db: DbExecutor): ConversationRepository => ({
  findById: async (id) => {
    const [row] = await db.select().from(conversations).where(eq(conversations.id, id));
    return row ? toConversation(row) : null;
  },

  save: async (conversation) => {
    const { id, internId, recordedBy, createdAt, ...changeable } = conversation;
    await db
      .insert(conversations)
      .values({ id, internId, recordedBy, createdAt, ...changeable })
      .onConflictDoUpdate({ target: conversations.id, set: changeable });
  },
});
